import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

function normalizeTagName(value) {
  return String(value || '').trim().replace(/^#+/, '').trim();
}

function normalizeTagList(tags) {
  return [...new Set((tags || []).map(normalizeTagName).filter(Boolean))];
}

export function EditMaterialTagsDialog({
  open,
  initialTags = [],
  onSave,
  onClose,
  saving = false,
}) {
  const [tags, setTags] = useState(() => normalizeTagList(initialTags));
  const [draft, setDraft] = useState('');

  const initialKey = Array.isArray(initialTags) ? initialTags.join('\u0001') : '';

  useEffect(() => {
    if (!open) return;
    setTags(normalizeTagList(initialTags));
    setDraft('');
  }, [open, initialKey]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when dialog opens / source tags change


  if (!open) return null;

  const commitDraft = () => {
    const next = normalizeTagName(draft);
    if (!next) {
      setDraft('');
      return;
    }
    setTags((current) => normalizeTagList([...current, next]));
    setDraft('');
  };

  const removeTag = (name) => {
    setTags((current) => current.filter((tag) => tag !== name));
  };

  const handleSave = () => {
    const pending = normalizeTagName(draft);
    const nextTags = normalizeTagList(pending ? [...tags, pending] : tags);
    onSave?.(nextTags);
  };

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <form
        className="material-simple-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="编辑标签"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving) handleSave();
        }}
      >
        <header>
          <h2>编辑标签</h2>
          <button type="button" aria-label="关闭" disabled={saving} onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <p className="material-tag-editor__hint">
          保存后将锁定标签：之后「重新解析」只会更新摘要，不会覆盖你改过的标签。未手改时，重新解析可能会换成新的 AI 标签。
        </p>
        <div className="material-tag-editor">
          <div className="material-tag-editor__chips" aria-label="已选标签">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="material-tag-chip"
                disabled={saving}
                onClick={() => removeTag(tag)}
                aria-label={`移除标签 ${tag}`}
              >
                #{tag}
                <X size={12} strokeWidth={2} />
              </button>
            ))}
          </div>
          <label>
            标签
            <input
              aria-label="标签"
              value={draft}
              disabled={saving}
              placeholder="输入标签后按 Enter"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDraft();
                }
              }}
            />
          </label>
        </div>
        <footer>
          <button type="button" disabled={saving} onClick={onClose}>取消</button>
          <button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        </footer>
      </form>
    </div>
  );
}
