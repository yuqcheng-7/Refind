import { describe, expect, it } from 'vitest';
import { resolveTagFilterIds } from './tagFilters.js';

describe('resolveTagFilterIds', () => {
  const availableTags = [
    { id: 'tag-product', name: '产品灵感' },
    { id: 'tag-growth', name: '增长策略' },
  ];

  it('maps selected tag names to UUID ids', () => {
    expect(resolveTagFilterIds(['产品灵感', '增长策略'], availableTags)).toEqual([
      'tag-product',
      'tag-growth',
    ]);
  });

  it('drops unknown tag names', () => {
    expect(resolveTagFilterIds(['产品灵感', '不存在的标签'], availableTags)).toEqual([
      'tag-product',
    ]);
  });

  it('returns empty when nothing matches', () => {
    expect(resolveTagFilterIds(['未知'], availableTags)).toEqual([]);
    expect(resolveTagFilterIds([], availableTags)).toEqual([]);
  });
});
