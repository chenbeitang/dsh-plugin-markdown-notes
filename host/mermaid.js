/**
 * Mermaid 渲染库读取。库文件随插件放在 host/mermaid.min.js，
 * 由 Host 以同源静态资源提供给预览层按需加载。
 *
 * @module @local/markdown-notes/host/mermaid
 */
import { readFileSync } from 'node:fs';

const BUNDLE_URL = new URL('./mermaid.min.js', import.meta.url);
let cached = null;

/** 读取 Mermaid 打包文件（进程内缓存）。 */
export function readMermaidBundle() {
  if (cached === null) cached = readFileSync(BUNDLE_URL);
  return cached;
}
