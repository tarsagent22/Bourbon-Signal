import subprocess

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
SCRIPT = REPO / "automation" / "bourbon-signal" / "fetch-company-scorecard.mjs"

result = subprocess.run(
    ["node", "--env-file-if-exists=.env.local", "--no-warnings", "--experimental-strip-types", str(SCRIPT), "--apply"],
    cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=120, check=False,
)
if result.returncode != 0:
    print(f"Morning scorecard aggregation failed: {failure_summary(result.stderr, result.stdout)[:400]}")
    raise SystemExit(result.returncode)
