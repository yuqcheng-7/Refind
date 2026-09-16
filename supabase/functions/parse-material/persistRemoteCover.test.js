import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLinkCoverObjectKey, persistRemoteCoverImage } from './persistRemoteCover.js';

test('buildLinkCoverObjectKey nests under user and material id', () => {
  assert.equal(
    buildLinkCoverObjectKey('user-1', 'mat-2', 'png'),
    'user-1/mat-2.cover.png',
  );
});

test('persistRemoteCoverImage uploads fetched image bytes', async () => {
  const uploads = [];
  const admin = {
    storage: {
      from() {
        return {
          async upload(key, bytes, options) {
            uploads.push({ key, bytes, options });
            return { error: null };
          },
        };
      },
    },
  };
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array(300).fill(1)]);
  const key = await persistRemoteCoverImage({
    admin,
    userId: 'user-1',
    materialId: 'mat-2',
    coverUrl: 'https://cdn.example.com/cover.png',
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => png.buffer,
    }),
  });
  assert.equal(key, 'user-1/mat-2.cover.png');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.contentType, 'image/png');
});
