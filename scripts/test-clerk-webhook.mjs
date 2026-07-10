import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { verifyClerkWebhookSignature } from '../src/lib/clerk-webhook.ts';

const secretBytes = randomBytes(32);
const secret = `whsec_${secretBytes.toString('base64')}`;
const payload = JSON.stringify({ type: 'user.created', data: { id: 'user_test' } });
const id = 'msg_test';
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${payload}`).digest('base64');

assert.equal(verifyClerkWebhookSignature({ payload, secret, id, timestamp, signature: `v1,invalid v1,${signature}` }), true);
assert.equal(verifyClerkWebhookSignature({ payload, secret, id, timestamp, signature: `v1,${signature.slice(1)}` }), false);
assert.equal(verifyClerkWebhookSignature({ payload, secret, id, timestamp: String(Number(timestamp) - 301), signature: `v1,${signature}` }), false);
assert.equal(verifyClerkWebhookSignature({ payload, secret, id: '', timestamp, signature: `v1,${signature}` }), false);

console.log('Clerk webhook signature tests passed.');
