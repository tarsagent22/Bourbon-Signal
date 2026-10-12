"""Run the installed dispatcher with the owner's automatic completion policy."""
import os
from pathlib import Path
import subprocess
import sys

env = os.environ.copy()
env['BOURBON_SIGNAL_COVERAGE_MODE'] = 'guarded_release'
home = Path(env.get('HERMES_HOME') or (Path.home() / 'AppData' / 'Local' / 'hermes' if os.name == 'nt' else Path.home() / '.hermes'))
script = home / 'automation' / 'coverage-request-agent.mjs'
if not script.is_file():
    raise SystemExit('The installed coverage completion dispatcher is missing.')
result = subprocess.run(['node', str(script)], env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
if result.stdout.strip():
    print(result.stdout.strip())
if result.returncode:
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    raise SystemExit(result.returncode)
