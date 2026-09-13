export const demoNotebooks = [
  { id: 'growth', name: '增长实验' },
  { id: 'product', name: '产品研究' },
  { id: 'reading', name: '阅读摘录' },
];

export const demoNotes = [
  {
    id: 'note-membership',
    title: '会员活动设计',
    content: { text: '先降低首次行动门槛，再用及时反馈建立持续参与。', blocks: [] },
    notebookId: 'growth',
    updatedLabel: '今天 10:24',
    inspirationCardIds: ['card-onboarding'],
    syncedBaseIds: [],
  },
  {
    id: 'note-interviews',
    title: '用户访谈问题',
    content: { text: '追问用户在任务中感到犹豫的具体时刻。', blocks: [] },
    notebookId: 'product',
    updatedLabel: '昨天',
    inspirationCardIds: [],
    syncedBaseIds: ['base-product'],
  },
];

export const demoAnswers = [
  {
    id: 'answer-onboarding',
    question: '怎样缩短新用户看到价值的时间？',
    content: '将首次关键动作拆解为一个低摩擦步骤，并在完成后立即展示结果。',
    answerMode: 'rag',
    citation: { label: '小红书增长策略', sourceId: 'source-xiaohongshu-growth' },
  },
];

export const demoInspirationCards = [
  {
    id: 'card-onboarding',
    contentSnapshot: '缩短首次价值时间：将关键动作拆解为一个低摩擦步骤。',
    questionSnapshot: '怎样缩短新用户看到价值的时间？',
    answerMode: 'rag',
    sourceLabel: '小红书增长策略',
    savedAt: '今天 10:20',
    citation: { label: '小红书增长策略', sourceId: 'source-xiaohongshu-growth' },
  },
  {
    id: 'card-retrospective',
    contentSnapshot: '建立可持续的复盘节奏，把复盘变成下一次行动的输入。',
    questionSnapshot: '如何让团队持续学习？',
    answerMode: 'general',
    sourceLabel: '通用回答',
    savedAt: '昨天',
  },
];

export const demoSources = [
  { id: 'source-xiaohongshu-growth', label: '小红书增长策略', type: '小红书', baseId: 'base-growth' },
  { id: 'source-product-interviews', label: '用户访谈记录', type: '文档', baseId: 'base-product' },
];

export const demoKnowledgeBases = [
  { id: 'base-growth', name: '增长知识库' },
  { id: 'base-product', name: '产品与设计资料' },
];
