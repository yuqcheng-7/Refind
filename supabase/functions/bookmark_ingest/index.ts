// @ts-nocheck
// Supabase Edge Function (Deno)
// Ingest a URL, fetch + parse HTML, then call DeepSeek to generate summary/tags.
//
// Deploy/config:
// - Set secrets: DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
// - This function expects an authenticated Supabase user (JWT).

import { createClient } from "jsr:@supabase/supabase-js@2";

type IngestBody = {
  url: string;
  collection_id?: string | null;
};

type AiPayload = {
  summary: string;
  tags: string[];
};

function detectPlatform(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "zhihu.com" || host.endsWith(".zhihu.com")) return "zhihu";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com")) return "bilibili";
  if (host === "douyin.com" || host.endsWith(".douyin.com")) return "douyin";
  if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) return "xiaohongshu";
  return host || null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

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
    // MVP: length guard to avoid huge garbage tags
    if (t.length < 2 || t.length > 12) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

function extractTagsFallback(text: string): string[] {
  // Try to extract tags from common non-JSON outputs:
  // - lines like: 标签：A、B、C
  // - hashtags: #A #B
  // - bracket arrays: ["A","B"]
  const candidates: string[] = [];

  // 1) hashtags
  for (const m of text.matchAll(/#([^\s#，,、;；。.!！?？]{2,12})/g)) {
    candidates.push(m[1]);
  }

  // 2) "标签" line
  const line = text.split("\n").find((l) => l.includes("标签"));
  if (line) {
    const rhs = line.split(/[:：]/).slice(1).join(":");
    rhs
      .split(/[，,、/|；; ]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => candidates.push(t.replace(/^#/, "")));
  }

  // 3) JSON-ish array inside text
  const arr = text.match(/\[\s*"(?:[^"]+)"(?:\s*,\s*"[^"]+")*\s*\]/);
  if (arr?.[0]) {
    try {
      const parsed = JSON.parse(arr[0]);
      if (Array.isArray(parsed)) {
        for (const v of parsed) if (typeof v === "string") candidates.push(v);
      }
    } catch {
      // ignore
    }
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

  const body = (await req.json().catch(() => null)) as IngestBody | null;
  if (!body?.url) {
    return withCors(req, new Response(JSON.stringify({ error: "Missing url" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
  }

  let parsed: URL;
  try {
    parsed = new URL(body.url.trim());
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
  }

  const source_platform = detectPlatform(parsed);

  // Fetch & parse (best-effort)
  let html = "";
  let title: string | null = null;
  let excerpt: string | null = null;
  try {
    const r = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    html = await r.text();
    title = extractTitle(html);
    excerpt = html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200) || null;
  } catch {
    // ignore fetch errors; we still save the URL.
  }

  // Create bookmark (ai pending)
  const { data: bookmark, error: insertErr } = await supabase
    .from("bookmarks")
    .insert({
      user_id: user.id,
      collection_id: body.collection_id ?? null,
      url: parsed.toString(),
      source_platform,
      title,
      excerpt,
      ai_status: "pending",
    })
    .select("*")
    .single();

  if (insertErr) {
    return withCors(req, new Response(JSON.stringify({ error: insertErr.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
  }

  // For platforms we don't promise parsing, skip AI (still save link)
  if (source_platform === "douyin" || source_platform === "xiaohongshu") {
    await supabase.from("bookmarks").update({ ai_status: "failed", ai_error: "platform_not_supported" }).eq("id", bookmark.id);
    return withCors(req, new Response(JSON.stringify({ ok: true, bookmark, note: "platform_not_supported" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }

  // Call DeepSeek (OpenAI-compatible Responses API)
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
  const model = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";

  if (!apiKey) {
    await supabase.from("bookmarks").update({ ai_status: "failed", ai_error: "missing_deepseek_key" }).eq("id", bookmark.id);
    return withCors(req, new Response(JSON.stringify({ ok: true, bookmark, note: "missing_deepseek_key" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }

  try {
    const prompt = buildAiPrompt({ url: parsed.toString(), title, excerpt });

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
        new Response(
          JSON.stringify({
            ok: true,
            bookmark,
            tags: [],
            debug: { tagWriteError: null, httpStatus, outputPreview: rawText.slice(0, 800) },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
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

    await supabase
      .from("bookmarks")
      .update({ summary, ai_status: "done", ai_error: null })
      .eq("id", bookmark.id);

    let tagWriteError: string | null = null;
    if (finalTags.length) {
      const { data: upserted, error: upsertErr } = await supabase
        .from("tags")
        .upsert(
          finalTags.map((name) => ({ user_id: user.id, name })),
          { onConflict: "user_id,name" }
        )
        .select("id,name");

      if (upsertErr) {
        tagWriteError = `upsert_tags:${upsertErr.message}`;
      } else if (upserted?.length) {
        const del = await supabase.from("bookmark_tags").delete().eq("bookmark_id", bookmark.id);
        if (del.error) {
          tagWriteError = `delete_bookmark_tags:${del.error.message}`;
        } else {
          const ins = await supabase.from("bookmark_tags").insert(
            upserted.map((t) => ({ bookmark_id: bookmark.id, tag_id: t.id }))
          );
          if (ins.error) tagWriteError = `insert_bookmark_tags:${ins.error.message}`;
        }
      } else {
        tagWriteError = "upsert_tags:no_rows_returned";
      }
    }

    const debug =
      finalTags.length === 0 || tagWriteError
        ? {
            tagWriteError,
            outputPreview: outputText.slice(0, 800),
          }
        : undefined;

    return withCors(
      req,
      new Response(
        JSON.stringify({
          ok: true,
          bookmark: { ...bookmark, summary, ai_status: "done" },
          tags: finalTags,
          debug,
        }),
        {
      status: 200,
      headers: { "Content-Type": "application/json" },
        }
      )
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ai_failed";
    await supabase.from("bookmarks").update({ ai_status: "failed", ai_error: msg }).eq("id", bookmark.id);
    return withCors(req, new Response(JSON.stringify({ ok: true, bookmark, note: msg }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }
});

