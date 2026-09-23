import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let configured = false;

export function ensureLocalPdfWorker(): void {
  if (configured) return;
  configured = true;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}
