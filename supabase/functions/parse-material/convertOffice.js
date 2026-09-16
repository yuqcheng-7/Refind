/**
 * Soft-convert Office files to PDF.
 * Supports:
 * - Gotenberg: POST {base}/forms/libreoffice/convert (multipart)
 * - Refind platform-parser: POST {base}/convert-office (JSON base64)
 * Never throws for transport failures — caller treats null as skip.
 */

function PathLikePdf(name) {
  const base = String(name || 'document').replace(/\.[^.]+$/, '');
  return `${base || 'document'}.pdf`;
}

function toUint8(bytes) {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function bytesToBase64(bytes) {
  const binary = toUint8(bytes);
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

async function convertViaGotenberg({ base, filename, bytes, fetchImpl }) {
  const form = new FormData();
  form.append(
    'files',
    new Blob([toUint8(bytes)], { type: 'application/octet-stream' }),
    filename || 'document.bin',
  );
  const response = await fetchImpl(`${base}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) return null;
  return {
    bytes: new Uint8Array(buffer),
    filename: PathLikePdf(filename),
  };
}

async function convertViaRefindParser({ base, filename, bytes, fetchImpl }) {
  const response = await fetchImpl(`${base}/convert-office`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: filename || 'document.bin',
      content_base64: bytesToBase64(bytes),
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const out = String(payload?.content_base64 || '').trim();
  if (!out) return null;
  return {
    bytes: base64ToBytes(out),
    filename: String(payload.filename || PathLikePdf(filename)),
  };
}

export async function convertOfficeToPdf({
  convertUrl,
  filename,
  bytes,
  engine = '',
  fetchImpl = fetch,
} = {}) {
  const base = String(convertUrl || '').trim().replace(/\/$/, '');
  if (!base || !bytes?.byteLength) return null;
  const name = String(filename || 'document.bin');
  const mode = String(engine || '').trim().toLowerCase();

  try {
    if (mode === 'gotenberg' || /:3000\b/.test(base) || /gotenberg/i.test(base)) {
      return await convertViaGotenberg({ base, filename: name, bytes, fetchImpl });
    }
    if (mode === 'refind' || mode === 'parser') {
      return await convertViaRefindParser({ base, filename: name, bytes, fetchImpl });
    }

    // Auto: prefer Gotenberg, then refind parser JSON API.
    const gotenberg = await convertViaGotenberg({ base, filename: name, bytes, fetchImpl });
    if (gotenberg) return gotenberg;
    return await convertViaRefindParser({ base, filename: name, bytes, fetchImpl });
  } catch {
    return null;
  }
}

export function buildPreviewObjectKey(storageObjectKey) {
  const key = String(storageObjectKey || '').trim();
  if (!key) return '';
  return `${key}.preview.pdf`;
}
