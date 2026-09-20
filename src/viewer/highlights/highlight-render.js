import { pdfRectToViewportRect } from "../app/coords.js";

// `content` is the page's .page-content element, not the .page-wrapper shell:
// the zoom preview stretches the content, so layers must live inside it.
function getOrCreateLayer(content) {
  let layer = content.querySelector(".highlight-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "highlight-layer";
    content.appendChild(layer);
  }
  return layer;
}

export function addHighlightToPage(content, highlight, viewport) {
  const layer = getOrCreateLayer(content);
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
