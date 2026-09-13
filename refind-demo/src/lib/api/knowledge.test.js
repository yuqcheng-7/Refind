import { describe, expect, it } from 'vitest';
import { assertDeletable } from './knowledge.js';

describe('knowledge base helpers', () => {
  it('rejects delete of default knowledge base', () => {
    expect(() => assertDeletable({ type: 'default' })).toThrow(/默认知识库/);
  });
});
