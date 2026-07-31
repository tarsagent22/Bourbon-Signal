import json
import hashlib
import os
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run-with-release-lane-lock.py"

with tempfile.TemporaryDirectory() as temp:
    repo = Path(temp)
    isolated_script = repo / "run-with-release-lane-lock.py"
    source = SCRIPT.read_text(encoding="utf-8")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        test_broker_port = probe.getsockname()[1]
    source = source.replace("BROKER_PORT = 47683", f"BROKER_PORT = {test_broker_port}")
    canonical_line = '    host_root = (Path.home() / "AppData" / "Local" / "hermes") if os.name == "nt" else (Path.home() / ".hermes")'
    assert canonical_line in source
    assert "socket.SO_REUSEADDR" in source
    assert source.index("register_objective_repository(repo, operator)") < source.index("return subprocess.run(arguments, cwd=repo, env=environment")
    isolated_script.write_text(source.replace(canonical_line, f"    host_root = Path({str(repo / 'hermes')!r})"), encoding="utf-8")
    spec = spec_from_file_location("release_lane_lock_isolated", isolated_script)
    module = module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    operator = module.shared_release_lane_directory(repo)
    operator.mkdir(parents=True, exist_ok=True)
    guard = operator / "release-lane.guard"
    guard.write_bytes(b"0")
    metadata = operator / "release-lane.lock"
    lease_id = "0123456789abcdef"
    inheritance_token = "fixture-inheritance-token"
    metadata.write_text(json.dumps({
        "leaseId": lease_id,
        "pid": os.getpid(),
        "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
        "inheritanceDigest": hashlib.sha256(inheritance_token.encode("utf-8")).hexdigest(),
    }) + "\n", encoding="utf-8")
    handle = guard.open("r+b")
    module.lock_file(handle)
    broker = module.start_broker(inheritance_token)
    try:
        idle = socket.create_connection(("127.0.0.1", module.BROKER_PORT), timeout=2)
        time.sleep(2.2)
        idle.close()
        time.sleep(0.1)
        assert broker[2].is_alive(), "an idle client must not kill the lock-owner broker"
        fragmented = socket.create_connection(("127.0.0.1", module.BROKER_PORT), timeout=2)
        fragmented.sendall(inheritance_token[:8].encode("ascii"))
        fragmented.sendall(inheritance_token[8:].encode("ascii") + b"\n")
        assert module.receive_frame(fragmented, 16) == b"OK"
        fragmented.close()
        left, right = socket.socketpair()
        try:
            right.sendall(b"O")
            right.sendall(b"K\n")
            assert module.receive_frame(left, 16) == b"OK"
        finally:
            left.close()
            right.close()
        env = dict(os.environ)
        env["BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID"] = lease_id
        env["BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN"] = inheritance_token
        ok = subprocess.run(
            [sys.executable, str(isolated_script), "--", sys.executable, "-c", "raise SystemExit(0)"],
            cwd=repo,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert ok.returncode == 0, ok.stderr

        forged = dict(env)
        forged["BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN"] = "public-metadata-is-insufficient"
        rejected_forgery = subprocess.run(
            [sys.executable, str(isolated_script), "--", sys.executable, "-c", "raise SystemExit(0)"],
            cwd=repo, env=forged, capture_output=True, text=True, timeout=30,
        )
        assert rejected_forgery.returncode != 0

        env["BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID"] = "ffffffffffffffff"
        rejected = subprocess.run(
            [sys.executable, str(isolated_script), "--", sys.executable, "-c", "raise SystemExit(0)"],
            cwd=repo,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert rejected.returncode != 0
    finally:
        server, stopping, thread = broker
        stopping.set()
        server.close()
        thread.join(timeout=1)
        metadata.unlink(missing_ok=True)
        module.unlock_file(handle)
        handle.close()

    objective_dir = repo / ".operator"
    objective_dir.mkdir()
    (objective_dir / "objective-lock.json").write_text(json.dumps({"branch": "objective/test"}) + "\n", encoding="utf-8")
    synced = subprocess.run(
        [sys.executable, str(isolated_script), "--", sys.executable, "-c", "raise SystemExit(0)"],
        cwd=repo, env=dict(os.environ), capture_output=True, text=True, timeout=30,
    )
    assert synced.returncode == 0, synced.stderr
    registry_files = list((operator / "objectives").glob("*.json"))
    assert len(registry_files) == 1
    assert json.loads(registry_files[0].read_text(encoding="utf-8"))["objective"]["branch"] == "objective/test"
    (objective_dir / "objective-lock.json").unlink()
    cleared = subprocess.run(
        [sys.executable, str(isolated_script), "--", sys.executable, "-c", "raise SystemExit(0)"],
        cwd=repo, env=dict(os.environ), capture_output=True, text=True, timeout=30,
    )
    assert cleared.returncode == 0, cleared.stderr
    assert not list((operator / "objectives").glob("*.json"))

with tempfile.TemporaryDirectory() as temp:
    repo = Path(temp) / "repo"
    independent_clone = Path(temp) / "independent-clone"
    repo.mkdir()
    independent_clone.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "init"], cwd=independent_clone, check=True, capture_output=True)
    assert module.shared_release_lane_directory(repo) == module.shared_release_lane_directory(independent_clone)

print("Release-lane nested and cross-clone lease contracts passed.")
