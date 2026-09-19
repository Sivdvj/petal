const NOTE_COLORS = [
  { id: "yellow", label: "Butter yellow" },
  { id: "pink", label: "Blush pink" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
  { id: "lavender", label: "Lavender" },
];

export const NOTE_DRAG_MIME = "application/x-petal-note-color";

export function renderNoteTray(trayEl) {
  trayEl.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "side-section-title";
  heading.textContent = "Sticky notes";
  trayEl.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "note-tray-hint";
  hint.textContent = "Drag a note onto the page to stick it there.";
  trayEl.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "note-tray-grid";
  for (const color of NOTE_COLORS) {
    const swatch = document.createElement("div");
    swatch.className = `note-tray-swatch note-paper-${color.id}`;
    swatch.draggable = true;
    swatch.setAttribute("role", "img");
    swatch.setAttribute("aria-label", `Blank ${color.label.toLowerCase()} sticky note, drag onto the page`);
    swatch.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData(NOTE_DRAG_MIME, color.id);
      e.dataTransfer.effectAllowed = "copy";
    });
    grid.appendChild(swatch);
  }
  trayEl.appendChild(grid);
}
