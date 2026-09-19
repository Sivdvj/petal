import { state, setState } from "./app/state.js";
import { loadPdf } from "./app/pdf-loader.js";
import { renderAllPages } from "./app/render.js";
import { initFileInput } from "./app/dnd.js";
import { initSidePanel } from "./sidepanel/sidepanel.js";

const BASE_SCALE = 1.25;
const ZOOM_STEP = 1.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

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
};

let disposeSidePanel = null;

function updateZoomLabel() {
  els.zoomLevel.textContent = `${Math.round((state.scale / BASE_SCALE) * 100)}%`;
}

async function renderCurrentPdf() {
  await renderAllPages(state.pdfDoc, { pageListEl: els.pageList });

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

  setState({ file, pdfDoc, numPages: pdfDoc.numPages, currentPage: 1, scale: BASE_SCALE });
  els.zoomGroup.hidden = false;

  await renderCurrentPdf();
}

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
