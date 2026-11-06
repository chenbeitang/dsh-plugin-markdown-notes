/**
 * 构建脚本：把 src/client/*.js 按文件名顺序拼接成运行时产物 client.js。
 *
 * 用法：
 *   node build.mjs          生成 client.js
 *   node build.mjs --check  只校验 client.js 是否与源码同步
 *
 * @module @local/markdown-notes/build
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const partsDir = join(root, 'src', 'client');
const target = join(root, 'client.js');

const REQUIRED_HEAD = '00-header.js';
const REQUIRED_TAIL = '99-apply.js';
const BANNED = /^(?:import\s|export\s|await\s)/m;

const files = readdirSync(partsDir)
  .filter((name) => name.endsWith('.js'))
  .sort();

for (const required of [REQUIRED_HEAD, REQUIRED_TAIL]) {
  if (!files.includes(required)) {
    console.error(`[build] 缺少必需 part: src/client/${required}`);
    process.exit(1);
  }
}

const parts = files.map((name) => {
  const source = readFileSync(join(partsDir, name), 'utf8');
  if (BANNED.test(source)) {
    console.error(`[build] ${name} 含顶层 import/export/await（part 必须是同一工厂作用域片段）`);
    process.exit(1);
  }
  return `\n/* ==================== src/client/${name} ==================== */\n${source.trimEnd()}\n`;
});

const output = '/* 由 build.mjs 生成，请勿直接修改；改动请写在 src/client/*.js 后重新构建。 */\n' + parts.join('');

if (process.argv.includes('--check')) {
  if (!existsSync(target)) {
    console.error('[build] client.js 不存在，请先运行 node build.mjs');
    process.exit(2);
  }
  if (readFileSync(target, 'utf8') !== output) {
    console.error('[build] client.js 与源码不同步，请运行 node build.mjs');
    process.exit(2);
  }
  console.log(`[build] client.js 已是最新（${(output.length / 1024).toFixed(1)} KiB）`);
} else {
  writeFileSync(target, output, 'utf8');
  console.log(`[build] 已生成 client.js：${(output.length / 1024).toFixed(1)} KiB`);
  console.log('[build] parts: ' + files.join(', '));
}
