import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.mjs?raw';

let localWorkerUrl: string | null = null;

export function ensureLocalPdfWorker(): void {
  if (localWorkerUrl) return;

  localWorkerUrl = URL.createObjectURL(new Blob([pdfWorkerSource], { type: 'text/javascript' }));
  pdfjsLib.GlobalWorkerOptions.workerSrc = localWorkerUrl;
}
