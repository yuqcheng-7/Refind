import {
  buildMaterialEnrichmentPrompt,
  parseMaterialEnrichmentResponse,
} from './enrichment.js';

export const ENRICHMENT_TIMEOUT_MS = 25_000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function enrichMaterialSummaryAndTags({
  deepseekChat,
  title,
  platform,
  contentText,
  timeoutMs = ENRICHMENT_TIMEOUT_MS,
}) {
  try {
    const raw = await withTimeout(
      deepseekChat(
        buildMaterialEnrichmentPrompt({ title, platform, contentText }),
        { model: 'deepseek-chat', temperature: 0.2 },
      ),
      timeoutMs,
      'material enrichment',
    );
    const parsed = parseMaterialEnrichmentResponse(raw);
    if (!parsed) return { summary: null, tags: null, usedAi: false };
    return { summary: parsed.summary, tags: parsed.tags, usedAi: true };
  } catch (err) {
    console.error('material enrichment failed', err);
    return { summary: null, tags: null, usedAi: false };
  }
}
