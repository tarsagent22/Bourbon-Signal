import json
import re
import subprocess
from pathlib import Path
from export_hermes_jobs import CONFIG, LIVE_JOBS, read_timezone, reasoning_for, safety_hash

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_PATH = ROOT / "automation" / "bourbon-signal" / "hermes-jobs.json"

result = subprocess.run(["hermes", "cron", "list"], cwd=ROOT, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=60)
if result.returncode != 0:
    print(f"Hermes scheduler reconciliation failed: {result.stderr.strip() or result.returncode}")
    raise SystemExit(1)

jobs = {}
current = None
for line in result.stdout.splitlines():
    match = re.match(r"^\s{2}([0-9a-f]{12}) \[(active|paused)\]$", line)
    if match:
        current = {"jobId": match.group(1), "active": match.group(2) == "active", "noAgent": False, "script": None}
        jobs[current["jobId"]] = current
        continue
    if not current:
        continue
    field = re.match(r"^\s{4}(Name|Schedule|Deliver|Script|Mode|Workdir):\s+(.*)$", line)
    if not field:
        continue
    key, value = field.groups()
    if key == "Name": current["name"] = value.strip()
    elif key == "Schedule": current["schedule"] = value.strip()
    elif key == "Deliver": current["deliver"] = value.strip()
    elif key == "Script": current["script"] = value.strip()
    elif key == "Mode": current["noAgent"] = "no-agent" in value.lower()
    elif key == "Workdir": current["workdir"] = value.strip()

expected_payload = json.loads(EXPECTED_PATH.read_text(encoding="utf-8"))
expected = expected_payload["jobs"]
expected_by_id = {job["jobId"]: job for job in expected}
failures = []
config_text = CONFIG.read_text(encoding="utf-8")
live_timezone = read_timezone(config_text)
if live_timezone != expected_payload.get("timezone"):
    failures.append(f"timezone: live={live_timezone!r} expected={expected_payload.get('timezone')!r}")
raw_jobs = json.loads(LIVE_JOBS.read_text(encoding="utf-8")).get("jobs", [])
raw_by_id = {job.get("id"): job for job in raw_jobs}
if set(jobs) != set(expected_by_id):
    failures.append(f"job IDs differ: live={sorted(jobs)} expected={sorted(expected_by_id)}")
for job_id, wanted in expected_by_id.items():
    live = jobs.get(job_id)
    if not live:
        continue
    for key in ["active", "schedule", "deliver", "noAgent", "script", "workdir"]:
        if live.get(key) != wanted.get(key):
            failures.append(f"{job_id} {key}: live={live.get(key)!r} expected={wanted.get(key)!r}")
    raw = raw_by_id.get(job_id, {})
    no_agent = bool(wanted.get("noAgent"))
    actual_model = None if no_agent else raw.get("model")
    actual_provider = None if no_agent else raw.get("provider")
    for key, actual in [
        ("provider", actual_provider),
        ("model", actual_model),
        ("reasoning", reasoning_for(actual_model, config_text)),
        ("safetyHash", safety_hash(raw)),
    ]:
        if actual != wanted.get(key):
            failures.append(f"{job_id} {key}: live={actual!r} expected={wanted.get(key)!r}")
if failures:
    print("Hermes scheduler drift detected: " + "; ".join(failures))
    raise SystemExit(1)
