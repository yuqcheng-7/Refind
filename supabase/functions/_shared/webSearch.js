export function parseWebSources(searchInfo) {
  const rows = Array.isArray(searchInfo?.search_results) ? searchInfo.search_results : [];
  const out = [];
  let order = 1;
  for (const row of rows) {
    const url = String(row?.url || '').trim();
    if (!url) continue;
    const title = String(row?.title || url).trim() || url;
    out.push({ order: Number(row?.index) > 0 ? Number(row.index) : order, title, url });
    order += 1;
  }
  // Re-number sequentially if indexes missing/duplicate
  return out.map((item, i) => ({ ...item, order: i + 1 }));
}

/**
 * DashScope native Generation API — required for enable_source / search_info.
 * Compatible-mode chat completions do NOT return search sources.
 */
export async function qwenChatWithOptionalSearch(messages, opts = {}) {
  const key = Deno.env.get('DASHSCOPE_API_KEY');
  if (!key) throw new Error('DASHSCOPE_API_KEY missing');
  const model = opts.model || Deno.env.get('BAILIAN_ONLINE_MODEL') || 'qwen-plus';
  const onlineEnabled = opts.onlineEnabled === true;
  const body = {
    model,
    input: { messages },
    parameters: {
      result_format: 'message',
      temperature: opts.temperature ?? 0.3,
      enable_search: onlineEnabled,
      ...(onlineEnabled
        ? { search_options: { enable_source: true, search_strategy: 'turbo' } }
        : {}),
    },
  };
  const res = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw new Error(`qwen search chat failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const content = json?.output?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('qwen search chat returned empty content');
  }
  const webSources = onlineEnabled ? parseWebSources(json?.output?.search_info) : [];
  return { content, webSources };
}
