import { ExternalLink, FileText, Link2, Play } from 'lucide-react';
import {
  getPreviewCaption,
  getPreviewOriginLabel,
  getPreviewSummary,
  getPreviewTags,
  getPreviewTypeLabel,
  getVideoPlayback,
  isVideoMaterial,
  splitReadableParagraphs,
} from './materialPreview.js';

function ParagraphBlock({ text, className = 'material-preview-paragraphs' }) {
  const paragraphs = splitReadableParagraphs(text);
  if (!paragraphs.length) return null;
  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function VideoPlayer({ material }) {
  const playback = getVideoPlayback(material);
  if (!playback) return null;

  if (playback.mode === 'html') {
    return (
      <div
        className="material-preview-player"
        dangerouslySetInnerHTML={{ __html: playback.html }}
      />
    );
  }

  if (playback.mode === 'iframe' && playback.src) {
    return (
      <div className="material-preview-player">
        <iframe
          title={`${material.title || '视频'}播放器`}
          src={playback.src}
          allow="fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <div className="material-preview-player is-fallback">
      <div className="material-preview-player-fallback">
        <Play size={22} strokeWidth={1.7} />
        <p>当前无法内嵌播放，请在原站观看。</p>
        {playback.url ? (
          <a href={playback.url} target="_blank" rel="noreferrer">
            打开视频 <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function MaterialPreviewPage({ material, loading = false, error = '' }) {
  if (loading && !material) {
    return (
      <main className="material-preview-page material-preview-empty" aria-busy="true">
        <p>正在加载资料…</p>
      </main>
    );
  }

  if (!material) {
    return (
      <main className="material-preview-page material-preview-empty">
        <p>{error || '未找到这份资料。请回到知识库后重新打开。'}</p>
      </main>
    );
  }

  const isLink = material.kind === 'link' && material.url;
  const isVideo = isVideoMaterial(material);
  const title = material.title || material.fileName || '未命名资料';
  const originLabel = getPreviewOriginLabel(material);
  const typeLabel = getPreviewTypeLabel(material);
  const tags = getPreviewTags(material);
  const statusLabel = material.statusLabel;

  const summary = getPreviewSummary(material);
  const caption = getPreviewCaption(material);
  const subtitles = (material.subtitles || '').trim();
  const articleBody = isVideo ? '' : (material.body || '').trim();

  const bodyFallback = material.status === 'failed'
    ? (material.lastParseError || '解析失败，暂无正文。可重试解析或打开原链接。')
    : material.status === 'link_only'
      ? '暂无法解析正文，已保留为仅链接资料。可打开原链接查看。'
      : material.status === 'processing'
        ? '资料仍在解析中，请稍后刷新。'
        : '暂无正文。';

  const videoCaptionFallback = '暂未获取到视频简介/文案。可先播放，或打开原站查看。';
  const showArticleBody = !isVideo;
  const readableBody = articleBody || bodyFallback;

  return (
    <main className="material-preview-page">
      <header className="material-preview-header">
        <div className="material-preview-kicker">
          {isLink ? <Link2 size={15} /> : <FileText size={15} />}
          <span>{isVideo ? '视频资料' : isLink ? '网页资料' : '本地文件'}</span>
          {statusLabel ? <span className={`material-preview-status is-${material.status}`}>{statusLabel}</span> : null}
        </div>
        <h1>{title}</h1>
        <dl className="material-preview-facts">
          <div>
            <dt>来源</dt>
            <dd>{originLabel}</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>{typeLabel}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{material.time || '—'}</dd>
          </div>
          {tags.length > 0 ? (
            <div className="material-preview-facts-tags">
              <dt>标签</dt>
              <dd>
                <ul className="material-preview-tags">
                  {tags.map((tag) => (
                    <li key={tag}>#{tag}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
        {isLink ? (
          <a className="material-original-link" href={material.url} target="_blank" rel="noreferrer">
            在原站打开 <ExternalLink size={14} />
          </a>
        ) : null}
      </header>

      <section className="material-preview-summary" aria-labelledby="preview-summary-title">
        <p id="preview-summary-title">AI 摘要</p>
        <div className="material-preview-summary-body">{summary}</div>
      </section>

      {isVideo ? (
        <section className="material-preview-video" aria-label="视频内容">
          <VideoPlayer material={material} />
          {caption ? (
            <section className="material-preview-section" aria-labelledby="preview-caption-title">
              <h2 id="preview-caption-title">文案 / 简介</h2>
              <ParagraphBlock text={caption} />
            </section>
          ) : (
            <p className="material-preview-muted">{videoCaptionFallback}</p>
          )}
          {subtitles ? (
            <section className="material-preview-section" aria-labelledby="preview-subtitles-title">
              <h2 id="preview-subtitles-title">字幕</h2>
              <ParagraphBlock text={subtitles} />
            </section>
          ) : null}
        </section>
      ) : showArticleBody ? (
        <section className="material-preview-section" aria-labelledby="preview-body-title">
          <h2 id="preview-body-title">原文</h2>
          <article className="material-preview-body" aria-label="资料正文">
            <ParagraphBlock text={readableBody} />
          </article>
        </section>
      ) : null}
    </main>
  );
}
