import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaterialPreviewPage } from './MaterialPreviewPage.jsx';
import { materialDemo } from './materialDemo.js';

const { demoSession, supabase } = vi.hoisted(() => {
  const session = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    user: { id: 'test-user-1', email: 'demo@refind.test' },
  };
  return {
    demoSession: session,
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

vi.mock('../../lib/supabaseClient.js', () => ({ supabase }));

vi.mock('../../lib/api/auth.js', () => ({
  getSession: () => ({
    then: (resolve) => {
      resolve({ data: { session: demoSession }, error: null });
      return { catch() {} };
    },
  }),
  signOut: async () => ({ error: null }),
}));

vi.mock('../../lib/api/knowledge.js', () => {
  const demoKnowledgeBases = [
    { id: 'base-default', name: '默认知识库', type: 'default' },
    { id: 'base-growth', name: '增长与运营案例', type: 'custom' },
    { id: 'base-product', name: '产品与设计资料', type: 'custom' },
  ];
  return {
    listKnowledgeBases: async () => demoKnowledgeBases,
    createKnowledgeBase: async ({ name }) => ({ id: `base-${name}`, name, type: 'custom' }),
    filterKnowledgeBaseNames: (names, query = '') => {
      const needle = String(query || '').trim().toLowerCase();
      if (!needle) return names;
      return names.filter((name) => String(name).toLowerCase().includes(needle));
    },
  };
});

vi.mock('../../lib/api/materials.js', () => ({
  listMaterials: async () => materialDemo.map((item, index) => ({
    ...item,
    knowledgeBaseId: 'base-default',
    inputType: item.kind === 'link' ? 'link' : 'file',
    status: 'ready',
    createdAt: `2026-09-${String(10 - index).padStart(2, '0')}T00:00:00.000Z`,
  })),
  createMaterialStub: async () => null,
  deleteMaterial: async () => undefined,
}));

import { App } from '../../App.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('material previews', () => {
  it('shows the complete material title and AI summary when hovering a material row', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: materialDemo[0].fileName }));

    expect(screen.getByRole('tooltip')).toHaveTextContent(materialDemo[0].fileName);
    expect(screen.getByRole('tooltip')).toHaveTextContent(materialDemo[0].summary);
  });

  it('opens the in-app preview route when a material is clicked', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    await userEvent.click(screen.getByRole('button', { name: materialDemo[0].fileName }));

    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/#\/material\/m1$/),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('offers an original-site action for link previews', () => {
    const material = materialDemo.find((item) => item.kind === 'link' && item.platform === 'xhs');
    render(<MaterialPreviewPage material={material} />);

    expect(screen.getByRole('heading', { name: material.title })).toBeVisible();
    expect(screen.getByText('来源')).toBeVisible();
    expect(screen.getByText('xiaohongshu.com')).toBeVisible();
    expect(screen.getByText('类型')).toBeVisible();
    expect(screen.getByText('小红书')).toBeVisible();
    expect(screen.getByText('AI 摘要')).toBeVisible();
    expect(screen.getByText(material.summary)).toBeVisible();
    expect(screen.getByText('原文')).toBeVisible();
    expect(screen.getByText(/冷启动阶段优先聚焦/)).toBeVisible();
    expect(screen.getByRole('link', { name: '在原站打开' })).toHaveAttribute('href', material.url);
  });

  it('shows video player, caption, and subtitles for bilibili materials', () => {
    const material = materialDemo.find((item) => item.platform === 'bilibili');
    render(<MaterialPreviewPage material={material} />);

    expect(screen.getByText('B 站视频')).toBeVisible();
    expect(screen.getByTitle(`${material.title}播放器`)).toBeInTheDocument();
    expect(screen.getByText('文案 / 简介')).toBeVisible();
    expect(screen.getByText(/关注续费与扩展使用/)).toBeVisible();
    expect(screen.getByText('字幕')).toBeVisible();
    expect(screen.getByText(/从 0 到 1 的增长路径/)).toBeVisible();
  });

  it('hides the subtitles section when a video has none', () => {
    const material = {
      ...materialDemo.find((item) => item.platform === 'bilibili'),
      subtitles: '',
    };
    render(<MaterialPreviewPage material={material} />);

    expect(screen.queryByText('字幕')).not.toBeInTheDocument();
    expect(screen.getByText('文案 / 简介')).toBeVisible();
  });

  it('does not offer an original-site action for file previews', () => {
    const material = materialDemo.find((item) => item.kind === 'file');
    render(<MaterialPreviewPage material={material} />);

    expect(screen.getByText('本地上传')).toBeVisible();
    expect(screen.getByText('PDF')).toBeVisible();
    expect(screen.queryByRole('link', { name: '在原站打开' })).not.toBeInTheDocument();
  });
});
