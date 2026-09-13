import { supabase } from '../supabaseClient.js';

export function mapAuthError(error) {
  if (!error) return null;
  if (/invalid login/i.test(error.message)) return '邮箱或密码不正确';
  if (/already registered/i.test(error.message)) return '该邮箱已注册';
  return '操作失败，请稍后重试';
}

export async function signUp({ email, password }) {
  return supabase.auth.signUp({ email, password });
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

export async function getSession() {
  return supabase.auth.getSession();
}
