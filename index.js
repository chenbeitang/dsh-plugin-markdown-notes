/**
 * Host 半侧入口：注册 `/markdown-notes` HTTP API 与 `markdown_notes` Agent 工具。
 *
 * 职责边界：
 * - 传输层收口：同源校验、请求体读取、JSON / 图片应答、异常兜底；
 * - 业务全部委托给 NotesStore（host/storage.js），UI 与 Agent 工具共享同一套操作；
 * - 绝不因单个请求失败而抛到宿主进程。
 *
 * @module @local/markdown-notes
 */
import { Config, VERSION, normalizeConfig } from './host/config.js';
import { errorCodeOf, readBody, sendBytes, sendJson } from './host/http.js';
import { NotesError, NotesStore } from './host/storage.js';
import { ROUTE_PREFIX, createRouter } from './host/routes.js';

/** 宿主必须提供 Web 服务；缺失时不激活。 */
export const inject = ['webServer'];

/** Loader 行配置 schema。 */
export { Config };

/** 插件版本。 */
export { VERSION };

/** 解析宿主日志出口，最差退回 console。 */
function resolveLogger(ctx) {
  try {
    const logger = ctx?.logger;
    if (typeof logger === 'function') {
      try {
        const scoped = logger('markdown-notes');
        if (scoped) return scoped;
      } catch {
        /* 忽略并继续尝试对象形态 */
      }
    }
    if (logger && typeof logger === 'object') return logger;
  } catch {
    /* 忽略日志服务故障 */
  }
  return console;
}

/** 只有同源发起的写请求才被接受（本机 curl 这类无 Origin 请求放行）。 */
function isTrustedWrite(req, ctx) {
  const site = req && req.headers ? String(req.headers['sec-fetch-site'] || '') : '';
  if (site === 'cross-site') return false;
  const origin = req && req.headers ? req.headers.origin : undefined;
  if (typeof origin !== 'string' || origin === '') return true;
  try {
    const originUrl = new URL(origin);
    // 与请求的 Host 对比：127.0.0.1 与 localhost 都算同源；跨站 Origin 的 Host 不同。
    const host = String((req.headers && req.headers.host) || '').toLowerCase();
    if (host !== '' && originUrl.host.toLowerCase() === host) return true;
    // 反向代理改写 Host 时，再退回宿主公布地址比较。
    try {
      return origin === ctx.webServer.getOrigin();
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/** 让 Agent 输出更好读的路径清单。 */
function flattenTree(nodes, depth, out) {
  for (const node of nodes || []) {
    if (node.type === 'folder') {
      out.push(`${'  '.repeat(depth)}${node.name}/`);
      flattenTree(node.children, depth + 1, out);
    } else {
      out.push(`${'  '.repeat(depth)}${node.name}  (${node.path})`);
    }
  }
  return out;
}

/** 截断长文本，避免工具结果淹没会话。 */
function clip(text, max) {
  const value = String(text === undefined || text === null ? '' : text);
  return value.length > max ? `${value.slice(0, max)}\n…（已截断 ${value.length - max} 字符）` : value;
}

/**
 * 注册 `markdown_notes` 工具：与 UI 共用 NotesStore 方法。
 * @returns {() => void} 清理函数
 */
function registerNotesTool(ctx, store, logger) {
  const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined;
  if (!tools || typeof tools.register !== 'function') {
    logger?.warn?.('[markdown-notes] 宿主没有 tools 服务，Agent 工具未注册');
    return () => {};
  }
  const definition = {
    name: 'markdown_notes',
    description:
      '管理本地 Markdown 笔记（与左侧栏“Markdown 笔记”面板共用同一存储目录）。' +
      'action=list/read/create/append/write/mkdir/search/favorite/delete/set_storage；path 是相对笔记根目录的路径。' +
      '删除和改写前先 read 确认；除用户明确要求外不要删除笔记。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'create', 'append', 'write', 'mkdir', 'search', 'favorite', 'delete', 'set_storage'],
          description: '要执行的操作',
        },
        path: { type: 'string', description: '相对笔记根目录的路径，例如 “工作/周报.md”；set_storage 时是绝对目录路径' },
        title: { type: 'string', description: 'create / mkdir 时的名称' },
        dir: { type: 'string', description: 'create / mkdir 的父目录（相对路径，根目录留空）' },
        content: { type: 'string', description: 'write / append 的 Markdown 内容' },
        query: { type: 'string', description: 'search 关键词' },
        favorite: { type: 'boolean', description: 'favorite 时 true 收藏 / false 取消' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(args, value) {
        const payload = value && typeof value === 'object' ? value : {};
        let text;
        try {
          text = JSON.stringify(payload, null, 2);
        } catch {
          text = String(payload);
        }
        return [{ type: 'text', text: clip(text, 14000) }];
      },
    },
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || '');
      switch (action) {
        case 'list': {
          const state = await store.state();
          return {
            storagePath: state.settings.storagePath,
            favorites: state.favorites,
            stats: state.stats,
            tree: flattenTree(state.tree, 0, []),
          };
        }
        case 'read': {
          const note = await store.readNote(input.path);
          return { path: note.path, name: note.name, size: note.size, mtimeMs: note.mtimeMs, content: note.content };
        }
        case 'create': {
          if (!input.title) throw new NotesError('invalid-title', 'create 需要 title');
          const note = await store.createNote(input.dir || '', input.title);
          return { path: note.path, name: note.name, content: note.content };
        }
        case 'append': {
          if (typeof input.content !== 'string') throw new NotesError('invalid-content', 'append 需要 content');
          const current = await store.readNote(input.path);
          const separator = current.content === '' || current.content.endsWith('\n') ? '' : '\n';
          const next = `${current.content}${separator}${input.content}`;
          const saved = await store.saveNote(current.path, next);
          return { path: saved.path, appended: input.content.length, size: saved.size };
        }
        case 'write': {
          if (typeof input.content !== 'string') throw new NotesError('invalid-content', 'write 需要 content');
          const saved = await store.saveNote(input.path, input.content);
          return { path: saved.path, size: saved.size, mtimeMs: saved.mtimeMs };
        }
        case 'mkdir': {
          if (!input.title) throw new NotesError('invalid-title', 'mkdir 需要 title');
          const folder = await store.createFolder(input.dir || '', input.title);
          return { path: folder.path, type: 'folder' };
        }
        case 'search': {
          return store.search(input.query || '');
        }
        case 'favorite': {
          return store.setFavorite(input.path, input.favorite);
        }
        case 'delete': {
          return store.deleteEntry(input.path);
        }
        case 'set_storage': {
          const settings = await store.setStoragePath(input.path);
          return { storagePath: settings.storagePath };
        }
        default:
          throw new NotesError('invalid-action', '未知 action：' + action);
      }
    },
  };
  return tools.register(definition);
}

/**
 * 插件激活入口。
 * @param {any} ctx Cordis 上下文
 * @param {unknown} [rawConfig] Loader 行配置
 * @returns {() => void} 清理函数
 */
export function apply(ctx, rawConfig) {
  const logger = resolveLogger(ctx);
  const config = normalizeConfig(rawConfig);
  const store = new NotesStore({ config, logger });
  const router = createRouter({ store, version: VERSION, logger });

  // 提前准备根目录；失败只记录，首个请求会重试并返回可读错误。
  store.ensure().catch((error) => {
    logger?.warn?.(`[markdown-notes] 初始化笔记目录失败: ${error instanceof Error ? error.message : String(error)}`);
  });

  async function handleRequest(req, res) {
    try {
      let url;
      try {
        url = new URL(typeof req.url === 'string' && req.url !== '' ? req.url : '/', 'http://127.0.0.1');
      } catch {
        sendJson(res, 200, { ok: false, code: 'invalid-url', error: '请求地址不合法' });
        return;
      }
      if (url.pathname !== ROUTE_PREFIX && !url.pathname.startsWith(`${ROUTE_PREFIX}/`)) {
        sendJson(res, 200, { ok: false, code: 'not-found', error: '没有这个接口' });
        return;
      }
      const method = String(req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        if (!isTrustedWrite(req, ctx)) {
          sendJson(res, 403, { ok: false, code: 'forbidden', error: '跨站请求被拒绝' });
          return;
        }
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.includes('application/json')) {
          sendJson(res, 415, { ok: false, code: 'content-type', error: '请求体必须是 application/json' });
          return;
        }
      }
      let body;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        try {
          body = await readBody(req);
        } catch (error) {
          const code = errorCodeOf(error);
          if (code === 'client-aborted') {
            if (!res.writableEnded && typeof res.destroy === 'function') res.destroy();
            return;
          }
          sendJson(res, 200, {
            ok: false,
            code,
            error: code === 'body-too-large' ? '请求体超过 40 MiB 上限' : '读取请求体失败',
          });
          return;
        }
      }
      const result = await router({
        method: method === 'HEAD' ? 'GET' : method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body,
      });
      if (result.kind === 'raw') {
        sendBytes(res, result.status, result.headers, result.bytes);
        return;
      }
      sendJson(res, result.status, result.json);
    } catch (error) {
      logger?.warn?.(
        `[markdown-notes] 处理 ${req?.method || '?'} ${req?.url || '?'} 失败: ` +
          (error instanceof Error ? error.stack || error.message : String(error)),
      );
      sendJson(res, 200, { ok: false, code: 'internal', error: '内部错误，请查看宿主日志' });
    }
  }

  const disposers = [];
  disposers.push(
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: handleRequest,
        }),
      'markdown-notes: HTTP API',
    ),
  );
  disposers.push(
    ctx.effect(() => {
      try {
        return registerNotesTool(ctx, store, logger);
      } catch (error) {
        logger?.warn?.(
          `[markdown-notes] 注册 Agent 工具失败（面板仍可用）: ${error instanceof Error ? error.message : String(error)}`,
        );
        return () => {};
      }
    }, 'markdown-notes: markdown_notes tool'),
  );

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      try {
        disposers[index]();
      } catch {
        /* 卸载阶段的清理失败不外抛 */
      }
    }
  };
}
