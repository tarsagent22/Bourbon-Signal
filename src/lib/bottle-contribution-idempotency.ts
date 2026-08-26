const BOTTLE_CONTRIBUTION_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,120}$/;

export function validBottleContributionIdempotencyKey(value: string | null | undefined) {
  if (!value) return null;
  const key = value.trim();
  return BOTTLE_CONTRIBUTION_IDEMPOTENCY_KEY.test(key) ? key : null;
}
