import { MessageSquare, PanelLeft, PanelLeftClose, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const demoGroups = [
  {
    label: '今天',
    items: [
      { id: 'home-s1', title: '小红书增长策略', preview: '内容社区的用户增长实践拆解' },
      { id: 'home-s2', title: '会员活动设计', preview: '降低首次行动门槛的活动结构' },
    ],
  },
  {
    label: '昨天',
    items: [
      { id: 'home-s3', title: 'SaaS 0-1 复盘', preview: '从 PMF 到规模化的关键动作' },
    ],
  },
  {
    label: '更早',
    items: [
      { id: 'home-s4', title: '用户访谈问题', preview: '围绕留存与转化的访谈提纲' },
    ],
  },
];

export function HomeHistoryCard({ open = true, onOpenChange, onNewChat, onPickHistory, activeTitle }) {
  const [expanded, setExpanded] = useState(open);
  const [historyQuery, setHistoryQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const isOpen = onOpenChange ? open : expanded;
  const setOpen = (next) => {
    if (onOpenChange) onOpenChange(next);
    else setExpanded(next);
  };

  const filteredGroups = useMemo(() => {
    const q = historyQuery.trim();
    if (!q) return demoGroups;
    return demoGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.title.includes(q) || item.preview.includes(q)),
      }))
      .filter((group) => group.items.length);
  }, [historyQuery]);

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
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`home-history-item ${activeTitle === item.title ? 'is-active' : ''}`}
                onClick={() => onPickHistory?.(item.title)}
              >
                <MessageSquare size={14} strokeWidth={1.7} aria-hidden="true" />
                <strong>{item.title}</strong>
              </button>
            ))}
          </section>
        ))}
        {!filteredGroups.length && <p className="home-history-empty">没有匹配的会话</p>}
      </div>
    </aside>
  );
}
