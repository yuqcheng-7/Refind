/**
 * Measure where a caret index sits inside a textarea (viewport coordinates).
 * Uses a mirrored DOM node so wrapping / padding / scroll are respected.
 */
export function getTextareaCaretClientRect(textarea, caretIndex = 0) {
  if (!textarea || typeof document === 'undefined') return null;
  const value = String(textarea.value || '');
  const index = Math.max(0, Math.min(Number(caretIndex) || 0, value.length));
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  const props = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
    'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize',
    'whiteSpace', 'wordWrap', 'wordBreak', 'direction',
  ];
  for (const prop of props) {
    mirror.style[prop] = style[prop];
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflow: 'hidden',
  });

  mirror.textContent = value.slice(0, index);
  marker.textContent = value.slice(index) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const rect = textarea.getBoundingClientRect();
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const lineHeight = Number.parseFloat(style.lineHeight)
    || Number.parseFloat(style.fontSize)
    || 16;
  const top = rect.top + borderTop + marker.offsetTop - textarea.scrollTop;
  const left = rect.left + borderLeft + marker.offsetLeft - textarea.scrollLeft;
  document.body.removeChild(mirror);

  return { top, left, height: lineHeight };
}
