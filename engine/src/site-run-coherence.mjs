export function attachRunIdentity(payload, identity) {
  return {
    ...payload,
    runId: identity.runId,
    generatedAt: identity.generatedAt,
    engineGeneratedAt: identity.engineGeneratedAt,
  };
}

export function verifyRunCoherence(payloads, identity) {
  const errors = [];
  for (const [name, payload] of Object.entries(payloads || {})) {
    if (payload?.runId !== identity.runId) errors.push(`${name} runId mismatch: expected ${identity.runId}, got ${payload?.runId || 'missing'}.`);
    if (payload?.generatedAt !== identity.generatedAt) errors.push(`${name} generatedAt mismatch: expected ${identity.generatedAt}, got ${payload?.generatedAt || 'missing'}.`);
    if (payload?.engineGeneratedAt !== identity.engineGeneratedAt) errors.push(`${name} engineGeneratedAt mismatch: expected ${identity.engineGeneratedAt}, got ${payload?.engineGeneratedAt || 'missing'}.`);
  }
  return { ok: errors.length === 0, errors };
}
