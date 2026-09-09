import unittest

from lib.hermes_job_registry import classify_job_ids
from export_hermes_jobs import SOURCE_SCOUT_JOB_ID, is_managed_job


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

    def test_source_scout_export_requires_the_exact_canonical_checkout(self):
        self.assertTrue(is_managed_job({"id": SOURCE_SCOUT_JOB_ID, "workdir": "C:/Users/chand/projects/bs-source-scout-runtime"}))
        self.assertTrue(is_managed_job({"id": SOURCE_SCOUT_JOB_ID, "workdir": r"C:\Users\chand\projects\bs-source-scout-runtime"}))
        self.assertFalse(is_managed_job({"id": SOURCE_SCOUT_JOB_ID, "workdir": "C:/untrusted/bs-source-scout-runtime"}))


if __name__ == "__main__":
    unittest.main()
