// Travel photos: a grid built from img/gallery/gallery.json (written by tools/make_gallery.py),
// with each photo opening full size in a dialog. Arrow keys move between photos; Esc,
// the close button or a click outside the photo closes it.

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function init(root) {
  let photos;
  try {
    // Revalidated on every visit, so a changed selection shows up at once.
    const response = await fetch(root.dataset.gallery, { cache: "no-cache" });
    if (!response.ok) throw new Error(response.status);
    photos = await response.json();
  } catch (err) {
    root.textContent = "The photos could not be loaded.";
    return;
  }

  root.innerHTML = photos.map((photo, i) => `
    <figure>
      <button type="button" data-index="${i}" aria-label="Open photo: ${escape(photo.caption)}">
        <img src="${photo.thumb}" alt="${escape(photo.caption)}" loading="lazy">
      </button>
      <figcaption>${escape(photo.caption)}</figcaption>
    </figure>`).join("");

  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML = `
    <button type="button" class="lb-close" aria-label="Close">×</button>
    <button type="button" class="lb-prev" aria-label="Previous photo">‹</button>
    <figure><img alt=""><figcaption></figcaption></figure>
    <button type="button" class="lb-next" aria-label="Next photo">›</button>`;
  document.body.appendChild(dialog);
  const image = dialog.querySelector("img");
  const caption = dialog.querySelector("figcaption");
  let current = 0;

  function show(index) {
    current = (index + photos.length) % photos.length;
    image.src = photos[current].src;
    image.alt = photos[current].caption;
    caption.textContent = photos[current].caption;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    show(Number(button.dataset.index));
    dialog.showModal();
  });
  dialog.querySelector(".lb-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".lb-prev").addEventListener("click", () => show(current - 1));
  dialog.querySelector(".lb-next").addEventListener("click", () => show(current + 1));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(current - 1);
    if (event.key === "ArrowRight") show(current + 1);
  });
}

const root = document.querySelector("[data-gallery]");
if (root) init(root);
