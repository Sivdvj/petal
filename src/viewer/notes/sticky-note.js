import { pdfRectToViewportRect } from "../app/coords.js";
import { putNote } from "../app/db.js";

const DROP_SQUISH_MS = 260;

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
  el.appendChild(toolbar);
  toolbar.appendChild(minimizeBtn);

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

  let dragState = null;

  el.addEventListener("pointerdown", (e) => {
    if (e.target === textEl || textEl.contains(e.target) || e.target === minimizeBtn) return;
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-dragging");
    dragState = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: parseFloat(el.style.left),
      startTop: parseFloat(el.style.top),
    };
  });

  el.addEventListener("pointermove", (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    el.style.left = `${dragState.startLeft + dx}px`;
    el.style.top = `${dragState.startTop + dy}px`;
  });

  function endDrag(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    dragState = null;
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
