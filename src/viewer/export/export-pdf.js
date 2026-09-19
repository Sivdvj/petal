import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { state } from "../app/state.js";
import { getHighlightsForPage, getNotesForPage } from "../app/db.js";

const MARKER_COLORS = {
  yellow: rgb(0.96, 0.85, 0.48),
  pink: rgb(0.96, 0.65, 0.76),
  mint: rgb(0.66, 0.87, 0.77),
  sky: rgb(0.66, 0.82, 0.91),
  lavender: rgb(0.79, 0.71, 0.89),
};

const INK_COLORS = {
  yellow: rgb(0.29, 0.24, 0.04),
  pink: rgb(0.36, 0.12, 0.2),
  mint: rgb(0.09, 0.25, 0.17),
  sky: rgb(0.07, 0.2, 0.29),
  lavender: rgb(0.22, 0.13, 0.38),
};

function markerColorFor(color) {
  return MARKER_COLORS[color] ?? MARKER_COLORS.yellow;
}

function inkColorFor(color) {
  return INK_COLORS[color] ?? INK_COLORS.yellow;
}

function deriveExportName(originalName) {
  const base = originalName.replace(/\.pdf$/i, "");
  return `${base}-annotated.pdf`;
}

function downloadBlob(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportAnnotatedPdf() {
  if (!state.file || !state.pdfHash) return;

  const bytes = await state.file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (let index = 0; index < pages.length; index++) {
    const pageNumber = index + 1;
    const page = pages[index];

    const highlights = await getHighlightsForPage(state.pdfHash, pageNumber);
    for (const highlight of highlights) {
      const color = markerColorFor(highlight.color);
      for (const rect of highlight.rects) {
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color,
          opacity: 0.45,
        });
      }
    }

    const notes = await getNotesForPage(state.pdfHash, pageNumber);
    for (const note of notes) {
      page.drawRectangle({
        x: note.x,
        y: note.y,
        width: note.width,
        height: note.height,
        color: markerColorFor(note.color),
        opacity: 0.95,
        borderColor: rgb(0, 0, 0),
        borderOpacity: 0.15,
        borderWidth: 0.75,
      });

      if (note.text) {
        page.drawText(note.text, {
          x: note.x + 8,
          y: note.y + note.height - 16,
          size: 10,
          lineHeight: 12,
          maxWidth: Math.max(note.width - 16, 10),
          font,
          color: inkColorFor(note.color),
        });
      }
    }
  }

  const outBytes = await pdfDoc.save();
  downloadBlob(outBytes, deriveExportName(state.file.name));
}
