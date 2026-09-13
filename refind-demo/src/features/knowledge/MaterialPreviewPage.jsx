import { ExternalLink, FileText, Link2 } from 'lucide-react';

export function MaterialPreviewPage({ material }) {
  if (!material) {
    return <main className="material-preview-page material-preview-empty">
      <p>未找到这份资料。请回到知识库后重新打开。</p>
    </main>;
  }

  const isLink = material.kind === 'link' && material.url;

  return <main className="material-preview-page">
    <header className="material-preview-header">
      <div className="material-preview-kicker">
        {isLink ? <Link2 size={15} /> : <FileText size={15} />}
        <span>{material.kind === 'link' ? '网页资料' : '本地文件'}</span>
      </div>
      <h1>{material.fileName || material.title}</h1>
      <div className="material-preview-meta">
        <span>{material.source}</span>
        <span>#{material.tag}</span>
        <span>{material.time}</span>
      </div>
      {isLink && <a className="material-original-link" href={material.url} target="_blank" rel="noreferrer">
        在原站打开 <ExternalLink size={14} />
      </a>}
    </header>
    <section className="material-preview-summary" aria-labelledby="preview-summary-title">
      <p id="preview-summary-title">AI 解析摘要</p>
      <strong>{material.summary}</strong>
    </section>
    <article className="material-preview-body" aria-label="已解析正文">
      {material.body}
    </article>
  </main>;
}
