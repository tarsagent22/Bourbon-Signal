import pathlib
import shutil
import subprocess

CANDIDATES = [
    pathlib.Path(r"C:\c\Users\chand\projects\Bourbon-Signal-autonomous"),
    pathlib.Path(r"C:\c\Users\chand\projects\bs-storage-neon"),
    pathlib.Path(r"C:\Users\chand\projects\bs-remove-weekly-dashboard"),
]
repo = next((path for path in CANDIDATES if (path / "scripts" / "backup-neon-local.mjs").exists()), None)
if repo is None:
    print("Bourbon Signal encrypted Neon backup failed: no checkout contains scripts/backup-neon-local.mjs")
    raise SystemExit(1)

vercel = shutil.which("vercel.cmd") or shutil.which("vercel")
if not vercel:
    print("Bourbon Signal encrypted Neon backup failed: Vercel CLI is unavailable")
    raise SystemExit(1)

result = subprocess.run(
    [vercel, "env", "run", "-e", "production", "--", "npm", "run", "backup:neon-local"],
    cwd=repo,
    text=True,
    capture_output=True,
    timeout=900,
)
if result.returncode != 0:
    details = (result.stderr or result.stdout or "unknown error").strip().splitlines()
    print("Bourbon Signal encrypted Neon backup failed: " + (details[-1] if details else "unknown error"))
    raise SystemExit(result.returncode or 1)
