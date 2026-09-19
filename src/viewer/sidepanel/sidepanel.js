import { renderThumbnails, setActiveThumbnail } from "./thumbnails.js";

export async function initSidePanel({ pdfDoc, sidePanelEl, thumbnailsEl, viewerMainEl, pageListEl }) {
  sidePanelEl.hidden = false;

  await renderThumbnails(pdfDoc, thumbnailsEl, {
    onSelect: (pageNumber) => {
      const wrapper = pageListEl.querySelector(`[data-page-number="${pageNumber}"]`);
      wrapper?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });

  const observer = new IntersectionObserver(
    (entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (mostVisible) {
        setActiveThumbnail(thumbnailsEl, Number(mostVisible.target.dataset.pageNumber));
      }
    },
    { root: viewerMainEl, threshold: [0.25, 0.5, 0.75] }
  );

  for (const wrapper of pageListEl.querySelectorAll(".page-wrapper")) {
    observer.observe(wrapper);
  }

  return () => observer.disconnect();
}
