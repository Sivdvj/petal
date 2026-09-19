import { pdfRectToViewportRect } from "../app/coords.js";

function getOrCreateLayer(wrapper) {
  let layer = wrapper.querySelector(".highlight-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "highlight-layer";
    wrapper.appendChild(layer);
  }
  return layer;
}

export function addHighlightToPage(wrapper, highlight, viewport) {
  const layer = getOrCreateLayer(wrapper);
  for (const rect of highlight.rects) {
    const viewportRect = pdfRectToViewportRect(rect, viewport);
    const div = document.createElement("div");
    div.className = `highlight highlight-${highlight.color}`;
    div.style.left = `${viewportRect.left}px`;
    div.style.top = `${viewportRect.top}px`;
    div.style.width = `${viewportRect.width}px`;
    div.style.height = `${viewportRect.height}px`;
    div.dataset.highlightId = highlight.id;
    layer.appendChild(div);
  }
}
