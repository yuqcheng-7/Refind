import { describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
    },
    functions: { invoke },
  },
}));

import * as auth from './auth.js';

const { mapAuthError } = auth;

describe('auth helpers', () => {
  it('maps invalid login to Chinese copy', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('邮箱或密码不正确');
  });

  it('maps an already registered email to Chinese copy', () => {
    expect(mapAuthError({ message: 'User already registered' })).toBe('该邮箱已注册');
  });

  it('invokes the account-delete Edge Function', async () => {
    invoke.mockResolvedValue({ error: null });

    await expect(auth.deleteAccount()).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith('account-delete');
  });
});
