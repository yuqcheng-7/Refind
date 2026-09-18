import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { invokeEmbedMaterial } from '../parse-material/embedHook.js';
import {
  buildFanOutMaterialPatch,
  buildSyncedMaterialInsert,
  normalizeRequestBody,
  summarizeSyncOutcomes,
} from './core.js';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function syncOneKnowledgeBase({
  admin,
  userId,
  note,
  knowledgeBaseId,
  supabaseUrl,
  serviceRoleKey,
}: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  note: { id: string; title: string | null; content: unknown };
  knowledgeBaseId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const { data: kb, error: kbError } = await admin
    .from('knowledge_bases')
    .select('id, user_id')
    .eq('id', knowledgeBaseId)
    .maybeSingle();
  if (kbError) throw kbError;
  if (!kb || kb.user_id !== userId) {
    throw new Error('knowledge base not found or forbidden');
  }

  const { data: existingLink, error: linkError } = await admin
    .from('note_knowledge_base_materials')
    .select('material_id')
    .eq('note_id', note.id)
    .eq('knowledge_base_id', knowledgeBaseId)
    .maybeSingle();
  if (linkError) throw linkError;

  const patch = buildFanOutMaterialPatch({
    title: note.title,
    content: note.content,
  });

  let materialId = existingLink?.material_id as string | undefined;

  if (materialId) {
    const { error: updateError } = await admin
      .from('materials')
      .update({
        ...patch,
        origin_type: 'note',
        origin_note_id: note.id,
        input_type: 'note',
        platform_code: 'note',
        status: 'ready',
        last_parse_error: null,
      })
      .eq('id', materialId)
      .eq('user_id', userId);
    if (updateError) throw updateError;
  } else {
    const insertRow = buildSyncedMaterialInsert({
      userId,
      knowledgeBaseId,
      note,
    });
    const { data: created, error: createError } = await admin
      .from('materials')
      .insert(insertRow)
      .select('id')
      .single();
    if (createError) throw createError;
    materialId = created.id;

    const { error: linkInsertError } = await admin
      .from('note_knowledge_base_materials')
      .insert({
        note_id: note.id,
        knowledge_base_id: knowledgeBaseId,
        material_id: materialId,
      });
    if (linkInsertError) throw linkInsertError;
  }

  // Async embed — do not block the sync response.
  void invokeEmbedMaterial({
    supabaseUrl,
    serviceRoleKey,
    materialId,
  }).catch(() => {
    // embedHook already logs; keep sync successful
  });

  return { knowledgeBaseId, materialId, ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return response({ error: 'missing authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: 'Supabase function environment is incomplete' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: { noteId: string; knowledgeBaseIds: string[] };
  try {
    body = normalizeRequestBody(await req.json());
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'invalid request' }, 400);
  }

  try {
    const { data: note, error: noteError } = await admin
      .from('notes')
      .select('id, user_id, title, content')
      .eq('id', body.noteId)
      .maybeSingle();
    if (noteError) throw noteError;
    if (!note) return response({ error: 'note not found' }, 404);
    if (note.user_id !== userId) return response({ error: 'forbidden' }, 403);

    const outcomes = [];
    for (const knowledgeBaseId of body.knowledgeBaseIds) {
      try {
        outcomes.push(await syncOneKnowledgeBase({
          admin,
          userId,
          note,
          knowledgeBaseId,
          supabaseUrl,
          serviceRoleKey,
        }));
      } catch (error) {
        outcomes.push({
          knowledgeBaseId,
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = summarizeSyncOutcomes(outcomes);
    return response({
      noteId: note.id,
      ...summary,
      knowledgeBaseIds: summary.synced.map((row) => row.knowledgeBaseId),
    });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
