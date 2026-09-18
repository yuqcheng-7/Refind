/**
 * Note editor typography tokens — desktop defaults from
 * docs/superpowers/specs/2026-09-17-notes-intelligence-design.md §4.3
 */

export const NOTE_STYLE_IDS = Object.freeze([
  'h1',
  'h2',
  'h3',
  'body1',
  'body2',
  'body3',
]);

export const NOTE_STYLE_MENU = Object.freeze([
  { id: 'h1', label: '标题1' },
  { id: 'h2', label: '标题2' },
  { id: 'h3', label: '标题3' },
  { id: 'body1', label: '正文（默认）' },
  { id: 'body2', label: '辅助正文' },
  { id: 'body3', label: '小字备注' },
]);

export const NOTE_DEFAULT_STYLE_ID = 'body1';

/** Desktop (default) tokens — exact shipping values */
export const NOTE_TYPOGRAPHY_DESKTOP = Object.freeze({
  h1: {
    fontSize: '28px',
    fontWeight: 600,
    lineHeight: '36px',
    color: '#1D2129',
    marginTop: '0',
    marginBottom: '24px',
    className: 'note-typo note-typo--h1',
  },
  h2: {
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: '32px',
    color: '#1D2129',
    marginTop: '20px',
    marginBottom: '16px',
    className: 'note-typo note-typo--h2',
  },
  h3: {
    fontSize: '20px',
    fontWeight: 550,
    lineHeight: '28px',
    color: '#1D2129',
    marginTop: '16px',
    marginBottom: '12px',
    className: 'note-typo note-typo--h3',
  },
  body1: {
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: '24px',
    color: '#1D2129',
    marginTop: '0',
    marginBottom: '8px',
    className: 'note-typo note-typo--body1',
  },
  body2: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '20px',
    color: '#4E5969',
    marginTop: '0',
    marginBottom: '6px',
    className: 'note-typo note-typo--body2',
  },
  body3: {
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '18px',
    color: '#86909C',
    marginTop: '0',
    marginBottom: '4px',
    className: 'note-typo note-typo--body3',
  },
});

export const NOTE_FONT_STACK = [
  'Refind Source Han SC',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Noto Sans SC',
  'sans-serif',
].join(', ');

export function getNoteStyleToken(styleId) {
  const id = NOTE_STYLE_IDS.includes(styleId) ? styleId : NOTE_DEFAULT_STYLE_ID;
  return NOTE_TYPOGRAPHY_DESKTOP[id];
}

export function noteStyleClassName(styleId) {
  return getNoteStyleToken(styleId).className;
}
