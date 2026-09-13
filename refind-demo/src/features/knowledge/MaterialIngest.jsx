import { useEffect, useRef, useState } from 'react';
import { FileUp, Link2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useDismissable } from '../../hooks/useDismissable.js';

const isFailureName = (name) => name.toLowerCase().includes('.fail');

export function MaterialIngest({ base, onMaterialReady, transitionMs = 900 }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [queue, setQueue] = useState([]);
  const inputRef = useRef(null);
  const ingestAnchorRef = useRef(null);
  const timersRef = useRef(new Map());
  const onMaterialReadyRef = useRef(onMaterialReady);
  onMaterialReadyRef.current = onMaterialReady;

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
      onMaterialReadyRef.current({
        id: `material-${item.id}`,
        kind: item.kind,
        url: item.url,
        fileName: item.title,
        title: item.title,
        source: item.kind === 'link' ? '链接' : '本地文件',
        tag: '待整理',
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

  const enqueue = (items) => {
    const additions = items.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      title: item.title,
      kind: item.kind,
      url: item.url,
      shouldFail: isFailureName(item.title),
      failures: 0,
      progress: 52,
      status: 'parsing',
      base,
    }));
    setQueue((items) => [...items, ...additions]);
    additions.forEach(schedule);
  };

  const retry = (id) => {
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    const next = { ...item, status: 'parsing', progress: 52 };
    setQueue((items) => items.map((entry) => entry.id === id ? next : entry));
    schedule(next);
  };
  const remove = (id) => {
    window.clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setQueue((items) => items.filter((item) => item.id !== id));
  };

  const submitLink = (event) => {
    event.preventDefault();
    if (!link.trim()) return;
    enqueue([{ title: link.trim(), kind: 'link', url: link.trim() }]);
    setLink('');
    setLinkOpen(false);
  };

  return <div className="material-ingest">
    <div className="material-ingest-anchor" ref={ingestAnchorRef}>
      <button className="add-link-button" type="button" aria-label="添加资料" onClick={() => { setMenuOpen((open) => !open); setLinkOpen(false); }}><Plus size={14} strokeWidth={1.6} /><span>添加资料</span></button>
      {menuOpen && <div className="material-ingest-menu" role="menu">
        <button type="button" role="menuitem" onClick={() => { setLinkOpen(true); setMenuOpen(false); }}><Link2 size={15} />粘贴链接</button>
        <button type="button" role="menuitem" onClick={() => { inputRef.current?.click(); setMenuOpen(false); }}><FileUp size={15} />上传文件</button>
      </div>}
      <input ref={inputRef} className="sr-only" aria-label="选择资料文件" type="file" multiple onChange={(event) => { enqueue([...event.target.files].map((file) => ({ title: file.name, kind: 'file' }))); event.target.value = ''; }} />
      {linkOpen && <form className="material-link-popover" onSubmit={submitLink}><label>粘贴链接<input value={link} autoFocus placeholder="https://" onChange={(event) => setLink(event.target.value)} /></label><button type="button" aria-label="关闭链接输入" onClick={() => setLinkOpen(false)}><X size={14} /></button><button type="submit">加入队列</button></form>}
    </div>
    {queue.length > 0 && <div className="material-queue" aria-label="资料解析队列">
      {queue.map((item) => <article className={`material-ingest-card is-${item.status}`} key={item.id}>
        <div><strong>{item.title}</strong><small>{item.base}</small></div>
        {item.status === 'parsing' && <><span>解析中 {item.progress}%</span><div className="material-progress"><i style={{ width: `${item.progress}%` }} /></div><div className="material-progress-popover">正在解析资料 · {item.progress}%</div></>}
        {item.status === 'failed' && <><span>解析失败</span><div className="material-ingest-actions"><button type="button" aria-label={`重试：${item.title}`} onClick={() => retry(item.id)}><RotateCcw size={14} />重试</button><button type="button" aria-label={`删除：${item.title}`} onClick={() => remove(item.id)}><Trash2 size={14} />删除</button></div></>}
        {item.status === 'downgraded' && <><span>{item.kind === 'link' ? '仅链接' : '仅附件'}</span><p>连续 3 次解析失败，已保留为{item.kind === 'link' ? '仅链接' : '仅附件'}资料。</p></>}
        {item.status === 'ready' && <span>已加入知识库</span>}
      </article>)}
    </div>}
  </div>;
}
