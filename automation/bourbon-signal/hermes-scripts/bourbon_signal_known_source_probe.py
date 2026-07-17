import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

REPO = Path(os.environ.get("BOURBON_SIGNAL_REPO", Path.cwd())).resolve()
COLLECTOR = REPO / "automation" / "bourbon-signal" / "source-expansion-collector.mjs"
REPORT = REPO / "automation" / "bourbon-signal" / "reports" / "known-source-probe-latest.json"
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


def read_report() -> dict | None:
    try:
        return json.loads(REPORT.read_text(encoding="utf-8"))
    except Exception:
        return None


def fingerprint(report: dict | None) -> str:
    if not report:
        return ""
    compact = {
        "states": report.get("states", []),
        "summary": report.get("summary", {}),
        "candidates": [
            {key: row.get(key) for key in ("state", "source", "sourceAuthority", "coverageTier", "runnerReachability")}
            for row in report.get("expansionCandidates", [])
        ],
    }
    return hashlib.sha256(json.dumps(compact, sort_keys=True).encode()).hexdigest()


env = load_env(HERMES_ENV)
before = fingerprint(read_report())
available = sorted(path.stem for path in (REPO / "engine" / "out" / "discovery").glob("*.json") if len(path.stem) == 2 and path.stem.isalpha())
if not available:
    raise SystemExit(0)
start = (int(time.time() // 3600) * 5) % len(available)
states = [available[(start + index) % len(available)] for index in range(min(5, len(available)))]
result = subprocess.run(
    ["node", str(COLLECTOR), "--mode=probe", f"--states={','.join(states)}", "--execute", "--apply", "--print"],
    cwd=str(REPO), env=env, capture_output=True, text=True, timeout=480, check=False,
)
if result.returncode != 0:
    message = (result.stderr or result.stdout or "unknown error").strip().splitlines()[-1]
    print(f"Known-source probe failed: {message[:400]}")
    raise SystemExit(result.returncode)
try:
    report = json.loads(result.stdout)
except Exception:
    print("Known-source probe failed: invalid report output")
    raise SystemExit(1)
after = fingerprint(report)
# Material source changes are summarized by the twice-daily semantic review.
# This deterministic probe stays silent unless it fails.
_ = before, after
