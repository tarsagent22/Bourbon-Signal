import subprocess
from pathlib import Path

from bourbon_signal_runtime import failure_summary, load_env, resolve_repo


def trusted_node() -> Path | None:
    candidate = Path(r"C:\Program Files\nodejs\node.exe")
    try:
        resolved = candidate.resolve(strict=True)
    except OSError:
        return None
    return resolved if str(resolved).casefold() == str(candidate).casefold() and resolved.is_file() else None


def main() -> int:
    environment = load_env()
    environment.pop("NODE_OPTIONS", None)
    environment.pop("NODE_PATH", None)
    repository = resolve_repo(environment)
    node = trusted_node()
    if not node:
        print("Bourbon Signal encrypted Neon backup failed: trusted Node.js installation is unavailable.")
        return 1
    try:
        result = subprocess.run(
            [
                str(node),
                "--no-warnings",
                "--experimental-strip-types",
                str(repository / "scripts" / "backup-neon-secure-http.mjs"),
            ],
            cwd=repository,
            env=environment,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=420,
        )
    except subprocess.TimeoutExpired:
        print("Bourbon Signal encrypted Neon backup failed: secure backup worker exceeded seven minutes.")
        return 1
    if result.returncode:
        print(f"Bourbon Signal encrypted Neon backup failed: {failure_summary(result.stderr, result.stdout)}")
        return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
