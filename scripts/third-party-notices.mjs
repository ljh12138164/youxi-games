// 打包进产物的第三方依赖，其版权声明必须随分发副本保留（MIT 等许可证要求）。
// Vite 8 / Rolldown 未暴露 legalComments 配置项，因此在构建期把声明直接注入 HTML。
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license', 'LICENCE.txt'];

function resolvePackageDir(root, name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`, { paths: [root] }));
  } catch {
    const direct = path.join(root, 'node_modules', ...name.split('/'));
    return existsSync(path.join(direct, 'package.json')) ? direct : null;
  }
}

/** 收集直接依赖的许可信息与许可全文 */
export function collectThirdPartyNotices(root) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const notices = [];

  for (const name of Object.keys(pkg.dependencies ?? {})) {
    const dir = resolvePackageDir(root, name);
    if (!dir) continue;

    let meta;
    try {
      meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }

    const licensePath = LICENSE_FILES.map((file) => path.join(dir, file)).find((file) =>
      existsSync(file),
    );
    if (!licensePath) continue;

    notices.push({
      name: meta.name ?? name,
      version: meta.version ?? 'unknown',
      license: typeof meta.license === 'string' ? meta.license : (meta.license?.type ?? '见许可全文'),
      text: readFileSync(licensePath, 'utf8').trim(),
    });
  }

  return notices;
}

/** 生成注入 HTML 的声明块 */
export function renderNotices(notices) {
  const body = notices
    .map(
      (notice) =>
        `${notice.name} v${notice.version} — ${notice.license}\n${notice.text.replace(
          /^/gm,
          '    ',
        )}`,
    )
    .join('\n\n');
  return `<!--\n  第三方组件许可声明（随本产物一并分发）\n\n${body}\n-->`;
}

/** Vite 插件：把第三方许可声明注入生成的 HTML */
export function thirdPartyNoticesPlugin(root) {
  const notices = collectThirdPartyNotices(root);
  const block = renderNotices(notices);
  return {
    name: 'third-party-notices',
    enforce: 'post',
    transformIndexHtml(html) {
      if (!html.includes('</body>')) return html;
      return html.replace('</body>', `${block}\n</body>`);
    },
  };
}
