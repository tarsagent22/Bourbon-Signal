export function rotatingSourceCohort(sources, observedAt, cohortSize, rotationMs) {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const safeSize = Math.max(1, Math.min(sources.length, Number(cohortSize) || 1));
  const safeRotationMs = Math.max(1, Number(rotationMs) || 1);
  const slot = Math.floor(new Date(observedAt).getTime() / safeRotationMs);
  const start = (slot * safeSize) % sources.length;
  return Array.from({ length: safeSize }, (_, index) => sources[(start + index) % sources.length]);
}

export function normalizeCityHiveReportedQuantity(value) {
  const reportedQuantity = Number(value || 0) || 0;
  const binaryAvailability = reportedQuantity === 100;
  return { reportedQuantity, binaryAvailability, quantity: binaryAvailability ? 1 : reportedQuantity };
}
