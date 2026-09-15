import { describe, expect, it } from 'vitest';
import { formatMaterialStatus, formatRelativeDateTime } from './formatTime.js';

describe('formatRelativeDateTime', () => {
  it('shows today with clock time', () => {
    const now = new Date();
    now.setHours(14, 5, 0, 0);
    expect(formatRelativeDateTime(now.toISOString())).toMatch(/^今天 14:05$/);
  });

  it('shows month and day with clock time for older dates', () => {
    expect(formatRelativeDateTime('2026-08-01T09:30:00')).toMatch(/8月1日 09:30/);
  });
});

describe('formatMaterialStatus', () => {
  it('maps terminal parse states', () => {
    expect(formatMaterialStatus('processing')).toBe('处理中');
    expect(formatMaterialStatus('failed')).toBe('解析失败');
    expect(formatMaterialStatus('link_only')).toBe('仅链接');
    expect(formatMaterialStatus('ready')).toBeNull();
  });
});
