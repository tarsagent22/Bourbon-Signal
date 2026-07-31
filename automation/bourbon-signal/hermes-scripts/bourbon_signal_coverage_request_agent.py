import subprocess
import sys

from bourbon_signal_runtime import load_env, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
SCRIPT = REPO / "automation" / "bourbon-signal" / "coverage-request-agent.mjs"

result = subprocess.run(
    ["node", str(SCRIPT)],
    cwd=str(REPO), env=ENV,
    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
)
if result.stdout.strip():
    print(result.stdout.strip())
if result.returncode:
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    raise SystemExit(result.returncode)
