from __future__ import annotations

import hashlib
import hmac
import json
import os
import socket
import subprocess
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path


BROKER_PORT = 47683


def receive_frame(sock: socket.socket, limit: int = 256) -> bytes:
    frame = bytearray()
    while b"\n" not in frame:
        if len(frame) >= limit:
            raise RuntimeError("Release-lane broker frame exceeded its limit.")
        chunk = sock.recv(min(64, limit - len(frame)))
        if not chunk:
            break
        frame.extend(chunk)
    return bytes(frame).split(b"\n", 1)[0]


def assert_broker(inheritance_token: str) -> None:
    with socket.create_connection(("127.0.0.1", BROKER_PORT), timeout=2) as client:
        client.sendall(inheritance_token.encode("ascii") + b"\n")
        if receive_frame(client, 16) != b"OK":
            raise RuntimeError("Inherited release-lane broker rejected the child capability.")


def start_broker(inheritance_token: str):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    elif os.name != "nt":
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", BROKER_PORT))
    server.listen(8)
    server.settimeout(0.2)
    stopping = threading.Event()

    def serve() -> None:
        while not stopping.is_set():
            try:
                client, _ = server.accept()
            except TimeoutError:
                continue
            except OSError:
                break
            with client:
                try:
                    client.settimeout(2)
                    supplied = receive_frame(client).decode("ascii", errors="ignore")
                    client.sendall(b"OK\n" if hmac.compare_digest(supplied, inheritance_token) else b"NO\n")
                except (OSError, RuntimeError):
                    continue

    thread = threading.Thread(target=serve, name="release-lane-broker", daemon=True)
    thread.start()
    return server, stopping, thread


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


def shared_release_lane_directory(repo: Path) -> Path:
    host_root = (Path.home() / "AppData" / "Local" / "hermes") if os.name == "nt" else (Path.home() / ".hermes")
    return (host_root / "kanban" / "boards" / "bourbon-signal-coverage" / "release-lane").resolve()


def objective_registry_target(repo: Path, shared: Path) -> Path:
    identity = str(repo).casefold() if os.name == "nt" else str(repo)
    return shared / "objectives" / f"{hashlib.sha256(identity.encode('utf-8')).hexdigest()}.json"


def register_objective_repository(repo: Path, shared: Path) -> None:
    source = repo / ".operator" / "objective-lock.json"
    target = objective_registry_target(repo, shared)
    target.parent.mkdir(parents=True, exist_ok=True)
    objective = json.loads(source.read_text(encoding="utf-8")) if source.is_file() else {"registrationPending": True}
    payload = {"contractVersion": "bourbon-signal/objective-registry@1", "repository": str(repo), "objective": objective}
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)


def sync_objective_registry(repo: Path, shared: Path) -> None:
    source = repo / ".operator" / "objective-lock.json"
    target = objective_registry_target(repo, shared)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        target.unlink(missing_ok=True)
        return
    objective = json.loads(source.read_text(encoding="utf-8"))
    payload = {"contractVersion": "bourbon-signal/objective-registry@1", "repository": str(repo), "objective": objective}
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)


def main() -> int:
    arguments = sys.argv[1:]
    if arguments and arguments[0] == "--":
        arguments = arguments[1:]
    if not arguments:
        raise RuntimeError("A command is required after --.")

    repo = Path.cwd().resolve()
    operator = shared_release_lane_directory(repo)
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
        inheritance_token = os.environ.get("BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN", "")
        inheritance_digest = hashlib.sha256(inheritance_token.encode("utf-8")).hexdigest() if inheritance_token else ""
        if not inheritance_token or current.get("inheritanceDigest") != inheritance_digest:
            raise RuntimeError("Inherited release-lane lease lacks the non-forgeable parent capability.")
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
        assert_broker(inheritance_token)
        environment = dict(os.environ)
        environment["BOURBON_SIGNAL_RELEASE_LANE_VALIDATED"] = "1"
        return subprocess.run(arguments, cwd=repo, env=environment, check=False).returncode

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
    inheritance_token = hashlib.sha256(os.urandom(32)).hexdigest()
    broker = None
    payload = {
        "contractVersion": "bourbon-signal/release-lane-lease@1",
        "leaseId": lease_id,
        "runId": f"daytime-{lease_id}",
        "pid": os.getpid(),
        "acquiredAt": acquired.isoformat().replace("+00:00", "Z"),
        "expiresAt": (acquired + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
        "inheritanceDigest": hashlib.sha256(inheritance_token.encode("utf-8")).hexdigest(),
    }
    try:
        broker = start_broker(inheritance_token)
        metadata.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        register_objective_repository(repo, operator)
        environment = dict(os.environ)
        environment["BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID"] = lease_id
        environment["BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN"] = inheritance_token
        environment["BOURBON_SIGNAL_RELEASE_LANE_VALIDATED"] = "1"
        return subprocess.run(arguments, cwd=repo, env=environment, check=False).returncode
    finally:
        if broker:
            server, stopping, thread = broker
            stopping.set()
            server.close()
            thread.join(timeout=1)
        try:
            sync_objective_registry(repo, operator)
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
