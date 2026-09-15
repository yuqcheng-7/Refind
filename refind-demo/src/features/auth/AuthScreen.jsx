import { useState } from 'react';
import { ArrowRight, KeyRound, Mail, UserRound } from 'lucide-react';
import { mapAuthError, resetPassword, signIn, signUp } from '../../lib/api/auth.js';

const initialCredentials = { email: '', password: '', displayName: '' };

export function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [credentials, setCredentials] = useState(initialCredentials);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand" aria-label="Refind 拾藏">
          <span className="auth-brand-mark" aria-hidden="true"><i /><i /></span>
          <strong>Refind</strong><span>· 拾藏</span>
        </div>
        <header>
          <p>{isForgotPassword ? '找回访问权限' : '你的个人知识空间'}</p>
          <h1 id="auth-title">
            {isSignup ? '创建账户' : isForgotPassword ? '重置密码' : '欢迎回来'}
          </h1>
          <span>{isSignup ? '开始整理散落在各处的灵感。' : isForgotPassword ? '输入账户邮箱，我们会发送重置链接。' : '登录后继续你的拾藏。'}</span>
        </header>
        <form onSubmit={submit}>
          {isSignup && (
            <label>
              用户名
              <span className="auth-field">
                <UserRound size={16} aria-hidden="true" />
                <input
                  name="displayName"
                  type="text"
                  autoComplete="nickname"
                  value={credentials.displayName}
                  onChange={updateCredentials}
                  placeholder="用于侧栏展示的昵称"
                  maxLength={32}
                  required
                />
              </span>
            </label>
          )}
          <label>
            邮箱
            <span className="auth-field"><Mail size={16} aria-hidden="true" /><input name="email" type="email" autoComplete="email" value={credentials.email} onChange={updateCredentials} placeholder="you@example.com" required /></span>
          </label>
          {!isForgotPassword && (
            <label>
              密码
              <span className="auth-field"><KeyRound size={16} aria-hidden="true" /><input name="password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={credentials.password} onChange={updateCredentials} placeholder="至少 6 位" minLength="6" required /></span>
            </label>
          )}
          {error && <p className="auth-feedback is-error" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '请稍候…' : isForgotPassword ? '发送重置链接' : isSignup ? '创建账户' : '登录'}
            {!isSubmitting && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>
        <footer>
          {isForgotPassword ? (
            <button type="button" onClick={() => changeMode('login')}>返回登录</button>
          ) : isSignup ? (
            <p>已有账户？<button type="button" onClick={() => changeMode('login')}>登录</button></p>
          ) : (
            <>
              <button type="button" onClick={() => changeMode('forgot-password')}>忘记密码？</button>
              <p>还没有账户？<button type="button" onClick={() => changeMode('signup')}>注册</button></p>
            </>
          )}
        </footer>
      </section>
    </main>
  );
}
