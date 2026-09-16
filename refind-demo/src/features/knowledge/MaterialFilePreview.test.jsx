import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialPreviewPage } from './MaterialPreviewPage.jsx';
import { getFilePreviewMode, hasOriginalFile } from './MaterialFilePreview.jsx';

const createMaterialSignedUrl = vi.fn();

vi.mock('../../lib/api/materials.js', async () => {
  const actual = await vi.importActual('../../lib/api/materials.js');
  return {
    ...actual,
    createMaterialSignedUrl: (...args) => createMaterialSignedUrl(...args),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  createMaterialSignedUrl.mockReset();
  createMaterialSignedUrl.mockResolvedValue('https://signed.example/file.pdf');
});

describe('file preview modes', () => {
  it('picks typed viewers from input type and storage key', () => {
    expect(getFilePreviewMode({ inputType: 'pdf', storageObjectKey: 'a/b.pdf' })).toBe('pdf');
    expect(getFilePreviewMode({ inputType: 'image', storageObjectKey: 'a/b.png' })).toBe('image');
    expect(getFilePreviewMode({ inputType: 'docx', storageObjectKey: 'a/b.docx' })).toBe('docx');
    expect(getFilePreviewMode({ inputType: 'markdown', body: '# hi' })).toBe('markdown');
    expect(getFilePreviewMode({ inputType: 'txt' })).toBe('plaintext');
    expect(getFilePreviewMode({ inputType: 'pptx', storageObjectKey: 'a/b.pptx' })).toBe('office-pdf');
    expect(getFilePreviewMode({ inputType: 'xlsx', previewStorageObjectKey: 'a/b.xlsx.preview.pdf' })).toBe('office-pdf');
    expect(getFilePreviewMode({ inputType: 'pptx' })).toBe('structured');
    expect(hasOriginalFile({ kind: 'file', storageObjectKey: 'a/b.pdf' })).toBe(true);
    expect(hasOriginalFile({ kind: 'link', storageObjectKey: '' })).toBe(false);
  });
});

describe('MaterialPreviewPage file actions', () => {
  it('offers open-original for uploaded files with storage key', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <MaterialPreviewPage
        material={{
          kind: 'file',
          inputType: 'pdf',
          storageObjectKey: 'user/doc.pdf',
          title: '演讲稿.pdf',
          typeLabel: 'PDF',
          body: '提取到的正文',
          status: 'ready',
          time: '刚刚',
        }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /打开原文件/ }));
    expect(createMaterialSignedUrl).toHaveBeenCalledWith('user/doc.pdf');
    expect(open).toHaveBeenCalledWith(
      'https://signed.example/file.pdf',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('renders markdown formatting for markdown materials', () => {
    render(
      <MaterialPreviewPage
        material={{
          kind: 'file',
          inputType: 'markdown',
          title: '笔记.md',
          typeLabel: 'Markdown',
          body: '# 标题\n\n一段 **加粗** 正文',
          status: 'ready',
          time: '刚刚',
        }}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: '标题' })).toBeVisible();
    expect(screen.getByText('加粗')).toBeVisible();
  });

  it('renders pptx slides as structured cards when convert unavailable', () => {
    render(
      <MaterialPreviewPage
        material={{
          kind: 'file',
          inputType: 'pptx',
          title: '路演.pptx',
          typeLabel: 'PPT',
          body: '【幻灯片 1】\n开场\n\n【幻灯片 2】\n结尾',
          status: 'ready',
          time: '刚刚',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '幻灯片 1' })).toBeVisible();
    expect(screen.getByText('开场')).toBeVisible();
    expect(screen.getByRole('heading', { name: '幻灯片 2' })).toBeVisible();
  });
});
