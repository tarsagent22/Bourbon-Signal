"""Labeled offline dark-background contact sheet; maximum 50 local derivatives."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw
from prepare import external_output, load_local, atomic_bytes, write_json

BACKGROUND = (15, 17, 21)

def contact_sheet(rows, output):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 50:
        raise ValueError('contact sheet requires 1..50 rows; split batches explicitly')
    output = external_output(output)
    if output.suffix.lower() != '.png':
        raise ValueError('contact sheet output must be PNG')
    ids = set(); references = []
    columns = min(5, len(rows))
    canvas = Image.new('RGB', (columns * 220, ((len(rows)+columns-1)//columns)*360), BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'].strip() or row['id'] in ids:
            raise ValueError('each contact sheet item needs a unique exact ID')
        ids.add(row['id'])
        if not isinstance(row.get('sourcePage'), str) or not row['sourcePage'].strip():
            raise ValueError('source-page reference required')
        if Path(row['path']).resolve() == output:
            raise ValueError('output must not overwrite source')
        image, sha = load_local(row['path'])
        if image.size != (400,600):
            raise ValueError('contact sheet accepts only 400x600 derivatives')
        image.thumbnail((200,300), Image.Resampling.LANCZOS)
        x, y = (index % columns)*220, (index//columns)*360
        canvas.paste(image,(x+10,y+8),image)
        # Numbered source refs avoid squeezing private URLs onto the image.
        label = row['id'].encode('ascii','backslashreplace').decode('ascii')
        draw.text((x+8,y+310), f'{index+1}. {label[:29]}', fill=(232,232,232))
        draw.text((x+8,y+326), label[29:60], fill=(232,232,232))
        draw.text((x+8,y+342), f'Source ref {index+1} / UNREVIEWED', fill=(170,170,170))
        references.append({'number': index+1, 'id':row['id'], 'sourcePage':row['sourcePage'], 'sha256':sha})
    buffer = io.BytesIO(); canvas.save(buffer,format='PNG',compress_level=9)
    data = buffer.getvalue(); atomic_bytes(output,data)
    return {'count':len(rows), 'sha256':hashlib.sha256(data).hexdigest(), 'references':references,
            'background':list(BACKGROUND), 'status':'unreviewed', 'rightsStatus':'unverified'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest'); parser.add_argument('output'); parser.add_argument('report')
    args = parser.parse_args()
    if len({Path(p).resolve() for p in [args.manifest,args.output,args.report]}) != 3:
        parser.error('manifest, output and report must be distinct')
    external_output(args.output); external_output(args.report)
    rows = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    if any(Path(row['path']).resolve() == Path(args.report).resolve() for row in rows):
        parser.error('report must not overwrite a source')
    result = contact_sheet(rows,args.output); write_json(args.report,result)
    print(json.dumps({'count': result['count'], 'sha256':result['sha256']}))

if __name__ == '__main__': main()
