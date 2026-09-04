import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('./run-ohlq-worker-task.ps1', import.meta.url), 'utf8');
const worker = await readFile(new URL('./ohlq-persistent-worker.mjs', import.meta.url), 'utf8');
assert.match(script, /ConvertTo-SecureString/, 'worker wrapper must decrypt a DPAPI-protected credential');
assert.match(script, /Local\\BourbonSignalOhlqWorker/, 'worker wrapper must prevent overlapping runs');
assert.match(script, /WaitForExit\(\$TimeoutMinutes \* 60 \* 1000\)/, 'worker wrapper must enforce a bounded runtime');
assert.match(script, /taskkill\.exe \/PID \$worker\.Id \/T \/F/, 'worker wrapper must terminate the full process tree on timeout');
assert.match(script, /Remove-Item Env:CRON_SECRET/, 'worker wrapper must clear the decrypted credential');
assert.match(script, /ZeroFreeBSTR/, 'worker wrapper must zero decrypted secret memory');
assert.match(script, /\$PSScriptRoot/, 'worker wrapper must derive its checkout from its own script location by default');
assert.doesNotMatch(script, /\[string\]\$ProjectRoot\s*=\s*['\"]C:\\/i, 'worker wrapper must not pin a disposable worktree path');
assert.doesNotMatch(script, /OHLQ_WORKER_ARTIFACT_SECRET\s*=\s*['\"][^'\"]+/i, 'worker wrapper must not embed a plaintext bearer');
assert.match(worker, /browser_not_ready'[\s\S]*process\.exitCode = 1;[\s\S]*return;/, 'an unready browser must produce a nonzero worker exit');
assert.match(worker, /browserLeftOpen:\s*!cleanupSucceeded/, 'browser status must report cleanup failure truthfully');
assert.doesNotMatch(worker, /closeExistingBrowserCdp\(CDP_URL\)\.catch\(\(\) => false\)/, 'dedicated-browser cleanup failure must not be silently swallowed');
console.log('OHLQ scheduled-worker wrapper contract passed.');
