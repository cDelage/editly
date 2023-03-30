import editly from "editly"
import { loadImage } from "canvas"

async function myFunc({ canvas }) {
    async function onRender(progress, canvasArgs, offsetTime) {
      const context = canvas.getContext('2d');    
      await loadImage(canvasArgs.url).then((image) => {
        context.drawImage( image, 0, 0, image.width, image.height, pos.x, pos.y, newSizes.width, newSizes.height)
      })
    }

    function onClose() {
      // Cleanup if you initialized anything
    }

    return { onRender, onClose };
  }

editly({
  // fast: true,
  // outPath: './customCanvas.mp4',
  outPath: './build/test.mp4',
  width: 1280,
  height: 720,
  clips: [
    { duration: 5,
      layers: [
        { type: 'canvas',
          func: myFunc , 
          //Any parameters to fill into canvas
          canvasArgs : {
          url : '../assets/image.jpg'
          }
        }
      ] },
    { duration: 5,
      layers: [
        { type: 'canvas',
          func: myFunc , 
          //Any parameters to fill into canvas
          canvasArgs : {
          url : '../assets/image2.jpg'
          }
        }
      ] },
  ],
}).catch(console.error);