import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerContent } from './AnswerContent.jsx';

afterEach(cleanup);

describe('AnswerContent', () => {
  it('bolds short list labels and leaves body normal', () => {
    render(
      <AnswerContent
        text={'要点：\n· 精准问答与答案溯源：这对应了RAG框架中的生成环节。\n1. 模型选择与优化\n端侧要选小模型。'}
      />,
    );
    const labels = document.querySelectorAll('.answer-content__list-label');
    expect([...labels].map((node) => node.textContent)).toEqual([
      '精准问答与答案溯源：',
      '模型选择与优化：',
    ]);
    expect(screen.getByText(/这对应了RAG框架中的生成环节/)).toBeVisible();
    expect(screen.getByText(/端侧要选小模型/)).toBeVisible();
  });

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

    expect(document.body.textContent).toMatch(/收藏知识：\s*上传文件/);
    expect(document.querySelector('.answer-content__list-label')?.textContent).toBe('收藏知识：');
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

  it('renders bold code headings and lists for RAG', () => {
    render(
      <AnswerContent
        text={'一、概述\n\n见**重点**与说明，命令 `npm test`。\n\n· 条目甲\n· 条目乙\n\n---\n\n1. 第一步\n2. 第二步'}
      />,
    );
    expect(screen.getByRole('heading', { name: '一、概述' })).toBeVisible();
    expect(screen.getByText('重点').closest('strong')).toBeTruthy();
    expect(screen.getByText('npm test').tagName).toBe('CODE');
    expect(screen.getByText('条目甲').closest('ul')).toBeTruthy();
    expect(screen.getByText('第一步').closest('ol')).toBeTruthy();
  });

  it('keeps citations inside bold interactive', async () => {
    const user = userEvent.setup();
    render(
      <AnswerContent
        text={'结论是 **重点结论[1]**。'}
        citations={[{ order: 1, label: '资料A', materialId: 'mat-1', excerpt: '摘录内容' }]}
      />,
    );
    const cite = screen.getByRole('button', { name: '引用 1：资料A' });
    expect(cite).toBeVisible();
    await user.hover(cite);
    expect(await screen.findByRole('dialog', { name: '引用 1：资料A' })).toBeVisible();
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

  it('does not open web source urls when not interactive', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <AnswerContent
        text="根据最新消息…"
        webSources={[{ order: 1, title: '气象台', url: 'https://example.com/weather' }]}
        conversational
        interactive={false}
      />,
    );
    expect(screen.queryByRole('button', { name: '来源 1：气象台' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('来源 1：气象台'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
