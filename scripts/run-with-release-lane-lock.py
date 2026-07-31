from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def lock_file(handle) -> None:
    handle.seek(0)
    if os.name == "nt":
        import msvcrt
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def unlock_file(handle) -> None:
    handle.seek(0)
    if os.name == "nt":
        import msvcrt
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def main() -> int:
    arguments = sys.argv[1:]
    if arguments and arguments[0] == "--":
        arguments = arguments[1:]
    if not arguments:
        raise RuntimeError("A command is required after --.")

    repo = Path.cwd().resolve()
    operator = repo / ".operator"
    operator.mkdir(parents=True, exist_ok=True)
    guard = operator / "release-lane.guard"
    metadata = operator / "release-lane.lock"

    inherited_lease = os.environ.get("BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID")
    if inherited_lease:
        try:
            current = json.loads(metadata.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError) as error:
            raise RuntimeError("Inherited release-lane lease metadata is unavailable.") from error
        if current.get("leaseId") != inherited_lease:
            raise RuntimeError("Inherited release-lane lease does not match the active writer.")
        owner_pid = current.get("pid")
        if not isinstance(owner_pid, int) or owner_pid <= 0:
            raise RuntimeError("Inherited release-lane lease has no valid owner process.")
        try:
            os.kill(owner_pid, 0)
        except OSError as error:
            raise RuntimeError("Inherited release-lane lease owner is no longer active.") from error
        try:
            expires_at = datetime.fromisoformat(str(current.get("expiresAt") or "").replace("Z", "+00:00"))
        except ValueError as error:
            raise RuntimeError("Inherited release-lane lease expiry is invalid.") from error
        if expires_at <= datetime.now(timezone.utc):
            raise RuntimeError("Inherited release-lane lease has expired.")
        return subprocess.run(arguments, cwd=repo, env=dict(os.environ), check=False).returncode

    handle = guard.open("a+b")
    if guard.stat().st_size == 0:
        handle.write(b"0")
        handle.flush()
    try:
        lock_file(handle)
    except OSError as error:
        handle.close()
        raise RuntimeError("Another release-lane writer already holds the OS lock.") from error

    acquired = datetime.now(timezone.utc)
    lease_id = hashlib.sha256(os.urandom(16)).hexdigest()[:16]
    payload = {
        "contractVersion": "bourbon-signal/release-lane-lease@1",
        "leaseId": lease_id,
        "runId": f"daytime-{lease_id}",
        "pid": os.getpid(),
        "acquiredAt": acquired.isoformat().replace("+00:00", "Z"),
        "expiresAt": (acquired + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
    }
    try:
        metadata.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        environment = dict(os.environ)
        environment["BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID"] = lease_id
        return subprocess.run(arguments, cwd=repo, env=environment, check=False).returncode
    finally:
        try:
            current = json.loads(metadata.read_text(encoding="utf-8")) if metadata.is_file() else {}
            if current.get("leaseId") == lease_id:
                metadata.unlink(missing_ok=True)
        finally:
            unlock_file(handle)
            handle.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Release-lane writer guard failed: {error}", file=sys.stderr)
        raise SystemExit(1)
