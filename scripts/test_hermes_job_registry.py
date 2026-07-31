import unittest

from lib.hermes_job_registry import classify_job_ids


class HermesJobRegistryTests(unittest.TestCase):
    def test_requires_explicit_registration_for_every_managed_job(self):
        live = {
            "core-1": {"name": "Bourbon Signal daily company brief"},
            "temp-1": {"name": "Bourbon Signal task completion watcher: temporary"},
            "other-1": {"name": "Bourbon Signal unreviewed broad agent"},
        }
        result = classify_job_ids(live, {"core-1": {}})
        self.assertEqual(result["missing"], [])
        self.assertEqual(result["unexpected"], ["other-1", "temp-1"])

    def test_reports_missing_core_job(self):
        result = classify_job_ids({}, {"core-1": {}})
        self.assertEqual(result, {"missing": ["core-1"], "unexpected": []})


if __name__ == "__main__":
    unittest.main()
