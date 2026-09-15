import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  bilibiliEmbedUrl,
  detectPlatform,
  extractBilibiliId,
  extractLinkContent,
  extractOpenGraph,
  extractReadableBody,
} from './extractLinkContent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('detectPlatform maps mainstream hosts', () => {
  assert.equal(detectPlatform('https://www.xiaohongshu.com/explore/abc'), 'xhs');
  assert.equal(detectPlatform('https://www.douyin.com/video/123'), 'douyin');
  assert.equal(detectPlatform('https://www.zhihu.com/question/1'), 'zhihu');
  assert.equal(detectPlatform('https://www.bilibili.com/video/BV1xx411c7mD'), 'bilibili');
  assert.equal(detectPlatform('https://mp.weixin.qq.com/s/abc'), 'wechat_mp');
  assert.equal(detectPlatform('https://example.com/a'), 'web');
});

test('extractOpenGraph reads title and description', () => {
  const html = `
    <html><head>
      <meta property="og:title" content="测试标题 &amp; 更多" />
      <meta property="og:description" content="这是一段用于验收的简介文字，至少要够长一些。" />
      <title>fallback</title>
    </head><body></body></html>
  `;
  const og = extractOpenGraph(html);
  assert.equal(og.title, '测试标题 & 更多');
  assert.match(og.description, /验收的简介/);
});

test('extractReadableBody prefers WeChat js_content', () => {
  const html = `
    <body>
      <div id="js_content"><p>第一段正文。</p><p>第二段正文，用来验证分段提取是否可用。</p></div>
      <div>噪声侧栏</div>
    </body>
  `;
  const body = extractReadableBody(html);
  assert.match(body, /第一段正文/);
  assert.match(body, /第二段正文/);
});

test('bilibili helpers parse BV and build embed', () => {
  const url = 'https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333';
  assert.deepEqual(extractBilibiliId(url), { type: 'bvid', value: 'BV1GJ411x7h7' });
  assert.equal(
    bilibiliEmbedUrl(url),
    'https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&autoplay=0',
  );
  assert.deepEqual(
    extractBilibiliId('https://b23.tv/BV1GJ411x7h7'),
    { type: 'bvid', value: 'BV1GJ411x7h7' },
  );
});

test('extractLinkContent merges Bilibili API + HTML', async () => {
  const sourceUrl = 'https://www.bilibili.com/video/BV1GJ411x7h7';
  const html = `
    <html><head>
      <meta property="og:title" content="OG 标题" />
      <meta property="og:description" content="OG 简介不够完整" />
    </head></html>
  `;
  const fetchFn = async (url) => {
    if (String(url).includes('api.bilibili.com')) {
      return {
        ok: true,
        async json() {
          return {
            code: 0,
            data: {
              title: '【官方 MV】Never Gonna Give You Up',
              desc: 'Rick Astley 官方 MV 简介，足够作为视频文案展示。',
              owner: { name: 'RickAstleyVEVO' },
            },
          };
        },
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await extractLinkContent({ sourceUrl, html, fetchFn });
  assert.equal(result.platform, 'bilibili');
  assert.match(result.title, /Never Gonna Give You Up/);
  assert.match(result.caption_text, /官方 MV 简介/);
  assert.match(result.content_text, /官方 MV 简介/);
  assert.equal(result.playback_mode, 'embed');
  assert.match(result.playback_url, /bvid=BV1GJ411x7h7/);
  assert.ok(['full', 'partial'].includes(result.quality));
});

test('extractLinkContent keeps Bilibili ready when API is blocked', async () => {
  const sourceUrl = 'https://www.bilibili.com/video/BV1GJ411x7h7';
  const fetchFn = async () => {
    throw new Error('blocked');
  };
  const result = await extractLinkContent({ sourceUrl, html: '', fetchFn });
  assert.equal(result.platform, 'bilibili');
  assert.match(result.title, /BV1GJ411x7h7/);
  assert.equal(result.caption_text, '');
  assert.match(result.content_text, /暂未返回简介|已收藏/);
  assert.match(result.playback_url, /bvid=BV1GJ411x7h7/);
  assert.equal(result.quality, 'partial');
});

test('extractLinkContent resolves short Bilibili links without BV', async () => {
  const sourceUrl = 'https://b23.tv/abcdef';
  const fetchFn = async (url, init = {}) => {
    if (String(url).includes('b23.tv') && init.redirect === 'manual') {
      return {
        status: 302,
        url: String(url),
        headers: { get: (name) => (name === 'location' ? 'https://www.bilibili.com/video/BV1GJ411x7h7' : null) },
      };
    }
    if (String(url).includes('api.bilibili.com')) {
      return {
        ok: true,
        async json() {
          return {
            code: 0,
            data: {
              title: '短链解析成功',
              desc: '通过跳转拿到 BV 后的简介文字，用于验收展示。',
              owner: { name: 'tester' },
            },
          };
        },
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await extractLinkContent({ sourceUrl, html: '', fetchFn });
  assert.equal(result.platform, 'bilibili');
  assert.equal(result.title, '短链解析成功');
  assert.match(result.playback_url, /bvid=BV1GJ411x7h7/);
});

test('extractLinkContent falls back to OG partial for locked pages', async () => {
  const html = readFileSync(join(__dirname, 'fixtures', 'og-partial.html'), 'utf8');
  const result = await extractLinkContent({
    sourceUrl: 'https://www.xiaohongshu.com/explore/abc123',
    html,
  });
  assert.equal(result.platform, 'xhs');
  assert.equal(result.title, '小红书笔记标题');
  assert.match(result.content_text, /可见的简介/);
  assert.equal(result.quality, 'partial');
});
