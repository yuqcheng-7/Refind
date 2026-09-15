import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isServiceAuthorization,
  updateChunkEmbedding,
} from './core.js';

test('service authorization requires an exact bearer token match', () => {
  const serviceKey = 'service-role-secret';

  assert.equal(isServiceAuthorization(`Bearer ${serviceKey}`, serviceKey), true);
  assert.equal(isServiceAuthorization(`Bearer prefix-${serviceKey}-suffix`, serviceKey), false);
  assert.equal(isServiceAuthorization(serviceKey, serviceKey), false);
  assert.equal(isServiceAuthorization('', serviceKey), false);
});

test('service authorization accepts legacy service_role JWTs', () => {
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const token = `hdr.${payload}.sig`;
  assert.equal(isServiceAuthorization(`Bearer ${token}`, 'other-secret'), true);
  const userPayload = Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url');
  assert.equal(isServiceAuthorization(`Bearer hdr.${userPayload}.sig`, 'other-secret'), false);
});

test('chunk embedding update retries with stringified vector', async () => {
  const values = [];
  const admin = {
    from() {
      return {
        update(patch) {
          values.push(patch.embedding);
          return {
            eq: async () => ({ error: values.length === 1 ? new Error('invalid vector input') : null }),
          };
        },
      };
    },
  };

  await updateChunkEmbedding(admin, 'chunk-1', [0.25, -0.5]);

  assert.deepEqual(values, [[0.25, -0.5], '[0.25,-0.5]']);
});

test('chunk embedding update surfaces the fallback error', async () => {
  const admin = {
    from() {
      return {
        update() {
          return {
            eq: async () => ({ error: new Error('still invalid') }),
          };
        },
      };
    },
  };

  await assert.rejects(
    updateChunkEmbedding(admin, 'chunk-1', [0.25]),
    /still invalid/,
  );
});
