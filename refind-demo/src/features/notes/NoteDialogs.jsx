import { MoreHorizontal, Trash2, X } from 'lucide-react';
import { useState } from 'react';

function DialogShell({ label, children, onClose }) {
  return <div className="card-dialog-layer" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose?.();
  }}><section className="note-dialog" role="dialog" aria-modal="true" aria-label={label}>{children}</section></div>;
}

export function KnowledgeBaseSyncDialog({ note, bases, onConfirm, onClose }) {
  const [selectedIds, setSelectedIds] = useState(note.syncedBaseIds || []);
  const toggleBase = (id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  return <DialogShell label="添加至知识库" onClose={onClose}>
    <header><div><span className="eyebrow">知识库同步</span><h2>添加至知识库</h2></div><button type="button" aria-label="关闭同步" onClick={onClose}><X size={17} /></button></header>
    <p>笔记同步将在 Phase 3 开放；当前不会创建知识库资料或建立双向同步。</p>
    <div className="note-dialog__check-list">{bases.map((base) => <label key={base.id}><input type="checkbox" aria-label={base.name} checked={selectedIds.includes(base.id)} onChange={() => toggleBase(base.id)} />{base.name}</label>)}</div>
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="quiet-action" disabled={!selectedIds.length} onClick={() => onConfirm?.(selectedIds)}>确认</button></footer>
  </DialogShell>;
}

export function DeleteNoteDialog({ note, onConfirm, onClose }) {
  return <DialogShell label="删除笔记" onClose={onClose}>
    <header><h2>删除这篇笔记？</h2><button type="button" aria-label="关闭删除笔记" onClick={onClose}><X size={17} /></button></header>
    <p>删除后无法恢复，不会删除灵感卡片。</p>
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="note-dialog__danger" onClick={onConfirm}>删除笔记</button></footer>
  </DialogShell>;
}

export function NotebookManagerDialog({ notebooks, notes, onCreate, onRename, onRequestDelete, onClose }) {
  const [name, setName] = useState('');
  return <DialogShell label="管理笔记本" onClose={onClose}>
    <header><div><span className="eyebrow">笔记归档</span><h2>管理笔记本</h2></div><button type="button" aria-label="关闭笔记本管理" onClick={onClose}><X size={17} /></button></header>
    <form className="notebook-create" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; onCreate?.(name.trim()); setName(''); }}><input aria-label="新笔记本名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="新笔记本名称" /><button type="submit">新建</button></form>
    <div className="notebook-manager-list">{notebooks.map((notebook) => <div key={notebook.id}><input aria-label={`重命名笔记本：${notebook.name}`} defaultValue={notebook.name} onBlur={(event) => onRename?.(notebook.id, event.target.value.trim())} /><span>{notes.filter((note) => note.notebookId === notebook.id).length} 篇</span><button type="button" aria-label={`删除笔记本：${notebook.name}`} onClick={() => onRequestDelete?.(notebook)}>删除</button></div>)}</div>
  </DialogShell>;
}

export function DeleteNotebookDialog({ notebook, noteCount, onUnfile, onDeleteNotes, onClose }) {
  return <DialogShell label="删除笔记本" onClose={onClose}>
    <header><h2>删除「{notebook.name}」？</h2><button type="button" aria-label="关闭删除笔记本" onClick={onClose}><X size={17} /></button></header>
    <p>该笔记本内有 {noteCount} 篇笔记。请选择删除方式。</p>
    <footer className="note-dialog__stacked-actions"><button type="button" onClick={onUnfile}>仅删除笔记本</button><button type="button" className="note-dialog__danger" onClick={onDeleteNotes}>连同笔记删除</button><button type="button" onClick={onClose}>取消</button></footer>
  </DialogShell>;
}

export function CardDetailDialog({ card, onAddToNote, onDelete, onClose }) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (!card) return null;

  return <div className="card-dialog-layer" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose?.();
  }}>
    <section className="card-detail-dialog" role="dialog" aria-modal="true" aria-label="灵感卡片详情">
      <header>
        <span>{card.sourceLabel}</span>
        <button type="button" aria-label="关闭卡片详情" onClick={onClose}><X size={17} /></button>
      </header>
      <p className="card-detail-dialog__question">{card.questionSnapshot}</p>
      <p className="card-detail-dialog__content">{card.contentSnapshot}</p>
      {card.citation?.label && <span className="card-detail-dialog__citation">来源：{card.citation.label}</span>}
      <footer>
        <button type="button" className="quiet-action" onClick={() => onAddToNote?.(card)}>加入笔记</button>
        <div className="card-detail-dialog__more">
          <button type="button" aria-label="更多卡片操作" onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={18} /></button>
          {moreOpen && <div role="menu" className="card-detail-dialog__menu">
            <button type="button" role="menuitem" onClick={() => onDelete?.(card)}><Trash2 size={15} />删除卡片</button>
          </div>}
        </div>
      </footer>
    </section>
  </div>;
}
