import { getPageViewport, getContentViewport } from "../app/pages.js";
import { state } from "../app/state.js";
import { clientRectToPdfRect } from "../app/coords.js";
import { putHighlight, getHighlightsForPage, deleteHighlight } from "../app/db.js";
import { addHighlightToPage } from "./highlight-render.js";
import { getSelectionLineRects } from "./selection-rects.js";

let pageListEl = null;
let annotateMode = false;
let activeColor = "yellow";

const REMOVE_FADE_MS = 160;

export function initHighlights({ pageListEl: el }) {
  pageListEl = el;
  document.addEventListener("pointerup", handlePointerUp);
  pageListEl.addEventListener("mouseover", handleEraseHover);
  pageListEl.addEventListener("mouseout", clearEraseHover);
  pageListEl.addEventListener("click", handleEraseClick);
}

export function setAnnotateMode(enabled) {
  annotateMode = enabled;
  document.querySelectorAll(".text-layer").forEach((el) => {
    el.classList.toggle("is-annotating", enabled);
  });
  if (!enabled) window.getSelection()?.removeAllRanges();
}

// Text layers are rebuilt whenever a page is repainted (zoom, scrolling back to
// an evicted page), so each new one has to pick up the current mode itself.
export function syncAnnotateMode(textLayerEl) {
  textLayerEl?.classList.toggle("is-annotating", annotateMode);
}

// While erasing, highlights become clickable (see .is-erasing in highlights.css);
// the rest of the time they stay pointer-transparent so text selection works.
export function setEraseMode(enabled) {
  pageListEl?.classList.toggle("is-erasing", enabled);
  if (!enabled) clearEraseHover();
}

// A highlight is one div per line, so hover and removal act on every piece
// that shares its id.
function piecesOf(id) {
  return pageListEl.querySelectorAll(`.highlight[data-highlight-id="${id}"]`);
}

function handleEraseHover(e) {
  if (!pageListEl.classList.contains("is-erasing")) return;
  const piece = e.target.closest?.(".highlight");
  if (piece) piecesOf(piece.dataset.highlightId).forEach((el) => el.classList.add("is-erase-hover"));
}

function clearEraseHover() {
  pageListEl?.querySelectorAll(".is-erase-hover").forEach((el) => el.classList.remove("is-erase-hover"));
}

async function handleEraseClick(e) {
  if (!pageListEl.classList.contains("is-erasing")) return;
  const piece = e.target.closest?.(".highlight");
  if (!piece) return;

  const id = piece.dataset.highlightId;
  try {
    await deleteHighlight(id);
  } catch (err) {
    console.error("Failed to delete highlight", err);
    return;
  }
  const pieces = piecesOf(id);
  pieces.forEach((el) => el.classList.add("is-removing"));
  setTimeout(() => pieces.forEach((el) => el.remove()), REMOVE_FADE_MS);
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

function isInsideNote(node) {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return !!el?.closest(".sticky-note");
}

async function handlePointerUp() {
  if (!annotateMode || !state.pdfHash || !pageListEl) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  // Selecting text inside a sticky note is editing, not highlighting. Bailing
  // here also keeps removeAllRanges() below from killing the note's caret.
  if (isInsideNote(selection.anchorNode) || isInsideNote(selection.focusNode)) return;

  const range = selection.getRangeAt(0);
  const wrappers = Array.from(pageListEl.querySelectorAll(".page-wrapper"));
  const perPage = splitSelectionByPage(range, wrappers);

  for (const { wrapper, textLayer, range: pageRange } of perPage) {
    const pageNumber = Number(wrapper.dataset.pageNumber);
    const content = wrapper.querySelector(".page-content");
    // The current zoom's viewport matches the wrapper's size on screen, even
    // while the content is still a stretched preview of an older scale.
    const viewport = getPageViewport(pageNumber);
    if (!content || !viewport) continue;

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
    // Drawn in the content's own pixels: the content, not the wrapper, is what
    // the zoom preview stretches. It is looked up again because the page may
    // have been repainted while the highlight was being saved.
    const liveContent = wrapper.querySelector(".page-content") ?? content;
    addHighlightToPage(liveContent, highlight, getContentViewport(liveContent));
  }

  selection.removeAllRanges();
}

export async function loadHighlightsForPage(content, pageNumber, viewport) {
  if (!state.pdfHash) return;
  const highlights = await getHighlightsForPage(state.pdfHash, pageNumber);
  for (const highlight of highlights) {
    addHighlightToPage(content, highlight, viewport);
  }
}
