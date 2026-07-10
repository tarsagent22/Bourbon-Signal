const DEFAULT_THRESHOLDS = Object.freeze({
  collectionMinutes: 120,
  exportMinutes: 120,
  uploadMinutes: 120,
  activationMinutes: 120,
  productionObservationMinutes: 12,
  orderingToleranceMinutes: 2,
});

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMinutes(now, value) {
  const time = timestamp(value);
  return time === null ? null : Math.max(0, Math.round(((now - time) / 60_000) * 10) / 10);
}

function result(stage, action, ages, detail = null) {
  return {
    ok: stage === 'healthy',
    freshnessStage: stage,
    recoveryAction: action,
    ages,
    detail,
  };
}

export function classifyFreshnessState(input) {
  const now = Number(input.now ?? Date.now());
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) };
  const ages = {
    collectionMinutes: ageMinutes(now, input.collectionFinishedAt),
    exportMinutes: ageMinutes(now, input.exportGeneratedAt),
    uploadMinutes: ageMinutes(now, input.snapshotUploadedAt),
    activationMinutes: ageMinutes(now, input.snapshotActivatedAt),
    productionObservationMinutes: ageMinutes(now, input.productionObservedAt),
  };
  const collection = timestamp(input.collectionFinishedAt);
  const exported = timestamp(input.exportGeneratedAt);
  const uploaded = timestamp(input.snapshotUploadedAt);
  const activated = timestamp(input.snapshotActivatedAt);
  const observed = timestamp(input.productionObservedAt);
  const tolerance = thresholds.orderingToleranceMinutes * 60_000;

  if (collection === null || ages.collectionMinutes > thresholds.collectionMinutes) {
    return result('collector_delay', 'trigger_guarded_refresh', ages, collection === null ? 'collection_timestamp_missing' : 'collection_stale');
  }
  if (exported === null || exported + tolerance < collection || ages.exportMinutes > thresholds.exportMinutes) {
    return result('exporter_delay', 'rerun_export_only', ages, exported === null ? 'export_timestamp_missing' : 'export_behind_collection');
  }
  if (uploaded === null || uploaded + tolerance < exported || ages.uploadMinutes > thresholds.uploadMinutes) {
    return result('publisher_delay', 'publish_and_activate_existing_export', ages, uploaded === null ? 'upload_timestamp_missing' : 'upload_behind_export');
  }
  if (activated === null || activated + tolerance < uploaded || ages.activationMinutes > thresholds.activationMinutes) {
    return result('activation_delay', 'retry_snapshot_activation', ages, activated === null ? 'activation_timestamp_missing' : 'activation_behind_upload');
  }
  if (observed === null || observed + tolerance < activated || ages.productionObservationMinutes > thresholds.productionObservationMinutes) {
    return result('production_reader_delay', 'verify_production_reader', ages, observed === null ? 'production_observation_missing' : 'production_not_observing_active_snapshot');
  }
  return result('healthy', 'none', ages);
}

export { DEFAULT_THRESHOLDS as FRESHNESS_THRESHOLDS };
