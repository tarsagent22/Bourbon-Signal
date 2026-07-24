const REQUIRED_CUSTOMER_PATHS = Object.freeze([
  'stateFilter',
  'areaFilter',
  'preferences',
  'dashboard',
  'dropFeedApi',
  'finder',
  'alerts',
  'monitoring',
  'export',
]);

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateStateVerticalSliceManifest(manifest) {
  const failures = [];
  if (!object(manifest)) return { ok: false, failures: ['State vertical-slice manifest must be an object.'] };
  if (manifest.schemaVersion !== 1) failures.push('schemaVersion must be 1.');
  if (!/^[A-Z]{2}(?:-[A-Z0-9]+)?$/.test(String(manifest.state || ''))) failures.push('state must be an uppercase state or scoped-market identifier.');

  const lifecycle = manifest.lifecycle;
  if (!object(lifecycle)) failures.push('lifecycle must be an object.');
  else {
    for (const field of ['customerLabel', 'publicStatus', 'coverageTier', 'refinementLevel']) {
      if (!text(lifecycle[field])) failures.push(`lifecycle.${field} is required.`);
    }
  }

  const collector = manifest.collector;
  if (!object(collector) || !Array.isArray(collector.sourceIds) || collector.sourceIds.length === 0 || collector.sourceIds.some((id) => !text(id)) || !text(collector.registration)) {
    failures.push('collector requires non-empty sourceIds and registration evidence.');
  }
  const identity = manifest.storeIdentity;
  if (!object(identity) || !text(identity.mode) || typeof identity.addressRequired !== 'boolean' || !text(identity.proof)) {
    failures.push('storeIdentity requires mode, addressRequired, and proof.');
  }
  const semantics = manifest.sourceSemantics;
  if (!object(semantics) || !text(semantics.availability) || typeof semantics.inventoryAlertable !== 'boolean' || typeof semantics.watchAlertable !== 'boolean') {
    failures.push('sourceSemantics requires availability plus inventory/watch alertability booleans.');
  }

  if (!object(manifest.customerPaths)) failures.push('customerPaths must be an object.');
  else {
    for (const path of REQUIRED_CUSTOMER_PATHS) {
      const proof = manifest.customerPaths[path];
      if (!object(proof)) {
        failures.push(`customerPaths.${path} is required.`);
        continue;
      }
      if (!['verified', 'not_applicable'].includes(proof.status)) {
        failures.push(`customerPaths.${path}.status must be verified or not_applicable.`);
      } else if (proof.status === 'verified' && !text(proof.assertion)) {
        failures.push(`customerPaths.${path}.assertion is required when verified.`);
      } else if (proof.status === 'not_applicable' && !text(proof.reason)) {
        failures.push(`customerPaths.${path}.reason is required when not_applicable.`);
      }
    }
  }

  const evidence = manifest.evidence;
  if (!object(evidence)) failures.push('evidence must be an object.');
  else {
    for (const stage of ['shadow', 'canary']) {
      const stageEvidence = evidence[stage];
      if (!object(stageEvidence)) {
        failures.push(`evidence.${stage} is required.`);
      } else if (stageEvidence.status === 'not_run') {
        if (Number(stageEvidence.runs) !== 0 || stageEvidence.artifact != null || !text(stageEvidence.reason)) {
          failures.push(`evidence.${stage} not_run evidence requires runs=0, artifact=null, and a reason.`);
        }
      } else if (Number(stageEvidence.runs) < 1 || !text(stageEvidence.artifact)) {
        failures.push(`evidence.${stage} requires positive runs and an artifact reference, or an explicit not_run record.`);
      }
    }
    const production = evidence.production;
    if (!object(production)) {
      failures.push('evidence.production is required.');
    } else if (production.status === 'not_deployed') {
      if (production.url != null || !text(production.assertion) || !text(production.reason)) {
        failures.push('evidence.production not_deployed evidence requires url=null, assertion, and reason.');
      }
    } else if (!text(production.url) || !text(production.assertion)) {
      failures.push('evidence.production requires URL and assertion, or an explicit not_deployed record.');
    }
  }
  return { ok: failures.length === 0, failures };
}

export { REQUIRED_CUSTOMER_PATHS };
