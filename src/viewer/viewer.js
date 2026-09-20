import { state, setState } from "./app/state.js";
import { loadPdf } from "./app/pdf-loader.js";
import { clearPages, loadPages, mountPages, getPages } from "./app/pages.js";
import { startRendering, stopRendering } from "./app/render.js";
import { initZoom, zoomBy, ZOOM_STEP } from "./app/zoom.js";
import { initFileInput } from "./app/dnd.js";
import { hashFile } from "./app/hash.js";
import { getPdfRecord, putPdfRecord } from "./app/db.js";
import { initSidePanel } from "./sidepanel/sidepanel.js";
import { initHighlights, setAnnotateMode, setEraseMode, setActiveColor, syncAnnotateMode, loadHighlightsForPage } from "./highlights/highlight-manager.js";
import { renderNoteTray } from "./notes/note-tray.js";
import { initNoteDropTarget, loadNotesForPage } from "./notes/note-manager.js";
import { exportAnnotatedPdf } from "./export/export-pdf.js";

const BASE_SCALE = 1.25;

const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Butter yellow" },
  { id: "pink", label: "Blush pink" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
  { id: "lavender", label: "Lavender" },
];

const els = {
  openBtn: document.getElementById("open-btn"),
  fileInput: document.getElementById("file-input"),
  viewerMain: document.getElementById("viewer-main"),
  emptyState: document.getElementById("empty-state"),
  pageList: document.getElementById("page-list"),
  sidePanel: document.getElementById("side-panel"),
  thumbnails: document.getElementById("thumbnails"),
  zoomGroup: document.getElementById("zoom-group"),
  zoomInBtn: document.getElementById("zoom-in-btn"),
  zoomOutBtn: document.getElementById("zoom-out-btn"),
  zoomLevel: document.getElementById("zoom-level"),
  annotateGroup: document.getElementById("annotate-group"),
  annotateToggle: document.getElementById("annotate-toggle"),
  eraseToggle: document.getElementById("erase-toggle"),
  colorSwatches: document.getElementById("color-swatches"),
  notesGroup: document.getElementById("notes-group"),
  notesDropdown: document.getElementById("notes-dropdown"),
  notesToggle: document.getElementById("notes-toggle"),
  notesDropdownPanel: document.getElementById("notes-dropdown-panel"),
  exportGroup: document.getElementById("export-group"),
  exportBtn: document.getElementById("export-btn"),
};

let disposeSidePanel = null;
let openTicket = 0;

function updateZoomLabel() {
  els.zoomLevel.textContent = `${Math.round((state.scale / BASE_SCALE) * 100)}%`;
}

function initColorSwatches() {
  els.colorSwatches.innerHTML = "";
  HIGHLIGHT_COLORS.forEach((color, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.style.background = `var(--color-${color.id})`;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(index === 0));
    btn.setAttribute("aria-label", color.label);
    btn.dataset.color = color.id;
    btn.addEventListener("click", () => {
      els.colorSwatches.querySelectorAll(".color-swatch").forEach((el) => el.setAttribute("aria-checked", "false"));
      btn.setAttribute("aria-checked", "true");
      setActiveColor(color.id);
    });
    els.colorSwatches.appendChild(btn);
  });
  setActiveColor(HIGHLIGHT_COLORS[0].id);
}

function isPressed(btn) {
  return btn.getAttribute("aria-pressed") === "true";
}

// Annotate and erase both claim the pointer on the page, so only one can be on.
els.annotateToggle.addEventListener("click", () => {
  const next = !isPressed(els.annotateToggle);
  els.annotateToggle.setAttribute("aria-pressed", String(next));
  setAnnotateMode(next);
  if (next) {
    els.eraseToggle.setAttribute("aria-pressed", "false");
    setEraseMode(false);
  }
});

els.eraseToggle.addEventListener("click", () => {
  const next = !isPressed(els.eraseToggle);
  els.eraseToggle.setAttribute("aria-pressed", String(next));
  setEraseMode(next);
  if (next) {
    els.annotateToggle.setAttribute("aria-pressed", "false");
    setAnnotateMode(false);
  }
});

function setNotesDropdownOpen(open) {
  els.notesDropdownPanel.hidden = !open;
  els.notesToggle.setAttribute("aria-expanded", String(open));
}

els.notesToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setNotesDropdownOpen(els.notesDropdownPanel.hidden);
});

document.addEventListener("click", (e) => {
  if (!els.notesDropdownPanel.hidden && !els.notesDropdown?.contains(e.target)) {
    setNotesDropdownOpen(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.notesDropdownPanel.hidden) {
    setNotesDropdownOpen(false);
    els.notesToggle.focus();
  }
});

// Runs for every page as it is painted, on its new content while that is still
// off-screen, so highlights and notes appear together with the page.
async function renderPageAnnotations(content, pageNumber, viewport) {
  syncAnnotateMode(content.querySelector(".text-layer"));
  await Promise.all([
    loadHighlightsForPage(content, pageNumber, viewport),
    loadNotesForPage(content, pageNumber, viewport),
  ]);
}

function showOpenFailure(err) {
  console.error("Failed to open PDF", err);
  els.emptyState.hidden = false;
  els.pageList.hidden = true;
  window.alert("Sorry, that file couldn't be opened as a PDF.");
}

async function openFile(file) {
  const myTicket = ++openTicket;
  els.emptyState.hidden = true;
  els.emptyState.classList.remove("is-drag-over");
  els.pageList.hidden = false;

  let pdfDoc;
  try {
    pdfDoc = await loadPdf(file);
  } catch (err) {
    showOpenFailure(err);
    return;
  }

  const pdfHash = await hashFile(file);
  const existingRecord = await getPdfRecord(pdfHash);
  await putPdfRecord({
    hash: pdfHash,
    pageCount: pdfDoc.numPages,
    fileName: file.name,
    createdAt: existingRecord?.createdAt ?? Date.now(),
    lastOpenedAt: Date.now(),
  });
  if (myTicket !== openTicket) return;

  // Retire the previous file's renders, shells and thumbnails first.
  stopRendering();
  disposeSidePanel?.();
  disposeSidePanel = null;
  clearPages(els.pageList);

  setState({ file, pdfDoc, pdfHash, numPages: pdfDoc.numPages, currentPage: 1, scale: BASE_SCALE });
  els.zoomGroup.hidden = false;
  els.annotateGroup.hidden = false;
  els.notesGroup.hidden = false;
  els.exportGroup.hidden = false;

  let loaded;
  try {
    loaded = await loadPages(pdfDoc);
  } catch (err) {
    showOpenFailure(err);
    return;
  }
  if (myTicket !== openTicket) return;

  // Shells are built once per file. Zooming only resizes them, and painting
  // fills them in lazily, so neither needs to rebuild the page list or the
  // thumbnails.
  mountPages(els.pageList, loaded);
  for (const { wrapper, number } of getPages()) initNoteDropTarget(wrapper, number);
  els.viewerMain.scrollTop = 0;
  updateZoomLabel();
  startRendering({ viewerMainEl: els.viewerMain, onPageRendered: renderPageAnnotations });

  const dispose = await initSidePanel({
    pdfDoc,
    sidePanelEl: els.sidePanel,
    thumbnailsEl: els.thumbnails,
    viewerMainEl: els.viewerMain,
    pageListEl: els.pageList,
  });
  if (myTicket !== openTicket) {
    dispose();
    return;
  }
  disposeSidePanel = dispose;
}

initHighlights({ pageListEl: els.pageList });
initColorSwatches();
renderNoteTray(els.notesDropdownPanel);

initFileInput({
  openBtn: els.openBtn,
  fileInput: els.fileInput,
  dropZone: els.viewerMain,
  emptyState: els.emptyState,
  onFile: openFile,
});

initZoom({ viewerMainEl: els.viewerMain, baseScale: BASE_SCALE, onZoom: updateZoomLabel });

els.zoomInBtn.addEventListener("click", () => zoomBy(ZOOM_STEP));
els.zoomOutBtn.addEventListener("click", () => zoomBy(1 / ZOOM_STEP));

els.exportBtn.addEventListener("click", async () => {
  if (!state.pdfDoc) return;
  const originalLabel = els.exportBtn.textContent;
  els.exportBtn.disabled = true;
  els.exportBtn.textContent = "Exporting...";
  try {
    await exportAnnotatedPdf();
  } catch (err) {
    console.error("Failed to export PDF", err);
    window.alert("Sorry, something went wrong exporting this PDF.");
  } finally {
    els.exportBtn.disabled = false;
    els.exportBtn.textContent = originalLabel;
  }
});
