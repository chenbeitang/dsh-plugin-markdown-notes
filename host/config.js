/**
 * 插件配置：默认值、配置文件读写、Loader 行配置校验。
 *
 * 职责边界：
 * - 说明「笔记根目录」从哪里来（Loader 行 config → 本插件数据目录里的 config.json → 默认路径）；
 * - 提供 StandardSchemaV1 手写实现的 Config，使插件不依赖任何宿主包；
 * - 不访问笔记文件本身（目录与文件操作见 storage.js）。
 *
 * @module @local/markdown-notes/host/config
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** 插件语义版本，同时给 /api/health 与 Client 兜底文案使用。 */
export const VERSION = '1.14.2';

/** 默认笔记根目录名。 */
export const DEFAULT_STORAGE_NAME = 'DSH Markdown Notes';

/** 默认笔记根目录：<用户文档>/DSH Markdown Notes。 */
export function defaultStoragePath() {
  return join(homedir(), 'Documents', DEFAULT_STORAGE_NAME);
}

/**
 * 插件数据目录：保存「用户选择的存储路径」等运行时设置。
 * 优先使用当前 profile 目录，避免不同 profile 互相覆盖。
 */
export function dataDirectory() {
  const profile = typeof process.env.DSH_PROFILE_DIR === 'string' ? process.env.DSH_PROFILE_DIR.trim() : '';
  const base = profile !== '' ? profile : join(homedir(), '.dsh');
  return join(base, 'markdown-notes');
}

/** 配置文件路径。 */
export function settingsFile() {
  return join(dataDirectory(), 'config.json');
}

/** 运行时设置的默认值。 */
export const SETTINGS_DEFAULTS = Object.freeze({
  /** 用户选择的笔记根目录；空串 = 使用默认目录。 */
  storagePath: '',
});

/** 是否普通对象（排除 null / 数组）。 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 展开 `~` 与 `~/...`，并去掉首尾空白。 */
export function expandPath(input) {
  let text = typeof input === 'string' ? input.trim() : '';
  if (text === '') return '';
  if (text === '~') return homedir();
  if (text.startsWith('~/') || text.startsWith('~\\')) text = join(homedir(), text.slice(2));
  return text;
}

/** 把路径规范成绝对路径（不要求存在）。 */
export function absolutePath(input) {
  const expanded = expandPath(input);
  if (expanded === '') return '';
  return resolve(expanded);
}

/** 读取运行时设置；文件缺失或损坏时返回默认值，永不抛错。 */
export function readSettings() {
  try {
    const file = settingsFile();
    if (!existsSync(file)) return { ...SETTINGS_DEFAULTS };
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (!isPlainObject(raw)) return { ...SETTINGS_DEFAULTS };
    return { storagePath: typeof raw.storagePath === 'string' ? raw.storagePath : '' };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/** 原子写入运行时设置。 */
export function writeSettings(settings) {
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true });
  const file = settingsFile();
  const tmp = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
  const payload = {
    version: 1,
    storagePath: typeof settings.storagePath === 'string' ? settings.storagePath : '',
  };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  renameSync(tmp, file);
}

/** Loader 行配置校验：只接受可选的 storagePath 字符串。 */
export function validateConfig(raw) {
  const input = isPlainObject(raw) ? raw : {};
  const issues = [];
  const storagePath = input.storagePath === undefined ? '' : input.storagePath;
  if (typeof storagePath !== 'string') {
    issues.push({ message: 'storagePath 必须是字符串（绝对路径，或留空使用默认目录）', path: ['storagePath'] });
  } else if (storagePath.trim() !== '' && !isAbsolute(expandPath(storagePath))) {
    issues.push({ message: 'storagePath 必须是绝对路径，或留空使用默认目录', path: ['storagePath'] });
  }
  if (issues.length > 0) return { issues };
  return { value: { storagePath: String(storagePath).trim() } };
}

/** 归一化 Loader 配置；永不抛错。 */
export function normalizeConfig(raw) {
  const { value } = validateConfig(raw);
  return value || { storagePath: '' };
}

/** Cordis 插件配置 schema（StandardSchemaV1 手写实现，零宿主依赖）。 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: '@local/markdown-notes',
    validate(raw) {
      return validateConfig(raw);
    },
  },
};
