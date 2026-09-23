import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, canvas: HTMLCanvasElement): Promise<void> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const maxWidth = 900;
    const scale = Math.min(1.5, maxWidth / base.width);
    const viewport = page.getViewport({ scale });
    const deviceScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * deviceScale);
    canvas.height = Math.floor(viewport.height * deviceScale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable.');
    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
  } finally {
    await pdf.destroy();
  }
}
