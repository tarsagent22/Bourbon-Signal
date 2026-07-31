def classify_job_ids(live_by_id: dict, expected_by_id: dict) -> dict[str, list[str]]:
    return {
        "missing": sorted(set(expected_by_id) - set(live_by_id)),
        "unexpected": sorted(set(live_by_id) - set(expected_by_id)),
    }
