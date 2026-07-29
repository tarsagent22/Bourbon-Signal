import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "automation" / "bourbon-signal" / "hermes-scripts" / "bourbon_signal_morning_scorecard.py"
sys.path.insert(0, str(MODULE_PATH.parent))
spec = importlib.util.spec_from_file_location("bourbon_signal_morning_scorecard", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

direct = module.build_scorecard_command(
    {"COMPANY_SCORECARD_READ_SECRET": "configured", "BOURBON_SIGNAL_REPO": str(ROOT)},
)
assert direct[0] == "node"
assert "fetch-company-scorecard.mjs" in " ".join(direct)

try:
    module.build_scorecard_command({"BOURBON_SIGNAL_REPO": str(ROOT)})
    raise AssertionError("an empty local scorecard secret must fail closed")
except RuntimeError as error:
    assert "local scorecard read secret" in str(error)

print("Morning scorecard wrapper contracts passed.")
