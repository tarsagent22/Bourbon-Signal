"""Fetch incident assets using short-lived EAS-authorized requests, not public CDN guesses."""
import base64
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess

rows = json.loads(os.environ['NATIVE_INCIDENT_ASSETS'])
if sorted(row['name'] for row in rows) != ['atmosphere', 'home-radar']:
    raise RuntimeError('Expected exactly the two incident bundles')
folder = Path('native-evidence/bundles')
folder.mkdir(parents=True, exist_ok=True)
for row in rows:
    if not row['url'].startswith('https://assets.eascdn.net/'):
        raise RuntimeError('Unexpected asset host')
    config = 'url = ' + json.dumps(row['url']) + '\n'
    config += ''.join('header = ' + json.dumps(key + ': ' + value) + '\n' for key, value in (row.get('headers') or {}).items())
    target = folder / (row['name'] + '.hbc')
    subprocess.run(['curl', '--config', '-', '--fail', '--compressed', '--silent', '--show-error', '--output', str(target)], input=config, text=True, check=True)
    content = target.read_bytes()
    digest = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).decode().rstrip('=')
    if digest != row['sha256']:
        raise RuntimeError('Downloaded bundle does not match its published manifest hash')
    print(row['name'], len(content), 'bytes; manifest hash verified; Hermes bytecode', struct.unpack('<I', content[8:12])[0])
