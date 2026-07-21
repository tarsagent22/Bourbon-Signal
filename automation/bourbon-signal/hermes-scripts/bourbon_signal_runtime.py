import json
import os
from pathlib import Path


def hermes_home() -> Path:
    if os.environ.get("HERMES_HOME"):
        return Path(os.environ["HERMES_HOME"]).resolve()
    if os.environ.get("LOCALAPPDATA"):
        return (Path(os.environ["LOCALAPPDATA"]) / "hermes").resolve()
    home = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    if home:
        return (Path(home) / "AppData" / "Local" / "hermes").resolve()
    return (Path.cwd() / ".hermes").resolve()


def hermes_env_path() -> Path:
    return Path(os.environ.get("HERMES_ENV_FILE") or (hermes_home() / ".env")).resolve()


def load_env(path: Path | None = None) -> dict[str, str]:
    env = dict(os.environ)
    source = path or hermes_env_path()
    if source.exists():
        for raw in source.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def _is_repo(path: Path) -> bool:
    try:
        package = json.loads((path / "package.json").read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return False
    return (
        package.get("name") == "bourbon-signal"
        and (path / "automation" / "bourbon-signal").is_dir()
        and (path / "engine" / "src" / "run-state.mjs").is_file()
    )


def resolve_repo(env: dict[str, str] | None = None) -> Path:
    effective = env or dict(os.environ)
    if effective.get("BOURBON_SIGNAL_REPO"):
        explicit = Path(effective["BOURBON_SIGNAL_REPO"]).expanduser().resolve()
        if not _is_repo(explicit):
            raise RuntimeError("BOURBON_SIGNAL_REPO does not identify the Bourbon Signal repository.")
        return explicit

    candidates: list[Path] = [Path.cwd()]

    jobs_path = hermes_home() / "cron" / "jobs.json"
    try:
        payload = json.loads(jobs_path.read_text(encoding="utf-8"))
        jobs = payload.get("jobs", payload) if isinstance(payload, dict) else payload
        for job in jobs if isinstance(jobs, list) else []:
            if not isinstance(job, dict):
                continue
            name = str(job.get("name") or "")
            script = str(job.get("script") or "")
            if not (name.startswith("Bourbon Signal") or script.startswith("bourbon_signal_")):
                continue
            workdir = job.get("workdir")
            if workdir:
                candidates.append(Path(workdir))
    except (OSError, ValueError, TypeError):
        pass

    valid: dict[str, Path] = {}
    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        key = str(resolved).casefold()
        if _is_repo(resolved):
            valid[key] = resolved
    if len(valid) == 1:
        return next(iter(valid.values()))
    if len(valid) > 1:
        raise RuntimeError(
            "Multiple Bourbon Signal repositories are configured. Set BOURBON_SIGNAL_REPO explicitly."
        )
    raise RuntimeError(
        "Bourbon Signal repository not found. Set BOURBON_SIGNAL_REPO or configure a valid cron workdir."
    )


def release_radar_change_summary(payload: dict) -> str | None:
    summary = payload.get("summary") if isinstance(payload, dict) else {}
    summary = summary if isinstance(summary, dict) else {}
    new_count = int(summary.get("new") or 0)
    changed_count = int(summary.get("materiallyChanged") or 0)
    if new_count <= 0 and changed_count <= 0:
        return None
    total = int(summary.get("total") or 0)
    queued = int(summary.get("queuedForSemanticReview") or 0)
    parts = []
    if new_count:
        parts.append(f"{new_count} new lead{'s' if new_count != 1 else ''}")
    if changed_count:
        parts.append(f"{changed_count} materially changed lead{'s' if changed_count != 1 else ''}")
    return (
        f"Release Radar lead collector: {' and '.join(parts)} require{'s' if len(parts) == 1 and parts[0].startswith('1 ') else ''} review "
        f"({total} retained; {queued} queued); nothing was published or alerted."
    )


def nc_radar_change_summary(payload: dict) -> str | None:
    summary = payload.get("summary") if isinstance(payload, dict) else {}
    summary = summary if isinstance(summary, dict) else {}
    changed = int(summary.get("materiallyChanged") or 0)
    failures = int(summary.get("reviewFailures") or 0)
    expired = int(summary.get("newlyExpired") or 0)
    if changed <= 0 and failures <= 0 and expired <= 0:
        return None
    parts = []
    if changed:
        parts.append(f"{changed} official source change{'s' if changed != 1 else ''}")
    if failures:
        parts.append(f"{failures} repeated source failure{'s' if failures != 1 else ''}")
    if expired:
        parts.append(f"{expired} newly closed opportunit{'ies' if expired != 1 else 'y'}")
    queued = int(summary.get("queuedForSemanticReview") or 0)
    return f"NC Release Radar monitor: {', '.join(parts)} ({queued} queued for review); nothing was auto-published or alerted."


def failure_summary(stderr: str | None, stdout: str | None, fallback: str = "unknown error") -> str:
    lines = [line.strip() for line in f"{stderr or ''}\n{stdout or ''}".splitlines() if line.strip()]
    useful = [
        line for line in lines
        if not line.startswith("at ")
        and not line.startswith("node:internal")
        and not line.startswith("Node.js v")
        and line != "^"
    ]
    error_lines = [line for line in useful if "error" in line.casefold() or "failed" in line.casefold()]
    return (error_lines[-1] if error_lines else useful[-1] if useful else fallback)[:500]
