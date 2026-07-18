import importlib.util
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "automation" / "bourbon-signal" / "hermes-scripts" / "bourbon_signal_runtime.py"
spec = importlib.util.spec_from_file_location("bourbon_signal_runtime", MODULE_PATH)
assert spec and spec.loader
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def make_repo(path: Path) -> Path:
    (path / "automation" / "bourbon-signal").mkdir(parents=True)
    (path / "engine" / "src").mkdir(parents=True)
    (path / "engine" / "src" / "run-state.mjs").write_text("", encoding="utf-8")
    (path / "package.json").write_text('{"name":"bourbon-signal"}', encoding="utf-8")
    return path


with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    explicit = make_repo(root / "explicit")
    with patch.dict(os.environ, {"BOURBON_SIGNAL_REPO": str(explicit)}, clear=True):
        assert runtime.resolve_repo(dict(os.environ)) == explicit.resolve()

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    repo = make_repo(root / "repo")
    local_app_data = root / "LocalAppData"
    jobs_path = local_app_data / "hermes" / "cron" / "jobs.json"
    jobs_path.parent.mkdir(parents=True)
    other_repo = make_repo(root / "other-repo")
    jobs_path.write_text(json.dumps({"jobs": [
        {"name": "Unrelated project", "workdir": str(other_repo)},
        {"name": "Bourbon Signal test job", "workdir": str(repo)},
    ]}), encoding="utf-8")
    with patch.dict(os.environ, {"LOCALAPPDATA": str(local_app_data)}, clear=True), patch.object(runtime.Path, "cwd", return_value=root / "empty"):
        assert runtime.resolve_repo(dict(os.environ)) == repo.resolve()

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    local_app_data = root / "LocalAppData"
    jobs_path = local_app_data / "hermes" / "cron" / "jobs.json"
    jobs_path.parent.mkdir(parents=True)
    jobs_path.write_text(json.dumps({"jobs": [
        {"name": "Bourbon Signal primary", "workdir": str(make_repo(root / "primary"))},
        {"script": "bourbon_signal_secondary.py", "workdir": str(make_repo(root / "secondary"))},
    ]}), encoding="utf-8")
    with patch.dict(os.environ, {"LOCALAPPDATA": str(local_app_data)}, clear=True), patch.object(runtime.Path, "cwd", return_value=root / "empty"):
        try:
            runtime.resolve_repo(dict(os.environ))
            raise AssertionError("ambiguous Bourbon Signal repositories must fail closed")
        except RuntimeError as error:
            assert "Multiple Bourbon Signal repositories" in str(error)

summary = runtime.failure_summary(
    "node:internal/modules/cjs/loader:123\nError: Cannot find module 'collector.mjs'\n    at loader\nNode.js v24.15.0",
    "",
)
assert summary == "Error: Cannot find module 'collector.mjs'"

assert runtime.release_radar_change_summary({
    "summary": {"new": 0, "materiallyChanged": 1, "total": 46, "queuedForSemanticReview": 12}
}) == "Release Radar lead collector: 1 materially changed lead requires review (46 retained; 12 queued); nothing was published or alerted."
assert runtime.release_radar_change_summary({
    "summary": {"new": 0, "materiallyChanged": 0, "total": 46, "queuedForSemanticReview": 0}
}) is None
print("Bourbon Signal Hermes runtime tests passed.")
