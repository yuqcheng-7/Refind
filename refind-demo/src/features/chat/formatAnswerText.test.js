import { describe, expect, it } from 'vitest';
import {
  citationByOrder,
  normalizeAnswerText,
  parseListItemLead,
  repairAnswerStructure,
  sanitizeInlineMarkdown,
  sanitizeRagAnswer,
  splitAnswerBlocks,
  stripMarkdownForReading,
  tokenizeInline,
} from './formatAnswerText.js';

/** Exact patterns from production screenshots — must stay clean after sanitize. */
const SCREENSHOT_RAW = [
  '根据资料，AI产品经理的工作流程是一个从需求洞察到上线运营的完整闭环。',
  '一、核心工作流程（全生命周期） *',
  '1. 需求调研与分析**：深入理解业务场景与用户痛点，评估需求的可行性与价值 [4]。',
  '2. 技术可行性分析**：结合对AI技术（如大模型、RAG）的理解，判断需求的技术实现路径 [2]。',
  '3. 产品设计**：完成功能设计、原型制作（如Axure高保真原型）与PRD撰写，并考虑异常流程处理 [2] [6]。',
  '4. 研发对接与项目管理**：与研发、算法团队紧密协作，确保技术实现，并参与项目排期规划 [1] [6]。',
  '5. 测试验收**：依据核心指标（如准确率、响应时长）对产品功能进行测试与验收 [2]。',
  '6. 上线运营与优化迭代**：产品上线后，通过数据（如DAU、用户满意度）驱动持续优化 [1] [2]。 **',
  '二、关键支撑能力**',
  '· **技术理解力：** 需了解AI核心技术概念（如Transformer、Prompt工程）及常用编程语言（如Python），以便与技术团队高效沟通 [2] [4]。',
  '· **跨团队协作力：** 协调产品、算法、研发、业务多方资源，推动项目落地 [1]。',
  '· **数据驱动能力：** 通过数据分析评估产品效果，为优化提供反馈 [1] [2]。 **',
  '三、具体产出物示例在整个流程中，AI产品经理需产出诸如系统架构图、用户流程图、提示词模板、高保真原型及PRD文档等关键交付物 [6]。',
].join('\n');

describe('parseListItemLead', () => {
  it('splits short title：body for list labels', () => {
    expect(parseListItemLead('精准问答与答案溯源：这对应了RAG框架中的生成环节。')).toEqual({
      title: '精准问答与答案溯源',
      colon: '：',
      rest: '这对应了RAG框架中的生成环节。',
    });
  });

  it('treats first-line short title + following body as a label', () => {
    expect(parseListItemLead('模型选择与优化\n端侧要选小模型。')).toEqual({
      title: '模型选择与优化',
      colon: '：',
      rest: '\n端侧要选小模型。',
    });
  });

  it('rejects overly long leads so half-sentences stay as body', () => {
    expect(parseListItemLead('这是一个明显超过十二个汉字的半句话说明：后面还有正文。')).toBeNull();
  });
});

describe('sanitizeRagAnswer (global)', () => {
  it('cleans screenshot answer: no raw asterisks, split headings, lists intact', () => {
    const out = sanitizeRagAnswer(SCREENSHOT_RAW);
    expect(out).not.toMatch(/(^|[^*\n])\*(?!\*)/); // no single *
    expect(out).not.toContain('**\n');
    expect(out).not.toContain('周期） *');
    expect(out).not.toMatch(/支撑能力\*\*/); // dangling after heading
    expect(out).toContain('一、核心工作流程（全生命周期）');
    expect(out).toContain('二、关键支撑能力');
    expect(out).toContain('三、具体产出物示例');
    expect(out).toMatch(/三、具体产出物示例\n\n在整个流程中/);
    expect(out).toContain('1. ');
    expect(out).toContain('[4]');
    expect(out).toContain('[6]');
    // No dangling raw asterisk left outside closed **labels**
    expect(out.replace(/\*\*[^*]+\*\*/g, '')).not.toContain('*');
  });

  it('keeps only safe short bold labels', () => {
    expect(sanitizeInlineMarkdown('见**重点**与分析**：正文')).toBe('见**重点**与分析：正文');
    expect(sanitizeInlineMarkdown('尾部 **')).toBe('尾部 ');
    expect(sanitizeInlineMarkdown('标题 *')).toBe('标题 ');
    expect(sanitizeInlineMarkdown('**1. decoder-only**')).toBe('1. decoder-only');
  });

  it('moves citation markers after the period', () => {
    expect(sanitizeRagAnswer('评估需求的可行性与价值 [4]。')).toContain('价值。[4]');
    expect(sanitizeRagAnswer('评估需求的可行性与价值[4]。')).toContain('价值。[4]');
    expect(sanitizeRagAnswer('协作推进 [1] [2]。')).toContain('推进。[1][2]');
    expect(sanitizeRagAnswer('已经正确。[1]')).toContain('正确。[1]');
    expect(sanitizeRagAnswer('第一句 [1]。第二句')).toContain('第一句。[1] 第二句');
  });
});

describe('stripMarkdownForReading', () => {
  it('removes broken bold markers for conversational reading', () => {
    const input = 'RAG 流程如下：\n\n**\n1. 准备阶段**\n**\n2. 检索阶段**';
    const out = stripMarkdownForReading(input);
    expect(out).not.toContain('*');
    expect(out).toContain('1. 准备阶段');
  });
});

describe('repairAnswerStructure', () => {
  it('fixes 1.需求 missing space and splits 一、title1.', () => {
    const out = repairAnswerStructure(
      '一、核心工作流程（全生命周期）1.需求调研与分析：评估可行性[4]。\n2.产品设计：完成原型[2]。',
    );
    expect(out).toContain('一、核心工作流程（全生命周期）\n\n1. 需求调研');
    expect(out).toContain('2. 产品设计');
  });

  it('splits 。二、 mid-line and strips orphan *', () => {
    const out = repairAnswerStructure(
      '驱动持续优化 [1][2]。二、关键支撑能力*\n*\n· 技术理解力：沟通 [2]',
    );
    expect(out).toContain('[1][2]。\n\n二、关键支撑能力');
    expect(out).not.toMatch(/^\*$/m);
    expect(out).not.toContain('能力*');
  });

  it('does not split version numbers V1.0 / V1.1 or 全能工具', () => {
    const raw = [
      '二、功能模块设计（参考V1.0与V1.1规划）',
      '1.智能对话：支持多轮对话。[1]',
      '5.全能工具（V1.1规划）：集成翻译工具。[2]',
      '2.设备管家（V1.1规划）：包括设备状态监控。[1]',
    ].join('\n');
    const out = sanitizeRagAnswer(raw);
    expect(out).toContain('二、功能模块设计（参考V1.0与V1.1规划）');
    expect(out).toContain('全能工具（V1.1规划）');
    expect(out).toContain('设备管家（V1.1规划）');
    expect(out).not.toMatch(/参考V\n/);
    expect(out).not.toMatch(/^1\. 0/m);
    expect(out).not.toMatch(/^1\. 1规划/m);
    expect(out).toContain('1. 智能对话');
    expect(out).toContain('5. 全能工具');
  });

  it('does not split 能力 / 全能 on continuation heuristic', () => {
    expect(sanitizeRagAnswer('二、关键支撑能力\n· 技术理解力：说明[1]')).toContain('二、关键支撑能力');
    expect(sanitizeRagAnswer('三、具体产出物示例在整个流程中继续说明。[1]')).toMatch(
      /三、具体产出物示例\n\n在整个流程中/,
    );
  });
});

describe('normalizeAnswerText', () => {
  it('joins orphaned list markers onto the next line', () => {
    const out = normalizeAnswerText('简介如下：\n1.\n收藏知识：上传文件\n2.\n管理知识：建文件夹');
    expect(out).toContain('1. 收藏知识：上传文件');
    expect(out).toContain('2. 管理知识：建文件夹');
  });

  it('inserts breaks before jammed numbered sections', () => {
    const out = normalizeAnswerText('根据资料[1]简介如下： 1. **收藏知识** 说明A 2. **管理知识** 说明B');
    expect(out).toContain('\n\n1. **收藏知识**');
    expect(out).toContain('\n\n2. **管理知识**');
  });

  it('conversational mode strips markdown', () => {
    const out = normalizeAnswerText('你好，**朋友**。', { conversational: true });
    expect(out).not.toContain('*');
    expect(out).toContain('朋友');
  });
});

describe('tokenizeInline', () => {
  it('splits bold and citation markers', () => {
    expect(tokenizeInline('见**重点**结论[1]。')).toEqual([
      { type: 'text', value: '见' },
      { type: 'bold', children: [{ type: 'text', value: '重点' }] },
      { type: 'text', value: '结论' },
      { type: 'citation', order: 1 },
      { type: 'text', value: '。' },
    ]);
  });

  it('keeps citations clickable inside bold', () => {
    expect(tokenizeInline('见**重点[1]**。')).toEqual([
      { type: 'text', value: '见' },
      {
        type: 'bold',
        children: [
          { type: 'text', value: '重点' },
          { type: 'citation', order: 1 },
        ],
      },
      { type: 'text', value: '。' },
    ]);
  });
});

describe('splitAnswerBlocks', () => {
  it('builds ordered and unordered lists', () => {
    const blocks = splitAnswerBlocks('前言[1]\n\n1. 收藏知识 A\n2. 管理知识 B\n\n· 材料 A\n· 材料 B');
    expect(blocks[1]).toEqual({ type: 'list', ordered: true, items: ['收藏知识 A', '管理知识 B'] });
    expect(blocks[2]).toEqual({ type: 'list', ordered: false, items: ['材料 A', '材料 B'] });
  });

  it('keeps Latin ordered items; restarted 1. becomes · under the previous item', () => {
    const blocks = splitAnswerBlocks(
      '三种架构：\n1. encoder-only\n2. encoder-decoder\n**1. decoder-only** [1]',
    );
    const ordered = blocks.filter((b) => b.type === 'list' && b.ordered);
    expect(ordered[0]?.items?.[0]).toBe('encoder-only');
    expect(ordered[0]?.items?.[1]).toContain('encoder-decoder');
    expect(ordered[0]?.items?.[1]).toContain('decoder-only');
    expect(blocks.every((b) => b.type !== 'heading' || !/decoder-only/.test(b.text))).toBe(true);
  });

  it('rewrites parallel "1. 标题" clusters to 1.2.3. and keeps · body in the same ordered list', () => {
    const blocks = splitAnswerBlocks(
      [
        '具体技术如下：',
        '1. AI算法层：',
        '· NLP自然语言处理 [3]',
        '1. 端侧基础层：',
        '· 硬件：联想 AI PC [3]',
        '1. 业务/软件层：',
        '· UI交互界面 [3]',
      ].join('\n'),
    );
    const ordered = blocks.find((b) => b.type === 'list' && b.ordered);
    expect(ordered?.items?.length).toBe(3);
    expect(ordered.items[0]).toContain('AI算法层');
    expect(ordered.items[0]).toContain('· NLP自然语言处理');
    expect(ordered.items[1]).toContain('端侧基础层');
    expect(ordered.items[2]).toContain('业务/软件层');
  });

  it('renumbers restarted "1. 短标题" with body into one 1.2.3.4. list', () => {
    const blocks = splitAnswerBlocks(
      [
        '三、定制化与可控性',
        '实现时需要注意这些关键点：',
        '1. 硬件适配与性能优化',
        '本地设备算力有限，需要压缩。',
        '1. 资源与功耗管理',
        '移动端还要考虑续航。',
        '1. 部署与更新体验',
        '尽量简化安装。',
        '1. 场景化功能设计',
        '先抓住核心场景。',
      ].join('\n'),
    );
    expect(blocks.filter((b) => b.type === 'heading').map((b) => b.text)).toEqual([
      '三、定制化与可控性',
    ]);
    const ordered = blocks.find((b) => b.type === 'list' && b.ordered);
    expect(ordered?.items?.length).toBe(4);
    expect(ordered.items[0]).toMatch(/^硬件适配与性能优化/);
    expect(ordered.items[0]).toContain('本地设备算力有限');
    expect(ordered.items[3]).toMatch(/^场景化功能设计/);
  });

  it('keeps real 1.2.3. steps when numbers advance', () => {
    const blocks = splitAnswerBlocks('流程：\n1. 准备材料\n2. 开始处理\n3. 验收结果');
    const ordered = blocks.find((b) => b.type === 'list' && b.ordered);
    expect(ordered?.items).toEqual(['准备材料', '开始处理', '验收结果']);
  });

  it('renumbers parallel 1. titles under 二、 even when earlier section has 1.2.3. steps', () => {
    const blocks = splitAnswerBlocks(
      [
        '一、背景说明',
        '1. 先收集需求',
        '2. 再评估可行性',
        '3. 最后立项',
        '二、实现时要注意的要点',
        '1. 模型选择与优化',
        '端侧要选合适架构。',
        '1. 工程与部署',
        '兼顾包体积与兼容。',
        '1. 用户体验设计',
        '下载与推理要顺滑。',
        '1. 持续迭代',
        '端侧更新成本高。',
      ].join('\n'),
    );
    expect(blocks.filter((b) => b.type === 'heading').map((b) => b.text)).toEqual([
      '一、背景说明',
      '二、实现时要注意的要点',
    ]);
    const lists = blocks.filter((b) => b.type === 'list' && b.ordered);
    expect(lists[0]?.items).toEqual(['先收集需求', '再评估可行性', '最后立项']);
    expect(lists[1]?.items?.length).toBe(4);
    expect(lists[1].items[0]).toMatch(/^模型选择与优化/);
    expect(lists[1].items[1]).toMatch(/^工程与部署/);
    expect(lists[1].items[2]).toMatch(/^用户体验设计/);
    expect(lists[1].items[3]).toMatch(/^持续迭代/);
  });

  it('demotes restarted 1. after a 1.2. run to · (kept under prior ordered item)', () => {
    const blocks = splitAnswerBlocks(
      '具体来说：\n1. 四大核心功能模块：概述。[1]\n2. 具体的功能模块列表：\n· 本地文档解析 [3]\n1. 智能对话功能：详情。[5]',
    );
    const orderedBlob = blocks
      .filter((b) => b.type === 'list' && b.ordered)
      .flatMap((b) => b.items)
      .join('\n');
    expect(orderedBlob).toMatch(/智能对话功能/);
    expect(orderedBlob).toMatch(/·\s*智能对话功能|智能对话功能/);
  });

  it('parses screenshot into clean structural blocks', () => {
    const blocks = splitAnswerBlocks(SCREENSHOT_RAW);
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text);
    expect(headings).toEqual([
      '一、核心工作流程（全生命周期）',
      '二、关键支撑能力',
      '三、具体产出物示例',
    ]);
    const ordered = blocks.find((b) => b.type === 'list' && b.ordered);
    expect(ordered?.items?.length).toBe(6);
    expect(ordered.items.every((item) => !item.includes('*') || item.includes('**'))).toBe(true);
    expect(ordered.items.join('\n')).not.toMatch(/(^|[^*])\*(?!\*)|\*\*(?!\S)/);
    const blob = JSON.stringify(blocks);
    expect(blob).not.toMatch(/周期） \*/);
    expect(blob).not.toMatch(/支撑能力\*\*/);
  });
});

describe('citationByOrder', () => {
  it('finds citation metadata by order', () => {
    expect(citationByOrder([{ order: 2, label: '资料B' }], 2)?.label).toBe('资料B');
  });
});
