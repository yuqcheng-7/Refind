const EMBED_DIM = 1024;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get('DASHSCOPE_API_KEY');
  if (!key) throw new Error('DASHSCOPE_API_KEY missing');
  const batches: number[][] = [];
  for (let i = 0; i < texts.length; i += 10) {
    const slice = texts.slice(i, i + 10);
    const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-v4',
        input: slice,
        dimensions: EMBED_DIM,
        encoding_format: 'float',
      }),
    });
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const rows = (json.data || []).sort((a: { index: number }, b: { index: number }) => a.index - b.index);
    for (const row of rows) batches.push(row.embedding as number[]);
  }
  return batches;
}

/** Map logical DeepSeek modes to Bailian OpenAI-compatible model ids (more reliable from CN/Edge). */
function bailianChatModel(model: 'deepseek-chat' | 'deepseek-reasoner') {
  return model === 'deepseek-reasoner' ? 'deepseek-r1' : 'deepseek-v3.2';
}

async function chatCompletions(
  url: string,
  key: string,
  body: Record<string, unknown>,
  label: string,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`${label} returned empty content`);
  }
  return content;
}

export async function deepseekChat(
  messages: { role: string; content: string }[],
  opts: { model: 'deepseek-chat' | 'deepseek-reasoner'; temperature?: number },
): Promise<string> {
  const temperature = opts.temperature ?? 0.3;
  const dashscopeKey = Deno.env.get('DASHSCOPE_API_KEY');
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');

  // Prefer Bailian-hosted DeepSeek: official api.deepseek.com often hangs from some networks.
  if (dashscopeKey) {
    try {
      return await chatCompletions(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        dashscopeKey,
        {
          model: bailianChatModel(opts.model),
          messages,
          temperature,
        },
        'bailian chat',
      );
    } catch (bailianError) {
      if (!deepseekKey) throw bailianError;
    }
  }

  if (!deepseekKey) throw new Error('DASHSCOPE_API_KEY or DEEPSEEK_API_KEY missing');
  return chatCompletions(
    'https://api.deepseek.com/chat/completions',
    deepseekKey,
    {
      model: opts.model,
      messages,
      temperature,
    },
    'deepseek',
  );
}
