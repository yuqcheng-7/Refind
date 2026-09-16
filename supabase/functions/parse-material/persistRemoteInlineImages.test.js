import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInlineImageObjectKey,
  persistRemoteInlineImages,
} from './persistRemoteInlineImages.js';

test('buildInlineImageObjectKey uses 1-based inline index', () => {
  assert.equal(
    buildInlineImageObjectKey('user-1', 'mat-2', 1, 'png'),
    'user-1/mat-2.inline.1.png',
  );
  assert.equal(buildInlineImageObjectKey('', 'mat-2', 1), '');
});

test('persistRemoteInlineImages uploads ordered images and soft-fails one', async () => {
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

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Array(40).fill(1)]);
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes('fail')) {
      return { ok: false, status: 403, headers: { get: () => null }, body: null };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-type' ? 'image/png' : null) },
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: png };
            },
            cancel: async () => {},
          };
        },
      },
    };
  };

  const persisted = await persistRemoteInlineImages({
    admin,
    userId: 'user-1',
    materialId: 'mat-2',
    mediaUrls: [
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/fail.png',
      'https://cdn.example.com/c.png',
    ],
    fetchImpl,
  });

  assert.equal(calls, 3);
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0].objectKey, 'user-1/mat-2.inline.1.png');
  assert.equal(persisted[1].objectKey, 'user-1/mat-2.inline.3.png');
  assert.equal(persisted[1].index, 3);
  assert.equal(uploads.length, 2);
});
