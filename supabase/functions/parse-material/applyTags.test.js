import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceMaterialTagRelations } from './applyTags.js';

function fakeAdmin({ existing = [] } = {}) {
  const tags = [...existing];
  const relations = [];
  return {
    tags,
    relations,
    from(table) {
      if (table === 'material_tags') {
        return {
          select() {
            return {
              eq(_col, userId) {
                return {
                  eq(_col2, name) {
                    return {
                      maybeSingle: async () => {
                        const row = tags.find((t) => t.user_id === userId && t.name === name);
                        return { data: row || null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(row) {
            return {
              select() {
                return {
                  single: async () => {
                    const created = { id: `tag-${tags.length + 1}`, ...row };
                    tags.push(created);
                    return { data: created, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'material_tag_relations') {
        return {
          delete() {
            return {
              eq: async (_c, materialId) => {
                for (let i = relations.length - 1; i >= 0; i -= 1) {
                  if (relations[i].material_id === materialId) relations.splice(i, 1);
                }
                return { error: null };
              },
            };
          },
          insert: async (rows) => {
            relations.push(...(Array.isArray(rows) ? rows : [rows]));
            return { error: null };
          },
        };
      }
      throw new Error(table);
    },
  };
}

test('replaceMaterialTagRelations upserts and replaces', async () => {
  const admin = fakeAdmin();
  await replaceMaterialTagRelations(admin, {
    userId: 'u1',
    materialId: 'm1',
    tagNames: ['增长', '用户研究'],
  });
  assert.equal(admin.tags.length, 2);
  assert.equal(admin.relations.length, 2);
  await replaceMaterialTagRelations(admin, {
    userId: 'u1',
    materialId: 'm1',
    tagNames: ['增长'],
  });
  assert.equal(admin.tags.length, 2);
  assert.equal(admin.relations.length, 1);
  assert.equal(admin.relations[0].tag_id, admin.tags[0].id);
});
