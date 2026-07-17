import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "automation" / "bourbon-signal" / "hermes-jobs.json"
HERMES_HOME = Path(os.environ.get("HERMES_HOME") or (Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "hermes"))
LIVE_JOBS = HERMES_HOME / "cron" / "jobs.json"
CONFIG = HERMES_HOME / "config.yaml"
REPO_WORKDIR = str(ROOT)


def read_timezone(config_text: str, env: dict[str, str] | None = None) -> str:
    source_env = os.environ if env is None else env
    configured_env = source_env.get("HERMES_TIMEZONE", "").strip()
    if configured_env:
        return configured_env
    match = re.search(r"(?m)^timezone:\s*([^#\n]+)", config_text)
    return match.group(1).strip().strip("'\"") if match else ""


def reasoning_for(model: str | None, config_text: str) -> str | None:
    if not model:
        return None
    match = re.search(rf"(?m)^\s{{4}}{re.escape(model)}:\s*([^#\n]+)", config_text)
    return match.group(1).strip().strip("'\"") if match else None


def safety_hash(job: dict) -> str | None:
    if job.get("no_agent"):
        return None
    contract = {
        "prompt": job.get("prompt") or "",
        "skills": job.get("skills") or ([job["skill"]] if job.get("skill") else []),
        "enabled_toolsets": job.get("enabled_toolsets") or [],
    }
    payload = json.dumps(contract, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def schedule_display(job: dict) -> str:
    schedule = job.get("schedule") or {}
    if schedule.get("kind") == "cron":
        return str(schedule.get("expr") or schedule.get("display") or "")
    if schedule.get("kind") == "interval":
        return f"every {int(schedule.get('minutes') or 0)}m"
    return str(job.get("schedule_display") or "")


def main() -> None:
    live = json.loads(LIVE_JOBS.read_text(encoding="utf-8"))
    config_text = CONFIG.read_text(encoding="utf-8")
    jobs = []
    for job in live.get("jobs", []):
        if job.get("workdir") != REPO_WORKDIR or not str(job.get("name", "")).startswith("Bourbon Signal"):
            continue
        no_agent = bool(job.get("no_agent"))
        model = None if no_agent else job.get("model")
        jobs.append({
            "jobId": job["id"],
            "name": job["name"],
            "schedule": schedule_display(job),
            "deliver": job.get("deliver", "local"),
            "noAgent": no_agent,
            "script": job.get("script"),
            "workdir": job.get("workdir"),
            "active": bool(job.get("enabled")) and job.get("state") != "paused",
            "provider": None if no_agent else job.get("provider"),
            "model": model,
            "reasoning": reasoning_for(model, config_text),
            "safetyHash": safety_hash(job),
        })
    payload = {
        "schemaVersion": 2,
        "exportedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "Hermes scheduler and config sanitized export",
        "timezone": read_timezone(config_text),
        "jobs": jobs,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(jobs)} Bourbon Signal jobs in {payload['timezone']}.")


if __name__ == "__main__":
    main()
