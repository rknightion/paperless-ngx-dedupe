import { PDFDocument, StandardFonts } from 'pdf-lib';

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = FONT_SIZE * 1.4;
const MAX_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const MAX_LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);

/**
 * Generate a PDF document from plain text content.
 * Text is embedded via drawText (not rasterized), so Paperless-NGX
 * can extract it directly without OCR.
 */
export async function generatePdf(text: string, title?: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lines = wrapText(text, font);

  for (let i = 0; i < lines.length; i += MAX_LINES_PER_PAGE) {
    const pageLines = lines.slice(i, i + MAX_LINES_PER_PAGE);
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    let y = PAGE_HEIGHT - MARGIN;
    for (const line of pageLines) {
      page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font });
      y -= LINE_HEIGHT;
    }
  }

  if (title) {
    pdfDoc.setTitle(title);
  }

  return pdfDoc.save();
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>): string[] {
  const paragraphs = text.split('\n');
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      result.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, FONT_SIZE);

      if (width > MAX_WIDTH && currentLine) {
        result.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      result.push(currentLine);
    }
  }

  return result;
}
