import { pdfjsLib } from "./pdf-loader.js";
import { state } from "./state.js";

export async function renderAllPages(pdfDoc, { pageListEl }) {
  pageListEl.innerHTML = "";

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    wrapper.dataset.pageNumber = String(pageNumber);
    pageListEl.appendChild(wrapper);
    await renderPage(pdfDoc, pageNumber, wrapper);
  }
}

async function renderPage(pdfDoc, pageNumber, wrapper) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: state.scale });
  const outputScale = window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  wrapper.style.width = `${Math.floor(viewport.width)}px`;
  wrapper.style.height = `${Math.floor(viewport.height)}px`;
  wrapper.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
  await page.render({ canvasContext: ctx, viewport, transform }).promise;

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "text-layer";
  wrapper.appendChild(textLayerDiv);

  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textLayerDiv,
    viewport,
  });
  await textLayer.render();
}
