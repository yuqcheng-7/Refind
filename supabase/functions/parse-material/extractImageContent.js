/**
 * Image OCR + short visual description via DashScope Qwen VL.
 * Returns plain text suitable for content_text / RAG.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

function bytesToBase64(bytes) {
  const binary = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < binary.length; i += chunk) {
    out += String.fromCharCode(...binary.subarray(i, i + chunk));
  }
  return btoa(out);
}

export function guessImageMime(fileName = '', fallback = 'image/jpeg') {
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || fallback;
}

function parseJsonPayload(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildContentText({ ocrText, description, fileName }) {
  const parts = [];
  const ocr = String(ocrText || '').trim();
  const desc = String(description || '').trim();
  if (desc) parts.push(`【画面描述】\n${desc}`);
  if (ocr) parts.push(`【识别文字】\n${ocr}`);
  if (!parts.length) {
    parts.push(`【图片资料】${fileName || '未命名图片'}（未识别到可用文字）`);
  }
  return parts.join('\n\n').trim();
}

async function callQwenVision({
  dashscopeKey,
  model,
  dataUrl,
  prompt,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dashscopeKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(55_000),
    },
  );
  if (!response.ok) {
    throw new Error(`vision failed: ${response.status} ${await response.text()}`);
  }
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('vision returned empty content');
  }
  return content.trim();
}

function readEnv(name) {
  try {
    if (typeof Deno !== 'undefined' && typeof Deno.env?.get === 'function') {
      return Deno.env.get(name) || '';
    }
  } catch {
    /* ignore non-Deno runtimes */
  }
  return '';
}

/**
 * @param {object} args
 * @param {Uint8Array} args.bytes
 * @param {string} [args.fileName]
 * @param {string} [args.mimeType]
 * @param {string} [args.dashscopeKey]
 * @param {string} [args.visionModel]
 * @param {typeof fetch} [args.fetchImpl]
 * @returns {Promise<{ content_text: string, ocr_text: string, description: string, usedAi: boolean }>}
 */
export async function extractImageContent({
  bytes,
  fileName = '',
  mimeType = '',
  dashscopeKey = '',
  visionModel = '',
  fetchImpl = fetch,
} = {}) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!payload.byteLength) throw new Error('图片为空');
  if (payload.byteLength > MAX_IMAGE_BYTES) throw new Error('图片超过 10MB 限制');

  const key = String(dashscopeKey || '').trim();
  const mime = String(mimeType || '').trim() || guessImageMime(fileName);
  const dataUrl = `data:${mime};base64,${bytesToBase64(payload)}`;

  if (!key) {
    return {
      content_text: buildContentText({ ocrText: '', description: '', fileName }),
      ocr_text: '',
      description: '',
      usedAi: false,
    };
  }

  const prompt = [
    '你是资料入库助手。请分析这张图片，输出严格 JSON（不要 markdown 代码块）：',
    '{"ocr_text":"图片中全部可读文字，按阅读顺序；无文字则空字符串","description":"一两句中文画面描述，便于检索"}',
  ].join('');

  // Prefer OCR-capable VL; fall back across known DashScope model ids.
  const models = [
    visionModel,
    readEnv('IMAGE_VISION_MODEL'),
    'qwen-vl-ocr-latest',
    'qwen-vl-ocr',
    'qwen-vl-plus',
  ].map((item) => String(item || '').trim()).filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);

  let lastError = null;
  for (const model of models) {
    try {
      const raw = await callQwenVision({
        dashscopeKey: key,
        model,
        dataUrl,
        prompt,
        fetchImpl,
      });
      const parsed = parseJsonPayload(raw);
      const ocrText = String(parsed?.ocr_text || parsed?.text || '').trim() || (
        parsed ? '' : raw
      );
      const description = String(parsed?.description || parsed?.caption || '').trim();
      return {
        content_text: buildContentText({ ocrText, description, fileName }),
        ocr_text: ocrText,
        description,
        usedAi: true,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('图片识别失败');
}
