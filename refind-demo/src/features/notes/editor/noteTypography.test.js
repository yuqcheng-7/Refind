import { describe, expect, it } from 'vitest';
import {
  NOTE_DEFAULT_STYLE_ID,
  NOTE_FONT_STACK,
  NOTE_STYLE_IDS,
  NOTE_STYLE_MENU,
  NOTE_TYPOGRAPHY_DESKTOP,
  getNoteStyleToken,
  noteStyleClassName,
} from './noteTypography.js';

describe('noteTypography', () => {
  it('exposes exactly six style ids', () => {
    expect(NOTE_STYLE_IDS).toEqual(['h1', 'h2', 'h3', 'body1', 'body2', 'body3']);
  });

  it('menu labels match product copy', () => {
    expect(NOTE_STYLE_MENU.map((item) => item.label)).toEqual([
      '标题1',
      '标题2',
      '标题3',
      '正文（默认）',
      '辅助正文',
      '小字备注',
    ]);
  });

  it('defaults to body1', () => {
    expect(NOTE_DEFAULT_STYLE_ID).toBe('body1');
    expect(getNoteStyleToken('unknown').fontSize).toBe('16px');
  });

  it('locks desktop tokens to shipping typography table', () => {
    expect(NOTE_TYPOGRAPHY_DESKTOP.h1).toMatchObject({
      fontSize: '32px',
      fontWeight: 600,
      lineHeight: '40px',
      color: '#1D2129',
      marginTop: '0',
      marginBottom: '24px',
    });
    expect(NOTE_TYPOGRAPHY_DESKTOP.h2).toMatchObject({
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: '32px',
      marginTop: '20px',
      marginBottom: '16px',
    });
    expect(NOTE_TYPOGRAPHY_DESKTOP.h3).toMatchObject({
      fontSize: '20px',
      fontWeight: 550,
      lineHeight: '28px',
      marginTop: '16px',
      marginBottom: '12px',
    });
    expect(NOTE_TYPOGRAPHY_DESKTOP.body1).toMatchObject({
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: '24px',
      color: '#1D2129',
      marginBottom: '8px',
    });
    expect(NOTE_TYPOGRAPHY_DESKTOP.body2).toMatchObject({
      fontSize: '14px',
      lineHeight: '20px',
      color: '#4E5969',
      marginBottom: '6px',
    });
    expect(NOTE_TYPOGRAPHY_DESKTOP.body3).toMatchObject({
      fontSize: '12px',
      lineHeight: '18px',
      color: '#86909C',
      marginBottom: '4px',
    });
  });

  it('maps style ids to CSS class names', () => {
    expect(noteStyleClassName('h1')).toBe('note-typo note-typo--h1');
    expect(noteStyleClassName('body2')).toBe('note-typo note-typo--body2');
  });

  it('uses CN + Apple + Windows font stack without remote CDNs', () => {
    expect(NOTE_FONT_STACK).toContain('PingFang SC');
    expect(NOTE_FONT_STACK).toContain('Microsoft YaHei');
    expect(NOTE_FONT_STACK).not.toMatch(/fonts\.google/i);
  });
});
