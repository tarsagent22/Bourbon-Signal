import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Escalate source breakage independently of snapshot recovery. A changed board
// website must not trigger repeated full-state refreshes or block sibling data.
export function ncSourceIntegrityFailures(sourceHealth) {
  const failures = (sourceHealth?.statewideFailures || []).map(source => `${source.source}: ${source.status}.`);
  for (const board of sourceHealth?.affectedBoards || []) {
    if (board.status === 'unreachable' && Number(board.consecutiveFailures) >= 3) {
      failures.push(`${board.boardName}: official source unreachable for ${board.consecutiveFailures} consecutive checks.`);
    }
    if ((board.parserWarnings || []).some(warning => warning.status === 'parser_drift' || warning.parserStatus === 'parser_drift')) {
      failures.push(`${board.boardName}: public product markup is present but the parser cannot read it.`);
    }
  }
  return failures;
}

export async function verifyNcSourceHealth(reportPath = path.resolve('engine/out/production-watchdog.json')) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const failures = ncSourceIntegrityFailures(report.ncSourceHealth);
  for (const failure of failures) console.error(`::error title=NC source repair needed::${failure}`);
  console.log(JSON.stringify({ checkedAt: report.checkedAt, sourceHealthAvailable: Boolean(report.ncSourceHealth), failures }, null, 2));
  if (failures.length) process.exitCode = 1;
  return failures;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '')) {
  verifyNcSourceHealth().catch(error => { console.error(error); process.exitCode = 1; });
}
