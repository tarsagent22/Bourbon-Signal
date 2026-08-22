# Native brand assets

The mobile icon, splash, adaptive foreground/background, monochrome icon, and favicon are deterministic derivatives of the repository-owned Bourbon Signal rocks-glass/radio-wave mark in `public/icon-512.png`.

- No generative imagery or third-party stock artwork is used.
- `icon.png` is an opaque 1024×1024 store icon.
- `android-icon-foreground.png` keeps the mark inside Android’s adaptive-icon safe zone.
- `android-icon-background.png` uses the warm-black product background.
- `android-icon-monochrome.png` is a white alpha mask for themed Android icons.
- `splash-icon.png` is presented over the configured warm-black splash background.
- `template-icon.sha256` records the removed Expo template icon so the release-readiness gate cannot silently regress to it.

Regenerate with Pillow from any repository directory:

```bash
python apps/mobile/scripts/generate-brand-assets.py
```

The script rewrites `brand-assets.json` with the approved source hash, output hashes, dimensions, and color modes. The release-readiness gate validates the committed files against that manifest.
