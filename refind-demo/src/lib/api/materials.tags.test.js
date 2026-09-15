import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, getUser } = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from,
    auth: { getUser },
  },
}));

import {
  listMaterialTags,
  mapMaterial,
  replaceMaterialTags,
} from './materials.js';

describe('mapMaterial tagsUserEdited', () => {
  it('maps tags_user_edited to tagsUserEdited', () => {
    expect(mapMaterial({
      id: 'm1',
      knowledge_base_id: 'kb1',
      input_type: 'note',
      platform_code: 'note',
      title: '笔记',
      created_at: '2026-09-14T00:00:00Z',
      status: 'ready',
      tags_user_edited: true,
      material_tag_relations: [],
    }).tagsUserEdited).toBe(true);

    expect(mapMaterial({
      id: 'm2',
      knowledge_base_id: 'kb1',
      input_type: 'note',
      platform_code: 'note',
      title: '笔记',
      created_at: '2026-09-14T00:00:00Z',
      status: 'ready',
      material_tag_relations: [],
    }).tagsUserEdited).toBe(false);
  });
});

describe('listMaterialTags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('returns only tags linked to non-deleted materials for the current user', async () => {
    const materialsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockResolvedValue({
        data: [
          {
            material_tag_relations: [
              { material_tags: { id: 't2', name: '产品' } },
            ],
          },
          {
            material_tag_relations: [
              { material_tags: { id: 't1', name: '灵感' } },
              { material_tags: { id: 't2', name: '产品' } },
            ],
          },
          {
            material_tag_relations: [
              { material_tags: null },
            ],
          },
        ],
        error: null,
      }),
    };
    from.mockReturnValue(materialsQuery);

    await expect(listMaterialTags()).resolves.toEqual([
      { id: 't2', name: '产品' },
      { id: 't1', name: '灵感' },
    ]);

    expect(from).toHaveBeenCalledWith('materials');
    expect(materialsQuery.select).toHaveBeenCalledWith(
      'material_tag_relations(material_tags(id, name))',
    );
    expect(materialsQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(materialsQuery.neq).toHaveBeenCalledWith('status', 'deleted');
    expect(materialsQuery.eq).not.toHaveBeenCalledWith('knowledge_base_id', expect.anything());
  });

  it('scopes tags to a knowledge base when knowledgeBaseId is provided', async () => {
    const materialsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    };
    materialsQuery.neq.mockReturnValue(materialsQuery);
    materialsQuery.eq.mockImplementation(function eq(column, value) {
      if (column === 'knowledge_base_id') {
        return Promise.resolve({
          data: [
            {
              material_tag_relations: [
                { material_tags: { id: 't1', name: '灵感' } },
              ],
            },
          ],
          error: null,
        });
      }
      return materialsQuery;
    });
    from.mockReturnValue(materialsQuery);

    await expect(listMaterialTags({ knowledgeBaseId: 'kb-1' })).resolves.toEqual([
      { id: 't1', name: '灵感' },
    ]);

    expect(from).toHaveBeenCalledWith('materials');
    expect(materialsQuery.eq).toHaveBeenCalledWith('knowledge_base_id', 'kb-1');
  });
});

describe('replaceMaterialTags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('sets tags_user_edited true when replacing tags', async () => {
    const tagLookup1 = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const tagInsert1 = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'tag-a' }, error: null }),
    };
    const tagLookup2 = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const tagInsert2 = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'tag-b' }, error: null }),
    };
    const clearRelations = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const linkRelations = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    const flagUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const materialGet = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'material-1',
          knowledge_base_id: 'kb1',
          input_type: 'note',
          platform_code: 'note',
          title: '笔记',
          created_at: '2026-09-14T00:00:00Z',
          status: 'ready',
          tags_user_edited: true,
          material_tag_relations: [
            { material_tags: { id: 'tag-a', name: '灵感' } },
            { material_tags: { id: 'tag-b', name: '产品' } },
          ],
        },
        error: null,
      }),
    };

    from
      .mockReturnValueOnce(tagLookup1)
      .mockReturnValueOnce(tagInsert1)
      .mockReturnValueOnce(tagLookup2)
      .mockReturnValueOnce(tagInsert2)
      .mockReturnValueOnce(clearRelations)
      .mockReturnValueOnce(linkRelations)
      .mockReturnValueOnce(flagUpdate)
      .mockReturnValueOnce(materialGet);

    const result = await replaceMaterialTags('material-1', ['灵感', '产品']);

    expect(flagUpdate.update).toHaveBeenCalledWith({ tags_user_edited: true });
    expect(flagUpdate.eq).toHaveBeenCalledWith('id', 'material-1');
    expect(linkRelations.insert).toHaveBeenCalledWith([
      { material_id: 'material-1', tag_id: 'tag-a' },
      { material_id: 'material-1', tag_id: 'tag-b' },
    ]);
    expect(result.tagsUserEdited).toBe(true);
    expect(result.tags).toEqual(['灵感', '产品']);
  });

  it('clears relations for empty tag list and still sets tags_user_edited', async () => {
    const clearRelations = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const flagUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const materialGet = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'material-1',
          knowledge_base_id: 'kb1',
          input_type: 'note',
          platform_code: 'note',
          title: '笔记',
          created_at: '2026-09-14T00:00:00Z',
          status: 'ready',
          tags_user_edited: true,
          material_tag_relations: [],
        },
        error: null,
      }),
    };

    from
      .mockReturnValueOnce(clearRelations)
      .mockReturnValueOnce(flagUpdate)
      .mockReturnValueOnce(materialGet);

    const result = await replaceMaterialTags('material-1', ['  ', '#', '']);

    expect(clearRelations.delete).toHaveBeenCalled();
    expect(clearRelations.eq).toHaveBeenCalledWith('material_id', 'material-1');
    expect(flagUpdate.update).toHaveBeenCalledWith({ tags_user_edited: true });
    expect(result.tags).toEqual([]);
    expect(result.tagsUserEdited).toBe(true);
    // no relation insert when all names empty after normalize
    expect(from).toHaveBeenCalledTimes(3);
  });
});
