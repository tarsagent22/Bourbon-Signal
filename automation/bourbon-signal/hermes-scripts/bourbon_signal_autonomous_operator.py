import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo

PROFILE = "bourbonbot"
MODEL = "gpt-5.6-sol"
PROVIDER = "openai-codex"
EXPECTED_REPO = Path(r"C:\c\Users\chand\projects\Bourbon-Signal-autonomous").resolve()
EXPECTED_ORIGINS = {
    "https://github.com/tarsagent22/Bourbon-Signal.git",
    "https://github.com/tarsagent22/Bourbon-Signal",
}
PROMPT_RELATIVE = Path("automation/bourbon-signal/autonomous-operator-prompt.md")
RUN_RELATIVE = Path("automation/bourbon-signal/reports/operator-run-latest.json")
OUTCOME_SCRIPT = Path("automation/bourbon-signal/operator-outcomes.mjs")
LOCK_RELATIVE = Path(".operator/objective-lock.json")
ANSI_ESCAPE = re.compile(r"\x1B(?:\[[0-?]*[ -/]*[@-~]|[@-_])")


def clean_delivery_text(value: object, limit: int = 500) -> str:
    text = ANSI_ESCAPE.sub("", str(value or ""))
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def owner_summary(artifact: dict) -> str:
    outcome = artifact.get("outcome")
    lane = clean_delivery_text(artifact.get("lane") or "general", 80).replace("_", " ").title()
    if outcome == "completed":
        lines = [
            "Bourbon Signal automation completed a release.",
            f"- Area: {lane}",
            f"- Pull request: #{artifact['prNumber']} merged",
            "- Production: verified",
        ]
        release_count = int(artifact.get("releaseRadarPublished") or 0)
        expansion_count = int(artifact.get("engineExpansionsCompleted") or 0)
        if release_count:
            lines.append(f"- Release Radar items published: {release_count}")
        if expansion_count:
            lines.append(f"- Engine expansions completed: {expansion_count}")
        return "\n".join(lines)
    if outcome == "no_qualified_work":
        return "Bourbon Signal automation checked the backlog; no qualified work was ready to implement."
    if outcome in {"continued", "blocked"}:
        lines = [
            "Bourbon Signal automation preserved unfinished work for the next shift.",
            f"- Area: {lane}",
        ]
        blocker = clean_delivery_text(artifact.get("blocker"), 240)
        if blocker:
            lines.append(f"- Reason: {blocker}")
        return "\n".join(lines)
    blocker = clean_delivery_text(artifact.get("blocker"), 240) or "The coding shift did not finish successfully."
    return f"Bourbon Signal automation needs attention.\n- Reason: {blocker}"


def run(command: list[str], cwd: Path, timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        env={**load_env(), "BOURBON_SIGNAL_REPO": str(cwd), "HERMES_CRON_SESSION": "1"},
    )


def require_ok(result: subprocess.CompletedProcess[str], label: str) -> str:
    if result.returncode != 0:
        raise RuntimeError(f"{label}: {failure_summary(result.stderr, result.stdout, label)}")
    return result.stdout.strip()


def dedicated_repo() -> Path:
    repo = resolve_repo(load_env()).resolve()
    if repo != EXPECTED_REPO:
        raise RuntimeError(f"Autonomous operator refused untrusted repository path: {repo}")
    package = json.loads((repo / "package.json").read_text(encoding="utf-8"))
    if package.get("name") != "bourbon-signal" or not (repo / ".git").exists():
        raise RuntimeError("The configured autonomous workdir is not the Bourbon Signal clone.")
    origin = require_ok(run(["git", "remote", "get-url", "origin"], repo), "origin verification failed")
    if origin not in EXPECTED_ORIGINS:
        raise RuntimeError(f"Autonomous operator refused unexpected origin: {origin}")
    return repo


def synchronize(repo: Path) -> None:
    require_ok(run(["git", "fetch", "origin", "--prune"], repo, 300), "git fetch failed")
    require_ok(run(["git", "checkout", "main"], repo), "git checkout main failed")
    require_ok(run(["git", "reset", "--hard", "origin/main"], repo), "git synchronization failed")


def read_objective_lock(repo: Path) -> dict | None:
    lock_file = repo / LOCK_RELATIVE
    if not lock_file.is_file():
        return None
    lock = json.loads(lock_file.read_text(encoding="utf-8"))
    allowed = {"contractVersion", "objectiveId", "issueNumber", "title", "branch", "baseBranch", "repo", "worktree", "remote", "selectedAt", "status"}
    if set(lock) - allowed or lock.get("contractVersion") != "bourbon-signal/operator-lock@2":
        raise RuntimeError("Existing objective lock violates the canonical operator-lock@2 contract.")
    objective_id = str(lock.get("objectiveId") or "")
    branch = str(lock.get("branch") or "")
    worktree = str(lock.get("worktree") or "")
    if not re.fullmatch(r"bsf-[a-f0-9]{16}", objective_id):
        raise RuntimeError("Existing objective lock has an invalid objective ID.")
    if not re.fullmatch(rf"operator/{re.escape(objective_id)}-[a-z0-9-]{{1,48}}", branch):
        raise RuntimeError("Existing objective lock has an invalid objective branch.")
    if lock.get("baseBranch") != "main" or lock.get("repo") != "tarsagent22/Bourbon-Signal" or lock.get("remote") != "origin" or lock.get("status") != "locked":
        raise RuntimeError("Existing objective lock does not target the canonical repository and main branch.")
    if not isinstance(lock.get("issueNumber"), int) or lock["issueNumber"] <= 0 or not 1 <= len(str(lock.get("title") or "").strip()) <= 120:
        raise RuntimeError("Existing objective lock lacks its canonical issue or title.")
    try:
        selected_at = datetime.fromisoformat(str(lock.get("selectedAt") or "").replace("Z", "+00:00"))
    except ValueError as error:
        raise RuntimeError("Existing objective lock has an invalid selection timestamp.") from error
    if selected_at.tzinfo is None:
        raise RuntimeError("Existing objective lock selection timestamp must include a timezone.")
    worktree_path = Path(worktree).resolve()
    projects_root = EXPECTED_REPO.parent
    if worktree_path.parent != projects_root or not worktree_path.name.startswith("Bourbon-Signal-operator-"):
        raise RuntimeError("Existing objective lock points outside the dedicated operator worktree boundary.")
    registered = require_ok(run(["git", "worktree", "list", "--porcelain"], repo), "worktree validation failed")
    records = [record.splitlines() for record in registered.strip().split("\n\n") if record.strip()]
    matched = False
    for record in records:
        values = {line.split(" ", 1)[0]: line.split(" ", 1)[1] for line in record if " " in line}
        if str(Path(values.get("worktree", ".")).resolve()).casefold() == str(worktree_path).casefold():
            matched = values.get("branch") == f"refs/heads/{branch}"
            break
    if not matched:
        raise RuntimeError("Existing objective worktree is not registered on the locked branch.")
    return lock


def active_objective(repo: Path) -> dict | None:
    return read_objective_lock(repo)


def terminate_tree(process: subprocess.Popen[str]) -> None:
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, text=True, timeout=30)
    else:
        process.terminate()
    try:
        process.wait(timeout=30)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def run_agent(command: list[str], repo: Path, timeout: int = 3_300) -> subprocess.CompletedProcess[str]:
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
    process = subprocess.Popen(
        command,
        cwd=str(repo),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=creationflags,
        env={**load_env(), "BOURBON_SIGNAL_REPO": str(repo), "HERMES_CRON_SESSION": "1"},
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        terminate_tree(process)
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def failure_artifact(repo: Path, run_id: str, started_at: str, objective: dict | None, outcome: str, blocker: str, *, resumed: bool = False) -> dict:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "contractVersion": "bourbon-signal/operator-run@1",
        "runId": run_id,
        "startedAt": started_at,
        "completedAt": now,
        "objectiveId": objective.get("objectiveId") if objective else None,
        "lane": "none",
        "outcome": outcome,
        "startedObjective": bool(objective) and not resumed,
        "resumedObjective": bool(objective) and resumed,
        "prNumber": None,
        "merged": False,
        "deployed": False,
        "productionVerified": False,
        "mergeCommitSha": None,
        "deploymentId": None,
        "productionChecks": [],
        "findingsQualified": 0,
        "releaseRadarPublished": 0,
        "engineExpansionsCompleted": 0,
        "coverageDelta": 0,
        "discoveryToCompletionHours": None,
        "blocker": blocker[:500],
    }
    target = repo / RUN_RELATIVE
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def aggregate(repo: Path, run_id: str, started_at: str, objective: dict | None) -> subprocess.CompletedProcess[str]:
    command = [
        "node", str(repo / OUTCOME_SCRIPT), "--apply",
        f"--expected-run-id={run_id}", f"--expected-started-at={started_at}",
    ]
    if objective:
        command.append(f"--expected-objective-id={objective['objectiveId']}")
    return run(command, repo, 120)


def verify_canonical_objective(repo: Path, objective: dict) -> None:
    result = require_ok(run([
        "gh", "issue", "view", str(objective["issueNumber"]),
        "--repo", "tarsagent22/Bourbon-Signal", "--json", "state,body",
    ], repo), "canonical objective verification failed")
    issue = json.loads(result)
    if issue.get("state") != "OPEN" or objective["objectiveId"] not in str(issue.get("body") or ""):
        raise RuntimeError("Objective lock does not match an open canonical GitHub finding.")


def verify_completion_evidence(repo: Path, artifact: dict) -> None:
    result = require_ok(run([
        "gh", "pr", "view", str(artifact["prNumber"]),
        "--repo", "tarsagent22/Bourbon-Signal",
        "--json", "state,mergedAt,mergeCommit,headRefName",
    ], repo), "merged PR verification failed")
    pull = json.loads(result)
    commit = (pull.get("mergeCommit") or {}).get("oid")
    expected_branch = f"operator/{artifact['objectiveId']}-"
    if pull.get("state") != "MERGED" or not pull.get("mergedAt") or commit != artifact.get("mergeCommitSha") or not str(pull.get("headRefName") or "").startswith(expected_branch):
        raise RuntimeError("Completion artifact does not match the merged canonical objective PR.")
    for url in artifact.get("productionChecks") or []:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in {"bourbonsignal.com", "www.bourbonsignal.com"}:
            raise RuntimeError("Production verification URL is outside the Bourbon Signal custom domains.")
        request = Request(url, headers={"User-Agent": "BourbonSignalAutonomousOperator/1.0"})
        with urlopen(request, timeout=20) as response:
            if response.status >= 400:
                raise RuntimeError(f"Production verification failed for {url}: HTTP {response.status}")


def validate_transition(repo: Path, initial: dict | None) -> tuple[dict, dict | None]:
    run_file = repo / RUN_RELATIVE
    if not run_file.is_file():
        raise RuntimeError("Operator did not write the required centralized run artifact.")
    artifact = json.loads(run_file.read_text(encoding="utf-8"))
    final = read_objective_lock(repo)
    outcome = artifact.get("outcome")
    artifact_id = artifact.get("objectiveId")
    if artifact.get("startedObjective") and artifact.get("resumedObjective"):
        raise RuntimeError("A run cannot both start and resume an objective.")
    if artifact.get("resumedObjective") and not initial:
        raise RuntimeError("A run cannot claim continuation without an initial lock.")
    if initial and artifact_id != initial["objectiveId"]:
        raise RuntimeError("Operator run artifact changed the locked objective ID.")
    if initial and outcome in {"continued", "blocked", "failed"} and (not final or final["objectiveId"] != initial["objectiveId"]):
        raise RuntimeError("Incomplete objective did not preserve its canonical continuation lock.")
    if initial and outcome == "completed" and final is not None:
        raise RuntimeError("Completed objective did not release its canonical lock.")
    if not initial and final and artifact_id != final["objectiveId"]:
        raise RuntimeError("New objective lock does not match the run artifact.")
    if not initial and final and not artifact.get("startedObjective"):
        raise RuntimeError("Newly selected objective was not reported as started.")
    if outcome == "no_qualified_work" and final is not None:
        raise RuntimeError("No-qualified-work outcome cannot leave an objective lock.")
    if outcome == "completed" and not all(artifact.get(field) is True for field in ("merged", "deployed", "productionVerified")):
        raise RuntimeError("Completed objectives require merge, deployment, and production verification evidence.")
    if outcome == "completed" and not initial and not artifact.get("startedObjective"):
        raise RuntimeError("A lockless completed run must prove it started the canonical objective during this shift.")
    if outcome == "completed":
        verify_completion_evidence(repo, artifact)
    return artifact, final


def main() -> int:
    started = datetime.now(timezone.utc)
    started_at = started.isoformat().replace("+00:00", "Z")
    run_id = f"{started_at}-{hashlib.sha256(os.urandom(16)).hexdigest()[:8]}"
    repo = dedicated_repo()
    synchronize(repo)
    objective = active_objective(repo)
    if objective:
        verify_canonical_objective(repo, objective)
    prompt_file = repo / PROMPT_RELATIVE
    if not prompt_file.is_file():
        raise RuntimeError(f"Operator prompt is missing: {prompt_file}")
    run_file = repo / RUN_RELATIVE
    run_file.unlink(missing_ok=True)
    continuation = (
        f"A validated active objective `{objective['objectiveId']}` exists in `{objective['worktree']}`. Resume it; selecting any new objective is forbidden."
        if objective else
        "No active objective lock exists. You may select exactly one eligible objective under the canonical policy."
    )
    prompt = (
        prompt_file.read_text(encoding="utf-8")
        + f"\n\nRuntime contract:\n- Run ID: `{run_id}`\n"
        + f"- Started at: `{started_at}`\n"
        + f"- Dedicated base repository: `{repo}`\n"
        + f"- Required centralized run artifact: `{repo / RUN_RELATIVE}`\n- {continuation}\n"
        + "Use that exact run ID and startedAt in the required run artifact. Even when working in a locked objective worktree, write the artifact to the centralized absolute path above.\n"
    )
    command = [
        "hermes", "-p", PROFILE, "chat", "-q", prompt,
        "-m", MODEL, "--provider", PROVIDER,
        "-t", "terminal,file,web",
        "-s", "bourbon-signal-product-engineering,github-pr-workflow,requesting-code-review,notification-delivery-safety",
        "-Q", "--max-turns", "500", "--source", "cron",
    ]
    agent_cwd = Path(objective["worktree"]).resolve() if objective else repo
    try:
        agent = run_agent(command, agent_cwd)
    except subprocess.TimeoutExpired:
        final = read_objective_lock(repo)
        tracked = objective or final
        artifact = failure_artifact(repo, run_id, started_at, tracked, "continued" if tracked else "failed", "Coding shift exceeded 55 minutes; the process tree was terminated and continuation state was preserved.", resumed=bool(objective))
        checked = aggregate(repo, run_id, started_at, tracked)
        print(owner_summary(artifact))
        return 124 if checked.returncode == 0 else checked.returncode
    if agent.returncode != 0:
        blocker = failure_summary(agent.stderr, agent.stdout, "Autonomous operator failed.")
        final = read_objective_lock(repo)
        tracked = objective or final
        artifact = failure_artifact(repo, run_id, started_at, tracked, "continued" if tracked else "failed", clean_delivery_text(blocker), resumed=bool(objective))
        checked = aggregate(repo, run_id, started_at, tracked)
        if checked.returncode != 0:
            print(f"Bourbon Signal automation needs attention.\n- Reason: {clean_delivery_text(failure_summary(checked.stderr, checked.stdout, 'Operator failure outcome aggregation failed.'), 240)}")
            return checked.returncode
        print(owner_summary(artifact))
        return agent.returncode
    artifact, final = validate_transition(repo, objective)
    expected = objective or final or ({"objectiveId": artifact["objectiveId"]} if artifact.get("objectiveId") else None)
    checked = aggregate(repo, run_id, started_at, expected)
    if checked.returncode != 0:
        print(f"Bourbon Signal automation needs attention.\n- Reason: {clean_delivery_text(failure_summary(checked.stderr, checked.stdout, 'Operator outcome validation failed.'), 240)}")
        return checked.returncode
    print(owner_summary(artifact))
    return 0


def record_uncaught_failure(error: Exception) -> None:
    try:
        repo = dedicated_repo()
        started = datetime.now(timezone.utc)
        started_at = started.isoformat().replace("+00:00", "Z")
        run_id = f"{started_at}-{hashlib.sha256(os.urandom(16)).hexdigest()[:8]}"
        try:
            objective = read_objective_lock(repo)
        except Exception:
            objective = None
        failure_artifact(repo, run_id, started_at, objective, "continued" if objective else "failed", f"Wrapper preflight or validation failed: {str(error)[:400]}", resumed=bool(objective))
        aggregate(repo, run_id, started_at, objective)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        record_uncaught_failure(error)
        print(f"Bourbon Signal automation needs attention.\n- Reason: {clean_delivery_text(error, 240)}")
        raise SystemExit(1)
