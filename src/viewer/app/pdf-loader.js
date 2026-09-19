import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");

const CMAP_URL = chrome.runtime.getURL("cmaps/");
const STANDARD_FONT_DATA_URL = chrome.runtime.getURL("standard_fonts/");

export async function loadPdf(file) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    isEvalSupported: false,
  });
  return loadingTask.promise;
}

export { pdfjsLib };
