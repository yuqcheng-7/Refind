export function formatRelativeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return `今天 ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function formatMaterialStatus(status) {
  switch (status) {
    case 'processing':
      return '处理中';
    case 'failed':
      return '解析失败';
    case 'link_only':
      return '仅链接';
    default:
      return null;
  }
}
