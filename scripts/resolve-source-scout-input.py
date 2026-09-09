"""Hermes cron launcher for the Node.js source-scout resolver.

Hermes executes non-shell cron scripts with Python, so the scheduler must point
at this launcher rather than directly at the .mjs module.
"""
from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys


def main() -> int:
    node = shutil.which("node.exe") or shutil.which("node")
    resolver = pathlib.Path(__file__).with_name("resolve-source-scout-input.mjs")
    if not node:
        print("Source-scout resolver failed: Node.js is unavailable.")
        return 1
    if not resolver.is_file():
        print(f"Source-scout resolver failed: missing {resolver.name}.")
        return 1

    repository = pathlib.Path('C:/Users/chand/projects/bs-source-scout-runtime')
    preflight = subprocess.run(
        ['git', '-C', str(repository), 'rev-parse', '--show-toplevel'],
        text=True, capture_output=True, timeout=15,
    )
    if preflight.returncode or pathlib.Path(preflight.stdout.strip()).resolve() != repository.resolve():
        print('Source-scout resolver failed: configured repository root is unavailable.')
        return 1

    try:
        result = subprocess.run(
            [node, str(resolver), '--repository-root', str(repository)],
            cwd=repository,
            text=True,
            capture_output=True,
            timeout=150,
        )
    except subprocess.TimeoutExpired:
        print("Source-scout resolver failed: Node.js resolver exceeded 150 seconds.")
        return 1

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown resolver error").strip()
        print(f"Source-scout resolver failed: {detail}")
        return result.returncode or 1

    sys.stdout.write(result.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
