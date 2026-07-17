import path from 'node:path';

export async function resolveAggregateStateReports({ configs, collected = new Map(), statesOut, readReport }) {
  if (!Array.isArray(configs)) throw new TypeError('configs must be an array');
  if (!statesOut) throw new TypeError('statesOut is required');
  if (typeof readReport !== 'function') throw new TypeError('readReport must be a function');

  const resolved = [];
  for (const config of configs) {
    const attempted = collected.has(config.id);
    const collectedReport = attempted ? collected.get(config.id) : null;
    const wasRun = Boolean(collectedReport);
    const report = collectedReport || await readReport(path.join(statesOut, `${config.id}.json`), null);
    if (!report) throw new Error(`No current or previous state report available for ${config.id}`);
    resolved.push({ config, report, attempted, wasRun });
  }
  return resolved;
}
