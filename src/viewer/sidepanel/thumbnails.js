const THUMBNAIL_SCALE = 0.2;

export async function renderThumbnails(pdfDoc, thumbnailsEl, { onSelect }) {
  thumbnailsEl.innerHTML = "";

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumbnail";
    btn.dataset.pageNumber = String(pageNumber);
    btn.setAttribute("aria-label", `Go to page ${pageNumber}`);
    btn.appendChild(canvas);

    const label = document.createElement("span");
    label.className = "thumbnail-label";
    label.textContent = String(pageNumber);
    btn.appendChild(label);

    btn.addEventListener("click", () => onSelect(pageNumber));
    thumbnailsEl.appendChild(btn);
  }

  setActiveThumbnail(thumbnailsEl, 1);
}

export function setActiveThumbnail(thumbnailsEl, pageNumber) {
  for (const el of thumbnailsEl.querySelectorAll(".thumbnail")) {
    el.classList.toggle("is-active", Number(el.dataset.pageNumber) === pageNumber);
  }
}
