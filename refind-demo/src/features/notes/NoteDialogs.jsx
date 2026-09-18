import { MoreHorizontal, NotebookPen, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDismissable } from '../../hooks/useDismissable.js';
import { AnswerContent } from '../chat/AnswerContent.jsx';
import {
  citationsForCardDisplay,
  resolveCardCitedMaterials,
  resolveCardOriginLabel,
} from '../../lib/api/notes.js';

function DialogShell({ label, children, onClose }) {
  return <div className="card-dialog-layer" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose?.();
  }}><section className="note-dialog" role="dialog" aria-modal="true" aria-label={label}>{children}</section></div>;
}

export function RetryOutlineConfirmDialog({ onClose, onGenerate }) {
  return (
    <DialogShell label="重新生成正文" onClose={onClose}>
      <header><h2>结构已更新，是否用新结构重新生成正文？</h2><button type="button" aria-label="关闭重新生成正文" onClick={onClose}><X size={17} /></button></header>
      <footer>
        <button type="button" onClick={onClose}>仅更新结构</button>
        <button type="button" className="quiet-action" onClick={() => { onClose?.(); onGenerate?.(); }}>更新并重新生成</button>
      </footer>
    </DialogShell>
  );
}

export function KnowledgeBaseSyncDialog({ note, bases, onConfirm, onClose }) {
  const [selectedIds, setSelectedIds] = useState(note.syncedBaseIds || []);
  const toggleBase = (id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  return <DialogShell label="添加至知识库" onClose={onClose}>
    <header><div><span className="eyebrow">知识库同步</span><h2>添加至知识库</h2></div><button type="button" aria-label="关闭同步" onClick={onClose}><X size={17} /></button></header>
    <p>将笔记同步为各知识库中的资料。之后编辑笔记会更新已同步资料；删除资料或知识库仅解除关联。</p>
    <div className="note-dialog__check-list">{bases.map((base) => <label key={base.id}><input type="checkbox" aria-label={base.name} checked={selectedIds.includes(base.id)} onChange={() => toggleBase(base.id)} />{base.name}</label>)}</div>
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="quiet-action" disabled={!selectedIds.length} onClick={() => onConfirm?.(selectedIds)}>确认</button></footer>
  </DialogShell>;
}

export function KnowledgeBaseSyncedViewDialog({ note, bases, onClose }) {
  const synced = (bases || []).filter((base) => (note?.syncedBaseIds || []).includes(base.id));
  return (
    <DialogShell label="已同步知识库" onClose={onClose}>
      <header>
        <div>
          <span className="eyebrow">知识库同步</span>
          <h2>已同步知识库</h2>
        </div>
        <button type="button" aria-label="关闭已同步知识库" onClick={onClose}><X size={17} /></button>
      </header>
      {synced.length ? (
        <ul className="note-dialog__synced-list">
          {synced.map((base) => (
            <li key={base.id}>{base.name}</li>
          ))}
        </ul>
      ) : (
        <p>这篇笔记尚未同步至知识库。</p>
      )}
      <footer>
        <button type="button" className="quiet-action" onClick={onClose}>知道了</button>
      </footer>
    </DialogShell>
  );
}

export function DeleteNoteDialog({ note, onConfirm, onClose }) {
  return <DialogShell label="删除笔记" onClose={onClose}>
    <header><h2>删除这篇笔记？</h2><button type="button" aria-label="关闭删除笔记" onClick={onClose}><X size={17} /></button></header>
    <p>删除后无法恢复，不会删除灵感卡片。</p>
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="note-dialog__danger" onClick={onConfirm}>删除笔记</button></footer>
  </DialogShell>;
}

function notesInNotebook(notes, targetId) {
  return notes.filter((note) => (targetId == null ? !note.notebookId : note.notebookId === targetId));
}

function notesImportableToNotebook(notes, targetId) {
  if (targetId == null) return [];
  return notes.filter((note) => note.notebookId !== targetId);
}

export function NotebookManagerDialog({ notebooks, notes, onCreate, onRename, onRequestDelete, onImportNotes, onClose }) {
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('uncategorized');
  const [importOpen, setImportOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  const selectedNotebook = selectedId === 'uncategorized'
    ? { id: null, name: '未分类', isSystem: true }
    : notebooks.find((item) => item.id === selectedId) || null;

  const selectedNotes = selectedNotebook
    ? notesInNotebook(notes, selectedNotebook.id)
    : [];
  const canImport = selectedNotebook && !selectedNotebook.isSystem
    && notesImportableToNotebook(notes, selectedNotebook.id).length > 0;

  const selectNotebook = (id, notebookName = '') => {
    setSelectedId(id);
    setDraftName(id === 'uncategorized' ? '未分类' : notebookName);
    setImportOpen(false);
  };

  return (
    <>
      <DialogShell label="管理笔记本" onClose={onClose}>
        <header>
          <div>
            <h2>管理笔记本</h2>
          </div>
          <button type="button" aria-label="关闭笔记本管理" onClick={onClose}><X size={17} /></button>
        </header>

        <form
          className="notebook-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onCreate?.(name.trim());
            setName('');
          }}
        >
          <input
            aria-label="新笔记本名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="新笔记本名称"
          />
          <button type="submit">新建</button>
        </form>

        <div className="notebook-manager">
          <div className="notebook-manager__sidebar" role="listbox" aria-label="笔记本列表">
            <button
              type="button"
              role="option"
              aria-selected={selectedId === 'uncategorized'}
              className={`notebook-manager__item ${selectedId === 'uncategorized' ? 'is-selected' : ''}`}
              onClick={() => selectNotebook('uncategorized')}
            >
              <span>未分类</span>
              <em>{notesInNotebook(notes, null).length}</em>
            </button>
            {notebooks.map((notebook) => (
              <button
                key={notebook.id}
                type="button"
                role="option"
                aria-selected={selectedId === notebook.id}
                className={`notebook-manager__item ${selectedId === notebook.id ? 'is-selected' : ''}`}
                onClick={() => selectNotebook(notebook.id, notebook.name)}
              >
                <span>{notebook.name}</span>
                <em>{notesInNotebook(notes, notebook.id).length}</em>
              </button>
            ))}
          </div>

          <div className="notebook-manager__detail" aria-live="polite">
            {selectedNotebook ? (
              <>
                <div className="notebook-manager__detail-head">
                  {selectedNotebook.isSystem ? (
                    <strong className="notebook-manager__detail-title">未分类</strong>
                  ) : (
                    <input
                      aria-label={`重命名笔记本：${selectedNotebook.name}`}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => {
                        const next = draftName.trim();
                        if (!next || next === selectedNotebook.name) {
                          setDraftName(selectedNotebook.name);
                          return;
                        }
                        onRename?.(selectedNotebook.id, next);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                  )}
                  <div className="notebook-manager__detail-actions">
                    {canImport ? (
                      <button
                        type="button"
                        className="notebook-manager-import"
                        aria-label={`导入笔记至${selectedNotebook.name}`}
                        onClick={() => setImportOpen(true)}
                      >
                        导入
                      </button>
                    ) : null}
                    {!selectedNotebook.isSystem ? (
                      <button
                        type="button"
                        className="notebook-manager-delete"
                        aria-label={`删除笔记本：${selectedNotebook.name}`}
                        onClick={() => onRequestDelete?.(selectedNotebook)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="notebook-manager__notes">
                  {selectedNotes.length ? selectedNotes.map((note) => (
                    <div key={note.id} className="notebook-manager__note">
                      {note.title || '未命名笔记'}
                    </div>
                  )) : (
                    <p className="notebook-manager__empty">这个笔记本里还没有笔记</p>
                  )}
                </div>
              </>
            ) : (
              <p className="notebook-manager__empty">选择左侧笔记本查看内容</p>
            )}
          </div>
        </div>
      </DialogShell>
      {importOpen && selectedNotebook && !selectedNotebook.isSystem && (
        <ImportNotesToNotebookDialog
          notebook={selectedNotebook}
          notes={notes}
          onConfirm={async (noteIds) => {
            await onImportNotes?.(selectedNotebook.id, noteIds);
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}

export function ImportNotesToNotebookDialog({ notebook, notes, onConfirm, onClose }) {
  const targetId = notebook?.id ?? null;
  const candidates = notesImportableToNotebook(notes, targetId);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleNote = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  };

  return (
    <DialogShell label={`导入笔记至${notebook.name}`} onClose={onClose}>
      <header>
        <div>
          <h2>导入到「{notebook.name}」</h2>
        </div>
        <button type="button" aria-label="关闭导入笔记" onClick={onClose}><X size={17} /></button>
      </header>
      <p>从拾藏已有笔记中选择，支持单篇或批量导入。</p>
      <div className="note-dialog__check-list notebook-import-list">
        {candidates.length ? candidates.map((note) => (
          <label key={note.id}>
            <input
              type="checkbox"
              aria-label={`选择笔记：${note.title || '未命名笔记'}`}
              checked={selectedIds.includes(note.id)}
              onChange={() => toggleNote(note.id)}
            />
            <span>{note.title || '未命名笔记'}</span>
          </label>
        )) : (
          <p className="notebook-import-empty">没有可导入的其他笔记。</p>
        )}
      </div>
      <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button
          type="button"
          className="quiet-action"
          disabled={!selectedIds.length || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm?.(selectedIds);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '导入中…' : `导入（${selectedIds.length}）`}
        </button>
      </footer>
    </DialogShell>
  );
}

export function DeleteNotebookDialog({ notebook, noteCount, onUnfile, onDeleteNotes, onClose }) {
  return <DialogShell label="删除笔记本" onClose={onClose}>
    <header><h2>删除「{notebook.name}」？</h2><button type="button" aria-label="关闭删除笔记本" onClick={onClose}><X size={17} /></button></header>
    <p>该笔记本内有 {noteCount} 篇笔记。请选择删除方式。</p>
    <footer className="note-dialog__stacked-actions"><button type="button" onClick={onUnfile}>仅删除笔记本</button><button type="button" className="note-dialog__danger" onClick={onDeleteNotes}>连同笔记删除</button><button type="button" onClick={onClose}>取消</button></footer>
  </DialogShell>;
}

export function PickNoteDialog({ notes = [], notebooks = [], onConfirm, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);

  const notebookName = (notebookId) => {
    if (!notebookId) return '未分类';
    return notebooks.find((item) => item.id === notebookId)?.name || '未分类';
  };

  return (
    <DialogShell label="加入已有笔记" onClose={onClose}>
      <header>
        <div>
          <h2>加入已有笔记</h2>
        </div>
        <button type="button" aria-label="关闭加入已有笔记" onClick={onClose}><X size={17} /></button>
      </header>
      <p>选择一篇笔记，将灵感卡片加入其素材面板。</p>
      <div className="note-dialog__check-list notebook-import-list" role="radiogroup" aria-label="选择笔记">
        {notes.length ? notes.map((note) => (
          <label key={note.id}>
            <input
              type="radio"
              name="pick-note"
              aria-label={`${note.title || '未命名笔记'} · ${notebookName(note.notebookId)}`}
              checked={selectedId === note.id}
              onChange={() => setSelectedId(note.id)}
            />
            <span>
              <strong>{note.title || '未命名笔记'}</strong>
              <small>{notebookName(note.notebookId)}</small>
            </span>
          </label>
        )) : (
          <p className="notebook-import-empty">暂无笔记可加入。</p>
        )}
      </div>
      <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button
          type="button"
          className="quiet-action"
          disabled={!selectedId || saving}
          onClick={async () => {
            if (!selectedId) return;
            setSaving(true);
            try {
              await onConfirm?.(selectedId);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '加入中…' : '确认'}
        </button>
      </footer>
    </DialogShell>
  );
}

export function AddInspirationCardsDialog({ cards = [], onConfirm, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cards.filter((card) => {
      const haystack = [
        card.contentSnapshot,
        card.questionSnapshot,
        card.sourceLabel,
        card.answerMode === 'rag' ? '知识库回答' : '通用回答',
      ].filter(Boolean).join('\n').toLowerCase();
      return haystack.includes(q);
    })
    : cards;

  const toggle = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  };

  return (
    <DialogShell label="添加灵感卡片" onClose={onClose}>
      <header>
        <div>
          <h2>添加灵感卡片</h2>
        </div>
        <button type="button" aria-label="关闭添加灵感卡片" onClick={onClose}><X size={17} /></button>
      </header>
      <p>勾选要加入当前笔记素材面板的卡片，可一次添加多张。</p>
      <label className="note-dialog__search">
        <span className="sr-only">搜索灵感卡片</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索摘录、来源或原问题"
          aria-label="搜索灵感卡片"
        />
      </label>
      <div className="note-dialog__check-list add-cards-list" role="group" aria-label="可选灵感卡片">
        {filtered.length ? filtered.map((card) => {
          const source = card.sourceLabel || (card.answerMode === 'rag' ? '知识库回答' : '通用回答');
          const preview = String(card.contentSnapshot || '').replace(/\s+/g, ' ').trim();
          return (
            <label key={card.id} className="add-cards-list__item">
              <input
                type="checkbox"
                aria-label={`${source}：${preview.slice(0, 40) || '未命名卡片'}`}
                checked={selectedIds.includes(card.id)}
                onChange={() => toggle(card.id)}
              />
              <span>
                <small>{source}</small>
                <strong>{preview || '（无摘录）'}</strong>
              </span>
            </label>
          );
        }) : (
          <p className="notebook-import-empty">
            {cards.length ? '没有匹配的卡片。' : '没有更多可添加的卡片。'}
          </p>
        )}
      </div>
      <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button
          type="button"
          className="quiet-action"
          disabled={!selectedIds.length || saving}
          onClick={async () => {
            if (!selectedIds.length) return;
            setSaving(true);
            try {
              await onConfirm?.(selectedIds);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '添加中…' : `添加${selectedIds.length ? ` ${selectedIds.length} 张` : ''}`}
        </button>
      </footer>
    </DialogShell>
  );
}

export function CardDetailDialog({
  card,
  knowledgeBases = [],
  notes = [],
  notebooks = [],
  onAddToNote,
  onAttachCardsToNote,
  onDelete,
  onClose,
  onOpenMaterial,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [pickNoteOpen, setPickNoteOpen] = useState(false);
  const moreRef = useRef(null);
  useDismissable({
    open: moreOpen,
    onClose: () => setMoreOpen(false),
    rootRef: moreRef,
  });

  if (!card) return null;

  const originLabel = resolveCardOriginLabel(card, knowledgeBases);
  const citedMaterials = resolveCardCitedMaterials(card);
  const displayCitations = citationsForCardDisplay(card);

  return (
    <>
      <div className="card-dialog-layer" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}>
        <section className="card-detail-dialog" role="dialog" aria-modal="true" aria-label="灵感卡片详情">
          <header>
            <span className="card-detail-dialog__source">{originLabel}</span>
            <button type="button" aria-label="关闭卡片详情" onClick={onClose}><X size={17} /></button>
          </header>
          {card.questionSnapshot ? (
            <h2 className="card-detail-dialog__question">{card.questionSnapshot}</h2>
          ) : null}
          <div className="card-detail-dialog__scroll">
            <div className="card-detail-dialog__body">
              <AnswerContent
                text={card.contentSnapshot}
                citations={displayCitations}
                conversational={card.answerMode !== 'rag'}
                interactive={Boolean(onOpenMaterial)}
                onOpenMaterial={onOpenMaterial}
              />
            </div>
            {citedMaterials.length > 0 && (
              <div className="card-detail-dialog__materials" aria-label="来源资料">
                <span className="card-detail-dialog__materials-label">来源资料</span>
                <ul>
                  {citedMaterials.map((item) => (
                    <li key={`${item.order}-${item.materialId || item.label}`}>
                      <button
                        type="button"
                        className="card-detail-dialog__material"
                        disabled={!item.materialId || !onOpenMaterial}
                        onClick={() => {
                          if (!item.materialId) return;
                          onOpenMaterial?.(item.materialId);
                        }}
                      >
                        {item.order != null ? <em>[{item.order}]</em> : null}
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <footer>
            <div className="card-detail-dialog__more" ref={moreRef}>
              <button
                type="button"
                aria-label="更多卡片操作"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <MoreHorizontal size={18} />
              </button>
              {moreOpen && (
                <div role="menu" className="card-detail-dialog__menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onAddToNote?.(card);
                    }}
                  >
                    <NotebookPen size={15} strokeWidth={1.7} />
                    新建笔记
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      setPickNoteOpen(true);
                    }}
                  >
                    <NotebookPen size={15} strokeWidth={1.7} />
                    加入已有笔记…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      setMoreOpen(false);
                      onDelete?.(card);
                    }}
                  >
                    <Trash2 size={15} />
                    删除卡片
                  </button>
                </div>
              )}
            </div>
          </footer>
        </section>
      </div>
      {pickNoteOpen && (
        <PickNoteDialog
          notes={notes}
          notebooks={notebooks}
          onConfirm={async (noteId) => {
            await onAttachCardsToNote?.(noteId, [card.id], { openNote: true });
            setPickNoteOpen(false);
            onClose?.();
          }}
          onClose={() => setPickNoteOpen(false)}
        />
      )}
    </>
  );
}
