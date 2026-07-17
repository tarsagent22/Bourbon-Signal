import os
import subprocess
from pathlib import Path

REPO = Path(os.environ.get("BOURBON_SIGNAL_REPO", Path.cwd())).resolve()
SCRIPT = REPO / "automation" / "bourbon-signal" / "fetch-company-scorecard.mjs"
HERMES_ENV = Path(os.environ.get("HERMES_ENV_FILE") or (Path(os.environ.get("HERMES_HOME") or (Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "hermes")) / ".env"))


def load_env(path: Path) -> dict[str, str]:
    env = dict(os.environ)
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


result = subprocess.run(
    ["node", "--env-file-if-exists=.env.local", "--no-warnings", "--experimental-strip-types", str(SCRIPT), "--apply"],
    cwd=str(REPO), env=load_env(HERMES_ENV), capture_output=True, text=True, timeout=120, check=False,
)
if result.returncode != 0:
    message = (result.stderr or result.stdout or "unknown error").strip().splitlines()[-1]
    print(f"Morning scorecard aggregation failed: {message[:400]}")
    raise SystemExit(result.returncode)
