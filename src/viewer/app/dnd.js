const DRAG_EVENTS_ENTER = ["dragenter", "dragover"];
const DRAG_EVENTS_LEAVE = ["dragleave", "drop"];

export function initFileInput({ openBtn, fileInput, dropZone, emptyState, onFile }) {
  openBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) onFile(file);
    fileInput.value = "";
  });

  for (const evt of DRAG_EVENTS_ENTER) {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (!emptyState.hidden) emptyState.classList.add("is-drag-over");
    });
  }

  for (const evt of DRAG_EVENTS_LEAVE) {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      emptyState.classList.remove("is-drag-over");
    });
  }

  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      onFile(file);
    }
  });
}
