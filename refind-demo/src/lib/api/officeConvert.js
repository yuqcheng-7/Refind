function bytesToBase64(bytes) {
  const binary = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binaryString = '';
  const chunk = 0x8000;
  for (let i = 0; i < binary.length; i += chunk) {
    binaryString += String.fromCharCode(...binary.subarray(i, i + chunk));
  }
  return btoa(binaryString);
}

function base64ToBytes(value) {
  const raw = atob(String(value || ''));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function resolveOfficeConvertBase(explicit) {
  const configured = String(
    explicit
    || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PLATFORM_PARSER_URL : '')
    || '',
  ).trim();
  return configured.replace(/\/$/, '');
}

/**
 * Ask local/hosted platform-parser to convert Office → PDF.
 * Returns a blob: URL the caller must revoke.
 */
export async function convertOfficeFileToPdfBlobUrl({
  filename,
  bytes,
  convertBase,
  fetchImpl = fetch,
} = {}) {
  const base = resolveOfficeConvertBase(convertBase);
  if (!base) {
    throw new Error('未配置本地解析服务（VITE_PLATFORM_PARSER_URL），无法转换 Office 版式。');
  }
  const response = await fetchImpl(`${base}/convert-office`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: filename || 'document.bin',
      content_base64: bytesToBase64(bytes),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `转换失败（${response.status}）`);
  }
  const pdfBytes = base64ToBytes(payload.content_base64);
  if (!pdfBytes.byteLength) throw new Error('转换结果为空');
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
