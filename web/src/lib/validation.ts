/** PRD 注册/登录校验（邮箱账号，不含手机号） */

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const s = email.trim();
  if (!s) return "请输入账号";
  if (s.length > 64) return "账号格式不正确";
  if (!EMAIL_RE.test(s)) return "账号格式不正确";
  return null;
}

export function validatePasswordRegister(password: string): string | null {
  if (!password) return "请输入密码";
  if (password.length < 8) return "密码不正确";
  return null;
}

export function validatePasswordLogin(password: string): string | null {
  if (!password) return "请输入密码";
  return null;
}

/** PRD：http/https，长度 ≤2048，禁止 javascript: 等 */
export function validateBookmarkUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "请粘贴链接";
  if (s.length > 2048) return "链接过长";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return "链接格式不正确";
  }
  const p = u.protocol.toLowerCase();
  if (p !== "http:" && p !== "https:") return "仅支持 http/https 链接";
  return null;
}

export function normalizeUrl(raw: string): string {
  return raw.trim();
}
