import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react';
import { mapAuthError, resetPassword, signIn, signUp } from '../../lib/api/auth.js';

const initialCredentials = { email: '', password: '', displayName: '' };

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [credentials, setCredentials] = useState(initialCredentials);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const isSignup = mode === 'signup';
  const isForgotPassword = mode === 'forgot-password';

  const updateCredentials = (event) => {
    const { name, value } = event.target;
    setCredentials((current) => ({ ...current, [name]: value }));
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setShowPassword(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (isSignup && !credentials.displayName.trim()) {
      setError('请填写用户名');
      return;
    }

    setIsSubmitting(true);

    try {
      if (!isForgotPassword && !isSignup) {
        try {
          window.localStorage.setItem('refind-auth-remember', rememberMe ? '1' : '0');
        } catch {
          // ignore storage errors
        }
      }

      const result = isForgotPassword
        ? await resetPassword(credentials.email)
        : isSignup
          ? await signUp({
            email: credentials.email,
            password: credentials.password,
            displayName: credentials.displayName,
          })
          : await signIn(credentials);

      if (result.error) {
        setError(mapAuthError(result.error));
        return;
      }

      if (isForgotPassword) {
        setMessage('重置密码邮件已发送，请查收邮箱。');
      } else if (isSignup && !result.data?.session) {
        setMessage('注册成功，请查收邮箱完成验证后再登录。');
      } else if (isSignup) {
        setMessage('注册成功，正在进入 Refind。');
      }
    } catch (authError) {
      setError(mapAuthError(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = isSignup ? '注册' : isForgotPassword ? '重置密码' : '登录';
  const subtitle = isSignup
    ? '创建账户，开始整理散落的灵感。'
    : isForgotPassword
      ? '输入邮箱，我们会发送重置链接。'
      : '欢迎回来，继续你的收藏之旅。';
  const submitLabel = isSubmitting
    ? '请稍候…'
    : isForgotPassword
      ? '发送重置链接'
      : isSignup
        ? '注册'
        : '登录';

  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <aside className="auth-panel auth-panel--brand">
          <div className="auth-brand" aria-label="Refind 拾藏">
            <span className="brand-logo" role="img" aria-hidden="true" />
            <strong>Refind</strong>
            <span className="brand-product">· 拾藏</span>
          </div>

          <div className="auth-brand-stage">
            <div className="auth-brand-main">
              <div className="auth-brand-copy">
                <h2 className="auth-brand-title">
                  <span className="auth-brand-title__line auth-brand-title__line--light">把散落的收藏，</span>
                  <span className="auth-brand-title__line auth-brand-title__line--strong">重新拾起。</span>
                </h2>
                <p className="auth-brand-sub">
                  <span className="auth-brand-sub__line">打造属于你的个人知识库，</span>
                  <span className="auth-brand-sub__line">溯源问答，灵感成笔记。</span>
                </p>
              </div>
              <div className="auth-hero">
                <img src="/assets/refind-home-robot.png" alt="" />
              </div>
            </div>

            <p className="auth-brand-foot">Collect What Matters.</p>
          </div>
        </aside>

        <section className="auth-panel auth-panel--form" aria-labelledby="auth-title">
          <div className="auth-form-top">
            {isForgotPassword ? (
              <button type="button" className="auth-switch" onClick={() => changeMode('login')}>
                返回登录
              </button>
            ) : isSignup ? (
              <p className="auth-switch-line">
                已有账户？
                <button type="button" className="auth-link" onClick={() => changeMode('login')}>登录</button>
              </p>
            ) : (
              <p className="auth-switch-line">
                还没有账户？
                <button type="button" className="auth-link" onClick={() => changeMode('signup')}>注册</button>
              </p>
            )}
          </div>

          <div className="auth-form-wrap">
            <header className="auth-card__head">
              <h1 id="auth-title">{title}</h1>
              <p className="auth-card__hint">{subtitle}</p>
            </header>

            <form className="auth-form" onSubmit={submit}>
              {isSignup && (
                <label className="auth-label">
                  用户名
                  <span className="auth-field">
                    <UserRound size={16} strokeWidth={1.7} aria-hidden="true" />
                    <input
                      name="displayName"
                      type="text"
                      autoComplete="nickname"
                      value={credentials.displayName}
                      onChange={updateCredentials}
                      placeholder="侧栏展示昵称"
                      maxLength={32}
                      required
                    />
                  </span>
                </label>
              )}
              <label className="auth-label">
                邮箱
                <span className="auth-field">
                  <Mail size={16} strokeWidth={1.7} aria-hidden="true" />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={credentials.email}
                    onChange={updateCredentials}
                    placeholder="you@example.com"
                    required
                  />
                </span>
              </label>
              {!isForgotPassword && (
                <label className="auth-label">
                  密码
                  <span className="auth-field">
                    <Lock size={16} strokeWidth={1.7} aria-hidden="true" />
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                      value={credentials.password}
                      onChange={updateCredentials}
                      placeholder="至少 6 位"
                      minLength="6"
                      required
                    />
                    <button
                      type="button"
                      className="auth-field__toggle"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((open) => !open)}
                    >
                      {showPassword ? <EyeOff size={16} strokeWidth={1.7} /> : <Eye size={16} strokeWidth={1.7} />}
                    </button>
                  </span>
                </label>
              )}

              {!isForgotPassword && !isSignup && (
                <div className="auth-row">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    <span>记住我</span>
                  </label>
                  <button type="button" className="auth-link auth-link--muted" onClick={() => changeMode('forgot-password')}>
                    忘记密码？
                  </button>
                </div>
              )}

              {error && <p className="auth-feedback is-error" role="alert">{error}</p>}
              {message && <p className="auth-feedback" role="status">{message}</p>}

              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                <span>{submitLabel}</span>
                {!isSubmitting && <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
