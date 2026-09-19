// Converts a DOM client rect (screen pixels) into a PDF page-unit rect,
// using the page's own bounding box as the origin. This keeps stored
// coordinates independent of zoom, rotation, and device pixel ratio.
export function clientRectToPdfRect(clientRect, wrapperRect, viewport) {
  const x0 = clientRect.left - wrapperRect.left;
  const y0 = clientRect.top - wrapperRect.top;
  const x1 = clientRect.right - wrapperRect.left;
  const y1 = clientRect.bottom - wrapperRect.top;

  const [px0, py0] = viewport.convertToPdfPoint(x0, y0);
  const [px1, py1] = viewport.convertToPdfPoint(x1, y1);

  return {
    x: Math.min(px0, px1),
    y: Math.min(py0, py1),
    width: Math.abs(px1 - px0),
    height: Math.abs(py1 - py0),
  };
}

// Inverse of clientRectToPdfRect: projects a stored PDF page-unit rect back
// onto the page's current viewport, so highlights re-anchor after zoom/rotation.
export function pdfRectToViewportRect(pdfRect, viewport) {
  const [vx0, vy0] = viewport.convertToViewportPoint(pdfRect.x, pdfRect.y);
  const [vx1, vy1] = viewport.convertToViewportPoint(pdfRect.x + pdfRect.width, pdfRect.y + pdfRect.height);

  return {
    left: Math.min(vx0, vx1),
    top: Math.min(vy0, vy1),
    width: Math.abs(vx1 - vx0),
    height: Math.abs(vy1 - vy0),
  };
}
