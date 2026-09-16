import { useEffect, useRef, useState } from 'react';
import { FileUp, Link2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useDismissable } from '../../hooks/useDismissable.js';
import { splitPasteLink } from '../../lib/extractUrlFromPaste.js';
import { formatMaterialTitle, inferPlatformFromUrl } from '../../lib/api/materials.js';
import { MATERIAL_UPLOAD_ACCEPT, partitionMaterialUploadFiles } from '../../lib/api/ingest.js';

const isFailureName = (name) => name.toLowerCase().includes('.fail');

function shortTitle(title) {
  const value = String(title || '').trim();
  if (value.length <= 42) return value;
  return `${value.slice(0, 40)}…`;
}

function queueItemLabel(item) {
  if (item.kind === 'link') {
    return formatMaterialTitle({
      title: item.title,
      source_url: item.url,
      platform_code: inferPlatformFromUrl(item.url),
      input_type: 'link',
    });
  }
  return item.title;
}

export function MaterialIngest({
  base,
  onCreateStub,
  onMaterialReady,
  onDelete,
  onOpenPlatformSettings,
  transitionMs = 900,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [queue, setQueue] = useState([]);
  const inputRef = useRef(null);
  const ingestAnchorRef = useRef(null);
  const timersRef = useRef(new Map());
  const onCreateStubRef = useRef(onCreateStub);
  const onMaterialReadyRef = useRef(onMaterialReady);
  const onDeleteRef = useRef(onDelete);
  const onOpenPlatformSettingsRef = useRef(onOpenPlatformSettings);
  onCreateStubRef.current = onCreateStub;
  onMaterialReadyRef.current = onMaterialReady;
  onDeleteRef.current = onDelete;
  onOpenPlatformSettingsRef.current = onOpenPlatformSettings;

  useEffect(() => {
    return () => timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);
  useDismissable({ open: menuOpen || linkOpen, onClose: () => { setMenuOpen(false); setLinkOpen(false); }, rootRef: ingestAnchorRef });

  const complete = (item) => {
    timersRef.current.delete(item.id);
    const failures = item.shouldFail ? item.failures + 1 : item.failures;
    const status = item.shouldFail ? (failures >= 3 ? 'downgraded' : 'failed') : 'ready';
    setQueue((items) => items.map((entry) => {
      if (entry.id !== item.id || entry.status !== 'parsing') return entry;
      return { ...entry, failures, status, progress: 100 };
    }));
    if (status === 'ready') {
      onMaterialReadyRef.current?.({
        id: `material-${item.id}`,
        kind: item.kind,
        url: item.url,
        fileName: item.title,
        title: item.title,
        source: item.kind === 'link' ? '链接' : '本地文件',
        tag: '',
        time: '刚刚',
        base: item.base,
        summary: `已完成「${item.title}」的解析，可在预览中查看摘要和正文。`,
        body: `这是「${item.title}」的演示解析正文。实际产品会在此呈现资料解析后的完整可读内容。`,
      });
      setQueue((items) => items.filter((entry) => entry.id !== item.id));
    }
  };
  const schedule = (item) => {
    window.clearTimeout(timersRef.current.get(item.id));
    timersRef.current.set(item.id, window.setTimeout(() => complete(item), transitionMs));
  };

  const createStub = (item) => {
    Promise.resolve(onCreateStubRef.current(item))
      .then((material) => {
        if (material?.status === 'failed') {
          setQueue((items) => items.map((entry) => (
            entry.id === item.id
              ? {
                ...entry,
                materialId: material.id,
                status: 'failed',
                errorMessage: material.lastParseError || '解析失败，可重试或删除。',
              }
              : entry
          )));
          return;
        }
        if (material?.status === 'link_only') {
          setQueue((items) => items.map((entry) => (
            entry.id === item.id
              ? {
                ...entry,
                materialId: material.id,
                status: 'downgraded',
                errorMessage: material.lastParseError || '未能完整解析，已保留为仅链接。',
              }
              : entry
          )));
          return;
        }
        setQueue((items) => items.filter((entry) => entry.id !== item.id));
      })
      .catch((error) => {
        setQueue((items) => items.map((entry) => (
          entry.id === item.id
            ? {
              ...entry,
              materialId: error?.materialId || entry.materialId,
              status: 'failed',
              errorMessage: error?.message || '添加失败，请稍后重试。',
            }
            : entry
        )));
      });
  };

  const enqueue = (items) => {
    const usingApi = Boolean(onCreateStubRef.current);
    const additions = items.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      title: item.title,
      kind: item.kind,
      url: item.url,
      file: item.file,
      shouldFail: isFailureName(item.title) || isFailureName(item.url || ''),
      failures: 0,
      progress: 52,
      status: usingApi ? 'processing' : 'parsing',
      base,
    }));
    setQueue((current) => [...current, ...additions]);
    additions.forEach((item) => {
      if (usingApi) createStub(item);
      else schedule(item);
    });
  };

  const retry = (id) => {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    const next = { ...item, status: onCreateStubRef.current ? 'processing' : 'parsing', progress: 52, errorMessage: '' };
    setQueue((items) => items.map((entry) => entry.id === id ? next : entry));
    if (onCreateStubRef.current) createStub(next);
    else schedule(next);
  };
  const remove = async (id) => {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    setQueue((items) => items.filter((entry) => entry.id !== id));
    try {
      if (item.materialId && onDeleteRef.current) await onDeleteRef.current(item);
      window.clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    } catch {
      setQueue((items) => [...items, { ...item, deleteError: true, status: 'failed' }]);
    }
  };

  const submitLink = (event) => {
    event.preventDefault();
    const { url, title } = splitPasteLink(link);
    if (!url) return;
    enqueue([{ title, kind: 'link', url }]);
    setLink('');
    setLinkOpen(false);
  };

  // Real ingest already surfaces status on the list row; only keep actionable toasts here.
  const toastItems = queue.filter((item) => {
    if (!onCreateStub) return true;
    return item.status === 'failed' || item.status === 'downgraded';
  });

  return <div className="material-ingest">
    <div className="material-ingest-anchor" ref={ingestAnchorRef}>
      <button className="add-link-button" type="button" aria-label="添加资料" onClick={() => { setMenuOpen((open) => !open); setLinkOpen(false); }}><Plus size={14} strokeWidth={1.6} /><span>添加资料</span></button>
      {menuOpen && <div className="material-ingest-menu" role="menu">
        <button type="button" role="menuitem" onClick={() => { setLinkOpen(true); setMenuOpen(false); }}><Link2 size={15} />粘贴链接</button>
        <button type="button" role="menuitem" onClick={() => { inputRef.current?.click(); setMenuOpen(false); }}><FileUp size={15} />上传文件</button>
        <p className="material-ingest-hint">支持图片、PDF、Word、PPT、表格与文本</p>
      </div>}
      <input
        ref={inputRef}
        className="sr-only"
        aria-label="选择资料文件"
        type="file"
        multiple
        accept={MATERIAL_UPLOAD_ACCEPT}
        onChange={(event) => {
          const { allowed, rejected } = partitionMaterialUploadFiles(event.target.files);
          if (rejected.length) {
            const names = rejected.map((file) => file.name).slice(0, 3).join('、');
            const more = rejected.length > 3 ? ` 等 ${rejected.length} 个` : '';
            window.alert(`不支持上传 HTML 或不支持的格式：${names}${more}`);
          }
          if (allowed.length) {
            enqueue(allowed.map((file) => ({ title: file.name, kind: 'file', file })));
          }
          event.target.value = '';
        }}
      />
      {linkOpen && <form className="material-link-popover" onSubmit={submitLink}><label>粘贴链接<input value={link} autoFocus placeholder="支持整段分享文案，自动提取链接" onChange={(event) => setLink(event.target.value)} /></label><button type="button" aria-label="关闭链接输入" onClick={() => setLinkOpen(false)}><X size={14} /></button><button type="submit">加入队列</button></form>}
    </div>
    {toastItems.length > 0 && <div className="material-queue" aria-label="资料解析提醒">
      {toastItems.map((item) => <article className={`material-ingest-card is-${item.status}`} key={item.id}>
        <header>
          <div>
            <strong title={queueItemLabel(item)}>{shortTitle(queueItemLabel(item))}</strong>
            {item.base && <small>{item.base}</small>}
          </div>
          <button type="button" className="material-ingest-dismiss" aria-label="关闭提醒" onClick={() => remove(item.id)}><X size={13} /></button>
        </header>
        {item.status === 'parsing' && <><span>解析中 {item.progress}%</span><div className="material-progress"><i style={{ width: `${item.progress}%` }} /></div></>}
        {item.status === 'processing' && <span>处理中</span>}
        {item.status === 'failed' && <>
          <span>{item.deleteError ? '删除失败' : item.materialId || !onCreateStub ? '解析失败' : '添加失败'}</span>
          {item.errorMessage && <p>{item.errorMessage}</p>}
          <div className="material-ingest-actions">
            <button type="button" aria-label={`重试：${queueItemLabel(item)}`} onClick={() => retry(item.id)}><RotateCcw size={13} />重试</button>
            <button type="button" aria-label={`删除：${queueItemLabel(item)}`} onClick={() => remove(item.id)}><Trash2 size={13} />删除</button>
          </div>
        </>}
        {item.status === 'downgraded' && <>
          <span>{item.kind === 'link' ? '仅链接' : '仅附件'}</span>
          <p>{item.errorMessage || `连续 3 次解析失败，已保留为${item.kind === 'link' ? '仅链接' : '仅附件'}。`}</p>
          <div className="material-ingest-actions">
            {item.kind === 'link' && onOpenPlatformSettingsRef.current ? (
              <button
                type="button"
                onClick={() => onOpenPlatformSettingsRef.current(inferPlatformFromUrl(item.url))}
              >
                <Link2 size={13} />
                去连接平台
              </button>
            ) : null}
            <button type="button" aria-label={`删除：${queueItemLabel(item)}`} onClick={() => remove(item.id)}><Trash2 size={13} />删除</button>
          </div>
        </>}
        {item.status === 'ready' && <span>已加入知识库</span>}
      </article>)}
    </div>}
  </div>;
}
