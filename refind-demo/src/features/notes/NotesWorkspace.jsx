import { FolderPlus, MoreVertical, Pencil, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { attachCards, filterNotes } from './noteState.js';
import { NoteEditor } from './NoteEditor.jsx';
import { InspirationCards } from './InspirationCards.jsx';
import { DeleteNotebookDialog, DeleteNoteDialog, KnowledgeBaseSyncDialog, NotebookManagerDialog } from './NoteDialogs.jsx';
import { demoKnowledgeBases } from './demoData.js';
import {
  createNote as createPersistedNote,
  createNotebook as createPersistedNotebook,
  deleteNote as deletePersistedNote,
  deleteNotebook as deletePersistedNotebook,
  renameNotebook as renamePersistedNotebook,
  setNoteMaterials,
  updateNote as updatePersistedNote,
} from '../../lib/api/notes.js';

export function NotesWorkspace({ notes, setNotes, cards, notebooks, bases = demoKnowledgeBases, notice, onCreateOrganizedNote, onDeleteCard }) {
  const [tab, setTab] = useState('notes');
  const [notebookId, setNotebookId] = useState('all');
  const [notebookMenuOpen, setNotebookMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState(notes[0]?.id ?? null);
  const [fullscreenNoteId, setFullscreenNoteId] = useState(null);
  const [managedNotebooks, setManagedNotebooks] = useState(notebooks);
  const [contextNoteId, setContextNoteId] = useState(null);
  const [syncNoteId, setSyncNoteId] = useState(null);
  const [deleteNoteId, setDeleteNoteId] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [deleteNotebook, setDeleteNotebook] = useState(null);

  useEffect(() => setManagedNotebooks(notebooks), [notebooks]);

  const visibleNotes = useMemo(() => filterNotes(notes, query, notebookId), [notes, query, notebookId]);
  const selectedNote = notes.find((note) => note.id === selectedNoteId) || visibleNotes[0] || notes[0];
  const selectedNotebook = managedNotebooks.find((notebook) => notebook.id === notebookId);
  const recentNotes = visibleNotes.slice(0, 2);
  const olderNotes = visibleNotes.slice(2);
  const fullscreenNote = notes.find((note) => note.id === fullscreenNoteId) || (fullscreenNoteId === selectedNote?.id ? selectedNote : null);

  const exitFullscreen = () => {
    setFullscreenNoteId(null);
    setTab('notes');
  };

  const createNote = async () => {
    try {
      const note = await createPersistedNote();
      setNotes((items) => [note, ...items]);
      setSelectedNoteId(note.id);
      setFullscreenNoteId(note.id);
      setTab('notes');
      notice?.('已新建一篇笔记。');
    } catch {
      notice?.('新建笔记失败，请稍后重试。');
    }
  };

  const updateNote = (updatedNote) => setNotes((items) => items.map((note) => note.id === updatedNote.id ? updatedNote : note));
  const persistNote = async (note) => {
    try {
      await updatePersistedNote(note.id, { title: note.title, content: note.content });
    } catch {
      notice?.('笔记保存失败，请稍后重试。');
    }
  };
  const persistMaterials = async (note) => {
    try {
      await setNoteMaterials(note.id, {
        cardIdsOrdered: note.inspirationCardIds,
        thoughtsByCardId: note.materialThoughts,
      });
    } catch (error) {
      notice?.('素材保存失败，请稍后重试。');
      throw error;
    }
  };
  const contextNote = notes.find((note) => note.id === contextNoteId);
  const syncNote = notes.find((note) => note.id === syncNoteId);
  const notePendingDelete = notes.find((note) => note.id === deleteNoteId);
  const syncSelectedNote = (baseIds) => {
    if (!syncNote) return;
    setSyncNoteId(null);
    notice?.('笔记同步至知识库将在 Phase 3 开放。');
  };
  const deleteNote = async () => {
    if (!notePendingDelete) return;
    try {
      await deletePersistedNote(notePendingDelete.id);
      setNotes((items) => items.filter((note) => note.id !== notePendingDelete.id));
      setSelectedNoteId((id) => id === notePendingDelete.id ? notes.find((note) => note.id !== id)?.id ?? null : id);
      if (fullscreenNoteId === notePendingDelete.id) setFullscreenNoteId(null);
      setDeleteNoteId(null);
      notice?.('笔记及关联知识库资料已删除；灵感卡片仍被保留。');
    } catch {
      notice?.('删除笔记失败，请稍后重试。');
    }
  };
  const moveContextNote = async (nextNotebookId) => {
    if (!contextNote) return;
    try {
      await updatePersistedNote(contextNote.id, { notebookId: nextNotebookId });
      updateNote({ ...contextNote, notebookId: nextNotebookId });
      setContextNoteId(null);
      notice?.(nextNotebookId ? '笔记已移动至笔记本。' : '笔记已移至未分类。');
    } catch {
      notice?.('移动笔记失败，请稍后重试。');
    }
  };
  const createNotebook = async (name) => {
    try {
      const notebook = await createPersistedNotebook({ name });
      setManagedNotebooks((items) => [...items, notebook]);
    } catch {
      notice?.('创建笔记本失败，请稍后重试。');
    }
  };
  const renameNotebook = async (id, name) => {
    if (!name) return;
    try {
      const notebook = await renamePersistedNotebook(id, name);
      setManagedNotebooks((items) => items.map((item) => item.id === id ? notebook : item));
    } catch {
      notice?.('重命名笔记本失败，请稍后重试。');
    }
  };
  const removeNotebook = async (mode) => {
    if (!deleteNotebook) return;
    const affected = notes.filter((note) => note.notebookId === deleteNotebook.id);
    try {
      await deletePersistedNotebook(deleteNotebook.id, { strategy: mode === 'unfile' ? 'unfile' : 'delete_notes' });
      if (mode === 'unfile') setNotes((items) => items.map((note) => note.notebookId === deleteNotebook.id ? { ...note, notebookId: null } : note));
      else setNotes((items) => items.filter((note) => note.notebookId !== deleteNotebook.id));
      setManagedNotebooks((items) => items.filter((notebook) => notebook.id !== deleteNotebook.id));
      if (notebookId === deleteNotebook.id) setNotebookId('all');
      setDeleteNotebook(null);
      notice?.(mode === 'unfile' ? `已删除笔记本，${affected.length} 篇笔记已移至未分类。` : `已删除笔记本及 ${affected.length} 篇笔记的关联资料。`);
    } catch {
      notice?.('删除笔记本失败，请稍后重试。');
    }
  };
  const createOrganizedNote = async (cardIds) => {
    try {
      const nextNote = await createPersistedNote();
      const noteWithCards = attachCards(nextNote, cardIds);
      await persistMaterials(noteWithCards);
      setNotes((items) => [noteWithCards, ...items]);
      setSelectedNoteId(noteWithCards.id);
      setFullscreenNoteId(noteWithCards.id);
      setTab('notes');
      onCreateOrganizedNote?.(cardIds);
      notice?.(`已创建笔记，并放入 ${cardIds.length} 张灵感卡片。`);
    } catch {
      notice?.('整理笔记失败，请稍后重试。');
    }
  };
  const addCardToNote = async (card) => {
    try {
      const nextNote = attachCards(await createPersistedNote(), [card.id]);
      await persistMaterials(nextNote);
      setNotes((items) => [nextNote, ...items]);
      setSelectedNoteId(nextNote.id);
      setFullscreenNoteId(nextNote.id);
      setTab('notes');
      notice?.('已将灵感卡片加入新笔记。');
    } catch {
      notice?.('添加灵感卡片失败，请稍后重试。');
    }
  };
  const removeCard = (cardId) => {
    const affectedNotes = notes.filter((note) => note.inspirationCardIds.includes(cardId));
    if (!window.confirm(`删除这张卡片将从 ${affectedNotes.length} 篇笔记的素材面板中移除；已生成的正文不会改变。确定删除吗？`)) return;
    onDeleteCard?.(cardId);
    notice?.('灵感卡片已删除。');
  };
  const attachCardsToSelectedNote = async (cardIds) => {
    const target = fullscreenNote || selectedNote;
    if (!target) return;
    const nextNote = attachCards(target, cardIds);
    try {
      await persistMaterials(nextNote);
      updateNote(nextNote);
    } catch {
      // persistMaterials has already provided the user-facing failure notice.
    }
  };
  const noteButton = (note) => (
    <button
      key={note.id}
      type="button"
      className={`notes-list__item ${note.id === selectedNote?.id ? 'is-selected' : ''}`}
      onContextMenu={(event) => { event.preventDefault(); setContextNoteId(note.id); }}
      onClick={() => setSelectedNoteId(note.id)}
    >
      <strong>{note.title || '未命名笔记'}</strong>
      <span>{note.updatedLabel}</span>
    </button>
  );

  if (fullscreenNote) {
    const showMaterials = (fullscreenNote.inspirationCardIds?.length ?? 0) > 0;
    return (
      <section className="notes-workspace notes-workspace--inspiration">
        <NoteEditor
          mode="inspiration"
          showMaterials={showMaterials}
          note={fullscreenNote}
          cards={cards}
          onChange={updateNote}
          onPersist={persistNote}
          onMaterialsChange={persistMaterials}
          onGenerate={() => notice?.('AI 生成笔记将在下一阶段开放。')}
          onAttachCards={attachCardsToSelectedNote}
          onAddToNote={addCardToNote}
          onDeleteCard={removeCard}
          onBack={exitFullscreen}
        />
      </section>
    );
  }

  return (
    <section className="notes-workspace">
      <header className="notes-workspace__header">
        <h1>笔记</h1>
        <button type="button" className="notes-workspace__create" onClick={createNote}>
          <Pencil size={15} strokeWidth={1.8} />
          新建笔记
        </button>
      </header>
      <div className="notes-workspace__tabs" role="tablist" aria-label="笔记工作区">
        <button type="button" role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>我的笔记</button>
        <button type="button" role="tab" aria-selected={tab === 'cards'} onClick={() => setTab('cards')}>灵感卡片</button>
      </div>
      {tab === 'notes' ? (
        <div className="notes-workspace__body">
          <aside className="notes-list">
            <div className="notes-list__controls" data-testid="notes-list-controls">
              <label className="notes-list__search">
                <Search size={15} />
                <input aria-label="搜索笔记" placeholder="搜索笔记" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <div className="notes-list__filter">
                <button
                  type="button"
                  className="notes-list__notebook-menu"
                  aria-label="笔记本"
                  aria-expanded={notebookMenuOpen}
                  title={selectedNotebook?.name || '全部笔记'}
                  onClick={() => setNotebookMenuOpen((open) => !open)}
                >
                  <MoreVertical size={16} strokeWidth={1.9} />
                </button>
                {notebookMenuOpen && (
                  <div className="notes-list__filter-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setNotebookId('all'); setNotebookMenuOpen(false); }}>全部笔记</button>
                    {managedNotebooks.map((notebook) => (
                      <button key={notebook.id} type="button" role="menuitem" onClick={() => { setNotebookId(notebook.id); setNotebookMenuOpen(false); }}>{notebook.name}</button>
                    ))}
                    <button type="button" role="menuitem" className="notes-list__manage" onClick={() => { setNotebookMenuOpen(false); setManagerOpen(true); }}>
                      <FolderPlus size={15} />
                      管理笔记本
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="notes-list__groups">
              <section><h2>最近编辑</h2>{recentNotes.map(noteButton)}</section>
              {olderNotes.length > 0 && <section><h2>更早</h2>{olderNotes.map(noteButton)}</section>}
              {!visibleNotes.length && (
                <div className="notes-list__empty">
                  {!notes.length ? (
                    <>
                      <p>暂无笔记</p>
                      <p>点击右上角「新建笔记」创建</p>
                    </>
                  ) : query.trim() ? (
                    <p>未找到符合条件的笔记</p>
                  ) : notebookId !== 'all' ? (
                    <p>该笔记本暂无笔记</p>
                  ) : (
                    <p>未找到符合条件的笔记</p>
                  )}
                </div>
              )}
            </div>
          </aside>
          {selectedNote && (
            <NoteEditor
              note={selectedNote}
              cards={cards}
              onChange={updateNote}
              onPersist={persistNote}
              onMaterialsChange={persistMaterials}
              onAddToNote={addCardToNote}
              onDeleteCard={removeCard}
              onEnterFullscreen={() => setFullscreenNoteId(selectedNote.id)}
            />
          )}
        </div>
      ) : (
        <InspirationCards cards={cards} onCreateOrganizedNote={createOrganizedNote} onAddToNote={addCardToNote} onDeleteCard={removeCard} />
      )}
      {contextNote && (
        <div className="note-context-menu" role="menu">
          <strong>{contextNote.title || '未命名笔记'}</strong>
          <button type="button" role="menuitem" onClick={() => setSyncNoteId(contextNote.id)}>添加至知识库</button>
          <button type="button" role="menuitem" onClick={() => notice?.(contextNote.syncedBaseIds.length ? `已同步至 ${contextNote.syncedBaseIds.length} 个知识库。` : '这篇笔记尚未同步至知识库。')}>查看知识库</button>
          <div className="note-context-menu__move">
            <span>移动至笔记本</span>
            <button type="button" role="menuitem" onClick={() => moveContextNote(null)}>未分类</button>
            {managedNotebooks.map((notebook) => (
              <button key={notebook.id} type="button" role="menuitem" onClick={() => moveContextNote(notebook.id)}>{notebook.name}</button>
            ))}
          </div>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setDeleteNoteId(contextNote.id); setContextNoteId(null); }}>删除笔记</button>
        </div>
      )}
      {syncNote && <KnowledgeBaseSyncDialog note={syncNote} bases={bases} onConfirm={syncSelectedNote} onClose={() => setSyncNoteId(null)} />}
      {notePendingDelete && <DeleteNoteDialog note={notePendingDelete} onConfirm={deleteNote} onClose={() => setDeleteNoteId(null)} />}
      {managerOpen && (
        <NotebookManagerDialog
          notebooks={managedNotebooks}
          notes={notes}
          onCreate={createNotebook}
          onRename={renameNotebook}
          onRequestDelete={(notebook) => { setManagerOpen(false); setDeleteNotebook(notebook); }}
          onClose={() => setManagerOpen(false)}
        />
      )}
      {deleteNotebook && (
        <DeleteNotebookDialog
          notebook={deleteNotebook}
          noteCount={notes.filter((note) => note.notebookId === deleteNotebook.id).length}
          onUnfile={() => removeNotebook('unfile')}
          onDeleteNotes={() => removeNotebook('notes')}
          onClose={() => setDeleteNotebook(null)}
        />
      )}
    </section>
  );
}
