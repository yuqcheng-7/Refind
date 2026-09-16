export { buildRagSystemPrompt } from './ragRetrieve.js';

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
