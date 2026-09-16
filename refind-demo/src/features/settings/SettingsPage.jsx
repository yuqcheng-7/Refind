import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, LoaderCircle, LogOut } from 'lucide-react';
import { changePassword } from '../../lib/api/auth.js';
import {
  connectPlatform,
  disconnectPlatform,
  listPlatformConnections,
} from '../../lib/api/platformConnections.js';
import { logoutPlatformParser, waitForPlatformLogin } from '../../lib/api/platformLogin.js';
import { isNoLoginPlatform, supportsRealLogin } from '../../lib/api/platformSession.js';
import { updateMyDisplayName } from '../../lib/api/profiles.js';

const TABS = [
  { id: 'platforms', label: '连接内容平台' },
  { id: 'account', label: '账户与安全' },
];

const EMPTY_PASSWORD_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function statusClass(status) {
  return status === 'connected' ? 'is-connected' : 'is-disconnected';
}

function platformStatusLabel(item, { realLogin, noLogin }) {
  if (noLogin) return '无需登录';
  if (realLogin) return item.connection.statusLabel;
  return '即将支持';
}

function displayAccountName(name, { connected = false } = {}) {
  const text = String(name || '').trim();
  if (!text) return connected ? '未获取到昵称' : '—';
  if (/^(小红书|抖音|知乎|B 站|微信公众号)账号$/.test(text)) {
    return connected ? '未获取到昵称' : '—';
  }
  return text;
}

export function SettingsPage({
  email = '',
  displayName = '',
  initialTab = 'platforms',
  focusPlatform = '',
  onBack,
  onSignOut,
  onDeleteAccount,
  onDisplayNameUpdated,
}) {
  const [tab, setTab] = useState(initialTab === 'account' ? 'account' : 'platforms');
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyCode, setBusyCode] = useState('');
  const [notice, setNotice] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [savingPassword, setSavingPassword] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listPlatformConnections();
      setPlatforms(rows);
    } catch (err) {
      setError(err?.message || '加载平台连接失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setTab(initialTab === 'account' ? 'account' : 'platforms');
  }, [initialTab]);

  useEffect(() => {
    if (!editingName) setNameDraft(displayName);
  }, [displayName, editingName]);

  const runAction = async (platformCode, action) => {
    if (!supportsRealLogin(platformCode) && (action === 'connect' || action === 'reconnect')) {
      setError('该平台真实登录即将支持');
      return;
    }

    setBusyCode(platformCode);
    setNotice('');
    setError('');
    try {
      if (action === 'connect' || action === 'reconnect') {
        setNotice(
          platformCode === 'zhihu'
            ? '将弹出独立浏览器（知乎专用配置，可复用上次登录）。请扫码或验证码登录；成功后窗口会自动关闭，Cookie 会写入本机供解析使用。'
            : '将弹出独立浏览器窗口。请用 App 扫码或手机验证码完成登录；未登录前请勿关闭窗口。成功后窗口会自动关闭。',
        );
        const login = await waitForPlatformLogin(platformCode);
        await connectPlatform(platformCode, {
          sessionPayload: login.sessionPayload,
          accountDisplayName: login.accountDisplayName,
        });
        setNotice(action === 'reconnect'
          ? (login.accountDisplayName ? '已重新连接。' : '已重新连接；昵称暂未获取到，不影响解析。')
          : (login.accountDisplayName ? '已连接。解析该平台链接时会优先使用本机会话。' : '已连接；昵称暂未获取到，不影响解析。'));
      } else if (action === 'disconnect') {
        const confirmed = window.confirm('断开后不影响已导入资料，仅影响后续解析。确定断开吗？');
        if (!confirmed) return;
        if (supportsRealLogin(platformCode)) {
          await logoutPlatformParser(platformCode);
        }
        await disconnectPlatform(platformCode);
        setNotice('已断开连接。');
      }
      await refresh();
    } catch (err) {
      setError(err?.message || '操作失败，请稍后重试');
      setNotice('');
    } finally {
      setBusyCode('');
    }
  };

  const startEditName = () => {
    setNameDraft(displayName);
    setEditingName(true);
    setError('');
    setNotice('');
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameDraft(displayName);
  };

  const saveDisplayName = async () => {
    setSavingName(true);
    setError('');
    setNotice('');
    try {
      const updated = await updateMyDisplayName(nameDraft);
      setEditingName(false);
      setNotice('用户名已更新。');
      onDisplayNameUpdated?.(updated);
    } catch (err) {
      setError(err?.message || '更新用户名失败');
    } finally {
      setSavingName(false);
    }
  };

  const startEditPassword = () => {
    setEditingPassword(true);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setError('');
    setNotice('');
  };

  const cancelEditPassword = () => {
    setEditingPassword(false);
    setPasswordForm(EMPTY_PASSWORD_FORM);
  };

  const savePassword = async () => {
    if (!email) {
      setError('当前账户没有可用邮箱，无法修改密码');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSavingPassword(true);
    setError('');
    setNotice('');
    try {
      await changePassword({
        email,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setEditingPassword(false);
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setNotice('密码已更新。');
    } catch (err) {
      setError(err?.message || '修改密码失败');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="settings-page" aria-label="设置">
      <header className="settings-header">
        <button type="button" className="settings-back" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          返回
        </button>
        <h1>设置</h1>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice ? <p className="settings-notice" role="status">{notice}</p> : null}
      {error ? <p className="settings-error" role="alert">{error}</p> : null}

      {tab === 'platforms' ? (
        <div className="settings-panel">
          <p className="settings-hint">
            小红书、抖音、B 站、知乎登录成功后窗口会自动关闭。知乎会复用本机专用浏览器配置：关窗 ≠ 退出拾藏登录态；再点「连接」应仍显示已登录。Cookie 不会同步到日常 Chrome。
            登录窗口里点开文章常被反爬拦截，请把链接粘贴到知识库导入。微信公众号无需登录。
          </p>

          {loading ? (
            <p className="settings-loading"><LoaderCircle size={16} className="is-spin" />加载中…</p>
          ) : (
            <ul className="platform-connection-card">
              {platforms.map((item) => {
                const status = item.connection.status;
                const focused = focusPlatform && focusPlatform === item.code;
                const realLogin = supportsRealLogin(item.code);
                const noLogin = isNoLoginPlatform(item.code);
                const busy = busyCode === item.code;
                return (
                  <li
                    key={item.code}
                    className={`platform-connection-item ${statusClass(status)} ${focused ? 'is-focused' : ''} ${realLogin ? '' : 'is-upcoming'}`}
                  >
                    <div className="platform-connection-body">
                      <span className="platform-connection-name">{item.name}</span>
                      <span className={`platform-connection-status ${noLogin ? 'is-connected' : statusClass(status)}`}>
                        <i aria-hidden="true" />
                        {platformStatusLabel(item, { realLogin, noLogin })}
                      </span>
                      <dl className="platform-connection-meta">
                        <div>
                          <dt>账号</dt>
                          <dd>{realLogin ? displayAccountName(item.connection.accountName, { connected: status === 'connected' }) : '—'}</dd>
                        </div>
                        <div>
                          <dt>最近验证</dt>
                          <dd>{realLogin ? (item.connection.lastVerifiedLabel || '—') : '—'}</dd>
                        </div>
                      </dl>
                      <div className="platform-connection-actions">
                        {noLogin ? (
                          <button type="button" disabled title="公开文章无需登录即可解析">
                            无需登录
                          </button>
                        ) : !realLogin ? (
                          status === 'connected' ? (
                            <button
                              type="button"
                              className="is-danger"
                              disabled={busy}
                              onClick={() => runAction(item.code, 'disconnect')}
                            >
                              断开演示连接
                            </button>
                          ) : (
                            <button type="button" disabled title="该平台真实登录即将支持">
                              即将支持
                            </button>
                          )
                        ) : status === 'disconnected' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runAction(item.code, 'connect')}
                          >
                            {busy ? '等待登录…' : '连接'}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="is-secondary"
                              disabled={busy}
                              onClick={() => runAction(item.code, 'reconnect')}
                            >
                              {busy ? '等待登录…' : '重新连接'}
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              disabled={busy}
                              onClick={() => runAction(item.code, 'disconnect')}
                            >
                              断开
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="settings-panel settings-account-panel">
          <section className="settings-section" aria-labelledby="settings-account-info">
            <h2 id="settings-account-info">账户信息</h2>
            <dl className="settings-card settings-account-facts">
              <div className="settings-account-name-row">
                <dt>用户名</dt>
                <dd>
                  {editingName ? (
                    <div className="settings-name-edit">
                      <input
                        type="text"
                        value={nameDraft}
                        maxLength={30}
                        aria-label="用户名"
                        autoFocus
                        disabled={savingName}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveDisplayName();
                          }
                          if (event.key === 'Escape') cancelEditName();
                        }}
                      />
                      <button type="button" disabled={savingName} onClick={() => void saveDisplayName()}>
                        {savingName ? '保存中…' : '保存'}
                      </button>
                      <button type="button" className="is-secondary" disabled={savingName} onClick={cancelEditName}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="settings-name-view">
                      <span>{displayName || '—'}</span>
                      <button type="button" className="settings-text-action" onClick={startEditName}>
                        修改
                      </button>
                    </div>
                  )}
                </dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd>{email || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="settings-section" aria-labelledby="settings-account-security">
            <h2 id="settings-account-security">登录与安全</h2>
            <ul className="settings-card settings-action-list">
              <li>
                {editingPassword ? (
                  <div className="settings-password-edit">
                    <label>
                      <span>当前密码</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={passwordForm.currentPassword}
                        disabled={savingPassword}
                        onChange={(event) => setPasswordForm((current) => ({
                          ...current,
                          currentPassword: event.target.value,
                        }))}
                      />
                    </label>
                    <label>
                      <span>新密码</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        value={passwordForm.newPassword}
                        disabled={savingPassword}
                        onChange={(event) => setPasswordForm((current) => ({
                          ...current,
                          newPassword: event.target.value,
                        }))}
                      />
                    </label>
                    <label>
                      <span>确认新密码</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        value={passwordForm.confirmPassword}
                        disabled={savingPassword}
                        onChange={(event) => setPasswordForm((current) => ({
                          ...current,
                          confirmPassword: event.target.value,
                        }))}
                      />
                    </label>
                    <div className="settings-password-actions">
                      <button type="button" disabled={savingPassword} onClick={() => void savePassword()}>
                        {savingPassword ? '保存中…' : '保存'}
                      </button>
                      <button type="button" className="is-secondary" disabled={savingPassword} onClick={cancelEditPassword}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="settings-action-row" onClick={startEditPassword}>
                    <span>修改密码</span>
                    <ChevronRight size={14} strokeWidth={1.7} className="settings-action-chevron" />
                  </button>
                )}
              </li>
              <li>
                <button type="button" className="settings-action-row" onClick={onSignOut}>
                  <span className="is-danger-label">
                    <LogOut size={14} strokeWidth={1.7} />
                    退出登录
                  </span>
                  <ChevronRight size={14} strokeWidth={1.7} className="settings-action-chevron" />
                </button>
              </li>
            </ul>
          </section>

          <section className="settings-section" aria-labelledby="settings-account-danger">
            <h2 id="settings-account-danger">危险操作</h2>
            <ul className="settings-card settings-action-list">
              <li>
                <button type="button" className="settings-action-row is-danger" onClick={onDeleteAccount}>
                  <span>删除账号</span>
                  <ChevronRight size={14} strokeWidth={1.7} className="settings-action-chevron" />
                </button>
              </li>
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}
