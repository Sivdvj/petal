import { state, setState } from "./app/state.js";
import { loadPdf } from "./app/pdf-loader.js";
import { renderAllPages } from "./app/render.js";
import { initFileInput } from "./app/dnd.js";
import { hashFile } from "./app/hash.js";
import { getPdfRecord, putPdfRecord } from "./app/db.js";
import { initSidePanel } from "./sidepanel/sidepanel.js";
import { initHighlights, setAnnotateMode, setActiveColor, loadHighlightsForPage } from "./highlights/highlight-manager.js";
import { renderNoteTray } from "./notes/note-tray.js";
import { initNoteDropTarget, loadNotesForPage } from "./notes/note-manager.js";
import { exportAnnotatedPdf } from "./export/export-pdf.js";

const BASE_SCALE = 1.25;
const ZOOM_STEP = 1.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

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
  colorSwatches: document.getElementById("color-swatches"),
  noteTray: document.getElementById("note-tray"),
  exportGroup: document.getElementById("export-group"),
  exportBtn: document.getElementById("export-btn"),
};

let disposeSidePanel = null;

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

els.annotateToggle.addEventListener("click", () => {
  const next = els.annotateToggle.getAttribute("aria-pressed") !== "true";
  els.annotateToggle.setAttribute("aria-pressed", String(next));
  setAnnotateMode(next);
});

async function renderCurrentPdf() {
  await renderAllPages(state.pdfDoc, {
    pageListEl: els.pageList,
    onPageRendered: async (wrapper, pageNumber, viewport) => {
      initNoteDropTarget(wrapper, pageNumber, viewport);
      await loadHighlightsForPage(wrapper, pageNumber, viewport);
      await loadNotesForPage(wrapper, pageNumber, viewport);
    },
  });

  disposeSidePanel?.();
  disposeSidePanel = await initSidePanel({
    pdfDoc: state.pdfDoc,
    sidePanelEl: els.sidePanel,
    thumbnailsEl: els.thumbnails,
    viewerMainEl: els.viewerMain,
    pageListEl: els.pageList,
  });

  updateZoomLabel();
}

async function openFile(file) {
  els.emptyState.hidden = true;
  els.emptyState.classList.remove("is-drag-over");
  els.pageList.hidden = false;

  let pdfDoc;
  try {
    pdfDoc = await loadPdf(file);
  } catch (err) {
    console.error("Failed to open PDF", err);
    els.emptyState.hidden = false;
    els.pageList.hidden = true;
    window.alert("Sorry, that file couldn't be opened as a PDF.");
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

  setState({ file, pdfDoc, pdfHash, numPages: pdfDoc.numPages, currentPage: 1, scale: BASE_SCALE });
  els.zoomGroup.hidden = false;
  els.annotateGroup.hidden = false;
  els.exportGroup.hidden = false;

  await renderCurrentPdf();
}

initHighlights({ pageListEl: els.pageList });
initColorSwatches();
renderNoteTray(els.noteTray);

initFileInput({
  openBtn: els.openBtn,
  fileInput: els.fileInput,
  dropZone: els.viewerMain,
  emptyState: els.emptyState,
  onFile: openFile,
});

els.zoomInBtn.addEventListener("click", async () => {
  if (!state.pdfDoc) return;
  setState({ scale: Math.min(MAX_SCALE, state.scale * ZOOM_STEP) });
  await renderCurrentPdf();
});

els.zoomOutBtn.addEventListener("click", async () => {
  if (!state.pdfDoc) return;
  setState({ scale: Math.max(MIN_SCALE, state.scale / ZOOM_STEP) });
  await renderCurrentPdf();
});

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
