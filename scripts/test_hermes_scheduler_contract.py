import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from export_hermes_jobs import read_timezone, reasoning_for, safety_hash

CONFIG = """agent:
  reasoning_overrides:
    gpt-5.6-luna: xhigh
timezone: America/New_York
"""

assert read_timezone(CONFIG, {}) == "America/New_York"
assert read_timezone(CONFIG, {"HERMES_TIMEZONE": "America/New_York"}) == "America/New_York"
assert read_timezone("timezone: EST\n", {"HERMES_TIMEZONE": "America/New_York"}) == "America/New_York"
assert reasoning_for("gpt-5.6-luna", CONFIG) == "xhigh"
assert reasoning_for(None, CONFIG) is None
job = {"prompt": "safe", "skills": ["one"], "enabled_toolsets": ["file"], "no_agent": False}
assert safety_hash(job) == safety_hash(dict(job))
assert safety_hash({**job, "prompt": "changed"}) != safety_hash(job)
assert safety_hash({"no_agent": True}) is None

local_app_data = os.environ.get("LOCALAPPDATA")
if local_app_data:
    hermes_agent = Path(local_app_data) / "hermes" / "hermes-agent"
    if (hermes_agent / "cron" / "jobs.py").is_file():
        sys.path.insert(0, str(hermes_agent))
        from cron import jobs as live_jobs

        eastern = ZoneInfo("America/New_York")
        original_now = live_jobs._hermes_now
        try:
            cases = [
                ("30 5 * * *", datetime(2026, 3, 7, 5, 30, tzinfo=eastern), "2026-03-08T05:30:00-04:00"),
                ("30 5 * * *", datetime(2026, 10, 31, 5, 30, tzinfo=eastern), "2026-11-01T05:30:00-05:00"),
                ("45 2,14 * * *", datetime(2026, 3, 7, 14, 45, tzinfo=eastern), "2026-03-08T14:45:00-04:00"),
            ]
            for expression, last_run, expected in cases:
                live_jobs._hermes_now = lambda value=last_run: value
                actual = live_jobs.compute_next_run({"kind": "cron", "expr": expression}, last_run.isoformat())
                assert actual == expected, f"Hermes DST drift: {expression} produced {actual}, expected {expected}"
        finally:
            live_jobs._hermes_now = original_now

print("Hermes scheduler contract tests passed.")
