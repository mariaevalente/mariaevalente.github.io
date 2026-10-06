"""Turn the chosen trip photos into web images with no metadata.

Reads tools/gallery.json, opens each original from img/trips (HEIC, Canon CR2 or JPEG),
applies its orientation, and writes two JPEGs per photo to img/gallery: a 1600 px
version for the full view and a 640 px thumbnail. Nothing from the original file is
carried over, so location (GPS), camera and date data never reach the site. It also
writes img/gallery/gallery.json with the captions and sizes the page uses.

    python -m pip install --user pillow-heif rawpy
    python tools/make_gallery.py

To swap a photo, change its "file" in tools/gallery.json and run the script again.
The originals in img/trips are not published (see .gitignore).
"""

from __future__ import annotations

import hashlib
import io
import json
import re
from pathlib import Path

import pillow_heif
import rawpy
from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "tools" / "gallery.json"
FULL, THUMB = 1600, 640
GENERATED = re.compile(r"photo-\d{2}(-thumb)?\.jpg")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]

pillow_heif.register_heif_opener()


def load(path: Path) -> Image.Image:
    if path.suffix.lower() == ".cr2":
        with rawpy.imread(str(path)) as raw:
            return Image.fromarray(raw.postprocess(use_camera_wb=True))
    with Image.open(path) as image:
        upright = ImageOps.exif_transpose(image)
        profile = image.info.get("icc_profile")
        if profile:
            # Phone photos are often Display P3: convert to sRGB before the profile is
            # dropped, or the colours come out washed out in the browser.
            upright = ImageCms.profileToProfile(
                upright.convert("RGB"), ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                ImageCms.createProfile("sRGB"), outputMode="RGB")
        return upright.convert("RGB")


def save(image: Image.Image, longest: int, target: Path) -> tuple[int, int]:
    copy = image.copy()
    copy.thumbnail((longest, longest), Image.LANCZOS)
    # A fresh image holds pixels only: no EXIF, GPS, XMP or ICC data is written.
    clean = Image.new("RGB", copy.size)
    clean.paste(copy)
    clean.save(target, "JPEG", quality=82, optimize=True, progressive=True)
    return clean.size


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    source, output = ROOT / config["source"], ROOT / config["output"]
    output.mkdir(parents=True, exist_ok=True)
    # Only the files this script writes, matched by exact name: on Windows a "*.jpg"
    # glob would also catch an original "*.JPG" left in the folder.
    for old in output.iterdir():
        if GENERATED.fullmatch(old.name):
            old.unlink()

    entries = []
    for number, photo in enumerate(config["photos"], start=1):
        image = load(source / photo["file"])
        name = f"photo-{number:02d}"
        width, height = save(image, FULL, output / f"{name}.jpg")
        save(image, THUMB, output / f"{name}-thumb.jpg")
        # A content hash in the URL, so a photo replaced under the same name is not
        # served from the browser's cache.
        entries.append({"src": f"img/gallery/{name}.jpg?v={digest(output / f'{name}.jpg')}",
                        "thumb": f"img/gallery/{name}-thumb.jpg?v={digest(output / f'{name}-thumb.jpg')}",
                        "caption": photo["caption"], "width": width, "height": height})
        print(f"{name}  {photo['file']}  {width}x{height}")

    (output / "gallery.json").write_text(json.dumps(entries, indent=1), encoding="utf-8")
    print(f"{len(entries)} photos written to {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
