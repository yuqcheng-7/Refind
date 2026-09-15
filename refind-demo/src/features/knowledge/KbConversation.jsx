import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AnswerContent } from '../chat/AnswerContent.jsx';
import { AnswerActions } from './AnswerActions.jsx';

function BubbleCheck({ selected }) {
  return (
    <span className={`home-bubble-check ${selected ? 'is-on' : ''}`} aria-hidden="true">
      {selected ? <Check size={10} strokeWidth={2.8} /> : null}
    </span>
  );
}

function BubbleRow({ align, shareMode, selected, label, onToggle, children }) {
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

export function KbConversation({
  messages,
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

  return (
    <div className={`kb-conversation ${shareMode ? 'is-share-mode' : ''}`} aria-label="知识库 AI 对话">
      {messages.map((message) => {
        const isRag = message.mode === 'rag';
        const userId = `kb-${message.id}-user`;
        const answerId = `kb-${message.id}-answer`;
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
          <article className="conversation home-conversation-turn" key={message.id}>
            <BubbleRow
              align="user"
              shareMode={shareMode}
              selected={selected.has(userId)}
              label={`选择提问：${message.question}`}
              onToggle={() => onToggleBubble?.(userId)}
            >
              <div className="user-message">{message.question}</div>
            </BubbleRow>
            {message.answer ? (
              <BubbleRow
                align="answer"
                shareMode={shareMode}
                selected={selected.has(answerId)}
                label="选择回答"
                onToggle={() => onToggleBubble?.(answerId)}
              >
                <div className={`answer-message ${message.failed ? 'is-failed' : ''}`}>
                  <AnswerActions
                    answer={answer}
                    shareMode={shareMode}
                    onSaveCard={onSaveCard}
                    onAddToNote={onAddToNote}
                    onShare={() => onShareStart?.(answerId)}
                  >
                    <AnswerContent
                      text={message.answer}
                      citations={isRag ? message.citations : []}
                      conversational={false}
                      interactive={!shareMode}
                      onOpenMaterial={onOpenMaterial}
                    />
                  </AnswerActions>
                </div>
              </BubbleRow>
            ) : (
              <div className="answer-message is-pending" role="status">正在生成回答…</div>
            )}
          </article>
        );
      })}
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}
