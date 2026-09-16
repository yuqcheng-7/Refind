import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Link2, Play, RefreshCw } from 'lucide-react';
import { createMaterialSignedUrl } from '../../lib/api/materials.js';
import {
  getPreviewCaption,
  getPreviewOriginLabel,
  getPreviewSummary,
  getPreviewTags,
  getPreviewTypeLabel,
  getVideoPlayback,
  isVideoMaterial,
} from './materialPreview.js';
import {
  hasOriginalFile,
  MaterialFilePreview,
  openMaterialOriginalFile,
} from './MaterialFilePreview.jsx';
import { buildReadableBlocks } from './materialPreview.js';

function StoragePreviewImage({ storageKey }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc('');
    setFailed(false);
    createMaterialSignedUrl(storageKey)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  if (failed) {
    return <p className="material-preview-muted">图片暂时无法加载</p>;
  }
  if (!src) {
    return <p className="material-preview-muted">图片加载中…</p>;
  }
  return (
    <figure className="material-preview-inline-image">
      <img src={src} alt="" loading="lazy" />
    </figure>
  );
}

function ParagraphBlock({ text, className = 'material-preview-paragraphs' }) {
  const blocks = buildReadableBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === 'image') {
          return (
            <StoragePreviewImage
              key={`${index}-${block.storageKey}`}
              storageKey={block.storageKey}
            />
          );
        }
        if (block.type === 'heading') {
          return (
            <h3 key={`${index}-${block.text.slice(0, 12)}`} className="material-preview-heading">
              {block.text}
            </h3>
          );
        }
        return <p key={`${index}-${block.text.slice(0, 12)}`}>{block.text}</p>;
      })}
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

function OpenOriginalFileButton({ material }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!hasOriginalFile(material)) return null;

  return (
    <>
      <button
        type="button"
        className="material-preview-action"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await openMaterialOriginalFile(material);
          } catch (err) {
            setError(err?.message || '无法打开原文件');
          } finally {
            setBusy(false);
          }
        }}
      >
        <ExternalLink size={14} /> {busy ? '打开中…' : '打开原文件'}
      </button>
      {error ? <span className="material-preview-tool-error">{error}</span> : null}
    </>
  );
}

export function MaterialPreviewPage({
  material,
  loading = false,
  error = '',
  onReparse,
  reparsing = false,
}) {
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
  const isFile = material.kind === 'file';
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
        <div className="material-preview-actions">
          {typeof onReparse === 'function' ? (
            <button
              type="button"
              className="material-preview-action"
              onClick={onReparse}
              disabled={reparsing}
            >
              <RefreshCw size={14} /> {reparsing ? '解析中…' : '重新解析'}
            </button>
          ) : null}
          {isFile ? <OpenOriginalFileButton material={material} /> : null}
          {isLink ? (
            <a className="material-preview-action" href={material.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> 回到原文
            </a>
          ) : null}
        </div>

        <dl className="material-preview-facts is-inline">
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
          <div className="material-preview-facts-tags">
            <dt>标签</dt>
            <dd>
              {tags.length > 0 ? (
                <ul className="material-preview-tags">
                  {tags.map((tag) => (
                    <li key={tag}>#{tag}</li>
                  ))}
                </ul>
              ) : '—'}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className="material-preview-error" role="alert">{error}</p>
        ) : null}
      </header>

      <section className="material-preview-summary" aria-labelledby="preview-summary-title">
        <p id="preview-summary-title">摘要</p>
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
            {isFile ? (
              <MaterialFilePreview material={material} fallbackText={bodyFallback} />
            ) : (
              <ParagraphBlock text={readableBody} />
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}
