import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('full fleet retains actual CA/ID/IA and nonpreview WA/WI through customer routes beyond 10000 rows', () => {
  execFileSync(process.execPath, ['--max-old-space-size=2048', '--import', 'tsx', 'scripts/test-fleet-current-visibility.mts'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024,
  });
});
