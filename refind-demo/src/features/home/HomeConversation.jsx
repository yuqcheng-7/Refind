import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnswerContent } from '../chat/AnswerContent.jsx';
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
  shareMode,
  selected,
  label,
  onToggle,
  children,
}) {
  const className = [
    'home-bubble-row',
    `is-${align}`,
    shareMode ? 'is-selectable' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  if (!shareMode) {
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
  shareMode = false,
  selectedBubbleIds = [],
  onShareStart,
  onToggleBubble,
}) {
  const endRef = useRef(null);
  const selected = new Set(selectedBubbleIds);
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
      <section className={`home-conversation ${shareMode ? 'is-share-mode' : ''}`} aria-label="首页 AI 对话">
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
                shareMode={shareMode}
                selected={selected.has(userId)}
                label={`选择提问：${message.question}`}
                onToggle={() => onToggleBubble?.(userId)}
              >
                <div className="home-user-message">{message.question}</div>
              </BubbleRow>
              {message.answer ? (
                <BubbleRow
                  align="answer"
                  shareMode={shareMode}
                  selected={selected.has(answerId)}
                  label="选择回答"
                  onToggle={() => onToggleBubble?.(answerId)}
                >
                  <div className={`home-answer-message ${message.failed ? 'is-failed' : ''}`}>
                    <AnswerActions
                      answer={answer}
                      shareMode={shareMode}
                      onSaveCard={onSaveCard}
                      onAddToNote={onAddToNote}
                      onShare={() => onShareStart?.(answerId)}
                    >
                      {isRag && scopeName && <p className="home-answer-scope">{scopeName}</p>}
                      <AnswerContent
                        text={message.answer}
                        citations={isRag ? message.citations : []}
                        conversational={!isRag && !message.failed}
                        interactive={!shareMode}
                        onOpenMaterial={onOpenMaterial}
                      />
                    </AnswerActions>
                  </div>
                </BubbleRow>
              ) : (
                <div className="home-answer-message is-pending" role="status">正在生成回答…</div>
              )}
            </article>
          );
        })}
        <div ref={endRef} aria-hidden="true" />
      </section>
    </div>
  );
}

export function HomeShareBar({ selectedCount = 0, onCopyLink, onCancel }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="home-share-bar" role="region" aria-label="分享对话">
      <p className="home-share-bar__hint">已选择 {selectedCount} 条气泡</p>
      <div className="home-share-bar__actions">
        <button
          type="button"
          className="home-share-bar__copy"
          onClick={async () => {
            await onCopyLink?.();
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? '已复制链接' : '复制对话链接'}
        </button>
        <button type="button" className="home-share-bar__cancel" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
