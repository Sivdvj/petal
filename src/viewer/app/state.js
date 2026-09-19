const listeners = new Set();

export const state = {
  file: null,
  pdfDoc: null,
  pdfHash: null,
  numPages: 0,
  currentPage: 1,
  scale: 1.25,
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
