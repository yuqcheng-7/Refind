import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as unpdf from 'unpdf';
import { extractDocumentText } from '../../../supabase/functions/parse-material/extractDocumentText.js';

const deps = {
  JSZip,
  unpdf: {
    extractText: unpdf.extractText,
    getDocumentProxy: unpdf.getDocumentProxy,
  },
};

async function zipFromFiles(files) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

describe('extractDocumentText', () => {
  it('extracts text from docx document.xml', async () => {
    const bytes = await zipFromFiles({
      '[Content_Types].xml': '<?xml version="1.0"?><Types></Types>',
      'word/document.xml': `<?xml version="1.0"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>拾藏文档正文</w:t></w:r></w:p>
            <w:p><w:r><w:t>第二段落</w:t></w:r></w:p>
          </w:body>
        </w:document>`,
    });

    const text = await extractDocumentText('docx', bytes, deps);
    expect(text).toContain('拾藏文档正文');
    expect(text).toContain('第二段落');
    expect(text).toMatch(/拾藏文档正文\n\n第二段落/);
  });

  it('extracts text from pptx slides', async () => {
    const bytes = await zipFromFiles({
      '[Content_Types].xml': '<?xml version="1.0"?><Types></Types>',
      'ppt/slides/slide1.xml': `<?xml version="1.0"?>
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>幻灯片标题</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
        </p:sld>`,
    });

    await expect(extractDocumentText('pptx', bytes, deps)).resolves.toContain('【幻灯片 1】');
    await expect(extractDocumentText('pptx', bytes, deps)).resolves.toContain('幻灯片标题');
  });

  it('extracts shared strings and cell values from xlsx', async () => {
    const bytes = await zipFromFiles({
      '[Content_Types].xml': '<?xml version="1.0"?><Types></Types>',
      'xl/sharedStrings.xml': `<?xml version="1.0"?>
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
          <si><t>产品</t></si><si><t>拾藏</t></si>
        </sst>`,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>
            <row><c><v>42</v></c></row>
          </sheetData>
        </worksheet>`,
    });

    const text = await extractDocumentText('xlsx', bytes, deps);
    expect(text).toContain('【工作表 1】');
    expect(text).toContain('产品');
    expect(text).toContain('拾藏');
    expect(text).toContain('42');
  });

  it('extracts text from a simple PDF', async () => {
    const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 24 Tf 50 80 Td (Hello Refind PDF) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000373 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;
    const bytes = new TextEncoder().encode(pdf);
    await expect(extractDocumentText('pdf', bytes, deps)).resolves.toMatch(/Hello Refind PDF/i);
  });

  it('rejects legacy doc with a clear message', async () => {
    await expect(extractDocumentText('doc', new Uint8Array([1, 2, 3]), deps))
      .rejects.toThrow(/docx/i);
  });
});
