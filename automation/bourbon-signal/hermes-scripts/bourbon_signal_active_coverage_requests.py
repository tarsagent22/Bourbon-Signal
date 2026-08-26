import http.client
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from bourbon_signal_runtime import load_env


COMPLETION_LANE_NAME = "Bourbon Signal coverage request completion lane"
PRODUCTION_HOST = "www.bourbonsignal.com"
PRODUCTION_PATH = "/api/ops/active-coverage-requests"
MAX_RESPONSE_BYTES = 1_000_000
REQUEST_KEYS = {"targetType", "stateCode", "areaLabel", "storeName", "status", "requestedAt", "updatedAt"}
PAYLOAD_KEYS = {"contractVersion", "generatedAt", "source", "count", "requests", "automationHealth"}
TARGET_TYPES = {"state", "county", "city", "store"}
STATE_PATTERN = re.compile(r"^[A-Z]{2}$")


def parse_datetime(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def parse_api_datetime(value: object) -> datetime | None:
    text = str(value or "").strip()
    if "T" not in text or not (text.endswith("Z") or re.search(r"[+-]\d{2}:\d{2}$", text)):
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def summarize_scheduler() -> dict:
    home = Path(os.getenv("HERMES_HOME") or (Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "hermes"))
    try:
        payload = json.loads((home / "cron" / "jobs.json").read_text(encoding="utf-8"))
        rows = payload.get("jobs", []) if isinstance(payload, dict) else []
        jobs = [row for row in rows if isinstance(row, dict) and str(row.get("name") or "").startswith("Bourbon Signal") and row.get("enabled") is not False]
        failing = sorted(str(row.get("name")) for row in jobs if str(row.get("last_status") or "").lower() in {"failed", "error"})
        lane = next((row for row in rows if isinstance(row, dict) and str(row.get("name") or "") == COMPLETION_LANE_NAME), None)
        enabled = bool(lane and lane.get("enabled") is not False)
        last_status = str((lane or {}).get("last_status") or "").lower() or None
        last_run_at = parse_datetime((lane or {}).get("last_run_at"))
        age = datetime.now(timezone.utc) - last_run_at.astimezone(timezone.utc) if last_run_at else None
        fresh = bool(enabled and last_status == "ok" and last_run_at and timedelta(0) <= age <= timedelta(minutes=45))
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


def validate_payload(payload: object, now: datetime | None = None) -> dict:
    if not isinstance(payload, dict) or set(payload) != PAYLOAD_KEYS or payload.get("contractVersion") != "bourbon-signal/active-coverage-requests@2":
        raise RuntimeError("Active coverage read API returned an invalid contract.")
    current = now or datetime.now(timezone.utc)
    generated_at = parse_api_datetime(payload.get("generatedAt"))
    requests = payload.get("requests")
    health = payload.get("automationHealth")
    statuses = health.get("activeAutomationStatuses") if isinstance(health, dict) else None
    valid_shape = (
        payload.get("source") == "production_read_api"
        and generated_at is not None
        and -timedelta(minutes=5) <= current - generated_at.astimezone(timezone.utc) <= timedelta(hours=36)
        and isinstance(requests, list)
        and len(requests) <= 200
        and type(payload.get("count")) is int
        and payload.get("count") == len(requests)
        and isinstance(statuses, dict)
        and set(health) == {"activeAutomationStatuses"}
        and all(re.fullmatch(r"[a-z_]{2,40}", key) and type(value) is int and value >= 0 for key, value in statuses.items())
    )
    if not valid_shape:
        raise RuntimeError("Active coverage read API returned an invalid payload.")
    for request in requests:
        if not isinstance(request, dict) or set(request) != REQUEST_KEYS:
            raise RuntimeError("Active coverage read API returned an invalid request row.")
        if request.get("status") not in {"requested", "on_radar"}:
            raise RuntimeError("Active coverage read API returned a non-active request.")
        if request.get("targetType") not in TARGET_TYPES or not isinstance(request.get("stateCode"), str) or not STATE_PATTERN.fullmatch(request["stateCode"]):
            raise RuntimeError("Active coverage read API returned an invalid request target.")
        if any(value is not None and (not isinstance(value, str) or len(value) > 220) for value in (request.get("areaLabel"), request.get("storeName"))):
            raise RuntimeError("Active coverage read API returned an invalid request label.")
        requested_at = parse_api_datetime(request.get("requestedAt"))
        updated_at = parse_api_datetime(request.get("updatedAt"))
        if not requested_at or not updated_at or updated_at < requested_at or updated_at > generated_at:
            raise RuntimeError("Active coverage read API returned invalid request timestamps.")
    return {
        "contractVersion": payload["contractVersion"],
        "generatedAt": payload["generatedAt"],
        "source": payload["source"],
        "count": payload["count"],
        "requests": requests,
        "automationHealth": {"activeAutomationStatuses": dict(statuses)},
    }


def query_production_api(environment: dict[str, str], connection_factory=http.client.HTTPSConnection) -> dict:
    secret = str(environment.get("COMPANY_SCORECARD_READ_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("The dedicated production read secret is unavailable.")
    connection = connection_factory(PRODUCTION_HOST, timeout=30)
    try:
        connection.request("GET", PRODUCTION_PATH, headers={
            "Authorization": f"Bearer {secret}",
            "Accept": "application/json",
            "User-Agent": "BourbonSignal-daily-brief/3.0",
        })
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"Active coverage read API returned HTTP {response.status}.")
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise RuntimeError("Active coverage read API response exceeded its size limit.")
        try:
            payload = validate_payload(json.loads(raw))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise RuntimeError("Active coverage read API returned invalid JSON.") from error
    finally:
        connection.close()
    scheduler = summarize_scheduler()
    scheduler["activeAutomationStatuses"] = payload["automationHealth"]["activeAutomationStatuses"]
    return {
        "contractVersion": payload["contractVersion"],
        "generatedAt": payload["generatedAt"],
        "source": payload["source"],
        "count": payload["count"],
        "requests": payload["requests"],
        "automationHealth": scheduler,
    }


def main() -> None:
    print(json.dumps(query_production_api(load_env()), separators=(",", ":")))


if __name__ == "__main__":
    main()
