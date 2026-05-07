// @ts-nocheck
// Supabase Edge Function (Deno)
// Retry DeepSeek generation for an existing bookmark.

import { createClient } from "jsr:@supabase/supabase-js@2";

type Body = { bookmark_id: string };

function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  for (let end = text.length - 1; end > start; end--) {
    if (text[end] !== "}") continue;
    const slice = text.slice(start, end + 1);
    try {
      const obj = JSON.parse(slice);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
    } catch {
      // keep trying shorter slices
    }
  }
  return null;
}

function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim().replace(/^#/, "");
    if (!t) continue;
    if (t.length < 2 || t.length > 12) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

function extractTagsFallback(text: string): string[] {
  const candidates: string[] = [];
  for (const m of text.matchAll(/#([^\s#，,、;；。.!！?？]{2,12})/g)) {
    candidates.push(m[1]);
  }
  const line = text.split("\n").find((l) => l.includes("标签"));
  if (line) {
    const rhs = line.split(/[:：]/).slice(1).join(":");
    rhs
      .split(/[，,、/|；; ]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => candidates.push(t.replace(/^#/, "")));
  }
  const arr = text.match(/\[\s*"(?:[^"]+)"(?:\s*,\s*"[^"]+")*\s*\]/);
  if (arr?.[0]) {
    try {
      const parsed = JSON.parse(arr[0]);
      if (Array.isArray(parsed)) {
        for (const v of parsed) if (typeof v === "string") candidates.push(v);
      }
    } catch {}
  }
  return normalizeTags(candidates);
}

function buildAiPrompt(args: { url: string; title?: string | null; excerpt?: string | null }): string {
  return [
    "你是一个信息提炼助手。",
    "请严格输出 JSON（不要 Markdown，不要解释），格式如下：",
    '{"summary":"...","tags":["...","...","..."]}',
    "",
    "规则：",
    "- summary：中文 1 段，不超过 120 字",
    "- tags：默认 3 个，最多 6 个；每个标签 2~12 个字；去重；不要带 #",
    "",
    "如果你无法严格输出 JSON，请退而求其次输出两行纯文本：",
    "摘要：<一段中文摘要>",
    "标签：A、B、C",
    "",
    `url: ${args.url}`,
    args.title ? `title: ${args.title}` : "",
    args.excerpt ? `content: ${args.excerpt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getChatText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const j = json as any;
  const choices = j.choices;
  if (!Array.isArray(choices) || !choices.length) return "";
  const t = choices[0]?.message?.content ?? choices[0]?.text;
  return typeof t === "string" ? t : "";
}

async function readJsonOrText(resp: Response): Promise<{ ok: boolean; status: number; json: any | null; text: string }> {
  const status = resp.status;
  const raw = await resp.text().catch(() => "");
  let json: any | null = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { ok: resp.ok, status, json, text: raw };
}

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get("Origin") ?? "*";
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(req, new Response("ok", { status: 200 }));
  if (req.method !== "POST") return withCors(req, new Response("Method not allowed", { status: 405 }));

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return withCors(req, new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }));
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.bookmark_id) {
    return withCors(req, new Response(JSON.stringify({ error: "Missing bookmark_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
  }

  const { data: bookmark, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("id", body.bookmark_id)
    .single();

  if (error || !bookmark) {
    return withCors(req, new Response(JSON.stringify({ error: error?.message ?? "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }));
  }

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
  const model = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";
  if (!apiKey) {
    await supabase.from("bookmarks").update({ ai_status: "failed", ai_error: "missing_deepseek_key" }).eq("id", bookmark.id);
    return withCors(req, new Response(JSON.stringify({ error: "missing_deepseek_key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }));
  }

  const prompt = buildAiPrompt({ url: bookmark.url, title: bookmark.title, excerpt: bookmark.excerpt });

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const { ok: httpOk, status: httpStatus, json, text: rawText } = await readJsonOrText(resp);
  if (!httpOk) {
    const errMsg =
      (json && (json.error?.message || json.message || JSON.stringify(json).slice(0, 400))) ||
      rawText.slice(0, 400) ||
      `http_${httpStatus}`;
    await supabase.from("bookmarks").update({ ai_status: "failed", ai_error: errMsg }).eq("id", bookmark.id);
    return withCors(
      req,
      new Response(JSON.stringify({ error: errMsg, httpStatus, outputPreview: rawText.slice(0, 800) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  const outputText = getChatText(json).trim();

  const obj = extractFirstJsonObject(outputText);
  const summary =
    typeof obj?.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : outputText.trim();
  const tags = normalizeTags(obj?.tags);
  const finalTags = tags.length ? tags : extractTagsFallback(outputText);

  await supabase.from("bookmarks").update({ summary, ai_status: "done", ai_error: null }).eq("id", bookmark.id);

  if (finalTags.length) {
    const { data: upserted, error: upsertErr } = await supabase
      .from("tags")
      .upsert(
        finalTags.map((name) => ({ user_id: user.id, name })),
        { onConflict: "user_id,name" }
      )
      .select("id,name");

    if (!upsertErr && upserted?.length) {
      await supabase.from("bookmark_tags").delete().eq("bookmark_id", bookmark.id);
      await supabase.from("bookmark_tags").insert(
        upserted.map((t) => ({ bookmark_id: bookmark.id, tag_id: t.id }))
      );
    }
  }

  return withCors(req, new Response(JSON.stringify({ ok: true, summary, tags: finalTags }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
});

