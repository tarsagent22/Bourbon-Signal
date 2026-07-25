import importlib.util
import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "automation" / "bourbon-signal" / "hermes-scripts"
sys.path.insert(0, str(SCRIPT_DIR))
spec = importlib.util.spec_from_file_location("autonomous_operator", SCRIPT_DIR / "bourbon_signal_autonomous_operator.py")
operator = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(operator)


def lock_payload(worktree: Path, objective_id: str = "bsf-0123456789abcdef") -> dict:
    return {
        "contractVersion": "bourbon-signal/operator-lock@2",
        "objectiveId": objective_id,
        "issueNumber": 123,
        "title": "Finish a verified operator objective",
        "branch": f"operator/{objective_id}-finish-objective",
        "baseBranch": "main",
        "repo": "tarsagent22/Bourbon-Signal",
        "worktree": str(worktree),
        "remote": "origin",
        "selectedAt": datetime.now(timezone.utc).isoformat(),
        "status": "locked",
    }


def run_artifact(objective_id: str, outcome: str, *, started: bool, complete: bool) -> dict:
    return {
        "contractVersion": "bourbon-signal/operator-run@1",
        "runId": "2026-07-20T10:00:00Z-aaaaaaaa",
        "startedAt": "2026-07-20T10:00:00Z",
        "completedAt": "2026-07-20T10:05:00Z",
        "objectiveId": objective_id,
        "lane": "product_improvement",
        "outcome": outcome,
        "startedObjective": started,
        "resumedObjective": not started,
        "prNumber": 123 if complete else None,
        "merged": complete,
        "deployed": complete,
        "productionVerified": complete,
        "mergeCommitSha": "a" * 40 if complete else None,
        "deploymentId": "dpl_fixture" if complete else None,
        "productionChecks": ["https://bourbonsignal.com/"] if complete else [],
        "findingsQualified": 1,
        "releaseRadarPublished": 0,
        "engineExpansionsCompleted": 0,
        "coverageDelta": 0,
        "discoveryToCompletionHours": 2 if complete else None,
        "blocker": None if complete else "Temporary blocker",
    }


ansi_diff = "\x1b[38;2;218;165;32mreview diff\x1b[0m \x1b[38;2;255;255;255mobjective-lock.json\x1b[0m"
assert operator.clean_delivery_text(ansi_diff) == "review diff objective-lock.json"
completed_summary = operator.owner_summary(run_artifact("bsf-0123456789abcdef", "completed", started=True, complete=True))
assert "Pull request: #123 merged" in completed_summary
assert "Production: verified" in completed_summary
assert "bsf-" not in completed_summary and "contractVersion" not in completed_summary and "\x1b" not in completed_summary
wrapper_source = (SCRIPT_DIR / "bourbon_signal_autonomous_operator.py").read_text(encoding="utf-8")
assert "print(agent.stdout" not in wrapper_source
assert "release-lane.lock" in wrapper_source
assert "gh\", \"pr\", \"list" in wrapper_source
assert '"reset", "--hard"' not in wrapper_source
assert '"merge", "--ff-only", "origin/main"' in wrapper_source
assert '"--sandbox", "workspace-write", "--ephemeral", "--add-dir"' in wrapper_source
assert '"hermes", "-p"' not in wrapper_source
assert "GIT_CONFIG_VALUE_0" in wrapper_source and "GH_CONFIG_DIR" in wrapper_source

operator.validate_release_lane([], None)
operator.validate_release_lane([{"number": 9, "headRefName": "operator/bsf-0123456789abcdef-finish-objective", "baseRefName": "main", "isDraft": True}], {"branch": "operator/bsf-0123456789abcdef-finish-objective"})
for pulls, objective in [
    ([{"number": 1}, {"number": 2}], None),
    ([{"number": 9, "headRefName": "fix/other", "baseRefName": "main", "isDraft": True}], {"branch": "operator/bsf-0123456789abcdef-finish-objective"}),
    ([{"number": 9, "headRefName": "operator/bsf-0123456789abcdef-finish-objective", "baseRefName": "main", "isDraft": False}], {"branch": "operator/bsf-0123456789abcdef-finish-objective"}),
]:
    try:
        operator.validate_release_lane(pulls, objective)
        raise AssertionError("unsafe release lane was accepted")
    except RuntimeError:
        pass


with tempfile.TemporaryDirectory() as directory:
    projects = Path(directory)
    repo = projects / "Bourbon-Signal-autonomous"
    worktree = projects / "Bourbon-Signal-operator-test"
    (repo / ".operator").mkdir(parents=True)
    worktree.mkdir()
    operator.EXPECTED_REPO = repo.resolve()
    original_load_env = operator.load_env
    operator.load_env = lambda: {"PATH": "fixture", "GH_TOKEN": "secret", "VERCEL_TOKEN": "secret", "DATABASE_URL": "secret", "BRAVE_SEARCH_API_KEY": "secret"}
    restricted = operator.restricted_agent_environment(repo, "fixture-run")
    operator.load_env = original_load_env
    assert restricted["PATH"] == "fixture"
    assert not ({"GH_TOKEN", "VERCEL_TOKEN", "DATABASE_URL", "BRAVE_SEARCH_API_KEY"} & set(restricted))
    assert restricted["GIT_CONFIG_VALUE_0"].startswith("disabled-by-bourbon-signal-release-lane")
    assert restricted["GH_CONFIG_DIR"].startswith(str(repo)) and restricted["VERCEL_CONFIG_DIR"].startswith(str(repo))
    with operator.release_lane_lease(repo, "lease-test-one"):
        assert (repo / operator.RELEASE_LANE_LOCK_RELATIVE).is_file()
        guarded = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "run-with-release-lane-lock.py"), "--", sys.executable, "-c", "raise SystemExit(0)"],
            cwd=repo,
            capture_output=True,
            text=True,
        )
        assert guarded.returncode == 1 and "already holds" in guarded.stderr.lower()
        try:
            with operator.release_lane_lease(repo, "lease-test-two"):
                pass
            raise AssertionError("concurrent release writer was accepted")
        except RuntimeError:
            pass
    assert not (repo / operator.RELEASE_LANE_LOCK_RELATIVE).exists()
    lock = lock_payload(worktree)
    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(lock), encoding="utf-8")
    listing = f"worktree {repo}\nHEAD {'0' * 40}\nbranch refs/heads/main\n\nworktree {worktree}\nHEAD {'1' * 40}\nbranch refs/heads/{lock['branch']}\n"
    operator.run = lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, listing, "")
    operator.verify_completion_evidence = lambda *args, **kwargs: None
    assert operator.read_objective_lock(repo)["objectiveId"] == lock["objectiveId"]
    (repo / operator.LOCK_RELATIVE).unlink()
    assert operator.preserve_initial_objective_lock(repo, lock)["objectiveId"] == lock["objectiveId"]

    invalid = {**lock, "branch": "operator/untrusted"}
    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(invalid), encoding="utf-8")
    try:
        operator.read_objective_lock(repo)
        raise AssertionError("invalid lock was accepted")
    except RuntimeError:
        pass
    assert operator.preserve_initial_objective_lock(repo, lock) == lock
    modified = {**lock, "title": "mutated by subprocess"}
    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(modified), encoding="utf-8")
    assert operator.preserve_initial_objective_lock(repo, lock) == lock

    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(lock), encoding="utf-8")
    run_file = repo / operator.RUN_RELATIVE
    run_file.parent.mkdir(parents=True, exist_ok=True)
    run_file.write_text(json.dumps(run_artifact(lock["objectiveId"], "continued", started=False, complete=False)), encoding="utf-8")
    artifact, final = operator.validate_transition(repo, lock)
    assert artifact["outcome"] == "continued" and final["objectiveId"] == lock["objectiveId"]

    original_run = operator.run
    original_list_open = operator.list_open_pull_requests
    close_calls = []
    main_sha = "a" * 40
    head_sha = "b" * 40
    def draft_git(args, cwd, timeout=120):
        if args[:2] == ["git", "status"]:
            return subprocess.CompletedProcess(args, 0, "", "")
        if args[:3] == ["git", "branch", "--show-current"]:
            return subprocess.CompletedProcess(args, 0, lock["branch"], "")
        if args[:2] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(args, 0, main_sha if args[2] == "origin/main" else head_sha, "")
        if args[:2] == ["git", "merge-base"] or args[:2] in (["git", "fetch"], ["git", "push"]):
            return subprocess.CompletedProcess(args, 0, "", "")
        if args[:3] == ["gh", "pr", "create"]:
            return subprocess.CompletedProcess(args, 0, "https://github.com/owner/repo/pull/77", "")
        if args[:3] == ["gh", "pr", "close"]:
            close_calls.append(args)
            return subprocess.CompletedProcess(args, 0, "", "")
        raise AssertionError(f"unexpected command: {args}")
    operator.run = draft_git
    promoted = {"number": 77, "headRefName": lock["branch"], "baseRefName": "main", "headRefOid": head_sha, "isDraft": False}
    promoted_states = iter([[], [promoted]])
    operator.list_open_pull_requests = lambda _repo: next(promoted_states)
    try:
        operator.prepare_draft_pull_request(repo, lock)
        raise AssertionError("owner-promoted PR state was accepted")
    except RuntimeError as error:
        assert "preserved" in str(error).lower()
    assert close_calls == [], "automation must not close owner-promoted or owner-updated work"

    unchanged = {**promoted, "isDraft": True}
    other = {"number": 88, "headRefName": "owner/other", "baseRefName": "main", "headRefOid": "c" * 40, "isDraft": True}
    competing_states = iter([[], [unchanged, other]])
    operator.list_open_pull_requests = lambda _repo: next(competing_states)
    try:
        operator.prepare_draft_pull_request(repo, lock)
        raise AssertionError("competing release lane was accepted")
    except RuntimeError as error:
        assert "unchanged competing draft" in str(error).lower()
    assert len(close_calls) == 1 and close_calls[0][3] == "77"
    operator.run = original_run
    operator.list_open_pull_requests = original_list_open

    unsafe_continuation = run_artifact(lock["objectiveId"], "continued", started=False, complete=False)
    unsafe_continuation["merged"] = True
    run_file.write_text(json.dumps(unsafe_continuation), encoding="utf-8")
    try:
        operator.validate_transition(repo, lock)
        raise AssertionError("continued automation run claimed a merge")
    except RuntimeError:
        pass

    (repo / operator.LOCK_RELATIVE).unlink()
    run_file.write_text(json.dumps(run_artifact(lock["objectiveId"], "completed", started=False, complete=True)), encoding="utf-8")
    try:
        operator.validate_transition(repo, lock)
        raise AssertionError("autonomous completion and merge was accepted")
    except RuntimeError as error:
        assert "draft" in str(error).lower() or "merge" in str(error).lower()

    fabricated = run_artifact(lock["objectiveId"], "completed", started=False, complete=True)
    fabricated["resumedObjective"] = False
    run_file.write_text(json.dumps(fabricated), encoding="utf-8")
    try:
        operator.validate_transition(repo, None)
        raise AssertionError("lockless fabricated completion was accepted")
    except RuntimeError:
        pass

print("Autonomous operator wrapper contract tests passed.")
