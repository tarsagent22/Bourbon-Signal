import hashlib
import json
import os
import subprocess
from pathlib import Path

REPO = Path(os.environ.get("BOURBON_SIGNAL_REPO", Path.cwd())).resolve()
COLLECTOR = REPO / "automation" / "bourbon-signal" / "source-expansion-collector.mjs"
ROI = REPO / "automation" / "bourbon-signal" / "source-roi-ranker.mjs"
REPORT = REPO / "automation" / "bourbon-signal" / "reports" / "source-expansion-collector-latest.json"
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
    env.setdefault("BOURBON_SIGNAL_BRAVE_CACHE_MAX_AGE_HOURS", "24")
    return env


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


def read_report() -> dict | None:
    try:
        return json.loads(REPORT.read_text(encoding="utf-8"))
    except Exception:
        return None


env = load_env(HERMES_ENV)
before = fingerprint(read_report())
result = subprocess.run(
    ["node", str(COLLECTOR), "--mode=broad", "--execute", "--apply", "--print"],
    cwd=str(REPO), env=env, capture_output=True, text=True, timeout=600, check=False,
)
if result.returncode != 0:
    message = (result.stderr or result.stdout or "unknown error").strip().splitlines()[-1]
    print(f"Broad state discovery failed: {message[:400]}")
    raise SystemExit(result.returncode)
try:
    report = json.loads(result.stdout)
except Exception:
    print("Broad state discovery failed: invalid report output")
    raise SystemExit(1)
roi = subprocess.run(["node", str(ROI)], cwd=str(REPO), env=env, capture_output=True, text=True, timeout=120, check=False)
if roi.returncode != 0:
    message = (roi.stderr or roi.stdout or "unknown error").strip().splitlines()[-1]
    print(f"Source quality scoring failed: {message[:400]}")
    raise SystemExit(roi.returncode)
after = fingerprint(report)
# Material candidate changes are summarized by the twice-daily semantic review.
# This deterministic collector stays silent unless it fails.
_ = before, after
