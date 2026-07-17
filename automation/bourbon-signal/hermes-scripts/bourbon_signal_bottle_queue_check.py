import subprocess

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
SCRIPT = REPO / "automation" / "bourbon-signal" / "bottle-queue-autoprocess.mjs"

result = subprocess.run(
    ["node", str(SCRIPT), "--apply"],
    cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=180, check=False,
)
if result.returncode != 0:
    print(f"Bottle queue check failed: {failure_summary(result.stderr, result.stdout)}")
    raise SystemExit(result.returncode)
if result.stdout.strip():
    print(result.stdout.strip())
