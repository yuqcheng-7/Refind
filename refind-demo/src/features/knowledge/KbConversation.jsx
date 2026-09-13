import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AnswerActions } from './AnswerActions.jsx';

const answerContent = '先用高质量内容建立核心用户的信任感；再用明确的反馈与激励，缩短用户从浏览到行动的路径；最后持续观察留存和搜索回流，确认增长是否可复制。';

function Citation({ label }) {
  return <span className="citation" tabIndex="0">引用<span>{label}</span></span>;
}

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
        const scopeName = [...(message.selectedBases || []), ...(message.selectedTags || []).map((tag) => `#${tag}`)].join('、') || '当前知识库';
        const userId = `kb-${message.id}-user`;
        const answerId = `kb-${message.id}-answer`;
        const answer = {
          id: answerId,
          content: answerContent,
          questionSnapshot: message.question,
          answerMode: message.mode,
          citation: isRag ? { label: '小红书增长策略', sourceId: 'source-xiaohongshu-growth' } : undefined,
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
            <BubbleRow
              align="answer"
              shareMode={shareMode}
              selected={selected.has(answerId)}
              label="选择回答"
              onToggle={() => onToggleBubble?.(answerId)}
            >
              <div className="answer-message">
                <AnswerActions
                  answer={answer}
                  shareMode={shareMode}
                  onSaveCard={onSaveCard}
                  onAddToNote={onAddToNote}
                  onShare={() => onShareStart?.(answerId)}
                >
                  <p>{isRag ? `我在「${scopeName}」里找到了三个值得优先关注的方向：` : '这里有三个可先行验证的通用方向：'}</p>
                  <ol>
                    <li>先用高质量内容建立核心用户的信任感。{isRag && <Citation label="小红书增长策略" />}</li>
                    <li>用明确的反馈与激励，缩短用户从浏览到行动的路径。{isRag && <Citation label="SaaS 增长复盘" />}</li>
                    <li>持续观察留存和搜索回流，确认增长是否可复制。</li>
                  </ol>
                </AnswerActions>
              </div>
            </BubbleRow>
          </article>
        );
      })}
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}
