import json
import subprocess

from bourbon_signal_runtime import failure_summary, load_env, release_radar_change_summary, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
SCRIPT = REPO / "automation" / "bourbon-signal" / "release-radar-lead-collector.mjs"

result = subprocess.run(
    ["node", str(SCRIPT), "--execute", "--apply", "--print"],
    cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=300, check=False,
)
if result.returncode != 0:
    print(f"Release Radar lead collector failed: {failure_summary(result.stderr, result.stdout)}")
    raise SystemExit(result.returncode)
try:
    report = json.loads(result.stdout)
    summary = release_radar_change_summary(report)
    if summary:
        print(summary)
except (json.JSONDecodeError, TypeError, ValueError):
    print("Release Radar lead collector failed: invalid report output")
    raise SystemExit(1)
