import assert from 'node:assert/strict';
import test from 'node:test';
import { isProtectedDashboardResponse } from '../automation/bourbon-signal/production-checks.mjs';

test('dashboard protection accepts Clerk sign-in redirects', () => {
  assert.equal(isProtectedDashboardResponse(307, '/sign-in?redirect_url=%2Fdashboard'), true);
  assert.equal(isProtectedDashboardResponse(302, '/sign-up?redirect_url=%2Fdashboard'), true);
});

test('dashboard protection rejects public success and unrelated redirects', () => {
  assert.equal(isProtectedDashboardResponse(200, null), false);
  assert.equal(isProtectedDashboardResponse(307, '/pricing'), false);
});
