import * as pdfjsLib from 'pdfjs-dist';
import { ensureLocalPdfWorker } from './pdfWorker';

export async function renderPdfPage(bytes: Uint8Array, pageNumber: number, canvas: HTMLCanvasElement): Promise<void> {
  ensureLocalPdfWorker();
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
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable.');

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0],
    }).promise;
    page.cleanup();
  } finally {
    await loadingTask.destroy();
  }
}
