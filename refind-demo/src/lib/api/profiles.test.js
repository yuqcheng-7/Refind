import { describe, expect, it, vi } from 'vitest';
import { resolveDisplayName, updateMyDisplayName } from './profiles.js';

vi.mock('../supabaseClient.js', () => {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: 'u1', email: 'a@example.com', display_name: '新名字' },
          error: null,
        })),
      })),
    })),
  }));
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
        updateUser: async () => ({ data: {}, error: null }),
      },
      from: vi.fn(() => ({ update })),
    },
  };
});

describe('resolveDisplayName', () => {
  it('prefers profile display_name', () => {
    expect(resolveDisplayName(
      { display_name: '林知夏', email: 'a@example.com' },
      { user: { email: 'a@example.com' } },
    )).toBe('林知夏');
  });

  it('falls back to auth metadata then email local-part', () => {
    expect(resolveDisplayName(
      { display_name: '  ', email: 'a@example.com' },
      { user: { email: 'a@example.com', user_metadata: { display_name: '知夏' } } },
    )).toBe('知夏');

    expect(resolveDisplayName(
      { display_name: null, email: 'refind@example.com' },
      { user: { email: 'refind@example.com', user_metadata: {} } },
    )).toBe('refind');
  });
});

describe('updateMyDisplayName', () => {
  it('rejects empty names', async () => {
    await expect(updateMyDisplayName('   ')).rejects.toThrow('用户名不能为空');
  });

  it('updates profile display_name', async () => {
    const result = await updateMyDisplayName('新名字');
    expect(result.display_name).toBe('新名字');
  });
});
