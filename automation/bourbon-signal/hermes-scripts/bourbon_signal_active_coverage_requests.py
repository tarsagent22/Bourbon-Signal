import json
import os
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg

from bourbon_signal_runtime import load_env, resolve_repo


def summarize_scheduler() -> dict:
    hermes_home = Path(os.getenv("HERMES_HOME") or (Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "hermes"))
    try:
        payload = json.loads((hermes_home / "cron" / "jobs.json").read_text(encoding="utf-8"))
        rows = payload.get("jobs", []) if isinstance(payload, dict) else []
        jobs = [row for row in rows if str(row.get("name") or "").startswith("Bourbon Signal") and row.get("enabled") is not False]
        failing = sorted(str(row.get("name")) for row in jobs if str(row.get("last_status") or "").lower() in {"failed", "error"})
        return {"activeJobs": len(jobs), "failingJobs": failing}
    except Exception:
        return {"activeJobs": None, "failingJobs": ["scheduler_status_unavailable"]}


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


def main() -> None:
    environment = load_env()
    database_url = environment.get("BOURBON_QUEUE_DATABASE_URL") or environment.get("BOURBON_QUEUE_DATABASE_URL_UNPOOLED") or environment.get("DATABASE_URL")
    if database_url:
        print(json.dumps(query_payload(database_url), separators=(",", ":")))
        return
    if "--production-env" in sys.argv:
        raise RuntimeError("Coverage request storage is not configured inside the production environment.")
    repo = resolve_repo(environment)
    vercel = shutil.which("vercel.cmd") or shutil.which("vercel")
    if not vercel:
        raise RuntimeError("Vercel CLI is unavailable for the read-only coverage brief.")
    result = subprocess.run(
        [vercel, "env", "run", "-e", "production", "--", sys.executable, str(Path(__file__).resolve()), "--production-env"],
        cwd=str(repo), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "Coverage brief failed.").strip().splitlines()[-1])
    print(result.stdout.strip())


if __name__ == "__main__":
    main()
