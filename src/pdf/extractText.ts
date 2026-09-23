import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';
import type { PdfPageText, PositionedToken } from '../types/domain';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function isTextItem(value: unknown): value is { str: string; transform: number[]; width: number; height: number } {
  return Boolean(value && typeof value === 'object' && 'str' in value && 'transform' in value);
}

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfPageText[]> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  const pages: PdfPageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const tokens: PositionedToken[] = content.items.filter(isTextItem).map((item) => ({
        text: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: item.width ?? 0,
        height: item.height ?? 0,
      }));

      const text = tokens.map((token) => token.text).join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ pageNumber, width: viewport.width, height: viewport.height, text, tokens });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
