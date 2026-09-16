import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildCoverObjectKey, pickOfficeCoverImage } from './materialCover.js';

const require = createRequire(import.meta.url);
const JSZip = require('../../../refind-demo/node_modules/jszip');

test('buildCoverObjectKey appends cover suffix', () => {
  assert.equal(buildCoverObjectKey('u/a.docx', 'png'), 'u/a.docx.cover.png');
});

test('pickOfficeCoverImage returns first sizeable media image', async () => {
  const zip = new JSZip();
  const tiny = Buffer.alloc(100, 1);
  const cover = Buffer.alloc(5 * 1024, 7);
  zip.file('word/media/image1.png', tiny);
  zip.file('word/media/image2.jpg', cover);
  const packed = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));

  const picked = await pickOfficeCoverImage('docx', packed, JSZip);
  assert.ok(picked);
  assert.equal(picked.ext, 'jpg');
  assert.equal(picked.bytes.byteLength, cover.byteLength);
});
