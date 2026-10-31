import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = 'branding.test.ts';

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.css', '.html', '.json', '.mjs'];

const b64 = (s: string) => Buffer.from(s, 'base64').toString('utf8');

// 竞品与参考作品的商品名称、商标及专有名词（Base64 存储，杜绝源码与测试用例中残留敏感关键词）
const FORBIDDEN_LABELS = [
  '5aCG5Y+g5aSn6ZmG',
  'U3RhY2tsYW5kcw==',
  'U1RBQ0tMQU5EUw==',
  'c3RhY2tsYW5kcw==',
  'U29rcG9w',
  'U09LUE9Q',
  'c29rcG9w',
  'U3RhY2tsYW5kc0VuZ2luZQ==',
  'U3RhY2tsYW5kc1BsYXRmb3JtQnJpZGdl',
].map(b64);

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

test('1. 产品标识与内容命名不回流参考作品名称 (Card Realms)', () => {
  const files = collectFiles(GAME_ROOT).filter((file) => !file.endsWith(SELF));
  const hits: string[] = [];

  for (const file of files) {
    const rel = relative(GAME_ROOT, file).split(/[\\/]/).join('/');
    const text = readFileSync(file, 'utf8');
    for (const label of FORBIDDEN_LABELS) {
      if (text.includes(label)) {
        hits.push(`${rel}: 命中禁用标识 "${label}"`);
      }
    }
  }

  assert.deepEqual(
    hits,
    [],
    `Card Realms 源码中发现了参考作品名称残留，必须全部替换为自有名：\n${hits.join('\n')}`,
  );
});

test('2. 公开标识使用本项目自有名 (Card Realms)', () => {
  const manifest = JSON.parse(readFileSync(join(GAME_ROOT, 'game.json'), 'utf8'));
  assert.equal(manifest.title, '卡牌领地', 'game.json 的 title 必须为自有名 "卡牌领地"');
  for (const forbidden of [FORBIDDEN_LABELS[0], FORBIDDEN_LABELS[1]]) {
    assert.equal(
      manifest.description.includes(forbidden),
      false,
      `game.json description 不得出现禁用标识 "${forbidden}"`,
    );
  }

  const html = readFileSync(join(GAME_ROOT, 'index.html'), 'utf8');
  assert.match(html, /<title>卡牌领地<\/title>/, 'index.html title 必须为自有名');
  for (const forbidden of [FORBIDDEN_LABELS[0], FORBIDDEN_LABELS[1]]) {
    assert.equal(
      html.includes(forbidden),
      false,
      `index.html 不得包含禁用标识 "${forbidden}"`,
    );
  }
});
