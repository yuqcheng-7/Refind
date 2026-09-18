/**
 * Parse imported note files (.md / .txt) into createNote payloads.
 */

export function parseImportedNoteFile(filename, text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const baseName = String(filename || '')
    .replace(/\.(md|markdown|txt)$/i, '')
    .trim() || '未命名笔记';

  let title = baseName;
  let body = raw.trim();
  const heading = raw.match(/^\s*#\s+(.+?)\s*(?:\n|$)/);
  if (heading) {
    title = heading[1].trim() || baseName;
    body = raw.slice(heading[0].length).trim();
  }

  return {
    title,
    content: {
      text: body,
      html: body ? `<p>${escapeHtml(body).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>` : '',
      blocks: [],
      sections: [],
    },
    notebookId: null,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

export async function readImportedNoteFiles(fileList) {
  const files = [...(fileList || [])].filter((file) => /\.(md|markdown|txt)$/i.test(file.name) || /^text\//.test(file.type));
  const payloads = [];
  for (const file of files) {
    const text = await readFileText(file);
    payloads.push(parseImportedNoteFile(file.name, text));
  }
  return payloads;
}
