import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMaterialSignedUrl } = vi.hoisted(() => ({
  createMaterialSignedUrl: vi.fn(),
}));
const { renderPdfCoverDataUrl } = vi.hoisted(() => ({
  renderPdfCoverDataUrl: vi.fn(),
}));
const { extractOfficeEmbedCoverDataUrl } = vi.hoisted(() => ({
  extractOfficeEmbedCoverDataUrl: vi.fn(),
}));

vi.mock('../../lib/api/materials.js', () => ({
  createMaterialSignedUrl,
}));
vi.mock('./renderPdfCover.js', () => ({
  renderPdfCoverDataUrl,
}));
vi.mock('./extractOfficeEmbedCover.js', () => ({
  extractOfficeEmbedCoverDataUrl,
}));

import { MaterialListCover } from './MaterialListCover.jsx';
import { clearListCoverCache } from './listCoverCache.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('MaterialListCover', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearListCoverCache();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders remote cover image when coverImageUrl is set', async () => {
    const { container } = render(
      <MaterialListCover
        material={{ id: '1', coverImageUrl: TINY_PNG }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', TINY_PNG);
    });
    expect(screen.queryByText('icon')).not.toBeInTheDocument();
  });

  it('falls back to icon when no cover is available', () => {
    render(
      <MaterialListCover
        material={{ id: '2', inputType: 'note' }}
        fallback={<span>icon</span>}
      />,
    );
    expect(screen.getByText('icon')).toBeInTheDocument();
  });

  it('signs stored cover object keys', async () => {
    createMaterialSignedUrl.mockResolvedValue(TINY_PNG);
    const { container } = render(
      <MaterialListCover
        material={{ id: '3', coverStorageObjectKey: 'u/a.cover.jpg', inputType: 'docx' }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', TINY_PNG);
    });
    expect(createMaterialSignedUrl).toHaveBeenCalledWith('u/a.cover.jpg');
  });

  it('renders pdf first-page cover for uploaded pdfs', async () => {
    createMaterialSignedUrl.mockResolvedValue('https://signed.example/a.pdf');
    renderPdfCoverDataUrl.mockResolvedValue(TINY_PNG);
    const { container } = render(
      <MaterialListCover
        material={{ id: '4', inputType: 'pdf', storageObjectKey: 'u/a.pdf' }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', TINY_PNG);
    });
    expect(renderPdfCoverDataUrl).toHaveBeenCalled();
  });

  it('renders text cover for markdown materials', async () => {
    const { container } = render(
      <MaterialListCover
        material={{ id: '6', inputType: 'markdown', body: '# 标题\n正文预览' }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src') || '').toMatch(/^data:image\//);
    });
  });

  it('falls back to DOC text cover when office embed has no image', async () => {
    extractOfficeEmbedCoverDataUrl.mockResolvedValue('');
    createMaterialSignedUrl.mockResolvedValue('https://signed.example/a.docx');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    const { container } = render(
      <MaterialListCover
        material={{ id: '8', inputType: 'docx', storageObjectKey: 'u/a.docx', body: 'Word 正文预览内容' }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src') || '').toMatch(/^data:image\/svg\+xml/);
    });
  });

  it('falls back to PDF label cover when pdf render returns empty', async () => {
    renderPdfCoverDataUrl.mockResolvedValue('');
    createMaterialSignedUrl.mockResolvedValue('https://signed.example/a.pdf');
    const { container } = render(
      <MaterialListCover
        material={{ id: '9', inputType: 'pdf', storageObjectKey: 'u/a.pdf' }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src') || '').toMatch(/^data:image\/svg\+xml/);
    });
  });

  it('renders platform cover for mainstream links without real covers', async () => {
    const { container } = render(
      <MaterialListCover
        material={{ id: '7', kind: 'link', inputType: 'link', platform: 'zhihu', url: 'https://www.zhihu.com/q/1' }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src') || '').toMatch(/^data:image\/svg\+xml/);
    });
  });

  it('prefers stored cover over platform mark for xhs links', async () => {
    createMaterialSignedUrl.mockResolvedValueOnce('https://signed.example/xhs.cover.jpg');
    const { container } = render(
      <MaterialListCover
        material={{
          id: '10',
          kind: 'link',
          inputType: 'link',
          platform: 'xhs',
          url: 'https://www.xiaohongshu.com/explore/1',
          coverImageUrl: 'https://cdn.example.com/old-note.jpg',
          coverStorageObjectKey: 'u/xhs.cover.jpg',
        }}
        fallback={<span>icon</span>}
      />,
    );
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img?.getAttribute('src') || '').toBe('https://signed.example/xhs.cover.jpg');
    });
    expect(createMaterialSignedUrl).toHaveBeenCalledWith('u/xhs.cover.jpg');
  });

  it('reuses cached cover on remount without signing again', async () => {
    createMaterialSignedUrl.mockResolvedValue('https://signed.example/cached.cover.jpg');
    const material = {
      id: '11',
      coverStorageObjectKey: 'u/cached.cover.jpg',
      inputType: 'docx',
    };

    const first = render(
      <MaterialListCover material={material} fallback={<span>icon</span>} />,
    );
    await waitFor(() => {
      expect(first.container.querySelector('img')).toHaveAttribute(
        'src',
        'https://signed.example/cached.cover.jpg',
      );
    });
    expect(createMaterialSignedUrl).toHaveBeenCalledTimes(1);
    first.unmount();

    createMaterialSignedUrl.mockClear();
    const second = render(
      <MaterialListCover material={material} fallback={<span>icon</span>} />,
    );
    expect(second.container.querySelector('img')).toHaveAttribute(
      'src',
      'https://signed.example/cached.cover.jpg',
    );
    expect(createMaterialSignedUrl).not.toHaveBeenCalled();
  });
});
