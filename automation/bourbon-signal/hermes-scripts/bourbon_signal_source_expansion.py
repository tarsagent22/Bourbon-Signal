import hashlib
import json
import subprocess

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo, source_candidate_telemetry

ENV = load_env()
ENV.setdefault("BOURBON_SIGNAL_BRAVE_CACHE_MAX_AGE_HOURS", "24")
REPO = resolve_repo(ENV)
COLLECTOR = REPO / "automation" / "bourbon-signal" / "source-expansion-collector.mjs"
ROI = REPO / "automation" / "bourbon-signal" / "source-roi-ranker.mjs"
REPORT = REPO / "automation" / "bourbon-signal" / "reports" / "source-expansion-collector-latest.json"


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


before_report = read_report()
before = fingerprint(before_report)
result = subprocess.run(
    ["node", str(COLLECTOR), "--mode=broad", "--execute", "--apply", "--print"],
    cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=600, check=False,
)
if result.returncode != 0:
    print(f"Broad state discovery failed: {failure_summary(result.stderr, result.stdout)[:400]}")
    raise SystemExit(result.returncode)
try:
    report = json.loads(result.stdout)
except Exception:
    print("Broad state discovery failed: invalid report output")
    raise SystemExit(1)
roi = subprocess.run(["node", str(ROI)], cwd=str(REPO), env=ENV, capture_output=True, text=True, timeout=120, check=False)
if roi.returncode != 0:
    print(f"Source quality scoring failed: {failure_summary(roi.stderr, roi.stdout)[:400]}")
    raise SystemExit(roi.returncode)
after = fingerprint(report)
report["automationTelemetry"] = source_candidate_telemetry(before_report, report)
REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
# Material candidate changes are summarized by the daily semantic review.
# This deterministic collector stays silent unless it fails.
_ = before, after
