import { supabase } from '../supabaseClient.js';

const terminalStatuses = new Set(['ready', 'failed', 'link_only']);

export function inferMaterialInputType(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const byExtension = {
    pdf: 'pdf',
    doc: 'doc',
    docx: 'docx',
    md: 'markdown',
    markdown: 'markdown',
    txt: 'txt',
    pptx: 'pptx',
    xlsx: 'xlsx',
    csv: 'csv',
  };
  if (byExtension[extension]) return byExtension[extension];

  const byMimeType = {
    'application/pdf': 'pdf',
    'text/markdown': 'markdown',
    'text/plain': 'txt',
    'text/csv': 'csv',
  };
  return byMimeType[file.type] || 'txt';
}

export async function uploadMaterialFile(userId, file) {
  const safeName = file.name.replace(/[\\/]/g, '-');
  const key = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('materials').upload(key, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return key;
}

export async function invokeMaterialParse(materialId) {
  const { error } = await supabase.functions.invoke('parse-material', {
    body: { materialId },
  });
  if (error) throw error;
}

export async function pollMaterialStatus(materialId, { intervalMs = 1000, timeoutMs = 120000 } = {}) {
  const startedAt = Date.now();
  while (true) {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', materialId)
      .single();
    if (error) throw error;
    if (terminalStatuses.has(data.status)) return data;
    if (Date.now() - startedAt >= timeoutMs) throw new Error('资料解析超时，请稍后重试');
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

export async function parseAndPollMaterial(materialId) {
  await invokeMaterialParse(materialId);
  return pollMaterialStatus(materialId);
}
