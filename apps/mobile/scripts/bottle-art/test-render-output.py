"""Validate the two rendered deliverables without loading Blender."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[2] / 'assets' / 'bottles'
expected = {'eh-taylor-small-batch.png', 'russells-reserve-10.png'}
assert root.exists(), 'Two-bottle Blender render assets are missing'
assert {p.name for p in root.glob('*.png')} == expected
for name in sorted(expected):
    image = Image.open(root / name)
    assert image.mode == 'RGBA', name
    assert image.size == (512, 768), name
    alpha = image.getchannel('A')
    assert alpha.getextrema() == (0, 255), name
    box = alpha.getbbox()
    assert box and box[0] > 0 and box[1] > 0 and box[2] < 512 and box[3] < 768, (name, box)
    assert box[3] - box[1] > 590, (name, box)
    assert (root / name).stat().st_size < 600_000, name
print('Two transparent Blender render assets verified.')
