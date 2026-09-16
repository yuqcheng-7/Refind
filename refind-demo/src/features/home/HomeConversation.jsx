import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnswerContent } from '../chat/AnswerContent.jsx';
import { EditableUserMessage } from '../chat/EditableUserMessage.jsx';
import { AnswerActions } from '../knowledge/AnswerActions.jsx';

function BubbleCheck({ selected }) {
  return (
    <span className={`home-bubble-check ${selected ? 'is-on' : ''}`} aria-hidden="true">
      {selected ? <Check size={10} strokeWidth={2.8} /> : null}
    </span>
  );
}

function BubbleRow({
  align,
  selectMode,
  selected,
  label,
  onToggle,
  children,
}) {
  const className = [
    'home-bubble-row',
    `is-${align}`,
    selectMode ? 'is-selectable' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  if (!selectMode) {
    return <div className={className}>{children}</div>;
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <BubbleCheck selected={selected} />
      <div className="home-bubble-row__body">{children}</div>
    </button>
  );
}

export function HomeConversation({
  messages,
  emptyPrompt,
  onSaveCard,
  onAddToNote,
  onOpenMaterial,
  onResend,
  onDeleteStart,
  shareMode = false,
  selectMode = null,
  selectedBubbleIds = [],
  onShareStart,
  onToggleBubble,
}) {
  const endRef = useRef(null);
  const selected = new Set(selectedBubbleIds);
  const busy = messages.some((message) => !message.answer);
  const activeSelectMode = selectMode || (shareMode ? 'share' : null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  if (!messages.length && emptyPrompt) {
    return (
      <div className="home-chat-column">
        <section className="home-conversation home-conversation--empty" aria-label="首页 AI 对话">
          <div className="home-chat-empty">
            <p>{emptyPrompt}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="home-chat-column">
      <section className={`home-conversation ${activeSelectMode ? 'is-share-mode' : ''}`} aria-label="首页 AI 对话">
        {messages.map((message) => {
          const isRag = message.mode === 'rag';
          const scopeName = [...(message.selectedBases || []), ...(message.selectedTags || []).map((tag) => `#${tag}`)].join('、');
          const userId = `${message.id}-user`;
          const answerId = `${message.id}-answer`;
          const answer = {
            id: answerId,
            content: message.answer || '',
            questionSnapshot: message.question,
            answerMode: message.mode,
            citation: message.citations?.[0]
              ? { label: message.citations[0].label, sourceId: message.citations[0].materialId }
              : undefined,
          };

          return (
            <article className="home-conversation-turn" key={message.id}>
              <BubbleRow
                align="user"
                selectMode={activeSelectMode}
                selected={selected.has(userId)}
                label={`选择提问：${message.question}`}
                onToggle={() => onToggleBubble?.(userId)}
              >
                <EditableUserMessage
                  message={message}
                  bubbleClassName="home-user-message"
                  shareMode={Boolean(activeSelectMode)}
                  disabled={busy}
                  onResend={onResend}
                />
              </BubbleRow>
              {message.answer ? (
                <BubbleRow
                  align="answer"
                  selectMode={activeSelectMode}
                  selected={selected.has(answerId)}
                  label="选择回答"
                  onToggle={() => onToggleBubble?.(answerId)}
                >
                  <div className={`home-answer-message ${message.failed ? 'is-failed' : ''}`}>
                    <AnswerActions
                      answer={answer}
                      shareMode={Boolean(activeSelectMode)}
                      onSaveCard={onSaveCard}
                      onAddToNote={onAddToNote}
                      onShare={() => onShareStart?.(answerId)}
                      onDelete={() => onDeleteStart?.(answerId)}
                    >
                      {isRag && scopeName && <p className="home-answer-scope">{scopeName}</p>}
                      <AnswerContent
                        text={message.answer}
                        citations={isRag ? message.citations : []}
                        conversational={!isRag && !message.failed}
                        interactive={!activeSelectMode}
                        onOpenMaterial={onOpenMaterial}
                      />
                    </AnswerActions>
                  </div>
                </BubbleRow>
              ) : String(message.id).startsWith('pending-') ? (
                <div className="home-answer-message is-pending" role="status">正在生成回答…</div>
              ) : null}
            </article>
          );
        })}
        <div ref={endRef} aria-hidden="true" />
      </section>
    </div>
  );
}

export function HomeShareBar({
  selectedCount = 0,
  mode = 'share',
  onCopyLink,
  onConfirm,
  onCancel,
}) {
  const [copied, setCopied] = useState(false);
  const isDelete = mode === 'delete';
  return (
    <div className="home-share-bar" role="region" aria-label={isDelete ? '删除对话气泡' : '分享对话'}>
      <p className="home-share-bar__hint">已选择 {selectedCount} 条气泡</p>
      <div className="home-share-bar__actions">
        {isDelete ? (
          <button
            type="button"
            className="home-share-bar__copy is-danger"
            disabled={selectedCount === 0}
            onClick={() => onConfirm?.()}
          >
            删除所选
          </button>
        ) : (
          <button
            type="button"
            className="home-share-bar__copy"
            onClick={async () => {
              await (onConfirm || onCopyLink)?.();
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? '已复制链接' : '复制对话链接'}
          </button>
        )}
        <button type="button" className="home-share-bar__cancel" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
