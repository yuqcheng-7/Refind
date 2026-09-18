import { ChevronRight, FolderPlus, MoreVertical, Pencil, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDismissable } from '../../hooks/useDismissable.js';
import { attachCards, filterNotes } from './noteState.js';
import { NoteEditor } from './NoteEditor.jsx';
import { InspirationCards } from './InspirationCards.jsx';
import { DeleteNotebookDialog, DeleteNoteDialog, KnowledgeBaseSyncDialog, NotebookManagerDialog } from './NoteDialogs.jsx';
import { demoKnowledgeBases } from './demoData.js';
import {
  downloadNoteFile,
  noteMarkdown,
  notePlainText,
  safeNoteFilename,
} from './noteExport.js';
import {
  createNote as createPersistedNote,
  createNotebook as createPersistedNotebook,
  deleteNote as deletePersistedNote,
  deleteNotebook as deletePersistedNotebook,
  generateNote as generatePersistedNote,
  outlineNoteMaterials as outlinePersistedNote,
  renameNotebook as renamePersistedNotebook,
  setNoteMaterials,
  syncNote as syncPersistedNote,
  updateNote as updatePersistedNote,
} from '../../lib/api/notes.js';

function clampMenuCoords(clientX, clientY, width = 196, height = 188) {
  const left = Math.min(Math.max(8, clientX), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, clientY), window.innerHeight - height - 8);
  return { left, top };
}

export function NotesWorkspace({ notes, setNotes, cards, notebooks, bases = demoKnowledgeBases, notice, onCreateOrganizedNote, onDeleteCard, onOpenMaterial }) {
  const [tab, setTab] = useState('notes');
  const [notebookId, setNotebookId] = useState('all');
  const [notebookMenuOpen, setNotebookMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState(notes[0]?.id ?? null);
  const [fullscreenNoteId, setFullscreenNoteId] = useState(null);
  const [managedNotebooks, setManagedNotebooks] = useState(notebooks);
  const [contextNoteId, setContextNoteId] = useState(null);
  const [contextMenuPos, setContextMenuPos] = useState({ left: 0, top: 0 });
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const contextMenuRef = useRef(null);
  const notebookFilterRef = useRef(null);
  const [syncNoteId, setSyncNoteId] = useState(null);
  const [deleteNoteId, setDeleteNoteId] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [deleteNotebook, setDeleteNotebook] = useState(null);

  useEffect(() => setManagedNotebooks(notebooks), [notebooks]);

  const closeContextMenu = () => {
    setContextNoteId(null);
    setMoveMenuOpen(false);
    setExportMenuOpen(false);
  };

  useDismissable({
    open: Boolean(contextNoteId),
    onClose: closeContextMenu,
    rootRef: contextMenuRef,
  });

  useDismissable({
    open: notebookMenuOpen,
    onClose: () => setNotebookMenuOpen(false),
    rootRef: notebookFilterRef,
  });
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
  const generateFullscreenNote = async () => {
    const target = fullscreenNote;
    if (!target?.id) return;
    if (!(target.inspirationCardIds?.length > 0)) {
      notice?.('请先添加灵感卡片再生成。');
      throw new Error('no materials');
    }
    try {
      const updated = await generatePersistedNote(target.id, {
        note: target,
        cards,
      });
      updateNote({
        ...target,
        ...updated,
        // Keep local materials panel membership / thoughts if Edge omits them.
        inspirationCardIds: updated.inspirationCardIds?.length
          ? updated.inspirationCardIds
          : target.inspirationCardIds,
        materialThoughts: updated.materialThoughts || target.materialThoughts,
      });
      notice?.('已生成笔记正文。');
    } catch (error) {
      notice?.(error?.message || '笔记生成失败，请稍后重试。');
      throw error;
    }
  };
  const outlineFullscreenNote = async () => {
    const target = fullscreenNote;
    if (!target?.id) return;
    if ((target.inspirationCardIds?.length ?? 0) < 2) {
      notice?.('至少需要 2 张灵感卡片才能成章。');
      throw new Error('insufficient materials');
    }
    try {
      const updated = await outlinePersistedNote(target.id);
      updateNote({
        ...target,
        ...updated,
        // Keep local materials panel membership / thoughts if Edge omits them.
        inspirationCardIds: updated.inspirationCardIds?.length
          ? updated.inspirationCardIds
          : target.inspirationCardIds,
        materialThoughts: updated.materialThoughts || target.materialThoughts,
      });
      notice?.('已生成章节大纲。');
    } catch (error) {
      notice?.(error?.message || '成章失败，请稍后重试。');
      throw error;
    }
  };
  const contextNote = notes.find((note) => note.id === contextNoteId);
  const syncNote = notes.find((note) => note.id === syncNoteId);
  const notePendingDelete = notes.find((note) => note.id === deleteNoteId);
  const syncSelectedNote = async (baseIds) => {
    if (!syncNote) return;
    const target = syncNote;
    const ids = [...new Set((baseIds || []).filter(Boolean))];
    setSyncNoteId(null);
    if (!ids.length) return;

    notice?.(`同步中：正在同步至 ${ids.length} 个知识库…`);
    try {
      const result = await syncPersistedNote({
        noteId: target.id,
        knowledgeBaseIds: ids,
      });
      const syncedIds = result.knowledgeBaseIds?.length
        ? result.knowledgeBaseIds
        : (result.synced || []).map((row) => row.knowledgeBaseId).filter(Boolean);
      updateNote({
        ...target,
        syncedBaseIds: [...new Set([...(target.syncedBaseIds || []), ...syncedIds])],
      });

      if (result.failed?.length && syncedIds.length) {
        notice?.(`已同步 ${syncedIds.length} 个，失败 ${result.failed.length} 个。`);
      } else if (result.failed?.length) {
        notice?.('同步失败，请稍后重试。');
      } else {
        notice?.(`已同步至 ${syncedIds.length} 个知识库。`);
      }
    } catch (error) {
      notice?.(error?.message || '同步失败，请稍后重试。');
    }
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
      closeContextMenu();
      notice?.(nextNotebookId ? '笔记已移动至笔记本。' : '笔记已移至未分类。');
    } catch {
      notice?.('移动笔记失败，请稍后重试。');
    }
  };
  const exportContextNote = (format) => {
    if (!contextNote) return;
    if (format === 'markdown') {
      downloadNoteFile(
        safeNoteFilename(contextNote.title, 'md'),
        noteMarkdown(contextNote),
        'text/markdown;charset=utf-8',
      );
    } else {
      downloadNoteFile(
        safeNoteFilename(contextNote.title, 'txt'),
        notePlainText(contextNote),
        'text/plain;charset=utf-8',
      );
    }
    closeContextMenu();
    notice?.(format === 'markdown' ? '已导出为 Markdown。' : '已导出为纯文本。');
  };
  const createNotebook = async (name) => {
    const tempId = `temp-nb-${Date.now()}`;
    const optimistic = { id: tempId, name };
    setManagedNotebooks((items) => [...items, optimistic]);
    try {
      const notebook = await createPersistedNotebook({ name });
      setManagedNotebooks((items) => items.map((item) => (item.id === tempId ? notebook : item)));
    } catch {
      setManagedNotebooks((items) => items.filter((item) => item.id !== tempId));
      notice?.('创建笔记本失败，请稍后重试。');
    }
  };
  const importNotesToNotebook = async (targetNotebookId, noteIds) => {
    const ids = [...new Set(noteIds || [])];
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => updatePersistedNote(id, { notebookId: targetNotebookId })));
      setNotes((items) => items.map((note) => (
        ids.includes(note.id) ? { ...note, notebookId: targetNotebookId } : note
      )));
      const targetName = targetNotebookId
        ? (managedNotebooks.find((item) => item.id === targetNotebookId)?.name || '笔记本')
        : '未分类';
      notice?.(ids.length === 1
        ? `已导入 1 篇笔记至「${targetName}」。`
        : `已导入 ${ids.length} 篇笔记至「${targetName}」。`);
    } catch {
      notice?.('导入笔记失败，请稍后重试。');
      throw new Error('import failed');
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
  const addCardsAsNotes = async (cardIds) => {
    if (!cardIds?.length) return 0;
    let created = 0;
    try {
      for (const cardId of cardIds) {
        const nextNote = attachCards(await createPersistedNote(), [cardId]);
        await persistMaterials(nextNote);
        setNotes((items) => [nextNote, ...items]);
        created += 1;
      }
      notice?.(created === 1 ? '已将灵感卡片加入新笔记。' : `已将 ${created} 张灵感卡片加入新笔记。`);
      return created;
    } catch (error) {
      notice?.(created ? `已创建 ${created}/${cardIds.length} 篇，其余失败。` : '添加灵感卡片失败，请稍后重试。');
      throw error;
    }
  };
  const attachCardsToNote = async (noteId, cardIds, { openNote = false } = {}) => {
    const target = notes.find((note) => note.id === noteId);
    if (!target) {
      notice?.('未找到目标笔记。');
      throw new Error('note not found');
    }
    const nextNote = attachCards(target, cardIds);
    try {
      await persistMaterials(nextNote);
      updateNote(nextNote);
      if (openNote) {
        setSelectedNoteId(nextNote.id);
        setFullscreenNoteId(nextNote.id);
        setTab('notes');
      }
      notice?.(cardIds.length === 1 ? '已将灵感卡片加入笔记。' : `已将 ${cardIds.length} 张灵感卡片加入笔记。`);
    } catch (error) {
      notice?.('加入笔记失败，请稍后重试。');
      throw error;
    }
  };
  const removeCard = (cardId) => {
    const affectedNotes = notes.filter((note) => note.inspirationCardIds.includes(cardId));
    if (!window.confirm(`删除这张卡片将从 ${affectedNotes.length} 篇笔记的素材面板中移除；已生成的正文不会改变。确定删除吗？`)) return;
    onDeleteCard?.(cardId);
    notice?.('灵感卡片已删除。');
  };
  const removeCards = (cardIds) => {
    if (!cardIds?.length) return false;
    const affectedNotes = notes.filter((note) => note.inspirationCardIds.some((id) => cardIds.includes(id)));
    if (!window.confirm(`删除这 ${cardIds.length} 张卡片将从 ${affectedNotes.length} 篇笔记的素材面板中移除；已生成的正文不会改变。确定删除吗？`)) {
      return false;
    }
    cardIds.forEach((id) => onDeleteCard?.(id));
    notice?.(`已删除 ${cardIds.length} 张灵感卡片。`);
    return true;
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
      onContextMenu={(event) => {
        event.preventDefault();
        setMoveMenuOpen(false);
        setExportMenuOpen(false);
        setContextMenuPos(clampMenuCoords(event.clientX, event.clientY));
        setContextNoteId(note.id);
      }}
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
          knowledgeBases={bases}
          onChange={updateNote}
          onPersist={persistNote}
          onMaterialsChange={persistMaterials}
          onGenerate={generateFullscreenNote}
          onOutline={outlineFullscreenNote}
          onAttachCards={attachCardsToSelectedNote}
          onAddToNote={addCardToNote}
          onAttachCardsToNote={attachCardsToNote}
          onDeleteCard={removeCard}
          onOpenMaterial={onOpenMaterial}
          onBack={exitFullscreen}
          notes={notes}
          notebooks={managedNotebooks}
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
              <div className="notes-list__filter" ref={notebookFilterRef}>
                <button
                  type="button"
                  className="notes-list__notebook-menu"
                  aria-label="笔记本"
                  aria-expanded={notebookMenuOpen}
                  title={
                    notebookId === 'uncategorized'
                      ? '未分类'
                      : (selectedNotebook?.name || '全部笔记')
                  }
                  onClick={() => setNotebookMenuOpen((open) => !open)}
                >
                  <MoreVertical size={16} strokeWidth={1.9} />
                </button>
                {notebookMenuOpen && (
                  <div className="notes-list__filter-menu" role="menu" aria-label="笔记本筛选">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={notebookId === 'all'}
                      className={notebookId === 'all' ? 'is-checked' : undefined}
                      onClick={() => { setNotebookId('all'); setNotebookMenuOpen(false); }}
                    >
                      <span>全部笔记</span>
                      {notebookId === 'all' ? <span className="notes-list__filter-check" aria-hidden="true">✓</span> : null}
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={notebookId === 'uncategorized'}
                      className={notebookId === 'uncategorized' ? 'is-checked' : undefined}
                      onClick={() => { setNotebookId('uncategorized'); setNotebookMenuOpen(false); }}
                    >
                      <span>未分类</span>
                      {notebookId === 'uncategorized' ? <span className="notes-list__filter-check" aria-hidden="true">✓</span> : null}
                    </button>
                    {managedNotebooks.map((notebook) => (
                      <button
                        key={notebook.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={notebookId === notebook.id}
                        className={notebookId === notebook.id ? 'is-checked' : undefined}
                        onClick={() => { setNotebookId(notebook.id); setNotebookMenuOpen(false); }}
                      >
                        <span>{notebook.name}</span>
                        {notebookId === notebook.id ? <span className="notes-list__filter-check" aria-hidden="true">✓</span> : null}
                      </button>
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
              knowledgeBases={bases}
              notes={notes}
              notebooks={managedNotebooks}
              onChange={updateNote}
              onPersist={persistNote}
              onMaterialsChange={persistMaterials}
              onAddToNote={addCardToNote}
              onAttachCardsToNote={attachCardsToNote}
              onDeleteCard={removeCard}
              onOpenMaterial={onOpenMaterial}
              onEnterFullscreen={() => setFullscreenNoteId(selectedNote.id)}
            />
          )}
        </div>
      ) : (
        <InspirationCards
          cards={cards}
          knowledgeBases={bases}
          notes={notes}
          notebooks={managedNotebooks}
          onCreateOrganizedNote={createOrganizedNote}
          onAddToNote={addCardToNote}
          onAddCardsAsNotes={addCardsAsNotes}
          onAttachCardsToNote={attachCardsToNote}
          onDeleteCard={removeCard}
          onDeleteCards={removeCards}
          onOpenMaterial={onOpenMaterial}
        />
      )}
      {contextNote && createPortal(
        <div
          className="note-context-menu"
          role="menu"
          aria-label="笔记操作"
          ref={contextMenuRef}
          style={{ left: contextMenuPos.left, top: contextMenuPos.top }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setSyncNoteId(contextNote.id); closeContextMenu(); }}
          >
            添加至知识库
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              notice?.(contextNote.syncedBaseIds?.length
                ? `已同步至 ${contextNote.syncedBaseIds.length} 个知识库。`
                : '这篇笔记尚未同步至知识库。');
              closeContextMenu();
            }}
          >
            查看知识库
          </button>
          <div className="note-context-menu__separator" role="separator" />
          <div className={`note-context-menu__item ${moveMenuOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={moveMenuOpen}
              onClick={() => {
                setExportMenuOpen(false);
                setMoveMenuOpen((open) => !open);
              }}
            >
              <span>移动至笔记本</span>
              <ChevronRight className="note-context-menu__chevron" size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
            {moveMenuOpen && (
              <div className="note-context-menu__submenu" role="menu" aria-label="移动至笔记本">
                <button
                  type="button"
                  role="menuitem"
                  className={!contextNote.notebookId ? 'is-checked' : undefined}
                  onClick={() => moveContextNote(null)}
                >
                  <span>未分类</span>
                  {!contextNote.notebookId ? <span className="note-context-menu__check" aria-hidden="true">✓</span> : null}
                </button>
                {managedNotebooks.map((notebook) => (
                  <button
                    key={notebook.id}
                    type="button"
                    role="menuitem"
                    className={contextNote.notebookId === notebook.id ? 'is-checked' : undefined}
                    onClick={() => moveContextNote(notebook.id)}
                  >
                    <span>{notebook.name}</span>
                    {contextNote.notebookId === notebook.id
                      ? <span className="note-context-menu__check" aria-hidden="true">✓</span>
                      : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`note-context-menu__item ${exportMenuOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              onClick={() => {
                setMoveMenuOpen(false);
                setExportMenuOpen((open) => !open);
              }}
            >
              <span>导出</span>
              <ChevronRight className="note-context-menu__chevron" size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
            {exportMenuOpen && (
              <div className="note-context-menu__submenu" role="menu" aria-label="导出">
                <button type="button" role="menuitem" onClick={() => exportContextNote('markdown')}>
                  Markdown
                </button>
                <button type="button" role="menuitem" onClick={() => exportContextNote('text')}>
                  纯文本
                </button>
              </div>
            )}
          </div>
          <div className="note-context-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              setDeleteNoteId(contextNote.id);
              closeContextMenu();
            }}
          >
            删除笔记
          </button>
        </div>,
        document.body,
      )}
      {syncNote && <KnowledgeBaseSyncDialog note={syncNote} bases={bases} onConfirm={syncSelectedNote} onClose={() => setSyncNoteId(null)} />}
      {notePendingDelete && <DeleteNoteDialog note={notePendingDelete} onConfirm={deleteNote} onClose={() => setDeleteNoteId(null)} />}
      {managerOpen && (
        <NotebookManagerDialog
          notebooks={managedNotebooks}
          notes={notes}
          onCreate={createNotebook}
          onRename={renameNotebook}
          onImportNotes={importNotesToNotebook}
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
