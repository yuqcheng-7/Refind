export const materialDemo = [
  {
    id: 'm1',
    kind: 'link',
    url: 'https://www.xiaohongshu.com/explore/growth-strategy',
    fileName: '小红书增长策略拆解：内容社区的用户增长实践',
    title: '小红书增长策略拆解：内容社区的用户增长实践',
    source: '小红书',
    tag: '增长策略',
    time: '今天',
    base: '默认知识库',
    summary: '拆解内容社区从冷启动到规模增长的关键动作：先建立高密度内容供给，再用互动机制将浏览转化为持续参与。',
    body: '这份资料复盘了内容社区增长的三个阶段。冷启动阶段优先聚焦一个明确人群，以高频、可复用的内容建立信任；增长阶段通过评论互动、收藏回访和创作者激励，缩短用户从浏览到行动的路径；规模化后持续观察留存、搜索回流与内容供给的平衡，验证增长是否可以复制。',
  },
  {
    id: 'm2',
    kind: 'link',
    url: 'https://www.bilibili.com/video/BV1growth',
    fileName: 'SaaS 产品 0-1 增长复盘：从 PMF 到规模化',
    title: 'SaaS 产品 0-1 增长复盘：从 PMF 到规模化',
    source: 'B 站',
    tag: '产品灵感',
    time: '昨天',
    base: '默认知识库',
    summary: '围绕 PMF 验证、激活指标与可复制获客渠道，梳理 SaaS 从早期验证走向规模化的增长节奏。',
    body: '资料从目标客户画像开始，说明团队如何用访谈和使用数据确认产品价值。完成 PMF 验证后，团队将首次关键行为作为激活指标，并为不同角色设计引导路径。规模化阶段不只追求新增，还要通过续费、扩展使用和客户转介绍来评估增长质量。',
  },
  {
    id: 'm3',
    kind: 'file',
    fileName: '教育行业用户运营案例：从留存到转化的全链路实践.pdf',
    title: '教育行业用户运营案例：从留存到转化的全链路实践',
    source: '微信',
    tag: '用户研究',
    time: '9 月 8 日',
    base: '默认知识库',
    summary: '以学习周期为线索设计分层触达和服务节点，让用户在关键时刻获得下一步行动的明确提示。',
    body: '已解析正文显示，运营团队按新用户、规律学习者和沉默用户划分触达策略。新用户先完成首个学习闭环；规律学习者通过阶段反馈维持动力；沉默用户则收到与其历史目标相关的低打扰提醒。转化并非独立活动，而是服务体验自然延伸的结果。',
  },
  {
    id: 'm4',
    kind: 'link',
    url: 'https://www.zhihu.com/question/website-design',
    fileName: '2022 年 UI 设计师必看的 11 个网站',
    title: '2022 年 UI 设计师必看的 11 个网站',
    source: '知乎',
    tag: '产品灵感',
    time: '9 月 6 日',
    base: '默认知识库',
    summary: '收录界面设计、排版、动效与案例研究网站，适合建立参考素材库并快速寻找交互灵感。',
    body: '这份清单按用途归纳了十一类设计参考：组件与模式库、品牌案例、动态叙事、字体与版式、三维与实验性界面。阅读时可记录具体页面为何有效，再转化为可复用的设计判断，而不是只保存视觉截图。',
  },
];

export function getMaterialPreviewUrl(materialId, location = window.location) {
  const previewUrl = new URL(location.href);
  previewUrl.hash = `/material/${materialId}`;
  return previewUrl.toString();
}

export function getMaterialIdFromHash(hash = window.location.hash) {
  const match = /^#\/material\/([^/?#]+)$/.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}
