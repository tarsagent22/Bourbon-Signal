import hashlib
import json
import os
import re
import shutil
import subprocess
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg

from bourbon_signal_runtime import load_env


COMPLETION_LANE_NAME = "Bourbon Signal coverage request completion lane"
ACTIVE_TASK_STATUSES = {"todo", "ready", "running", "blocked", "scheduled", "done"}
REQUEST_ID_PATTERN = re.compile(r"^[a-f0-9-]{16,80}$")
STATE_PATTERN = re.compile(r"^[A-Z]{2}$")
AREA_KEY_PATTERN = re.compile(r"^[a-z0-9:-]{1,80}$")
STORE_ID_PATTERN = re.compile(r"^[a-z0-9:-]{1,160}$")


def parse_datetime(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def timestamp_iso(value: object) -> str | None:
    try:
        timestamp = float(value)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def summarize_scheduler() -> dict:
    hermes_home = Path(os.getenv("HERMES_HOME") or (Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "hermes"))
    try:
        payload = json.loads((hermes_home / "cron" / "jobs.json").read_text(encoding="utf-8"))
        rows = payload.get("jobs", []) if isinstance(payload, dict) else []
        jobs = [row for row in rows if isinstance(row, dict) and str(row.get("name") or "").startswith("Bourbon Signal") and row.get("enabled") is not False]
        failing = sorted(str(row.get("name")) for row in jobs if str(row.get("last_status") or "").lower() in {"failed", "error"})
        lane = next((row for row in rows if isinstance(row, dict) and str(row.get("name") or "") == COMPLETION_LANE_NAME), None)
        enabled = bool(lane and lane.get("enabled") is not False)
        last_status = str((lane or {}).get("last_status") or "").lower() or None
        last_run_at = parse_datetime((lane or {}).get("last_run_at"))
        age = datetime.now(timezone.utc) - last_run_at.astimezone(timezone.utc) if last_run_at else None
        fresh = bool(
            enabled
            and last_status == "ok"
            and last_run_at
            and timedelta(0) <= age <= timedelta(minutes=45)
        )
        return {
            "activeJobs": len(jobs),
            "failingJobs": failing,
            "coverageCompletionLane": {
                "enabled": enabled,
                "lastStatus": last_status,
                "lastRunAt": last_run_at.isoformat() if last_run_at else None,
                "fresh": fresh,
            },
        }
    except Exception:
        return {
            "activeJobs": None,
            "failingJobs": ["scheduler_status_unavailable"],
            "coverageCompletionLane": {"enabled": False, "lastStatus": None, "lastRunAt": None, "fresh": False},
        }


def query_payload(database_url: str) -> dict:
    request_query = """
        SELECT target_type, state_code, area_label, store_name, status, requested_at, updated_at
        FROM coverage_requests
        WHERE status IN ('requested', 'on_radar')
        ORDER BY updated_at DESC
        LIMIT 200
    """
    automation_query = """
        SELECT status, COUNT(*)::int
        FROM coverage_request_automation_jobs
        WHERE status NOT IN ('notified', 'failed')
        GROUP BY status
        ORDER BY status
    """
    with psycopg.connect(database_url, connect_timeout=20) as connection:
        with connection.cursor() as cursor:
            cursor.execute(request_query)
            rows = cursor.fetchall()
            cursor.execute(automation_query)
            automation_rows = cursor.fetchall()
    requests = [{
        "targetType": row[0], "stateCode": row[1], "areaLabel": row[2], "storeName": row[3],
        "status": row[4], "requestedAt": row[5].isoformat() if row[5] else None,
        "updatedAt": row[6].isoformat() if row[6] else None,
    } for row in rows]
    automation_statuses = {str(status): int(count) for status, count in automation_rows}
    health = summarize_scheduler()
    health["activeAutomationStatuses"] = automation_statuses
    return {
        "contractVersion": "bourbon-signal/active-coverage-requests@2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "production_database",
        "count": len(requests),
        "requests": requests,
        "automationHealth": health,
    }


def body_field(body: object, label: str) -> str | None:
    match = re.search(rf"^- {re.escape(label)}:\s*(.+?)\s*$", str(body or ""), flags=re.MULTILINE | re.IGNORECASE)
    if not match:
        return None
    value = match.group(1).strip()
    return None if value.casefold() in {"none", "null", "n/a"} else value


def authority_directory() -> Path:
    root = os.getenv("HERMES_HOME") or (Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "hermes")
    return Path(root) / "automation" / "coverage-authority"


def has_authority(job_key: str, task_id: object) -> bool:
    path = authority_directory() / f"{hashlib.sha256(job_key.encode('utf-8')).hexdigest()}.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return False
    capability = payload.get("authorityCapability")
    return (
        payload.get("jobKey") == job_key
        and payload.get("taskId") == task_id
        and isinstance(task_id, str)
        and bool(re.fullmatch(r"t_[a-zA-Z0-9]+", task_id))
        and isinstance(capability, str)
        and bool(re.fullmatch(r"[a-zA-Z0-9_-]{43}", capability))
    )


def query_kanban_mirror() -> dict:
    health = summarize_scheduler()
    lane = health.get("coverageCompletionLane") or {}
    if not lane.get("enabled") or not lane.get("fresh"):
        raise RuntimeError("Coverage completion lane is not healthy and recent; active request visibility is uncertain.")
    hermes = shutil.which("hermes.exe") or shutil.which("hermes")
    if not hermes:
        raise RuntimeError("Hermes CLI is unavailable for the signed coverage request mirror.")
    result = subprocess.run(
        [hermes, "kanban", "--board", "bourbon-signal-coverage", "list", "--json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "Coverage task mirror failed.").strip().splitlines()[-1])
    try:
        tasks = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("Coverage task mirror returned invalid JSON.") from error
    if not isinstance(tasks, list) or not all(isinstance(task, dict) for task in tasks):
        raise RuntimeError("Coverage task mirror returned an invalid task collection.")

    by_request: dict[str, dict] = {}
    statuses: Counter[str] = Counter()
    for task in tasks:
        if task.get("created_by") != "coverage-request-automation":
            continue
        status = str(task.get("status") or "").lower()
        if status not in ACTIVE_TASK_STATUSES:
            continue
        job_key = body_field(task.get("body"), "Job key")
        if not job_key or not has_authority(job_key, task.get("id")):
            continue
        request_id = body_field(task.get("body"), "Request ID")
        target_type = body_field(task.get("body"), "Target type")
        state_code = body_field(task.get("body"), "State")
        area_key = body_field(task.get("body"), "Area key")
        store_id = body_field(task.get("body"), "Store ID")
        canonical_target = body_field(task.get("body"), "Canonical target")
        expected_canonical = (
            f"state:{state_code}" if target_type == "state"
            else f"{target_type}:{state_code}:{area_key}" if target_type in {"county", "city"} and area_key
            else f"store:{state_code}:{store_id}" if target_type == "store" and store_id
            else None
        )
        valid_shape = (
            bool(request_id and REQUEST_ID_PATTERN.fullmatch(request_id))
            and bool(state_code and STATE_PATTERN.fullmatch(state_code))
            and target_type in {"state", "county", "city", "store"}
            and (
                target_type == "state"
                or target_type in {"county", "city"} and bool(area_key and AREA_KEY_PATTERN.fullmatch(area_key))
                or target_type == "store" and bool(store_id and STORE_ID_PATTERN.fullmatch(store_id))
            )
            and canonical_target == expected_canonical
        )
        if not valid_shape:
            raise RuntimeError(f"Coverage task {task.get('id') or 'unknown'} has malformed authenticated request metadata.")
        created_at = task.get("created_at")
        updated_at = max(
            [value for value in (task.get("started_at"), task.get("created_at")) if isinstance(value, (int, float))],
            default=created_at,
        )
        row = {
            "targetType": target_type,
            "stateCode": state_code,
            "areaLabel": None,
            "storeName": None,
            "status": "on_radar",
            "requestedAt": timestamp_iso(created_at),
            "updatedAt": timestamp_iso(updated_at),
        }
        existing = by_request.get(request_id)
        if not existing or (row["updatedAt"] or "") > (existing["updatedAt"] or ""):
            by_request[request_id] = row
        statuses[status] += 1
    requests = sorted(by_request.values(), key=lambda row: row.get("updatedAt") or "", reverse=True)
    health["activeAutomationStatuses"] = dict(sorted(statuses.items()))
    return {
        "contractVersion": "bourbon-signal/active-coverage-requests@2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "signed_kanban_mirror",
        "count": len(requests),
        "requests": requests,
        "automationHealth": health,
    }


def main() -> None:
    environment = load_env()
    database_url = environment.get("BOURBON_QUEUE_DATABASE_URL") or environment.get("BOURBON_QUEUE_DATABASE_URL_UNPOOLED") or environment.get("DATABASE_URL")
    payload = query_payload(database_url) if database_url else query_kanban_mirror()
    print(json.dumps(payload, separators=(",", ":")))


if __name__ == "__main__":
    main()
