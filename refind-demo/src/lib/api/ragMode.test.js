import { describe, expect, it } from 'vitest';
import { mapThinkingMode, resolveAnswerMode, resolveChatSurface, parseCitationMarkers } from './ragMode.js';

describe('resolveAnswerMode', () => {
  it('forces rag on knowledge surface', () => {
    expect(resolveAnswerMode({ surface: 'knowledge', knowledgeBaseIds: [], tagFilters: [] })).toBe('rag');
  });
  it('uses general on home with empty scope', () => {
    expect(resolveAnswerMode({ surface: 'home', knowledgeBaseIds: [], tagFilters: [] })).toBe('general');
  });
  it('uses rag when any kb or tag present on home', () => {
    expect(resolveAnswerMode({ surface: 'home', knowledgeBaseIds: ['kb1'], tagFilters: [] })).toBe('rag');
    expect(resolveAnswerMode({ surface: 'home', knowledgeBaseIds: [], tagFilters: ['t1'] })).toBe('rag');
  });
});

describe('resolveChatSurface', () => {
  it('keeps an existing thread on its surface when preferred', () => {
    expect(resolveChatSurface({ knowledgeBaseIds: ['kb1'], preferredSurface: 'home' })).toBe('home');
    expect(resolveChatSurface({ knowledgeBaseIds: [], preferredSurface: 'knowledge' })).toBe('knowledge');
  });
  it('keeps home-originated chats on home history even with a single KB', () => {
    expect(resolveChatSurface({ knowledgeBaseIds: ['kb1'] })).toBe('home');
    expect(resolveChatSurface({ knowledgeBaseIds: [] })).toBe('home');
    expect(resolveChatSurface({ knowledgeBaseIds: ['kb1', 'kb2'] })).toBe('home');
  });
});

describe('mapThinkingMode', () => {
  it('maps fast/deep to DeepSeek model ids', () => {
    expect(mapThinkingMode('fast')).toBe('deepseek-chat');
    expect(mapThinkingMode('deep')).toBe('deepseek-reasoner');
  });
});

describe('parseCitationMarkers', () => {
  it('extracts unique citation orders', () => {
    expect(parseCitationMarkers('见[2]与[1]，再看[2]。')).toEqual([2, 1]);
  });
});
