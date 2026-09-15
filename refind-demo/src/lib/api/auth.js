import { supabase } from '../supabaseClient.js';

export function mapAuthError(error) {
  if (!error) return null;
  if (/invalid login/i.test(error.message)) return '邮箱或密码不正确';
  if (/already registered/i.test(error.message)) return '该邮箱已注册';
  return '操作失败，请稍后重试';
}

export async function signUp({ email, password, displayName }) {
  const trimmedName = String(displayName || '').trim();
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: trimmedName,
      },
    },
  });

  if (result.error || !trimmedName) return result;

  const userId = result.data?.user?.id;
  if (userId) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ display_name: trimmedName })
      .eq('id', userId);
    if (profileError) {
      return { data: result.data, error: profileError };
    }
  }

  return result;
}

export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('account-delete');
  if (error) throw error;
}

export async function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email);
}

export async function changePassword({ email, currentPassword, newPassword }) {
  const next = String(newPassword || '');
  if (next.length < 6) throw new Error('新密码至少 6 位');
  if (next === currentPassword) throw new Error('新密码不能与当前密码相同');

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) {
    throw new Error(mapAuthError(verifyError) || '当前密码不正确');
  }

  const { data, error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error(mapAuthError(error) || '修改密码失败，请稍后重试');
  return data;
}

export async function getSession() {
  return supabase.auth.getSession();
}
