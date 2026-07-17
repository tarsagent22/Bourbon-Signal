import hashlib
import json
import subprocess
import time

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo

ENV = load_env()
REPO = resolve_repo(ENV)
COLLECTOR = REPO / "automation" / "bourbon-signal" / "source-expansion-collector.mjs"
REPORT = REPO / "automation" / "bourbon-signal" / "reports" / "known-source-probe-latest.json"


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


before = fingerprint(read_report())
available = sorted(path.stem for path in (REPO / "engine" / "out" / "discovery").glob("*.json") if len(path.stem) == 2 and path.stem.isalpha())
if not available:
    raise SystemExit(0)
start = (int(time.time() // 3600) * 5) % len(available)
states = [available[(start + index) % len(available)] for index in range(min(5, len(available)))]
result = subprocess.run(
    ["node", str(COLLECTOR), "--mode=probe", f"--states={','.join(states)}", "--execute", "--apply", "--print"],
    cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=480, check=False,
)
if result.returncode != 0:
    print(f"Known-source probe failed: {failure_summary(result.stderr, result.stdout)[:400]}")
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
