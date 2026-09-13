import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 1000;

async function listAllStoragePaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data: objects, error } = await admin.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
    });
    if (error) throw error;
    if (!objects?.length) break;

    for (const object of objects) {
      const objectPath = prefix ? `${prefix}/${object.name}` : object.name;
      if (object.id === null) {
        paths.push(...await listAllStoragePaths(admin, bucket, objectPath));
      } else {
        paths.push(objectPath);
      }
    }

    if (objects.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return paths;
}

async function removeStoragePaths(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw error;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return response({ error: 'Missing authorization' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return response({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  let paths: string[];
  try {
    paths = await listAllStoragePaths(admin, 'materials', user.id);
  } catch (listError) {
    const message = listError instanceof Error ? listError.message : 'Failed to list storage objects';
    return response({ error: message }, 500);
  }

  if (paths.length) {
    try {
      await removeStoragePaths(admin, 'materials', paths);
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Failed to remove storage objects';
      return response({ error: message }, 500);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return response({ error: deleteError.message }, 500);

  return response({ ok: true });
});
