import { describe, expect, it, vi } from 'vitest';

const { invoke, signUp, fromUpdate, fromEq } = vi.hoisted(() => {
  const fromEq = vi.fn().mockResolvedValue({ error: null });
  const fromUpdate = vi.fn(() => ({ eq: fromEq }));
  return {
    invoke: vi.fn(),
    signUp: vi.fn(),
    fromUpdate,
    fromEq,
  };
});

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp,
      updateUser: vi.fn(),
    },
    from: vi.fn(() => ({ update: fromUpdate })),
    functions: { invoke },
  },
}));

import * as auth from './auth.js';
import { supabase } from '../supabaseClient.js';

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

  it('signs up with display_name metadata and updates the profile', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: {} },
      error: null,
    });

    await auth.signUp({
      email: 'a@example.com',
      password: 'secret1',
      displayName: ' 林知夏 ',
    });

    expect(signUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'secret1',
      options: { data: { display_name: '林知夏' } },
    });
    expect(fromUpdate).toHaveBeenCalledWith({ display_name: '林知夏' });
    expect(fromEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('changes password after verifying the current one', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    supabase.auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    await auth.changePassword({
      email: 'a@example.com',
      currentPassword: 'oldpass1',
      newPassword: 'newpass1',
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'oldpass1',
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass1' });
  });
});
