export function resolveAnswerMode(input: {
  surface: 'home' | 'knowledge';
  knowledgeBaseIds?: string[];
  tagFilters?: string[];
}): 'general' | 'rag' {
  if (input.surface === 'knowledge') return 'rag';
  if ((input.knowledgeBaseIds?.length ?? 0) > 0 || (input.tagFilters?.length ?? 0) > 0) return 'rag';
  return 'general';
}

export function mapThinkingMode(mode: 'fast' | 'deep' | string | undefined) {
  return mode === 'deep' || mode === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';
}

export function parseCitationMarkers(answer: string): number[] {
  const seen = new Set<number>();
  const orders: number[] = [];
  const re = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(answer))) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    orders.push(n);
  }
  return orders;
}

export function buildRagSystemPrompt(snippets: { index: number; content: string; title: string }[]) {
  const block = snippets
    .map((s) => `[${s.index}] 《${s.title}》\n${s.content}`)
    .join('\n\n');
  return `你是拾藏知识库助手。只能依据下列「资料片段」回答。
写作要求：
1. 用自然中文；分点时写成「1. 内容……」同一行。
2. 每个 [n] 只对应下方编号为 n 的短片段；句末标注支撑该句的片段，不要用文档标题代替具体内容。
3. 不同事实来自不同片段时必须换用不同 [n]；禁止通篇反复只标同一个 [1]。
4. 不要把整篇文档概括后只挂一个总引用。
5. 资料不足时明确说明，不要编造。

资料片段：
${block}`;
}
