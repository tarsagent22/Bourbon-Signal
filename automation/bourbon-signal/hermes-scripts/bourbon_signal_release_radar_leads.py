import json
import subprocess

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo

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
    new_count = int(report.get("summary", {}).get("new", 0))
    if new_count:
        total = int(report.get("summary", {}).get("total", new_count))
        print(f"Release Radar lead collector: {new_count} unverified leads require review ({total} retained); nothing was published or alerted.")
except (json.JSONDecodeError, TypeError, ValueError):
    print("Release Radar lead collector failed: invalid report output")
    raise SystemExit(1)
