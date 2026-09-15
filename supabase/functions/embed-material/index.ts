import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { embedTexts } from '../_shared/ai.ts';
import { chunkText, DEFAULT_CHUNK_HARD_MAX } from '../_shared/chunkText.js';
import { isServiceAuthorization, updateChunkEmbedding } from './core.js';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function shouldRebuildChunks(contentText: string, chunks: { content?: string }[], force: boolean) {
  if (force) return true;
  if (!contentText.trim()) return false;
  if (!chunks.length) return true;
  if (chunks.some((chunk) => String(chunk.content || '').length > DEFAULT_CHUNK_HARD_MAX)) return true;
  if (contentText.length > 500 && chunks.length <= 1) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase function environment is incomplete');
    }

    const isService = isServiceAuthorization(authHeader, serviceRoleKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let userId = '';
    if (!isService) {
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) return response({ error: 'unauthorized' }, 401);
      userId = userData.user.id;
    }

    const body = await req.json();
    const materialId = typeof body?.materialId === 'string' ? body.materialId.trim() : '';
    if (!materialId) return response({ error: 'materialId required' }, 400);
    const forceRebuild = body?.rebuildChunks === true;

    const { data: material, error: materialError } = await admin
      .from('materials')
      .select('id, user_id, status, content_text, knowledge_base_id')
      .eq('id', materialId)
      .maybeSingle();
    if (materialError || !material) return response({ error: 'material not found' }, 404);
    if (!isService && material.user_id !== userId) {
      return response({ error: 'forbidden' }, 403);
    }
    if (material.status !== 'ready') {
      return response({ error: 'material not ready' }, 409);
    }

    const { data: existingChunks, error: existingError } = await admin
      .from('material_chunks')
      .select('id, content')
      .eq('material_id', materialId)
      .order('chunk_index');
    if (existingError) throw existingError;

    const contentText = typeof material.content_text === 'string' ? material.content_text : '';
    let rebuilt = false;
    if (shouldRebuildChunks(contentText, existingChunks || [], forceRebuild)) {
      const parts = chunkText(contentText);
      const { error: deleteError } = await admin.from('material_chunks').delete().eq('material_id', materialId);
      if (deleteError) throw deleteError;
      if (parts.length) {
        const { error: insertError } = await admin.from('material_chunks').insert(parts.map((chunk, chunkIndex) => ({
          material_id: material.id,
          user_id: material.user_id,
          knowledge_base_id: material.knowledge_base_id,
          chunk_index: chunkIndex,
          content: chunk.content,
          source_start: chunk.source_start,
          source_end: chunk.source_end,
        })));
        if (insertError) throw insertError;
      }
      rebuilt = true;
    }

    const { data: chunks, error: chunksError } = await admin
      .from('material_chunks')
      .select('id, content')
      .eq('material_id', materialId)
      .is('embedding', null)
      .order('chunk_index');
    if (chunksError) throw chunksError;
    if (!chunks?.length) return response({ ok: true, embedded: 0, rebuilt });

    const vectors = await embedTexts(chunks.map((chunk) => chunk.content));
    if (vectors.length !== chunks.length) {
      throw new Error(`embedding count mismatch: expected ${chunks.length}, got ${vectors.length}`);
    }
    for (let index = 0; index < chunks.length; index += 1) {
      await updateChunkEmbedding(admin, chunks[index].id, vectors[index]);
    }

    return response({ ok: true, embedded: chunks.length, rebuilt });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
