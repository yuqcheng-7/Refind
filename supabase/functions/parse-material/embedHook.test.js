import assert from 'node:assert/strict';
import test from 'node:test';
import { invokeEmbedMaterial } from './embedHook.js';

test('embed hook returns the fetch promise for lifecycle tracking', async () => {
  let request;
  let resolveFetch;
  const pendingFetch = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const fetchFn = (url, init) => {
    request = { url, init };
    return pendingFetch;
  };

  const result = invokeEmbedMaterial({
    fetchFn,
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-secret',
    materialId: 'material-1',
  });

  assert.equal(typeof result?.then, 'function');
  assert.equal(request.url, 'https://project.supabase.co/functions/v1/embed-material');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, 'Bearer service-role-secret');
  assert.deepEqual(JSON.parse(request.init.body), { materialId: 'material-1', rebuildChunks: true });

  const response = new Response('{}');
  resolveFetch(response);
  assert.equal(await result, response);
});

test('embed hook logs a truncated non-ok status without authorization details', async () => {
  const errors = [];
  const longStatus = `Embedding failed ${'x'.repeat(200)}`;
  await invokeEmbedMaterial({
    fetchFn: async () => new Response('{}', { status: 503, statusText: longStatus }),
    logger: { error: (...args) => errors.push(args) },
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-secret',
    materialId: 'material-1',
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], 'embed-material request failed');
  assert.equal(errors[0][1], 503);
  assert.equal(errors[0][2].length, 120);
  assert.equal(errors.flat().join(' ').includes('service-role-secret'), false);
});

test('embed hook logs rejection without exposing the rejected error', async () => {
  const errors = [];
  await assert.rejects(invokeEmbedMaterial({
    fetchFn: async () => {
      throw new Error('service-role-secret');
    },
    logger: { error: (...args) => errors.push(args) },
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-secret',
    materialId: 'material-1',
  }));

  assert.deepEqual(errors, [['embed-material request rejected']]);
});
