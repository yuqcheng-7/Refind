import { useRef, useState } from 'react';
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, Globe2, WifiOff } from 'lucide-react';
import { useDismissable } from '../../hooks/useDismissable.js';

export const defaultHomeScope = {
  thinkingMode: 'fast',
  online: false,
  selectedBases: [],
  selectedTags: [],
};

export function modelLabel(thinkingMode) {
  return thinkingMode === 'deep' ? 'DS深度' : 'DS快速';
}

let composerIntroBeamPlayed = false;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HomeComposer({
  bases,
  availableTags = [],
  onSubmit,
  scope: controlledScope,
  onScopeChange,
  sendArrow = 'up',
  introBeam = false,
}) {
  const [prompt, setPrompt] = useState('');
  const [localScope, setLocalScope] = useState(defaultHomeScope);
  const [baseMenu, setBaseMenu] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  const [tagMenu, setTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const baseMenuRef = useRef(null);
  const modelMenuRef = useRef(null);
  const tagMenuRef = useRef(null);
  const playIntroBeamRef = useRef(null);
  if (playIntroBeamRef.current === null) {
    playIntroBeamRef.current = Boolean(introBeam) && !composerIntroBeamPlayed && !prefersReducedMotion();
    if (playIntroBeamRef.current) composerIntroBeamPlayed = true;
  }
  const [orbitToken, setOrbitToken] = useState(() => (playIntroBeamRef.current ? 1 : 0));
  const [orbitActive, setOrbitActive] = useState(() => Boolean(playIntroBeamRef.current));
  const startOrbitBeam = () => {
    if (prefersReducedMotion()) return;
    setOrbitActive(true);
    setOrbitToken((token) => token + 1);
  };
  const endOrbitBeam = () => {
    setOrbitActive(false);
  };
  const scope = controlledScope || localScope;
  const setScope = onScopeChange || setLocalScope;
  const { thinkingMode = 'fast', online, selectedBases, selectedTags } = scope;
  const hasScope = selectedBases.length > 0 || selectedTags.length > 0;
  const tagNames = availableTags.map((tag) => tag.name);
  const filteredTags = tagNames.filter((item) => !tagQuery || item.includes(tagQuery));
  const selectedModel = modelLabel(thinkingMode);
  const toggle = (key, value) => setScope((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  useDismissable({ open: baseMenu, onClose: () => setBaseMenu(false), rootRef: baseMenuRef });
  useDismissable({ open: modelMenu, onClose: () => setModelMenu(false), rootRef: modelMenuRef });
  useDismissable({ open: tagMenu, onClose: () => setTagMenu(false), rootRef: tagMenuRef });

  const syncHashMenu = (value) => {
    const match = /(^|\s)#([^\s#]*)$/.exec(value);
    if (match) {
      setTagMenu(true);
      setTagQuery(match[2] || '');
      setBaseMenu(false);
      setModelMenu(false);
      return;
    }
    setTagMenu(false);
    setTagQuery('');
  };

  const insertTag = (tag) => {
    const removing = selectedTags.includes(tag);
    setScope((current) => ({
      ...current,
      selectedTags: removing
        ? current.selectedTags.filter((item) => item !== tag)
        : [...current.selectedTags, tag],
    }));
    setPrompt((value) => {
      if (removing) {
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return value
          .replace(/(^|\s)#[^\s#]*$/, '$1')
          .replace(new RegExp(`(^|\\s)#${escaped}(?=\\s|$)`, 'g'), '$1')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();
      }
      return value.replace(/(^|\s)#[^\s#]*$/, `$1#${tag} `);
    });
    setTagMenu(false);
    setTagQuery('');
  };

  const setThinkingMode = (mode) => {
    setScope((current) => ({ ...current, thinkingMode: mode }));
  };

  const send = (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    onSubmit({
      prompt: prompt.trim(),
      mode: hasScope ? 'rag' : 'general',
      online: hasScope ? false : online,
      thinkingMode,
      model: selectedModel,
      selectedBases: [...selectedBases],
      selectedTags: [...selectedTags],
    });
    setPrompt('');
    setTagMenu(false);
    setTagQuery('');
  };

  const onPromptKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send(event);
  };

  const baseLabel = selectedBases.length === 0 ? '知识库' : selectedBases.length === 1 ? selectedBases[0] : `${selectedBases.length} 个知识库`;

  return (
    <form
      className={`question-composer home-composer ${hasScope ? 'is-rag' : ''}${orbitActive ? ' has-intro-beam' : ''}`}
      onSubmit={send}
    >
      {orbitActive && (
        <span
          key={orbitToken}
          className="beam-intro"
          aria-hidden="true"
          onAnimationEnd={endOrbitBeam}
        />
      )}
      <div className="composer-input-wrap" ref={tagMenuRef}>
        <textarea
          value={prompt}
          onChange={(event) => {
            const value = event.target.value;
            setPrompt(value);
            syncHashMenu(value);
          }}
          onFocus={startOrbitBeam}
          onKeyDown={onPromptKeyDown}
          placeholder="请输入内容进行提问，输入 # 可选择标签"
        />
        {tagMenu && (
          <div className="composer-menu composer-tag-suggest" role="listbox" aria-label="选择标签">
            {filteredTags.length ? filteredTags.map((item) => (
              <button key={item} type="button" role="option" onClick={() => insertTag(item)}>
                <span className="tag-text">
                  <span className="tag-hash" aria-hidden="true">#</span>
                  <span className="tag-label">{item}</span>
                </span>
                {selectedTags.includes(item) && <Check size={14} />}
              </button>
            )) : (
              <div className="composer-tag-suggest__empty">暂无标签</div>
            )}
          </div>
        )}
      </div>
      <div className="composer-footer">
        <div className="composer-actions">
          <div className="menu-anchor" ref={modelMenuRef}>
            <button
              className="composer-chip composer-model"
              type="button"
              aria-label="选择模型"
              aria-expanded={modelMenu}
              onClick={() => { setModelMenu((open) => !open); setBaseMenu(false); setTagMenu(false); }}
            >
              <span>{selectedModel}</span>
              <ChevronDown size={13} strokeWidth={1.8} />
            </button>
            {modelMenu && (
              <div className="composer-menu composer-model-menu" role="dialog" aria-label="DeepSeek 模型设置">
                <div className="composer-model-menu__row">
                  <div>
                    <strong>DeepSeek</strong>
                    <small>思考模式</small>
                  </div>
                  <div className="composer-think-toggle" role="group" aria-label="思考模式">
                    <button
                      type="button"
                      aria-pressed={thinkingMode === 'fast'}
                      className={thinkingMode === 'fast' ? 'is-active' : ''}
                      onClick={() => setThinkingMode('fast')}
                    >
                      快速
                    </button>
                    <button
                      type="button"
                      aria-pressed={thinkingMode === 'deep'}
                      className={thinkingMode === 'deep' ? 'is-active' : ''}
                      onClick={() => setThinkingMode('deep')}
                    >
                      深度
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            className={`composer-chip ${!hasScope && online ? 'is-active' : ''}`}
            type="button"
            aria-pressed={hasScope ? false : online}
            disabled={hasScope}
            onClick={() => setScope((current) => ({ ...current, online: !current.online }))}
          >
            {hasScope || !online ? <WifiOff size={14} strokeWidth={1.8} /> : <Globe2 size={14} strokeWidth={1.8} />}
            <span>{hasScope || !online ? '不联网' : '联网'}</span>
          </button>
          <div className="menu-anchor" ref={baseMenuRef}>
            <button
              className={`composer-chip ${selectedBases.length ? 'is-active' : ''}`}
              type="button"
              aria-label="选择知识库"
              aria-expanded={baseMenu}
              onClick={() => { setBaseMenu((open) => !open); setModelMenu(false); setTagMenu(false); }}
            >
              <BookOpen size={14} strokeWidth={1.8} />
              <span>{baseLabel}</span>
              <ChevronDown size={13} strokeWidth={1.8} />
            </button>
            {baseMenu && <div className="composer-menu home-base-menu" role="listbox" aria-label="知识库选择">
              {bases.map((base) => (
                <button key={base} type="button" role="option" aria-selected={selectedBases.includes(base)} onClick={() => toggle('selectedBases', base)}>
                  <span>{base}</span>
                  {selectedBases.includes(base) && <Check size={14} />}
                </button>
              ))}
            </div>}
          </div>
        </div>
        <button className="send-button" type="submit" aria-label="发送提问">
          {sendArrow === 'right'
            ? <ArrowRight size={18} strokeWidth={2.1} />
            : <ArrowUp size={18} strokeWidth={2.1} />}
        </button>
      </div>
    </form>
  );
}
