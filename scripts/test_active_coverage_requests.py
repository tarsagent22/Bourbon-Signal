from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / "automation" / "bourbon-signal" / "hermes-scripts" / "bourbon_signal_active_coverage_requests.py"
source = target.read_text(encoding="utf-8")
assert 'vercel' in source and 'env' in source and 'run' in source
assert 'coverage_request_automation_jobs' in source
assert 'user_id' not in source.lower()
assert 'automationHealth' in source
print('Active coverage request brief contract passed')
