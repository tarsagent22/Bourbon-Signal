import os
import subprocess
from pathlib import Path

repo = Path(os.environ.get("BOURBON_SIGNAL_REPO", Path.cwd())).resolve()
result = subprocess.run(
    ["python", str(repo / "scripts" / "reconcile_hermes_jobs.py")],
    cwd=repo, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=90,
)
if result.stdout.strip():
    print(result.stdout.strip())
if result.returncode != 0:
    if result.stderr.strip():
        print(result.stderr.strip())
    raise SystemExit(result.returncode)
