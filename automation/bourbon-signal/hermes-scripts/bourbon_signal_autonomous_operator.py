import hashlib
import hmac
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from bourbon_signal_runtime import failure_summary, load_env

MODEL = "gpt-5.6-sol"
BROKER_PORT = 47683


def receive_release_lane_frame(sock: socket.socket, limit: int = 256) -> bytes:
    frame = bytearray()
    while b"\n" not in frame:
        if len(frame) >= limit:
            raise RuntimeError("Release-lane broker frame exceeded its limit.")
        chunk = sock.recv(min(64, limit - len(frame)))
        if not chunk:
            break
        frame.extend(chunk)
    return bytes(frame).split(b"\n", 1)[0]


def start_release_lane_broker(inheritance_token: str):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    elif os.name != "nt":
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", BROKER_PORT))
    server.listen(8)
    server.settimeout(0.2)
    stopping = threading.Event()

    def serve() -> None:
        while not stopping.is_set():
            try:
                client, _ = server.accept()
            except TimeoutError:
                continue
            except OSError:
                break
            with client:
                try:
                    client.settimeout(2)
                    supplied = receive_release_lane_frame(client).decode("ascii", errors="ignore")
                    client.sendall(b"OK\n" if hmac.compare_digest(supplied, inheritance_token) else b"NO\n")
                except (OSError, RuntimeError):
                    continue

    thread = threading.Thread(target=serve, name="release-lane-broker", daemon=True)
    thread.start()
    return server, stopping, thread
EXPECTED_REPO = Path(r"C:\c\Users\chand\projects\Bourbon-Signal-operator-base").resolve()
EXPECTED_ORIGINS = {
    "https://github.com/tarsagent22/Bourbon-Signal.git",
    "https://github.com/tarsagent22/Bourbon-Signal",
}
PROMPT_RELATIVE = Path("automation/bourbon-signal/autonomous-operator-prompt.md")
RUN_RELATIVE = Path("automation/bourbon-signal/reports/operator-run-latest.json")
OUTCOME_SCRIPT = Path("automation/bourbon-signal/operator-outcomes.mjs")
FINDINGS_SCRIPT = Path("scripts/operator-findings.mjs")
LOCK_RELATIVE = Path(".operator/objective-lock.json")
RELEASE_LANE_LOCK_RELATIVE = Path(".operator/release-lane.lock")
RELEASE_LANE_LEASE_HOURS = 2
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
        return ""
    if outcome in {"continued", "blocked"}:
        lines = [
            "Bourbon Signal automation preserved unfinished work for the next shift.",
            f"- Area: {lane}",
        ]
        if artifact.get("prNumber"):
            lines.append(f"- Draft pull request: #{artifact['prNumber']}")
        blocker = clean_delivery_text(artifact.get("blocker"), 240)
        if blocker:
            lines.append(f"- Reason: {blocker}")
        return "\n".join(lines)
    blocker = clean_delivery_text(artifact.get("blocker"), 240) or "The coding shift did not finish successfully."
    return f"Bourbon Signal automation needs attention.\n- Reason: {blocker}"


def emit_owner_summary(artifact: dict) -> None:
    summary = owner_summary(artifact)
    if summary:
        print(summary)


def run(command: list[str], cwd: Path, timeout: int = 180, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    environment = {**load_env(), "BOURBON_SIGNAL_REPO": str(cwd), "HERMES_CRON_SESSION": "1"}
    inheritance_token = os.environ.get("BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN")
    if inheritance_token:
        environment["BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN"] = inheritance_token
    environment.update(extra_env or {})
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        env=environment,
    )


def require_ok(result: subprocess.CompletedProcess[str], label: str) -> str:
    if result.returncode != 0:
        raise RuntimeError(f"{label}: {failure_summary(result.stderr, result.stdout, label)}")
    return result.stdout.strip()


def operator_repo_from_env(environment: dict[str, str]) -> Path:
    return Path(environment.get("BOURBON_SIGNAL_OPERATOR_REPO") or EXPECTED_REPO).resolve()


def shared_release_lane_directory(repo: Path, environment: dict[str, str] | None = None) -> Path:
    host_root = (Path.home() / "AppData" / "Local" / "hermes") if os.name == "nt" else (Path.home() / ".hermes")
    return (host_root / "automation" / "bourbon-signal-release-lane").resolve()


def sync_objective_registry(repo: Path, shared: Path) -> None:
    source = repo / LOCK_RELATIVE
    identity = str(repo).casefold() if os.name == "nt" else str(repo)
    target = shared / "objectives" / f"{hashlib.sha256(identity.encode('utf-8')).hexdigest()}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        target.unlink(missing_ok=True)
        return
    objective = json.loads(source.read_text(encoding="utf-8"))
    payload = {"contractVersion": "bourbon-signal/objective-registry@1", "repository": str(repo), "objective": objective}
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)


def dedicated_repo() -> Path:
    repo = operator_repo_from_env(load_env())
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
    branch = require_ok(run(["git", "branch", "--show-current"], repo), "base branch lookup failed")
    if branch != "main":
        raise RuntimeError(f"Autonomous operator found the dedicated base clone on {branch or 'detached HEAD'}, not main; refusing to overwrite interactive work.")
    status = require_ok(run(["git", "status", "--porcelain", "--untracked-files=normal"], repo), "base worktree status failed")
    if status:
        raise RuntimeError("Autonomous operator found a dirty base clone; refusing destructive synchronization or concurrent edits.")
    require_ok(run(["git", "fetch", "origin", "--prune"], repo, 300), "git fetch failed")
    require_ok(run(["git", "merge", "--ff-only", "origin/main"], repo), "git fast-forward synchronization failed")


def list_open_pull_requests(repo: Path) -> list[dict]:
    raw = require_ok(run([
        "gh", "pr", "list", "--repo", "tarsagent22/Bourbon-Signal", "--state", "open", "--limit", "100",
        "--json", "number,headRefName,baseRefName,isDraft,headRefOid",
    ], repo), "open pull request lookup failed")
    rows = json.loads(raw or "[]")
    if not isinstance(rows, list):
        raise RuntimeError("Open pull request lookup returned an invalid payload.")
    return rows


def validate_release_lane(pull_requests: list[dict], objective: dict | None) -> None:
    if len(pull_requests) > 1:
        raise RuntimeError(f"Exactly one active release lane is allowed; found {len(pull_requests)} open pull requests.")
    if not pull_requests:
        return
    pull = pull_requests[0]
    if not objective:
        raise RuntimeError(f"Open PR #{pull.get('number')} must be reconciled before automation selects another objective.")
    if pull.get("headRefName") != objective.get("branch"):
        raise RuntimeError(f"Open PR #{pull.get('number')} does not match the locked objective branch {objective.get('branch')}.")
    if pull.get("baseRefName") != "main":
        raise RuntimeError("The automation-owned release PR must target main.")
    if pull.get("isDraft") is not True:
        raise RuntimeError("The automation-owned pull request must remain draft until Chandler explicitly promotes it.")


def git_is_ancestor(repo: Path, older: str, newer: str) -> bool:
    result = run(["git", "merge-base", "--is-ancestor", older, newer], repo)
    if result.returncode not in {0, 1}:
        raise RuntimeError(f"Branch ancestry check failed: {failure_summary(result.stderr, result.stdout, 'git merge-base failed')}")
    return result.returncode == 0


def reconcile_objective_branch(repo: Path, objective: dict) -> str:
    worktree = Path(objective["worktree"]).resolve()
    branch = str(objective["branch"])
    branch_ref = f"refs/heads/{branch}"
    branch_is_ancestor = git_is_ancestor(repo, branch_ref, "origin/main")
    main_is_ancestor = git_is_ancestor(repo, "origin/main", branch_ref)
    if not branch_is_ancestor and not main_is_ancestor:
        raise RuntimeError("The locked objective branch diverged from current main; automation stopped for deliberate reconciliation.")
    if branch_is_ancestor and not main_is_ancestor:
        tracked = require_ok(run(["git", "status", "--porcelain", "--untracked-files=no"], worktree), "objective worktree status failed")
        if tracked:
            raise RuntimeError("The stale objective branch has tracked edits; automation refused to overwrite them during current-main reconciliation.")
        require_ok(run(["git", "merge", "--ff-only", "origin/main"], worktree), "objective branch fast-forward failed")
        require_ok(run(["git", "push", "origin", f"HEAD:{branch}"], worktree, 300), "objective branch fast-forward push failed")
        return "fast_forwarded"
    return "current"


@contextmanager
def release_lane_lease(repo: Path, run_id: str):
    target = shared_release_lane_directory(repo) / "release-lane.lock"
    guard = target.with_suffix(".guard")
    target.parent.mkdir(parents=True, exist_ok=True)
    handle = open(guard, "a+b")
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
        handle.write(b"0")
        handle.flush()
    handle.seek(0)
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (OSError, IOError) as error:
        handle.close()
        raise RuntimeError("The release lane is already owned by another live process.") from error
    now = datetime.now(timezone.utc)
    inheritance_token = hashlib.sha256(os.urandom(32)).hexdigest()
    payload = {
        "contractVersion": "bourbon-signal/release-lane-lease@1",
        "leaseId": run_id,
        "runId": run_id,
        "pid": os.getpid(),
        "acquiredAt": now.isoformat().replace("+00:00", "Z"),
        "expiresAt": (now + timedelta(hours=RELEASE_LANE_LEASE_HOURS)).isoformat().replace("+00:00", "Z"),
        "inheritanceDigest": hashlib.sha256(inheritance_token.encode("utf-8")).hexdigest(),
    }
    prior_token = os.environ.get("BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN")
    broker = None
    try:
        broker = start_release_lane_broker(inheritance_token)
        target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        os.environ["BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN"] = inheritance_token
        yield
    finally:
        try:
            sync_objective_registry(repo, target.parent)
            current = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
            if current.get("runId") == run_id:
                target.unlink(missing_ok=True)
        finally:
            if broker:
                server, stopping, thread = broker
                stopping.set()
                server.close()
                thread.join(timeout=1)
            if prior_token is None:
                os.environ.pop("BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN", None)
            else:
                os.environ["BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN"] = prior_token
            handle.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            handle.close()


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


def preserve_initial_objective_lock(repo: Path, initial: dict | None) -> dict | None:
    try:
        final = read_objective_lock(repo)
    except Exception:
        final = None
    if not initial:
        return final
    if final == initial:
        return final
    worktree = Path(initial["worktree"]).resolve()
    if not worktree.is_dir():
        raise RuntimeError("Automation removed both the objective lock and its canonical worktree.")
    target = repo / LOCK_RELATIVE
    temporary = target.with_suffix(".restore.tmp")
    temporary.write_text(json.dumps(initial, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)
    return read_objective_lock(repo)


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


def restricted_agent_environment(repo: Path, run_id: str) -> dict[str, str]:
    source = load_env()
    safe_keys = {
        "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "TMPDIR",
        "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TERM", "LANG", "LC_ALL", "COLORTERM",
    }
    environment = {key: value for key, value in source.items() if key.upper() in safe_keys}
    isolated = repo / ".operator" / "restricted-auth" / run_id.replace(":", "-")
    gh_config = isolated / "gh"
    vercel_config = isolated / "vercel"
    gh_config.mkdir(parents=True, exist_ok=True)
    vercel_config.mkdir(parents=True, exist_ok=True)
    environment.update({
        "BOURBON_SIGNAL_REPO": str(repo),
        "HERMES_CRON_SESSION": "1",
        "GH_CONFIG_DIR": str(gh_config),
        "VERCEL_CONFIG_DIR": str(vercel_config),
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "remote.origin.pushurl",
        "GIT_CONFIG_VALUE_0": "disabled-by-bourbon-signal-release-lane://no-push",
    })
    return environment


def run_agent(command: list[str], repo: Path, run_id: str, timeout: int = 3_300) -> subprocess.CompletedProcess[str]:
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
        env=restricted_agent_environment(repo, run_id),
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        terminate_tree(process)
        raise
    finally:
        shutil.rmtree(repo / ".operator" / "restricted-auth" / run_id.replace(":", "-"), ignore_errors=True)
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def prepare_draft_pull_request(repo: Path, objective: dict) -> int:
    worktree = Path(objective["worktree"]).resolve()
    branch = str(objective["branch"])
    current_branch = require_ok(run(["git", "branch", "--show-current"], worktree), "objective branch lookup failed")
    if current_branch != branch:
        raise RuntimeError(f"Objective worktree changed branches from {branch} to {current_branch or 'detached HEAD'}.")
    status = require_ok(run(["git", "status", "--porcelain"], worktree), "objective worktree status failed")
    if status:
        raise RuntimeError("Coding subprocess left uncommitted changes; the wrapper refused to publish a partial draft.")
    require_ok(run(["git", "fetch", "origin", "main"], worktree, 300), "current-main fetch failed before draft handoff")
    if not git_is_ancestor(worktree, "origin/main", "HEAD"):
        raise RuntimeError("Current main changed during the coding shift; the draft branch requires deliberate reconciliation and revalidation.")
    pulls = list_open_pull_requests(repo)
    validate_release_lane(pulls, objective)
    head = require_ok(run(["git", "rev-parse", "HEAD"], worktree), "objective head lookup failed")
    main = require_ok(run(["git", "rev-parse", "origin/main"], worktree), "current main lookup failed")
    if not pulls and head == main:
        raise RuntimeError("The coding shift produced no committed change for a draft pull request.")
    require_ok(run(["git", "push", "origin", f"HEAD:{branch}"], worktree, 300), "normal fast-forward draft push failed")
    if pulls:
        pr_number = int(pulls[0]["number"])
        post = list_open_pull_requests(repo)
        if len(post) != 1 or int(post[0].get("number") or 0) != pr_number or post[0].get("headRefName") != branch or post[0].get("baseRefName") != "main" or post[0].get("isDraft") is not True or post[0].get("headRefOid") != head:
            raise RuntimeError("The existing draft PR changed during deterministic handoff; publication state was not claimed.")
        return pr_number
    created = require_ok(run([
        "gh", "pr", "create", "--repo", "tarsagent22/Bourbon-Signal", "--draft", "--base", "main", "--head", branch,
        "--title", f"Draft release: {str(objective['title'])[:90]}",
        "--body", f"Unattended draft handoff for #{objective['issueNumber']}. Requires daytime reconciliation, review, guarded merge, deployment, and production verification.",
    ], repo, 300), "draft pull request creation failed")
    match = re.search(r"/pull/(\d+)(?:\s|$)", created)
    if not match:
        raise RuntimeError("Draft pull request creation returned no verifiable PR number.")
    pr_number = int(match.group(1))
    post = list_open_pull_requests(repo)
    valid_created = len(post) == 1 and int(post[0].get("number") or 0) == pr_number and post[0].get("headRefName") == branch and post[0].get("baseRefName") == "main" and post[0].get("isDraft") is True and post[0].get("headRefOid") == head
    if not valid_created:
        created = next((pull for pull in post if int(pull.get("number") or 0) == pr_number), None)
        safe_to_close = created is not None and created.get("headRefName") == branch and created.get("baseRefName") == "main" and created.get("isDraft") is True and created.get("headRefOid") == head and len(post) > 1
        if safe_to_close:
            require_ok(run(["gh", "pr", "close", str(pr_number), "--repo", "tarsagent22/Bourbon-Signal", "--comment", "Closed automatically because another release lane appeared during deterministic draft creation."], repo, 120), "competing draft PR cleanup failed")
            raise RuntimeError("Another release lane appeared during draft creation; the wrapper closed only its unchanged competing draft.")
        raise RuntimeError("Draft PR state changed during creation; the wrapper preserved the owner-controlled PR and stopped without mutation.")
    return pr_number


def write_run_artifact(repo: Path, artifact: dict) -> None:
    target = repo / RUN_RELATIVE
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)


def import_agent_artifact(repo: Path, source: Path) -> None:
    if not source.is_file():
        raise RuntimeError("Coding subprocess did not write the required sandbox run artifact.")
    payload = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("Coding subprocess wrote a non-object sandbox run artifact.")
    write_run_artifact(repo, payload)
    shutil.rmtree(source.parent, ignore_errors=True)


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
    if outcome == "completed":
        raise RuntimeError("Autonomous coding shifts are draft-only and may not merge or complete a production release.")
    if any(artifact.get(field) is True for field in ("merged", "deployed", "productionVerified")) \
            or artifact.get("mergeCommitSha") is not None \
            or artifact.get("deploymentId") is not None \
            or artifact.get("productionChecks") \
            or int(artifact.get("releaseRadarPublished") or 0) > 0 \
            or int(artifact.get("engineExpansionsCompleted") or 0) > 0 \
            or int(artifact.get("coverageDelta") or 0) > 0:
        raise RuntimeError("Draft-only automation may not claim a merge, deployment, publication, expansion, or production verification.")
    if artifact.get("startedObjective") and artifact.get("resumedObjective"):
        raise RuntimeError("A run cannot both start and resume an objective.")
    if artifact.get("resumedObjective") and not initial:
        raise RuntimeError("A run cannot claim continuation without an initial lock.")
    if initial and artifact_id != initial["objectiveId"]:
        raise RuntimeError("Operator run artifact changed the locked objective ID.")
    incomplete = outcome in {"continued", "blocked", "failed"}
    if incomplete and artifact_id and (not final or final["objectiveId"] != artifact_id):
        raise RuntimeError("Incomplete objective did not preserve its canonical continuation lock.")
    if outcome == "continued" and not artifact_id:
        raise RuntimeError("A continued run must identify and preserve one objective.")
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


def admit_objective(repo: Path, run_id: str, selected_at: str) -> dict | None:
    findings = require_ok(run([
        "node", str(repo / FINDINGS_SCRIPT), "read", "--repo", "tarsagent22/Bourbon-Signal", "--state", "open",
    ], repo, 180), "canonical finding lookup failed")
    payload = json.loads(findings or "{}")
    eligible = [
        entry for entry in payload.get("findings", [])
        if (entry.get("finding") or {}).get("status") in {"backlog", "selected", "in-progress"}
    ]
    if not eligible:
        return None
    admission_root = Path(tempfile.gettempdir()) / "bourbon-signal-operator-admission"
    admission_root.mkdir(parents=True, exist_ok=True)
    findings_file = admission_root / f"{run_id.replace(':', '-')}.json"
    findings_file.write_text(json.dumps({"findings": eligible}) + "\n", encoding="utf-8")
    common = [
        "npm", "run", "operator:objective", "--", "select", "--file", str(findings_file),
        "--repo", "tarsagent22/Bourbon-Signal", "--base", "main", "--remote", "origin", "--at", selected_at,
    ]
    try:
        preview = json.loads(require_ok(run(
            common,
            repo,
            180,
            {"BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID": run_id},
        ), "objective admission preview failed"))
        objective_id = str((preview.get("lock") or {}).get("objectiveId") or "")
        if not re.fullmatch(r"bsf-[a-f0-9]{16}", objective_id):
            raise RuntimeError("Objective admission preview returned an invalid objective ID.")
        worktree = EXPECTED_REPO.parent / f"Bourbon-Signal-operator-{objective_id}"
        require_ok(run(
            [*common, "--worktree", str(worktree), "--apply"],
            repo,
            300,
            {"BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID": run_id},
        ), "objective admission failed")
    finally:
        findings_file.unlink(missing_ok=True)
    return read_objective_lock(repo)


def run_shift(repo: Path, started_at: str, run_id: str) -> int:
    synchronize(repo)
    objective = active_objective(repo)
    try:
        pull_requests = list_open_pull_requests(repo)
        validate_release_lane(pull_requests, objective)
        if not objective and not pull_requests:
            objective = admit_objective(repo, run_id, started_at)
        if objective:
            reconcile_objective_branch(repo, objective)
            verify_canonical_objective(repo, objective)
    except RuntimeError as error:
        artifact = failure_artifact(repo, run_id, started_at, objective, "blocked", str(error), resumed=bool(objective))
        checked = aggregate(repo, run_id, started_at, objective)
        emit_owner_summary(artifact)
        return 0 if checked.returncode == 0 else checked.returncode
    if not objective:
        artifact = failure_artifact(repo, run_id, started_at, None, "no_qualified_work", "No canonical backlog finding is currently eligible for a guarded draft objective.")
        checked = aggregate(repo, run_id, started_at, None)
        emit_owner_summary(artifact)
        return 0 if checked.returncode == 0 else checked.returncode
    prompt_file = repo / PROMPT_RELATIVE
    if not prompt_file.is_file():
        raise RuntimeError(f"Operator prompt is missing: {prompt_file}")
    run_file = repo / RUN_RELATIVE
    run_file.unlink(missing_ok=True)
    agent_cwd = Path(objective["worktree"]).resolve()
    agent_artifact_dir = repo / ".operator" / "agent-artifacts" / run_id.replace(":", "-")
    agent_artifact_dir.mkdir(parents=True, exist_ok=True)
    agent_run_file = agent_artifact_dir / "operator-run-latest.json"
    continuation = f"A validated active objective `{objective['objectiveId']}` exists in `{objective['worktree']}`. Resume it; selecting any new objective is forbidden."
    prompt = (
        prompt_file.read_text(encoding="utf-8")
        + f"\n\nRuntime contract:\n- Run ID: `{run_id}`\n"
        + f"- Started at: `{started_at}`\n"
        + f"- Dedicated base repository: `{repo}`\n"
        + f"- Required sandbox artifact: `{agent_run_file}`\n- {continuation}\n"
        + "Use that exact run ID and startedAt in the required run artifact. Write only to the sandbox artifact path above; the deterministic wrapper imports it into the centralized run contract.\n"
    )
    codex_cli = shutil.which("codex")
    if not codex_cli:
        raise RuntimeError("Codex CLI is unavailable for the sandboxed coding shift.")
    command = [
        codex_cli, "exec", "--sandbox", "workspace-write", "--ephemeral", "--add-dir", str(agent_artifact_dir),
        "-m", MODEL, "-c", 'model_reasoning_effort="low"', prompt,
    ]
    try:
        agent = run_agent(command, agent_cwd, run_id)
    except subprocess.TimeoutExpired:
        shutil.rmtree(agent_artifact_dir, ignore_errors=True)
        final = preserve_initial_objective_lock(repo, objective)
        tracked = objective or final
        artifact = failure_artifact(repo, run_id, started_at, tracked, "continued" if tracked else "failed", "Coding shift exceeded 55 minutes; the process tree was terminated and continuation state was preserved.", resumed=bool(objective))
        checked = aggregate(repo, run_id, started_at, tracked)
        emit_owner_summary(artifact)
        return 124 if checked.returncode == 0 else checked.returncode
    final_after_agent = preserve_initial_objective_lock(repo, objective)
    if agent.returncode != 0:
        shutil.rmtree(agent_artifact_dir, ignore_errors=True)
        blocker = failure_summary(agent.stderr, agent.stdout, "Autonomous operator failed.")
        tracked = objective or final_after_agent
        artifact = failure_artifact(repo, run_id, started_at, tracked, "continued" if tracked else "failed", clean_delivery_text(blocker), resumed=bool(objective))
        checked = aggregate(repo, run_id, started_at, tracked)
        if checked.returncode != 0:
            print(f"Bourbon Signal automation needs attention.\n- Reason: {clean_delivery_text(failure_summary(checked.stderr, checked.stdout, 'Operator failure outcome aggregation failed.'), 240)}")
            return checked.returncode
        emit_owner_summary(artifact)
        return agent.returncode
    import_agent_artifact(repo, agent_run_file)
    artifact, final = validate_transition(repo, objective)
    if artifact.get("outcome") == "continued":
        try:
            artifact["prNumber"] = prepare_draft_pull_request(repo, objective)
            artifact["blocker"] = "Draft PR is preserved for daytime reconciliation, review, guarded merge, deployment, and production verification."
            write_run_artifact(repo, artifact)
        except RuntimeError as error:
            artifact = failure_artifact(repo, run_id, started_at, objective, "continued", str(error), resumed=True)
    expected = objective or final or ({"objectiveId": artifact["objectiveId"]} if artifact.get("objectiveId") else None)
    checked = aggregate(repo, run_id, started_at, expected)
    if checked.returncode != 0:
        print(f"Bourbon Signal automation needs attention.\n- Reason: {clean_delivery_text(failure_summary(checked.stderr, checked.stdout, 'Operator outcome validation failed.'), 240)}")
        return checked.returncode
    emit_owner_summary(artifact)
    return 0


def main() -> int:
    started = datetime.now(timezone.utc)
    started_at = started.isoformat().replace("+00:00", "Z")
    run_id = f"{started_at}-{hashlib.sha256(os.urandom(16)).hexdigest()[:8]}"
    repo = dedicated_repo()
    with release_lane_lease(repo, run_id):
        return run_shift(repo, started_at, run_id)


def record_uncaught_failure(error: Exception) -> None:
    try:
        repo = dedicated_repo()
        started = datetime.now(timezone.utc)
        started_at = started.isoformat().replace("+00:00", "Z")
        run_id = f"{started_at}-{hashlib.sha256(os.urandom(16)).hexdigest()[:8]}"
        with release_lane_lease(repo, run_id):
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
