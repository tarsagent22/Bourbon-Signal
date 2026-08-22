#!/usr/bin/env python
"""Regenerate native assets from the approved Bourbon Signal mark.

Requires Pillow. Run from any directory:
  python apps/mobile/scripts/generate-brand-assets.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / "public" / "icon-512.png"
OUTPUT = REPO / "apps" / "mobile" / "assets"
BACKGROUND = (11, 10, 9, 255)
ASSET_NAMES = (
    "icon.png",
    "splash-icon.png",
    "android-icon-background.png",
    "android-icon-foreground.png",
    "android-icon-monochrome.png",
    "favicon.png",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    OUTPUT.mkdir(parents=True, exist_ok=True)

    base = Image.new("RGBA", (512, 512), BACKGROUND)
    base.alpha_composite(source)
    base.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGB").save(OUTPUT / "icon.png")

    splash = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    splash.alpha_composite(source)
    splash.save(OUTPUT / "splash-icon.png")

    Image.new("RGBA", (512, 512), BACKGROUND).save(OUTPUT / "android-icon-background.png")
    foreground = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    mark = source.resize((352, 352), Image.Resampling.LANCZOS)
    foreground.alpha_composite(mark, (80, 80))
    foreground.save(OUTPUT / "android-icon-foreground.png")

    mask = Image.new("L", source.size, 0)
    source_pixels = source.load()
    mask_pixels = mask.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = source_pixels[x, y]
            distance = max(abs(red - 11), abs(green - 10), abs(blue - 9))
            mask_pixels[x, y] = min(alpha, max(0, min(255, (distance - 18) * 5)))
    monochrome_mark = Image.new("RGBA", source.size, (255, 255, 255, 0))
    monochrome_mark.putalpha(mask)
    monochrome = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    monochrome.alpha_composite(monochrome_mark.resize((300, 300), Image.Resampling.LANCZOS), (66, 66))
    monochrome.save(OUTPUT / "android-icon-monochrome.png")

    base.resize((48, 48), Image.Resampling.LANCZOS).save(OUTPUT / "favicon.png")

    assets = {}
    for name in ASSET_NAMES:
        path = OUTPUT / name
        with Image.open(path) as image:
            assets[name] = {"sha256": sha256(path), "width": image.width, "height": image.height, "mode": image.mode}
    manifest = {
        "schemaVersion": "bourbon-signal/native-brand-assets@1",
        "source": {"path": "public/icon-512.png", "sha256": sha256(SOURCE)},
        "assets": assets,
    }
    (OUTPUT / "brand-assets.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))


if __name__ == "__main__":
    generate()
