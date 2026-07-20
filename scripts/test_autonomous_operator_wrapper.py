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


with tempfile.TemporaryDirectory() as directory:
    projects = Path(directory)
    repo = projects / "Bourbon-Signal-autonomous"
    worktree = projects / "Bourbon-Signal-operator-test"
    (repo / ".operator").mkdir(parents=True)
    worktree.mkdir()
    operator.EXPECTED_REPO = repo.resolve()
    lock = lock_payload(worktree)
    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(lock), encoding="utf-8")
    listing = f"worktree {repo}\nHEAD {'0' * 40}\nbranch refs/heads/main\n\nworktree {worktree}\nHEAD {'1' * 40}\nbranch refs/heads/{lock['branch']}\n"
    operator.run = lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, listing, "")
    operator.verify_completion_evidence = lambda *args, **kwargs: None
    assert operator.read_objective_lock(repo)["objectiveId"] == lock["objectiveId"]

    invalid = {**lock, "branch": "operator/untrusted"}
    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(invalid), encoding="utf-8")
    try:
        operator.read_objective_lock(repo)
        raise AssertionError("invalid lock was accepted")
    except RuntimeError:
        pass

    (repo / operator.LOCK_RELATIVE).write_text(json.dumps(lock), encoding="utf-8")
    run_file = repo / operator.RUN_RELATIVE
    run_file.parent.mkdir(parents=True, exist_ok=True)
    run_file.write_text(json.dumps(run_artifact(lock["objectiveId"], "continued", started=False, complete=False)), encoding="utf-8")
    artifact, final = operator.validate_transition(repo, lock)
    assert artifact["outcome"] == "continued" and final["objectiveId"] == lock["objectiveId"]

    (repo / operator.LOCK_RELATIVE).unlink()
    run_file.write_text(json.dumps(run_artifact(lock["objectiveId"], "completed", started=False, complete=True)), encoding="utf-8")
    artifact, final = operator.validate_transition(repo, lock)
    assert artifact["outcome"] == "completed" and final is None

    fabricated = run_artifact(lock["objectiveId"], "completed", started=False, complete=True)
    fabricated["resumedObjective"] = False
    run_file.write_text(json.dumps(fabricated), encoding="utf-8")
    try:
        operator.validate_transition(repo, None)
        raise AssertionError("lockless fabricated completion was accepted")
    except RuntimeError:
        pass

print("Autonomous operator wrapper contract tests passed.")
