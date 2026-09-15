export function resolveAnswerMode({ surface, knowledgeBaseIds = [], tagFilters = [] }) {
  if (surface === 'knowledge') return 'rag';
  if (knowledgeBaseIds.length > 0 || tagFilters.length > 0) return 'rag';
  return 'general';
}

/** Home + exactly one KB → knowledge history; otherwise stay on home. */
export function resolveChatSurface({ knowledgeBaseIds = [], preferredSurface } = {}) {
  if (preferredSurface === 'home' || preferredSurface === 'knowledge') return preferredSurface;
  if (knowledgeBaseIds.length === 1) return 'knowledge';
  return 'home';
}

export function mapThinkingMode(mode) {
  return mode === 'deep' ? 'deepseek-reasoner' : 'deepseek-chat';
}

export function parseCitationMarkers(answer) {
  const seen = new Set();
  const orders = [];
  const re = /\[(\d+)\]/g;
  let match;
  while ((match = re.exec(answer))) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    orders.push(n);
  }
  return orders;
}
