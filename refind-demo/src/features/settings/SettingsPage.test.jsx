import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage.jsx';

const connectPlatform = vi.fn(async () => ({}));
const disconnectPlatform = vi.fn(async () => ({}));
const waitForPlatformLogin = vi.fn(async () => ({
  status: 'success',
  accountDisplayName: '知夏',
  sessionPayload: JSON.stringify({ cookies: [{ name: 'a', value: '1' }], platform: 'xhs' }),
}));
const logoutPlatformParser = vi.fn(async () => {});

vi.mock('../../lib/api/platformConnections.js', () => ({
  listPlatformConnections: async () => ([
    {
      code: 'xhs',
      name: '小红书',
      connection: {
        platform: 'xhs',
        accountName: '',
        status: 'disconnected',
        statusLabel: '未连接',
        lastVerifiedLabel: '',
      },
    },
    {
      code: 'zhihu',
      name: '知乎',
      connection: {
        platform: 'zhihu',
        accountName: '',
        status: 'disconnected',
        statusLabel: '未连接',
        lastVerifiedLabel: '',
      },
    },
    {
      code: 'wechat_mp',
      name: '微信公众号',
      connection: {
        platform: 'wechat_mp',
        accountName: '',
        status: 'disconnected',
        statusLabel: '未连接',
        lastVerifiedLabel: '',
      },
    },
  ]),
  connectPlatform: (...args) => connectPlatform(...args),
  reconnectPlatform: async () => ({}),
  disconnectPlatform: (...args) => disconnectPlatform(...args),
}));

vi.mock('../../lib/api/platformLogin.js', () => ({
  waitForPlatformLogin: (...args) => waitForPlatformLogin(...args),
  logoutPlatformParser: (...args) => logoutPlatformParser(...args),
  importPlatformCookies: async () => ({ accountDisplayName: '', verified: true }),
  resendPlatformLoginSms: async () => true,
  submitPlatformLoginSms: async () => true,
}));

vi.mock('../../lib/api/platformExtension.js', () => ({
  pingRefindExtension: async () => false,
  fetchSessionFromExtension: async () => {
    throw new Error('no extension in test');
  },
  openPlatformInExtension: async () => {},
  buildSessionPayloadFromExtension: () => '{}',
}));

vi.mock('../../lib/api/profiles.js', () => ({
  updateMyDisplayName: async (name) => ({
    id: 'u1',
    email: 'demo@refind.test',
    display_name: name.trim(),
  }),
}));

vi.mock('../../lib/api/auth.js', () => ({
  changePassword: async () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('shows real-login connect for xhs/zhihu and 无需登录 for wechat', async () => {
    const onBack = vi.fn();
    render(
      <SettingsPage
        email="demo@refind.test"
        displayName="拾藏用户"
        initialTab="platforms"
        onBack={onBack}
        onSignOut={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: '设置' })).toBeVisible();
    expect(screen.getByText('小红书')).toBeVisible();
    expect(screen.getByText('知乎')).toBeVisible();
    expect(screen.getByText('微信公众号')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '连接' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '无需登录' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '粘贴 Cookie' })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '连接' })[0]);
    expect(await screen.findByText(/已连接/)).toBeVisible();
    expect(waitForPlatformLogin).toHaveBeenCalledWith(
      'xhs',
      expect.objectContaining({ onUpdate: expect.any(Function) }),
    );
    expect(connectPlatform).toHaveBeenCalledWith(
      'xhs',
      expect.objectContaining({
        accountDisplayName: '知夏',
        sessionPayload: expect.stringContaining('cookies'),
      }),
    );

    await userEvent.click(screen.getByRole('tab', { name: '账户与安全' }));
    expect(screen.getByText('demo@refind.test')).toBeVisible();
    expect(screen.getByText('拾藏用户')).toBeVisible();
    expect(screen.getByRole('heading', { name: '会话历史' })).toBeVisible();
    expect(screen.getByText(/会话历史保留最近 90 天/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(onBack).toHaveBeenCalled();
  });
});
