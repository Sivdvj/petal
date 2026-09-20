import { pageViewports } from "../app/render.js";
import { state } from "../app/state.js";
import { clientRectToPdfRect } from "../app/coords.js";
import { putHighlight, getHighlightsForPage } from "../app/db.js";
import { addHighlightToPage } from "./highlight-render.js";
import { getSelectionLineRects } from "./selection-rects.js";

let pageListEl = null;
let annotateMode = false;
let activeColor = "yellow";

export function initHighlights({ pageListEl: el }) {
  pageListEl = el;
  document.addEventListener("pointerup", handlePointerUp);
}

export function setAnnotateMode(enabled) {
  annotateMode = enabled;
  document.querySelectorAll(".text-layer").forEach((el) => {
    el.classList.toggle("is-annotating", enabled);
  });
  if (!enabled) window.getSelection()?.removeAllRanges();
}

export function setActiveColor(color) {
  activeColor = color;
}

// Splits a (possibly cross-page) selection Range into one clipped sub-range
// per page it touches, since pdf.js renders each page's text into its own
// isolated text-layer container.
function splitSelectionByPage(range, wrappers) {
  const touched = [];
  for (const wrapper of wrappers) {
    if (!range.intersectsNode(wrapper)) continue;

    const textLayer = wrapper.querySelector(".text-layer");
    if (!textLayer) continue;

    const subRange = range.cloneRange();
    if (!wrapper.contains(range.startContainer)) subRange.setStart(textLayer, 0);
    if (!wrapper.contains(range.endContainer)) subRange.setEnd(textLayer, textLayer.childNodes.length);

    touched.push({ wrapper, textLayer, range: subRange });
  }
  return touched;
}

async function handlePointerUp() {
  if (!annotateMode || !state.pdfHash || !pageListEl) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  const wrappers = Array.from(pageListEl.querySelectorAll(".page-wrapper"));
  const perPage = splitSelectionByPage(range, wrappers);

  for (const { wrapper, textLayer, range: pageRange } of perPage) {
    const pageNumber = Number(wrapper.dataset.pageNumber);
    const viewport = pageViewports.get(pageNumber);
    if (!viewport) continue;

    const clientRects = getSelectionLineRects(pageRange, textLayer);
    if (clientRects.length === 0) continue;

    const wrapperRect = wrapper.getBoundingClientRect();
    const rects = clientRects.map((r) => clientRectToPdfRect(r, wrapperRect, viewport));

    const highlight = {
      id: crypto.randomUUID(),
      pdfHash: state.pdfHash,
      page: pageNumber,
      color: activeColor,
      rects,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await putHighlight(highlight);
    addHighlightToPage(wrapper, highlight, viewport);
  }

  selection.removeAllRanges();
}

export async function loadHighlightsForPage(wrapper, pageNumber, viewport) {
  if (!state.pdfHash) return;
  const highlights = await getHighlightsForPage(state.pdfHash, pageNumber);
  for (const highlight of highlights) {
    addHighlightToPage(wrapper, highlight, viewport);
  }
}
