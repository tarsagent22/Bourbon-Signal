from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HERMES_HOME = Path(os.environ.get("HERMES_HOME") or Path.home() / "AppData" / "Local" / "hermes")
REPO = Path(r"C:\c\Users\chand\projects\Bourbon-Signal-autonomous")
REPORT = REPO / "automation" / "bourbon-signal" / "reports" / "release-radar-review-latest.json"
STATE = HERMES_HOME / "automation" / "release-radar-publisher-state.json"
HERMES_PYTHON = HERMES_HOME / "hermes-agent" / "venv" / "Scripts" / "python.exe"
HERMES_SHIM = HERMES_HOME / "hermes-agent" / "venv" / "Scripts" / "hermes.cmd"
BOARD = "bourbon-signal-coverage"
PROJECT = "bourbon-signal"
ASSIGNEE = "default"
RESULT_SCHEMA = "bourbon-signal/release-radar-publication-result@1"
STATE_SCHEMA = "bourbon-signal/release-radar-publisher-state@1"
ALLOWED_SOURCE_CLASSES = {"official_government", "official_state_abc", "official_state_agency", "official_abc", "official_producer"}
TERMINAL_STATUSES = {"done", "blocked", "cancelled", "archived"}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"Expected a JSON object at {path}")
    return value


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def parse_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def eligible_candidates(report: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    if report.get("contractVersion") != "bourbon-signal/release-radar-review@1":
        raise RuntimeError("Release Radar review contract mismatch.")
    rows = report.get("dispositions")
    if not isinstance(rows, list):
        raise RuntimeError("Release Radar review dispositions are missing.")
    selected: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict) or row.get("status") != "publish_ready":
            continue
        evidence = row.get("officialEvidence")
        urls = row.get("evidenceUrls")
        reviewed_at = parse_time(row.get("reviewedAt"))
        if not isinstance(evidence, dict) or evidence.get("sourceClass") not in ALLOWED_SOURCE_CLASSES:
            continue
        if reviewed_at is None or reviewed_at < now - timedelta(days=14) or reviewed_at > now + timedelta(minutes=5):
            continue
        if not isinstance(urls, list) or not urls or any(not isinstance(url, str) or not url.startswith("https://") for url in urls):
            continue
        temporal = any(evidence.get(key) for key in ("date", "eventDate", "registrationWindow", "releaseWindow", "window"))
        if not temporal:
            continue
        selected.append({
            "id": str(row.get("id") or "")[:80],
            "title": str(row.get("title") or "")[:200],
            "reviewedAt": row.get("reviewedAt"),
            "evidenceUrls": urls[:5],
            "officialEvidence": evidence,
            "note": str(row.get("note") or "")[:1000],
        })
    selected.sort(key=lambda item: item["id"])
    return selected[:3]


def digest_candidates(candidates: list[dict[str, Any]]) -> str:
    encoded = json.dumps(candidates, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def hermes(args: list[str], timeout: int = 90) -> str:
    if not HERMES_PYTHON.is_file():
        raise RuntimeError("Hermes runtime is unavailable.")
    env = {**os.environ, "HERMES_HOME": str(HERMES_HOME), "HERMES_BIN": str(HERMES_SHIM)}
    result = subprocess.run(
        [str(HERMES_PYTHON), "-m", "hermes_cli.main", *args],
        cwd=str(REPO), env=env, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
    )
    if result.returncode:
        detail = (result.stderr or result.stdout or "Hermes command failed").strip()
        raise RuntimeError(detail[:500])
    return result.stdout.strip()


def show_task(task_id: str) -> dict[str, Any]:
    payload = json.loads(hermes(["kanban", "--board", BOARD, "show", task_id, "--json"]))
    task = payload.get("task") if isinstance(payload, dict) else None
    if not isinstance(task, dict) or task.get("id") != task_id:
        raise RuntimeError("Kanban returned the wrong publication task.")
    return task


def dispatch_ready_task(task_id: str) -> bool:
    payload = json.loads(hermes([
        "kanban", "--board", BOARD, "dispatch", "--max", "1",
        "--failure-limit", "3", "--json",
    ], timeout=120))
    spawned = payload.get("spawned") if isinstance(payload, dict) else None
    return isinstance(spawned, list) and any(isinstance(row, dict) and row.get("task_id") == task_id for row in spawned)


def build_task_body(candidates: list[dict[str, Any]]) -> str:
    candidate_json = json.dumps(candidates, indent=2, ensure_ascii=True)
    return f"""Publish qualified Release Radar stories from the verified records below.

AUTHORITY AND SCOPE
This is the dedicated Release Radar publisher authorized by the repository AGENTS.md contract. Reconcile current origin/main, the sole release lane, open pull requests, and current canonical production before editing. Process at most these {len(candidates)} records.

VERIFIED REVIEW RECORDS
{candidate_json}

EXECUTION CONTRACT
1. Fetch each listed primary source at runtime and confirm its exact dates, market, rules, and current relevance. Treat the embedded review as a lead rather than runtime proof.
2. Reconcile each record against the current production Release Radar catalog, detail pages, and calendar output before creating a duplicate.
3. Publish only source-supported release, registration, lottery, or official event intelligence. Keep every item announcement-only and non-alertable. Do not represent retailer inventory, shelf quantity, fulfillment, or guaranteed bottle access.
4. When at least one genuinely new or materially changed record qualifies, implement the smallest coherent catalog change in this task worktree. Add focused regression coverage, run the required checks, obtain an independent review, and use the exact-head guarded release path from AGENTS.md.
5. Verify the canonical custom domain after merge, including the Radar index, detail route, and calendar output when applicable.
6. If all records already exist, complete as reconciled without a PR. If primary evidence fails the contract, complete as blocked with precise reasons.
7. Send no Telegram or customer messages. The deterministic scheduler reports the terminal result to Engine Ops.

TERMINAL RESULT CONTRACT
Build one JSON object with exactly these fields, call kanban_complete with that object serialized as the task result, and then return the same object as the final response:
- schemaVersion: {RESULT_SCHEMA}
- outcome: published, reconciled, or blocked
- headline: concise plain text
- candidatesReviewed: non-negative integer
- publishedEntries: array of objects with title, url, and sourceUrl
- pullRequest: object with number, url, and mergeCommit, or null
- ci: object with status passed or not_applicable
- canonicalVerification: object with verified boolean and url, or null
- limitations: array of concise plain-text caveats
"""


def create_task(candidates: list[dict[str, Any]], digest: str) -> str:
    branch = f"radar/publish-{digest[:12]}"
    output = hermes([
        "kanban", "--board", BOARD, "create", f"Release Radar publication: {len(candidates)} verified candidate(s)",
        "--body", build_task_body(candidates), "--assignee", ASSIGNEE,
        "--project", PROJECT, "--workspace", "worktree", "--branch", branch,
        "--priority", "95", "--idempotency-key", f"release-radar:{digest}",
        "--max-runtime", "8h", "--max-retries", "3",
        "--created-by", "release-radar-automation",
        "--skill", "bourbon-signal-product-engineering",
        "--skill", "github-pr-workflow",
        "--skill", "requesting-code-review",
        "--skill", "vercel-production-release-safety",
        "--goal", "--goal-max-turns", "50", "--json",
    ], timeout=120)
    payload = json.loads(output)
    task_id = str(payload.get("id") or (payload.get("task") or {}).get("id") or "")
    if not task_id.startswith("t_"):
        raise RuntimeError("Kanban did not return a valid publication task ID.")
    return task_id


def safe_result(task: dict[str, Any]) -> dict[str, Any] | None:
    raw = task.get("result")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(value, dict) or value.get("schemaVersion") != RESULT_SCHEMA:
        return None
    return value


def terminal_message(task: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
    result = safe_result(task)
    status = str(task.get("status") or "unknown")
    if result:
        outcome = result.get("outcome")
        headline = str(result.get("headline") or "Release Radar publication task completed.")[:300]
        lines = ["Release Radar publisher completed.", f"- Outcome: {outcome}", f"- {headline}"]
        pull = result.get("pullRequest")
        if isinstance(pull, dict) and pull.get("url"):
            lines.append(f"- Pull request: {pull['url']}")
        entries = result.get("publishedEntries")
        if isinstance(entries, list):
            for entry in entries[:3]:
                if isinstance(entry, dict) and entry.get("url"):
                    lines.append(f"- Live: {entry['url']}")
        return "\n".join(lines)
    titles = ", ".join(candidate.get("title", "Untitled") for candidate in candidates[:3])
    return f"Release Radar publisher needs attention.\n- Task: {task.get('id')}\n- Status: {status}\n- Candidates: {titles}"


def load_state() -> dict[str, Any]:
    if not STATE.is_file():
        return {"contractVersion": STATE_SCHEMA}
    state = read_json(STATE)
    if state.get("contractVersion") != STATE_SCHEMA:
        raise RuntimeError("Release Radar publisher state contract mismatch.")
    return state


def run_once(*, plan: bool = False) -> str:
    now = datetime.now(timezone.utc)
    report = read_json(REPORT)
    candidates = eligible_candidates(report, now)
    state = load_state()

    task_id = state.get("taskId")
    if isinstance(task_id, str) and task_id and not state.get("terminalReported"):
        task = show_task(task_id)
        status = str(task.get("status") or "")
        state["taskStatus"] = status
        state["lastPolledAt"] = now.isoformat().replace("+00:00", "Z")
        if status in TERMINAL_STATUSES:
            message = terminal_message(task, state.get("candidates") if isinstance(state.get("candidates"), list) else candidates)
            state["terminalReported"] = True
            state["terminalAt"] = now.isoformat().replace("+00:00", "Z")
            write_json_atomic(STATE, state)
            return message
        if status in {"ready", "todo"}:
            state["dispatchAttempted"] = True
            state["dispatchSpawned"] = dispatch_ready_task(task_id)
        write_json_atomic(STATE, state)
        return ""

    if not candidates:
        return ""
    digest = digest_candidates(candidates)
    if state.get("candidateDigest") == digest:
        return ""
    if plan:
        return json.dumps({"eligible": len(candidates), "candidateDigest": digest, "candidateIds": [item["id"] for item in candidates]}, sort_keys=True)

    task_id = create_task(candidates, digest)
    dispatch_spawned = dispatch_ready_task(task_id)
    next_state = {
        "contractVersion": STATE_SCHEMA,
        "candidateDigest": digest,
        "candidates": candidates,
        "taskId": task_id,
        "taskStatus": "queued",
        "dispatchAttempted": True,
        "dispatchSpawned": dispatch_spawned,
        "terminalReported": False,
        "createdAt": now.isoformat().replace("+00:00", "Z"),
    }
    write_json_atomic(STATE, next_state)
    return f"Release Radar publisher queued {len(candidates)} verified candidate(s) for guarded publication.\n- Task: {task_id}"


def self_test() -> None:
    now = datetime(2026, 8, 4, tzinfo=timezone.utc)
    valid = {
        "contractVersion": "bourbon-signal/release-radar-review@1",
        "dispositions": [{
            "id": "rrl-test", "title": "Official event", "status": "publish_ready",
            "reviewedAt": "2026-08-02T00:00:00Z", "evidenceUrls": ["https://example.gov/event"],
            "officialEvidence": {"sourceClass": "official_government", "eventDate": "2026-09-01"},
            "note": "announcement only",
        }],
    }
    assert len(eligible_candidates(valid, now)) == 1
    for mutation in (
        {"status": "retain_unverified"},
        {"reviewedAt": "2026-06-01T00:00:00Z"},
        {"evidenceUrls": ["http://example.gov/event"]},
        {"officialEvidence": {"sourceClass": "news", "eventDate": "2026-09-01"}},
        {"officialEvidence": {"sourceClass": "official_government"}},
    ):
        row = dict(valid["dispositions"][0])
        row.update(mutation)
        assert eligible_candidates({**valid, "dispositions": [row]}, now) == []
    first = digest_candidates(eligible_candidates(valid, now))
    second = digest_candidates(eligible_candidates(valid, now))
    assert first == second and len(first) == 64
    print("release-radar publisher self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    message = run_once(plan=args.plan)
    if message:
        print(message)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Release Radar publisher failed: {str(error)[:500]}", file=sys.stderr)
        raise SystemExit(1)
