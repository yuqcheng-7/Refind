import { describe, expect, it } from 'vitest';
import { assertDeletable, filterKnowledgeBaseNames } from './knowledge.js';

describe('knowledge base helpers', () => {
  it('rejects delete of default knowledge base', () => {
    expect(() => assertDeletable({ type: 'default' })).toThrow(/默认知识库/);
  });

  it('filters knowledge base names by search query', () => {
    const names = ['默认知识库', '增长与运营案例', '产品与设计资料'];
    expect(filterKnowledgeBaseNames(names, '')).toEqual(names);
    expect(filterKnowledgeBaseNames(names, '增长')).toEqual(['增长与运营案例']);
    expect(filterKnowledgeBaseNames(names, '不存在的库')).toEqual([]);
  });
});
