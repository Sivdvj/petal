import { pdfjsLib } from "./pdf-loader.js";
import { state } from "./state.js";
import { attachSelectionGuard } from "./text-selection.js";
import { getPages } from "./pages.js";

// Pages are painted lazily: only shells within a viewport-height of the visible
// area get content, and content far outside that is dropped so memory does not
// grow with page count. (Uncapped, one 300% page on a 2x screen would be a
// ~70 MB canvas, so canvases are also limited to MAX_CANVAS_PIXELS.)
const RENDER_MARGIN = "100% 0px";
const KEEP_PAGES_BEYOND = 2;
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

// Per page: the shell record from pages.js plus what is currently painted in it.
//   content        the .page-content element in the shell (null when not painted)
//   renderedScale  the scale that content was painted at (it is stretched by
//                  CSS while state.scale has moved on, until re-painted)
//   token          bumped to invalidate an in-flight paint of this page
//   cancel         aborts the in-flight pdf.js task, if any
//   failedScale    a scale whose paint threw, so it is not retried in a loop
let entries = [];
let nearby = new Set(); // page numbers inside the render margin
let observer = null;
let rootEl = null;
let onPageRendered = null;

let generation = 0; // bumped when the file changes: invalidates everything
let zooming = false; // true between a zoom step and its settle: no painting
let pumping = false;
let pumpAgain = false;

export function startRendering({ viewerMainEl, onPageRendered: hook }) {
  stopRendering();
  rootEl = viewerMainEl;
  onPageRendered = hook;
  entries = getPages().map((page) => ({
    page,
    content: null,
    renderedScale: null,
    token: 0,
    cancel: null,
    failedScale: null,
  }));

  observer = new IntersectionObserver(handleIntersections, { root: viewerMainEl, rootMargin: RENDER_MARGIN });
  for (const { page } of entries) observer.observe(page.wrapper);
}

export function stopRendering() {
  generation++;
  observer?.disconnect();
  observer = null;
  for (const entry of entries) cancelEntry(entry);
  entries = [];
  nearby = new Set();
  zooming = false;
}

// A zoom step: stop painting at the old scale. The caller resizes the shells,
// calls previewScale(), and later finishZoom() once the zooming has settled.
export function beginZoom() {
  zooming = true;
  for (const entry of entries) cancelEntry(entry);
}

// Stretches already-painted content to the new scale so the zoom looks
// instant; the crisp repaint follows in finishZoom().
export function previewScale() {
  for (const entry of entries) {
    if (!entry.content) continue;
    entry.content.style.transform =
      entry.renderedScale === state.scale ? "" : `scale(${state.scale / entry.renderedScale})`;
  }
}

export function finishZoom() {
  zooming = false;
  pump();
}

function handleIntersections(records) {
  for (const record of records) {
    const pageNumber = Number(record.target.dataset.pageNumber);
    const entry = entries[pageNumber - 1];
    if (!entry) continue;

    if (record.isIntersecting) {
      nearby.add(pageNumber);
    } else {
      nearby.delete(pageNumber);
      cancelEntry(entry); // scrolled away mid-paint: don't finish it
    }
  }
  pump();
}

function cancelEntry(entry) {
  entry.token++;
  entry.cancel?.();
  entry.cancel = null;
}

async function pump() {
  if (zooming || !observer) return;
  if (pumping) {
    pumpAgain = true;
    return;
  }

  pumping = true;
  const gen = generation;
  try {
    evictFarPages();
    while (gen === generation && !zooming) {
      const next = pickNextEntry();
      if (!next) break;
      await renderEntry(next, gen);
    }
  } finally {
    pumping = false;
    if (pumpAgain) {
      pumpAgain = false;
      pump();
    }
  }
}

function needsRender(entry) {
  return entry.renderedScale !== state.scale && entry.failedScale !== state.scale;
}

// Whichever unpainted nearby page is closest to the middle of the screen.
function pickNextEntry() {
  const rootRect = rootEl.getBoundingClientRect();
  const centerY = rootRect.top + rootRect.height / 2;

  let best = null;
  let bestDistance = Infinity;
  for (const pageNumber of nearby) {
    const entry = entries[pageNumber - 1];
    if (!entry || !needsRender(entry)) continue;
    const rect = entry.page.wrapper.getBoundingClientRect();
    const distance = Math.abs((rect.top + rect.bottom) / 2 - centerY);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

function evictFarPages() {
  if (nearby.size === 0) return;
  let first = Infinity;
  let last = -Infinity;
  for (const pageNumber of nearby) {
    first = Math.min(first, pageNumber);
    last = Math.max(last, pageNumber);
  }
  for (const entry of entries) {
    const pageNumber = entry.page.number;
    if (entry.content && (pageNumber < first - KEEP_PAGES_BEYOND || pageNumber > last + KEEP_PAGES_BEYOND)) {
      releaseContent(entry.content);
      entry.content = null;
      entry.renderedScale = null;
    }
  }
}

function releaseContent(content) {
  const canvas = content.querySelector("canvas");
  content.remove();
  // Shrinking the canvas frees its backing store right away instead of at GC.
  if (canvas) canvas.width = canvas.height = 0;
}

function isCancellation(err) {
  return err?.name === "RenderingCancelledException" || err?.name === "AbortException";
}

function outputScaleFor(viewport) {
  const pixelRatio = window.devicePixelRatio || 1;
  const cap = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));
  return Math.min(pixelRatio, cap);
}

// Paints one page into a detached .page-content, then swaps it in for the old
// (possibly stretched) content in one step, so there is never a blank flash.
async function renderEntry(entry, gen) {
  const token = ++entry.token;
  const isStale = () => token !== entry.token || gen !== generation;
  const scale = state.scale;
  const { pdfPage, number } = entry.page;
  const viewport = pdfPage.getViewport({ scale });

  try {
    const content = document.createElement("div");
    content.className = "page-content";
    content.dataset.pageNumber = String(number);
    content.dataset.renderScale = String(scale);
    content.style.width = `${Math.floor(viewport.width)}px`;
    content.style.height = `${Math.floor(viewport.height)}px`;
    // pdf.js sizes and positions every text span with calc(var(--scale-factor) * …).
    // Its own viewer defines the variable on the page element; without it the
    // calc() is invalid, every span falls back to the inherited 17px body font,
    // and selection/highlight boxes stop matching the glyphs they cover.
    content.style.setProperty("--scale-factor", String(scale));

    const outputScale = outputScaleFor(viewport);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    content.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
    const renderTask = pdfPage.render({ canvasContext: ctx, viewport, transform });
    entry.cancel = () => renderTask.cancel();
    await renderTask.promise;
    if (isStale()) return;

    const textLayerDiv = document.createElement("div");
    textLayerDiv.className = "text-layer";
    content.appendChild(textLayerDiv);
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: pdfPage.streamTextContent(),
      container: textLayerDiv,
      viewport,
    });
    entry.cancel = () => textLayer.cancel();
    await textLayer.render();
    if (isStale()) return;
    entry.cancel = null;

    // Annotations are read last so the swap follows right behind the read: a
    // highlight saved while this page was painting is then still included.
    await onPageRendered?.(content, number, viewport);
    if (isStale()) return;

    const old = entry.content;
    if (old) {
      const oldCanvas = old.querySelector("canvas");
      old.replaceWith(content);
      if (oldCanvas) oldCanvas.width = oldCanvas.height = 0;
    } else {
      entry.page.wrapper.appendChild(content);
    }
    entry.content = content;
    entry.renderedScale = scale;
    attachSelectionGuard(textLayerDiv);
  } catch (err) {
    if (isCancellation(err) || isStale()) return;
    console.error(`Failed to render page ${number}`, err);
    entry.failedScale = scale;
  } finally {
    if (token === entry.token) entry.cancel = null;
  }
}
