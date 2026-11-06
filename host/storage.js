/**
 * 笔记仓库：本地 Markdown 目录树、笔记读写、图片、收藏元数据与全文搜索。
 *
 * 安全契约（必须始终成立）：
 * - 任何来自浏览器的相对路径都经 `resolveRel` 校验，绝不允许逃出笔记根目录；
 * - 只把 `.md` / `.markdown` 当笔记，只把白名单图片格式当图片；
 * - 上传图片按魔数（而非扩展名）识别真实格式，拒绝 SVG 等可执行内容；
 * - 所有写操作串行化，并使用「临时文件 + rename」原子落盘。
 *
 * @module @local/markdown-notes/host/storage
 */
import { promises as fsp } from 'node:fs';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { absolutePath, dataDirectory, defaultStoragePath, readSettings, writeSettings } from './config.js';

/** 元数据文件名（收藏 / 最近打开），位于笔记根目录内并随目录一起移动。 */
export const META_FILE = '.dsh-notes-meta.json';

/** 图片目录（根目录下，不显示在目录树里）。 */
export const ASSETS_DIR = 'assets';

/** 视为笔记的扩展名。 */
const NOTE_EXTENSIONS = new Set(['.md', '.markdown']);

/** 允许读取 / 展示的图片扩展名与 Content-Type。 */
const MEDIA_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
]);

/** 单张图片体积上限（解码后 20 MiB）。 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 单篇笔记体积上限（4 MiB UTF-8 文本）。 */
const MAX_NOTE_BYTES = 4 * 1024 * 1024;

/** 目录树最多返回的节点数，防止异常目录拖垮浏览器。 */
const MAX_TREE_NODES = 6000;

/** 目录树最大递归深度。 */
const MAX_TREE_DEPTH = 16;

/** 可读写的业务错误。 */
export class NotesError extends Error {
  /**
   * @param {string} code 稳定错误码（客户端 / Agent 可判断）。
   * @param {string} message 面向用户的中文错误文案。
   */
  constructor(code, message) {
    super(message);
    this.name = 'NotesError';
    this.code = code;
  }
}

/** 规范化名称：去掉文件系统非法字符，避免空名与隐藏名。 */
function sanitizeName(input, fallback) {
  let name = String(input === undefined || input === null ? '' : input).trim();
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  name = name.replace(/^\.+/, '').replace(/[. ]+$/g, '').trim();
  if (name === '') name = fallback;
  if (name.length > 80) name = name.slice(0, 80).trim();
  return name;
}

/** 从文件名取展示名（去掉笔记扩展名）。 */
function displayNameOf(fileName) {
  const ext = path.extname(fileName);
  return NOTE_EXTENSIONS.has(ext.toLowerCase()) ? fileName.slice(0, fileName.length - ext.length) : fileName;
}

/** 判断相对路径是否落在笔记扩展名白名单内。 */
function isNoteName(name) {
  return NOTE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * 校验并规范化一个「相对笔记根目录」的路径。
 * @param {unknown} rel 原始相对路径。
 * @param {{allowRoot?: boolean}} [options] 是否允许空路径（代表根目录）。
 * @returns {string} 干净的正斜杠相对路径。
 */
function normalizeRel(rel, options = {}) {
  if (typeof rel !== 'string') throw new NotesError('invalid-path', '缺少路径');
  const cleaned = rel.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (cleaned === '') {
    if (options.allowRoot) return '';
    throw new NotesError('invalid-path', '缺少路径');
  }
  const parts = cleaned.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') throw new NotesError('invalid-path', '路径不合法');
    if (part.includes('\u0000')) throw new NotesError('invalid-path', '路径不合法');
  }
  return parts.join('/');
}

/**
 * 把相对路径解析成根目录下的绝对路径，并复核包含关系。
 * @param {string} root 笔记根目录绝对路径。
 * @param {unknown} rel 相对路径。
 * @param {{allowRoot?: boolean}} [options]
 * @returns {{rel: string, abs: string}}
 */
function resolveRel(root, rel, options = {}) {
  const cleanRel = normalizeRel(rel, options);
  const abs = cleanRel === '' ? path.resolve(root) : path.resolve(root, ...cleanRel.split('/'));
  const rootAbs = path.resolve(root);
  const fromRoot = path.relative(rootAbs, abs);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    throw new NotesError('invalid-path', '路径越界');
  }
  return { rel: cleanRel, abs };
}

/** 时间戳转目录名用的 `YYYY-MM`。 */
function monthFolder(now) {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

/** 按魔数识别图片格式，返回扩展名与 MIME；非白名单图片返回 null。 */
function sniffImage(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 6) {
    const head = buffer.toString('ascii', 0, 6);
    if (head === 'GIF87a' || head === 'GIF89a') return { ext: 'gif', mime: 'image/gif' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { ext: 'bmp', mime: 'image/bmp' };
  }
  return null;
}

/** 把任意异常归一成 NotesError。 */
function asNotesError(error) {
  if (error instanceof NotesError) return error;
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'ENOENT') return new NotesError('not-found', '文件或目录不存在');
  if (code === 'EACCES' || code === 'EPERM') return new NotesError('permission-denied', '没有权限访问该路径');
  if (code === 'ENOSPC') return new NotesError('no-space', '磁盘空间不足');
  if (code === 'EEXIST') return new NotesError('exists', '同名文件或目录已存在');
  if (code === 'ENOTDIR') return new NotesError('not-a-directory', '目标不是目录');
  if (code === 'EISDIR') return new NotesError('is-a-directory', '目标是一个目录');
  return new NotesError('internal', '内部错误：' + (error instanceof Error ? error.message : String(error)));
}

/**
 * 本地 Markdown 笔记仓库。
 */
export class NotesStore {
  /**
   * @param {{config: {storagePath: string}, logger?: {warn?: Function, info?: Function}}} options
   */
  constructor(options) {
    this.config = options.config || { storagePath: '' };
    this.logger = options.logger || null;
    this.dataDir = dataDirectory();
    this.root = '';
    this.settings = readSettings();
    this.meta = null;
    this.ready = null;
    this.queue = Promise.resolve();
    this.root = this._resolveInitialRoot();
  }

  /** 初始根目录：运行时设置 > Loader 配置 > 默认目录。 */
  _resolveInitialRoot() {
    const fromSettings = absolutePath(this.settings.storagePath);
    if (fromSettings !== '') return fromSettings;
    const fromConfig = absolutePath(this.config.storagePath);
    if (fromConfig !== '') return fromConfig;
    return path.resolve(defaultStoragePath());
  }

  /** 串行化写操作。 */
  _enqueue(operation) {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** 确保根目录存在、元数据已加载（可重复调用）。 */
  async ensure() {
    if (!this.ready) {
      this.ready = this._init().catch((error) => {
        this.ready = null;
        throw asNotesError(error);
      });
    }
    await this.ready;
  }

  async _init() {
    await fsp.mkdir(this.root, { recursive: true });
    const info = await fsp.stat(this.root);
    if (!info.isDirectory()) throw new NotesError('storage-unavailable', '笔记存储路径不是目录');
    this.meta = await this._loadMeta(true);
  }

  /** 当前设置（含默认路径与是否存在）。 */
  getSettings() {
    return {
      storagePath: this.root,
      defaultStoragePath: path.resolve(defaultStoragePath()),
      dataDir: this.dataDir,
      isDefault: path.resolve(this.root) === path.resolve(defaultStoragePath()),
      exists: existsSync(this.root),
    };
  }

  /** 元数据文件绝对路径。 */
  _metaPath() {
    return path.join(this.root, META_FILE);
  }

  async _loadMeta(force) {
    if (this.meta !== null && force !== true) return this.meta;
    let raw = null;
    try {
      const text = await fsp.readFile(this._metaPath(), 'utf8');
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
    this.meta = this._normalizeMeta(raw);
    return this.meta;
  }

  _normalizeMeta(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const favorites = [];
    const seen = new Set();
    if (Array.isArray(input.favorites)) {
      for (const item of input.favorites) {
        if (typeof item !== 'string') continue;
        let clean;
        try {
          clean = normalizeRel(item);
        } catch {
          continue;
        }
        if (!isNoteName(clean)) continue;
        if (seen.has(clean)) continue;
        seen.add(clean);
        favorites.push(clean);
        if (favorites.length >= 500) break;
      }
    }
    let lastOpened = null;
    if (typeof input.lastOpened === 'string') {
      try {
        lastOpened = normalizeRel(input.lastOpened);
      } catch {
        lastOpened = null;
      }
    }
    return { version: 1, favorites, lastOpened, updatedAt: Date.now() };
  }

  async _saveMeta() {
    const meta = this.meta || this._normalizeMeta(null);
    meta.updatedAt = Date.now();
    await this.ensure();
    const file = this._metaPath();
    const tmp = path.join(path.dirname(file), `.${META_FILE}.tmp-${process.pid}-${randomBytes(3).toString('hex')}`);
    const text = JSON.stringify(meta, null, 2);
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, file);
  }

  /** 原子写入文本文件。 */
  async _writeAtomic(abs, text) {
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const tmp = path.join(
      path.dirname(abs),
      `.${path.basename(abs)}.tmp-${process.pid}-${randomBytes(3).toString('hex')}`,
    );
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, abs);
  }

  /** 收集目录树；隐藏点文件、根目录下的 assets / node_modules。 */
  async _collectTree() {
    const stats = { notes: 0, folders: 0, truncated: false };
    let budget = MAX_TREE_NODES;
    const walk = async (absDir, relDir, depth) => {
      if (depth > MAX_TREE_DEPTH || budget <= 0) {
        stats.truncated = stats.truncated || budget <= 0;
        return [];
      }
      let entries;
      try {
        entries = await fsp.readdir(absDir, { withFileTypes: true });
      } catch {
        return [];
      }
      const nodes = [];
      for (const entry of entries) {
        if (budget <= 0) {
          stats.truncated = true;
          break;
        }
        const name = entry.name;
        if (name.startsWith('.')) continue;
        if (entry.isSymbolicLink()) continue;
        if (relDir === '' && (name === ASSETS_DIR || name === 'node_modules')) continue;
        const abs = path.join(absDir, name);
        const rel = relDir === '' ? name : `${relDir}/${name}`;
        if (entry.isDirectory()) {
          stats.folders += 1;
          budget -= 1;
          const children = await walk(abs, rel, depth + 1);
          nodes.push({ type: 'folder', name, path: rel, children });
          continue;
        }
        if (!entry.isFile() || !isNoteName(name)) continue;
        let info;
        try {
          info = await fsp.stat(abs);
        } catch {
          continue;
        }
        stats.notes += 1;
        budget -= 1;
        nodes.push({
          type: 'note',
          name: displayNameOf(name),
          fileName: name,
          path: rel,
          size: info.size,
          mtimeMs: info.mtimeMs,
        });
      }
      nodes.sort((left, right) => {
        if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
        return left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
      });
      return nodes;
    };
    const tree = await walk(this.root, '', 0);
    return { tree, stats };
  }

  /** 遍历所有笔记文件（给全文搜索用）。 */
  async _walkNoteFiles(limit) {
    const files = [];
    const walk = async (absDir, relDir, depth) => {
      if (depth > MAX_TREE_DEPTH || files.length >= limit) return;
      let entries;
      try {
        entries = await fsp.readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (files.length >= limit) return;
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        if (relDir === '' && (entry.name === ASSETS_DIR || entry.name === 'node_modules')) continue;
        const abs = path.join(absDir, entry.name);
        const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(abs, rel, depth + 1);
        } else if (entry.isFile() && isNoteName(entry.name)) {
          let info;
          try {
            info = await fsp.stat(abs);
          } catch {
            continue;
          }
          files.push({ rel, abs, fileName: entry.name, name: displayNameOf(entry.name), mtimeMs: info.mtimeMs, size: info.size });
        }
      }
    };
    await walk(this.root, '', 0);
    return files;
  }

  /** 读取完整状态：设置 + 目录树 + 收藏 + 最近打开。 */
  async state() {
    await this.ensure();
    const meta = await this._loadMeta();
    const collected = await this._collectTree();
    return {
      settings: this.getSettings(),
      tree: collected.tree,
      stats: collected.stats,
      favorites: meta.favorites.slice(),
      lastOpened: meta.lastOpened,
    };
  }

  /** 读取一篇笔记。 */
  async readNote(rel) {
    await this.ensure();
    const { rel: cleanRel, abs } = resolveRel(this.root, rel);
    const ext = path.extname(abs).toLowerCase();
    if (!NOTE_EXTENSIONS.has(ext)) throw new NotesError('not-a-note', '只能打开 Markdown 笔记');
    let content;
    let info;
    try {
      content = await fsp.readFile(abs, 'utf8');
      info = await fsp.stat(abs);
    } catch (error) {
      throw asNotesError(error);
    }
    return {
      path: cleanRel,
      name: displayNameOf(path.basename(abs)),
      fileName: path.basename(abs),
      content,
      mtimeMs: info.mtimeMs,
      size: info.size,
    };
  }

  /** 保存一篇笔记（不存在时创建，供 Agent 写入用）。 */
  async saveNote(rel, content) {
    if (typeof content !== 'string') throw new NotesError('invalid-content', '笔记内容必须是文本');
    if (Buffer.byteLength(content, 'utf8') > MAX_NOTE_BYTES) throw new NotesError('too-large', '笔记超过 4 MiB 上限');
    return this._enqueue(async () => {
      await this.ensure();
      let { rel: cleanRel, abs } = resolveRel(this.root, rel);
      if (path.extname(abs) === '') {
        cleanRel = `${cleanRel}.md`;
        abs = `${abs}.md`;
      }
      if (!isNoteName(abs)) throw new NotesError('not-a-note', '笔记必须是 .md 或 .markdown 文件');
      await this._writeAtomic(abs, content);
      let info;
      try {
        info = await fsp.stat(abs);
      } catch (error) {
        throw asNotesError(error);
      }
      return { path: cleanRel, name: displayNameOf(path.basename(abs)), mtimeMs: info.mtimeMs, size: info.size };
    });
  }

  /** 新建笔记，返回相对路径。 */
  async createNote(parentRel, title) {
    return this._enqueue(async () => {
      await this.ensure();
      const parent = resolveRel(this.root, parentRel === '' ? '' : parentRel, { allowRoot: true });
      await fsp.mkdir(parent.abs, { recursive: true });
      const display = sanitizeName(title, '未命名笔记');
      const baseName = /\.(md|markdown)$/i.test(display) ? display : `${display}.md`;
      let fileName = baseName;
      let suffix = 1;
      while (existsSync(path.join(parent.abs, fileName))) {
        suffix += 1;
        fileName = baseName.replace(/\.(md|markdown)$/i, '') + ` (${suffix}).md`;
        if (suffix > 200) throw new NotesError('exists', '同名笔记过多');
      }
      const abs = path.join(parent.abs, fileName);
      const noteTitle = displayNameOf(fileName);
      const template = `# ${noteTitle}\n\n`;
      await this._writeAtomic(abs, template);
      const rel = parent.rel === '' ? fileName : `${parent.rel}/${fileName}`;
      const info = await fsp.stat(abs);
      return { path: rel, name: noteTitle, fileName, mtimeMs: info.mtimeMs, content: template };
    });
  }

  /** 新建目录。 */
  async createFolder(parentRel, name) {
    return this._enqueue(async () => {
      await this.ensure();
      const parent = resolveRel(this.root, parentRel === '' ? '' : parentRel, { allowRoot: true });
      const display = sanitizeName(name, '新建文件夹');
      const abs = path.join(parent.abs, display);
      if (existsSync(abs)) throw new NotesError('exists', '同名文件夹已存在');
      await fsp.mkdir(abs, { recursive: false });
      const rel = parent.rel === '' ? display : `${parent.rel}/${display}`;
      return { path: rel, name: display, type: 'folder' };
    });
  }

  /** 重命名笔记或目录（笔记未写扩展名时保留原扩展名）。 */
  async renameEntry(rel, nextName) {
    return this._enqueue(async () => {
      await this.ensure();
      const source = resolveRel(this.root, rel);
      let info;
      try {
        info = await fsp.stat(source.abs);
      } catch (error) {
        throw asNotesError(error);
      }
      const display = sanitizeName(nextName, '');
      if (display === '') throw new NotesError('invalid-name', '名称不能为空');
      let fileName = display;
      if (info.isDirectory()) {
        if (notesInsideNameTrouble(display)) throw new NotesError('invalid-name', '文件夹名称不合法');
      } else {
        if (!isNoteName(fileName)) {
          const oldExt = path.extname(source.abs).toLowerCase() || '.md';
          fileName = `${fileName}${oldExt}`;
        }
        if (!isNoteName(fileName)) throw new NotesError('not-a-note', '笔记必须是 .md 或 .markdown 文件');
      }
      const targetAbs = path.join(path.dirname(source.abs), fileName);
      if (path.resolve(targetAbs) === path.resolve(source.abs)) {
        return { path: source.rel, name: displayNameOf(fileName), fileName, type: info.isDirectory() ? 'folder' : 'note' };
      }
      if (existsSync(targetAbs)) throw new NotesError('exists', '同名文件或目录已存在');
      try {
        await fsp.rename(source.abs, targetAbs);
      } catch (error) {
        throw asNotesError(error);
      }
      const parentRel = source.rel.includes('/') ? source.rel.slice(0, source.rel.lastIndexOf('/')) : '';
      const targetRel = parentRel === '' ? fileName : `${parentRel}/${fileName}`;
      // 收藏与最近打开路径跟随重命名（含目录下的所有子路径）。
      const meta = await this._loadMeta();
      let changed = false;
      meta.favorites = meta.favorites.map((item) => {
        const mapped = remapPath(item, source.rel, targetRel);
        if (mapped !== item) changed = true;
        return mapped;
      });
      if (meta.lastOpened !== null) {
        const mapped = remapPath(meta.lastOpened, source.rel, targetRel);
        if (mapped !== meta.lastOpened) {
          meta.lastOpened = mapped;
          changed = true;
        }
      }
      if (changed) await this._saveMeta();
      return {
        path: targetRel,
        name: displayNameOf(fileName),
        fileName,
        type: info.isDirectory() ? 'folder' : 'note',
        oldPath: source.rel,
      };
    });
  }

  /** 读取条目位置（供“在文件管理器中打开”使用；不把绝对路径返回给浏览器）。 */
  async entryLocation(rel) {
    await this.ensure();
    const target = resolveRel(this.root, rel);
    if (target.rel === '') throw new NotesError('invalid-path', '不能对笔记根目录执行该操作');
    let info;
    try {
      info = await fsp.lstat(target.abs);
    } catch (error) {
      throw asNotesError(error);
    }
    if (info.isSymbolicLink()) throw new NotesError('unsupported', '不支持符号链接');
    return {
      path: target.rel,
      absPath: target.abs,
      isDirectory: info.isDirectory(),
      parentPath: path.dirname(target.abs),
    };
  }

  /** 把笔记或目录移动到另一个目录（禁止移动到自身 / 子级目录）。 */
  async moveEntry(rel, targetDirRel) {
    return this._enqueue(async () => {
      await this.ensure();
      const source = resolveRel(this.root, rel);
      if (source.rel === '') throw new NotesError('invalid-path', '不能移动笔记根目录');
      const targetDir = resolveRel(this.root, targetDirRel === undefined || targetDirRel === null ? '' : targetDirRel, {
        allowRoot: true,
      });
      let info;
      try {
        info = await fsp.lstat(source.abs);
      } catch (error) {
        throw asNotesError(error);
      }
      if (info.isSymbolicLink()) throw new NotesError('unsupported', '不支持移动符号链接');
      if (!info.isDirectory() && !info.isFile()) throw new NotesError('unsupported', '不支持的条目类型');
      if (info.isDirectory() && (targetDir.rel === source.rel || targetDir.rel.startsWith(`${source.rel}/`))) {
        throw new NotesError('invalid-target', '不能把文件夹移动到自身或它的子级目录');
      }
      let dirInfo;
      try {
        dirInfo = await fsp.stat(targetDir.abs);
      } catch (error) {
        throw asNotesError(error);
      }
      if (!dirInfo.isDirectory()) throw new NotesError('invalid-target', '目标不是文件夹');
      const parentRel = source.rel.includes('/') ? source.rel.slice(0, source.rel.lastIndexOf('/')) : '';
      if (parentRel === targetDir.rel) throw new NotesError('noop', '已经在该文件夹中');
      const fileName = path.basename(source.abs);
      const targetAbs = path.join(targetDir.abs, fileName);
      if (existsSync(targetAbs)) throw new NotesError('exists', '目标文件夹已有同名文件或文件夹');
      try {
        await fsp.rename(source.abs, targetAbs);
      } catch (error) {
        throw asNotesError(error);
      }
      const targetRel = targetDir.rel === '' ? fileName : `${targetDir.rel}/${fileName}`;
      const meta = await this._loadMeta();
      let changed = false;
      meta.favorites = meta.favorites.map((item) => {
        const mapped = remapPath(item, source.rel, targetRel);
        if (mapped !== item) changed = true;
        return mapped;
      });
      if (meta.lastOpened !== null) {
        const mapped = remapPath(meta.lastOpened, source.rel, targetRel);
        if (mapped !== meta.lastOpened) {
          meta.lastOpened = mapped;
          changed = true;
        }
      }
      if (changed) await this._saveMeta();
      return {
        path: targetRel,
        oldPath: source.rel,
        name: info.isDirectory() ? fileName : displayNameOf(fileName),
        fileName,
        type: info.isDirectory() ? 'folder' : 'note',
        targetDir: targetDir.rel,
      };
    });
  }

  /** 删除笔记或目录（目录递归删除）。 */
  async deleteEntry(rel) {
    return this._enqueue(async () => {
      await this.ensure();
      const target = resolveRel(this.root, rel);
      if (target.rel === '') throw new NotesError('invalid-path', '不能删除笔记根目录');
      let info;
      try {
        info = await fsp.lstat(target.abs);
      } catch (error) {
        throw asNotesError(error);
      }
      if (info.isSymbolicLink()) throw new NotesError('unsupported', '不支持删除符号链接');
      try {
        await fsp.rm(target.abs, { recursive: info.isDirectory(), force: false });
      } catch (error) {
        throw asNotesError(error);
      }
      const meta = await this._loadMeta();
      const before = meta.favorites.length;
      meta.favorites = meta.favorites.filter(
        (item) => item !== target.rel && !item.startsWith(`${target.rel}/`),
      );
      if (meta.lastOpened === target.rel || (meta.lastOpened !== null && meta.lastOpened.startsWith(`${target.rel}/`))) {
        meta.lastOpened = null;
      }
      if (meta.favorites.length !== before) await this._saveMeta();
      return { path: target.rel, deleted: true, type: info.isDirectory() ? 'folder' : 'note' };
    });
  }

  /** 设置 / 取消收藏；`favorite` 省略时切换。 */
  async setFavorite(rel, favorite) {
    return this._enqueue(async () => {
      await this.ensure();
      const target = resolveRel(this.root, rel);
      if (!isNoteName(target.abs)) throw new NotesError('not-a-note', '只能收藏 Markdown 笔记');
      let info;
      try {
        info = await fsp.stat(target.abs);
      } catch (error) {
        throw asNotesError(error);
      }
      if (!info.isFile()) throw new NotesError('not-a-note', '只能收藏 Markdown 笔记');
      const meta = await this._loadMeta();
      const has = meta.favorites.includes(target.rel);
      const want = typeof favorite === 'boolean' ? favorite : !has;
      if (want && !has) meta.favorites.push(target.rel);
      if (!want && has) meta.favorites = meta.favorites.filter((item) => item !== target.rel);
      await this._saveMeta();
      return { path: target.rel, favorite: want, favorites: meta.favorites.slice() };
    });
  }

  /** 记录最近打开；文件不存在时忽略。 */
  async touchLastOpened(rel) {
    return this._enqueue(async () => {
      await this.ensure();
      const target = resolveRel(this.root, rel);
      try {
        const info = await fsp.stat(target.abs);
        if (!info.isFile()) return { lastOpened: null };
      } catch {
        return { lastOpened: null };
      }
      const meta = await this._loadMeta();
      meta.lastOpened = target.rel;
      await this._saveMeta();
      return { lastOpened: target.rel };
    });
  }

  /** 更新存储路径（运行时设置）。 */
  async setStoragePath(input) {
    return this._enqueue(async () => {
      const target = absolutePath(input);
      if (target === '') throw new NotesError('invalid-path', '请填写笔记存储目录的绝对路径');
      try {
        const info = await fsp.stat(target);
        if (!info.isDirectory()) throw new NotesError('storage-unavailable', '该路径不是目录');
      } catch (error) {
        if (error instanceof NotesError) throw error;
        if (!error || error.code !== 'ENOENT') throw asNotesError(error);
        try {
          await fsp.mkdir(target, { recursive: true });
        } catch (mkdirError) {
          throw asNotesError(mkdirError);
        }
      }
      const probe = path.join(target, `.dsh-notes-probe-${process.pid}-${randomBytes(3).toString('hex')}`);
      try {
        await fsp.writeFile(probe, 'ok', 'utf8');
        await fsp.unlink(probe);
      } catch (error) {
        throw asNotesError(error);
      }
      this.root = path.resolve(target);
      this.settings = { ...this.settings, storagePath: target };
      this.meta = null;
      this.ready = null;
      writeSettings({ storagePath: target });
      await this.ensure();
      return this.getSettings();
    });
  }

  /** 上传图片（base64），返回相对路径。 */
  async uploadImage(payload) {
    return this._enqueue(async () => {
      await this.ensure();
      const input = payload && typeof payload === 'object' ? payload : {};
      const raw = typeof input.data === 'string' ? input.data : '';
      if (raw === '') throw new NotesError('invalid-image', '图片数据为空');
      const base64 = raw.replace(/^data:[^;]+;base64,/i, '').trim();
      let buffer;
      try {
        buffer = Buffer.from(base64, 'base64');
      } catch {
        throw new NotesError('invalid-image', '图片数据无法解码');
      }
      if (buffer.length === 0) throw new NotesError('invalid-image', '图片数据为空');
      if (buffer.length > MAX_IMAGE_BYTES) throw new NotesError('too-large', '图片超过 20 MiB 上限');
      const kind = sniffImage(buffer);
      if (!kind) throw new NotesError('invalid-image', '只支持 PNG / JPEG / GIF / WebP / BMP 图片');
      const stem = sanitizeName(
        path.basename(String(input.name || 'image'), path.extname(String(input.name || 'image'))),
        'image',
      ).replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);
      const folderName = monthFolder(Date.now());
      const dirAbs = path.join(this.root, ASSETS_DIR, folderName);
      await fsp.mkdir(dirAbs, { recursive: true });
      const fileName = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}${stem === '' ? '' : '-' + stem}.${kind.ext}`;
      await fsp.writeFile(path.join(dirAbs, fileName), buffer);
      return {
        path: `${ASSETS_DIR}/${folderName}/${fileName}`,
        name: fileName,
        mime: kind.mime,
        size: buffer.length,
      };
    });
  }

  /** 读取图片字节（只允许白名单图片）。 */
  async readMedia(rel) {
    await this.ensure();
    const target = resolveRel(this.root, rel);
    const ext = path.extname(target.abs).toLowerCase();
    const contentType = MEDIA_TYPES.get(ext);
    if (!contentType) throw new NotesError('unsupported', '不支持的媒体类型');
    let info;
    let bytes;
    try {
      info = await fsp.stat(target.abs);
      if (!info.isFile()) throw new NotesError('not-found', '图片不存在');
      if (info.size > MAX_IMAGE_BYTES) throw new NotesError('too-large', '图片过大');
      bytes = await fsp.readFile(target.abs);
    } catch (error) {
      throw asNotesError(error);
    }
    return { contentType, bytes, size: bytes.length, mtimeMs: info.mtimeMs };
  }

  /** 全文搜索（文件名 + 正文）。 */
  async search(query) {
    await this.ensure();
    const needle = String(query === undefined || query === null ? '' : query).trim().toLowerCase();
    const result = { items: [], total: 0, truncated: false, query: needle };
    if (needle === '') return result;
    const files = await this._walkNoteFiles(500);
    for (const file of files) {
      if (result.items.length >= 60) {
        result.truncated = true;
        break;
      }
      if (file.size > 2 * 1024 * 1024) continue;
      let content;
      try {
        content = await fsp.readFile(file.abs, 'utf8');
      } catch {
        continue;
      }
      const nameMatch = file.name.toLowerCase().includes(needle);
      const snippets = [];
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length && snippets.length < 3; index += 1) {
        if (lines[index].toLowerCase().includes(needle)) {
          snippets.push({ line: index + 1, text: lines[index].slice(0, 220) });
        }
      }
      if (!nameMatch && snippets.length === 0) continue;
      result.total += 1;
      result.items.push({
        path: file.rel,
        name: file.name,
        fileName: file.fileName,
        mtimeMs: file.mtimeMs,
        nameMatch,
        snippets,
      });
    }
    return result;
  }
}

/** 目录名里不允许出现路径分隔符（sanitizeName 已处理，双保险）。 */
function notesInsideNameTrouble(name) {
  return name === '' || name.includes('/') || name.includes('\\') || name === '.' || name === '..';
}

/** 把收藏 / 最近打开的路径映射到重命名后的路径。 */
function remapPath(item, oldRel, newRel) {
  if (item === oldRel) return newRel;
  if (item.startsWith(`${oldRel}/`)) return newRel + item.slice(oldRel.length);
  return item;
}
