import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AnswerContent } from '../chat/AnswerContent.jsx';
import { EditableUserMessage } from '../chat/EditableUserMessage.jsx';
import { AnswerActions } from './AnswerActions.jsx';

function BubbleCheck({ selected }) {
  return (
    <span className={`home-bubble-check ${selected ? 'is-on' : ''}`} aria-hidden="true">
      {selected ? <Check size={10} strokeWidth={2.8} /> : null}
    </span>
  );
}

function BubbleRow({ align, selectMode, selected, label, onToggle, children }) {
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

export function KbConversation({
  messages,
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

  return (
    <div className={`kb-conversation ${activeSelectMode ? 'is-share-mode' : ''}`} aria-label="知识库问答">
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
              selectMode={activeSelectMode}
              selected={selected.has(userId)}
              label={`选择提问：${message.question}`}
              onToggle={() => onToggleBubble?.(userId)}
            >
              <EditableUserMessage
                message={message}
                bubbleClassName="user-message"
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
                <div className={`answer-message ${message.failed ? 'is-failed' : ''}`}>
                  <AnswerActions
                    answer={answer}
                    shareMode={Boolean(activeSelectMode)}
                    onSaveCard={onSaveCard}
                    onAddToNote={onAddToNote}
                    onShare={() => onShareStart?.(answerId)}
                    onDelete={() => onDeleteStart?.(answerId)}
                  >
                    <AnswerContent
                      text={message.answer}
                      citations={isRag ? message.citations : []}
                      conversational={false}
                      interactive={!activeSelectMode}
                      onOpenMaterial={onOpenMaterial}
                    />
                  </AnswerActions>
                </div>
              </BubbleRow>
            ) : String(message.id).startsWith('pending-') ? (
              <div className="answer-message is-pending" role="status">正在生成回答…</div>
            ) : null}
          </article>
        );
      })}
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}
