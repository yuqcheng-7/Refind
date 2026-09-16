function cleanInline(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function cleanMultiline(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectXmlText(xml, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');
  const parts = [];
  for (const match of xml.matchAll(pattern)) {
    const text = cleanInline(match[1].replace(/<[^>]+>/g, ' '));
    if (text) parts.push(text);
  }
  return parts;
}

function paragraphInnerText(paragraphXml) {
  const runs = [];
  for (const match of paragraphXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi)) {
    runs.push(String(match[1] || '').replace(/<[^>]+>/g, ''));
  }
  return cleanInline(runs.join(''));
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
  const paragraphs = [];
  for (const match of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi)) {
    const text = paragraphInnerText(match[1] || '');
    if (text) paragraphs.push(text);
  }
  return cleanMultiline(paragraphs.join('\n\n'));
}

function extractPptxText(files) {
  const slides = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!slides.length) throw new Error('无效的 PPT 文档');

  const slideTexts = slides.map((path, index) => {
    const parts = collectXmlText(files[path], 'a:t');
    const body = cleanInline(parts.join(' '));
    if (!body) return '';
    return `【幻灯片 ${index + 1}】\n${body}`;
  }).filter(Boolean);
  return cleanMultiline(slideTexts.join('\n\n'));
}

function extractXlsxText(files) {
  const shared = [];
  const sharedXml = files['xl/sharedStrings.xml'];
  if (sharedXml) {
    for (const match of sharedXml.matchAll(/<si\b[\s\S]*?<\/si>/gi)) {
      shared.push(cleanInline(match[0].replace(/<[^>]+>/g, ' ')));
    }
  }

  const sheets = Object.keys(files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!sheets.length) throw new Error('无效的表格文档');

  const sections = [];
  sheets.forEach((path, sheetIndex) => {
    const xml = files[path];
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      const values = [];
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const attrs = cell[1] || '';
        const body = cell[2] || '';
        const valueMatch = /<v>([\s\S]*?)<\/v>/i.exec(body);
        if (!valueMatch) continue;
        const raw = cleanInline(valueMatch[1]);
        if (!raw) continue;
        if (/\bt\s*=\s*["']s["']/i.test(attrs)) {
          const index = Number(raw);
          values.push(shared[index] || raw);
        } else {
          values.push(raw);
        }
      }
      if (values.length) rows.push(values.join('\t'));
    }
    if (rows.length) {
      sections.push(`【工作表 ${sheetIndex + 1}】\n${rows.join('\n')}`);
    }
  });

  return cleanMultiline(sections.join('\n\n'));
}

async function extractPdfText(bytes, unpdf) {
  const pdf = await unpdf.getDocumentProxy(bytes);
  const result = await unpdf.extractText(pdf, { mergePages: true });
  const joined = Array.isArray(result.text) ? result.text.join('\n') : result.text;
  return cleanMultiline(joined);
}

/**
 * @param {string} inputType
 * @param {Uint8Array} bytes
 * @param {{ JSZip: any, unpdf: { extractText: Function, getDocumentProxy: Function } }} deps
 * @returns {Promise<string>}
 */
export async function extractDocumentText(inputType, bytes, deps) {
  if (!deps?.JSZip || !deps?.unpdf) {
    throw new Error('文档解析依赖未正确加载');
  }

  let text = '';
  switch (inputType) {
    case 'pdf':
      text = await extractPdfText(bytes, deps.unpdf);
      break;
    case 'docx':
      text = extractDocxText(await readZipFiles(bytes, deps.JSZip));
      break;
    case 'pptx':
      text = extractPptxText(await readZipFiles(bytes, deps.JSZip));
      break;
    case 'xlsx':
      text = extractXlsxText(await readZipFiles(bytes, deps.JSZip));
      break;
    case 'doc':
      throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传');
    default:
      throw new Error(`暂不支持解析 ${inputType} 文件`);
  }
  return text;
}

export const OFFICE_PARSEABLE_TYPES = new Set(['pdf', 'docx', 'pptx', 'xlsx']);
