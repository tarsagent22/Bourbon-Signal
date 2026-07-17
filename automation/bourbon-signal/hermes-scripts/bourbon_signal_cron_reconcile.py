import subprocess

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
result = subprocess.run(
    ["python", str(REPO / "scripts" / "reconcile_hermes_jobs.py")],
    cwd=str(REPO), env=ENV, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=90,
)
if result.stdout.strip():
    print(result.stdout.strip())
if result.returncode != 0:
    print(failure_summary(result.stderr, result.stdout, "Scheduler reconciliation failed."))
    raise SystemExit(result.returncode)
