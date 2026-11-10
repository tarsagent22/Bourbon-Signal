// Sandbox access is useful for testing the app, but cannot authorize real rewards.
// Environment markers must come from private, provider-verified metadata.
export function rewardMembershipMetadata(publicMetadata: Record<string, unknown>, privateMetadata: Record<string, unknown>) {
  const result = { ...publicMetadata };
  for (const store of ['apple', 'google']) {
    if (privateMetadata[`${store}MembershipEnvironment`] !== 'sandbox') continue;
    for (const key of Object.keys(result)) if (key.startsWith(`${store}Membership`)) delete result[key];
  }
  return result;
}
