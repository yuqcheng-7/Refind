import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaterialIngest } from './MaterialIngest.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MaterialIngest', () => {
  it('offers paste-link and upload-file from 添加资料', async () => {
    render(<MaterialIngest base="默认知识库" onMaterialReady={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));

    expect(screen.getByRole('menuitem', { name: '粘贴链接' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '上传文件' })).toBeVisible();
  });

  it('dismisses its menu and link popover on outside pointerdown and Escape', async () => {
    const user = userEvent.setup();
    render(<><MaterialIngest base="默认知识库" onMaterialReady={vi.fn()} /><button type="button">页面其他位置</button></>);

    await user.click(screen.getByRole('button', { name: '添加资料' }));
    expect(screen.getByRole('menu')).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('button', { name: '页面其他位置' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '添加资料' }));
    await user.click(screen.getByRole('menuitem', { name: '粘贴链接' }));
    expect(screen.getByPlaceholderText('https://')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByPlaceholderText('https://')).not.toBeInTheDocument();
  });

  it('adds multiple selected files as current-base parsing cards', async () => {
    render(<MaterialIngest base="增长与运营案例" onMaterialReady={vi.fn()} transitionMs={10} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), [
      new File(['one'], '增长复盘.pdf', { type: 'application/pdf' }),
      new File(['two'], '访谈纪要.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    ]);

    expect(screen.getByText('增长复盘.pdf')).toBeVisible();
    expect(screen.getByText('访谈纪要.docx')).toBeVisible();
    expect(screen.getAllByText('增长与运营案例')).toHaveLength(2);
    expect(screen.getAllByText(/解析中/)).toHaveLength(2);
  });

  it('creates a processing stub immediately when an API callback is provided', async () => {
    let resolveStub;
    const onCreateStub = vi.fn(() => new Promise((resolve) => { resolveStub = resolve; }));
    render(<MaterialIngest base="默认知识库" onCreateStub={onCreateStub} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['source'], '待处理资料.pdf'));

    expect(onCreateStub).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'file',
      title: '待处理资料.pdf',
      base: '默认知识库',
    }));
    expect(screen.getByText('处理中')).toBeVisible();
    resolveStub();
  });

  it('retains a server-side parse failure for retrying the same material', async () => {
    const onCreateStub = vi.fn().mockResolvedValue({ id: 'material-1', status: 'failed' });
    render(<MaterialIngest base="默认知识库" onCreateStub={onCreateStub} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['source'], '待重试资料.txt'));

    expect(await screen.findByText('解析失败')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '重试：待重试资料.txt' }));
    expect(onCreateStub).toHaveBeenLastCalledWith(expect.objectContaining({ materialId: 'material-1' }));
  });

  it('retains a created material ID when parsing rejects after stub creation', async () => {
    const parseError = Object.assign(new Error('解析服务不可用'), { materialId: 'material-1' });
    const onCreateStub = vi.fn().mockRejectedValue(parseError);
    const onDelete = vi.fn().mockResolvedValue();
    render(<MaterialIngest base="默认知识库" onCreateStub={onCreateStub} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['source'], '解析中断资料.txt'));

    await screen.findByText('解析失败');
    await userEvent.click(screen.getByRole('button', { name: '重试：解析中断资料.txt' }));
    expect(onCreateStub).toHaveBeenLastCalledWith(expect.objectContaining({ materialId: 'material-1' }));

    await userEvent.click(screen.getByRole('button', { name: '删除：解析中断资料.txt' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ materialId: 'material-1' }));
  });

  it('inserts a completed card into the base selected when it was queued', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onMaterialReady = vi.fn();
    function Harness() {
      const [base, setBase] = useState('默认知识库');
      return <><button type="button" onClick={() => setBase('产品与设计资料')}>切换知识库</button><MaterialIngest base={base} onMaterialReady={onMaterialReady} transitionMs={1000} /></>;
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['ready'], '原库资料.pdf'));
    await userEvent.click(screen.getByRole('button', { name: '切换知识库' }));
    await vi.advanceTimersByTimeAsync(1100);

    expect(onMaterialReady).toHaveBeenCalledWith(expect.objectContaining({ base: '默认知识库' }));
  });

  it('removes a ready card after adding it to the knowledge base', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onMaterialReady = vi.fn();
    render(<MaterialIngest base="默认知识库" onMaterialReady={onMaterialReady} transitionMs={10} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['ready'], '已完成资料.pdf'));
    await vi.advanceTimersByTimeAsync(20);

    expect(onMaterialReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('已完成资料.pdf')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('资料解析队列')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加资料' })).toBeVisible();
  });

  it('retains a failed card with retry and delete controls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MaterialIngest base="默认知识库" onMaterialReady={vi.fn()} transitionMs={10} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['bad'], '损坏资料.fail.pdf'));
    await vi.advanceTimersByTimeAsync(20);

    expect(screen.getByText('解析失败')).toBeVisible();
    expect(screen.getByRole('button', { name: '重试：损坏资料.fail.pdf' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '删除：损坏资料.fail.pdf' }));
    expect(screen.queryByText('损坏资料.fail.pdf')).not.toBeInTheDocument();
  });

  it('persists deletion for a failed server-side material', async () => {
    const onDelete = vi.fn().mockResolvedValue();
    const onCreateStub = vi.fn().mockResolvedValue({ id: 'material-1', status: 'failed' });
    render(<MaterialIngest base="默认知识库" onCreateStub={onCreateStub} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['source'], '待删除资料.txt'));
    await screen.findByText('解析失败');
    await userEvent.click(screen.getByRole('button', { name: '删除：待删除资料.txt' }));

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ materialId: 'material-1' }));
    expect(screen.queryByText('待删除资料.txt')).not.toBeInTheDocument();
  });

  it('downgrades to attachment-only after three consecutive failures', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MaterialIngest base="默认知识库" onMaterialReady={vi.fn()} transitionMs={10} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '上传文件' }));
    await userEvent.upload(screen.getByLabelText('选择资料文件'), new File(['bad'], '反复失败.fail.pdf'));

    await vi.advanceTimersByTimeAsync(20);
    await userEvent.click(screen.getByRole('button', { name: '重试：反复失败.fail.pdf' }));
    await vi.advanceTimersByTimeAsync(20);
    await userEvent.click(screen.getByRole('button', { name: '重试：反复失败.fail.pdf' }));
    await vi.advanceTimersByTimeAsync(20);

    expect(screen.getByText('仅附件')).toBeVisible();
    expect(screen.getByText(/连续 3 次解析失败/)).toBeVisible();
  });

  it('downgrades failed links to link-only after three consecutive failures', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MaterialIngest base="默认知识库" onMaterialReady={vi.fn()} transitionMs={10} />);

    await userEvent.click(screen.getByRole('button', { name: '添加资料' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '粘贴链接' }));
    await userEvent.type(screen.getByPlaceholderText('https://'), 'https://example.fail');
    await userEvent.click(screen.getByRole('button', { name: '加入队列' }));
    await vi.advanceTimersByTimeAsync(20);
    await userEvent.click(screen.getByRole('button', { name: '重试：https://example.fail' }));
    await vi.advanceTimersByTimeAsync(20);
    await userEvent.click(screen.getByRole('button', { name: '重试：https://example.fail' }));
    await vi.advanceTimersByTimeAsync(20);

    expect(screen.getByText('仅链接')).toBeVisible();
  });
});
