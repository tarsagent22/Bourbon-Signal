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
print("Hermes scheduler contract tests passed.")
