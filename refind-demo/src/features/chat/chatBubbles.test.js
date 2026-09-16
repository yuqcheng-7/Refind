import { describe, expect, it } from 'vitest';
import { applyBubbleDeletes } from './chatBubbles.js';

describe('applyBubbleDeletes', () => {
  const messages = [
    {
      id: 'a1',
      userMessageId: 'u1',
      question: '问题一',
      answer: '回答一',
      citations: [{ order: 1 }],
    },
    {
      id: 'a2',
      userMessageId: 'u2',
      question: '问题二',
      answer: '回答二',
      citations: [],
    },
  ];

  it('removes a whole turn when the user bubble is selected', () => {
    const result = applyBubbleDeletes(messages, ['a1-user'], {
      userId: (message) => `${message.id}-user`,
      answerId: (message) => `${message.id}-answer`,
    });
    expect(result.messages).toEqual([messages[1]]);
    expect(result.removedMessageIds).toEqual(['u1', 'a1']);
  });

  it('clears only the answer when the answer bubble is selected', () => {
    const result = applyBubbleDeletes(messages, ['a2-answer'], {
      userId: (message) => `${message.id}-user`,
      answerId: (message) => `${message.id}-answer`,
    });
    expect(result.messages).toEqual([
      messages[0],
      { ...messages[1], answer: '', citations: [], failed: false },
    ]);
    expect(result.removedMessageIds).toEqual(['a2']);
  });

  it('supports kb bubble id prefixes', () => {
    const result = applyBubbleDeletes(messages, ['kb-a1-user', 'kb-a1-answer'], {
      userId: (message) => `kb-${message.id}-user`,
      answerId: (message) => `kb-${message.id}-answer`,
    });
    expect(result.messages).toEqual([messages[1]]);
    expect(result.removedMessageIds).toEqual(['u1', 'a1']);
  });
});
