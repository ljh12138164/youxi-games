import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = 'branding.test.ts';

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.css', '.html', '.json', '.mjs'];

const b64 = (s: string) => Buffer.from(s, 'base64').toString('utf8');

// 竞品与参考作品的商品名称与专有标识（Base64 存储，杜绝源码与测试用例中残留敏感关键词）
const FORBIDDEN_LABELS = [
  '5ZC46KGA6ay85bm45a2Y6ICF',
  'VmFtcGlyZSBTdXJ2aXZvcnM=',
  'VkFNUElSRSBTVVJWSVZPUlM=',
  'VmFtcGlyZVN1cnZpdm9ycw==',
  'dmFtcGlyZS1zdXJ2aXZvcnM=',
  'QmVscGFlc2U=',
  'UmF0Y2hv',
  'RnJlZXR0bw==',
  'UHJvdm9sYQ==',
  'TW9ydGFjY2lv',
  'RXhpdmlpcQ==',
  'UXVlZW4gU2lnbWE=',
  '5a6J5Lic5bC85aWl',
  '5LyK5qKF5bCU6L6+',
  '5biV5pav5aS455Cz5aic',
  '6Km557qz572X',
  '5Z2hwrfmi4npvZDlpaU=',
  '5YWL572X5aWH',
  '5pmu5qC857qz5ouJ',
  '6I6r5aGU5LmU',
  '6Im+5YWL5pav6L6+5LuA',
  '6LWk5q2756We',
  '6KW/5qC8546b',
  '5aSq56m66ICB5ZOl',
  '5YeJ5Lqt5oCq5a6i',
  '5pyI5Y2O5LyK5aGU',
  '6LSd5bCU5biV5Z+D5aGe',
  '5ouJ5Lic57qz',
].map(b64);

const FORBIDDEN_IDS = [
  'YW50b25pbw==',
  'aW1lbGRh',
  'cGFzcXVhbGluYQ==',
  'Z2VubmFybw==',
  'YXJjYQ==',
  'cG9ydGE=',
  'cG9l',
  'a3JvY2hp',
  'cHVnbmFsYQ==',
  'bW9ydGFjY2lv',
  'ZXhkYXNo',
  'cmVkX2RlYXRo',
  'cXVlZW5fc2lnbWE=',
  'c2hlX21vb24=',
  'c3BhY2VfZHVkZQ==',
  'c2FudGFfbGFkb25uYQ==',
  'Z2F6ZWJv',
  'bGFtYQ==',
  'Y2xlcmljaQ==',
  'ZG9tbWFyaW8=',
  'Y2hyaXN0aW5l',
  'cGVwcGlubw==',
  'c3BlbGxfZXhkYXNo',
  'c3BlbGxfcmVkX2RlYXRo',
  'c3BlbGxfc2lnbWE=',
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

test('9. 产品标识与内容命名不回流参考作品名称', () => {
  const files = collectFiles(GAME_ROOT).filter((file) => !file.endsWith(SELF));
  const hits: string[] = [];

  for (const file of files) {
    const rel = relative(GAME_ROOT, file).split(/[\\/]/).join('/');
    const text = readFileSync(file, 'utf8');
    for (const label of FORBIDDEN_LABELS) {
      if (text.includes(label)) hits.push(`${rel}: 名称 "${label}"`);
    }
    for (const id of FORBIDDEN_IDS) {
      const pattern = new RegExp(`(^|[^A-Za-z0-9_])${id}([^A-Za-z0-9_]|$)`);
      if (pattern.test(text)) hits.push(`${rel}: id "${id}"`);
    }
  }

  assert.deepEqual(hits, [], `发现参考作品标识回流：\n${hits.join('\n')}`);
});

test('10. 公开标识使用本项目自有名', () => {
  const read = (rel: string) => readFileSync(join(GAME_ROOT, rel), 'utf8');

  const meta = JSON.parse(read('game.json')) as { title: string; description: string };
  assert.equal(meta.title, '永夜余烬');
  const forbiddenPattern = new RegExp([FORBIDDEN_LABELS[0], FORBIDDEN_LABELS[1]].join('|'), 'i');
  assert.ok(!forbiddenPattern.test(meta.description), `描述仍引用禁用标识：${meta.description}`);

  assert.match(read('index.html'), /<title>永夜余烬<\/title>/);

  const storage = read('src/persistence/storage.ts');
  assert.match(storage, /youxi:long-night-embers-h5/);

  const app = read('src/App.tsx');
  assert.match(app, /EMBERS OF THE LONG NIGHT/);
  assert.match(app, /LongNightEmbersEngine/);

  const styles = read('src/style.css');
  assert.ok(!/\bvs-/.test(styles), '样式表仍在使用旧前缀 vs-');

  assert.ok(statSync(join(GAME_ROOT, 'assets')).isDirectory(), 'assets 目录缺失');
});
