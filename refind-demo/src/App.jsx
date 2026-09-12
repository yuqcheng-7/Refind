import { useMemo, useState } from 'react';
import { ArrowUp, BookOpen, Check, ChevronDown, Clock3, FileText, Folder, Hash, Home, Link2, ListFilter, LogOut, Pencil, Plus, Search, Settings, Sparkles, X } from 'lucide-react';
import refindLogo from '/Users/zoecheng/Downloads/ChatGPT Image Sep 12, 2026, 10_56_22 AM.png';
import './styles.css';

const initialBases = ['默认知识库', '增长与运营案例', '产品与设计资料', '行业研究报告'];
const sourceOptions = ['全部来源', '小红书', '抖音', '微信', '知乎', 'B 站', '其他'];
const sortOptions = ['从新到旧', '从旧到新', 'A-Z', 'Z-A'];
const materials = [
  { id: 'm1', title: '小红书增长策略拆解：内容社区的用户增长实践', source: '小红书', tag: '增长策略', time: '今天' },
  { id: 'm2', title: 'SaaS 产品 0-1 增长复盘：从 PMF 到规模化', source: 'B 站', tag: '产品灵感', time: '昨天' },
  { id: 'm3', title: '教育行业用户运营案例：从留存到转化的全链路实践', source: '微信', tag: '用户研究', time: '9 月 8 日' },
  { id: 'm4', title: '2022 年 UI 设计师必看的 11 个网站', source: '知乎', tag: '产品灵感', time: '9 月 6 日' },
];
const starterNotes = [
  { id: 1, title: '会员活动设计框架', body: '把用户分层、激励机制和转化节点放进一条可复用的活动链路。\n\n• 新用户：降低首次行动门槛\n• 活跃用户：以内容反馈增强持续参与\n• 高价值用户：提供可被看见的专属权益', meta: '今天 · 3 条引用' },
  { id: 2, title: '内容增长的三个信号', body: '内容是否值得继续投入，先看收藏率、二次传播率与后续搜索回流。', meta: '昨天 · 1 条引用' },
  { id: 3, title: '产品灵感收集', body: '记录界面细节、产品叙事和可迁移的交互模式。', meta: '9 月 8 日 · 4 条引用' },
];

function NavItem({ icon: Icon, label, active, onClick, trailing }) {
  return <button className={`nav-item ${active ? 'is-active' : ''}`} onClick={onClick} type="button"><Icon size={17} strokeWidth={active ? 2.35 : 1.9} /><span>{label}</span>{trailing}</button>;
}
function Toast({ text, onClose }) {
  return <div className="home-notice" role="status"><Check size={15} />{text}<button aria-label="关闭提示" type="button" onClick={onClose}><X size={15} /></button></div>;
}
function Citation({ label }) {
  return <span className="citation" tabIndex="0">引用<span>{label}</span></span>;
}
function KnowledgeAnswerMark() {
  return <svg className="knowledge-answer-mark" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="mark-light" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e2e5e9" /><stop offset="1" stopColor="#c8cdd4" /></linearGradient><linearGradient id="mark-dark" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9ca4ae" /><stop offset="1" stopColor="#707985" /></linearGradient></defs><path d="M8.1 5.4c4.4-1.1 12.1-2.1 16.1 1.2 4.2 3.4 2.9 10.2-.8 14.5L15 30.6c-3.8 4.2-11.2 2-12.2-3.5C1.7 21.5 3.6 7.9 8.1 5.4Z" fill="url(#mark-light)" /><path d="M34.4 18.7c4.5-.8 9.4 3 10 7.7.6 4.6-1.1 11.4-4.2 14.5-3.1 3.2-12.9 3.1-17.1 2.2-4.2-.9-6.1-6.6-3.4-10.2l8.9-11.6c1.4-1.8 3.5-2.3 5.8-2.6Z" fill="url(#mark-dark)" /></svg>;
}
function Composer({ base, bases, onBase, onSubmit, compact = false }) {
  const [prompt, setPrompt] = useState('');
  const [menu, setMenu] = useState(false);
  const [tag, setTag] = useState('标签');
  const [tagMenu, setTagMenu] = useState(false);
  const tags = ['标签', '增长策略', '用户研究', '产品灵感'];
  const send = (event) => { event.preventDefault(); if (!prompt.trim()) return; onSubmit(prompt, base); setPrompt(''); setMenu(false); setTagMenu(false); };
  return <form className={`question-composer ${compact ? 'is-compact' : ''} ${prompt.trim() ? 'has-content' : ''}`} onSubmit={send}>
    {compact && <span className="beam-main" aria-hidden="true" />}
    <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={compact ? '基于当前知识库进行提问' : '请输入内容进行提问'} />
    <div className="composer-footer">
      <div className="composer-actions">
        {!compact && <button type="button" className="composer-chip" onClick={() => setPrompt((value) => value || 'https://')}><Link2 size={16} />链接</button>}
        {compact ? <div className="menu-anchor compact-tag-anchor"><button type="button" className="composer-chip" onClick={() => setTagMenu(!tagMenu)}><Hash size={16} />{tag}<ChevronDown size={14} /></button>{tagMenu && <div className="composer-menu">{tags.map((item) => <button key={item} type="button" onClick={() => { setTag(item); setTagMenu(false); }}><span>{item}</span>{tag === item && <Check size={15} />}</button>)}</div>}</div> : <div className="menu-anchor"><button type="button" className="composer-chip" onClick={() => setMenu(!menu)}><BookOpen size={16} />{base}<ChevronDown size={14} /></button>{menu && <div className="composer-menu">{bases.map((item) => <button key={item} type="button" onClick={() => { onBase(item); setMenu(false); }}><span>{item}</span>{base === item && <Check size={15} />}</button>)}</div>}</div>}
        {!compact && <button type="button" className="composer-chip"><Hash size={16} />标签<ChevronDown size={14} /></button>}
      </div>
      <button className="send-button" type="submit" aria-label="发送提问"><ArrowUp size={20} /></button>
    </div>
  </form>;
}

export function App() {
  const [activeNav, setActiveNav] = useState('首页');
  const [bases, setBases] = useState(initialBases);
  const [base, setBase] = useState('默认知识库');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newBase, setNewBase] = useState('');
  const [notes, setNotes] = useState(starterNotes);
  const [noteId, setNoteId] = useState(1);
  const [query, setQuery] = useState('');
  const [materialSearchFocused, setMaterialSearchFocused] = useState(false);
  const [source, setSource] = useState('全部来源');
  const [sort, setSort] = useState('从新到旧');
  const [filterOpen, setFilterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const currentNote = notes.find((note) => note.id === noteId) || notes[0];
  const isMaterialSearching = materialSearchFocused || Boolean(query);
  const visibleMaterials = useMemo(() => {
    const rank = { m1: 4, m2: 3, m3: 2, m4: 1 };
    return materials.filter((item) => (source === '全部来源' || item.source === source) && item.title.includes(query)).sort((a, b) => {
      if (sort === '从旧到新') return rank[a.id] - rank[b.id];
      if (sort === 'A-Z') return a.title.localeCompare(b.title, 'zh-Hans-CN');
      if (sort === 'Z-A') return b.title.localeCompare(a.title, 'zh-Hans-CN');
      return rank[b.id] - rank[a.id];
    });
  }, [source, query, sort]);
  const say = (text) => setNotice(text);
  const switchNav = (view) => { setActiveNav(view); if (view === '知识库') setBase('默认知识库'); setNotice(''); };
  const createBase = (event) => { event.preventDefault(); if (!newBase.trim()) return; const value = newBase.trim(); setBases((items) => [...items, value]); setBase(value); setNewBase(''); setShowCreate(false); say(`已创建知识库「${value}」。`); };
  const ask = (prompt, selectedBase) => { setActiveNav('知识库'); setBase(selectedBase); setMessages((all) => [...all, { id: Date.now(), question: prompt }]); };
  const addNote = () => { const id = Date.now(); setNotes((items) => [{ id, title: '未命名笔记', body: '在这里写下你的想法。', meta: '刚刚创建 · 0 条引用' }, ...items]); setNoteId(id); say('已新建一篇笔记。'); };

  return <main className="app-shell">
    <aside className="home-sidebar">
      <div>
        <div className="home-brand"><img className="brand-logo" src={refindLogo} alt="Refind" /><strong>Refind</strong><span>· 拾藏</span></div>
        <nav className="home-nav">
          <NavItem icon={Home} label="首页" active={activeNav === '首页'} onClick={() => switchNav('首页')} />
          <NavItem icon={FileText} label="笔记" active={activeNav === '笔记'} onClick={() => switchNav('笔记')} />
          <NavItem icon={Folder} label="知识库" active={activeNav === '知识库'} onClick={() => switchNav('知识库')} trailing={<Plus className="create-kb-plus" size={17} onClick={(event) => { event.stopPropagation(); setShowCreate(true); }} />} />
        </nav>
        <label className="sidebar-search"><Search size={16} /><input placeholder="搜索知识库" /></label>
        {activeNav === '知识库' && <div className="kb-sidebar-list">{bases.map((item) => <button key={item} className={base === item ? 'selected' : ''} onClick={() => setBase(item)}><BookOpen size={15} /><span>{item}</span></button>)}</div>}
      </div>
      <div className="profile-anchor">
        <button type="button" className={`profile ${accountOpen ? 'is-active' : ''}`} aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><span className="profile-avatar">林</span><span><strong>林知夏</strong><small>个人账号</small></span></button>
        {accountOpen && <div className="account-menu"><button type="button" onClick={() => { setAccountOpen(false); say('设置页面即将提供。'); }}><Settings size={15} />设置</button><button type="button" className="account-logout" onClick={() => { setAccountOpen(false); say('已退出登录（演示）。'); }}><LogOut size={15} />退出登录</button></div>}
      </div>
    </aside>
    {activeNav === '首页' && <section className="home-canvas"><div className="hero-block"><div className="robot-hero"><img src="/assets/refind-home-robot.png" alt="" /></div><h1>Welcome, Refind!</h1><p>把散落的收藏，重新捡回来。</p></div><Composer base={base} bases={bases} onBase={setBase} onSubmit={ask} />{notice && <Toast text={notice} onClose={() => setNotice('')} />}</section>}
    {activeNav === '笔记' && <section className="workspace-canvas notes-canvas"><header className="workspace-header"><div><span className="eyebrow">个人记录</span><h1>笔记</h1></div><button className="quiet-action" onClick={addNote}><Pencil size={16} />新建笔记</button></header><div className="notes-layout"><aside className="note-list-panel"><label className="list-search"><Search size={15} /><input placeholder="搜索笔记" /></label><div className="note-list">{notes.map((note) => <button key={note.id} onClick={() => setNoteId(note.id)} className={note.id === noteId ? 'selected' : ''}><strong>{note.title}</strong><span>{note.meta}</span></button>)}</div></aside><article className="note-editor-panel"><div className="note-editor-top"><span>笔记</span><button onClick={() => say('笔记已保存。')}>保存</button></div><input className="note-title-input" value={currentNote.title} onChange={(e) => setNotes((items) => items.map((n) => n.id === currentNote.id ? { ...n, title: e.target.value } : n))} /><textarea value={currentNote.body} onChange={(e) => setNotes((items) => items.map((n) => n.id === currentNote.id ? { ...n, body: e.target.value } : n))} /><div className="note-citation">引用自：增长与运营案例 · {currentNote.meta}</div></article></div>{notice && <Toast text={notice} onClose={() => setNotice('')} />}</section>}
    {activeNav === '知识库' && <section className="workspace-canvas knowledge-canvas">
      <header className="workspace-header"><div><h1>{base}</h1></div></header>
      <div className="knowledge-layout">
        <section className="materials-panel">
          <div className={`material-tools ${isMaterialSearching ? 'is-searching' : ''}`}>
            <div className="material-search"><Search size={16} /><input value={query} onFocus={() => setMaterialSearchFocused(true)} onBlur={() => { if (!query) setMaterialSearchFocused(false); }} onChange={(e) => setQuery(e.target.value)} placeholder="搜索资料" />{isMaterialSearching && <button className="material-search-clear" type="button" aria-label="清除搜索" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); setMaterialSearchFocused(false); setFilterOpen(false); }}><X size={16} /></button>}</div>
            {!isMaterialSearching && <div className="filter-anchor">
              <button className="filter-trigger" type="button" onClick={() => setFilterOpen((open) => !open)}><ListFilter size={16} />筛选<ChevronDown size={15} /></button>
              {filterOpen && <div className="material-filter-popover">
                <section><strong>按来源</strong>{sourceOptions.map((item) => <button key={item} className={source === item ? 'selected' : ''} onClick={() => { setSource(item); setFilterOpen(false); }}><span>{item}</span>{source === item && <Check size={14} />}</button>)}</section>
                <section><strong>按时间 / 标题</strong>{sortOptions.map((item) => <button key={item} className={sort === item ? 'selected' : ''} onClick={() => { setSort(item); setFilterOpen(false); }}><span>{item}</span>{sort === item && <Check size={14} />}</button>)}</section>
              </div>}
            </div>}
            {!isMaterialSearching && <button className="add-link-button" onClick={() => say('粘贴链接后即可自动解析保存。')}><Plus size={16} />添加链接</button>}
          </div>
          <div className="material-list">{visibleMaterials.map((item) => <article className="material-row" key={item.id}><div className="material-mark"><BookOpen size={17} /></div><div><h3>{item.title}</h3><p><span>{item.source}</span> · #{item.tag}</p></div><time>{item.time}</time></article>)}{!visibleMaterials.length && <p className="empty-inline">没有匹配的资料。</p>}</div>
        </section>
        <aside className="ai-panel"><div className="ai-panel-head"><h2>AI 对话</h2><div><button title="新建会话" onClick={() => setMessages([])}><Plus size={16} /></button><button title="会话历史" onClick={() => setHistoryOpen((v) => !v)}><Clock3 size={16} /></button></div></div>{historyOpen && <div className="history-popover"><strong>会话历史</strong><button onClick={() => { setMessages([]); setHistoryOpen(false); }}>小红书增长策略</button><button onClick={() => { setMessages([]); setHistoryOpen(false); }}>会员活动设计</button></div>}<div className="ai-stream">{messages.length === 0 ? <div className="ai-empty"><KnowledgeAnswerMark /><h3>从你的资料里找答案</h3></div> : messages.map((message) => <div className="conversation" key={message.id}><div className="user-message">{message.question}</div><div className="answer-message"><p>我在「{base}」里找到了三个值得优先关注的方向：</p><ol><li>先用高质量内容建立核心用户的信任感。<Citation label="小红书增长策略" /></li><li>用明确的反馈与激励，缩短用户从浏览到行动的路径。<Citation label="SaaS 增长复盘" /></li><li>持续观察留存和搜索回流，确认增长是否可复制。<Citation label="用户运营案例" /></li></ol><button className="save-answer" onClick={() => { const id = Date.now(); setNotes((items) => [{ id, title: '来自 AI 的知识库摘要', body: '三个值得优先关注的增长方向已保存。', meta: '刚刚保存 · 3 条引用' }, ...items]); setNoteId(id); say('回答已加入笔记。'); }}>加入笔记</button></div></div>)}</div><Composer compact base={base} bases={bases} onBase={setBase} onSubmit={ask} /></aside>
      </div>{notice && <Toast text={notice} onClose={() => setNotice('')} />}
    </section>}
    {showCreate && <div className="modal-layer"><form className="create-modal" onSubmit={createBase}><button className="modal-close" type="button" onClick={() => setShowCreate(false)}><X size={17} /></button><Sparkles size={22} /><h2>新建知识库</h2><p>创建一个主题空间，用来归集和提问。</p><label>知识库名称<input value={newBase} autoFocus onChange={(event) => setNewBase(event.target.value)} placeholder="例如：产品与设计资料" /></label><div><button type="button" onClick={() => setShowCreate(false)}>取消</button><button type="submit">创建</button></div></form></div>}
  </main>;
}
