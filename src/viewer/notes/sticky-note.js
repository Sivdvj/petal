import { pdfRectToViewportRect } from "../app/coords.js";
import { putNote, deleteNote } from "../app/db.js";

const DROP_SQUISH_MS = 260;
// Pointer travel before a press on the paper counts as a drag rather than a click.
const DRAG_THRESHOLD_PX = 4;
const REMOVE_FADE_MS = 200;

const TRASH_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9h6.6L12 4"/></svg>';

// Derives a stable -3deg..3deg tilt from the note's id, so the "random"
// look stays fixed across re-renders instead of jittering on every zoom.
function rotationForId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 61) / 10 - 3;
}

function applyPosition(el, note, viewport) {
  const rect = pdfRectToViewportRect(
    { x: note.x, y: note.y, width: note.width, height: note.height },
    viewport
  );
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

function persistPositionFromPixels(el, note, viewport) {
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  const width = parseFloat(el.style.width);
  const height = parseFloat(el.style.height);

  const [x0, y0] = viewport.convertToPdfPoint(left, top);
  const [x1, y1] = viewport.convertToPdfPoint(left + width, top + height);

  note.x = Math.min(x0, x1);
  note.y = Math.min(y0, y1);
  note.width = Math.abs(x1 - x0);
  note.height = Math.abs(y1 - y0);
  note.updatedAt = Date.now();
  putNote({ ...note });
}

export function createStickyNote({ note, viewport }) {
  const el = document.createElement("div");
  el.className = `sticky-note note-paper-${note.color}`;
  el.dataset.noteId = note.id;
  el.tabIndex = 0;
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", "Sticky note");
  el.style.setProperty("--note-rotation", `${rotationForId(note.id)}deg`);
  if (note.minimized) el.classList.add("is-minimized");

  const tape = document.createElement("div");
  tape.className = "sticky-note-tape";
  el.appendChild(tape);

  const toolbar = document.createElement("div");
  toolbar.className = "sticky-note-toolbar";
  const minimizeBtn = document.createElement("button");
  minimizeBtn.type = "button";
  minimizeBtn.className = "sticky-note-minimize";
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "sticky-note-delete";
  deleteBtn.innerHTML = TRASH_ICON;
  deleteBtn.title = "Delete note";
  deleteBtn.setAttribute("aria-label", "Delete note");
  el.appendChild(toolbar);
  toolbar.append(deleteBtn, minimizeBtn);

  const textEl = document.createElement("div");
  textEl.className = "sticky-note-text";
  textEl.contentEditable = "plaintext-only";
  textEl.setAttribute("role", "textbox");
  textEl.setAttribute("aria-multiline", "true");
  textEl.setAttribute("aria-label", "Note text");
  textEl.setAttribute("data-placeholder", "Write something...");
  textEl.textContent = note.text || "";
  el.appendChild(textEl);

  function syncMinimizedUi() {
    el.classList.toggle("is-minimized", note.minimized);
    minimizeBtn.textContent = note.minimized ? "+" : "–";
    minimizeBtn.setAttribute("aria-label", note.minimized ? "Expand note" : "Minimize note");
  }
  syncMinimizedUi();

  applyPosition(el, note, viewport);

  textEl.addEventListener("input", () => {
    note.text = textEl.textContent;
    note.updatedAt = Date.now();
    putNote({ ...note });
  });
  textEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  minimizeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    note.minimized = !note.minimized;
    note.updatedAt = Date.now();
    syncMinimizedUi();
    putNote({ ...note });
  });
  minimizeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await deleteNote(note.id);
    } catch (err) {
      console.error("Failed to delete note", err);
      return;
    }
    el.classList.add("is-removing");
    setTimeout(() => el.remove(), REMOVE_FADE_MS);
  });
  deleteBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

  function focusTextAtEnd() {
    textEl.focus();
    const range = document.createRange();
    range.selectNodeContents(textEl);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Pressing the paper (not the text box or a button) would otherwise move focus
  // to the note wrapper and drop the caret; a plain click focuses the text instead.
  el.addEventListener("mousedown", (e) => {
    if (textEl.contains(e.target) || e.target.closest("button")) return;
    e.preventDefault();
  });

  let dragState = null;

  el.addEventListener("pointerdown", (e) => {
    if (e.target === textEl || textEl.contains(e.target) || e.target.closest("button")) return;
    el.setPointerCapture(e.pointerId);
    dragState = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: parseFloat(el.style.left),
      startTop: parseFloat(el.style.top),
      moved: false,
    };
  });

  el.addEventListener("pointermove", (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    if (!dragState.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragState.moved = true;
      el.classList.add("is-dragging");
    }
    el.style.left = `${dragState.startLeft + dx}px`;
    el.style.top = `${dragState.startTop + dy}px`;
  });

  function endDrag(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const { moved } = dragState;
    dragState = null;
    if (!moved) {
      if (e.type === "pointerup" && !note.minimized) focusTextAtEnd();
      return;
    }
    el.classList.remove("is-dragging");
    el.classList.add("is-dropping");
    setTimeout(() => el.classList.remove("is-dropping"), DROP_SQUISH_MS);
    persistPositionFromPixels(el, note, viewport);
  }
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  el.addEventListener("keydown", (e) => {
    // Arrows from inside the text box must move the caret, not the note.
    if (e.target !== el) return;
    const step = e.shiftKey ? 10 : 2;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;

    e.preventDefault();
    el.style.left = `${parseFloat(el.style.left) + dx}px`;
    el.style.top = `${parseFloat(el.style.top) + dy}px`;
    persistPositionFromPixels(el, note, viewport);
  });

  return el;
}
