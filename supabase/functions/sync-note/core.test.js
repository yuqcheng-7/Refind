import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFanOutMaterialPatch,
  buildSyncedMaterialInsert,
  deleteSyncPolicy,
  noteBodyText,
  normalizeRequestBody,
  shouldFanInFromMaterial,
  summarizeSyncOutcomes,
} from './core.js';

test('normalizeRequestBody requires noteId and non-empty knowledgeBaseIds', () => {
  assert.throws(() => normalizeRequestBody({}), /noteId/);
  assert.throws(() => normalizeRequestBody({ noteId: 'n1' }), /knowledgeBaseIds/);
  assert.throws(() => normalizeRequestBody({ noteId: 'n1', knowledgeBaseIds: [] }), /knowledgeBaseIds/);
  assert.throws(() => normalizeRequestBody({ noteId: 'n1', knowledgeBaseIds: [''] }), /knowledgeBaseIds/);
  assert.deepEqual(
    normalizeRequestBody({ noteId: '  note-1  ', knowledgeBaseIds: [' kb-a ', 'kb-b', 'kb-a'] }),
    { noteId: 'note-1', knowledgeBaseIds: ['kb-a', 'kb-b'] },
  );
});

test('noteBodyText prefers text, then sections, then strips html', () => {
  assert.equal(noteBodyText({ text: '  正文  ' }), '正文');
  assert.equal(
    noteBodyText({ text: '', sections: [{ text: '第一段' }, { text: '第二段' }] }),
    '第一段\n\n第二段',
  );
  assert.equal(
    noteBodyText({ html: '<p>Hello <strong>world</strong></p>' }),
    'Hello world',
  );
});

test('buildSyncedMaterialInsert maps note → origin_type=note material row', () => {
  const row = buildSyncedMaterialInsert({
    userId: 'user-1',
    knowledgeBaseId: 'kb-1',
    note: {
      id: 'note-1',
      title: '增长笔记',
      content: { text: '把激活做短。' },
    },
  });

  assert.equal(row.user_id, 'user-1');
  assert.equal(row.knowledge_base_id, 'kb-1');
  assert.equal(row.input_type, 'note');
  assert.equal(row.platform_code, 'note');
  assert.equal(row.origin_type, 'note');
  assert.equal(row.origin_note_id, 'note-1');
  assert.equal(row.title, '增长笔记');
  assert.equal(row.content_text, '把激活做短。');
  assert.equal(row.status, 'ready');
  assert.ok(String(row.content_excerpt || '').length <= 240);
});

test('buildFanOutMaterialPatch pushes title + body for linked materials', () => {
  const patch = buildFanOutMaterialPatch({
    title: '新标题',
    content: { text: '新正文内容' },
  });
  assert.equal(patch.title, '新标题');
  assert.equal(patch.content_text, '新正文内容');
  assert.match(patch.content_excerpt, /新正文/);
});

test('deleteSyncPolicy: note cascades materials; material/KB unlink only', () => {
  assert.deepEqual(deleteSyncPolicy(), {
    onNoteDelete: 'delete_synced_materials',
    onMaterialDelete: 'unlink_only',
    onKnowledgeBaseDelete: 'unlink_only',
  });
});

test('shouldFanInFromMaterial only for origin_type=note', () => {
  assert.equal(shouldFanInFromMaterial({ origin_type: 'note', origin_note_id: 'n1' }), true);
  assert.equal(shouldFanInFromMaterial({ origin_type: 'import', origin_note_id: null }), false);
  assert.equal(shouldFanInFromMaterial({ origin_type: 'note', origin_note_id: null }), false);
});

test('summarizeSyncOutcomes splits synced vs failed', () => {
  const summary = summarizeSyncOutcomes([
    { knowledgeBaseId: 'kb-a', materialId: 'm1', ok: true },
    { knowledgeBaseId: 'kb-b', ok: false, error: 'forbidden' },
  ]);
  assert.deepEqual(summary.synced, [
    { knowledgeBaseId: 'kb-a', materialId: 'm1' },
  ]);
  assert.deepEqual(summary.failed, [
    { knowledgeBaseId: 'kb-b', error: 'forbidden' },
  ]);
});
