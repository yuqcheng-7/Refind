import { BookmarkPlus, Check, Copy, MoreHorizontal, Share2, ThumbsDown, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FloatingMenu } from '../../components/FloatingMenu.jsx';
import { useDismissable } from '../../hooks/useDismissable.js';

function cardPayload(answer, contentSnapshot) {
  return {
    contentSnapshot,
    questionSnapshot: answer.questionSnapshot ?? answer.question ?? '',
    answerMode: answer.answerMode ?? 'general',
    citation: answer.citation,
  };
}

export function AnswerActions({ answer, children, onSaveCard, onAddToNote, onDelete, onFeedback, onShare, shareMode = false }) {
  const [captureText, setCaptureText] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const captureMenuRef = useRef(null);
  const captureTriggerRef = useRef(null);
  const moreMenuRef = useRef(null);
  const moreTriggerRef = useRef(null);
  const copiedTimer = useRef(null);
  useDismissable({
    open: Boolean(captureText),
    onClose: () => setCaptureText(null),
    rootRef: captureMenuRef,
    triggerRef: captureTriggerRef,
  });
  useDismissable({
    open: moreOpen,
    onClose: () => setMoreOpen(false),
    rootRef: moreMenuRef,
    triggerRef: moreTriggerRef,
  });
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const openCapture = (content) => {
    if (content?.trim()) {
      setCaptureText(content.trim());
      setMoreOpen(false);
    }
  };
  const captureSelection = () => {
    if (shareMode) return;
    const selection = window.getSelection?.().toString().trim();
    if (selection) openCapture(selection);
  };
  const saveCard = () => {
    onSaveCard?.(cardPayload(answer, captureText));
    setCaptureText(null);
  };
  const addToNote = () => {
    onAddToNote?.(cardPayload(answer, captureText));
    setCaptureText(null);
  };
  const copyAnswer = async () => {
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
    try { await navigator.clipboard?.writeText(answer.content); } catch { /* Clipboard is optional in this local prototype. */ }
  };

  return <div className="answer-actions-wrap" onMouseUp={captureSelection}>
    {children}
    {!shareMode && <div className="answer-actions" aria-label="回答操作">
      <button type="button" className={copied ? 'is-copied' : ''} aria-label={copied ? '已复制' : '复制回答'} title={copied ? '已复制' : '复制回答'} onClick={copyAnswer}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied && <span className="answer-copy-toast">已复制</span>}
      </button>
      <div className="answer-actions__bookmark">
        <button
          ref={captureTriggerRef}
          type="button"
          aria-label="收藏整条回答"
          title="收藏整条回答"
          aria-expanded={Boolean(captureText)}
          onClick={() => openCapture(answer.content)}
        >
          <BookmarkPlus size={16} />
        </button>
        <FloatingMenu
          open={Boolean(captureText)}
          anchorRef={captureTriggerRef}
          menuRef={captureMenuRef}
          className="answer-capture-menu"
          role="menu"
          aria-label="收藏回答"
        >
          <button type="button" role="menuitem" onClick={saveCard}>保存为灵感卡片</button>
          <button type="button" role="menuitem" onClick={addToNote}>加入笔记</button>
        </FloatingMenu>
      </div>
      <button type="button" aria-label="分享回答" title="分享回答" onClick={() => onShare?.(answer)}><Share2 size={16} /></button>
      <div className="answer-actions__more">
        <button
          ref={moreTriggerRef}
          type="button"
          aria-label="更多操作"
          title="更多操作"
          aria-expanded={moreOpen}
          onClick={() => {
            setCaptureText(null);
            setMoreOpen((open) => !open);
          }}
        >
          <MoreHorizontal size={16} />
        </button>
        <FloatingMenu
          open={moreOpen}
          anchorRef={moreTriggerRef}
          menuRef={moreMenuRef}
          className="answer-more-menu"
          role="menu"
          aria-label="更多回答操作"
        >
          <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onDelete?.(answer); }}><Trash2 size={14} />删除回答</button>
          <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onFeedback?.(answer); }}><ThumbsDown size={14} />反馈</button>
        </FloatingMenu>
      </div>
    </div>}
  </div>;
}
