import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run-with-release-lane-lock.py"
spec = spec_from_file_location("release_lane_lock", SCRIPT)
module = module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as temp:
    repo = Path(temp)
    operator = repo / ".operator"
    operator.mkdir()
    guard = operator / "release-lane.guard"
    guard.write_bytes(b"0")
    metadata = operator / "release-lane.lock"
    lease_id = "0123456789abcdef"
    metadata.write_text(json.dumps({
        "leaseId": lease_id,
        "pid": os.getpid(),
        "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
    }) + "\n", encoding="utf-8")
    handle = guard.open("r+b")
    module.lock_file(handle)
    try:
        env = dict(os.environ)
        env["BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID"] = lease_id
        ok = subprocess.run(
            [sys.executable, str(SCRIPT), "--", sys.executable, "-c", "raise SystemExit(0)"],
            cwd=repo,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert ok.returncode == 0, ok.stderr

        env["BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID"] = "ffffffffffffffff"
        rejected = subprocess.run(
            [sys.executable, str(SCRIPT), "--", sys.executable, "-c", "raise SystemExit(0)"],
            cwd=repo,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert rejected.returncode != 0
    finally:
        module.unlock_file(handle)
        handle.close()

print("Release-lane nested lease contract passed.")
