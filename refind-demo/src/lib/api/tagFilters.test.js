import { describe, expect, it } from 'vitest';
import {
  buildRagAskText,
  extractTagNamesFromPrompt,
  formatDisplayAskPrompt,
  matchHashTagQuery,
  mergeSelectedTagNames,
  pruneSelectedTagNames,
  replaceHashTagToken,
  resolveTagFilterIds,
  stripSelectedTagsFromPrompt,
} from './tagFilters.js';

describe('resolveTagFilterIds', () => {
  const availableTags = [
    { id: 'tag-product', name: '产品灵感' },
    { id: 'tag-growth', name: '增长策略' },
  ];

  it('maps selected tag names to UUID ids', () => {
    expect(resolveTagFilterIds(['产品灵感', '增长策略'], availableTags)).toEqual([
      'tag-product',
      'tag-growth',
    ]);
  });

  it('drops unknown tag names', () => {
    expect(resolveTagFilterIds(['产品灵感', '不存在的标签'], availableTags)).toEqual([
      'tag-product',
    ]);
  });

  it('returns empty when nothing matches', () => {
    expect(resolveTagFilterIds(['未知'], availableTags)).toEqual([]);
    expect(resolveTagFilterIds([], availableTags)).toEqual([]);
  });
});

describe('pruneSelectedTagNames', () => {
  it('keeps only names still present in available tags', () => {
    expect(pruneSelectedTagNames(
      ['产品灵感', '过期标签'],
      [{ id: '1', name: '产品灵感' }],
    )).toEqual(['产品灵感']);
  });
});

describe('matchHashTagQuery + replaceHashTagToken', () => {
  it('opens on # anywhere before the caret, not only at prompt start', () => {
    expect(matchHashTagQuery('先问一句#', 5)).toEqual({ query: '', start: 4, end: 5 });
    expect(matchHashTagQuery('先问一句#办', 6)).toEqual({ query: '办', start: 4, end: 6 });
    expect(matchHashTagQuery('普通问题', 4)).toBeNull();
    expect(matchHashTagQuery('#标签 后面再#', 8)).toEqual({ query: '', start: 7, end: 8 });
  });

  it('inserts #tag at the active hash token and keeps surrounding text', () => {
    expect(replaceHashTagToken('先问一句#', 'AI办公助手', 5))
      .toBe('先问一句#AI办公助手 ');
    expect(replaceHashTagToken('#办', 'AI办公助手', 2))
      .toBe('#AI办公助手 ');
  });
});

describe('stripSelectedTagsFromPrompt', () => {
  it('removes selected hashtags from the prompt text', () => {
    expect(stripSelectedTagsFromPrompt('#增长策略 大模型是什么', ['增长策略']))
      .toBe('大模型是什么');
    expect(stripSelectedTagsFromPrompt('看看 #产品灵感 怎么做', ['产品灵感']))
      .toBe('看看 怎么做');
    expect(stripSelectedTagsFromPrompt('先问#产品灵感 怎么做', ['产品灵感']))
      .toBe('先问 怎么做');
  });
});

describe('extractTagNamesFromPrompt + buildRagAskText', () => {
  const availableTags = [
    { id: '1', name: 'AI办公助手' },
    { id: '2', name: '产品灵感' },
  ];

  it('extracts typed #tags that exist in the catalog', () => {
    expect(extractTagNamesFromPrompt('#AI办公助手 是怎么做的', availableTags))
      .toEqual(['AI办公助手']);
    expect(extractTagNamesFromPrompt('先问#产品灵感 怎么做', availableTags))
      .toEqual(['产品灵感']);
  });

  it('anchors substantive asks with tag names for on-topic retrieval', () => {
    expect(buildRagAskText('#产品灵感 带标签提问', ['产品灵感']))
      .toBe('带标签提问\n产品灵感');
    expect(buildRagAskText('带标签提问', ['产品灵感']))
      .toBe('带标签提问\n产品灵感');
    expect(buildRagAskText('#本地AI #AI产品经理 AI办公助手怎么做？', ['本地AI', 'AI产品经理']))
      .toBe('AI办公助手怎么做？\n本地AI AI产品经理');
  });

  it('anchors weak/short asks with tag names so retrieval still has a topic', () => {
    expect(buildRagAskText('#AI办公助手 是怎么做的', ['AI办公助手']))
      .toBe('AI办公助手\n是怎么做的');
    expect(buildRagAskText('是怎么做的', ['AI办公助手']))
      .toBe('AI办公助手\n是怎么做的');
  });

  it('formats display prompts with visible #tags', () => {
    expect(formatDisplayAskPrompt('带标签提问', ['产品灵感']))
      .toBe('#产品灵感 带标签提问');
    expect(formatDisplayAskPrompt('#产品灵感 带标签提问', ['产品灵感']))
      .toBe('#产品灵感 带标签提问');
  });

  it('merges explicit selections with prompt mentions', () => {
    expect(mergeSelectedTagNames(['产品灵感'], ['AI办公助手', '产品灵感']))
      .toEqual(['产品灵感', 'AI办公助手']);
  });
});
