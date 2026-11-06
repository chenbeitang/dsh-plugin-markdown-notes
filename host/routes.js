/**
 * HTTP 路由分发：把 `/markdown-notes/api/*` 的请求落到笔记仓库。
 *
 * 只做「方法 + 路径 + 请求体」到仓库方法的映射与错误收口，不直接碰 Node 的 res，
 * 因此可以在单元测试里用假 deps 调用。所有业务失败统一返回 HTTP 200 + `{ok:false,code,error}`，
 * 让浏览器按 `ok` 判断；图片读取返回原始字节。
 *
 * @module @local/markdown-notes/host/routes
 */
import { NotesError } from './storage.js';
import { openInFileManager } from './reveal.js';

/** HTTP 前缀；与 Client 里写死的一致。 */
export const ROUTE_PREFIX = '/markdown-notes';

/** 已注册的接口清单（/api/health 用）。 */
export const API_ROUTES = Object.freeze([
  'GET /api/health',
  'GET /api/state',
  'GET /api/settings',
  'POST /api/settings',
  'GET /api/note',
  'POST /api/note/save',
  'POST /api/note/create',
  'POST /api/folder/create',
  'POST /api/entry/rename',
  'POST /api/entry/delete',
  'POST /api/entry/move',
  'POST /api/entry/reveal',
  'POST /api/favorite',
  'POST /api/meta',
  'POST /api/image',
  'GET /api/media',
  'GET /api/search',
]);

/** 是否普通对象。 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 解析 JSON 请求体。 */
function parseJsonBody(body) {
  if (typeof body !== 'string') return { ok: false, error: '缺少请求体' };
  const text = body.trim();
  if (text === '') return { ok: false, error: '缺少请求体' };
  try {
    const value = JSON.parse(text);
    if (!isPlainObject(value)) return { ok: false, error: '请求体必须是 JSON 对象' };
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查格式' };
  }
}

/** 去掉前缀后的子路径。 */
function subPath(pathname) {
  const full = String(pathname || '');
  const rest = full.slice(ROUTE_PREFIX.length);
  if (rest === '' || rest === '/') return '/';
  return rest.startsWith('/') ? rest.replace(/\/+$/, '') || '/' : `/${rest}`;
}

/** 从查询参数取字符串。 */
function queryString(searchParams, key) {
  if (!searchParams || typeof searchParams.get !== 'function') return '';
  const value = searchParams.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * 创建路由分发函数。
 * @param {{store: import('./storage.js').NotesStore, version: string, logger?: {warn?: Function}}} deps
 * @returns {(request: {method: string, pathname: string, searchParams?: URLSearchParams, body?: string}) => Promise<object>}
 */
export function createRouter(deps) {
  const success = (json) => ({ kind: 'json', status: 200, json: { ok: true, ...json } });
  const failure = (error) => ({
    kind: 'json',
    status: 200,
    json: {
      ok: false,
      code: error && error.code ? error.code : 'error',
      error: error && error.message ? error.message : String(error),
    },
  });

  return async function dispatch(request) {
    const method = String((request && request.method) || 'GET').toUpperCase();
    const rest = subPath(request && request.pathname);
    const searchParams = request ? request.searchParams : undefined;

    try {
      if (rest === '/api/health') {
        if (method !== 'GET') return failure(new NotesError('method', '不支持的请求方法'));
        return success({ version: deps.version, routes: [...API_ROUTES] });
      }

      if (rest === '/api/state') {
        if (method !== 'GET') return failure(new NotesError('method', '不支持的请求方法'));
        const state = await deps.store.state();
        return success({ version: deps.version, ...state });
      }

      if (rest === '/api/settings') {
        if (method === 'GET') return success({ settings: deps.store.getSettings() });
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const storagePath = parsed.value.storagePath;
        if (typeof storagePath !== 'string' || storagePath.trim() === '') {
          return failure(new NotesError('invalid-path', '请填写笔记存储目录'));
        }
        const settings = await deps.store.setStoragePath(storagePath);
        return success({ settings });
      }

      if (rest === '/api/note') {
        if (method !== 'GET') return failure(new NotesError('method', '不支持的请求方法'));
        const note = await deps.store.readNote(queryString(searchParams, 'path'));
        return success({ note });
      }

      if (rest === '/api/note/save') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const saved = await deps.store.saveNote(parsed.value.path, parsed.value.content);
        return success({ note: saved });
      }

      if (rest === '/api/note/create') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const created = await deps.store.createNote(parsed.value.dir || '', parsed.value.title || '');
        return success({ note: created });
      }

      if (rest === '/api/folder/create') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const created = await deps.store.createFolder(parsed.value.parent || '', parsed.value.name || '');
        return success({ folder: created });
      }

      if (rest === '/api/entry/rename') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const renamed = await deps.store.renameEntry(parsed.value.path, parsed.value.name);
        return success({ entry: renamed });
      }

      if (rest === '/api/entry/delete') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const deleted = await deps.store.deleteEntry(parsed.value.path);
        return success({ entry: deleted });
      }

      if (rest === '/api/entry/move') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const moved = await deps.store.moveEntry(parsed.value.path, parsed.value.targetDir);
        return success({ entry: moved });
      }

      if (rest === '/api/entry/reveal') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const location = await deps.store.entryLocation(parsed.value.path);
        const opened = openInFileManager(location.absPath, location.isDirectory, deps.logger);
        if (!opened.ok) {
          return failure(new NotesError('reveal-failed', opened.error || '无法打开文件管理器'));
        }
        return success({
          path: location.path,
          directory: location.isDirectory,
          revealed: true,
        });
      }

      if (rest === '/api/favorite') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const result = await deps.store.setFavorite(parsed.value.path, parsed.value.favorite);
        return success(result);
      }

      if (rest === '/api/meta') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        if (parsed.value.lastOpened === undefined || parsed.value.lastOpened === null) {
          return failure(new NotesError('invalid-body', '缺少 lastOpened'));
        }
        const result = await deps.store.touchLastOpened(parsed.value.lastOpened);
        return success(result);
      }

      if (rest === '/api/image') {
        if (method !== 'POST') return failure(new NotesError('method', '不支持的请求方法'));
        const parsed = parseJsonBody(request.body);
        if (!parsed.ok) return failure(new NotesError('invalid-body', parsed.error));
        const image = await deps.store.uploadImage(parsed.value);
        return success({ image });
      }

      if (rest === '/api/media') {
        if (method !== 'GET') return failure(new NotesError('method', '不支持的请求方法'));
        const media = await deps.store.readMedia(queryString(searchParams, 'path'));
        return {
          kind: 'raw',
          status: 200,
          headers: { 'content-type': media.contentType },
          bytes: media.bytes,
        };
      }

      if (rest === '/api/search') {
        if (method !== 'GET') return failure(new NotesError('method', '不支持的请求方法'));
        const result = await deps.store.search(queryString(searchParams, 'q'));
        return success({ search: result });
      }

      return failure(new NotesError('not-found', '没有这个接口'));
    } catch (error) {
      const known = error instanceof NotesError ? error : new NotesError('internal', '内部错误，请查看宿主日志');
      if (!(error instanceof NotesError)) {
        deps.logger?.warn?.(
          `[markdown-notes] ${method} ${rest} 失败: ${error instanceof Error ? error.stack || error.message : String(error)}`,
        );
      }
      return failure(known);
    }
  };
}
