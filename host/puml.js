/**
 * PlantUML 服务端渲染：Host 生成压缩 URL 并请求官方服务，
 * 客户端只拿同源 SVG，避免长源码 URL 过长和浏览器直连外部服务。
 *
 * @module @local/markdown-notes/host/puml
 */
import { deflateSync } from 'node:zlib';

const SERVER = 'https://www.plantuml.com/plantuml/svg/';
const CACHE_LIMIT = 64;
const cache = new Map();

function encode6bit(value) {
  let b = value & 0x3f;
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

function append3bytes(b1, b2, b3) {
  return (
    encode6bit(b1 >> 2) +
    encode6bit(((b1 & 0x3) << 4) | (b2 >> 4)) +
    encode6bit(((b2 & 0xf) << 2) | (b3 >> 6)) +
    encode6bit(b3)
  );
}

/** PlantUML 的 zlib + 自定义 base64 编码。 */
export function encodePlantUml(source) {
  const compressed = deflateSync(Buffer.from(String(source || ''), 'utf8'));
  let out = '';
  for (let index = 0; index < compressed.length; index += 3) {
    if (index + 2 === compressed.length) out += append3bytes(compressed[index], compressed[index + 1], 0);
    else if (index + 1 === compressed.length) out += append3bytes(compressed[index], 0, 0);
    else out += append3bytes(compressed[index], compressed[index + 1], compressed[index + 2]);
  }
  return out;
}

function cacheGet(key) {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/** 渲染 PlantUML 源码为 SVG 文本。 */
export async function renderPlantUml(source, logger) {
  const text = String(source === undefined || source === null ? '' : source).trim();
  if (text === '') throw new Error('PlantUML 源码为空');
  const cached = cacheGet(text);
  if (cached !== undefined) return cached;
  if (typeof fetch !== 'function') throw new Error('Host 运行时不支持网络请求');
  const url = SERVER + '~1' + encodePlantUml(text);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'image/svg+xml' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('PlantUML 服务返回 HTTP ' + response.status);
    const svg = await response.text();
    if (!/^\s*<svg[\s>]/i.test(svg)) throw new Error('PlantUML 返回内容不是 SVG');
    cacheSet(text, svg);
    return svg;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('PlantUML 服务请求超时');
    logger?.warn?.(
      `[markdown-notes] PlantUML 渲染失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
