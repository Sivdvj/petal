// Ported from the selection guard in pdf.js's own TextLayerBuilder (Chrome path).
//
// Text spans are absolutely positioned, so when the pointer crosses blank space
// between them the browser has nothing to anchor to: the selection collapses,
// jumps a line, or overshoots. While the pointer is down we keep a full-size,
// unselectable "end of content" div parked right beside the selection's moving
// edge, so blank space resolves to "just past the selection" instead.

const endDivs = new Map(); // text layer -> its end-of-content div
let isPointerDown = false;
let prevRange = null;
let listening = false;

export function attachSelectionGuard(textLayerDiv) {
  const end = document.createElement("div");
  end.className = "end-of-content";
  textLayerDiv.appendChild(end);
  textLayerDiv.addEventListener("mousedown", () => textLayerDiv.classList.add("selecting"));

  endDivs.set(textLayerDiv, end);
  listenGlobally();
}

function reset(end, textLayerDiv) {
  textLayerDiv.appendChild(end);
  end.style.width = "";
  end.style.height = "";
  textLayerDiv.classList.remove("selecting");
}

// Zoom rebuilds every page, so layers from earlier renders are dropped here.
function forEachLiveLayer(fn) {
  for (const [textLayerDiv, end] of endDivs) {
    if (!textLayerDiv.isConnected) endDivs.delete(textLayerDiv);
    else fn(end, textLayerDiv);
  }
}

function resetAll() {
  forEachLiveLayer(reset);
}

function listenGlobally() {
  if (listening) return;
  listening = true;

  document.addEventListener("pointerdown", () => {
    isPointerDown = true;
  });
  document.addEventListener("pointerup", () => {
    isPointerDown = false;
    resetAll();
  });
  window.addEventListener("blur", () => {
    isPointerDown = false;
    resetAll();
  });
  document.addEventListener("keyup", () => {
    if (!isPointerDown) resetAll();
  });
  document.addEventListener("selectionchange", handleSelectionChange);
}

function handleSelectionChange() {
  const selection = document.getSelection();
  if (selection.rangeCount === 0) {
    resetAll();
    return;
  }

  const range = selection.getRangeAt(0);
  forEachLiveLayer((end, textLayerDiv) => {
    if (range.intersectsNode(textLayerDiv)) textLayerDiv.classList.add("selecting");
    else reset(end, textLayerDiv);
  });

  // Park the end div beside whichever edge of the selection is being dragged:
  // that edge is the one that kept its boundary point since the last change.
  const modifyStart =
    prevRange &&
    (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
  let anchor = modifyStart ? range.startContainer : range.endContainer;
  if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;

  const textLayerDiv = anchor.parentElement?.closest(".text-layer");
  const end = endDivs.get(textLayerDiv);
  if (end) {
    end.style.width = textLayerDiv.style.width;
    end.style.height = textLayerDiv.style.height;
    anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
  }
  prevRange = range.cloneRange();
}
