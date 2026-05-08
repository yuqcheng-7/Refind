export function formatSupabaseAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("email rate limit exceeded")) {
    return "操作太频繁，请稍后再试（邮件发送被限流）。";
  }
  if (m.includes("user already registered") || m.includes("already registered")) {
    return "账号已存在，请直接登录";
  }
  if (m.includes("invalid login credentials")) {
    return "账号或密码不正确。";
  }
  if (m.includes("email not confirmed")) {
    return "该邮箱尚未验证，请先完成邮箱验证后再登录。";
  }
  if (m.includes("signup is disabled")) {
    return "当前暂未开放注册。";
  }
  if (m.includes("password should be at least")) {
    return "密码长度不足，请设置更长的密码。";
  }

  return message;
}

