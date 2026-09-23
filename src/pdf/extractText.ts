import * as pdfjsLib from 'pdfjs-dist';
import type { PdfPageText, PositionedToken } from '../types/domain';
import { ensureLocalPdfWorker } from './pdfWorker';

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfPageText[]> {
  ensureLocalPdfWorker();
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  const pages: PdfPageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const tokens: PositionedToken[] = [];

      for (const item of content.items) {
        if (!('str' in item)) continue;
        tokens.push({
          text: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: item.width ?? 0,
          height: item.height ?? 0,
        });
      }

      const text = tokens.map((token) => token.text).join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ pageNumber, width: viewport.width, height: viewport.height, text, tokens });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
