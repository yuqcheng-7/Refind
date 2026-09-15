function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function collectXmlText(xml, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');
  const parts = [];
  for (const match of xml.matchAll(pattern)) {
    const text = cleanText(match[1].replace(/<[^>]+>/g, ' '));
    if (text) parts.push(text);
  }
  return parts;
}

async function readZipFiles(bytes, JSZip) {
  const zip = await JSZip.loadAsync(bytes);
  const files = {};
  const entries = Object.keys(zip.files);
  await Promise.all(entries.map(async (path) => {
    const entry = zip.files[path];
    if (!entry || entry.dir) return;
    files[path] = await entry.async('string');
  }));
  return files;
}

function extractDocxText(files) {
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('无效的 Word 文档');
  const text = cleanText(collectXmlText(xml, 'w:t').join(' '));
  if (!text) throw new Error('未从 Word 文档提取到可用正文');
  return text;
}

function extractPptxText(files) {
  const slides = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!slides.length) throw new Error('无效的 PPT 文档');

  const parts = slides.flatMap((path) => collectXmlText(files[path], 'a:t'));
  const text = cleanText(parts.join(' '));
  if (!text) throw new Error('未从 PPT 文档提取到可用正文');
  return text;
}

function extractXlsxText(files) {
  const shared = [];
  const sharedXml = files['xl/sharedStrings.xml'];
  if (sharedXml) {
    for (const match of sharedXml.matchAll(/<si\b[\s\S]*?<\/si>/gi)) {
      shared.push(cleanText(match[0].replace(/<[^>]+>/g, ' ')));
    }
  }

  const sheets = Object.keys(files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!sheets.length) throw new Error('无效的表格文档');

  const values = [];
  for (const path of sheets) {
    const xml = files[path];
    for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cell[1] || '';
      const body = cell[2] || '';
      const valueMatch = /<v>([\s\S]*?)<\/v>/i.exec(body);
      if (!valueMatch) continue;
      const raw = cleanText(valueMatch[1]);
      if (!raw) continue;
      if (/\bt\s*=\s*["']s["']/i.test(attrs)) {
        const index = Number(raw);
        values.push(shared[index] || raw);
      } else {
        values.push(raw);
      }
    }
  }

  const text = cleanText(values.join(' '));
  if (!text) throw new Error('未从表格文档提取到可用正文');
  return text;
}

async function extractPdfText(bytes, unpdf) {
  const pdf = await unpdf.getDocumentProxy(bytes);
  const result = await unpdf.extractText(pdf, { mergePages: true });
  const text = cleanText(Array.isArray(result.text) ? result.text.join('\n') : result.text);
  if (!text) throw new Error('未从 PDF 提取到可用正文');
  return text;
}

/**
 * @param {string} inputType
 * @param {Uint8Array} bytes
 * @param {{ JSZip: any, unpdf: { extractText: Function, getDocumentProxy: Function } }} deps
 */
export async function extractDocumentText(inputType, bytes, deps) {
  if (!deps?.JSZip || !deps?.unpdf) {
    throw new Error('文档解析依赖未正确加载');
  }

  switch (inputType) {
    case 'pdf':
      return extractPdfText(bytes, deps.unpdf);
    case 'docx':
      return extractDocxText(await readZipFiles(bytes, deps.JSZip));
    case 'pptx':
      return extractPptxText(await readZipFiles(bytes, deps.JSZip));
    case 'xlsx':
      return extractXlsxText(await readZipFiles(bytes, deps.JSZip));
    case 'doc':
      throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传');
    default:
      throw new Error(`暂不支持解析 ${inputType} 文件`);
  }
}

export const OFFICE_PARSEABLE_TYPES = new Set(['pdf', 'docx', 'pptx', 'xlsx']);
