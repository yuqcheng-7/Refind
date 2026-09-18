import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deepseekChat } from '../_shared/ai.ts';
import {
  buildChaptersForPrompt,
  buildGenerateMessages,
  buildNoteContentFromAi,
  buildPromptPayload,
  normalizeNoteContent,
  normalizeRequestBody,
  orderCardsByOutline,
  parseAiJson,
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

  let body: { noteId: string };
  try {
    body = normalizeRequestBody(await req.json());
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'invalid request' }, 400);
  }

  try {
    const { data: note, error: noteError } = await admin
      .from('notes')
      .select('id, user_id, notebook_id, title, content, created_at, updated_at')
      .eq('id', body.noteId)
      .maybeSingle();
    if (noteError) throw noteError;
    if (!note) return response({ error: 'note not found' }, 404);
    if (note.user_id !== userId) return response({ error: 'forbidden' }, 403);

    const { data: relations, error: relationsError } = await admin
      .from('note_inspiration_cards')
      .select(`
        inspiration_card_id,
        sort_order,
        user_thought,
        inspiration_cards (
          id,
          content_snapshot,
          source_question_snapshot,
          answer_mode,
          citation_snapshot
        )
      `)
      .eq('note_id', note.id)
      .order('sort_order', { ascending: true });
    if (relationsError) throw relationsError;

    const cards = (relations || [])
      .map((row) => {
        const card = Array.isArray(row.inspiration_cards)
          ? row.inspiration_cards[0]
          : row.inspiration_cards;
        if (!card?.id) return null;
        return {
          id: card.id,
          content_snapshot: card.content_snapshot,
          source_question_snapshot: card.source_question_snapshot,
          answer_mode: card.answer_mode,
          citation_snapshot: card.citation_snapshot,
          user_thought: row.user_thought,
          sort_order: row.sort_order,
        };
      })
      .filter(Boolean);

    if (!cards.length) {
      return response({ error: '笔记尚未添加灵感卡片，无法生成' }, 400);
    }

    const currentContent = normalizeNoteContent(note.content);
    const orderedCards = orderCardsByOutline(cards, currentContent.outline);
    const chapters = buildChaptersForPrompt(currentContent.outline, orderedCards);
    const { error: revisionError } = await admin.from('note_revisions').insert({
      note_id: note.id,
      user_id: userId,
      title_snapshot: note.title,
      content_snapshot: currentContent,
      reason: 'before_generate',
    });
    if (revisionError) throw revisionError;

    const promptPayload = buildPromptPayload({
      title: note.title,
      cards: orderedCards,
      chapters,
    });
    const aiRaw = await deepseekChat(buildGenerateMessages(promptPayload), {
      model: 'deepseek-chat',
      temperature: 0.4,
    });
    const aiJson = parseAiJson(aiRaw);
    const generated = buildNoteContentFromAi(aiJson, orderedCards);
    const nextContent = {
      ...generated,
      ...(currentContent.outline ? { outline: currentContent.outline } : {}),
    };

    const { data: updated, error: updateError } = await admin
      .from('notes')
      .update({ content: nextContent })
      .eq('id', note.id)
      .eq('user_id', userId)
      .select('*, note_inspiration_cards(inspiration_card_id, sort_order, user_thought)')
      .single();
    if (updateError) throw updateError;

    return response(updated);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
