import { state } from "../app/state.js";
import { clientRectToPdfRect } from "../app/coords.js";
import { getPageViewport, getContentViewport } from "../app/pages.js";
import { getNotesForPage, putNote } from "../app/db.js";
import { createStickyNote } from "./sticky-note.js";
import { NOTE_DRAG_MIME } from "./note-tray.js";

const NOTE_WIDTH_PT = 150;
const NOTE_HEIGHT_PT = 130;
const DROP_SQUISH_MS = 260;

// `content` is the page's .page-content element, not the .page-wrapper shell:
// the zoom preview stretches the content, so layers must live inside it.
function getOrCreateNotesLayer(content) {
  let layer = content.querySelector(".notes-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "notes-layer";
    content.appendChild(layer);
  }
  return layer;
}

// Attached once per page shell when the file opens, so it looks the viewport up
// at drop time instead of closing over one that a later zoom would outdate.
export function initNoteDropTarget(wrapper, pageNumber) {
  wrapper.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes(NOTE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  wrapper.addEventListener("drop", async (e) => {
    if (!e.dataTransfer.types.includes(NOTE_DRAG_MIME)) return;
    e.preventDefault();

    const color = e.dataTransfer.getData(NOTE_DRAG_MIME);
    const content = wrapper.querySelector(".page-content");
    if (!color || !state.pdfHash || !content) return;

    // Current zoom: it matches the wrapper's on-screen size even while the
    // content is still a stretched preview of an older scale.
    const viewport = getPageViewport(pageNumber);
    const wrapperRect = wrapper.getBoundingClientRect();
    const halfWidthPx = (NOTE_WIDTH_PT * viewport.scale) / 2;
    const halfHeightPx = (NOTE_HEIGHT_PT * viewport.scale) / 2;
    const dropRect = {
      left: e.clientX - halfWidthPx,
      top: e.clientY - halfHeightPx,
      right: e.clientX + halfWidthPx,
      bottom: e.clientY + halfHeightPx,
    };
    const pdfRect = clientRectToPdfRect(dropRect, wrapperRect, viewport);

    const note = {
      id: crypto.randomUUID(),
      pdfHash: state.pdfHash,
      page: pageNumber,
      x: pdfRect.x,
      y: pdfRect.y,
      width: pdfRect.width,
      height: pdfRect.height,
      color,
      text: "",
      minimized: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await putNote(note);

    // Looked up again: the page may have been repainted while the note was saved.
    const liveContent = wrapper.querySelector(".page-content") ?? content;
    const layer = getOrCreateNotesLayer(liveContent);
    const el = createStickyNote({ note, viewport: getContentViewport(liveContent) });
    el.classList.add("is-dropping");
    setTimeout(() => el.classList.remove("is-dropping"), DROP_SQUISH_MS);
    layer.appendChild(el);
    // Focus the editable text directly (not the note wrapper) so the user
    // can start typing immediately after dropping a note.
    el.querySelector(".sticky-note-text")?.focus();
  });
}

export async function loadNotesForPage(content, pageNumber, viewport) {
  if (!state.pdfHash) return;
  const notes = await getNotesForPage(state.pdfHash, pageNumber);
  const layer = getOrCreateNotesLayer(content);
  for (const note of notes) {
    layer.appendChild(createStickyNote({ note, viewport }));
  }
}
