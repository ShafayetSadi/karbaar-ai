import { prepareInCanvas, UnsupportedPhoto } from './prepareImageCanvas';

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    self.postMessage({ blob: await prepareInCanvas(event.data) });
  } catch (error) {
    self.postMessage({ unsupported: error instanceof UnsupportedPhoto });
  }
};
