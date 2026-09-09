# Two-bottle shelf artwork pilot

Exactly two original stylized 3D bottle renders, generated with Blender 5.0.1 (`bpy`) and Pillow. They are illustrative product identifiers, not photographs or exact packaging reproductions. No downloaded reference image or third-party label texture is bundled. Labels are original simplified typography, without invented batch/serial information.

## Packaging references (viewed 2026-09-08 US Eastern)
- E.H. Taylor Small Batch: https://www.buffalotracedistillery.com/our-brands/e-h-taylor-jr/e-h-taylor-jr-small-batch/ — tall rounded amber bottle, cream identification label, neck strip, Bottled in Bond. The tube is intentionally omitted.
- Russell's Reserve 10 Year: https://www.russellsreserve.com/our-products/10-year-old-bourbon/ — broad rounded bottle, walnut stopper, cream main label, burgundy age band.

These URLs document visual reference only, not permission to redistribute source photography. Brand names identify the products; no endorsement is implied.

## Reproduction
Install `bpy==5.0.1` and `Pillow==12.3.0` into a separate Python 3.11 environment. Run `render-pilot.py`, then `test-render-output.py`. Default font directory is `C:/Windows/Fonts` (Georgia and Arial); override with `BOTTLE_ART_FONTS` pointing to licensed local copies. Font files are not redistributed. Set `BOTTLE_ART_BLEND_DIR` to retain editable packed Blender scenes outside the app bundle.

The two final app assets are 512×768 transparent PNGs. Blender is an offline authoring tool, not a runtime/native app dependency. Other bottles and the decorative progression shelf are intentionally unchanged.
