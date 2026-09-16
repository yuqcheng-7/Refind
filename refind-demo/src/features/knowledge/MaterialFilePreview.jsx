import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import mammoth from 'mammoth';
import ReactMarkdown from 'react-markdown';
import { createMaterialSignedUrl } from '../../lib/api/materials.js';
import { convertOfficeFileToPdfBlobUrl } from '../../lib/api/officeConvert.js';
import { buildReadableBlocks } from './materialPreview.js';

export function getFilePreviewMode(material) {
  const type = material?.inputType || '';
  if (type === 'pdf' && material?.storageObjectKey) return 'pdf';
  if (type === 'image' && material?.storageObjectKey) return 'image';
  if ((type === 'pptx' || type === 'xlsx') && (material?.previewStorageObjectKey || material?.storageObjectKey)) {
    return 'office-pdf';
  }
  if (type === 'docx' && material?.storageObjectKey) return 'docx';
  if (type === 'markdown') return 'markdown';
  if (type === 'txt' || type === 'csv') return 'plaintext';
  if (type === 'pptx' || type === 'xlsx') return 'structured';
  return 'text';
}

export function hasOriginalFile(material) {
  return Boolean(material?.kind === 'file' && material?.storageObjectKey);
}

function ParagraphBlock({ text, className = 'material-preview-paragraphs' }) {
  const blocks = buildReadableBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) => (
        block.type === 'heading' ? (
          <h3 key={`${index}-${block.text.slice(0, 12)}`} className="material-preview-heading">
            {block.text}
          </h3>
        ) : (
          <p key={`${index}-${block.text.slice(0, 12)}`}>{block.text}</p>
        )
      ))}
    </div>
  );
}

function splitStructuredSections(text) {
  const value = String(text || '').trim();
  if (!value) return [];
  const parts = value.split(/\n(?=【(?:幻灯片|工作表)\s*\d+】)/);
  return parts.map((part) => {
    const match = /^【(幻灯片|工作表)\s*(\d+)】\s*([\s\S]*)$/.exec(part.trim());
    if (!match) return { title: '', body: part.trim() };
    return {
      title: `${match[1]} ${match[2]}`,
      body: String(match[3] || '').trim(),
    };
  }).filter((section) => section.body);
}

function useSignedFileUrl(storageObjectKey) {
  const [state, setState] = useState({ url: '', error: '', loading: Boolean(storageObjectKey) });

  useEffect(() => {
    let cancelled = false;
    if (!storageObjectKey) {
      setState({ url: '', error: '', loading: false });
      return undefined;
    }

    setState({ url: '', error: '', loading: true });
    createMaterialSignedUrl(storageObjectKey)
      .then((url) => {
        if (!cancelled) setState({ url, error: '', loading: false });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            url: '',
            error: error?.message || '无法加载原文件',
            loading: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storageObjectKey]);

  return state;
}

function PdfViewer({ storageObjectKey, title, src: directSrc }) {
  const signed = useSignedFileUrl(directSrc ? '' : storageObjectKey);
  const url = directSrc || signed.url;
  const loading = directSrc ? false : signed.loading;
  const error = directSrc ? '' : signed.error;

  if (loading) return <p className="material-preview-muted">正在加载 PDF…</p>;
  if (error) return <p className="material-preview-error" role="alert">{error}</p>;
  if (!url) return null;
  return (
    <div className="material-preview-pdf">
      <iframe title={`${title || 'PDF'} 预览`} src={url} />
    </div>
  );
}

function ImageViewer({ storageObjectKey, title, ocrText }) {
  const { url, error, loading } = useSignedFileUrl(storageObjectKey);
  if (loading) return <p className="material-preview-muted">正在加载图片…</p>;
  if (error) return <p className="material-preview-error" role="alert">{error}</p>;
  if (!url) return null;
  return (
    <div className="material-preview-image">
      <img src={url} alt={title || '资料图片'} />
      {ocrText ? (
        <div className="material-preview-image-text">
          <ParagraphBlock text={ocrText} />
        </div>
      ) : null}
    </div>
  );
}

function StructuredViewer({ text, kind }) {
  const sections = splitStructuredSections(text);
  if (!sections.length) return <ParagraphBlock text={text} />;
  return (
    <div className={`material-preview-structured is-${kind}`}>
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="material-preview-structured-card">
          {section.title ? <h3>{section.title}</h3> : null}
          {kind === 'xlsx' ? (
            <pre>{section.body}</pre>
          ) : (
            <ParagraphBlock text={section.body} />
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * Prefer stored preview PDF (production path).
 * Local client convert only in DEV for developer convenience.
 */
function OfficePdfViewer({ material, fallbackText }) {
  const previewKey = material.previewStorageObjectKey;
  const allowLocalConvert = Boolean(
    import.meta.env.DEV
    && import.meta.env.VITE_PLATFORM_PARSER_URL
    && material.storageObjectKey
    && !previewKey,
  );
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(allowLocalConvert);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    if (previewKey || !allowLocalConvert) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError('');
    setBlobUrl('');
    (async () => {
      try {
        const signed = await createMaterialSignedUrl(material.storageObjectKey);
        const response = await fetch(signed);
        if (!response.ok) throw new Error('原文件下载失败');
        const bytes = new Uint8Array(await response.arrayBuffer());
        objectUrl = await convertOfficeFileToPdfBlobUrl({
          filename: material.fileName || `${material.title || 'document'}.${material.inputType || 'bin'}`,
          bytes,
        });
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlobUrl(objectUrl);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Office 转 PDF 失败');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    previewKey,
    allowLocalConvert,
    material.storageObjectKey,
    material.fileName,
    material.title,
    material.inputType,
  ]);

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  if (previewKey) {
    return <PdfViewer storageObjectKey={previewKey} title={material.title || material.fileName} />;
  }

  if (loading) {
    return <p className="material-preview-muted">正在将 {material.inputType === 'xlsx' ? 'Excel' : 'PPT'} 转为 PDF 预览…</p>;
  }

  if (blobUrl) {
    return <PdfViewer title={material.title || material.fileName} src={blobUrl} />;
  }

  return (
    <>
      <p className="material-preview-muted" role="status">
        {error
          ? `版式预览暂不可用：${error}。`
          : '正式环境的版式预览在解析时由服务端生成。若尚未生成，请点击「重新解析」，或使用「打开原文件」。'}
      </p>
      <StructuredViewer
        text={String(material.body || fallbackText || '').trim()}
        kind={material.inputType === 'xlsx' ? 'xlsx' : 'pptx'}
      />
    </>
  );
}

function DocxViewer({ storageObjectKey }) {
  const { url, error: urlError, loading: urlLoading } = useSignedFileUrl(storageObjectKey);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setHtml('');
      setError('');
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError('');
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('原文件下载失败');
        return response.arrayBuffer();
      })
      .then((buffer) => mammoth.convertToHtml({ arrayBuffer: buffer }))
      .then((result) => {
        if (cancelled) return;
        setHtml(DOMPurify.sanitize(result.value || ''));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Word 预览失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (urlLoading || loading) return <p className="material-preview-muted">正在转换 Word 版式…</p>;
  if (urlError || error) {
    return <p className="material-preview-error" role="alert">{urlError || error}</p>;
  }
  if (!html) return <p className="material-preview-muted">暂无法渲染 Word 版式。</p>;
  return (
    <div
      className="material-preview-docx"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MarkdownViewer({ text }) {
  const value = String(text || '').trim();
  if (!value) return null;
  return (
    <div className="material-preview-markdown">
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}

function PlainTextViewer({ text }) {
  const value = String(text || '');
  if (!value.trim()) return null;
  return <pre className="material-preview-plaintext">{value}</pre>;
}

export function MaterialFilePreview({ material, fallbackText }) {
  const mode = getFilePreviewMode(material);
  const body = String(material?.body || '').trim();
  const readable = body || fallbackText;
  const title = material?.title || material?.fileName || '文件';

  if (mode === 'pdf') {
    return <PdfViewer storageObjectKey={material.storageObjectKey} title={title} />;
  }

  if (mode === 'image') {
    return (
      <ImageViewer
        storageObjectKey={material.storageObjectKey}
        title={title}
        ocrText={readable}
      />
    );
  }

  if (mode === 'office-pdf') {
    return <OfficePdfViewer material={material} fallbackText={fallbackText} />;
  }

  if (mode === 'docx') {
    return <DocxViewer storageObjectKey={material.storageObjectKey} />;
  }

  if (mode === 'markdown') {
    return <MarkdownViewer text={readable} />;
  }

  if (mode === 'plaintext') {
    return <PlainTextViewer text={readable} />;
  }

  if (mode === 'structured') {
    return (
      <StructuredViewer
        text={readable}
        kind={material.inputType === 'xlsx' ? 'xlsx' : 'pptx'}
      />
    );
  }

  return <ParagraphBlock text={readable} />;
}

export async function openMaterialOriginalFile(material) {
  if (!hasOriginalFile(material)) throw new Error('当前资料没有原文件');
  const url = await createMaterialSignedUrl(material.storageObjectKey);
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}
