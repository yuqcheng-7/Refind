import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Render `#tag` tokens with a distinct style inside user bubbles. */
export function renderQuestionWithHashTags(question = '') {
  const text = String(question || '');
  if (!text.includes('#')) return text;
  const nodes = [];
  const pattern = /#([^\s#]+)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={`tag-${key}`} className="user-message-hash-tag">
        #{match[1]}
      </span>,
    );
    key += 1;
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : text;
}

export function EditableUserMessage({
  message,
  bubbleClassName,
  shareMode = false,
  disabled = false,
  onResend,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.question || '');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(message.question || '');
  }, [editing, message.question]);

  useEffect(() => {
    if (!editing) return;
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [editing]);

  if (shareMode || !onResend) {
    return <div className={bubbleClassName}>{renderQuestionWithHashTags(message.question)}</div>;
  }

  if (editing) {
    const trimmed = draft.trim();
    const canSend = Boolean(trimmed) && !disabled;
    return (
      <div className={`${bubbleClassName} is-editing`}>
        <textarea
          ref={textareaRef}
          className="user-message-edit__input"
          aria-label="编辑提问内容"
          rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
              setDraft(message.question || '');
            }
            if (event.key === 'Enter' && !event.shiftKey && canSend) {
              event.preventDefault();
              setEditing(false);
              onResend({
                messageId: message.id,
                prompt: trimmed,
                mode: message.mode,
                selectedBases: message.selectedBases || [],
                selectedTags: message.selectedTags || [],
                online: Boolean(message.online),
              });
            }
          }}
        />
        <div className="user-message-edit__actions">
          <button
            type="button"
            className="user-message-edit__cancel"
            onClick={() => {
              setEditing(false);
              setDraft(message.question || '');
            }}
          >
            取消
          </button>
          <button
            type="button"
            className="user-message-edit__send"
            disabled={!canSend}
            onClick={() => {
              setEditing(false);
              onResend({
                messageId: message.id,
                prompt: trimmed,
                mode: message.mode,
                selectedBases: message.selectedBases || [],
                selectedTags: message.selectedTags || [],
                online: Boolean(message.online),
              });
            }}
          >
            重新发送
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-message-edit">
      <div className={bubbleClassName}>{renderQuestionWithHashTags(message.question)}</div>
      <button
        type="button"
        className="user-message-edit__trigger"
        aria-label="编辑提问"
        title="编辑提问"
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        <Pencil size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
