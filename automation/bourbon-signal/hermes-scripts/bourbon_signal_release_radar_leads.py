import json
import subprocess

from bourbon_signal_runtime import failure_summary, load_env, nc_radar_change_summary, release_radar_change_summary, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
SCRIPT = REPO / "automation" / "bourbon-signal" / "release-radar-lead-collector.mjs"
NC_MONITOR = REPO / "automation" / "bourbon-signal" / "nc-release-radar-monitor.mts"

monitor = subprocess.run(
    ["node", "--experimental-strip-types", str(NC_MONITOR), "--apply", "--print"],
    cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=360, check=False,
)
if monitor.returncode != 0:
    print(f"NC Release Radar monitor failed: {failure_summary(monitor.stderr, monitor.stdout)}")
    raise SystemExit(monitor.returncode)
try:
    monitor_report = json.loads(monitor.stdout)
    monitor_summary = nc_radar_change_summary(monitor_report)
    if monitor_summary:
        print(monitor_summary)
except (json.JSONDecodeError, TypeError, ValueError):
    print("NC Release Radar monitor failed: invalid report output")
    raise SystemExit(1)

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
