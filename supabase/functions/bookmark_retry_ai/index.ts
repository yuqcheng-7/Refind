// @ts-nocheck
// Supabase Edge Function (Deno)
// Retry DeepSeek generation for an existing bookmark.

import { createClient } from "jsr:@supabase/supabase-js@2";

type Body = { bookmark_id: string };

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

function extractOgTitle(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function fetchHeadersForUrl(url: URL): Record<string, string> {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const h: Record<string, string> = {
    "User-Agent": ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
  if (host.endsWith("bilibili.com")) {
    h.Referer = "https://www.bilibili.com/";
    h["Sec-Fetch-Dest"] = "document";
    h["Sec-Fetch-Mode"] = "navigate";
    h["Sec-Fetch-Site"] = "none";
  } else if (host.endsWith("zhihu.com")) {
    h.Referer = "https://www.zhihu.com/";
  }
  return h;
}

function plainTextFromHtml(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200) || ""
  );
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

function buildAiPrompt(args: {
  url: string;
  title?: string | null;
  excerpt?: string | null;
  weakContent?: boolean;
}): string {
  const weak =
    args.weakContent ||
    !args.excerpt ||
    args.excerpt.trim().length < 40;

  return [
    "你是一个信息提炼助手。",
    "请严格输出 JSON（不要 Markdown，不要解释），格式如下：",
    '{"summary":"...","tags":["...","...","..."]}',
    "",
    "规则：",
    "- summary：中文 1 段，不超过 120 字",
    "- tags：默认 3 个，最多 6 个；每个标签 2~12 个字；去重；不要带 #",
    "",
    weak
      ? [
          "",
          "内容说明：未能抓取到足够正文（常见于反爬、需登录或前端渲染页面）。",
          "此时请根据 url、域名与路径合理推断主题：summary 写一句中性概述；tags 给 3 个合理标签。",
          "禁止输出「无法获取网页内容」「请提供文本」等推脱句式。",
        ].join("\n")
      : "",
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

  let parsed: URL;
  try {
    parsed = new URL(bookmark.url);
  } catch {
    return withCors(req, new Response(JSON.stringify({ error: "Invalid bookmark url" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
  }

  const source_platform = detectPlatform(parsed);
  let html = "";
  let fetchOk = false;
  try {
    const r = await fetch(parsed.toString(), {
      headers: fetchHeadersForUrl(parsed),
      redirect: "follow",
    });
    html = await r.text();
    fetchOk = r.ok;
    if (fetchOk && source_platform === "bilibili" && html.length < 2000) {
      const r2 = await fetch(parsed.toString(), {
        headers: {
          ...fetchHeadersForUrl(parsed),
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        },
        redirect: "follow",
      });
      if (r2.ok) {
        const h2 = await r2.text();
        if (h2.length > html.length) html = h2;
      }
    }
  } catch {
    // keep stored metadata
  }

  const tOg = extractOgTitle(html);
  const tPage = extractTitle(html);
  let fetchedTitle = tOg || tPage;
  const plain = plainTextFromHtml(html);
  let excerpt: string | null = fetchOk && plain.length >= 40 ? plain : null;
  if (!fetchOk) {
    fetchedTitle = null;
    excerpt = null;
  }

  const title = fetchedTitle || bookmark.title;
  if (!excerpt && typeof bookmark.excerpt === "string" && bookmark.excerpt.trim().length >= 40) {
    excerpt = bookmark.excerpt.trim();
  }

  const weakContent = !fetchOk || !excerpt || excerpt.length < 40;

  await supabase
    .from("bookmarks")
    .update({
      title,
      excerpt: excerpt ?? bookmark.excerpt,
    })
    .eq("id", bookmark.id);

  const prompt = buildAiPrompt({
    url: bookmark.url,
    title,
    excerpt,
    weakContent,
  });

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

