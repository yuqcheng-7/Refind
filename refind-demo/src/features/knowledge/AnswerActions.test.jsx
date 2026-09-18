import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerActions, buildInspirationCardPayload } from './AnswerActions.jsx';
import { prependInspirationCard } from '../../lib/api/notes.js';

afterEach(cleanup);

const ragAnswer = {
  id: 'ans-rag-1',
  content: '先看增长策略[1]，再看投放节奏[2]。',
  questionSnapshot: '怎么做内容增长？',
  answerMode: 'rag',
  conversationId: 'conv-1',
  sourceMessageId: 'msg-1',
  sourceKnowledgeBaseIds: ['kb-1'],
  sourceKnowledgeBaseNames: ['增长知识库'],
  citations: [
    { order: 1, label: '小红书增长策略', materialId: 'mat-1', excerpt: '冷启动先做垂类' },
    { order: 2, label: '投放节奏手册', materialId: 'mat-2', excerpt: '周中加预算' },
  ],
};

const generalAnswer = {
  id: 'ans-gen-1',
  content: '这是一段通用回答，没有资料引用。',
  questionSnapshot: '随便聊聊',
  answerMode: 'general',
  conversationId: 'conv-2',
  sourceMessageId: 'msg-2',
  // Leftover citation must not leak into general saves.
  citation: { label: '伪造资料', sourceId: 'fake-mat-1', materialId: 'fake-mat-1' },
  citations: [{ order: 1, label: '伪造资料', materialId: 'fake-mat-1', excerpt: '不应出现' }],
};

describe('buildInspirationCardPayload', () => {
  it('includes RAG citation snapshot with material ids for a whole-answer save', () => {
    const payload = buildInspirationCardPayload(ragAnswer, ragAnswer.content);

    expect(payload).toMatchObject({
      contentSnapshot: ragAnswer.content,
      questionSnapshot: '怎么做内容增长？',
      answerMode: 'rag',
      sourceMessageId: 'msg-1',
      sourceConversationId: 'conv-1',
      sourceKnowledgeBaseIds: ['kb-1'],
      sourceKnowledgeBaseNames: ['增长知识库'],
    });
    expect(payload.citationSnapshot).toEqual([
      expect.objectContaining({
        order: 1,
        label: '小红书增长策略',
        materialId: 'mat-1',
        excerpt: '冷启动先做垂类',
      }),
      expect.objectContaining({
        order: 2,
        label: '投放节奏手册',
        materialId: 'mat-2',
        excerpt: '周中加预算',
      }),
    ]);
    expect(payload.citationSnapshot.every((item) => item.materialId || item.sourceId)).toBe(true);
  });

  it('keeps only citations referenced by a selected fragment', () => {
    const payload = buildInspirationCardPayload(ragAnswer, '再看投放节奏[2]。');

    expect(payload.citationSnapshot).toEqual([
      expect.objectContaining({
        order: 2,
        label: '投放节奏手册',
        materialId: 'mat-2',
      }),
    ]);
    expect(payload.citation).toMatchObject({ order: 2, materialId: 'mat-2' });
  });

  it('keeps general-mode saves free of fake material citations', () => {
    const payload = buildInspirationCardPayload(generalAnswer, generalAnswer.content);

    expect(payload.answerMode).toBe('general');
    expect(payload.questionSnapshot).toBe('随便聊聊');
    expect(payload.sourceMessageId).toBe('msg-2');
    expect(payload.sourceConversationId).toBe('conv-2');
    expect(payload.citationSnapshot).toBeNull();
    expect(payload.citation).toBeFalsy();
    expect(JSON.stringify(payload)).not.toMatch(/fake-mat|伪造资料/);
  });
});

describe('AnswerActions save payload', () => {
  it('passes a RAG citation snapshot when saving the whole answer', async () => {
    const onSaveCard = vi.fn();
    render(
      <AnswerActions answer={ragAnswer} onSaveCard={onSaveCard}>
        <p>{ragAnswer.content}</p>
      </AnswerActions>,
    );

    await userEvent.click(screen.getByRole('button', { name: '收藏整条回答' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '保存为灵感卡片' }));

    expect(onSaveCard).toHaveBeenCalledTimes(1);
    const payload = onSaveCard.mock.calls[0][0];
    expect(payload.answerMode).toBe('rag');
    expect(payload.citationSnapshot).toHaveLength(2);
    expect(payload.citationSnapshot.map((item) => item.materialId)).toEqual(['mat-1', 'mat-2']);
  });

  it('passes a clean general payload with no citation snapshot', async () => {
    const onSaveCard = vi.fn();
    render(
      <AnswerActions answer={generalAnswer} onSaveCard={onSaveCard}>
        <p>{generalAnswer.content}</p>
      </AnswerActions>,
    );

    await userEvent.click(screen.getByRole('button', { name: '收藏整条回答' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '保存为灵感卡片' }));

    const payload = onSaveCard.mock.calls[0][0];
    expect(payload.answerMode).toBe('general');
    expect(payload.citationSnapshot).toBeNull();
    expect(payload.citation).toBeFalsy();
  });
});

describe('save path list refresh', () => {
  it('prepends the saved card so the inspiration list shows it immediately', () => {
    const existing = [{ id: 'card-old', contentSnapshot: '旧卡片' }];
    const saved = {
      id: 'card-new',
      contentSnapshot: ragAnswer.content,
      answerMode: 'rag',
      citationSnapshot: [
        { order: 1, label: '小红书增长策略', materialId: 'mat-1' },
      ],
    };

    expect(prependInspirationCard(existing, saved)).toEqual([saved, existing[0]]);
    expect(prependInspirationCard([saved, existing[0]], saved)).toEqual([saved, existing[0]]);
  });
});
