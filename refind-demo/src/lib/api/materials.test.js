import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, storageFrom } = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from,
    storage: { from: storageFrom },
  },
}));

import { deleteMaterial } from './materials.js';

describe('deleteMaterial', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('removes the stored file and soft-deletes the owned material', async () => {
    const lookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { storage_object_key: 'user/file.txt' }, error: null }),
    };
    const update = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const remove = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValueOnce(lookup).mockReturnValueOnce(update);
    storageFrom.mockReturnValue({ remove });

    await deleteMaterial('material-1');

    expect(remove).toHaveBeenCalledWith(['user/file.txt']);
    expect(update.update).toHaveBeenCalledWith({ status: 'deleted' });
    expect(update.eq).toHaveBeenCalledWith('id', 'material-1');
  });
});
