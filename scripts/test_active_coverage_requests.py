import importlib.util
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / "automation" / "bourbon-signal" / "hermes-scripts" / "bourbon_signal_active_coverage_requests.py"
sys.path.insert(0, str(target.parent))
spec = importlib.util.spec_from_file_location("active_coverage_requests", target)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)


def valid_payload():
    return {
        "contractVersion": "bourbon-signal/active-coverage-requests@2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "production_read_api",
        "count": 1,
        "requests": [{
            "targetType": "city", "stateCode": "KY", "areaLabel": "Louisville",
            "storeName": None, "status": "requested",
            "requestedAt": "2026-08-26T10:00:00.000Z", "updatedAt": "2026-08-26T11:00:00.000Z",
        }],
        "automationHealth": {"activeAutomationStatuses": {"queued": 2}},
    }


class FakeResponse:
    status = 200
    def read(self, limit):
        assert limit == module.MAX_RESPONSE_BYTES + 1
        return json.dumps(valid_payload()).encode()


class FakeConnection:
    def __init__(self, host, timeout):
        assert host == "www.bourbonsignal.com" and timeout == 30
        self.request_args = None
    def request(self, method, path, headers):
        assert method == "GET" and path == "/api/ops/active-coverage-requests"
        assert headers["Authorization"].startswith("Bearer ") and headers["Authorization"] != "Bearer "
        self.request_args = (method, path, headers)
    def getresponse(self):
        assert self.request_args
        return FakeResponse()
    def close(self):
        pass


original_scheduler = module.summarize_scheduler
try:
    module.summarize_scheduler = lambda: {"activeJobs": 5, "failingJobs": [], "coverageCompletionLane": {"enabled": True, "lastStatus": "ok", "lastRunAt": "2026-08-26T11:45:00+00:00", "fresh": True}}
    payload = module.query_production_api({"COMPANY_SCORECARD_READ_SECRET": "read-only-secret"}, connection_factory=FakeConnection)
    assert payload["source"] == "production_read_api"
    assert payload["count"] == 1 and payload["requests"][0]["areaLabel"] == "Louisville"
    assert payload["automationHealth"]["activeAutomationStatuses"] == {"queued": 2}
    assert payload["automationHealth"]["activeJobs"] == 5
    assert "Authorization" not in json.dumps(payload)
finally:
    module.summarize_scheduler = original_scheduler

for mutate in (
    lambda payload: payload.update({"unexpectedMemberData": {"email": "private@example.test"}}),
    lambda payload: payload.update({"generatedAt": (datetime.now(timezone.utc) - timedelta(hours=37)).isoformat()}),
    lambda payload: payload["automationHealth"]["activeAutomationStatuses"].update({"queued": True}),
    lambda payload: payload["requests"][0].update({"stateCode": "Kentucky"}),
    lambda payload: payload["requests"][0].update({"targetType": "area"}),
    lambda payload: payload.update({"generatedAt": datetime.now().replace(microsecond=0).isoformat()}),
    lambda payload: payload["requests"][0].update({"updatedAt": (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()}),
    lambda payload: payload["requests"][0].update({"areaLabel": True}),
    lambda payload: payload.update({"count": True}),
    lambda payload: payload.update({"count": 2}),
    lambda payload: payload["requests"][0].update({"unexpected": "private"}),
):
    candidate = valid_payload()
    mutate(candidate)
    try:
        module.validate_payload(candidate)
        raise AssertionError("malformed payload must fail closed")
    except RuntimeError:
        pass

try:
    module.query_production_api({}, connection_factory=FakeConnection)
    raise AssertionError("missing read secret must fail closed")
except RuntimeError as error:
    assert "secret" in str(error).lower()


class RedirectResponse(FakeResponse):
    status = 302


class RedirectConnection(FakeConnection):
    def getresponse(self):
        return RedirectResponse()


try:
    module.query_production_api({"COMPANY_SCORECARD_READ_SECRET": "read-only-secret"}, connection_factory=RedirectConnection)
    raise AssertionError("redirect must fail without forwarding credentials")
except RuntimeError as error:
    assert "302" in str(error)


class ServerErrorResponse(FakeResponse):
    status = 500


class ServerErrorConnection(FakeConnection):
    def getresponse(self):
        return ServerErrorResponse()


try:
    module.query_production_api({"COMPANY_SCORECARD_READ_SECRET": "read-only-secret"}, connection_factory=ServerErrorConnection)
    raise AssertionError("server error must fail closed")
except RuntimeError as error:
    assert "500" in str(error)


class OversizedResponse(FakeResponse):
    def read(self, limit):
        return b"x" * limit


class OversizedConnection(FakeConnection):
    def getresponse(self):
        return OversizedResponse()


try:
    module.query_production_api({"COMPANY_SCORECARD_READ_SECRET": "read-only-secret"}, connection_factory=OversizedConnection)
    raise AssertionError("oversized payload must fail closed")
except RuntimeError as error:
    assert "size limit" in str(error)

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

source = target.read_text(encoding="utf-8").lower()
for forbidden in ("psycopg", "database_url", "vercel", "query_kanban_mirror", "user_id"):
    assert forbidden not in source
print("Active coverage request production read contract passed")
