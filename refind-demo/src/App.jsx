import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Hash, Link2, LogOut, Menu, MessageSquare, NotebookText, Plus, Search, Settings, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import refindLogo from '/Users/zoecheng/Downloads/ChatGPT Image Sep 12, 2026, 10_56_22 AM.png';
import './styles.css';
import { NotesWorkspace } from './features/notes/NotesWorkspace.jsx';
import { HomeComposer, defaultHomeScope } from './features/home/HomeComposer.jsx';
import { HomeConversation, HomeShareBar } from './features/home/HomeConversation.jsx';
import { KbConversation } from './features/knowledge/KbConversation.jsx';
import { HomeHistoryCard } from './features/home/HomeHistoryCard.jsx';
import { MaterialIngest } from './features/knowledge/MaterialIngest.jsx';
import { getMaterialPreviewUrl } from './features/knowledge/materialDemo.js';
import { useDismissable } from './hooks/useDismissable.js';
import { AuthScreen } from './features/auth/AuthScreen.jsx';
import { deleteAccount, getSession, signOut } from './lib/api/auth.js';
import { createKnowledgeBase, listKnowledgeBases } from './lib/api/knowledge.js';
import { createMaterialStub, deleteMaterial, listMaterials } from './lib/api/materials.js';
import { inferMaterialInputType, parseAndPollMaterial, uploadMaterialFile } from './lib/api/ingest.js';
import {
  createInspirationCard,
  createNote,
  deleteInspirationCard,
  listInspirationCards,
  listNotebooks,
  listNotes,
  updateNote,
} from './lib/api/notes.js';
import { supabase } from './lib/supabaseClient.js';

const sourceOptions = ['全部来源', '小红书', '抖音', '微信', '知乎', 'B 站', '其他'];
const sortOptions = ['从新到旧', '从旧到新', 'A-Z', 'Z-A'];
const initialHomeScope = defaultHomeScope;
const platformCodes = { 小红书: 'xhs', 抖音: 'douyin', 微信: 'wechat_mp', 知乎: 'zhihu', 'B 站': 'bilibili', 其他: 'other' };
function IconHome({ size = 18, strokeWidth = 1.5, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 10.2 12 4.2l7.5 6V19a1.3 1.3 0 0 1-1.3 1.3H5.8A1.3 1.3 0 0 1 4.5 19v-8.8Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M9.5 20.3V13.8h5v6.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFolder({ size = 18, strokeWidth = 1.5, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3.75 7.5A1.75 1.75 0 0 1 5.5 5.75h3.1c.4 0 .78.14 1.08.4l1.24 1.05c.3.26.68.4 1.08.4H18.5A1.75 1.75 0 0 1 20.25 8.6v8.65A1.75 1.75 0 0 1 18.5 19H5.5A1.75 1.75 0 0 1 3.75 17.25V7.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}
function IconKbItem({ size = 15, ...props }) {
  return (
    <svg className="kb-item-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="2.25" y="2.5" width="4.1" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.1 3.4c1.55-.55 3.1-.55 4.65 0v9.2c-1.55-.55-3.1-.55-4.65 0V3.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function IconMaterial({ size = 15, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M3.2 3.1h6.8a1.2 1.2 0 0 1 1.2 1.2v8.2a.9.9 0 0 1-1.35.78L8 12.3l-1.85.98A.9.9 0 0 1 4.8 12.5V4.3A1.2 1.2 0 0 1 6 3.1" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      <path d="M6.2 6h4.2M6.2 8.3h3.2" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

function NavItem({ icon: Icon, label, active, onClick, trailing }) {
  return <button className={`nav-item ${active ? 'is-active' : ''}`} aria-label={label} title={label} onClick={onClick} type="button"><Icon size={18} strokeWidth={active ? 1.7 : 1.45} /><span>{label}</span>{trailing}</button>;
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
  const [thinkingMode, setThinkingMode] = useState('fast');
  const [modelMenu, setModelMenu] = useState(false);
  const [tagMenu, setTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const baseMenuRef = useRef(null);
  const modelMenuRef = useRef(null);
  const tagMenuRef = useRef(null);
  const tags = ['增长策略', '用户研究', '产品灵感'];
  const filteredTags = tags.filter((item) => !tagQuery || item.includes(tagQuery));
  const selectedModel = thinkingMode === 'deep' ? 'DS深度' : 'DS快速';
  const syncHashMenu = (value) => {
    if (!compact) return;
    const match = /(^|\s)#([^\s#]*)$/.exec(value);
    if (match) {
      setTagMenu(true);
      setTagQuery(match[2] || '');
      return;
    }
    setTagMenu(false);
    setTagQuery('');
  };
  const insertTag = (tag) => {
    setPrompt((value) => value.replace(/(^|\s)#[^\s#]*$/, `$1#${tag} `));
    setTagMenu(false);
    setTagQuery('');
  };
  useDismissable({ open: menu, onClose: () => setMenu(false), rootRef: baseMenuRef });
  useDismissable({ open: modelMenu, onClose: () => setModelMenu(false), rootRef: modelMenuRef });
  useDismissable({ open: tagMenu, onClose: () => setTagMenu(false), rootRef: tagMenuRef });
  const send = (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    onSubmit(prompt, base);
    setPrompt('');
    setMenu(false);
    setModelMenu(false);
    setTagMenu(false);
    setTagQuery('');
  };
  const onPromptKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send(event);
  };
  return <form className={`question-composer ${compact ? 'is-compact' : ''} ${prompt.trim() ? 'has-content' : ''}`} onSubmit={send}>
    {compact && <span className="beam-main" aria-hidden="true" />}
    <div className="composer-input-wrap" ref={tagMenuRef}>
      <textarea
        value={prompt}
        onChange={(event) => {
          const value = event.target.value;
          setPrompt(value);
          syncHashMenu(value);
        }}
        onKeyDown={onPromptKeyDown}
        placeholder={compact ? '基于当前知识库提问，输入 # 可选择标签' : '请输入内容进行提问'}
      />
      {compact && tagMenu && (
        <div className="composer-menu composer-tag-suggest" role="listbox" aria-label="选择标签">
          {(filteredTags.length ? filteredTags : tags).map((item) => (
            <button key={item} type="button" role="option" onClick={() => insertTag(item)}>
              <span>#{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
    <div className="composer-footer">
      <div className="composer-actions">
        {!compact && <button type="button" className="composer-chip" onClick={() => setPrompt((value) => value || 'https://')}><Link2 size={16} />链接</button>}
        {!compact && <div className="menu-anchor" ref={baseMenuRef}><button type="button" className="composer-chip" onClick={() => setMenu(!menu)}><BookOpen size={16} />{base}<ChevronDown size={14} /></button>{menu && <div className="composer-menu">{bases.map((item) => <button key={item} type="button" onClick={() => { onBase(item); setMenu(false); }}><span>{item}</span>{base === item && <Check size={15} />}</button>)}</div>}</div>}
        {!compact && <button type="button" className="composer-chip"><Hash size={16} />标签<ChevronDown size={14} /></button>}
        {compact && (
          <div className="menu-anchor compact-model-anchor" ref={modelMenuRef}>
            <button type="button" className="composer-chip composer-model" aria-label="选择模型" aria-expanded={modelMenu} onClick={() => { setModelMenu((open) => !open); setTagMenu(false); }}>
              <span>{selectedModel}</span><ChevronDown size={13} strokeWidth={1.8} />
            </button>
            {modelMenu && (
              <div className="composer-menu composer-model-menu" role="dialog" aria-label="DeepSeek 模型设置">
                <div className="composer-model-menu__row">
                  <div>
                    <strong>DeepSeek</strong>
                    <small>思考模式</small>
                  </div>
                  <div className="composer-think-toggle" role="group" aria-label="思考模式">
                    <button type="button" aria-pressed={thinkingMode === 'fast'} className={thinkingMode === 'fast' ? 'is-active' : ''} onClick={() => setThinkingMode('fast')}>快速</button>
                    <button type="button" aria-pressed={thinkingMode === 'deep'} className={thinkingMode === 'deep' ? 'is-active' : ''} onClick={() => setThinkingMode('deep')}>深度</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <button className="send-button" type="submit" aria-label="发送提问"><ArrowUp size={18} strokeWidth={2.1} /></button>
    </div>
  </form>;
}

export function App() {
  const [session, setSession] = useState(undefined);
  const [activeNav, setActiveNav] = useState('首页');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [kbRailOpen, setKbRailOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [base, setBase] = useState('默认知识库');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newBase, setNewBase] = useState('');
  const [notes, setNotes] = useState([]);
  const [cards, setCards] = useState([]);
  const [notebooks, setNotebooks] = useState([]);
  const [query, setQuery] = useState('');
  const [materialSearchFocused, setMaterialSearchFocused] = useState(false);
  const [source, setSource] = useState('全部来源');
  const [sort, setSort] = useState('从新到旧');
  const [filterOpen, setFilterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [homeHistoryOpen, setHomeHistoryOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const filterRef = useRef(null);
  const historyRef = useRef(null);
  const accountRef = useRef(null);
  const kbRailRef = useRef(null);
  const [homeMessages, setHomeMessages] = useState([]);
  const [homeSurface, setHomeSurface] = useState('hero');
  const [homeChatOpened, setHomeChatOpened] = useState(false);
  const [homeShareMode, setHomeShareMode] = useState(false);
  const [homeShareSelected, setHomeShareSelected] = useState([]);
  const [kbShareMode, setKbShareMode] = useState(false);
  const [kbShareSelected, setKbShareSelected] = useState([]);
  const [kbMessages, setKbMessages] = useState([]);
  const [homeScope, setHomeScope] = useState(initialHomeScope);
  const [conversationScope, setConversationScope] = useState(null);
  useEffect(() => {
    if (!homeScope.selectedBases.length && !homeScope.selectedTags.length) {
      setConversationScope(null);
    }
  }, [homeScope.selectedBases, homeScope.selectedTags]);
  const [knowledgeMaterials, setKnowledgeMaterials] = useState([]);
  const [hoveredMaterialId, setHoveredMaterialId] = useState(null);
  const bases = useMemo(() => knowledgeBases.map((item) => item.name), [knowledgeBases]);
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.name === base) || null,
    [knowledgeBases, base],
  );
  const isMaterialSearching = materialSearchFocused || Boolean(query);
  useEffect(() => {
    let active = true;
    getSession().then(({ data }) => {
      if (active) setSession(data.session);
    }).catch(() => {
      if (active) setSession(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) {
      setKnowledgeBases([]);
      setKnowledgeMaterials([]);
      return undefined;
    }
    let active = true;
    listKnowledgeBases()
      .then((items) => {
        if (!active) return;
        setKnowledgeBases(items);
        setBase((current) => items.some((item) => item.name === current) ? current : items.find((item) => item.type === 'default')?.name || '');
      })
      .catch(() => {
        if (active) {
          setKnowledgeBases([]);
          say('知识库暂时无法加载，请稍后重试。');
        }
      });
    return () => { active = false; };
  }, [session]);
  useEffect(() => {
    if (!session) {
      setNotes([]);
      setCards([]);
      setNotebooks([]);
      return undefined;
    }
    let active = true;
    Promise.all([listNotes(), listInspirationCards(), listNotebooks()])
      .then(([nextNotes, nextCards, nextNotebooks]) => {
        if (!active) return;
        setNotes(nextNotes);
        setCards(nextCards);
        setNotebooks(nextNotebooks);
      })
      .catch(() => {
        if (active) say('笔记暂时无法加载，请稍后重试。');
      });
    return () => { active = false; };
  }, [session]);
  useEffect(() => {
    if (!session || !selectedKnowledgeBase) {
      setKnowledgeMaterials([]);
      return undefined;
    }
    let active = true;
    listMaterials(selectedKnowledgeBase.id, {
      query,
      platform: platformCodes[source] || 'all',
    })
      .then((items) => { if (active) setKnowledgeMaterials(items); })
      .catch(() => {
        if (active) {
          setKnowledgeMaterials([]);
          say('资料暂时无法加载，请稍后重试。');
        }
      });
    return () => { active = false; };
  }, [session, selectedKnowledgeBase, query, source]);
  useDismissable({ open: filterOpen, onClose: () => setFilterOpen(false), rootRef: filterRef });
  useDismissable({ open: historyOpen, onClose: () => setHistoryOpen(false), rootRef: historyRef });
  useDismissable({ open: accountOpen, onClose: () => setAccountOpen(false), rootRef: accountRef });
  useDismissable({ open: kbRailOpen, onClose: () => setKbRailOpen(false), rootRef: kbRailRef });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const tablet = window.matchMedia('(max-width: 1199px) and (min-width: 768px)');
    const mobile = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      if (tablet.matches) setSidebarCollapsed(true);
      if (mobile.matches) {
        setSidebarCollapsed(false);
        setMobileNavOpen(false);
      }
    };
    sync();
    tablet.addEventListener('change', sync);
    mobile.addEventListener('change', sync);
    return () => {
      tablet.removeEventListener('change', sync);
      mobile.removeEventListener('change', sync);
    };
  }, []);
  const visibleMaterials = useMemo(() => {
    return [...knowledgeMaterials].sort((a, b) => {
      if (sort === '从旧到新') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === 'A-Z') return a.title.localeCompare(b.title, 'zh-Hans-CN');
      if (sort === 'Z-A') return b.title.localeCompare(a.title, 'zh-Hans-CN');
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [knowledgeMaterials, sort]);
  const say = (text) => setNotice(text);
  const exitHomeShare = () => {
    setHomeShareMode(false);
    setHomeShareSelected([]);
  };
  const startHomeShare = (answerId) => {
    setHomeShareMode(true);
    setHomeShareSelected([answerId]);
  };
  const toggleHomeShareBubble = (bubbleId) => {
    setHomeShareSelected((current) => (
      current.includes(bubbleId)
        ? current.filter((id) => id !== bubbleId)
        : [...current, bubbleId]
    ));
  };
  const copyHomeShareLink = async () => {
    const link = `https://refind.app/share/home?bubbles=${encodeURIComponent(homeShareSelected.join(',')) || 'all'}`;
    try { await navigator.clipboard?.writeText(link); } catch { /* optional */ }
    say('对话链接已复制。');
    exitHomeShare();
  };
  const exitKbShare = () => {
    setKbShareMode(false);
    setKbShareSelected([]);
  };
  const startKbShare = (answerId) => {
    setKbShareMode(true);
    setKbShareSelected([answerId]);
  };
  const toggleKbShareBubble = (bubbleId) => {
    setKbShareSelected((current) => (
      current.includes(bubbleId)
        ? current.filter((id) => id !== bubbleId)
        : [...current, bubbleId]
    ));
  };
  const copyKbShareLink = async () => {
    const link = `https://refind.app/share/kb?base=${encodeURIComponent(base)}&bubbles=${encodeURIComponent(kbShareSelected.join(',')) || 'all'}`;
    try { await navigator.clipboard?.writeText(link); } catch { /* optional */ }
    say('对话链接已复制。');
    exitKbShare();
  };
  const showHomeChat = homeSurface === 'chat';
  const switchNav = (view) => {
    if (view !== '首页') exitHomeShare();
    if (view !== '知识库') exitKbShare();
    setActiveNav(view);
    setMobileNavOpen(false);
    setAiPanelOpen(false);
    setKbRailOpen(false);
    if (view === '知识库') setBase('默认知识库');
    setNotice('');
  };
  const goHomeHero = () => {
    exitHomeShare();
    switchNav('首页');
    setHomeSurface('hero');
    setHomeHistoryOpen(true);
  };
  const goHomeNav = () => {
    switchNav('首页');
    setHomeSurface(homeChatOpened || homeMessages.length > 0 ? 'chat' : 'hero');
    setHomeHistoryOpen(true);
  };
  const createBase = async (event) => {
    event.preventDefault();
    if (!newBase.trim()) return;
    const value = newBase.trim();
    try {
      const created = await createKnowledgeBase({ name: value });
      setKnowledgeBases((items) => [...items, created]);
      setBase(created.name);
      setNewBase('');
      setShowCreate(false);
      say(`已创建知识库「${created.name}」。`);
    } catch {
      say('创建知识库失败，请稍后重试。');
    }
  };
  const submitHomeQuestion = (request) => {
    const scope = conversationScope || {
      bases: request.selectedBases,
      tags: request.selectedTags,
      mode: request.mode,
      online: request.online,
    };
    const message = {
      id: Date.now(),
      question: request.prompt,
      mode: scope.mode,
      online: scope.online,
      selectedBases: [...scope.bases],
      selectedTags: [...scope.tags],
      citations: scope.mode === 'rag' ? [{ label: '小红书增长策略' }, { label: 'SaaS 增长复盘' }] : [],
    };
    setConversationScope(scope);
    setHomeChatOpened(true);
    setHomeSurface('chat');
    setHomeMessages((all) => [...all, message]);
  };
  const submitKbQuestion = (question) => {
    const scope = { bases: [base], tags: [], mode: 'rag', online: false };
    setKbMessages((all) => [...all, {
      id: Date.now(),
      question,
      mode: scope.mode,
      online: scope.online,
      selectedBases: scope.bases,
      selectedTags: scope.tags,
      citations: [{ label: '小红书增长策略' }, { label: 'SaaS 增长复盘' }],
    }]);
  };
  const saveAnswerCard = async (payload) => {
    try {
      const card = await createInspirationCard(payload);
      setCards((items) => [card, ...items]);
      say('已保存为灵感卡片。');
    } catch {
      say('保存灵感卡片失败，请稍后重试。');
    }
  };
  const addAnswerToNote = async (payload) => {
    try {
      const note = await createNote({ title: '来自 AI 的回答' });
      const saved = await updateNote(note.id, { content: { text: payload.contentSnapshot, blocks: [], sections: [] } });
      setNotes((items) => [saved, ...items]);
      say('回答已加入笔记。');
    } catch {
      say('添加笔记失败，请稍后重试。');
    }
  };
  const createIngestedMaterialStub = async (item) => {
    if (!selectedKnowledgeBase) {
      const error = new Error('请先选择一个知识库');
      say(error.message);
      throw error;
    }
    let materialId = item.materialId;
    try {
      if (materialId) {
        const parsed = await parseAndPollMaterial(materialId);
        const refreshed = await listMaterials(selectedKnowledgeBase.id, {
          query,
          platform: platformCodes[source] || 'all',
        });
        setKnowledgeMaterials(refreshed);
        return { ...parsed, id: materialId };
      }
      const inputType = item.kind === 'link' ? 'link' : inferMaterialInputType(item.file);
      const storageObjectKey = item.file
        ? await uploadMaterialFile(session.user.id, item.file)
        : undefined;
      const created = await createMaterialStub({
        knowledgeBaseId: selectedKnowledgeBase.id,
        inputType,
        sourceUrl: item.url,
        title: item.title,
        storageObjectKey,
        fileMimeType: item.file?.type,
        fileSizeBytes: item.file?.size,
      });
      materialId = created.id;
      setKnowledgeMaterials((items) => [created, ...items]);
      const parsed = await parseAndPollMaterial(materialId);
      const refreshed = await listMaterials(selectedKnowledgeBase.id, {
        query,
        platform: platformCodes[source] || 'all',
      });
      setKnowledgeMaterials(refreshed);
      return { ...parsed, id: materialId };
    } catch (error) {
      say('添加资料失败，请稍后重试。');
      if (materialId && error && typeof error === 'object') error.materialId = materialId;
      throw error;
    }
  };
  const deleteIngestedMaterial = async (item) => {
    if (!item.materialId) return;
    try {
      await deleteMaterial(item.materialId);
    } catch (error) {
      say('删除资料失败，请稍后重试。');
      throw error;
    } finally {
      if (selectedKnowledgeBase) {
        try {
          const refreshed = await listMaterials(selectedKnowledgeBase.id, {
            query,
            platform: platformCodes[source] || 'all',
          });
          setKnowledgeMaterials(refreshed);
        } catch {
          // The next normal list refresh will reconcile the UI.
        }
      }
    }
  };
  const openMaterialPreview = (item) => {
    window.sessionStorage.setItem(`refind-material:${item.id}`, JSON.stringify(item));
    window.open(getMaterialPreviewUrl(item.id), '_blank', 'noopener,noreferrer');
  };
  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        say('退出登录失败，请稍后重试。');
        return;
      }
      setAccountOpen(false);
    } catch {
      say('退出登录失败，请稍后重试。');
    }
  };
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('删除账号后，所有知识库、资料和笔记将永久删除，且无法恢复。确定要删除吗？');
    if (!confirmed) return;
    try {
      await deleteAccount();
      await signOut();
      setAccountOpen(false);
    } catch {
      say('删除账号失败，请稍后重试。');
    }
  };

  if (session === undefined) {
    return <main className="auth-screen" aria-busy="true">正在恢复登录状态…</main>;
  }
  if (!session) return <AuthScreen />;
  return <main className={`app-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
    <button className="mobile-nav-trigger" type="button" aria-label="打开导航" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}>
      <Menu size={18} strokeWidth={1.85} />
    </button>
    {mobileNavOpen && <button className="mobile-nav-scrim" type="button" aria-label="关闭导航" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`home-sidebar ${mobileNavOpen ? 'is-mobile-open' : ''}`}>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={sidebarCollapsed ? '展开导航' : '收起导航'}
        title={sidebarCollapsed ? '展开导航' : '收起导航'}
        aria-expanded={!sidebarCollapsed}
        onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
      >
        {sidebarCollapsed ? <ChevronRight size={11} strokeWidth={2.4} /> : <ChevronLeft size={11} strokeWidth={2.4} />}
      </button>
      <div>
        <button
          type="button"
          className="home-brand"
          aria-label="回到首页"
          onClick={goHomeHero}
        >
          <img className="brand-logo" src={refindLogo} alt="" />
          <strong>Refind</strong>
          <span className="brand-product">· 拾藏</span>
        </button>
        <nav className="home-nav" aria-label="主导航" data-mobile-open={mobileNavOpen}>
          <NavItem icon={IconHome} label="首页" active={activeNav === '首页'} onClick={goHomeNav} />
          <NavItem icon={NotebookText} label="笔记" active={activeNav === '笔记'} onClick={() => switchNav('笔记')} />
          <NavItem
            icon={IconFolder}
            label="知识库"
            active={activeNav === '知识库'}
            onClick={() => {
              if (sidebarCollapsed && activeNav === '知识库') {
                setKbRailOpen((open) => !open);
                return;
              }
              switchNav('知识库');
              if (sidebarCollapsed) setKbRailOpen(true);
            }}
            trailing={sidebarCollapsed ? null : (
              <span
                className="create-kb-plus-btn"
                role="button"
                tabIndex={0}
                aria-label="新建知识库"
                title="新建知识库"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowCreate(true);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setShowCreate(true);
                }}
              >
                <Plus className="create-kb-plus" size={14} strokeWidth={2.2} aria-hidden="true" />
              </span>
            )}
          />
        </nav>
        {sidebarCollapsed && (
          <div className="sidebar-rail-actions">
            <button type="button" className="rail-action" aria-label="新建知识库" data-rail-label="新建" title="新建知识库" onClick={() => setShowCreate(true)}><Plus size={16} strokeWidth={1.5} /></button>
            {activeNav === '知识库' && (
              <div className="kb-rail-anchor" ref={kbRailRef}>
                <button type="button" className={`rail-action ${kbRailOpen ? 'is-active' : ''}`} aria-label="切换知识库" data-rail-label="切换" title="切换知识库" aria-expanded={kbRailOpen} onClick={() => setKbRailOpen((open) => !open)}><IconKbItem size={16} /></button>
                {kbRailOpen && (
                  <div className="kb-rail-menu" role="menu" aria-label="知识库列表">
                    {bases.map((item) => (
                      <button key={item} type="button" role="menuitem" className={base === item ? 'selected' : ''} onClick={() => { setBase(item); setKbRailOpen(false); }}>
                        <span>{item}</span>
                        {base === item && <Check size={14} strokeWidth={1.5} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <label className="sidebar-search"><Search size={15} strokeWidth={1.5} /><input placeholder="搜索知识库" /></label>
        {activeNav === '知识库' && <div className="kb-sidebar-list">{bases.map((item) => <button key={item} className={base === item ? 'selected' : ''} onClick={() => setBase(item)}><IconKbItem /><span>{item}</span></button>)}</div>}
      </div>
      <div className="profile-anchor" ref={accountRef}>
        <button type="button" className={`profile ${accountOpen ? 'is-active' : ''}`} aria-label="林知夏 个人账号" title="林知夏 个人账号" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><span className="profile-avatar">林</span><span><strong>林知夏</strong><small>个人账号</small></span></button>
        {accountOpen && <div className="account-menu"><button type="button" onClick={() => { setAccountOpen(false); say('设置页面即将提供。'); }}><Settings size={15} />设置</button><button type="button" className="account-logout" onClick={handleSignOut}><LogOut size={15} />退出登录</button><button type="button" className="account-delete" onClick={handleDeleteAccount}>删除账号</button></div>}
      </div>
    </aside>
    {activeNav === '首页' && <section className={`home-canvas ${showHomeChat ? 'has-conversation' : ''} ${showHomeChat && homeHistoryOpen ? 'is-history-open' : ''} ${showHomeChat && !homeHistoryOpen ? 'is-history-collapsed' : ''}`}>
      {!showHomeChat && <div className="hero-block"><div className="robot-hero"><img src="/assets/refind-home-robot.png" alt="" /></div><h1>Welcome, Refind!</h1><p>把散落的收藏，重新捡回来。</p></div>}
      {showHomeChat && (
        <>
          <HomeHistoryCard
            open={homeHistoryOpen}
            onOpenChange={setHomeHistoryOpen}
            onNewChat={() => {
              exitHomeShare();
              setHomeMessages([]);
              setHomeScope(initialHomeScope);
              setConversationScope(null);
              setHomeChatOpened(true);
              setHomeSurface('chat');
              setHomeHistoryOpen(true);
            }}
            activeTitle={homeMessages[0]?.question}
            onPickHistory={(title) => {
              exitHomeShare();
              setHomeMessages([{
                id: `home-history-${Date.now()}`,
                question: title,
                mode: 'rag',
                selectedBases: ['默认知识库'],
                selectedTags: [],
              }]);
              setConversationScope(null);
              setHomeChatOpened(true);
              setHomeSurface('chat');
            }}
          />
          <div className="home-thread">
            <HomeConversation
              messages={homeMessages}
              onSaveCard={saveAnswerCard}
              onAddToNote={addAnswerToNote}
              shareMode={homeShareMode}
              selectedBubbleIds={homeShareSelected}
              onShareStart={startHomeShare}
              onToggleBubble={toggleHomeShareBubble}
            />
            {homeShareMode
              ? <HomeShareBar selectedCount={homeShareSelected.length} onCopyLink={copyHomeShareLink} onCancel={exitHomeShare} />
              : <HomeComposer bases={bases} onSubmit={submitHomeQuestion} scope={homeScope} onScopeChange={setHomeScope} />}
          </div>
        </>
      )}
      {!showHomeChat && <HomeComposer bases={bases} onSubmit={submitHomeQuestion} scope={homeScope} onScopeChange={setHomeScope} />}
      {notice && <Toast text={notice} onClose={() => setNotice('')} />}
    </section>}
    {activeNav === '笔记' && <section className="workspace-canvas notes-canvas"><NotesWorkspace notes={notes} setNotes={setNotes} cards={cards} notebooks={notebooks} notice={say} onDeleteCard={async (cardId) => {
      try {
        await deleteInspirationCard(cardId);
        setCards((items) => items.filter((card) => card.id !== cardId));
        setNotes((items) => items.map((note) => ({
          ...note,
          inspirationCardIds: note.inspirationCardIds.filter((id) => id !== cardId),
          materialThoughts: Object.fromEntries(Object.entries(note.materialThoughts || {}).filter(([id]) => id !== cardId)),
        })));
      } catch {
        say('删除灵感卡片失败，请稍后重试。');
      }
    }} />{notice && <Toast text={notice} onClose={() => setNotice('')} />}</section>}
    {activeNav === '知识库' && <section className="workspace-canvas knowledge-canvas">
      <div className="knowledge-layout">
        <div className="materials-column">
          <header className="workspace-header">
            <div><h1>{base}</h1></div>
            <button className="ai-panel-trigger" type="button" onClick={() => setAiPanelOpen(true)}><MessageSquare size={15} strokeWidth={1.6} />AI 对话</button>
          </header>
          <section className="materials-panel">
            <div className={`material-tools ${isMaterialSearching ? 'is-searching' : ''}`}>
              <div className="material-search"><Search size={14} strokeWidth={1.6} /><input value={query} onFocus={() => setMaterialSearchFocused(true)} onBlur={() => { if (!query) setMaterialSearchFocused(false); }} onChange={(e) => setQuery(e.target.value)} placeholder="搜索资料" />{isMaterialSearching && <button className="material-search-clear" type="button" aria-label="清除搜索" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); setMaterialSearchFocused(false); setFilterOpen(false); }}><X size={14} strokeWidth={1.6} /></button>}</div>
              {!isMaterialSearching && <div className="filter-anchor" ref={filterRef}>
                <button className="filter-trigger" type="button" aria-label="筛选" onClick={() => setFilterOpen((open) => !open)}><SlidersHorizontal size={14} strokeWidth={1.7} /><span>筛选</span></button>
                {filterOpen && <div className="material-filter-popover">
                  <section><strong>按来源</strong>{sourceOptions.map((item) => <button key={item} className={source === item ? 'selected' : ''} onClick={() => { setSource(item); setFilterOpen(false); }}><span>{item}</span>{source === item && <Check size={13} strokeWidth={1.6} />}</button>)}</section>
                  <section><strong>按时间 / 标题</strong>{sortOptions.map((item) => <button key={item} className={sort === item ? 'selected' : ''} onClick={() => { setSort(item); setFilterOpen(false); }}><span>{item}</span>{sort === item && <Check size={13} strokeWidth={1.6} />}</button>)}</section>
                </div>}
              </div>}
              {!isMaterialSearching && <MaterialIngest base={base} onCreateStub={createIngestedMaterialStub} onDelete={deleteIngestedMaterial} />}
            </div>
            <div className="material-list">{visibleMaterials.map((item) => <article className="material-row" key={item.id}>
              <button
                type="button"
                className="material-row-button"
                aria-label={item.fileName || item.title}
                onClick={() => openMaterialPreview(item)}
                onMouseEnter={() => setHoveredMaterialId(item.id)}
                onMouseLeave={() => setHoveredMaterialId(null)}
                onFocus={() => setHoveredMaterialId(item.id)}
                onBlur={() => setHoveredMaterialId(null)}
              >
                <div className="material-mark"><IconMaterial /></div><div><h3>{item.title}</h3><p><span>{item.source}</span> · #{item.tag}{item.status === 'processing' && <><span> · </span><span>处理中</span></>}</p></div><time>{item.time}</time>
              </button>
              {hoveredMaterialId === item.id && <aside className="material-hover-card" role="tooltip">
                <strong>{item.fileName || item.title}</strong>
                <span>AI 解析摘要</span>
                <p>{item.summary}</p>
              </aside>}
            </article>)}{!visibleMaterials.length && <p className="empty-inline">没有匹配的资料。</p>}</div>
          </section>
        </div>
        {aiPanelOpen && <button className="ai-panel-scrim" type="button" aria-label="关闭 AI 对话遮罩" onClick={() => { setAiPanelOpen(false); setHistoryOpen(false); }} />}
        <aside className={`ai-panel ${aiPanelOpen ? 'is-open' : ''} ${kbShareMode ? 'is-share-mode' : ''}`} data-open={aiPanelOpen ? 'true' : 'false'}>
          <div className="ai-panel-head" ref={historyRef}>
            <h2>AI 对话</h2>
            <div>
              <button type="button" title="新建会话" aria-label="新建会话" onClick={() => { exitKbShare(); setKbMessages([]); setHistoryOpen(false); }}><Plus size={15} strokeWidth={1.5} /></button>
              <div className="ai-history-anchor">
                <button type="button" title="会话历史" aria-label="会话历史" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}><Clock3 size={15} strokeWidth={1.5} /></button>
                {historyOpen && (
                  <div className="history-popover" role="menu" aria-label="会话历史">
                    <strong>会话历史</strong>
                    <button type="button" role="menuitem" onClick={() => { exitKbShare(); setKbMessages([]); setHistoryOpen(false); }}>小红书增长策略</button>
                    <button type="button" role="menuitem" onClick={() => { exitKbShare(); setKbMessages([]); setHistoryOpen(false); }}>会员活动设计</button>
                  </div>
                )}
              </div>
              <button className="ai-panel-close" type="button" aria-label="关闭 AI 对话" onClick={() => { exitKbShare(); setAiPanelOpen(false); setHistoryOpen(false); }}><X size={15} strokeWidth={1.5} /></button>
            </div>
          </div>
          <div className={`ai-stream ${kbMessages.length ? 'has-messages' : ''}`}>
            {kbMessages.length === 0
              ? <div className="ai-empty"><KnowledgeAnswerMark /><h3>从你的资料里找答案</h3></div>
              : (
                <KbConversation
                  messages={kbMessages}
                  onSaveCard={saveAnswerCard}
                  onAddToNote={addAnswerToNote}
                  shareMode={kbShareMode}
                  selectedBubbleIds={kbShareSelected}
                  onShareStart={startKbShare}
                  onToggleBubble={toggleKbShareBubble}
                />
              )}
          </div>
          {kbShareMode
            ? <HomeShareBar selectedCount={kbShareSelected.length} onCopyLink={copyKbShareLink} onCancel={exitKbShare} />
            : <Composer compact base={base} bases={bases} onBase={setBase} onSubmit={submitKbQuestion} />}
        </aside>
      </div>{notice && <Toast text={notice} onClose={() => setNotice('')} />}
    </section>}
    {showCreate && <div className="modal-layer"><form className="create-modal" onSubmit={createBase}><button className="modal-close" type="button" onClick={() => setShowCreate(false)}><X size={17} /></button><Sparkles size={22} /><h2>新建知识库</h2><p>创建一个主题空间，用来归集和提问。</p><label>知识库名称<input value={newBase} autoFocus onChange={(event) => setNewBase(event.target.value)} placeholder="例如：产品与设计资料" /></label><div><button type="button" onClick={() => setShowCreate(false)}>取消</button><button type="submit">创建</button></div></form></div>}
  </main>;
}
