import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getTextareaCaretClientRect } from './textareaCaret.js';

describe('getTextareaCaretClientRect', () => {
  let textarea;

  beforeEach(() => {
    textarea = document.createElement('textarea');
    Object.assign(textarea.style, {
      position: 'fixed',
      left: '100px',
      top: '200px',
      width: '400px',
      height: '40px',
      padding: '0',
      border: '0',
      margin: '0',
      font: '16px monospace',
      lineHeight: '24px',
      whiteSpace: 'pre-wrap',
    });
    document.body.appendChild(textarea);
    textarea.getBoundingClientRect = () => ({
      top: 200,
      left: 100,
      width: 400,
      height: 40,
      right: 500,
      bottom: 240,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    textarea.remove();
  });

  it('returns null without a textarea', () => {
    expect(getTextareaCaretClientRect(null, 0)).toBeNull();
  });

  it('returns a viewport rect anchored to the textarea origin', () => {
    textarea.value = '前面一些文字#';
    const atHash = getTextareaCaretClientRect(textarea, textarea.value.length - 1);
    expect(atHash).toEqual({
      top: expect.any(Number),
      left: expect.any(Number),
      height: expect.any(Number),
    });
    // jsdom does not lay out glyph widths; still pin to the textarea box.
    expect(atHash.top).toBeGreaterThanOrEqual(200);
    expect(atHash.left).toBeGreaterThanOrEqual(100);
    expect(atHash.height).toBeGreaterThan(0);
  });
});
