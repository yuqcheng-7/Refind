// @ts-nocheck
// Preview + AI draft without persisting. Used by Add 收藏 flow (PRD 3.3).
// Auth: JWT required. Same secrets as bookmark_ingest.

import { createClient } from "jsr:@supabase/supabase-js@2";

type Body = { url: string };

function detectPlatform(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "zhihu.com" || host.endsWith(".zhihu.com")) return "zhihu";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com")) return "bilibili";
  if (host === "douyin.com" || host.endsWith(".douyin.com")) return "douyin";
  if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) return "xiaohongshu";
  if (host === "mp.weixin.qq.com" || host.endsWith(".weixin.qq.com")) return "wechat";
  return host ? "other" : null;
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

function extractOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!m?.[1]) return null;
  const u = m[1].trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u.slice(0, 2048);
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
      // keep trying
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
    if (t.length < 1 || t.length > 12) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

function extractTagsFallback(text: string): string[] {
  const candidates: string[] = [];
  for (const m of text.matchAll(/#([^\s#，,、;；。.!！?？]{1,12})/g)) {
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
    "- summary：中文 1 段，80–120 字为宜，硬上限 150 字；单段落不换行",
    "- tags：默认 3 个，最多 6 个；每个标签 1~12 个字；去重；不要带 #",
    "",
    weak
      ? [
          "",
          "内容说明：未能抓取到足够正文。请根据 url、域名与路径合理推断主题；",
          "禁止推脱句式。",
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

function clampSummary(s: string): string {
  let t = s.trim().replace(/\s+/g, " ");
  if (t.length <= 150) return t;
  t = t.slice(0, 150);
  return t.replace(/[，。、；：！？\s]+$/g, "").trim();
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
  if (!body?.url?.trim()) {
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

  const proto = parsed.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    return withCors(req, new Response(JSON.stringify({ error: "仅支持 http/https 链接" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
  }

  let source_platform = detectPlatform(parsed);
  let html = "";
  let title: string | null = null;
  let excerpt: string | null = null;
  let preview_image_url: string | null = null;
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
    const tOg = extractOgTitle(html);
    const tPage = extractTitle(html);
    title = tOg || tPage;
    preview_image_url = extractOgImage(html);
    const plain = plainTextFromHtml(html);
    excerpt = plain.length >= 40 ? plain : null;
    if (!fetchOk) {
      excerpt = null;
      preview_image_url = null;
    }
  } catch {
    // weak parse
  }

  const parse_ok = !!(fetchOk && excerpt && excerpt.length >= 40);
  const weakContent = !fetchOk || !excerpt || excerpt.length < 40;

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
  const model = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";

  let summary = "";
  let tags: string[] = [];
  let ai_error: string | null = null;

  if (apiKey) {
    try {
      const prompt = buildAiPrompt({
        url: parsed.toString(),
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

      const { ok: httpOk, json } = await readJsonOrText(resp);
      if (httpOk) {
        const outputText = getChatText(json).trim();
        const obj = extractFirstJsonObject(outputText);
        const rawSummary =
          typeof obj?.summary === "string" && obj.summary.trim()
            ? obj.summary.trim()
            : outputText.trim();
        summary = clampSummary(rawSummary);
        tags = normalizeTags(obj?.tags);
        if (!tags.length) tags = extractTagsFallback(outputText);
      } else {
        ai_error = "生成失败";
      }
    } catch {
      ai_error = "生成失败";
    }
  } else {
    ai_error = "missing_deepseek_key";
  }

  return withCors(
    req,
    new Response(
      JSON.stringify({
        ok: true,
        url: parsed.toString(),
        title,
        excerpt,
        preview_image_url,
        source_platform,
        parse_ok,
        summary,
        tags,
        ai_error,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
});
