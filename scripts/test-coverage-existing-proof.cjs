const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleFrom } = require('./astra-security-test-helpers.cjs');
test('already-covered completion requires live exact-target proof and a current task binding', async () => {
  let bound = true, covered = false, completions = 0;
  const job = { targetType: 'city', stateCode: 'VA', areaKey: 'sterling', canonicalTargetKey: 'city:VA:sterling' };
  const repository = {
    readBoundAutomationJob: async () => bound ? job : null,
    completeAutomationTask: async (_key, _task, result) => { completions++; return { ...job, terminalResult: result }; },
  };
  const route = moduleFrom('src/app/api/ops/coverage-expansion-queue/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/ops-auth': { authorizeOpsBearer: header => header === 'Bearer test-secret' },
    '@/lib/coverage-automation-result': { COVERAGE_AUTOMATION_RESULT_SCHEMA: 'bourbon-signal/coverage-expansion-result@2', parseCoverageAutomationCompletionResult: value => value },
    '@/lib/coverage-request-repository': { getCoverageRequestRepository: () => repository },
    '@/lib/coverage-server': { readCurrentCoverageContract: async () => ({ states: [{ code: 'VA', health: 'current', freshness: { currentInventoryStores: 50 } }] }), searchCurrentCoverageTargets: async () => [{ kind: 'city', stateCode: 'VA', canonicalTargetKey: covered ? job.canonicalTargetKey : 'city:VA:richmond', status: 'covered' }] },
    '@/lib/coverage-existing-proof': moduleFrom('src/lib/coverage-existing-proof.ts'),
  }, new Map(), { COVERAGE_AUTOMATION_OUTCOME_SECRET: 'test-secret' });
  const request = (action, authorized = true, terminalResult) => new Request('https://example.test/api/ops/coverage-expansion-queue', { method: 'POST', headers: { Authorization: authorized ? 'Bearer test-secret' : 'Bearer invalid' }, body: JSON.stringify({ action, jobKey: 'coverage-request:test', taskId: 't_test1234', resultSchemaVersion: 'bourbon-signal/coverage-expansion-result@2', terminalResult }) });
  try {
    assert.equal((await route.POST(request('complete_existing', false))).status, 401);
    assert.equal((await route.POST(request('complete_existing'))).status, 409);
    covered = true; bound = false;
    assert.equal((await route.POST(request('complete_existing'))).status, 409);
    bound = true;
    assert.equal((await route.POST(request('complete', true, { blockerCode: 'already_covered' }))).status, 400);
    assert.equal(completions, 0);
    const result = await route.POST(request('complete_existing'));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).job.terminalResult.blockerCode, 'already_covered');
    assert.equal(completions, 1);
  } finally { /* All provider calls are stubbed and credentials are fixture-only. */ }
});
