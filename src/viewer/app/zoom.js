import { state, setState } from "./state.js";
import { getPages, layoutPages } from "./pages.js";
import { beginZoom, previewScale, finishZoom } from "./render.js";

export const ZOOM_STEP = 1.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
// How long zoom input must pause before pages are repainted crisply.
const SETTLE_MS = 150;
// Ctrl+wheel: one mouse-wheel notch (deltaY ~100) is one ZOOM_STEP; trackpad
// pinch sends many small deltas that add up smoothly.
const WHEEL_NOTCH = 100;

let viewerMainEl = null;
let baseScale = 1;
let onZoom = null;
let settleTimer = null;

export function initZoom({ viewerMainEl: el, baseScale: base, onZoom: callback }) {
  viewerMainEl = el;
  baseScale = base;
  onZoom = callback;

  // Chrome reports trackpad pinch as ctrl+wheel; without preventDefault it
  // would zoom the whole browser page instead of the PDF.
  document.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || !state.pdfDoc) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomBy(ZOOM_STEP ** (-delta / WHEEL_NOTCH), { x: e.clientX, y: e.clientY });
    },
    { passive: false }
  );

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !state.pdfDoc) return;
    if (e.key === "=" || e.key === "+") zoomBy(ZOOM_STEP);
    else if (e.key === "-") zoomBy(1 / ZOOM_STEP);
    else if (e.key === "0") zoomTo(baseScale);
    else return;
    e.preventDefault();
  });
}

export function zoomBy(factor, clientPoint = null) {
  zoomTo(state.scale * factor, clientPoint);
}

// Zooming never re-renders synchronously. It resizes the page shells, stretches
// what is already painted, puts the scroll position back on the same spot of
// the same page, and only repaints once input has paused for SETTLE_MS.
export function zoomTo(scale, clientPoint = null) {
  const pages = getPages();
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  if (pages.length === 0 || next === state.scale) return;

  const anchor = captureAnchor(pages, clientPoint);
  setState({ scale: next });
  beginZoom();
  layoutPages();
  previewScale();
  restoreAnchor(pages, anchor);
  onZoom?.();

  clearTimeout(settleTimer);
  settleTimer = setTimeout(finishZoom, SETTLE_MS);
}

// The spot being zoomed around, remembered as a fraction of a page rather than
// as a scroll offset: the gaps between pages don't scale, so an offset ratio
// would drift, but "40% down page 20" stays true at any zoom.
function captureAnchor(pages, clientPoint) {
  const rootRect = viewerMainEl.getBoundingClientRect();
  const screenX = (clientPoint?.x ?? rootRect.left + viewerMainEl.clientWidth / 2) - rootRect.left;
  const screenY = (clientPoint?.y ?? rootRect.top + viewerMainEl.clientHeight / 2) - rootRect.top;
  const contentX = viewerMainEl.scrollLeft + screenX;
  const contentY = viewerMainEl.scrollTop + screenY;

  const index = pageIndexAt(pages, contentY);
  const wrapper = pages[index].wrapper;
  // Inside the page this is a fraction; in the gap around it, the leftover
  // pixels are kept as they are (gaps and padding do not scale).
  const fractionY = clamp01((contentY - wrapper.offsetTop) / wrapper.offsetHeight);
  const fractionX = clamp01((contentX - wrapper.offsetLeft) / wrapper.offsetWidth);
  return {
    index,
    fractionX,
    fractionY,
    restX: contentX - (wrapper.offsetLeft + fractionX * wrapper.offsetWidth),
    restY: contentY - (wrapper.offsetTop + fractionY * wrapper.offsetHeight),
    screenX,
    screenY,
  };
}

function restoreAnchor(pages, anchor) {
  const wrapper = pages[anchor.index].wrapper;
  const contentX = wrapper.offsetLeft + anchor.fractionX * wrapper.offsetWidth + anchor.restX;
  const contentY = wrapper.offsetTop + anchor.fractionY * wrapper.offsetHeight + anchor.restY;
  viewerMainEl.scrollLeft = contentX - anchor.screenX;
  viewerMainEl.scrollTop = contentY - anchor.screenY;
}

// Last page whose top is at or above contentY (pages are in vertical order).
function pageIndexAt(pages, contentY) {
  let low = 0;
  let high = pages.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (pages[mid].wrapper.offsetTop <= contentY) low = mid;
    else high = mid - 1;
  }
  return low;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
