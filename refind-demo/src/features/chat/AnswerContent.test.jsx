import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerContent } from './AnswerContent.jsx';

afterEach(cleanup);

describe('AnswerContent', () => {
  it('keeps list numbers with their text and opens material from hover card', async () => {
    const onOpenMaterial = vi.fn();
    const user = userEvent.setup();
    render(
      <AnswerContent
        text={'根据资料如下：\n1.\n收藏知识：上传文件[1]\n2.\n管理知识：建文件夹'}
        citations={[{ order: 1, label: 'ima指南', materialId: 'mat-1', excerpt: '收藏知识的步骤…' }]}
        onOpenMaterial={onOpenMaterial}
      />,
    );

    expect(screen.getByText(/收藏知识：上传文件/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '查看资料' })).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: '引用 1：ima指南' }));
    const card = await screen.findByRole('dialog', { name: '引用 1：ima指南' });
    expect(card).toBeVisible();
    expect(screen.getByText('收藏知识的步骤…')).toBeVisible();

    await user.click(card);
    expect(onOpenMaterial).toHaveBeenCalledWith('mat-1');
  });

  it('opens only the hovered citation instance even when orders repeat', async () => {
    const user = userEvent.setup();
    render(
      <AnswerContent
        text={'第一句[1]。第二句也引用[1]。'}
        citations={[{ order: 1, label: '训练营介绍', materialId: 'mat-1', excerpt: '我们是谁……很长很长的正文'.repeat(20) }]}
      />,
    );

    const markers = screen.getAllByRole('button', { name: '引用 1：训练营介绍' });
    expect(markers).toHaveLength(2);

    await user.hover(markers[0]);
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].textContent.length).toBeLessThan(400);
  });

  it('strips markdown ornaments in conversational mode', () => {
    render(
      <AnswerContent
        conversational
        text={'RAG 流程如下：\n\n**\n1. 准备阶段**\n**\n2. 检索阶段**'}
      />,
    );
    expect(screen.getByText('准备阶段')).toBeVisible();
    expect(screen.getByText('检索阶段')).toBeVisible();
    expect(document.body.textContent).not.toContain('*');
  });

  it('opens web source urls from online answers', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <AnswerContent
        text="根据最新消息…"
        webSources={[{ order: 1, title: '气象台', url: 'https://example.com/weather' }]}
        conversational
        interactive
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '来源 1：气象台' }));
    expect(open).toHaveBeenCalledWith('https://example.com/weather', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
