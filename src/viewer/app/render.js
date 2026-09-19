import { pdfjsLib } from "./pdf-loader.js";
import { state } from "./state.js";

// Keyed by page number, so highlight code can re-project stored PDF-unit
// rects onto whatever viewport (zoom/rotation) is currently rendered.
export const pageViewports = new Map();

// Zoom buttons can fire faster than a render pass completes. Without a guard,
// two overlapping renderAllPages() calls interleave their DOM writes (one
// call's innerHTML="" wipes the other's already-appended pages) and both
// write into the shared pageViewports map, producing duplicated/reordered
// pages and highlights/notes anchored to a stale, mismatched viewport. Each
// call gets a ticket; a call that's been superseded stops before touching
// shared state again.
let renderTicket = 0;

export async function renderAllPages(pdfDoc, { pageListEl, onPageRendered }) {
  const myTicket = ++renderTicket;

  pageListEl.innerHTML = "";
  pageViewports.clear();

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    if (myTicket !== renderTicket) return;

    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    wrapper.dataset.pageNumber = String(pageNumber);
    pageListEl.appendChild(wrapper);

    const viewport = await renderPage(pdfDoc, pageNumber, wrapper);
    if (myTicket !== renderTicket) return;

    pageViewports.set(pageNumber, viewport);
    await onPageRendered?.(wrapper, pageNumber, viewport);
  }
}

async function renderPage(pdfDoc, pageNumber, wrapper) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: state.scale });
  const outputScale = window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  wrapper.style.width = `${Math.floor(viewport.width)}px`;
  wrapper.style.height = `${Math.floor(viewport.height)}px`;
  wrapper.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
  await page.render({ canvasContext: ctx, viewport, transform }).promise;

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "text-layer";
  wrapper.appendChild(textLayerDiv);

  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textLayerDiv,
    viewport,
  });
  await textLayer.render();

  return viewport;
}
