import json
import re
import subprocess
from pathlib import Path
from lib.hermes_job_registry import classify_job_ids
from export_hermes_jobs import (
    AUTONOMOUS_OPERATOR_SCRIPT,
    AUTONOMOUS_PROFILE_CONFIG,
    CONFIG,
    LIVE_JOBS,
    profile_model,
    profile_wrapper_safety_hash,
    read_timezone,
    reasoning_for,
    safety_hash,
)

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
autonomous_config_text = AUTONOMOUS_PROFILE_CONFIG.read_text(encoding="utf-8") if AUTONOMOUS_PROFILE_CONFIG.is_file() else ""
autonomous_model, autonomous_provider = profile_model(autonomous_config_text)
live_timezone = read_timezone(config_text)
if live_timezone != expected_payload.get("timezone"):
    failures.append(f"timezone: live={live_timezone!r} expected={expected_payload.get('timezone')!r}")
raw_jobs = json.loads(LIVE_JOBS.read_text(encoding="utf-8")).get("jobs", [])
raw_by_id = {job.get("id"): job for job in raw_jobs}
managed_workdirs = {str(job.get("workdir") or "").casefold() for job in expected if job.get("workdir")}
managed_jobs = {job_id: job for job_id, job in jobs.items() if str(job.get("workdir") or "").casefold() in managed_workdirs}
id_classification = classify_job_ids(managed_jobs, expected_by_id)
if id_classification["missing"] or id_classification["unexpected"]:
    failures.append(f"job IDs differ: missing={id_classification['missing']} unexpected={id_classification['unexpected']}")
for job_id, wanted in expected_by_id.items():
    live = jobs.get(job_id)
    if not live:
        continue
    for key in ["active", "schedule", "deliver", "noAgent", "script", "workdir"]:
        if live.get(key) != wanted.get(key):
            failures.append(f"{job_id} {key}: live={live.get(key)!r} expected={wanted.get(key)!r}")
    raw = raw_by_id.get(job_id, {})
    no_agent = bool(wanted.get("noAgent"))
    profile_wrapped = wanted.get("script") == AUTONOMOUS_OPERATOR_SCRIPT
    actual_model = autonomous_model if profile_wrapped else None if no_agent else raw.get("model")
    actual_provider = autonomous_provider if profile_wrapped else None if no_agent else raw.get("provider")
    reasoning_config = autonomous_config_text if profile_wrapped else config_text
    for key, actual in [
        ("provider", actual_provider),
        ("model", actual_model),
        ("reasoning", reasoning_for(actual_model, reasoning_config)),
        ("safetyHash", safety_hash(raw)),
        ("profileSafetyHash", profile_wrapper_safety_hash(Path(live["workdir"]), autonomous_config_text, LIVE_JOBS.parent.parent / "scripts") if profile_wrapped else None),
    ]:
        if actual != wanted.get(key):
            failures.append(f"{job_id} {key}: live={actual!r} expected={wanted.get(key)!r}")
if failures:
    print("Hermes scheduler drift detected: " + "; ".join(failures))
    raise SystemExit(1)
