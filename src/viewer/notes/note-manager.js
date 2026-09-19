import { state } from "../app/state.js";
import { clientRectToPdfRect } from "../app/coords.js";
import { getNotesForPage, putNote } from "../app/db.js";
import { createStickyNote } from "./sticky-note.js";
import { NOTE_DRAG_MIME } from "./note-tray.js";

const NOTE_WIDTH_PT = 150;
const NOTE_HEIGHT_PT = 130;
const DROP_SQUISH_MS = 260;

function getOrCreateNotesLayer(wrapper) {
  let layer = wrapper.querySelector(".notes-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "notes-layer";
    wrapper.appendChild(layer);
  }
  return layer;
}

export function initNoteDropTarget(wrapper, pageNumber, viewport) {
  wrapper.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes(NOTE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  wrapper.addEventListener("drop", async (e) => {
    if (!e.dataTransfer.types.includes(NOTE_DRAG_MIME)) return;
    e.preventDefault();

    const color = e.dataTransfer.getData(NOTE_DRAG_MIME);
    if (!color || !state.pdfHash) return;

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

    const layer = getOrCreateNotesLayer(wrapper);
    const el = createStickyNote({ note, viewport });
    el.classList.add("is-dropping");
    setTimeout(() => el.classList.remove("is-dropping"), DROP_SQUISH_MS);
    layer.appendChild(el);
    el.focus();
  });
}

export async function loadNotesForPage(wrapper, pageNumber, viewport) {
  if (!state.pdfHash) return;
  const notes = await getNotesForPage(state.pdfHash, pageNumber);
  const layer = getOrCreateNotesLayer(wrapper);
  for (const note of notes) {
    layer.appendChild(createStickyNote({ note, viewport }));
  }
}
