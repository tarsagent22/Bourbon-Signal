"""Offline, non-generative transparent packshot preparation. No source downloads."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import warnings
from PIL import Image, ImageOps, __version__ as pillow_version

RECIPE = 'rgba-pad-v1'
MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_EDGE = 12000
FORMATS = {'PNG', 'JPEG', 'WEBP'}

class UnsuitableSource(ValueError):
    """Hold for manual processing; never implies identity or rights approval."""

def external_output(path):
    p = Path(path).resolve()
    repo = Path(__file__).resolve().parents[2]
    if p == repo or repo in p.parents:
        raise ValueError('data outputs must be outside repository')
    return p

def atomic_bytes(path, data):
    p = external_output(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=p.name + '.', suffix='.tmp', dir=p.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(temp, p)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def write_json(path, value):
    atomic_bytes(path, (json.dumps(value, indent=2, sort_keys=True) + '\n').encode('utf-8'))

def load_local(source, max_bytes=MAX_BYTES, max_pixels=MAX_PIXELS):
    raw = str(source)
    if '://' in raw or raw.startswith(('\\\\', '//')):
        raise UnsuitableSource('local raster files only; remote/UNC sources rejected')
    path = Path(source)
    if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'} or not path.is_file() or path.is_symlink():
        raise UnsuitableSource('regular local PNG/JPEG/WebP file required')
    if not 0 < max_bytes <= MAX_BYTES or not 0 < max_pixels <= MAX_PIXELS:
        raise UnsuitableSource('limits may only be tightened')
    try:
        if path.stat().st_size > max_bytes:
            raise UnsuitableSource('source byte limit exceeded')
        with path.open('rb') as stream:
            data = stream.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise UnsuitableSource('source byte limit exceeded')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in FORMATS:
                    raise UnsuitableSource('unsupported decoded raster format')
                if image.width * image.height > max_pixels or max(image.size) > MAX_EDGE:
                    raise UnsuitableSource('source pixel/dimension limit exceeded')
                if getattr(image, 'n_frames', 1) != 1:
                    raise UnsuitableSource('animated/multiframe image needs manual processing')
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                # ICC/CMYK conversion is not guessed; retain label colors for manual review.
                if image.mode not in {'RGB', 'RGBA', 'P', 'L', 'LA'} or image.info.get('icc_profile'):
                    raise UnsuitableSource('color profile/mode needs manual processing')
                rgba = ImageOps.exif_transpose(image).convert('RGBA')
        return rgba, hashlib.sha256(data).hexdigest()
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise UnsuitableSource(str(error)) from error

def prepare(source, output, *, max_bytes=MAX_BYTES, max_pixels=MAX_PIXELS):
    output = external_output(output)
    if Path(source).resolve() == output:
        raise UnsuitableSource('never overwrite source')
    if output.suffix.lower() != '.png':
        raise UnsuitableSource('derivative output must be PNG')
    image, original_hash = load_local(source, max_bytes, max_pixels)
    alpha = image.getchannel('A')
    box = alpha.getbbox()
    if box is None:
        raise UnsuitableSource('empty alpha; manual processing required')
    if alpha.getextrema()[0] != 0:
        raise UnsuitableSource('no fully transparent background; manual masking required, no white stripping')
    # Crop ONLY fully transparent pixels. Never trim a halo, cap, base or label.
    cropped = image.crop(box)
    if min(cropped.size) < 32 or max(cropped.size) < 96:
        raise UnsuitableSource('source too small for label review')
    scale = min(352 / cropped.width, 552 / cropped.height, 1.0)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    if size != cropped.size:
        cropped = cropped.resize(size, Image.Resampling.LANCZOS)
    result = Image.new('RGBA', (400, 600), (0, 0, 0, 0))
    position = ((400 - size[0]) // 2, 576 - size[1])
    # No alpha mask here: paste RGBA values directly, avoiding alpha squaring.
    result.paste(cropped, position)
    buffer = io.BytesIO()
    result.save(buffer, format='PNG', optimize=False, compress_level=9)
    data = buffer.getvalue()
    processed_hash = hashlib.sha256(data).hexdigest()
    reused = output.is_file() and hashlib.sha256(output.read_bytes()).hexdigest() == processed_hash
    if not reused:
        atomic_bytes(output, data)
    return {'status': 'needs_visual_review', 'rightsStatus': 'unverified', 'identityStatus': 'unreviewed',
            'originalSha256': original_hash, 'processedSha256': processed_hash, 'recipeVersion': RECIPE,
            'pillowVersion': pillow_version, 'width': 400, 'height': 600, 'format': 'PNG',
            'sourceSize': list(image.size), 'alphaCrop': list(box), 'contentSize': list(size),
            'position': list(position), 'bytes': len(data), 'reused': reused,
            'output': str(output), 'warnings': ['Human visual review required; processing does not establish rights or exact identity.']}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source'); parser.add_argument('output'); parser.add_argument('report')
    args = parser.parse_args()
    paths = [Path(p).resolve() for p in [args.source, args.output, args.report]]
    if len(set(paths)) != 3:
        parser.error('source, output and report must be distinct')
    external_output(args.output); external_output(args.report)
    try:
        report = prepare(args.source, args.output)
    except UnsuitableSource as error:
        report = {'status': 'manual_processing_required', 'reason': str(error), 'rightsStatus': 'unverified'}
        write_json(args.report, report)
        print(json.dumps(report)); return 2
    write_json(args.report, report)
    print(json.dumps(report)); return 0

if __name__ == '__main__':
    raise SystemExit(main())
