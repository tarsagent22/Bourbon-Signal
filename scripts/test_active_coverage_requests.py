import contextlib
import hashlib
import importlib.util
import io
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

root = Path(__file__).resolve().parents[1]
target = root / "automation" / "bourbon-signal" / "hermes-scripts" / "bourbon_signal_active_coverage_requests.py"
agent = root / "automation" / "bourbon-signal" / "coverage-request-agent.mjs"
sys.path.insert(0, str(target.parent))
spec = importlib.util.spec_from_file_location("active_coverage_requests", target)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)

healthy = {
    "activeJobs": 5,
    "failingJobs": [],
    "coverageCompletionLane": {
        "enabled": True,
        "lastStatus": "ok",
        "lastRunAt": "2026-08-20T13:30:00-04:00",
        "fresh": True,
    },
}

ny_job = "coverage-request:ed2ffdd8-b47f-4de9-9b67-506687a604f8:0123456789abcdef"
county_job = "coverage-request:42c3f5fe-cb60-4df1-b827-9409c18d69fb:fedcba9876543210"
old_job = "coverage-request:b90c88cf-c978-4412-8b7b-cd2e6fc24436:142d3b04e2684305"

def body(job_key, request_id, target_type, state, area="none", store="none", canonical=None):
    canonical = canonical or (f"state:{state}" if target_type == "state" else f"{target_type}:{state}:{area if target_type != 'store' else store}")
    return "\n".join([
        "AUTHENTICATED REQUEST",
        f"- Job key: {job_key}",
        f"- Request ID: {request_id}",
        f"- Target type: {target_type}",
        f"- State: {state}",
        f"- Area key: {area}",
        f"- Store ID: {store}",
        f"- Canonical target: {canonical}",
    ])

tasks = [
    {
        "id": "t_ny",
        "title": "Coverage expansion: state:NY",
        "body": body(ny_job, "ed2ffdd8-b47f-4de9-9b67-506687a604f8", "state", "NY"),
        "created_by": "coverage-request-automation",
        "status": "done",
        "created_at": 1787244300,
        "started_at": 1787244310,
    },
    {
        "id": "t_county",
        "title": "Coverage expansion: county:MD:montgomery-county",
        "body": body(county_job, "42c3f5fe-cb60-4df1-b827-9409c18d69fb", "county", "MD", area="montgomery-county"),
        "created_by": "coverage-request-automation",
        "status": "blocked",
        "created_at": 1787244200,
        "started_at": 1787244210,
    },
    {
        "id": "t_terminal_without_authority",
        "title": "Coverage expansion: state:SC",
        "body": body(old_job, "b90c88cf-c978-4412-8b7b-cd2e6fc24436", "state", "SC"),
        "created_by": "coverage-request-automation",
        "status": "blocked",
        "created_at": 1787000000,
    },
    {
        "id": "t_forged",
        "title": "Coverage expansion: state:CA",
        "body": body(ny_job, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "state", "CA"),
        "created_by": "coverage-request-automation",
        "status": "running",
        "created_at": 1787244400,
    },
]

original_scheduler = module.summarize_scheduler
original_authority_directory = module.authority_directory
original_which = module.shutil.which
original_run = module.subprocess.run
try:
    with tempfile.TemporaryDirectory() as temp:
        authority = Path(temp)
        for job_key, task_id in ((ny_job, "t_ny"), (county_job, "t_county")):
            filename = hashlib.sha256(job_key.encode("utf-8")).hexdigest() + ".json"
            (authority / filename).write_text(json.dumps({
                "jobKey": job_key,
                "authorityCapability": "a" * 43,
                "taskId": task_id,
            }), encoding="utf-8")
        module.summarize_scheduler = lambda: healthy
        module.authority_directory = lambda: authority
        module.shutil.which = lambda name: "hermes" if name in {"hermes", "hermes.exe"} else None
        module.subprocess.run = lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout=json.dumps(tasks), stderr="")
        payload = module.query_kanban_mirror()
        assert payload["contractVersion"] == "bourbon-signal/active-coverage-requests@2"
        assert payload["source"] == "signed_kanban_mirror"
        assert payload["count"] == 2
        assert [row["targetType"] for row in payload["requests"]] == ["state", "county"]
        assert payload["requests"][0] == {
            "targetType": "state",
            "stateCode": "NY",
            "areaLabel": None,
            "storeName": None,
            "status": "on_radar",
            "requestedAt": "2026-08-20T16:45:00+00:00",
            "updatedAt": "2026-08-20T16:45:10+00:00",
        }
        assert payload["requests"][1]["areaLabel"] is None and payload["requests"][1]["storeName"] is None
        assert payload["automationHealth"]["activeAutomationStatuses"] == {"blocked": 1, "done": 1}
        serialized = json.dumps(payload)
        assert "ed2ffdd8" not in serialized and "coverage-request:" not in serialized

        module.summarize_scheduler = lambda: {
            **healthy,
            "coverageCompletionLane": {**healthy["coverageCompletionLane"], "fresh": False},
        }
        try:
            module.query_kanban_mirror()
            raise AssertionError("stale completion lane must fail closed")
        except RuntimeError as error:
            assert "completion lane" in str(error).lower()
finally:
    module.summarize_scheduler = original_scheduler
    module.authority_directory = original_authority_directory
    module.shutil.which = original_which
    module.subprocess.run = original_run

with tempfile.TemporaryDirectory() as temp:
    cron = Path(temp) / "cron"
    cron.mkdir()
    (cron / "jobs.json").write_text(json.dumps({"jobs": [{
        "name": module.COMPLETION_LANE_NAME,
        "enabled": True,
        "last_status": "ok",
        "last_run_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
    }]}), encoding="utf-8")
    prior_home = os.environ.get("HERMES_HOME")
    os.environ["HERMES_HOME"] = temp
    try:
        assert module.summarize_scheduler()["coverageCompletionLane"]["fresh"] is False
    finally:
        if prior_home is None:
            os.environ.pop("HERMES_HOME", None)
        else:
            os.environ["HERMES_HOME"] = prior_home

original_load_env = module.load_env
original_query_payload = module.query_payload
original_query_mirror = module.query_kanban_mirror
try:
    module.load_env = lambda: {"DATABASE_URL": "postgres://configured"}
    module.query_payload = lambda url: {"source": "production_database", "databaseUrlWasConfigured": url == "postgres://configured"}
    module.query_kanban_mirror = lambda: (_ for _ in ()).throw(AssertionError("mirror must not run when database is configured"))
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        module.main()
    assert json.loads(output.getvalue()) == {"source": "production_database", "databaseUrlWasConfigured": True}
finally:
    module.load_env = original_load_env
    module.query_payload = original_query_payload
    module.query_kanban_mirror = original_query_mirror

source = target.read_text(encoding="utf-8")
agent_source = agent.read_text(encoding="utf-8")
assert "coverage_request_automation_jobs" in source
assert "user_id" not in source.lower()
assert "automationHealth" in source
assert "vercel" not in source.lower()
assert "taskId: null" in agent_source and "bindAuthorityCapability(job.jobKey, job.taskId)" in agent_source
print("Active coverage request brief contract passed")
