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
AUTONOMOUS_PROFILE_CONFIG = HERMES_HOME / "profiles" / "bourbonbot" / "config.yaml"
AUTONOMOUS_OPERATOR_SCRIPT = "bourbon_signal_autonomous_operator.py"
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
    override = re.search(rf"(?m)^\s{{4}}{re.escape(model)}:\s*([^#\n]+)", config_text)
    if override:
        return override.group(1).strip().strip("'\"")
    configured = re.search(r"(?m)^\s{2}reasoning_effort:\s*([^#\n]+)", config_text)
    return configured.group(1).strip().strip("'\"") if configured else None


def profile_model(config_text: str) -> tuple[str | None, str | None]:
    model = re.search(r"(?m)^\s{2}default:\s*([^#\n]+)", config_text)
    provider = re.search(r"(?m)^\s{2}provider:\s*([^#\n]+)", config_text)
    clean = lambda match: match.group(1).strip().strip("'\"") if match else None
    return clean(model), clean(provider)


def profile_wrapper_safety_hash(root: Path, config_text: str) -> str:
    model, provider = profile_model(config_text)
    files = [
        root / "automation" / "bourbon-signal" / "hermes-scripts" / AUTONOMOUS_OPERATOR_SCRIPT,
        root / "automation" / "bourbon-signal" / "hermes-scripts" / "bourbon_signal_runtime.py",
        root / "automation" / "bourbon-signal" / "autonomous-operator-prompt.md",
        root / "automation" / "bourbon-signal" / "operator-outcomes.mjs",
        root / "automation" / "bourbon-signal" / "operator-run.schema.json",
        root / "scripts" / "operator-objective.mjs",
        root / "scripts" / "lib" / "operator-policy.mjs",
    ]
    cron_mode_match = re.search(r"(?m)^\s{2}cron_mode:\s*([^#\n]+)", config_text)
    cron_mode = cron_mode_match.group(1).strip().strip("'\"") if cron_mode_match else None
    payload = {
        "profile": "bourbonbot",
        "model": model,
        "provider": provider,
        "reasoning": reasoning_for(model, config_text),
        "cronMode": cron_mode,
        "files": {str(file.relative_to(root)).replace("\\", "/"): hashlib.sha256(file.read_bytes()).hexdigest() for file in files},
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


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
    autonomous_config_text = AUTONOMOUS_PROFILE_CONFIG.read_text(encoding="utf-8") if AUTONOMOUS_PROFILE_CONFIG.is_file() else ""
    autonomous_model, autonomous_provider = profile_model(autonomous_config_text)
    jobs = []
    for job in live.get("jobs", []):
        if job.get("workdir") != REPO_WORKDIR or not str(job.get("name", "")).startswith("Bourbon Signal"):
            continue
        no_agent = bool(job.get("no_agent"))
        profile_wrapped = job.get("script") == AUTONOMOUS_OPERATOR_SCRIPT
        model = autonomous_model if profile_wrapped else None if no_agent else job.get("model")
        provider = autonomous_provider if profile_wrapped else None if no_agent else job.get("provider")
        reasoning = reasoning_for(model, autonomous_config_text if profile_wrapped else config_text)
        jobs.append({
            "jobId": job["id"],
            "name": job["name"],
            "schedule": schedule_display(job),
            "deliver": job.get("deliver", "local"),
            "noAgent": no_agent,
            "script": job.get("script"),
            "workdir": job.get("workdir"),
            "active": bool(job.get("enabled")) and job.get("state") != "paused",
            "provider": provider,
            "model": model,
            "reasoning": reasoning,
            "safetyHash": safety_hash(job),
            "profileSafetyHash": profile_wrapper_safety_hash(ROOT, autonomous_config_text) if profile_wrapped else None,
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
