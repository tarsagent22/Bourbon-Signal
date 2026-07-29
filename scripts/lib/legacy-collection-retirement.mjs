export function assessLegacyCollectionRetirement({
  legacyBottleCount,
  durableBottleCount,
  backupBottleCount,
  durableVersion,
  legacyFingerprint,
  durableFingerprint,
  backupFingerprint,
  evidence,
}) {
  const reasons = [];
  if (legacyBottleCount < 1) reasons.push('legacy_collection_empty');
  if (durableVersion < 1) reasons.push('durable_collection_missing');
  if (!evidence?.legacyMigratedAt) reasons.push('migration_audit_missing');
  if (!evidence?.backup || !evidence?.backedUpAt) reasons.push('immutable_backup_missing');
  if (legacyBottleCount > 0 && legacyFingerprint !== durableFingerprint) reasons.push('durable_collection_differs');
  if (legacyBottleCount > 0 && evidence?.backup && legacyFingerprint !== backupFingerprint) reasons.push('immutable_backup_differs');
  return {
    safeToClear: reasons.length === 0,
    reasons,
    legacyBottleCount,
    durableBottleCount,
    backupBottleCount,
    evidence,
  };
}
