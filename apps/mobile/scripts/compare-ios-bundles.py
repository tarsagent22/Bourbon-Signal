"""Compare macOS-embedded JS with exact Windows-published incident artifacts.

This diagnoses bundle startup only. Process survival does NOT establish auth or
Home functionality; review every native screenshot and log separately.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

base = Path('native-evidence').resolve()
app = base / 'build/Build/Products/Release-iphonesimulator/BourbonSignal.app'
bundle = app / 'main.jsbundle'
original = bundle.read_bytes()
results = {}
try:
    for scenario in ('embedded', 'home-radar', 'atmosphere'):
        content = original if scenario == 'embedded' else (base / 'bundles' / f'{scenario}.hbc').read_bytes()
        if len(content) < 100000:
            raise RuntimeError(f'{scenario}: missing or invalid bundle')
        bundle.write_bytes(content)
        result = subprocess.run([sys.executable, 'scripts/verify-ios-startup.py'], env={**os.environ, 'NATIVE_SCENARIO': scenario})
        results[scenario] = result.returncode
finally:
    bundle.write_bytes(original)
    (base / 'bundle-comparison.json').write_text(json.dumps(results, indent=2))
if len(results) != 3 or any(results.values()):
    raise RuntimeError('At least one native bundle startup failed; inspect per-scenario logs')
