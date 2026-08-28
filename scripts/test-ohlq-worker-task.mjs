import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('./run-ohlq-worker-task.ps1', import.meta.url), 'utf8');
assert.match(script, /ConvertTo-SecureString/, 'worker wrapper must decrypt a DPAPI-protected credential');
assert.match(script, /Local\\BourbonSignalOhlqWorker/, 'worker wrapper must prevent overlapping runs');
assert.match(script, /WaitForExit\(\$TimeoutMinutes \* 60 \* 1000\)/, 'worker wrapper must enforce a bounded runtime');
assert.match(script, /taskkill\.exe \/PID \$worker\.Id \/T \/F/, 'worker wrapper must terminate the full process tree on timeout');
assert.match(script, /Remove-Item Env:CRON_SECRET/, 'worker wrapper must clear the decrypted credential');
assert.match(script, /ZeroFreeBSTR/, 'worker wrapper must zero decrypted secret memory');
assert.doesNotMatch(script, /OHLQ_WORKER_ARTIFACT_SECRET\s*=\s*['\"][^'\"]+/i, 'worker wrapper must not embed a plaintext bearer');
console.log('OHLQ scheduled-worker wrapper contract passed.');
