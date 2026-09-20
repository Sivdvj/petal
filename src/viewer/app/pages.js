import { state } from "./state.js";

// One record per page of the open file, built once when the file opens: the
// pdf.js page, its size at scale 1 (PDF units, rotation applied) and the
// .page-wrapper "shell" that holds its rendered content. Shells are sized for
// the current zoom up front and never emptied, so the scroll area keeps its
// full height while pages are (re)painted lazily.
let pages = [];

export function getPages() {
  return pages;
}

export function clearPages(pageListEl) {
  pages = [];
  pageListEl.replaceChildren();
}

export async function loadPages(pdfDoc) {
  const pdfPages = await Promise.all(
    Array.from({ length: pdfDoc.numPages }, (_, i) => pdfDoc.getPage(i + 1))
  );
  return pdfPages.map((pdfPage, i) => {
    const { width, height } = pdfPage.getViewport({ scale: 1 });
    const wrapper = document.createElement("div");
    wrapper.className = "page-wrapper";
    wrapper.dataset.pageNumber = String(i + 1);
    return { number: i + 1, pdfPage, baseWidth: width, baseHeight: height, wrapper };
  });
}

export function mountPages(pageListEl, loaded) {
  pages = loaded;
  const fragment = document.createDocumentFragment();
  for (const page of pages) fragment.appendChild(page.wrapper);
  pageListEl.replaceChildren(fragment);
  layoutPages();
}

// Resizing shells is synchronous and cheap; it is all a zoom step has to do
// before the browser can show the new layout.
export function layoutPages() {
  for (const page of pages) {
    page.wrapper.style.width = `${Math.floor(page.baseWidth * state.scale)}px`;
    page.wrapper.style.height = `${Math.floor(page.baseHeight * state.scale)}px`;
  }
}

// The viewport for any page at the current zoom, rendered or not. Anything that
// converts between screen pixels and PDF units (highlight, drop, erase) uses
// this so it stays correct while a page still shows its stretched preview.
export function getPageViewport(pageNumber, scale = state.scale) {
  return pages[pageNumber - 1]?.pdfPage.getViewport({ scale });
}

// The viewport a rendered .page-content was painted with. Layers inside it are
// positioned in that scale's pixels, whatever the zoom is now.
export function getContentViewport(content) {
  return getPageViewport(Number(content.dataset.pageNumber), Number(content.dataset.renderScale));
}
