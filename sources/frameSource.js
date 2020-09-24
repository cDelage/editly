const assert = require('assert');
const pMap = require('p-map');

const { rgbaToFabricImage, createCustomCanvasFrameSource, createFabricFrameSource, createFabricCanvas, renderFabricCanvas, fabricCanvasToFabricImage } = require('./fabric');

const { customFabricFrameSource, subtitleFrameSource, titleFrameSource, newsTitleFrameSource, fillColorFrameSource, radialGradientFrameSource, linearGradientFrameSource, imageFrameSource, imageOverlayFrameSource, slideInTextFrameSource } = require('./fabric/fabricFrameSources');

const createVideoFrameSource = require('./videoFrameSource');
const { createGlFrameSource } = require('./glFrameSource');

const fabricFrameSources = {
  fabric: customFabricFrameSource,
  image: imageFrameSource,
  'image-overlay': imageOverlayFrameSource,
  title: titleFrameSource,
  subtitle: subtitleFrameSource,
  'linear-gradient': linearGradientFrameSource,
  'radial-gradient': radialGradientFrameSource,
  'fill-color': fillColorFrameSource,
  'news-title': newsTitleFrameSource,
  'slide-in-text': slideInTextFrameSource,
};

async function createFrameSource({ clip, clipIndex, width, height, channels, verbose, logTimes, ffmpegPath, ffprobePath, enableFfmpegLog, framerateStr }) {
  const { layers, duration } = clip;

  const visualLayers = layers.filter((layer) => layer.type !== 'audio');

  const layerFrameSources = await pMap(visualLayers, async (layer, layerIndex) => {
    const { type, ...params } = layer;
    if (verbose) console.log('createFrameSource', type, 'clip', clipIndex, 'layer', layerIndex);

    let createFrameSourceFunc;
    if (fabricFrameSources[type]) {
      createFrameSourceFunc = async (opts) => createFabricFrameSource(fabricFrameSources[type], opts);
    } else {
      createFrameSourceFunc = {
        video: createVideoFrameSource,
        gl: createGlFrameSource,
        canvas: createCustomCanvasFrameSource,
      }[type];
    }

    assert(createFrameSourceFunc, `Invalid type ${type}`);

    const frameSource = await createFrameSourceFunc({ ffmpegPath, ffprobePath, width, height, duration, channels, verbose, enableFfmpegLog, framerateStr, params });
    return { layer, frameSource };
  }, { concurrency: 1 });

  async function readNextFrame({ time }) {
    const clipCanvas = createFabricCanvas({ width, height });

    const layerCanvases = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const { frameSource, layer } of layerFrameSources) {
      // console.log({ visibleFrom: layer.visibleFrom, visibleUntil: layer.visibleUntil, visibleDuration: layer.visibleDuration, time });
      const offsetProgress = (time - (layer.visibleFrom)) / layer.visibleDuration;
      // console.log({ offsetProgress });
      const shouldDrawLayer = offsetProgress >= 0 && offsetProgress <= 1;

      const layerCanvas = createFabricCanvas({ width, height });
      layerCanvases.push(layerCanvas);

      if (shouldDrawLayer) {
        if (logTimes) console.time('frameSource.readNextFrame');
        const rgba = await frameSource.readNextFrame(offsetProgress, layerCanvas);
        if (logTimes) console.timeEnd('frameSource.readNextFrame');

        // Frame sources can either render to the provided canvas and return nothing
        // OR return an raw RGBA blob which will be drawn onto the canvas
        if (rgba) {
          // Optimization: Don't need to draw to canvas if there's only one layer
          if (layerFrameSources.length === 1) return rgba;

          if (logTimes) console.time('rgbaToFabricImage');
          const img = await rgbaToFabricImage({ width, height, rgba });
          if (logTimes) console.timeEnd('rgbaToFabricImage');

          layerCanvas.add(img);
        } else {
          // Assume this frame source has drawn its content to the canvas
        }
      }

      layerCanvas.renderAll();
      const layerImage = fabricCanvasToFabricImage(layerCanvas);
      clipCanvas.add(layerImage);
    }

    if (logTimes) console.time('renderFabricCanvas');
    const rgba = await renderFabricCanvas(clipCanvas);
    if (logTimes) console.timeEnd('renderFabricCanvas');

    layerCanvases.forEach((layerCanvas) => {
      layerCanvas.clear();
      layerCanvas.dispose();
    });

    return rgba;
  }

  async function close() {
    await pMap(layerFrameSources, async ({ frameSource }) => frameSource.close());
  }

  return {
    readNextFrame,
    close,
  };
}

module.exports = {
  createFrameSource,
};
