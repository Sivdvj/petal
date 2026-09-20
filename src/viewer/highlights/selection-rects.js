// Range.getClientRects() returns a box for every fully-selected element AND a
// box for its text node, so each span in the middle of a selection comes back
// twice (element box + slightly taller text box) and stacks into a
// double-dark highlight. Asking each text node for its own rects avoids the
// element boxes, and merging them per line gives one clean bar per line
// instead of one rounded chip per word.
export function getSelectionLineRects(range, textLayer) {
  const rects = [];
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;

    const piece = document.createRange();
    piece.selectNodeContents(node);
    if (node === range.startContainer) piece.setStart(node, range.startOffset);
    if (node === range.endContainer) piece.setEnd(node, range.endOffset);

    for (const r of piece.getClientRects()) {
      if (r.width > 0 && r.height > 0) rects.push(r);
    }
  }
  return mergeLineRects(rects);
}

// Text nodes arrive in document order, so pieces of one line are consecutive.
function mergeLineRects(rects) {
  const merged = [];
  for (const r of rects) {
    const last = merged[merged.length - 1];
    if (last && isSameLine(last, r)) {
      last.left = Math.min(last.left, r.left);
      last.top = Math.min(last.top, r.top);
      last.right = Math.max(last.right, r.right);
      last.bottom = Math.max(last.bottom, r.bottom);
    } else {
      merged.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  return merged;
}

function isSameLine(a, b) {
  const aHeight = a.bottom - a.top;
  const bHeight = b.bottom - b.top;
  const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (verticalOverlap < 0.5 * Math.min(aHeight, bHeight)) return false;

  // Bridge word gaps, but not the gutter between columns.
  const gap = Math.max(b.left - a.right, a.left - b.right);
  return gap <= 0.5 * Math.min(aHeight, bHeight);
}
