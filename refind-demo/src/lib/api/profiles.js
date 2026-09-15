import { supabase } from '../supabaseClient.js';

export function resolveDisplayName(profile, session) {
  const fromProfile = profile?.display_name?.trim();
  if (fromProfile) return fromProfile;

  const fromMeta = session?.user?.user_metadata?.display_name?.trim();
  if (fromMeta) return fromMeta;

  const email = profile?.email || session?.user?.email || '';
  const local = email.split('@')[0]?.trim();
  return local || '用户';
}

export async function getMyProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', session.user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMyDisplayName(displayName) {
  const next = String(displayName || '').trim();
  if (!next) throw new Error('用户名不能为空');
  if (next.length > 30) throw new Error('用户名最多 30 个字符');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('请先登录');

  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: next })
    .eq('id', session.user.id)
    .select('id, email, display_name')
    .single();
  if (error) throw error;

  await supabase.auth.updateUser({ data: { display_name: next } });
  return data;
}
