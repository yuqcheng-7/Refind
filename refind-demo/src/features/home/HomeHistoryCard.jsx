import { MessageCircle, PanelLeft, PanelLeftClose, Plus, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { groupConversationsByDay } from '../../lib/api/conversations.js';
import { useDismissable } from '../../hooks/useDismissable.js';

function clampMenuCoords(clientX, clientY, width = 128, height = 76) {
  const left = Math.min(Math.max(8, clientX), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, clientY), window.innerHeight - height - 8);
  return { left, top };
}

export function HomeHistoryCard({
  open = true,
  onOpenChange,
  onNewChat,
  onPickHistory,
  onRenameConversation,
  onDeleteConversation,
  conversations = [],
  activeConversationId,
}) {
  const [expanded, setExpanded] = useState(open);
  const [historyQuery, setHistoryQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [renameDraft, setRenameDraft] = useState(null);
  const menuRef = useRef(null);

  const isOpen = onOpenChange ? open : expanded;
  const setOpen = (next) => {
    if (onOpenChange) onOpenChange(next);
    else setExpanded(next);
  };

  useDismissable({
    open: Boolean(menu),
    onClose: () => setMenu(null),
    rootRef: menuRef,
  });

  const filteredGroups = useMemo(() => {
    const q = historyQuery.trim();
    const items = q
      ? conversations.filter((item) => item.title.includes(q))
      : conversations;
    return groupConversationsByDay(items);
  }, [conversations, historyQuery]);

  const openRename = (item) => {
    setMenu(null);
    setRenameDraft({ id: item.id, title: item.title });
  };

  const cancelRename = () => setRenameDraft(null);

  const commitRename = async () => {
    if (!renameDraft) return;
    const draft = renameDraft;
    const title = draft.title.trim();
    const original = conversations.find((item) => item.id === draft.id);
    setRenameDraft(null);
    if (!title || (original && title === original.title)) return;
    await onRenameConversation?.(draft.id, title);
  };

  const confirmDelete = async (item) => {
    setMenu(null);
    const ok = window.confirm(`确定删除会话「${item.title}」？删除后无法恢复。`);
    if (!ok) return;
    await onDeleteConversation?.(item.id);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="home-history-fab"
        aria-label="展开会话历史"
        title="会话历史"
        onClick={() => setOpen(true)}
      >
        <PanelLeft size={17} strokeWidth={1.7} />
      </button>
    );
  }

  return (
    <aside className="home-history-card" aria-label="会话历史">
      <button type="button" className="home-history-card__new" aria-label="新增会话" onClick={onNewChat}>
        <Plus size={15} strokeWidth={1.8} />
        新增会话
      </button>

      <header className={`home-history-card__head ${searchOpen ? 'is-searching' : ''}`}>
        {searchOpen ? (
          <>
            <div className="home-history-search">
              <Search size={15} strokeWidth={1.6} />
              <input
                autoFocus
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="搜索会话"
                aria-label="搜索会话"
              />
              <button
                type="button"
                aria-label="关闭搜索"
                onClick={() => { setSearchOpen(false); setHistoryQuery(''); }}
              >
                <X size={15} />
              </button>
            </div>
            <button
              type="button"
              className="home-history-card__collapse"
              aria-label="收起会话历史"
              title="收起"
              onClick={() => setOpen(false)}
            >
              <PanelLeftClose size={16} strokeWidth={1.7} />
            </button>
          </>
        ) : (
          <>
            <strong>历史会话</strong>
            <div className="home-history-card__head-actions">
              <button type="button" className="home-history-search-trigger" aria-label="搜索会话" onClick={() => setSearchOpen(true)}>
                <Search size={15} strokeWidth={1.6} />
              </button>
              <button
                type="button"
                className="home-history-card__collapse"
                aria-label="收起会话历史"
                title="收起"
                onClick={() => setOpen(false)}
              >
                <PanelLeftClose size={16} strokeWidth={1.7} />
              </button>
            </div>
          </>
        )}
      </header>

      <div className="home-history-card__list" role="list">
        {filteredGroups.map((group) => (
          <section key={group.label} className="home-history-group" aria-label={group.label}>
            <h3>{group.label}</h3>
            {group.items.map((item) => (
              renameDraft?.id === item.id ? (
                <div
                  key={item.id}
                  className={`home-history-item is-renaming ${activeConversationId === item.id ? 'is-active' : ''}`}
                  role="listitem"
                >
                  <MessageCircle size={14} strokeWidth={1.7} aria-hidden="true" />
                  <input
                    autoFocus
                    value={renameDraft.title}
                    maxLength={80}
                    aria-label="会话名称"
                    onChange={(event) => setRenameDraft((current) => (
                      current ? { ...current, title: event.target.value } : current
                    ))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => { commitRename(); }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`home-history-item ${activeConversationId === item.id ? 'is-active' : ''}`}
                  onClick={() => onPickHistory?.(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const coords = clampMenuCoords(event.clientX, event.clientY);
                    setMenu({ id: item.id, title: item.title, ...coords });
                  }}
                >
                  <MessageCircle size={14} strokeWidth={1.7} aria-hidden="true" />
                  <strong>{item.title}</strong>
                </button>
              )
            ))}
          </section>
        ))}
        {!filteredGroups.length && (
          <div className="home-history-empty">
            {historyQuery.trim() ? (
              <p>未找到符合条件的会话</p>
            ) : (
              <>
                <p>暂无历史会话</p>
                <p>在首页发起对话后，记录将显示于此</p>
              </>
            )}
          </div>
        )}
      </div>

      {menu && createPortal(
        <div
          className="home-history-context-menu"
          role="menu"
          aria-label="会话操作"
          ref={menuRef}
          style={{ left: menu.left, top: menu.top }}
        >
          <button type="button" role="menuitem" onClick={() => openRename(menu)}>重命名</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => confirmDelete(menu)}>删除</button>
        </div>,
        document.body,
      )}
    </aside>
  );
}
