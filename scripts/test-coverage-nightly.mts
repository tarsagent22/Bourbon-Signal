import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { CoverageRequestRepository } from '../src/lib/coverage-request-repository.ts';
import { groupNightlyJobs, nightlyDate, nightlyBudget, nextNightlyJob } from '../automation/bourbon-signal/coverage-nightly-policy.mjs';

const db = new PGlite();
try {
  await db.exec(await readFile(new URL('../src/lib/coverage-request-schema.sql', import.meta.url), 'utf8'));
  // PGlite exercises real SQL and constraints; it does not implement PostgreSQL advisory locks.
  await db.exec('CREATE FUNCTION pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE sql AS $$ SELECT $$;');
  const database = { query: async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows,
    transaction: async () => { throw Error('Not used by these queue operations'); } };
  const repo = new CoverageRequestRepository(database);
  const time = '2026-10-12T05:00:00.000Z';
  for (const [index, state] of ['NC', 'SC', 'NC'].entries()) {
    const id = `11111111-1111-4111-8111-00000000000${index}`;
    await db.query(`INSERT INTO coverage_requests (id,user_id,target_type,state_code,area_label,canonical_target_key,baseline_coverage_fingerprint,requested_at,updated_at)
      VALUES ($1,'fixture-member','state',$2,$2,$3,'baseline',$4,$4)`, [id, state, `state:${state}:${index}`, time]);
    await db.query(`INSERT INTO coverage_request_automation_jobs (job_key,coverage_request_id,request_version,target_type,state_code,canonical_target_key,baseline_coverage_fingerprint,created_at)
      VALUES ($1,$2,$3,'state',$4,$5,'baseline',$3::timestamptz + $6::int * interval '1 minute')`, [`coverage-request:${id}:abcdef0123456789`, id, time, state, `state:${state}:${index}`, index]);
  }
  const jobs = await repo.listAutomationJobs(time);
  assert.equal(jobs.length, 3);
  const groups = groupNightlyJobs(jobs);
  assert.deepEqual(groups.map(group => [group.stateCode, group.targets.length]), [['NC', 2], ['SC', 1]]);
  const selected = jobs[1];
  const claim = await repo.claimAutomationJob('lease-sc', time, '2026-10-12T05:05:00Z', selected.jobKey);
  assert.equal(claim?.jobKey, selected.jobKey, 'An overlapping group may be claimed without taking an unrelated older job.');
  const task = 'cx_' + 'a'.repeat(32);
  await repo.attachAutomationTask(selected.jobKey, 'lease-sc', task, time);
  const competing = await repo.claimAutomationJob('other', time, '2026-10-12T05:05:00Z', jobs[2].jobKey);
  assert.equal(competing?.taskId, task, 'The single active writer is preserved.');
  assert.equal(await repo.deferAutomationJob(selected.jobKey, 'cx_wrong', 'research_budget', time), null);
  assert.equal((await repo.deferAutomationJob(selected.jobKey, task, 'research_budget', time))?.status, 'queued');
  const history = (await db.query('SELECT retry_history FROM coverage_request_automation_jobs WHERE job_key=$1', [selected.jobKey])).rows[0] as {retry_history: Array<{event: string}>};
  assert.equal(history.retry_history[0].event, 'nightly_deferred');
  assert.equal((await repo.claimAutomationJob('lease-next', time, '2026-10-12T05:05:00Z', jobs[2].jobKey))?.jobKey, jobs[2].jobKey);
  await db.query("UPDATE coverage_request_automation_jobs SET status='queued',lease_token=NULL,lease_expires_at=NULL WHERE job_key=$1", [jobs[2].jobKey]);
  await db.query("UPDATE coverage_requests SET updated_at=updated_at+interval '1 minute' WHERE id=$1", [jobs[2].coverageRequestId]);
  assert.equal((await repo.listAutomationJobs(time)).length, 2, 'Superseded request versions leave the nightly snapshot.');
  assert.equal(await repo.claimAutomationJob('stale', time, '2026-10-12T05:05:00Z', jobs[2].jobKey), null, 'A stale version cannot acquire authority.');
  const ledger = { date: '2026-10-12', startedAt: time, groups, entries: {} as Record<string,{status:string}> };
  assert.equal(nightlyDate(new Date('2026-10-12T03:00:00Z')), '2026-10-11');
  assert.equal(nightlyBudget(ledger, time, new Date('2026-10-12T05:21:00Z')).discoveryExpired, true);
  assert.equal(nightlyBudget(ledger, time, new Date('2026-10-12T05:46:00Z')).implementationExpired, true);
  assert.equal(nightlyBudget(ledger, null, new Date('2026-10-12T11:00:00Z')).canStart, false);
  ledger.entries[jobs[0].jobKey] = {status:'deferred'};
  assert.equal(nextNightlyJob(ledger)?.jobKey, jobs[2].jobKey, 'Deferred work does not monopolize the same night.');
  console.log('Nightly queue SQL, request-version checks, grouped selection, deferrals and time bounds passed (PGlite).');
} finally { await db.close(); }
