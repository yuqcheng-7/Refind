import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Hash, Link2, LogOut, Menu, MessageSquare, NotebookText, Plus, Search, Settings, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import refindLogo from '/Users/zoecheng/Downloads/ChatGPT Image Sep 12, 2026, 10_56_22 AM.png';
import './styles.css';
import { NotesWorkspace } from './features/notes/NotesWorkspace.jsx';
import { HomeComposer, defaultHomeScope } from './features/home/HomeComposer.jsx';
import { HomeConversation, HomeShareBar } from './features/home/HomeConversation.jsx';
import { KbConversation } from './features/knowledge/KbConversation.jsx';
import { HomeHistoryCard } from './features/home/HomeHistoryCard.jsx';
import { MaterialIngest } from './features/knowledge/MaterialIngest.jsx';
import { EditMaterialTagsDialog } from './features/knowledge/EditMaterialTagsDialog.jsx';
import { MoveMaterialDialog } from './features/knowledge/MoveMaterialDialog.jsx';
import { SettingsPage } from './features/settings/SettingsPage.jsx';
import { getMaterialPreviewUrl } from './features/knowledge/materialDemo.js';
import { useDismissable } from './hooks/useDismissable.js';
import { AuthScreen } from './features/auth/AuthScreen.jsx';
import { deleteAccount, getSession, signOut } from './lib/api/auth.js';
import { createKnowledgeBase, filterKnowledgeBaseNames, listKnowledgeBases } from './lib/api/knowledge.js';
import { createMaterialStub, deleteMaterial, getMaterialById, listMaterials, listMaterialTags, moveMaterial, replaceMaterialTags, formatMaterialTitle, formatMaterialTypeLabel, inferPlatformFromUrl } from './lib/api/materials.js';
import { resolveTagFilterIds } from './lib/api/tagFilters.js';
import { isHttpUrlLike } from './lib/extractUrlFromPaste.js';
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
import { getMyProfile, resolveDisplayName } from './lib/api/profiles.js';
import { sendChatMessage } from './lib/api/chat.js';
import { resolveChatSurface } from './lib/api/ragMode.js';
import {
  createConversation,
  deleteConversation,
  groupConversationsByDay,
  isPlaceholderTitle,
  listConversations,
  loadConversationTurns,
  renameConversation,
} from './lib/api/conversations.js';
import { supabase } from './lib/supabaseClient.js';

const homeChatEmptyPrompt = '有什么想聊的？直接提问，或在输入框里选择知识库。';
const kbChatEmptyTitle = '从你的资料里找答案';
const kbChatEmptyHint = '输入问题后，回答会引用知识库里的具体片段。';

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

function NavItem({ icon: Icon, label, active, onClick, onMouseEnter, onMouseLeave, className = '', trailing }) {
  return (
    <button
      className={`nav-item ${active ? 'is-active' : ''} ${className}`.trim()}
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      type="button"
    >
      <Icon size={18} strokeWidth={active ? 1.7 : 1.45} />
      <span>{label}</span>
      {trailing}
    </button>
  );
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
function Composer({ base, bases, availableTags = [], onBase, onSubmit, compact = false }) {
  const [prompt, setPrompt] = useState('');
  const [menu, setMenu] = useState(false);
  const [thinkingMode, setThinkingMode] = useState('fast');
  const [modelMenu, setModelMenu] = useState(false);
  const [tagMenu, setTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const baseMenuRef = useRef(null);
  const modelMenuRef = useRef(null);
  const tagMenuRef = useRef(null);
  const tagNames = availableTags.map((tag) => tag.name);
  const filteredTags = tagNames.filter((item) => !tagQuery || item.includes(tagQuery));
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
    setSelectedTags((current) => (
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    ));
    setTagMenu(false);
    setTagQuery('');
  };
  useDismissable({ open: menu, onClose: () => setMenu(false), rootRef: baseMenuRef });
  useDismissable({ open: modelMenu, onClose: () => setModelMenu(false), rootRef: modelMenuRef });
  useDismissable({ open: tagMenu, onClose: () => setTagMenu(false), rootRef: tagMenuRef });
  const send = (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    onSubmit({ prompt, thinkingMode, selectedTags: [...selectedTags] });
    setPrompt('');
    setSelectedTags([]);
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
          {filteredTags.length ? filteredTags.map((item) => (
            <button key={item} type="button" role="option" onClick={() => insertTag(item)}>
              <span>#{item}</span>
              {selectedTags.includes(item) && <Check size={15} />}
            </button>
          )) : (
            <div className="composer-tag-suggest__empty">暂无标签</div>
          )}
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
  const [kbQuery, setKbQuery] = useState('');
  const [materialSearchFocused, setMaterialSearchFocused] = useState(false);
  const [source, setSource] = useState('全部来源');
  const [sort, setSort] = useState('从新到旧');
  const [filterOpen, setFilterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [homeHistoryOpen, setHomeHistoryOpen] = useState(true);
  const [kbHistoryMenu, setKbHistoryMenu] = useState(null);
  const [kbRenameDraft, setKbRenameDraft] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('platforms');
  const [settingsFocusPlatform, setSettingsFocusPlatform] = useState('');
  const [profile, setProfile] = useState(null);
  const filterRef = useRef(null);
  const historyRef = useRef(null);
  const accountRef = useRef(null);
  const kbRailRef = useRef(null);
  const kbHistoryMenuRef = useRef(null);
  const [homeMessages, setHomeMessages] = useState([]);
  const [homeConversationId, setHomeConversationId] = useState(null);
  const [homeThreadSurface, setHomeThreadSurface] = useState('home');
  const [homeThreadKnowledgeBaseId, setHomeThreadKnowledgeBaseId] = useState(null);
  const [homeConversations, setHomeConversations] = useState([]);
  const [homeSurface, setHomeSurface] = useState('hero');
  const [homeChatOpened, setHomeChatOpened] = useState(false);
  const [homeNavUnlocked, setHomeNavUnlocked] = useState(false);
  const [homeShareMode, setHomeShareMode] = useState(false);
  const [homeShareSelected, setHomeShareSelected] = useState([]);
  const [kbShareMode, setKbShareMode] = useState(false);
  const [kbShareSelected, setKbShareSelected] = useState([]);
  const [kbMessages, setKbMessages] = useState([]);
  const [kbConversationId, setKbConversationId] = useState(null);
  const [kbConversations, setKbConversations] = useState([]);
  const [homeScope, setHomeScope] = useState(initialHomeScope);
  const [conversationScope, setConversationScope] = useState(null);
  useEffect(() => {
    if (!homeScope.selectedBases.length && !homeScope.selectedTags.length) {
      setConversationScope(null);
    }
  }, [homeScope.selectedBases, homeScope.selectedTags]);
  const [knowledgeMaterials, setKnowledgeMaterials] = useState([]);
  const [homeTagOptions, setHomeTagOptions] = useState([]);
  const [kbTagOptions, setKbTagOptions] = useState([]);
  const [hoveredMaterialId, setHoveredMaterialId] = useState(null);
  const [materialMenu, setMaterialMenu] = useState(null);
  const [editTagsMaterial, setEditTagsMaterial] = useState(null);
  const [editTagsSaving, setEditTagsSaving] = useState(false);
  const [moveMaterialTarget, setMoveMaterialTarget] = useState(null);
  const materialMenuRef = useRef(null);
  const bases = useMemo(() => knowledgeBases.map((item) => item.name), [knowledgeBases]);
  const visibleBases = useMemo(() => filterKnowledgeBaseNames(bases, kbQuery), [bases, kbQuery]);
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
      setProfile(null);
      return undefined;
    }
    let active = true;
    getMyProfile()
      .then((item) => {
        if (active) setProfile(item);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => { active = false; };
  }, [session]);
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
  const refreshHomeConversations = async () => {
    if (!session) {
      setHomeConversations([]);
      return;
    }
    try {
      const items = await listConversations({ surface: 'home' });
      setHomeConversations(items);
    } catch {
      setHomeConversations([]);
    }
  };
  const refreshKbConversations = async () => {
    if (!session || !selectedKnowledgeBase) {
      setKbConversations([]);
      return;
    }
    try {
      const items = await listConversations({
        surface: 'knowledge',
        knowledgeBaseId: selectedKnowledgeBase.id,
      });
      setKbConversations(items);
    } catch {
      setKbConversations([]);
    }
  };
  useEffect(() => {
    refreshHomeConversations();
  }, [session]);
  useEffect(() => {
    refreshKbConversations();
  }, [session, selectedKnowledgeBase?.id]);
  useEffect(() => {
    setKbShareMode(false);
    setKbShareSelected([]);
    setKbConversationId(null);
    setKbMessages([]);
    setHistoryOpen(false);
    setKbHistoryMenu(null);
    setKbRenameDraft(null);
  }, [selectedKnowledgeBase?.id]);
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
  useEffect(() => {
    if (!session) {
      setHomeTagOptions([]);
      return undefined;
    }
    let active = true;
    listMaterialTags()
      .then((tags) => { if (active) setHomeTagOptions(tags); })
      .catch(() => { if (active) setHomeTagOptions([]); });
    return () => { active = false; };
  }, [session, knowledgeMaterials]);
  useEffect(() => {
    if (!selectedKnowledgeBase?.id) {
      setKbTagOptions([]);
      return undefined;
    }
    let active = true;
    listMaterialTags({ knowledgeBaseId: selectedKnowledgeBase.id })
      .then((tags) => { if (active) setKbTagOptions(tags); })
      .catch(() => { if (active) setKbTagOptions([]); });
    return () => { active = false; };
  }, [selectedKnowledgeBase?.id, knowledgeMaterials]);
  useDismissable({ open: filterOpen, onClose: () => setFilterOpen(false), rootRef: filterRef });
  useDismissable({
    open: historyOpen && !kbHistoryMenu,
    onClose: () => setHistoryOpen(false),
    rootRef: historyRef,
  });
  useDismissable({ open: accountOpen, onClose: () => setAccountOpen(false), rootRef: accountRef });
  useDismissable({ open: kbRailOpen, onClose: () => setKbRailOpen(false), rootRef: kbRailRef });
  useDismissable({ open: Boolean(materialMenu), onClose: () => setMaterialMenu(null), rootRef: materialMenuRef });
  useDismissable({ open: Boolean(kbHistoryMenu), onClose: () => setKbHistoryMenu(null), rootRef: kbHistoryMenuRef });
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
  // History list is the source of truth for “有历史会话”.
  const hasHomeChatHistory = homeConversations.length > 0;
  const homeNavHoverReady = homeNavUnlocked;
  const homeNavActive = activeNav === '首页' && homeNavUnlocked && homeSurface === 'chat';
  const suppressHomeNavHoverRef = useRef(false);
  const openHomeChatSurface = () => {
    if (!homeNavHoverReady || !hasHomeChatHistory) return;
    if (suppressHomeNavHoverRef.current) return;
    setHomeSurface('chat');
    setHomeHistoryOpen(true);
  };
  const restoreLatestHomeConversation = async () => {
    if (homeMessages.length > 0) return;
    const latestId = homeConversationId || homeConversations[0]?.id;
    if (!latestId) return;
    setHomeConversationId(latestId);
    setHomeThreadSurface('home');
    setHomeThreadKnowledgeBaseId(null);
    try {
      const turns = await loadConversationTurns(latestId);
      setHomeMessages(turns);
    } catch {
      // Keep empty chat shell; user can pick a history item.
    }
  };
  const switchNav = (view) => {
    if (view !== '首页') exitHomeShare();
    if (view !== '知识库') exitKbShare();
    setSettingsOpen(false);
    setSettingsFocusPlatform('');
    setActiveNav(view);
    setMobileNavOpen(false);
    setAiPanelOpen(false);
    setKbRailOpen(false);
    setNotice('');
  };
  const firstKnowledgeBaseName = () => (
    knowledgeBases.find((item) => item.type === 'default')?.name
    || bases[0]
    || ''
  );
  const openKnowledgeBase = (name) => {
    const next = name || firstKnowledgeBaseName();
    if (next) setBase(next);
    switchNav('知识库');
  };
  const startNewHomeChat = async () => {
    exitHomeShare();
    setHomeScope(initialHomeScope);
    setConversationScope(null);
    setHomeThreadSurface('home');
    setHomeThreadKnowledgeBaseId(null);
    setHomeChatOpened(true);
    setHomeNavUnlocked(true);
    setHomeSurface('chat');
    setHomeHistoryOpen(true);

    const active = homeConversations.find((item) => item.id === homeConversationId);
    if (
      homeConversationId
      && homeMessages.length === 0
      && active
      && isPlaceholderTitle(active.title)
    ) {
      setHomeMessages([]);
      return;
    }

    setHomeMessages([]);
    try {
      const created = await createConversation({ surface: 'home' });
      setHomeConversationId(created.id);
      setHomeConversations((items) => [created, ...items.filter((item) => item.id !== created.id)]);
    } catch {
      setHomeConversationId(null);
      say('创建会话失败，请稍后重试。');
    }
  };
  const openHomeConversation = async (conversationId) => {
    exitHomeShare();
    setHomeConversationId(conversationId);
    setHomeThreadSurface('home');
    setHomeThreadKnowledgeBaseId(null);
    setHomeChatOpened(true);
    setHomeNavUnlocked(true);
    setHomeSurface('chat');
    setConversationScope(null);
    try {
      const turns = await loadConversationTurns(conversationId);
      setHomeMessages(turns);
    } catch {
      say('会话加载失败，请稍后重试。');
      setHomeMessages([]);
    }
  };
  const startNewKbChat = async () => {
    exitKbShare();
    setHistoryOpen(false);
    if (!selectedKnowledgeBase) {
      setKbConversationId(null);
      setKbMessages([]);
      say('请先选择一个知识库。');
      return;
    }

    const active = kbConversations.find((item) => item.id === kbConversationId);
    if (
      kbConversationId
      && kbMessages.length === 0
      && active
      && isPlaceholderTitle(active.title)
    ) {
      setKbMessages([]);
      return;
    }

    setKbMessages([]);
    try {
      const created = await createConversation({
        surface: 'knowledge',
        knowledgeBaseId: selectedKnowledgeBase.id,
      });
      setKbConversationId(created.id);
      setKbConversations((items) => [created, ...items.filter((item) => item.id !== created.id)]);
    } catch {
      setKbConversationId(null);
      say('创建会话失败，请稍后重试。');
    }
  };
  const openKbConversation = async (conversationId) => {
    exitKbShare();
    setKbConversationId(conversationId);
    setHistoryOpen(false);
    try {
      const turns = await loadConversationTurns(conversationId);
      setKbMessages(turns);
    } catch {
      say('会话加载失败，请稍后重试。');
      setKbMessages([]);
    }
  };
  const renameHomeConversation = async (conversationId, title) => {
    try {
      const updated = await renameConversation(conversationId, title);
      setHomeConversations((items) => items.map((item) => (
        item.id === conversationId ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item
      )));
      say('会话已重命名。');
    } catch {
      say('重命名失败，请稍后重试。');
    }
  };
  const deleteHomeConversation = async (conversationId) => {
    try {
      await deleteConversation(conversationId);
      setHomeConversations((items) => items.filter((item) => item.id !== conversationId));
      if (homeConversationId === conversationId) startNewHomeChat();
      say('会话已删除。');
    } catch {
      say('删除失败，请稍后重试。');
    }
  };
  const renameKbConversation = async (conversationId, title) => {
    try {
      const updated = await renameConversation(conversationId, title);
      setKbConversations((items) => items.map((item) => (
        item.id === conversationId ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item
      )));
      say('会话已重命名。');
    } catch {
      say('重命名失败，请稍后重试。');
    }
  };
  const deleteKbConversation = async (conversationId) => {
    try {
      await deleteConversation(conversationId);
      setKbConversations((items) => items.filter((item) => item.id !== conversationId));
      if (kbConversationId === conversationId) startNewKbChat();
      say('会话已删除。');
    } catch {
      say('删除失败，请稍后重试。');
    }
  };
  const submitKbRename = async () => {
    if (!kbRenameDraft) return;
    const draft = kbRenameDraft;
    const title = draft.title.trim();
    const original = kbConversations.find((item) => item.id === draft.id);
    setKbRenameDraft(null);
    if (!title || (original && title === original.title)) return;
    await renameKbConversation(draft.id, title);
  };
  const goHomeHero = () => {
    exitHomeShare();
    // Keep Home hover suppressed so moving off the logo onto「首页」
    // doesn't immediately bounce back into the AI chat shell.
    suppressHomeNavHoverRef.current = true;
    switchNav('首页');
    setHomeSurface('hero');
    setHomeHistoryOpen(true);
  };
  const goHomeNav = () => {
    switchNav('首页');
    setHomeNavUnlocked(true);
    // Suppress the hover that accompanies this click so the AI shell doesn't flash.
    suppressHomeNavHoverRef.current = true;
    // Click「首页」: history → AI area; no history → stay on hero.
    if (hasHomeChatHistory) {
      setHomeSurface('chat');
      setHomeHistoryOpen(true);
      restoreLatestHomeConversation();
    } else {
      setHomeSurface('hero');
      setHomeHistoryOpen(true);
    }
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
      switchNav('知识库');
      say(`已创建知识库「${created.name}」。`);
    } catch {
      say('创建知识库失败，请稍后重试。');
    }
  };
  const submitHomeQuestion = async (request) => {
    const scope = conversationScope || {
      bases: request.selectedBases,
      tags: request.selectedTags,
      mode: request.mode,
      online: request.online,
    };
    const pendingId = `pending-home-${Date.now()}-${crypto.randomUUID()}`;
    const pendingMessage = {
      id: pendingId,
      question: request.prompt,
      mode: scope.mode,
      online: scope.online,
      selectedBases: [...scope.bases],
      selectedTags: [...scope.tags],
      citations: [],
    };
    setConversationScope(scope);
    setHomeChatOpened(true);
    setHomeNavUnlocked(true);
    setHomeSurface('chat');
    setHomeMessages((all) => [...all, pendingMessage]);
    try {
      const selectedBaseNames = new Set(scope.bases);
      let knowledgeBaseIds = knowledgeBases
        .filter((item) => selectedBaseNames.has(item.name))
        .map((item) => item.id);
      const surface = resolveChatSurface({
        knowledgeBaseIds,
        preferredSurface: homeConversationId && homeMessages.length > 0
          ? homeThreadSurface
          : undefined,
      });
      if (surface === 'knowledge' && !knowledgeBaseIds.length && homeThreadKnowledgeBaseId) {
        knowledgeBaseIds = [homeThreadKnowledgeBaseId];
      }
      const message = await sendChatMessage({
        content: request.prompt,
        thinkingMode: request.thinkingMode || 'fast',
        onlineEnabled: scope.online,
        knowledgeBaseIds,
        tagFilters: resolveTagFilterIds(scope.tags, homeTagOptions),
        surface,
        conversationId: homeConversationId,
        selectedBases: scope.bases,
        selectedTags: scope.tags,
      });
      setHomeMessages((all) => all.map((item) => item.id === pendingId ? message : item));
      if (message.conversationId) setHomeConversationId(message.conversationId);
      setHomeThreadSurface(surface);
      setHomeThreadKnowledgeBaseId(surface === 'knowledge' ? (knowledgeBaseIds[0] || null) : null);
      await refreshHomeConversations();
      await refreshKbConversations();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'AI 回答生成失败，请稍后重试。';
      setHomeMessages((all) => all.map((item) => (
        item.id === pendingId
          ? { ...item, answer: detail, failed: true, citations: [] }
          : item
      )));
      say(detail);
    }
  };
  const submitKbQuestion = async (request) => {
    const question = typeof request === 'string' ? request : request.prompt;
    const thinkingMode = typeof request === 'string' ? 'fast' : request.thinkingMode;
    const selectedTags = typeof request === 'string' ? [] : (request.selectedTags || []);
    const scope = { bases: [base], tags: selectedTags, mode: 'rag', online: false };
    const pendingId = `pending-kb-${Date.now()}-${crypto.randomUUID()}`;
    const pendingMessage = {
      id: pendingId,
      question,
      mode: scope.mode,
      online: scope.online,
      selectedBases: scope.bases,
      selectedTags: [...scope.tags],
      citations: [],
    };
    setKbMessages((all) => [...all, pendingMessage]);
    try {
      const message = await sendChatMessage({
        content: question,
        thinkingMode: thinkingMode || 'fast',
        onlineEnabled: false,
        knowledgeBaseIds: selectedKnowledgeBase ? [selectedKnowledgeBase.id] : [],
        tagFilters: resolveTagFilterIds(selectedTags, kbTagOptions),
        surface: 'knowledge',
        conversationId: kbConversationId,
        selectedBases: scope.bases,
        selectedTags,
      });
      setKbMessages((all) => all.map((item) => item.id === pendingId ? message : item));
      if (message.conversationId) setKbConversationId(message.conversationId);
      refreshKbConversations();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'AI 回答生成失败，请稍后重试。';
      setKbMessages((all) => all.map((item) => (
        item.id === pendingId
          ? { ...item, answer: detail, failed: true, citations: [] }
          : item
      )));
      say(detail);
    }
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
  const refreshMaterials = async () => {
    if (!selectedKnowledgeBase) return [];
    const refreshed = await listMaterials(selectedKnowledgeBase.id, {
      query,
      platform: platformCodes[source] || 'all',
    });
    setKnowledgeMaterials(refreshed);
    return refreshed;
  };
  const createIngestedMaterialStub = async (item) => {
    if (!selectedKnowledgeBase) {
      const error = new Error('请先选择一个知识库');
      say(error.message);
      throw error;
    }
    let materialId = item.materialId;
    const tempId = materialId || `pending-${crypto.randomUUID()}`;
    if (!materialId) {
      const inputType = item.kind === 'link' ? 'link' : inferMaterialInputType(item.file);
      const platformCode = item.kind === 'link' ? inferPlatformFromUrl(item.url) : 'web';
      const displayTitle = item.kind === 'link'
        ? formatMaterialTitle({
          title: item.title,
          source_url: item.url,
          platform_code: platformCode,
          input_type: 'link',
        })
        : item.title;
      const optimistic = {
        id: tempId,
        knowledgeBaseId: selectedKnowledgeBase.id,
        kind: item.kind === 'link' ? 'link' : 'file',
        inputType,
        url: item.url,
        fileName: item.kind === 'file' ? item.title : undefined,
        title: displayTitle,
        source: formatMaterialTypeLabel({ input_type: inputType, platform_code: platformCode }),
        platform: platformCode,
        tag: '',
        tags: [],
        time: '刚刚',
        summary: '',
        body: '',
        status: 'processing',
        statusLabel: '处理中',
        lastParseError: '',
      };
      setKnowledgeMaterials((items) => [optimistic, ...items.filter((entry) => entry.id !== tempId)]);
    }
    try {
      if (materialId) {
        await parseAndPollMaterial(materialId, { force: true, sourceUrl: item.url });
        const refreshed = await refreshMaterials();
        return refreshed.find((material) => material.id === materialId) || { id: materialId, status: 'failed' };
      }
      const inputType = item.kind === 'link' ? 'link' : inferMaterialInputType(item.file);
      const storageObjectKey = item.file
        ? await uploadMaterialFile(session.user.id, item.file)
        : undefined;
      const created = await createMaterialStub({
        knowledgeBaseId: selectedKnowledgeBase.id,
        inputType,
        sourceUrl: item.url,
        title: item.kind === 'link' && isHttpUrlLike(item.title) ? '' : item.title,
        storageObjectKey,
        fileMimeType: item.file?.type,
        fileSizeBytes: item.file?.size,
      });
      materialId = created.id;
      setKnowledgeMaterials((items) => [created, ...items.filter((entry) => entry.id !== tempId && entry.id !== created.id)]);
      await parseAndPollMaterial(materialId, { sourceUrl: item.url });
      const refreshed = await refreshMaterials();
      return refreshed.find((material) => material.id === materialId) || created;
    } catch (error) {
      say(error?.message || '添加资料失败，请稍后重试。');
      if (materialId) {
        try {
          await refreshMaterials();
        } catch {
          // The next normal list refresh will reconcile the UI.
        }
        if (error && typeof error === 'object') error.materialId = materialId;
      } else {
        setKnowledgeMaterials((items) => items.filter((entry) => entry.id !== tempId));
      }
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
      try {
        await refreshMaterials();
      } catch {
        // The next normal list refresh will reconcile the UI.
      }
    }
  };
  const openMaterialPreview = async (item) => {
    window.sessionStorage.setItem(`refind-material:${item.id}`, JSON.stringify(item));
    window.open(getMaterialPreviewUrl(item.id), '_blank', 'noopener,noreferrer');
    try {
      const latest = await getMaterialById(item.id);
      if (latest) {
        window.sessionStorage.setItem(`refind-material:${item.id}`, JSON.stringify(latest));
      }
    } catch {
      // Preview page will fetch from API on its own.
    }
  };
  const reparseMaterial = async (material) => {
    setMaterialMenu(null);
    try {
      await parseAndPollMaterial(material.id, {
        force: true,
        sourceUrl: material.url || '',
      });
      await refreshMaterials();
      say('已重新解析。');
    } catch (error) {
      say(error instanceof Error ? error.message : '重新解析失败，请稍后重试。');
    }
  };
  const saveMaterialTags = async (tags) => {
    if (!editTagsMaterial) return;
    setEditTagsSaving(true);
    try {
      await replaceMaterialTags(editTagsMaterial.id, tags);
      await refreshMaterials();
      setEditTagsMaterial(null);
      say('标签已更新。');
    } catch {
      say('更新标签失败，请稍后重试。');
    } finally {
      setEditTagsSaving(false);
    }
  };
  const moveMaterialToBase = async (material, targetBase) => {
    try {
      await moveMaterial(material.id, targetBase.id);
      await refreshMaterials();
      setMoveMaterialTarget(null);
      say(`已移动到「${targetBase.name}」。`);
    } catch {
      say('移动资料失败，请稍后重试。');
    }
  };
  const deleteListedMaterial = async (material) => {
    const confirmed = window.confirm(`确定删除「${material.title}」吗？`);
    if (!confirmed) return;
    setMaterialMenu(null);
    setKnowledgeMaterials((items) => items.filter((item) => item.id !== material.id));
    try {
      await deleteMaterial(material.id);
      say('资料已删除。');
    } catch {
      try {
        await refreshMaterials();
      } catch {
        // Keep optimistic removal; next navigation will reconcile.
      }
      say('删除资料失败，请稍后重试。');
    }
  };
  const openSettings = ({ tab = 'platforms', focusPlatform = '' } = {}) => {
    setSettingsTab(tab);
    setSettingsFocusPlatform(focusPlatform || '');
    setSettingsOpen(true);
    setAccountOpen(false);
    setMobileNavOpen(false);
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

  const displayName = resolveDisplayName(profile, session);
  const avatarLabel = displayName.slice(0, 1) || '用';
  const accountLabel = `${displayName} 个人账号`;

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
      <div className="sidebar-main">
        <button
          type="button"
          className="home-brand"
          aria-label="回到英雄区"
          onClick={goHomeHero}
          onMouseLeave={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Element && next.closest?.('.nav-item[aria-label="首页"]')) return;
            suppressHomeNavHoverRef.current = false;
          }}
        >
          <img className="brand-logo" src={refindLogo} alt="" />
          <strong>Refind</strong>
          <span className="brand-product">· 拾藏</span>
        </button>
        <nav className="home-nav" aria-label="主导航" data-mobile-open={mobileNavOpen}>
          <NavItem
            icon={IconHome}
            label="首页"
            active={homeNavActive}
            className={homeNavHoverReady ? '' : 'is-hover-locked'}
            onClick={goHomeNav}
            onMouseEnter={() => {
              if (!homeNavHoverReady) return;
              if (suppressHomeNavHoverRef.current) return;
              if (activeNav === '首页' && homeSurface === 'hero') openHomeChatSurface();
            }}
            onMouseLeave={() => {
              suppressHomeNavHoverRef.current = false;
            }}
          />
          <NavItem
            icon={NotebookText}
            label="笔记"
            active={activeNav === '笔记'}
            onClick={() => switchNav('笔记')}
            onMouseEnter={() => { suppressHomeNavHoverRef.current = false; }}
          />
          <NavItem
            icon={IconFolder}
            label="知识库"
            active={activeNav === '知识库'}
            onClick={() => {
              if (sidebarCollapsed && activeNav === '知识库') {
                setKbRailOpen((open) => !open);
                return;
              }
              openKnowledgeBase(firstKnowledgeBaseName());
              if (sidebarCollapsed) setKbRailOpen(true);
            }}
            trailing={sidebarCollapsed ? null : (
              <span
                className="create-kb-plus-btn"
                role="button"
                tabIndex={0}
                aria-label="新建知识库"
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
            <div className="kb-rail-anchor" ref={kbRailRef}>
              <button type="button" className={`rail-action ${kbRailOpen ? 'is-active' : ''}`} aria-label="切换知识库" data-rail-label="切换" title="切换知识库" aria-expanded={kbRailOpen} onClick={() => setKbRailOpen((open) => !open)}><IconKbItem size={16} /></button>
              {kbRailOpen && (
                <div className="kb-rail-menu" role="menu" aria-label="知识库列表">
                  {visibleBases.map((item) => (
                    <button key={item} type="button" role="menuitem" className={activeNav === '知识库' && base === item ? 'selected' : ''} onClick={() => { openKnowledgeBase(item); setKbRailOpen(false); }}>
                      <span>{item}</span>
                      {activeNav === '知识库' && base === item && <Check size={14} strokeWidth={1.5} />}
                    </button>
                  ))}
                  {!visibleBases.length && (
                    <div className="kb-sidebar-empty" role="status">
                      {kbQuery.trim() ? <p>未找到符合条件的知识库</p> : <p>暂无知识库</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <label className="sidebar-search"><Search size={15} strokeWidth={1.5} /><input aria-label="搜索知识库" placeholder="搜索知识库" value={kbQuery} onChange={(event) => setKbQuery(event.target.value)} /></label>
        <div className="kb-sidebar-list">
          {visibleBases.map((item) => (
            <button key={item} className={activeNav === '知识库' && base === item ? 'selected' : ''} onClick={() => openKnowledgeBase(item)}>
              <IconKbItem /><span>{item}</span>
            </button>
          ))}
          {!visibleBases.length && (
            <div className="kb-sidebar-empty" role="status">
              {kbQuery.trim() ? (
                <p>未找到符合条件的知识库</p>
              ) : (
                <>
                  <p>暂无知识库</p>
                  <p>点击上方「+」创建</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="profile-anchor" ref={accountRef}>
        <button type="button" className={`profile ${accountOpen ? 'is-active' : ''}`} aria-label={accountLabel} title={accountLabel} aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><span className="profile-avatar">{avatarLabel}</span><span><strong>{displayName}</strong><small>个人账号</small></span></button>
        {accountOpen && <div className="account-menu"><button type="button" onClick={() => openSettings({ tab: 'platforms' })}><Settings size={15} />设置</button><button type="button" className="account-logout" onClick={handleSignOut}><LogOut size={15} />退出登录</button></div>}
      </div>
    </aside>
    {settingsOpen && (
      <section className="workspace-canvas settings-canvas">
        <SettingsPage
          email={session?.user?.email || ''}
          displayName={displayName}
          initialTab={settingsTab}
          focusPlatform={settingsFocusPlatform}
          onBack={() => {
            setSettingsOpen(false);
            setSettingsFocusPlatform('');
          }}
          onSignOut={handleSignOut}
          onDeleteAccount={handleDeleteAccount}
          onDisplayNameUpdated={(updated) => {
            if (updated) setProfile(updated);
          }}
        />
      </section>
    )}
    {!settingsOpen && activeNav === '首页' && <section className={`home-canvas ${showHomeChat ? 'has-conversation' : ''} ${showHomeChat && homeHistoryOpen ? 'is-history-open' : ''} ${showHomeChat && !homeHistoryOpen ? 'is-history-collapsed' : ''}`}>
      {!showHomeChat && <div className="hero-block"><div className="robot-hero"><img src="/assets/refind-home-robot.png" alt="" /></div><h1>Welcome, Refind!</h1><p>把散落的收藏，重新捡回来。</p></div>}
      {showHomeChat && (
        <>
          <HomeHistoryCard
            open={homeHistoryOpen}
            onOpenChange={setHomeHistoryOpen}
            conversations={homeConversations}
            activeConversationId={homeConversationId}
            onNewChat={startNewHomeChat}
            onPickHistory={openHomeConversation}
            onRenameConversation={renameHomeConversation}
            onDeleteConversation={deleteHomeConversation}
          />
          <div className="home-thread">
            <HomeConversation
              messages={homeMessages}
              emptyPrompt={homeChatEmptyPrompt}
              onSaveCard={saveAnswerCard}
              onAddToNote={addAnswerToNote}
              onOpenMaterial={(materialId) => window.open(getMaterialPreviewUrl(materialId), '_blank', 'noopener,noreferrer')}
              shareMode={homeShareMode}
              selectedBubbleIds={homeShareSelected}
              onShareStart={startHomeShare}
              onToggleBubble={toggleHomeShareBubble}
            />
            {homeShareMode
              ? <HomeShareBar selectedCount={homeShareSelected.length} onCopyLink={copyHomeShareLink} onCancel={exitHomeShare} />
              : <HomeComposer bases={bases} availableTags={homeTagOptions} onSubmit={submitHomeQuestion} scope={homeScope} onScopeChange={setHomeScope} />}
          </div>
        </>
      )}
      {!showHomeChat && <HomeComposer bases={bases} availableTags={homeTagOptions} onSubmit={submitHomeQuestion} scope={homeScope} onScopeChange={setHomeScope} />}
      {notice && <Toast text={notice} onClose={() => setNotice('')} />}
    </section>}
    {!settingsOpen && activeNav === '笔记' && <section className="workspace-canvas notes-canvas"><NotesWorkspace notes={notes} setNotes={setNotes} cards={cards} notebooks={notebooks} notice={say} onDeleteCard={async (cardId) => {
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
    {!settingsOpen && activeNav === '知识库' && <section className="workspace-canvas knowledge-canvas">
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
              {!isMaterialSearching && <MaterialIngest base={base} onCreateStub={createIngestedMaterialStub} onDelete={deleteIngestedMaterial} onOpenPlatformSettings={(platformCode) => openSettings({ tab: 'platforms', focusPlatform: platformCode || '' })} />}
            </div>
            <div className="material-list-scroll">
            <div className="material-list">{visibleMaterials.map((item) => <article className={`material-row ${materialMenu?.id === item.id ? 'is-menu-open' : ''}`} key={item.id}>
              <button
                type="button"
                className={`material-row-button ${materialMenu?.id === item.id ? 'is-selected' : ''}`}
                aria-label={item.fileName || item.title}
                aria-pressed={materialMenu?.id === item.id}
                onClick={() => openMaterialPreview(item)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setHoveredMaterialId(null);
                  setMaterialMenu({ id: item.id, x: event.clientX, y: event.clientY });
                }}
                onMouseEnter={() => setHoveredMaterialId(item.id)}
                onMouseLeave={() => setHoveredMaterialId(null)}
                onFocus={() => setHoveredMaterialId(item.id)}
                onBlur={() => setHoveredMaterialId(null)}
              >
                <div className="material-mark"><IconMaterial /></div><div><h3>{item.title}</h3><p><span>{item.source}</span>{item.tag ? <> · #{item.tag}</> : null}{item.statusLabel && <><span> · </span><span className={`material-status is-${item.status}`}>{item.statusLabel}</span></>}</p></div><time>{item.time}</time>
              </button>
              {hoveredMaterialId === item.id && materialMenu?.id !== item.id && <aside className="material-hover-card" role="tooltip">
                <strong>{item.fileName || item.title}</strong>
                <span>AI 解析摘要</span>
                <p>{
                  item.status === 'processing'
                    ? '正在解析，完成后可查看摘要。'
                    : item.status === 'failed'
                      ? (item.lastParseError || '解析失败，可右键删除或重新添加。')
                      : (item.summary || '暂无摘要')
                }</p>
              </aside>}
            </article>)}{!visibleMaterials.length && (
              <div className="empty-inline">
                {query.trim() || source !== '全部来源' ? (
                  <p>未找到符合条件的资料</p>
                ) : (
                  <>
                    <p>当前知识库暂无资料</p>
                    <p>可通过「添加资料」粘贴链接或上传文件</p>
                  </>
                )}
              </div>
            )}</div>
            </div>
            {materialMenu && (() => {
              const menuMaterial = knowledgeMaterials.find((item) => item.id === materialMenu.id);
              if (!menuMaterial) return null;
              return (
                <div
                  className="material-context-menu"
                  role="menu"
                  ref={materialMenuRef}
                  style={{ left: materialMenu.x, top: materialMenu.y }}
                >
                  <button type="button" role="menuitem" onClick={() => { reparseMaterial(menuMaterial); }}>重新解析</button>
                  <button type="button" role="menuitem" onClick={() => { setMaterialMenu(null); setEditTagsMaterial(menuMaterial); }}>编辑标签</button>
                  <button type="button" role="menuitem" onClick={() => { setMaterialMenu(null); setMoveMaterialTarget(menuMaterial); }}>移动到</button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { deleteListedMaterial(menuMaterial); }}>删除资料</button>
                </div>
              );
            })()}
          </section>
        </div>
        {aiPanelOpen && <button className="ai-panel-scrim" type="button" aria-label="关闭 AI 对话遮罩" onClick={() => { setAiPanelOpen(false); setHistoryOpen(false); }} />}
        <aside className={`ai-panel ${aiPanelOpen ? 'is-open' : ''} ${kbShareMode ? 'is-share-mode' : ''}`} data-open={aiPanelOpen ? 'true' : 'false'}>
          <div className="ai-panel-head" ref={historyRef}>
            <h2>AI 对话</h2>
            <div>
              <button type="button" title="新建会话" aria-label="新建会话" onClick={startNewKbChat}><Plus size={15} strokeWidth={1.5} /></button>
              <div className="ai-history-anchor">
                <button type="button" title="会话历史" aria-label="会话历史" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}><Clock3 size={15} strokeWidth={1.5} /></button>
                {historyOpen && (
                  <div className="history-popover" role="menu" aria-label="会话历史">
                    <strong>会话历史</strong>
                    {groupConversationsByDay(kbConversations).map((group) => (
                      group.items.map((item) => (
                        kbRenameDraft?.id === item.id ? (
                          <div key={item.id} className="is-renaming" role="menuitem">
                            <input
                              autoFocus
                              value={kbRenameDraft.title}
                              maxLength={80}
                              aria-label="会话名称"
                              onChange={(event) => setKbRenameDraft((current) => (
                                current ? { ...current, title: event.target.value } : current
                              ))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  submitKbRename();
                                }
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  setKbRenameDraft(null);
                                }
                              }}
                              onBlur={() => { submitKbRename(); }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </div>
                        ) : (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            className={kbConversationId === item.id ? 'is-active' : ''}
                            onClick={() => openKbConversation(item.id)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const width = 128;
                              const height = 76;
                              const left = Math.min(Math.max(8, event.clientX), window.innerWidth - width - 8);
                              const top = Math.min(Math.max(8, event.clientY), window.innerHeight - height - 8);
                              setKbHistoryMenu({ id: item.id, title: item.title, left, top });
                            }}
                          >
                            {item.title}
                          </button>
                        )
                      ))
                    ))}
                    {!kbConversations.length && (
                      <p className="history-popover__empty">暂无历史会话</p>
                    )}
                  </div>
                )}
              </div>
              <button className="ai-panel-close" type="button" aria-label="关闭 AI 对话" onClick={() => { exitKbShare(); setAiPanelOpen(false); setHistoryOpen(false); }}><X size={15} strokeWidth={1.5} /></button>
            </div>
          </div>
          {kbHistoryMenu && createPortal(
            <div
              className="home-history-context-menu"
              role="menu"
              aria-label="会话操作"
              ref={kbHistoryMenuRef}
              style={{ left: kbHistoryMenu.left, top: kbHistoryMenu.top }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setKbRenameDraft({ id: kbHistoryMenu.id, title: kbHistoryMenu.title });
                  setKbHistoryMenu(null);
                }}
              >
                重命名
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={async () => {
                  const target = kbHistoryMenu;
                  setKbHistoryMenu(null);
                  const ok = window.confirm(`确定删除会话「${target.title}」？删除后无法恢复。`);
                  if (ok) await deleteKbConversation(target.id);
                }}
              >
                删除
              </button>
            </div>,
            document.body,
          )}
          <div className={`ai-stream ${kbMessages.length ? 'has-messages' : ''}`}>
            {kbMessages.length === 0
              ? (
                <div className="ai-empty">
                  <KnowledgeAnswerMark />
                  <h3>{kbChatEmptyTitle}</h3>
                  <p>{kbChatEmptyHint}</p>
                </div>
              )
              : (
                <KbConversation
                  messages={kbMessages}
                  onSaveCard={saveAnswerCard}
                  onAddToNote={addAnswerToNote}
                  onOpenMaterial={(materialId) => window.open(getMaterialPreviewUrl(materialId), '_blank', 'noopener,noreferrer')}
                  shareMode={kbShareMode}
                  selectedBubbleIds={kbShareSelected}
                  onShareStart={startKbShare}
                  onToggleBubble={toggleKbShareBubble}
                />
              )}
          </div>
          {kbShareMode
            ? <HomeShareBar selectedCount={kbShareSelected.length} onCopyLink={copyKbShareLink} onCancel={exitKbShare} />
            : <Composer key={selectedKnowledgeBase?.id || 'kb'} compact base={base} bases={bases} availableTags={kbTagOptions} onBase={setBase} onSubmit={submitKbQuestion} />}
        </aside>
      </div>{notice && <Toast text={notice} onClose={() => setNotice('')} />}
    </section>}
    {showCreate && <div className="modal-layer"><form className="create-modal" onSubmit={createBase}><button className="modal-close" type="button" onClick={() => setShowCreate(false)}><X size={17} /></button><Sparkles size={22} /><h2>新建知识库</h2><p>创建一个主题空间，用来归集和提问。</p><label>知识库名称<input value={newBase} autoFocus onChange={(event) => setNewBase(event.target.value)} placeholder="例如：产品与设计资料" /></label><div><button type="button" onClick={() => setShowCreate(false)}>取消</button><button type="submit">创建</button></div></form></div>}
    <EditMaterialTagsDialog
      open={Boolean(editTagsMaterial)}
      initialTags={editTagsMaterial?.tags || (editTagsMaterial?.tag ? [editTagsMaterial.tag] : [])}
      onSave={saveMaterialTags}
      onClose={() => { if (!editTagsSaving) setEditTagsMaterial(null); }}
      saving={editTagsSaving}
    />
    <MoveMaterialDialog
      open={Boolean(moveMaterialTarget)}
      bases={knowledgeBases}
      currentBaseId={moveMaterialTarget?.knowledgeBaseId}
      onPick={(targetBase) => moveMaterialToBase(moveMaterialTarget, targetBase)}
      onClose={() => setMoveMaterialTarget(null)}
    />
  </main>;
}
