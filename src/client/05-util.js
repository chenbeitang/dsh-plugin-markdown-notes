/**
 * Client 公共工具：HTTP 封装、媒体 URL、localStorage、路径与格式化小工具。
 *
 * @module @local/markdown-notes/src/client/05-util
 */

/** 宿主 HTTP 前缀（与 Host 半侧 routes.js 保持一致）。 */
MN.API = '/markdown-notes/api';

/** UI 偏好存储键（视图模式、展开的文件夹、最近打开）。 */
MN.LS_KEY = 'dsh.markdown-notes.ui.v1';

/** 转义 HTML 文本。 */
MN.escapeHtml = function (text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/** 把相对图片路径转成 Host 媒体接口 URL。 */
MN.mediaUrl = function (rel) {
  const clean = String(rel === undefined || rel === null ? '' : rel)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  return MN.API + '/media?path=' + encodeURIComponent(clean);
};

/** 把媒体接口 URL 反解回相对路径；不是本插件媒体 URL 时返回 null。 */
MN.mediaRelFromUrl = function (src) {
  const value = String(src === undefined || src === null ? '' : src);
  if (value === '') return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.pathname === MN.API + '/media') return url.searchParams.get('path') || null;
  } catch (error) {
    return null;
  }
  return null;
};

/** 安全读取 localStorage JSON。 */
MN.readLS = function (key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || typeof parsed !== 'object' ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
};

/** 安全写入 localStorage JSON。 */
MN.writeLS = function (key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
};

/** 可 flush / dispose 的 debounce。 */
MN.debounce = function (fn, wait) {
  let timer = null;
  let lastArgs = null;
  const wrapped = function () {
    lastArgs = arguments;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      timer = null;
      fn.apply(null, lastArgs);
    }, wait);
  };
  wrapped.flush = function () {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
      fn.apply(null, lastArgs);
    }
  };
  wrapped.dispose = function () {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  return wrapped;
};

/** 统一 JSON 请求；业务失败抛带 error 文案的 Error。 */
MN.api = (function () {
  function url(path, query) {
    let target = MN.API + '/' + String(path || '').replace(/^\/+/, '');
    if (query) {
      const qs = Object.keys(query)
        .filter((key) => query[key] !== undefined && query[key] !== null && query[key] !== '')
        .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(String(query[key])))
        .join('&');
      if (qs) target += '?' + qs;
    }
    return target;
  }

  async function parse(response) {
    const text = await response.text();
    let data;
    try {
      data = text === '' ? {} : JSON.parse(text);
    } catch (error) {
      throw new Error('HTTP ' + response.status + '：' + text.slice(0, 160));
    }
    if (data && data.ok === false) throw new Error(data.error || '请求失败');
    if (!response.ok) throw new Error((data && data.error) || 'HTTP ' + response.status);
    return data;
  }

  return {
    get: async function (path, query) {
      const response = await fetch(url(path, query), {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      return parse(response);
    },
    post: async function (path, body) {
      const response = await fetch(url(path), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body || {}),
      });
      return parse(response);
    },
  };
})();

/** 相对路径的父目录。 */
MN.dirnameOf = function (rel) {
  const value = String(rel || '');
  const index = value.lastIndexOf('/');
  return index < 0 ? '' : value.slice(0, index);
};

/** 相对路径的文件名。 */
MN.basenameOf = function (rel) {
  const value = String(rel || '');
  const index = value.lastIndexOf('/');
  return index < 0 ? value : value.slice(index + 1);
};

/** 拼接相对路径。 */
MN.joinRel = function (dir, name) {
  const left = String(dir || '').replace(/\/+$/, '');
  const right = String(name || '').replace(/^\/+/, '');
  if (left === '') return right;
  if (right === '') return left;
  return left + '/' + right;
};

/** child 是否位于 parent 目录之下（含相等）。 */
MN.isSameOrDescendant = function (child, parent) {
  const childRel = String(child || '');
  const parentRel = String(parent || '');
  if (childRel === parentRel) return true;
  if (parentRel === '') return true;
  return childRel.startsWith(parentRel + '/');
};

/** 路径的祖先目录列表（从根到直接父级）。 */
MN.ancestorsOf = function (rel) {
  const parts = String(rel || '').split('/').filter(Boolean);
  const out = [];
  for (let index = 0; index < parts.length - 1; index += 1) out.push(parts.slice(0, index + 1).join('/'));
  return out;
};

/** 在目录树中查找节点。 */
MN.findNode = function (tree, rel) {
  const target = String(rel || '');
  for (const node of tree || []) {
    if (node.path === target) return node;
    if (node.type === 'folder') {
      const found = MN.findNode(node.children, target);
      if (found) return found;
    }
  }
  return null;
};

/** 目录树里所有笔记（深度优先）。 */
MN.collectNotes = function (tree, out) {
  const list = out || [];
  for (const node of tree || []) {
    if (node.type === 'folder') MN.collectNotes(node.children, list);
    else list.push(node);
  }
  return list;
};

/** 按文件名 / 路径过滤目录树，保留命中笔记的祖先目录。 */
MN.filterTree = function (tree, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (needle === '') return tree;
  const walk = (nodes) => {
    const out = [];
    for (const node of nodes || []) {
      if (node.type === 'folder') {
        const children = walk(node.children);
        if (children.length > 0 || node.name.toLowerCase().includes(needle)) {
          out.push({ ...node, children });
        }
      } else if (node.name.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle)) {
        out.push(node);
      }
    }
    return out;
  };
  return walk(tree);
};

/** 相对时间文案。 */
MN.formatAgo = function (timestamp, t) {
  if (!timestamp) return '';
  const diff = Date.now() - Number(timestamp);
  if (!Number.isFinite(diff) || diff < 0) return '';
  if (diff < 45 * 1000) return t('time.justNow');
  if (diff < 60 * 60 * 1000) return String(Math.max(1, Math.round(diff / 60000))) + t('time.minutes');
  if (diff < 24 * 60 * 60 * 1000) return String(Math.max(1, Math.round(diff / 3600000))) + t('time.hours');
  const date = new Date(Number(timestamp));
  return date.getMonth() + 1 + t('time.dateSeparator') + date.getDate();
};

/** 统计字数（按 Unicode 码点，去掉空白）。 */
MN.countChars = function (text) {
  const value = String(text || '');
  let count = 0;
  for (const char of value) {
    if (!/\s/.test(char)) count += 1;
  }
  return count;
};

/** 文件大小展示。 */
MN.formatSize = function (bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 * 1024)).toFixed(1) + ' MB';
};

/** 简易唯一 id。 */
MN.uid = function (prefix) {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  } catch (error) {
    /* 退化为时间戳 id */
  }
  return (prefix || 'mn') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
};

/** 按需加载 Mermaid（Host 同源提供，避免依赖外网 CDN）。 */
MN.loadMermaidLibrary = (function () {
  let promise = null;
  let ready = null;
  const initialize = (mermaid) => {
    if (mermaid.__mnInitialized !== true) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
          fontFamily: 'sans-serif',
          flowchart: { htmlLabels: false, useMaxWidth: true },
          class: { htmlLabels: false, useMaxWidth: true },
          state: { htmlLabels: false, useMaxWidth: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
          journey: { useMaxWidth: true },
          pie: { useMaxWidth: true },
          er: { useMaxWidth: true },
        });
      } catch (error) {
        /* 初始化参数不兼容时仍尝试使用默认配置 */
      }
      try {
        mermaid.__mnInitialized = true;
      } catch (error) {
        /* 只读对象时忽略标记 */
      }
    }
    return mermaid;
  };
  return function loadMermaidLibrary() {
    if (ready) return Promise.resolve(ready);
    // 关键：初始化尚未完成时不能因为 window.mermaid 已存在就提前返回，
    // 否则第一次点击「渲染」可能在 initialize 之前执行而失败，重试才成功。
    if (promise) return promise;
    if (window.mermaid && window.mermaid.__mnInitialized === true && typeof window.mermaid.render === 'function') {
      ready = window.mermaid;
      return Promise.resolve(ready);
    }
    promise = new Promise((resolve, reject) => {
      const complete = () => {
        if (!window.mermaid || typeof window.mermaid.render !== 'function') {
          promise = null;
          reject(new Error('Mermaid 未正确加载'));
          return;
        }
        try {
          ready = initialize(window.mermaid);
          resolve(ready);
        } catch (error) {
          promise = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      if (window.mermaid && typeof window.mermaid.render === 'function') {
        complete();
        return;
      }
      const script = document.createElement('script');
      script.src = MN.API + '/mermaid?v=' + encodeURIComponent(String(MN.version || '1'));
      script.async = true;
      script.onload = complete;
      script.onerror = () => {
        promise = null;
        reject(new Error('无法加载 Mermaid 脚本'));
      };
      (document.head || document.body || document.documentElement).appendChild(script);
    });
    return promise;
  };
})();
