/* 由 build.mjs 生成，请勿直接修改；改动请写在 src/client/*.js 后重新构建。 */

/* ==================== src/client/00-header.js ==================== */
/**
 * Client bundle 外壳 + 工厂作用域。
 *
 * 本文件必须排第一，99-apply.js 必须排最后；build.mjs 按文件名顺序拼接所有 part。
 * 整个 bundle 是普通副作用脚本：没有顶层 ESM import/export，React 只能从工厂
 * 的 require 获取，不读写 MN 以外的全局。
 *
 * @module @local/markdown-notes/src/client/00-header
 */
window.__ModuleLoader__.load({
  id: '@local/markdown-notes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo, Component } = React;

    /** 本包 Client 侧唯一命名空间：各 part 只往这里挂方法/组件。 */
    const MN = {
      id: 'markdown-notes',
      version: '1.11.0',
      React,
      h,
      useState,
      useEffect,
      useRef,
      useCallback,
      useMemo,
      Component,
      /** 由 99-apply 绑定：ctx.locale.bind(...) 得到的翻译函数。 */
      t: (key) => key,
      /** 由 99-apply 绑定的 Client Context，供打开系统目录选择器等可选能力用。 */
      clientCtx: null,
    };

/* ==================== src/client/05-util.js ==================== */
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

/* ==================== src/client/10-markdown.js ==================== */
/**
 * Markdown ↔ HTML 引擎（纯函数，不依赖 React / DOM，除了 htmlToMarkdown 需要 DOM 节点）。
 *
 * 用途：
 * - `render(markdown, {mediaUrl})`：把 Markdown 渲染成可直接塞进 contenteditable 的 HTML；
 * - `htmlToMarkdown(element, {mediaRel})`：把 contenteditable 的 DOM 转回 Markdown，
 *   让右侧「渲染视图」也能直接编辑并回写 Markdown 原文。
 *
 * 支持的语法：标题、段落、粗体 / 斜体 / 删除线 / 高亮 / 下划线、行内代码、代码块、
 * 引用、嵌套列表与任务列表、链接、图片、分隔线、表格。行内 HTML 只放行
 * `u / mark / sub / sup / kbd / br`，其余一律转义，避免注入。
 *
 * @module @local/markdown-notes/src/client/10-markdown
 */
MN.md = (function () {
  'use strict';

  const SLOT_OPEN = '\u0002';
  const SLOT_CLOSE = '\u0003';
  const RAW_TAG_RE = /<\/?(?:u|mark|sub|sup|kbd|br)\s*\/?>/gi;

  /** 行内标签集合（块级转换时用于区分）。 */
  const INLINE_TAGS = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font',
    'i', 'img', 'input', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike',
    'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
  ]);

  function escapeHtml(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/'/g, '&#39;');
  }

  /** 代码块语言下拉选项；未指定语言时显示 text。 */
  const CODE_LANGUAGE_OPTIONS = [
    'text', 'java', 'javascript', 'typescript', 'python', 'c', 'cpp', 'csharp', 'go', 'rust',
    'kotlin', 'swift', 'php', 'ruby', 'sql', 'xml', 'html', 'css', 'json', 'yaml', 'shell',
    'powershell', 'dockerfile', 'diff', 'markdown',
  ];

  function codeLanguageSelect(language, startLine) {
    const current = language === '' ? 'text' : language;
    const values = CODE_LANGUAGE_OPTIONS.slice();
    if (!values.includes(current)) values.unshift(current);
    const options = values
      .map(
        (value) =>
          '<option value="' + escapeAttr(value) + '"' + (value === current ? ' selected' : '') + '>' +
          escapeHtml(value) +
          '</option>',
      )
      .join('');
    return (
      '<div class="mn-code-head" contenteditable="false">' +
      '<span class="mn-code-head-icon" aria-hidden="true">&lt;/&gt;</span>' +
      '<span class="mn-code-lang-wrap">' +
      '<select class="mn-code-lang" contenteditable="false" data-code-line="' + (Number(startLine) || 1) + '" title="代码类型" aria-label="代码类型">' +
      options +
      '</select>' +
      '</span>' +
      '</div>'
    );
  }

  function pushSlot(slots, html) {
    slots.push(html);
    return SLOT_OPEN + (slots.length - 1) + SLOT_CLOSE;
  }

  function restoreSlots(text, slots) {
    const pattern = new RegExp(SLOT_OPEN + '(\\d+)' + SLOT_CLOSE, 'g');
    return String(text).replace(pattern, (match, index) => {
      const value = slots[Number(index)];
      return value === undefined ? '' : value;
    });
  }

  /** 只放行安全协议；javascript: 等一律降级为 #。 */
  function safeUrl(value) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (text === '') return '';
    if (/^(?:javascript|vbscript|file):/i.test(text)) return '#';
    if (/^data:/i.test(text) && !/^data:image\//i.test(text)) return '#';
    return text;
  }

  /** 相对图片路径改写成 Host 媒体 URL；绝对 URL 原样保留。 */
  function imageUrlFor(src, options) {
    const text = String(src === undefined || src === null ? '' : src).trim();
    if (text === '') return '';
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(text)) return safeUrl(text);
    if (options && typeof options.mediaUrl === 'function') {
      try {
        return options.mediaUrl(text.replace(/^\.\//, ''));
      } catch (error) {
        return text;
      }
    }
    return text;
  }

  /** 解析图片尺寸扩展 `{width=320}` / `{width="320px"}`，返回安全整数宽度。 */
  function parseImageWidth(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const match = /(?:^|\s)width\s*=\s*"?(\d{1,5})(?:px)?"?/i.exec(raw);
    if (!match) return null;
    const width = Number.parseInt(match[1], 10);
    if (!Number.isFinite(width) || width < 32 || width > 5000) return null;
    return width;
  }

  /** 从 DOM 图片节点读取宽度（属性优先，其次内联样式）。 */
  function readImageWidth(node) {
    if (!node || typeof node.getAttribute !== 'function') return null;
    const fromAttribute = parseImageWidth('width=' + (node.getAttribute('width') || ''));
    if (fromAttribute !== null) return fromAttribute;
    const style = node.style && typeof node.style.width === 'string' ? node.style.width : '';
    const styleMatch = /^(\d+(?:\.\d+)?)px$/.exec(style);
    if (!styleMatch) return null;
    const width = Math.round(Number(styleMatch[1]));
    return Number.isFinite(width) && width >= 32 && width <= 5000 ? width : null;
  }

  /** 行内 Markdown → HTML。 */
  function inline(text, options) {
    const slots = [];
    let source = String(text === undefined || text === null ? '' : text);

    // 1) 反斜杠转义：先占位，避免被后续语法解释。
    source = source.replace(/\\([\\`*_{}\[\]()#+\-.!~<>=|])/g, (match, char) => pushSlot(slots, escapeHtml(char)));

    // 2) 行内代码。
    source = source.replace(/`([^`\n]+)`/g, (match, code) => pushSlot(slots, '<code>' + escapeHtml(code) + '</code>'));

    // 3) 图片：相对路径改写成媒体接口，否则浏览器无法加载；`{width=320}` 控制显示宽度。
    source = source.replace(
      /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)(?:\s*\{([^}]*\bwidth\s*=[^}]*)\})?/g,
      (match, alt, src, title, attributeText) => {
        const url = imageUrlFor(src, options);
        const titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
        const width = parseImageWidth(attributeText);
        const widthAttr = width === null ? '' : ' width="' + width + '"';
        return pushSlot(
          slots,
          '<img src="' + escapeAttr(url) + '" alt="' + escapeAttr(alt) + '"' + titleAttr + widthAttr + ' loading="lazy" draggable="false">',
        );
      },
    );

    // 4) 链接（label 内部继续解析行内语法）。
    source = source.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)/g, (match, label, href, title) => {
      const url = safeUrl(href);
      const titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
      return pushSlot(
        slots,
        '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer"' + titleAttr + '>' + inline(label, options) + '</a>',
      );
    });

    // 5) 自动链接 <https://...>。
    source = source.replace(/<(https?:\/\/[^\s>]+)>/g, (match, url) => {
      return pushSlot(slots, '<a href="' + escapeAttr(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + '</a>');
    });

    // 6) 放行白名单行内 HTML 标签；源码里的 <br> 标记出来，供光标映射时保持同一行段。
    source = source.replace(RAW_TAG_RE, (tag) => {
      if (/^<br\b/i.test(tag)) return pushSlot(slots, '<br class="mn-raw-br">');
      return pushSlot(slots, tag);
    });

    // 7) 剩余内容全部转义，之后只处理 Markdown 标记。
    source = escapeHtml(source);

    // 8) 行内格式：顺序很重要（先长后短）。
    source = source.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    source = source.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    source = source.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    source = source.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    source = source.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    source = source.replace(/(^|[^*])\*([^*\n]+)\*(?=[^*]|$)/g, '$1<em>$2</em>');
    source = source.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');

    // 9) 还原占位内容。
    source = restoreSlots(source, slots);

    // 10) 行内换行（段内保留换行，符合中文笔记习惯）。
    return source.replace(/\n/g, '<br>');
  }

  function isHr(line) {
    return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  }

  function isBlockStart(line) {
    return (
      /^\s*(?:#{1,6})\s+/.test(line) ||
      /^\s*(?:```|~~~)/.test(line) ||
      /^\s*>/.test(line) ||
      isHr(line)
    );
  }

  /** 匹配列表项，返回缩进、是否有序与内容。 */
  function matchListItem(line) {
    const match = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
    if (!match) return null;
    return {
      indent: match[1].replace(/\t/g, '  ').length,
      ordered: /^\d/.test(match[2]),
      content: match[3],
    };
  }

  function renderListGroup(group, options) {
    const tag = group.ordered ? 'ol' : 'ul';
    const lineInfo =
      group.line && options && options.trackLines === true
        ? ' data-line="' + group.line + '" data-line-end="' + group.lineEnd + '"'
        : '';
    const items = group.items.map((item) => {
      let content = item.content;
      let checkbox = '';
      const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
      if (task) {
        checkbox = '<input type="checkbox" contenteditable="false" class="mn-task"' + (task[1].toLowerCase() === 'x' ? ' checked' : '') + '> ';
        content = task[2];
      }
      let html = '<li' + (checkbox === '' ? '' : ' class="mn-task-item"') + '>' + checkbox + inline(content, options);
      for (const child of item.children) html += renderListGroup(child, options);
      return html + '</li>';
    });
    return '<' + tag + lineInfo + '>' + items.join('') + '</' + tag + '>';
  }

  /** 解析一段列表（含缩进嵌套）。 */
  function renderListBlock(lines, start, options, nested) {
    const entries = [];
    let index = start;
    let firstIndent = null;
    while (index < lines.length) {
      const line = lines[index];
      if (/^\s*$/.test(line)) {
        if (index + 1 < lines.length && matchListItem(lines[index + 1])) {
          index += 1;
          continue;
        }
        break;
      }
      const item = matchListItem(line);
      if (!item) {
        if (entries.length > 0 && /^\s{2,}\S/.test(line)) {
          entries[entries.length - 1].content += ' ' + line.trim();
          index += 1;
          continue;
        }
        break;
      }
      if (firstIndent === null) firstIndent = item.indent;
      if (item.indent < firstIndent) break;
      entries.push({ indent: item.indent, ordered: item.ordered, content: item.content });
      index += 1;
    }
    if (entries.length === 0) return { html: '', next: start + 1 };
    const baseIndent = entries[0].indent;
    const root = {
      ordered: entries[0].ordered,
      indent: baseIndent,
      items: [],
      line: nested ? null : start + 1,
      lineEnd: index,
    };
    const stack = [{ group: root, indent: baseIndent }];
    for (const entry of entries) {
      while (stack.length > 1 && entry.indent < stack[stack.length - 1].indent) stack.pop();
      let top = stack[stack.length - 1];
      if (entry.indent > top.indent) {
        const parentItem = top.group.items[top.group.items.length - 1];
        if (parentItem) {
          const group = { ordered: entry.ordered, indent: entry.indent, items: [] };
          parentItem.children.push(group);
          stack.push({ group, indent: entry.indent });
          top = stack[stack.length - 1];
        }
      }
      top.group.items.push({ content: entry.content, children: [] });
    }
    return { html: renderListGroup(root, options), next: index };
  }

  function splitTableRow(line) {
    let text = String(line || '').trim();
    if (text.startsWith('|')) text = text.slice(1);
    if (text.endsWith('|')) text = text.slice(0, -1);
    return text.split('|').map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
  }

  function isTableStart(lines, index) {
    return (
      index + 1 < lines.length &&
      String(lines[index]).includes('|') &&
      isTableSeparator(lines[index + 1])
    );
  }

  /** 行号属性（仅在同步滚动开启时输出，避免污染普通渲染结果）。 */
  function lineAttrs(options, startLine, endLine) {
    if (!options || options.trackLines !== true) return '';
    return ' data-line="' + startLine + '" data-line-end="' + endLine + '"';
  }

  function renderTable(lines, start, options, nested) {
    const header = splitTableRow(lines[start]);
    let index = start + 2;
    const rows = [];
    while (index < lines.length && String(lines[index]).trim() !== '' && String(lines[index]).includes('|')) {
      rows.push(splitTableRow(lines[index]));
      index += 1;
    }
    const head = header.map((cell) => '<th>' + inline(cell, options) + '</th>').join('');
    const body = rows
      .map((row) => '<tr>' + row.map((cell) => '<td>' + inline(cell, options) + '</td>').join('') + '</tr>')
      .join('');
    return {
      html:
        '<div class="mn-table-wrap"' +
        lineAttrs(nested ? null : options, start + 1, index) +
        '><table><thead><tr>' +
        head +
        '</tr></thead><tbody>' +
        body +
        '</tbody></table></div>',
      next: index,
    };
  }

  /** 块级 Markdown → HTML。 */
  function renderBlocks(lines, options, nested) {
    const trackLines = !nested && options && options.trackLines === true;
    const attrs = (startLine, endLine) => (trackLines ? ' data-line="' + startLine + '" data-line-end="' + endLine + '"' : '');
    const out = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (/^\s*$/.test(line)) {
        index += 1;
        continue;
      }
      const startLine = index + 1;

      const fence = /^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/.exec(line);
      if (fence) {
        const marker = fence[1];
        const language = fence[2] || '';
        const buffer = [];
        index += 1;
        while (index < lines.length && !new RegExp('^\\s*' + marker[0] + '{' + marker.length + ',}\\s*$').test(lines[index])) {
          buffer.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const className = language === '' ? '' : ' class="language-' + escapeAttr(language) + '"';
        const code = buffer.join('\n');
        const highlighted = language === '' ? escapeHtml(code) : highlightCode(code, language);
        const pre = '<pre' + attrs(startLine, index) + '><code' + className + '>' + highlighted + '</code></pre>';
        out.push('<div class="mn-code-block">' + codeLanguageSelect(language, startLine) + pre + '</div>');
        continue;
      }

      const heading = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + attrs(startLine, startLine) + '>' + inline(heading[2], options) + '</h' + level + '>');
        index += 1;
        continue;
      }

      if (isHr(line)) {
        out.push('<hr' + attrs(startLine, startLine) + '>');
        index += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const buffer = [];
        while (index < lines.length) {
          if (/^\s*>/.test(lines[index])) {
            buffer.push(lines[index].replace(/^\s*>\s?/, ''));
            index += 1;
            continue;
          }
          if (/^\s*$/.test(lines[index]) && index + 1 < lines.length && /^\s*>/.test(lines[index + 1])) {
            buffer.push('');
            index += 1;
            continue;
          }
          break;
        }
        out.push('<blockquote' + attrs(startLine, index) + '>' + renderBlocks(buffer, options, true) + '</blockquote>');
        continue;
      }

      if (matchListItem(line)) {
        const parsed = renderListBlock(lines, index, options, nested);
        out.push(parsed.html);
        index = parsed.next;
        continue;
      }

      if (isTableStart(lines, index)) {
        const parsed = renderTable(lines, index, options, nested);
        out.push(parsed.html);
        index = parsed.next;
        continue;
      }

      if (/^ {4}\S/.test(line)) {
        const buffer = [];
        while (index < lines.length && (/^ {4}/.test(lines[index]) || /^\s*$/.test(lines[index]))) {
          buffer.push(lines[index].replace(/^ {4}/, ''));
          index += 1;
        }
        out.push('<pre' + attrs(startLine, index) + '><code>' + escapeHtml(buffer.join('\n').replace(/\n+$/, '')) + '</code></pre>');
        continue;
      }

      // 段落：连续的非块级行，段内换行保留为 <br>。
      const paragraph = [];
      while (index < lines.length) {
        const current = lines[index];
        if (/^\s*$/.test(current) || isBlockStart(current) || matchListItem(current)) break;
        if (isTableStart(lines, index)) break;
        paragraph.push(current);
        index += 1;
      }
      if (paragraph.length === 0) {
        index += 1;
        continue;
      }
      out.push('<p' + attrs(startLine, index) + '>' + paragraph.map((item) => inline(item, options)).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  /** Markdown → HTML。 */
  function render(markdown, options) {
    const source = String(markdown === undefined || markdown === null ? '' : markdown).replace(/\r\n?/g, '\n');
    if (source.trim() === '') return '';
    return renderBlocks(source.split('\n'), options || {}, false);
  }

  /* ------------------------------------------------------------------ */
  /* HTML → Markdown（contenteditable 回写）                              */
  /* ------------------------------------------------------------------ */

  /** 转义会改变 Markdown 语义的普通文本字符。 */
  function escapeMdText(text) {
    let out = String(text === undefined || text === null ? '' : text)
      .replace(/\\/g, '\\\\')
      .replace(/([`*_\[\]~<])/g, '\\$1');
    out = out.replace(/^(\s*)([#>])/, (match, lead, char) => lead + '\\' + char);
    out = out.replace(/^(\s*)([-+])(\s)/, (match, lead, char, space) => lead + '\\' + char + space);
    out = out.replace(/^(\s*)(\d+)\.(\s)/, (match, lead, number, space) => lead + number + '\\.' + space);
    return out;
  }

  function inlineNodes(nodes, context) {
    let out = '';
    for (const node of Array.from(nodes || [])) out += inlineNode(node, context);
    return out;
  }

  function inlineNode(node, context) {
    if (!node) return '';
    if (node.nodeType === 3) return escapeMdText(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const inner = () => inlineNodes(node.childNodes, context);
    switch (tag) {
      case 'br':
        return '\n';
      case 'strong':
      case 'b': {
        const text = inner();
        return text.trim() === '' ? text : '**' + text + '**';
      }
      case 'em':
      case 'i': {
        const text = inner();
        return text.trim() === '' ? text : '*' + text + '*';
      }
      case 'u':
        return '<u>' + inner() + '</u>';
      case 's':
      case 'del':
      case 'strike':
        return '~~' + inner() + '~~';
      case 'mark':
        return '==' + inner() + '==';
      case 'code': {
        const text = node.textContent || '';
        const ticks = text.includes('`') ? '``' : '`';
        return ticks + text + ticks;
      }
      case 'a': {
        const href = node.getAttribute('href') || '';
        const label = inner() === '' ? escapeMdText(href) : inner();
        if (href === '' || /^(?:javascript|vbscript):/i.test(href)) return label;
        return '[' + label + '](' + href + ')';
      }
      case 'img': {
        const src = node.getAttribute('src') || '';
        const relative = context && typeof context.mediaRel === 'function' ? context.mediaRel(src) : null;
        const target = relative || src;
        const alt = node.getAttribute('alt') || '';
        const width = readImageWidth(node);
        return '![' + alt + '](' + target + ')' + (width === null ? '' : '{width=' + width + '}');
      }
      case 'input':
        return '';
      case 'kbd':
        return '<kbd>' + inner() + '</kbd>';
      case 'sup':
        return '<sup>' + inner() + '</sup>';
      case 'sub':
        return '<sub>' + inner() + '</sub>';
      case 'p':
      case 'div':
        return inner() + '\n';
      case 'span':
      case 'font':
      case 'label':
      case 'small':
      case 'big':
      case 'abbr':
      case 'time':
        return inner();
      default:
        return inner();
    }
  }

  function listToMarkdown(listElement, context, depth) {
    const ordered = listElement.tagName.toLowerCase() === 'ol';
    let counter = Number(listElement.getAttribute('start')) || 1;
    const lines = [];
    for (const item of Array.from(listElement.children)) {
      if (!item.tagName || item.tagName.toLowerCase() !== 'li') continue;
      const nested = [];
      const parts = [];
      let checkbox = null;
      for (const child of Array.from(item.childNodes)) {
        if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (tag === 'ul' || tag === 'ol') {
            nested.push(child);
            continue;
          }
          if (tag === 'input' && String(child.getAttribute('type')).toLowerCase() === 'checkbox') {
            checkbox = child;
            continue;
          }
          if (tag === 'p' || tag === 'div') {
            parts.push(inlineNodes(child.childNodes, context));
            continue;
          }
        }
        parts.push(inlineNode(child, context));
      }
      let text = parts.join('').replace(/\n+/g, ' ').trim();
      if (checkbox) text = (checkbox.checked ? '[x] ' : '[ ] ') + text;
      const marker = ordered ? counter + '. ' : '- ';
      counter += 1;
      lines.push('  '.repeat(depth) + marker + text);
      for (const sub of nested) lines.push(listToMarkdown(sub, context, depth + 1));
    }
    return lines.join('\n');
  }

  function tableToMarkdown(tableElement, context) {
    const rows = Array.from(tableElement.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    const readRow = (row) => {
      const cells = Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName));
      return cells.map((cell) => inlineNodes(cell.childNodes, context).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|'));
    };
    const header = readRow(rows[0]);
    if (header.length === 0) return '';
    const separator = header.map(() => '---');
    const lines = ['| ' + header.join(' | ') + ' |', '| ' + separator.join(' | ') + ' |'];
    for (let index = 1; index < rows.length; index += 1) {
      const cells = readRow(rows[index]);
      lines.push('| ' + cells.join(' | ') + ' |');
    }
    return lines.join('\n');
  }

  function blockNodeToMarkdown(node, context) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'div' && node.classList && node.classList.contains('mn-code-head')) return '';
    if (tag === 'div' && node.classList && node.classList.contains('mn-code-block')) {
      const pre = typeof node.querySelector === 'function' ? node.querySelector('pre') : null;
      return pre ? blockNodeToMarkdown(pre, context) : '';
    }
    if (/^h[1-6]$/.test(tag)) {
      return '#'.repeat(Number(tag[1])) + ' ' + inlineNodes(node.childNodes, context).trim();
    }
    if (tag === 'p') return inlineNodes(node.childNodes, context).trim();
    if (tag === 'blockquote') {
      const inner = containerToMarkdown(node, context).trim();
      return inner.split('\n').map((line) => (line === '' ? '>' : '> ' + line)).join('\n');
    }
    if (tag === 'pre') {
      const codeElement = node.querySelector('code');
      const text = (codeElement || node).textContent.replace(/\n$/, '');
      const className = codeElement ? String(codeElement.getAttribute('class') || '') : '';
      const language = /language-([\w+#.-]+)/.exec(className);
      return '```' + (language ? language[1] : '') + '\n' + text + '\n```';
    }
    if (tag === 'hr') return '---';
    if (tag === 'ul' || tag === 'ol') return listToMarkdown(node, context, 0);
    if (tag === 'table') return tableToMarkdown(node, context);
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'header' || tag === 'footer') {
      const inner = containerToMarkdown(node, context).trim();
      return inner === '' ? inlineNodes(node.childNodes, context).trim() : inner;
    }
    if (tag === 'li') return inlineNodes(node.childNodes, context).trim();
    if (INLINE_TAGS.has(tag)) return inlineNode(node, context);
    const inner = containerToMarkdown(node, context).trim();
    return inner === '' ? inlineNodes(node.childNodes, context).trim() : inner;
  }

  /** 块级容器 → Markdown 文本。 */
  function containerToMarkdown(root, context) {
    const out = [];
    let buffer = [];
    const flush = () => {
      if (buffer.length === 0) return;
      const text = buffer.map((node) => inlineNode(node, context)).join('').replace(/\n{3,}/g, '\n\n').trim();
      buffer = [];
      if (text !== '') out.push(text);
    };
    for (const node of Array.from(root.childNodes || [])) {
      if (node.nodeType === 3) {
        buffer.push(node);
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') {
        buffer.push(node);
        continue;
      }
      if (INLINE_TAGS.has(tag)) {
        buffer.push(node);
        continue;
      }
      flush();
      const markdown = blockNodeToMarkdown(node, context).trim();
      if (markdown !== '') out.push(markdown);
    }
    flush();
    return out.join('\n\n');
  }

  /** contenteditable 的 DOM → Markdown。 */
  function htmlToMarkdown(element, options) {
    if (!element) return '';
    const context = { mediaRel: options && options.mediaRel };
    return containerToMarkdown(element, context).replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ------------------------------------------------------------------ */
  /* 代码块语法高亮                                                       */
  /* ------------------------------------------------------------------ */

  function words(source) {
    return new Set(String(source).split(/\s+/).filter(Boolean));
  }

  const JS_KEYWORDS = words(
    'as async await break case catch class const continue debugger declare default delete do else enum export extends ' +
      'finally for from function get if implements import in instanceof interface let namespace new of override private ' +
      'protected public readonly return set static super switch this throw try type typeof undefined var while with yield ' +
      'true false null abstract any boolean number string symbol unknown never object keyof readonly',
  );
  const CLike_KEYWORDS = words(
    'auto break case char const continue default do double else enum extern float for goto if inline int long register ' +
      'restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace ' +
      'public private protected template typename virtual override final new delete using try catch throw bool true false ' +
      'nullptr constexpr decltype noexcept operator friend explicit mutable',
  );
  const CSHARP_KEYWORDS = new Set([
    ...CLike_KEYWORDS,
    ...words('async await var string decimal object base this foreach out ref params readonly sealed partial record init namespace'),
  ]);
  const JAVA_KEYWORDS = words(
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final ' +
      'finally float for goto if implements import instanceof int interface long native new package private protected public ' +
      'return short static strictfp super switch synchronized this throw throws transient try void volatile while var record ' +
      'sealed permits yield true false null',
  );
  const PYTHON_KEYWORDS = words(
    'and as assert async await break class continue def del elif else except False finally for from global if import in is ' +
      'lambda None nonlocal not or pass raise return True try while with yield match case',
  );
  const RUBY_KEYWORDS = words(
    'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue ' +
      'retry return self super then true undef unless until when while yield require attr_accessor attr_reader',
  );
  const PHP_KEYWORDS = words(
    'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty ' +
      'enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global ' +
      'goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private ' +
      'protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
  );
  const GO_KEYWORDS = words(
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range ' +
      'return select struct switch type var true false nil',
  );
  const RUST_KEYWORDS = words(
    'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ' +
      'ref return self Self static struct super trait true type unsafe use where while',
  );
  const KOTLIN_KEYWORDS = words(
    'as break class continue do else false for fun if in interface is null object package return super this throw true try ' +
      'typealias typeof val var when while by catch constructor delegate dynamic field file finally get import init param ' +
      'property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external ' +
      'final infix inline inner internal lateinit noinline open operator out override private protected public reified sealed ' +
      'suspend tailrec vararg',
  );
  const SWIFT_KEYWORDS = words(
    'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol ' +
      'public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard ' +
      'if in repeat return switch where while as Any catch false is nil super self Self throw throws true try',
  );
  const SQL_KEYWORDS = words(
    'select from where insert into update delete create alter drop table values set join left right inner outer full on group ' +
      'by order having limit offset union all as and or not null is in like between exists distinct count sum avg min max case ' +
      'when then else end primary key foreign references index view database begin commit rollback grant revoke',
  );
  const SHELL_KEYWORDS = words(
    'if then else elif fi for while do done case esac function in select until return exit export local readonly declare unset ' +
    'shift source alias echo printf cd pwd read test true false',
  );
  const POWERSHELL_KEYWORDS = words(
    'if else elseif foreach for while do switch function filter param return try catch finally throw begin process end in break ' +
    'continue class enum static hidden using var true false null',
  );
  const DOCKER_KEYWORDS = words(
    'FROM RUN CMD LABEL MAINTAINER EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL',
  );
  const YAML_KEYWORDS = words('true false null yes no on off');

  const LANG_ALIASES = {
    java: 'java',
    javascript: 'javascript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    typescript: 'javascript',
    ts: 'javascript',
    tsx: 'javascript',
    c: 'clike',
    h: 'clike',
    cpp: 'clike',
    'c++': 'clike',
    cc: 'clike',
    hpp: 'clike',
    objc: 'clike',
    'objective-c': 'clike',
    csharp: 'csharp',
    cs: 'csharp',
    'c#': 'csharp',
    'f#': 'generic',
    vb: 'generic',
    vbnet: 'generic',
    groovy: 'java',
    gradle: 'java',
    python: 'python',
    py: 'python',
    ruby: 'ruby',
    rb: 'ruby',
    php: 'php',
    go: 'go',
    golang: 'go',
    rust: 'rust',
    rs: 'rust',
    kotlin: 'kotlin',
    kt: 'kotlin',
    scala: 'kotlin',
    swift: 'swift',
    sql: 'sql',
    mysql: 'sql',
    pgsql: 'sql',
    postgres: 'sql',
    sqlite: 'sql',
    xml: 'xml',
    html: 'xml',
    htm: 'xml',
    xhtml: 'xml',
    svg: 'xml',
    vue: 'xml',
    svelte: 'xml',
    json: 'json',
    jsonc: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'toml',
    properties: 'toml',
    css: 'css',
    scss: 'css',
    less: 'css',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    shell: 'shell',
    console: 'shell',
    powershell: 'powershell',
    ps1: 'powershell',
    diff: 'diff',
    patch: 'diff',
    dockerfile: 'docker',
    docker: 'docker',
    makefile: 'make',
    mk: 'make',
    markdown: 'markdown',
    md: 'markdown',
    text: 'plain',
    txt: 'plain',
  };

  const LANG_CONFIGS = {
    java: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], tripleStrings: ['"""'], keywords: JAVA_KEYWORDS, typeHeuristic: true },
    javascript: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'", '`'], keywords: JS_KEYWORDS, typeHeuristic: true },
    clike: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], keywords: CLike_KEYWORDS, typeHeuristic: true },
    csharp: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], keywords: CSHARP_KEYWORDS, typeHeuristic: true },
    python: { lineComments: ['#'], strings: ['"', "'"], tripleStrings: ['"""', "'''"], keywords: PYTHON_KEYWORDS, typeHeuristic: false },
    ruby: { lineComments: ['#'], strings: ['"', "'"], keywords: RUBY_KEYWORDS, typeHeuristic: false },
    php: { lineComments: ['//', '#'], blockComments: [['/*', '*/']], strings: ['"', "'"], keywords: PHP_KEYWORDS, typeHeuristic: false },
    go: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'", '`'], keywords: GO_KEYWORDS, typeHeuristic: true },
    rust: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], keywords: RUST_KEYWORDS, typeHeuristic: true },
    kotlin: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], tripleStrings: ['"""'], keywords: KOTLIN_KEYWORDS, typeHeuristic: true },
    swift: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], tripleStrings: ['"""'], keywords: SWIFT_KEYWORDS, typeHeuristic: true },
    sql: { lineComments: ['--'], blockComments: [['/*', '*/']], strings: ["'", '"'], keywords: SQL_KEYWORDS, caseInsensitive: true, typeHeuristic: false },
    shell: { lineComments: ['#'], strings: ['"', "'"], keywords: SHELL_KEYWORDS, variables: true, typeHeuristic: false },
    powershell: { lineComments: ['#'], strings: ['"', "'"], keywords: POWERSHELL_KEYWORDS, variables: true, typeHeuristic: false },
    docker: { lineComments: ['#'], strings: ['"', "'"], keywords: DOCKER_KEYWORDS, typeHeuristic: false },
    make: { lineComments: ['#'], strings: ['"', "'"], keywords: words('include define ifeq ifneq ifdef ifndef else endif export unexport override'),
      typeHeuristic: false },
    css: { blockComments: [['/*', '*/']], strings: ['"', "'"], keywords: words('important media supports keyframes font-face import charset namespace'),
      propertyHeuristic: true, typeHeuristic: false },
    yaml: { lineComments: ['#'], strings: ['"', "'"], keywords: YAML_KEYWORDS, typeHeuristic: false },
    toml: { lineComments: ['#'], strings: ['"', "'"], keywords: words('true false'), propertyHeuristic: true, typeHeuristic: false },
    markdown: { lineComments: [], strings: [], typeHeuristic: false },
    plain: { lineComments: [], strings: [], typeHeuristic: false },
    generic: { lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], typeHeuristic: false },
  };

  function resolveLanguage(raw) {
    const key = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
    if (key === '') return '';
    return LANG_ALIASES[key] || 'generic';
  }

  function emitHtml(out, text, className) {
    if (!text) return out;
    return out + (className ? '<span class="' + className + '">' + escapeHtml(text) + '</span>' : escapeHtml(text));
  }

  /** 扫描带转义的字符串，返回结束下标（不包含结束引号本身时按调用约定处理）。 */
  function scanStringEnd(code, start, quote, multiline) {
    let index = start + quote.length;
    while (index < code.length) {
      if (code[index] === '\\') {
        index += 2;
        continue;
      }
      if (code.startsWith(quote, index)) return index + quote.length;
      if (!multiline && code[index] === '\n') return index;
      index += 1;
    }
    return code.length;
  }

  /** 通用语言高亮：注释、字符串、数字、关键字、函数、类型、操作符。 */
  function highlightGeneric(code, config) {
    const cfg = config || LANG_CONFIGS.generic;
    const keywords = cfg.keywords instanceof Set ? cfg.keywords : words('');
    const out = [];
    let i = 0;
    const length = code.length;
    while (i < length) {
      const rest = code.slice(i);
      let matched = false;

      for (const [open, close] of cfg.blockComments || []) {
        if (rest.startsWith(open)) {
          const found = code.indexOf(close, i + open.length);
          const end = found < 0 ? length : found + close.length;
          out.push(emitHtml('', code.slice(i, end), 'tok-comment'));
          i = end;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      for (const marker of cfg.lineComments || []) {
        if (rest.startsWith(marker)) {
          let end = code.indexOf('\n', i);
          if (end < 0) end = length;
          out.push(emitHtml('', code.slice(i, end), 'tok-comment'));
          i = end;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      for (const quote of cfg.tripleStrings || []) {
        if (rest.startsWith(quote)) {
          const end = scanStringEnd(code, i, quote, true);
          out.push(emitHtml('', code.slice(i, end), 'tok-string'));
          i = end;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      for (const quote of cfg.strings || []) {
        if (rest.startsWith(quote)) {
          const end = scanStringEnd(code, i, quote, quote === '`');
          out.push(emitHtml('', code.slice(i, end), 'tok-string'));
          i = end;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if (cfg.variables) {
        const variable = /^\$\{[^}\n]*\}|\$[A-Za-z_]\w*/.exec(rest);
        if (variable) {
          out.push(emitHtml('', variable[0], 'tok-variable'));
          i += variable[0].length;
          continue;
        }
      }

      const number = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:[fFdDlLuU]+)?)/.exec(rest);
      if (number) {
        out.push(emitHtml('', number[0], 'tok-number'));
        i += number[0].length;
        continue;
      }

      const annotation = /^@[A-Za-z_]\w*/.exec(rest);
      if (annotation) {
        out.push(emitHtml('', annotation[0], 'tok-annotation'));
        i += annotation[0].length;
        continue;
      }

      const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(rest);
      if (identifier) {
        const word = identifier[0];
        const probe = cfg.caseInsensitive ? word.toLowerCase() : word;
        const after = code.slice(i + word.length);
        let className = '';
        if (keywords.has(probe)) className = 'tok-keyword';
        else if (/^(?:true|false|null|nil|None|undefined)$/.test(word)) className = 'tok-bool';
        else if (cfg.propertyHeuristic && /^\s*:/.test(after)) className = 'tok-attr';
        else if (cfg.typeHeuristic && /^[A-Z]/.test(word) && /^[A-Za-z0-9_$]*$/.test(word)) className = 'tok-type';
        else if (/^\s*\(/.test(after)) className = 'tok-function';
        out.push(emitHtml('', word, className));
        i += word.length;
        continue;
      }

      const operator = /^(?:===|!==|=>|->|::|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|\*\*|[+\-*/%=<>!&|^~?:])/.exec(rest);
      if (operator) {
        out.push(emitHtml('', operator[0], 'tok-operator'));
        i += operator[0].length;
        continue;
      }

      out.push(escapeHtml(rest[0]));
      i += 1;
    }
    return out.join('');
  }

  /** XML / HTML 高亮：标签、属性、属性值、注释、CDATA、实体。 */
  function highlightXml(code) {
    let out = '';
    let i = 0;
    const length = code.length;
    while (i < length) {
      if (code.startsWith('<!--', i)) {
        const found = code.indexOf('-->', i + 4);
        const end = found < 0 ? length : found + 3;
        out = emitHtml(out, code.slice(i, end), 'tok-comment');
        i = end;
        continue;
      }
      if (code.startsWith('<![CDATA[', i)) {
        const found = code.indexOf(']]>', i + 9);
        const end = found < 0 ? length : found + 3;
        out = emitHtml(out, code.slice(i, end), 'tok-string');
        i = end;
        continue;
      }
      if (code.startsWith('<?', i) || code.startsWith('<!', i)) {
        const found = code.indexOf('>', i + 2);
        const end = found < 0 ? length : found + 1;
        out = emitHtml(out, code.slice(i, end), 'tok-meta');
        i = end;
        continue;
      }
      if (code[i] === '<') {
        let j = i + 1;
        let closing = false;
        if (code[j] === '/') {
          closing = true;
          j += 1;
        }
        const name = /^[A-Za-z_][\w:.-]*/.exec(code.slice(j));
        if (!name) {
          out = emitHtml(out, '<', '');
          i += 1;
          continue;
        }
        out = emitHtml(out, (closing ? '</' : '<') + name[0], 'tok-tag');
        j += name[0].length;
        while (j < length) {
          const rest = code.slice(j);
          const whitespace = /^\s+/.exec(rest);
          if (whitespace) {
            out = emitHtml(out, whitespace[0], '');
            j += whitespace[0].length;
            continue;
          }
          if (rest.startsWith('/>')) {
            out = emitHtml(out, '/>', 'tok-operator');
            j += 2;
            break;
          }
          if (rest[0] === '>') {
            out = emitHtml(out, '>', '');
            j += 1;
            break;
          }
          const attribute = /^[A-Za-z_:][\w:.-]*/.exec(rest);
          if (attribute) {
            out = emitHtml(out, attribute[0], 'tok-attr');
            j += attribute[0].length;
            continue;
          }
          if (rest[0] === '=') {
            out = emitHtml(out, '=', 'tok-operator');
            j += 1;
            continue;
          }
          if (rest[0] === '"' || rest[0] === "'") {
            const end = scanStringEnd(code, j, rest[0], true);
            out = emitHtml(out, code.slice(j, end), 'tok-string');
            j = end;
            continue;
          }
          out = emitHtml(out, rest[0], '');
          j += 1;
        }
        i = j;
        continue;
      }
      let next = code.indexOf('<', i);
      if (next < 0) next = length;
      const text = code.slice(i, next);
      const entityPattern = /&(?:#\d+|#x[\da-f]+|[a-z][\w]*);/gi;
      let cursor = 0;
      let match;
      while ((match = entityPattern.exec(text)) !== null) {
        out = emitHtml(out, text.slice(cursor, match.index), '');
        out = emitHtml(out, match[0], 'tok-meta');
        cursor = match.index + match[0].length;
      }
      out = emitHtml(out, text.slice(cursor), '');
      i = next;
    }
    return out;
  }

  /** JSON / JSONC 高亮：key、字符串、数字、布尔、注释。 */
  function highlightJson(code) {
    let out = '';
    let i = 0;
    while (i < code.length) {
      const rest = code.slice(i);
      if (rest.startsWith('//')) {
        let end = code.indexOf('\n', i);
        if (end < 0) end = code.length;
        out = emitHtml(out, code.slice(i, end), 'tok-comment');
        i = end;
        continue;
      }
      if (rest.startsWith('/*')) {
        const found = code.indexOf('*/', i + 2);
        const end = found < 0 ? code.length : found + 2;
        out = emitHtml(out, code.slice(i, end), 'tok-comment');
        i = end;
        continue;
      }
      if (rest[0] === '"') {
        const end = scanStringEnd(code, i, '"', false);
        const after = code.slice(end);
        out = emitHtml(out, code.slice(i, end), /^\s*:/.test(after) ? 'tok-key' : 'tok-string');
        i = end;
        continue;
      }
      const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
      if (number) {
        out = emitHtml(out, number[0], 'tok-number');
        i += number[0].length;
        continue;
      }
      const boolean = /^(?:true|false|null)\b/.exec(rest);
      if (boolean) {
        out = emitHtml(out, boolean[0], 'tok-bool');
        i += boolean[0].length;
        continue;
      }
      if (/\s/.test(rest[0])) {
        out = emitHtml(out, rest[0], '');
      } else {
        out = emitHtml(out, rest[0], 'tok-operator');
      }
      i += 1;
    }
    return out;
  }

  /** diff / patch 高亮：增删行与 hunk 头。 */
  function highlightDiff(code) {
    const lines = code.split('\n');
    const rendered = lines.map((line) => {
      if (/^\+\+\+|^---/.test(line)) return emitHtml('', line, 'tok-meta');
      if (/^@@/.test(line)) return emitHtml('', line, 'tok-meta');
      if (line.startsWith('+')) return emitHtml('', line, 'tok-added');
      if (line.startsWith('-')) return emitHtml('', line, 'tok-removed');
      return emitHtml('', line, '');
    });
    return rendered.join(escapeHtml('\n'));
  }

  /**
   * 代码块语法高亮入口：返回已经转义的 HTML。
   * 只有可识别的语言才会高亮；未知语言退化为通用高亮。
   */
  function highlightCode(code, language) {
    const source = String(code === undefined || code === null ? '' : code);
    if (source === '') return '';
    const lang = resolveLanguage(language);
    if (lang === '') return escapeHtml(source);
    if (lang === 'xml') return highlightXml(source);
    if (lang === 'json') return highlightJson(source);
    if (lang === 'diff') return highlightDiff(source);
    if (lang === 'plain') return escapeHtml(source);
    if (lang === 'markdown') return escapeHtml(source);
    return highlightGeneric(source, LANG_CONFIGS[lang] || LANG_CONFIGS.generic);
  }

  return {
    render,
    htmlToMarkdown,
    inline,
    escapeHtml,
    highlightCode,
    resolveLanguage,
  };
})();

/* ==================== src/client/15-icons.js ==================== */
/**
 * 线性图标集合（原创简单几何图形，currentColor 着色）。
 *
 * @module @local/markdown-notes/src/client/15-icons
 */
MN.Icon = function Icon(props) {
  const name = props && props.name ? props.name : 'file';
  const size = props && props.size ? props.size : 16;
  const stroke = props && props.strokeWidth ? props.strokeWidth : 1.7;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    className: 'mn-icon',
    style: { display: 'block' },
  };
  const children = [];
  switch (name) {
    case 'notes':
      children.push(h('path', { key: 'a', d: 'M6 3.5h9.5L19 7v13.5H6z' }));
      children.push(h('path', { key: 'b', d: 'M15 3.5V7h3.5' }));
      children.push(h('path', { key: 'c', d: 'M9 11h6M9 14.5h6M9 18h3.5' }));
      break;
    case 'panel-left':
      children.push(h('rect', { key: 'a', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }));
      children.push(h('path', { key: 'b', d: 'M9.2 4.5v15' }));
      children.push(h('path', { key: 'c', d: 'M5.9 9h1.2M5.9 12h1.2M5.9 15h1.2' }));
      break;
    case 'folder':
      children.push(h('path', { key: 'a', d: 'M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' }));
      break;
    case 'folder-open':
      children.push(h('path', { key: 'a', d: 'M3.5 9V7.5a2 2 0 0 1 2-2h4l2 2.2h6.5a2 2 0 0 1 2 2V11' }));
      children.push(h('path', { key: 'b', d: 'M3.5 9h16.3l-2.1 9.1a1.6 1.6 0 0 1-1.6 1.2H4.8a1.5 1.5 0 0 1-1.5-1.8z' }));
      break;
    case 'file':
      children.push(h('path', { key: 'a', d: 'M6.5 3.5h8L18 7v13.5H6.5z' }));
      children.push(h('path', { key: 'b', d: 'M14 3.5V7h4' }));
      break;
    case 'chevron':
      children.push(h('path', { key: 'a', d: 'M9 5.5 15.5 12 9 18.5' }));
      break;
    case 'star':
      children.push(h('path', { key: 'a', d: 'm12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z' }));
      break;
    case 'star-filled':
      children.push(h('path', { key: 'a', d: 'm12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z', fill: 'currentColor' }));
      break;
    case 'plus':
      children.push(h('path', { key: 'a', d: 'M12 5v14M5 12h14' }));
      break;
    case 'plus-folder':
      children.push(h('path', { key: 'a', d: 'M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' }));
      children.push(h('path', { key: 'b', d: 'M12 11.5v5M9.5 14h5' }));
      break;
    case 'search':
      children.push(h('circle', { key: 'a', cx: 10.8, cy: 10.8, r: 6.3 }));
      children.push(h('path', { key: 'b', d: 'm15.5 15.5 4 4' }));
      break;
    case 'settings':
      children.push(h('circle', { key: 'a', cx: 12, cy: 12, r: 3.1 }));
      children.push(h('path', { key: 'b', d: 'M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1' }));
      break;
    case 'trash':
      children.push(h('path', { key: 'a', d: 'M4.5 6.5h15' }));
      children.push(h('path', { key: 'b', d: 'M9.5 6.5V4.2h5v2.3' }));
      children.push(h('path', { key: 'c', d: 'M6.5 6.5 7.6 20h8.8l1.1-13.5' }));
      children.push(h('path', { key: 'd', d: 'M10 10.2v6M14 10.2v6' }));
      break;
    case 'rename':
      children.push(h('path', { key: 'a', d: 'M4.5 19.5 8 18.7l10.4-10.4a1.8 1.8 0 0 0 0-2.5l-1.2-1.2a1.8 1.8 0 0 0-2.5 0L4.3 15z' }));
      children.push(h('path', { key: 'b', d: 'M14 5.8 18.2 10' }));
      break;
    case 'split':
      children.push(h('rect', { key: 'a', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }));
      children.push(h('path', { key: 'b', d: 'M12 4.5v15' }));
      break;
    case 'source':
      children.push(h('path', { key: 'a', d: 'm8.5 8-4 4 4 4M15.5 8l4 4-4 4' }));
      break;
    case 'preview':
      children.push(h('path', { key: 'a', d: 'M2.8 12S6.5 5.8 12 5.8 21.2 12 21.2 12 17.5 18.2 12 18.2 2.8 12 2.8 12z' }));
      children.push(h('circle', { key: 'b', cx: 12, cy: 12, r: 2.6 }));
      break;
    case 'image':
      children.push(h('rect', { key: 'a', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }));
      children.push(h('circle', { key: 'b', cx: 8.5, cy: 9.3, r: 1.5 }));
      children.push(h('path', { key: 'c', d: 'm4.5 17 4.7-4.5 3.3 3 2.5-2.2 4.5 4' }));
      break;
    case 'link':
      children.push(h('path', { key: 'a', d: 'M10.2 13.8a4.2 4.2 0 0 0 6 0l2.2-2.2a4.2 4.2 0 0 0-6-6l-1.1 1.1' }));
      children.push(h('path', { key: 'b', d: 'M13.8 10.2a4.2 4.2 0 0 0-6 0l-2.2 2.2a4.2 4.2 0 0 0 6 6l1.1-1.1' }));
      break;
    case 'save':
      children.push(h('path', { key: 'a', d: 'M5 3.8h11.2L20 7.6V20H5z' }));
      children.push(h('path', { key: 'b', d: 'M8 3.8v5.4h7V3.8M8 20v-5.4h8V20' }));
      break;
    case 'close':
      children.push(h('path', { key: 'a', d: 'M6 6l12 12M18 6 6 18' }));
      break;
    case 'check':
      children.push(h('path', { key: 'a', d: 'm5 12.5 4.2 4.2L19 6.8' }));
      break;
    case 'refresh':
      children.push(h('path', { key: 'a', d: 'M19.5 12a7.5 7.5 0 1 1-2.3-5.4' }));
      children.push(h('path', { key: 'b', d: 'M19.5 4.3v4.9h-4.9' }));
      break;
    case 'sync':
      children.push(h('path', { key: 'a', d: 'M4.6 9.2A7.4 7.4 0 0 1 18.4 7' }));
      children.push(h('path', { key: 'b', d: 'M18.4 3.8V7h-3.2' }));
      children.push(h('path', { key: 'c', d: 'M19.4 14.8A7.4 7.4 0 0 1 5.6 17' }));
      children.push(h('path', { key: 'd', d: 'M5.6 20.2V17h3.2' }));
      break;
    case 'book':
      children.push(h('path', { key: 'a', d: 'M12 6.2C10.4 4.9 8.2 4.3 4.5 4.3v13.4c3.7 0 5.9.6 7.5 1.9 1.6-1.3 3.8-1.9 7.5-1.9V4.3c-3.7 0-5.9.6-7.5 1.9z' }));
      children.push(h('path', { key: 'b', d: 'M12 6.2v13.4' }));
      break;
    case 'more':
      children.push(h('circle', { key: 'a', cx: 6, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }));
      children.push(h('circle', { key: 'b', cx: 12, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }));
      children.push(h('circle', { key: 'c', cx: 18, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }));
      break;
    case 'heading':
      children.push(h('path', { key: 'a', d: 'M6 5v14M18 5v14M6 12h12' }));
      break;
    case 'quote':
      children.push(h('path', { key: 'a', d: 'M5 5.5v13' }));
      children.push(h('path', { key: 'b', d: 'M9.5 8h9M9.5 12h9M9.5 16h5.5' }));
      break;
    case 'list':
      children.push(h('path', { key: 'a', d: 'M9 6.5h11M9 12h11M9 17.5h11' }));
      children.push(h('circle', { key: 'b', cx: 4.7, cy: 6.5, r: 1.1, fill: 'currentColor', stroke: 'none' }));
      children.push(h('circle', { key: 'c', cx: 4.7, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }));
      children.push(h('circle', { key: 'd', cx: 4.7, cy: 17.5, r: 1.1, fill: 'currentColor', stroke: 'none' }));
      break;
    case 'ordered':
      children.push(h('path', { key: 'a', d: 'M10 6.5h10M10 12h10M10 17.5h10' }));
      children.push(h('path', { key: 'b', d: 'M4 5.5h1.4v4M4 9.5h2.4M4.2 14.2h1.6a1 1 0 0 1 0 2H4.1a1 1 0 0 0 0 2h1.8' }));
      break;
    case 'code':
      children.push(h('path', { key: 'a', d: 'm8 7.5-4.3 4.5L8 16.5M16 7.5l4.3 4.5-4.3 4.5' }));
      break;
    case 'table':
      children.push(h('rect', { key: 'a', x: 3.5, y: 4.5, width: 17, height: 15, rx: 2 }));
      children.push(h('path', { key: 'b', d: 'M3.5 9.5h17M3.5 14.5h17M9.2 4.5v15M14.8 4.5v15' }));
      break;
    case 'task':
      children.push(h('rect', { key: 'a', x: 4, y: 4, width: 16, height: 16, rx: 3 }));
      children.push(h('path', { key: 'b', d: 'm8.3 12.2 2.4 2.5 5-5.3' }));
      break;
    case 'hr':
      children.push(h('path', { key: 'a', d: 'M4 12h16' }));
      break;
    case 'dot':
      children.push(h('circle', { key: 'a', cx: 12, cy: 12, r: 4, fill: 'currentColor', stroke: 'none' }));
      break;
    default:
      children.push(h('circle', { key: 'a', cx: 12, cy: 12, r: 7 }));
  }
  return h('svg', common, children);
};

/* ==================== src/client/20-css.js ==================== */
/**
 * 面板样式：只使用宿主主题 token（--dsw-alias-*），不写死主题色。
 * 结构遵循宿主「侧栏列表 + 主编辑区」的布局习惯。
 *
 * @module @local/markdown-notes/src/client/20-css
 */
MN.CSS = `
.mn-root{--mn-side:264px;--mn-row:30px;display:flex;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;overflow:hidden;position:relative;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d1d1f);font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5}
html[data-platform="darwin"] .mn-root{padding-top:var(--dsh-frame-top-clearance,0px)}
.mn-root *{box-sizing:border-box}
.mn-root button,.mn-root input,.mn-root textarea{font-family:inherit}
.mn-side{flex:none;width:var(--mn-side);min-width:0;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1,#f7f7f8))}
.mn-side-resizer{position:absolute;top:0;bottom:0;left:calc(var(--mn-side) - 2px);width:5px;z-index:16;cursor:col-resize;touch-action:none;outline:none;background:transparent}
.mn-side-resizer:before{content:"";position:absolute;left:2px;top:0;bottom:0;width:2px;border-radius:1px;background:transparent;transition:background .12s ease}
.mn-side-resizer:hover:before,.mn-side-resizer:focus-visible:before,.mn-side-resizer[data-dragging="true"]:before{background:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-side-resizer:focus-visible{outline:none}
.mn-side-head{flex:none;display:flex;align-items:center;gap:6px;padding:12px 12px 8px}
.mn-side-collapse{flex:none;margin-right:-2px}
.mn-side-expand{position:absolute;left:8px;top:10px;z-index:12;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 2px 8px rgba(0,0,0,.12);color:var(--dsw-alias-label-secondary,#6b6b70);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.mn-side-expand:hover{color:var(--dsw-alias-label-primary,#1d1d1f);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}
.mn-root[data-side-collapsed="true"] .mn-head{padding-left:48px}
.mn-side-title{flex:1 1 auto;min-width:0;font-size:14px;font-weight:600;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mn-side-actions{margin-left:auto;display:flex;align-items:center;gap:2px}
.mn-side-search{flex:none;padding:0 10px 8px}
.mn-search-wrap{position:relative;display:flex;align-items:center}
.mn-search-icon{position:absolute;left:8px;display:flex;color:var(--dsw-alias-label-secondary,#6b6b70);pointer-events:none}
.mn-search{width:100%;height:30px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;padding:0 26px 0 27px;font-size:12.5px;outline:none}
.mn-search:focus{border-color:var(--dsw-alias-brand-primary,#2f6bff);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 18%,transparent)}
.mn-search-clear{position:absolute;right:5px;width:20px;height:20px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#6b6b70);cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0}
.mn-search-clear:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-side-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding:2px 8px 12px}
.mn-side-scroll::-webkit-scrollbar{width:9px}
.mn-side-scroll::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b6b70) 26%,transparent);border:2px solid transparent;background-clip:content-box;border-radius:6px}
.mn-section{margin-top:10px}
.mn-section:first-child{margin-top:0}
.mn-section-head{display:flex;align-items:center;gap:6px;height:26px;padding:0 6px;color:var(--dsw-alias-label-secondary,#6b6b70);font-size:11.5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;user-select:none}
.mn-section-count{margin-left:auto;font-weight:500;opacity:.75;font-variant-numeric:tabular-nums;text-transform:none}
.mn-row{display:flex;align-items:center;gap:5px;height:var(--mn-row);padding:0 6px;border-radius:6px;cursor:pointer;user-select:none;color:inherit;position:relative;min-width:0}
.mn-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary,#1d1d1f) 6%,transparent)}
.mn-row[data-active="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 13%,transparent);color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-row[data-active="true"]:before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-row[data-dragging="true"]{opacity:.5;cursor:grabbing}
.mn-row[data-drop-target="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 10%,transparent);outline:1.5px dashed var(--dsw-alias-brand-primary,#2f6bff);outline-offset:-2px}
.mn-row[data-drop-target="true"]:after{content:"↳";position:absolute;right:6px;bottom:1px;font-size:10px;color:var(--dsw-alias-brand-primary,#2f6bff);opacity:.85}
.mn-row[data-drop-position="before"]{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary,#2f6bff)}
.mn-row[data-drop-position="after"]{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary,#2f6bff)}
.mn-row-icon{flex:none;width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-row[data-active="true"] .mn-row-icon{color:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-row-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.mn-row-meta{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary,#6b6b70);opacity:.8;font-variant-numeric:tabular-nums}
.mn-row-actions{flex:none;display:none;align-items:center;gap:1px}
.mn-row-actions .mn-iconbtn{width:22px;height:22px;border-radius:5px}
.mn-row:hover .mn-row-actions,.mn-row:focus-within .mn-row-actions{display:flex}
.mn-row-actions .mn-row-meta{display:none}
.mn-fav-mark{flex:none;display:flex;color:#e3a008}
.mn-chevron{flex:none;width:14px;height:14px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#6b6b70);transition:transform .12s ease}
.mn-chevron[data-open="true"]{transform:rotate(90deg)}
.mn-children{padding-left:0}
.mn-children .mn-row{padding-left:6px}
.mn-indent{flex:none;width:14px}
.mn-empty-side{padding:18px 10px;text-align:center;color:var(--dsw-alias-label-secondary,#6b6b70);font-size:12px;line-height:1.7}
.mn-side-foot{flex:none;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));padding:7px 10px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#6b6b70);min-width:0}
.mn-side-path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.mn-side-path:hover{color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-side-count{flex:none;font-variant-numeric:tabular-nums;opacity:.8}

.mn-main{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;background:var(--dsw-alias-bg-base,#fff)}
.mn-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 16px 8px;min-width:0}
.mn-heading{display:flex;flex-direction:column;min-width:0;gap:1px;flex:1 1 auto}
.mn-title{display:flex;align-items:center;gap:7px;min-width:0;font-size:15px;font-weight:600;letter-spacing:.1px}
.mn-title-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mn-subtitle{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b6b70);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.mn-head-actions{flex:none;display:flex;align-items:center;gap:3px}
.mn-sep-v{width:1px;height:18px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.1));margin:0 4px}
.mn-status{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b6b70);white-space:nowrap;min-width:74px;text-align:right;font-variant-numeric:tabular-nums}
.mn-status[data-state="saving"]{color:var(--dsw-alias-state-idle-primary,#8a8a90)}
.mn-status[data-state="dirty"]{color:var(--dsw-alias-state-warn-primary,#b7791f)}
.mn-status[data-state="error"]{color:var(--dsw-alias-state-error-primary,#c62828);cursor:pointer}
.mn-status[data-state="saved"]{color:var(--dsw-alias-state-success-primary,#2e7d32);opacity:.85}

.mn-toolbar{flex:none;display:flex;align-items:center;gap:2px;padding:4px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));background:var(--dsw-alias-bg-layer-1,#fafafa);min-height:40px;overflow-x:auto}
.mn-toolbar::-webkit-scrollbar{height:0}
.mn-toolbar-label{flex:none;font-size:10.5px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#8a8a90);margin-right:6px;white-space:nowrap}
.mn-tbtn{flex:none;height:27px;min-width:27px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#55555a);font-size:12.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap}
.mn-tbtn:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-tbtn:active{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.09))}
.mn-tbtn[data-on="true"]{color:var(--dsw-alias-brand-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 12%,transparent)}
.mn-tbtn b,.mn-tbtn i,.mn-tbtn u,.mn-tbtn s{font-size:12.5px}
.mn-tool-sep{flex:none;width:1px;height:16px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.12));margin:0 4px}
.mn-tool-spacer{flex:1 1 auto;min-width:8px}
.mn-viewswitch{flex:none;display:inline-flex;align-items:center;height:28px;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));gap:2px}
.mn-viewswitch button{height:24px;padding:0 9px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary,#6b6b70);font-size:12px;cursor:pointer;white-space:nowrap}
.mn-viewswitch button[data-on="true"]{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d1d1f);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.mn-sync-toggle{flex:none;display:inline-flex;align-items:center;gap:4px;height:28px;margin-left:4px;padding:0 9px;border:1px solid transparent;border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#6b6b70);font-size:11.5px;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}
.mn-sync-toggle:hover{color:var(--dsw-alias-label-primary,#1d1d1f);background:var(--dsw-alias-bg-layer-1,#f5f5f6)}
.mn-sync-toggle[data-on="true"]{color:var(--dsw-alias-brand-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 12%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 28%,transparent)}
.mn-sync-toggle:disabled{opacity:.48;cursor:default}
.mn-sync-toggle:disabled:hover{color:var(--dsw-alias-label-secondary,#6b6b70);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06))}

.mn-panes{flex:1 1 auto;min-height:0;display:flex;min-width:0}
.mn-root[data-view="split"] .mn-panes{display:grid;grid-template-columns:minmax(220px,var(--mn-split-left,50%)) 8px minmax(220px,1fr)}
.mn-pane{flex:1 1 50%;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;background:var(--dsw-alias-bg-base,#fff)}
.mn-root[data-view="split"] .mn-pane{flex:1 1 auto}
.mn-pane + .mn-pane{border-left:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09))}
.mn-splitter{position:relative;z-index:2;cursor:col-resize;touch-action:none;outline:none;background:var(--dsw-alias-bg-layer-1,#f6f6f7);border-left:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));transition:background .12s ease}
.mn-splitter:before{content:"";position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;border-radius:1px;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8a90) 40%,transparent);transition:background .12s ease}
.mn-splitter:hover,.mn-splitter:focus-visible{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 7%,var(--dsw-alias-bg-layer-1,#f6f6f7))}
.mn-splitter:hover:before,.mn-splitter:focus-visible:before,.mn-splitter[data-dragging="true"]:before{background:var(--dsw-alias-brand-primary,#2f6bff);width:3px;margin-left:-1.5px}
.mn-splitter[data-dragging="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 12%,transparent)}
.mn-pane-label{flex:none;height:24px;display:flex;align-items:center;gap:6px;padding:0 16px;font-size:10.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#8a8a90);background:var(--dsw-alias-bg-base,#fff);border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1,rgba(0,0,0,.07)) 60%,transparent)}
.mn-pane-label .mn-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#2e7d32);opacity:.75}
.mn-source{flex:1 1 auto;min-height:0;display:flex;position:relative}
.mn-source-mirror{position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;margin:0;border:0;overflow:hidden;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;z-index:-1}
.mn-source-input{flex:1 1 auto;width:100%;height:100%;resize:none;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary,#1d1d1f);padding:18px 22px 40px;font-family:"Cascadia Mono",Consolas,"SF Mono","Courier New",monospace;font-size:13px;line-height:1.75;tab-size:2;white-space:pre-wrap;overflow:auto}
.mn-source-input::placeholder{color:var(--dsw-alias-label-secondary,#8a8a90)}
.mn-source-input::-webkit-scrollbar,.mn-rich::-webkit-scrollbar{width:10px;height:10px}
.mn-source-input::-webkit-scrollbar-thumb,.mn-rich::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b6b70) 26%,transparent);border:2px solid transparent;background-clip:content-box;border-radius:6px}
.mn-editor-wrap{flex:1 1 auto;min-height:0;min-width:0;display:flex;position:relative}
.mn-slash-menu{position:fixed;z-index:60;width:286px;max-height:360px;display:flex;flex-direction:column;padding:6px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);overflow:hidden}
.mn-slash-head{flex:none;padding:5px 8px 6px;font-size:11px;font-weight:600;letter-spacing:.3px;color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-slash-list{flex:1 1 auto;min-height:0;overflow:auto;padding:1px 0}
.mn-slash-item{display:flex;align-items:center;gap:9px;width:100%;border:0;background:transparent;border-radius:7px;padding:5px 7px;text-align:left;color:var(--dsw-alias-label-primary,#1d1d1f);font:inherit;cursor:pointer;outline:none}
.mn-slash-item:hover,.mn-slash-item[data-active="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 11%,transparent)}
.mn-slash-icon{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-slash-item[data-active="true"] .mn-slash-icon{color:var(--dsw-alias-brand-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 13%,transparent)}
.mn-slash-copy{display:flex;flex-direction:column;gap:1px;min-width:0}
.mn-slash-label{font-size:12.5px;font-weight:600;line-height:1.35}
.mn-slash-desc{font-size:10.5px;line-height:1.3;color:var(--dsw-alias-label-secondary,#8a8a90);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mn-slash-foot{flex:none;padding:6px 8px 2px;margin-top:2px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.07));font-size:10px;line-height:1.4;color:var(--dsw-alias-label-secondary,#8a8a90)}
.mn-rich{--mn-block-border:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b6b70) 46%,transparent);flex:1 1 auto;min-height:0;overflow:auto;padding:18px 26px 44px;outline:none;font-size:14px;line-height:1.78;word-break:break-word;color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-rich:empty:before{content:attr(data-placeholder);color:var(--dsw-alias-label-secondary,#8a8a90);pointer-events:none}
.mn-rich > *:first-child{margin-top:0}
.mn-rich h1,.mn-rich h2,.mn-rich h3,.mn-rich h4,.mn-rich h5,.mn-rich h6{margin:1.2em 0 .55em;line-height:1.35;font-weight:650;color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-rich h1{font-size:1.72em;padding-bottom:.22em;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09))}
.mn-rich h2{font-size:1.42em}
.mn-rich h3{font-size:1.2em}
.mn-rich h4{font-size:1.06em}
.mn-rich h5,.mn-rich h6{font-size:1em;color:var(--dsw-alias-label-secondary,#55555a)}
.mn-rich p{margin:.62em 0}
.mn-rich a{color:var(--dsw-alias-brand-primary,#2f6bff);text-decoration:none}
.mn-rich a:hover{text-decoration:underline}
.mn-rich strong{font-weight:650}
.mn-rich ul,.mn-rich ol{margin:.5em 0;padding-left:1.55em}
.mn-rich li{margin:.18em 0}
.mn-rich li > ul,.mn-rich li > ol{margin:.2em 0}
.mn-rich blockquote{margin:.8em 0;padding:.15em 0 .15em 1em;border-left:3px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 55%,transparent);color:var(--dsw-alias-label-secondary,#55555a);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 4%,transparent);border-radius:0 6px 6px 0}
.mn-rich code{font-family:"Cascadia Mono",Consolas,"SF Mono","Courier New",monospace;font-size:.88em;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));padding:.12em .38em;border-radius:4px}
.mn-rich pre{margin:.8em 0;padding:12px 14px;background:var(--dsw-alias-bg-layer-1,#f6f6f7);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.22));border-color:var(--mn-block-border);border-radius:8px;overflow:auto;line-height:1.6}
.mn-rich .mn-code-block{margin:.8em 0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.22));border-color:var(--mn-block-border);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#f6f6f7)}
.mn-rich .mn-code-head{display:flex;align-items:center;gap:7px;padding:5px 9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,rgba(0,0,0,.04)) 82%,transparent);border-bottom:1px solid var(--mn-block-border);user-select:none}
.mn-rich .mn-code-head-icon{font-family:"Cascadia Mono",Consolas,monospace;font-size:10px;letter-spacing:.2px;color:var(--dsw-alias-label-secondary,#8a8a90);opacity:.62;user-select:none}
.mn-rich .mn-code-lang-wrap{position:relative;display:inline-flex;align-items:center;max-width:164px}
.mn-rich .mn-code-lang-wrap:after{content:"";position:absolute;right:7px;top:50%;width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;color:var(--dsw-alias-label-secondary,#8a8a90);transform:translateY(-72%) rotate(45deg);pointer-events:none;transition:transform .15s ease,color .15s ease}
.mn-rich .mn-code-lang-wrap:focus-within:after{transform:translateY(-28%) rotate(225deg);color:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-rich .mn-code-lang{appearance:none;-webkit-appearance:none;-moz-appearance:none;min-width:62px;max-width:164px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b6b70);font-family:"Cascadia Mono",Consolas,"SF Mono",monospace;font-size:10.5px;line-height:1.4;padding:3px 23px 3px 8px;cursor:pointer;outline:none;text-overflow:ellipsis;transition:background .12s ease,color .12s ease,border-color .12s ease,box-shadow .12s ease}
.mn-rich .mn-code-lang:hover{background:var(--dsw-alias-bg-base,#fff);border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.12));color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-rich .mn-code-lang:focus-visible{border-color:var(--dsw-alias-brand-primary,#2f6bff);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d1d1f);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 15%,transparent)}
.mn-rich .mn-code-lang option{color:var(--dsw-alias-label-primary,#1d1d1f);background:var(--dsw-alias-bg-overlay,#fff)}
.mn-rich .mn-code-block pre{margin:0;border:0;border-radius:0;background:transparent}
.mn-rich pre code{background:transparent;padding:0;font-size:12.5px;white-space:pre}
.mn-rich .tok-comment{color:var(--dsw-alias-label-secondary,#6b6b70);font-style:italic;opacity:.88}
.mn-rich .tok-keyword{color:var(--dsw-alias-brand-primary,#2f6bff);font-weight:600}
.mn-rich .tok-string{color:var(--dsw-alias-state-success-primary,#2e7d32)}
.mn-rich .tok-number,.mn-rich .tok-bool{color:var(--dsw-alias-state-warn-primary,#b7791f)}
.mn-rich .tok-function{color:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 68%,var(--dsw-alias-label-primary,#1d1d1f))}
.mn-rich .tok-type{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e7d32) 62%,var(--dsw-alias-label-primary,#1d1d1f))}
.mn-rich .tok-annotation,.mn-rich .tok-variable{color:var(--dsw-alias-state-error-primary,#c62828)}
.mn-rich .tok-tag{color:var(--dsw-alias-state-error-primary,#c62828);font-weight:600}
.mn-rich .tok-attr{color:var(--dsw-alias-state-warn-primary,#b7791f)}
.mn-rich .tok-key{color:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-rich .tok-meta,.mn-rich .tok-operator{color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-rich .tok-added{color:var(--dsw-alias-state-success-primary,#2e7d32)}
.mn-rich .tok-removed{color:var(--dsw-alias-state-error-primary,#c62828)}
.mn-rich hr{margin:1.3em 0;border:0;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12))}
.mn-rich img{max-width:100%;height:auto;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));margin:.35em 0;display:block;user-select:none;-webkit-user-drag:none;cursor:pointer;transition:box-shadow .12s ease}
.mn-rich img:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 45%,transparent)}
.mn-rich img.mn-img-selected{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#2f6bff)}
.mn-img-overlay{position:fixed;z-index:25;pointer-events:none;border:1px solid var(--dsw-alias-brand-primary,#2f6bff);border-radius:4px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 22%,transparent)}
.mn-img-handle{position:absolute;width:10px;height:10px;border:1.5px solid var(--dsw-alias-brand-primary,#2f6bff);border-radius:2px;background:var(--dsw-alias-bg-base,#fff);pointer-events:auto;box-shadow:0 1px 3px rgba(0,0,0,.25);box-sizing:border-box}
.mn-img-handle:hover{background:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-img-handle[data-dir="nw"]{left:-5px;top:-5px;cursor:nwse-resize}
.mn-img-handle[data-dir="n"]{left:50%;top:-5px;margin-left:-5px;cursor:ns-resize}
.mn-img-handle[data-dir="ne"]{right:-5px;top:-5px;cursor:nesw-resize}
.mn-img-handle[data-dir="e"]{right:-5px;top:50%;margin-top:-5px;cursor:ew-resize}
.mn-img-handle[data-dir="se"]{right:-5px;bottom:-5px;cursor:nwse-resize}
.mn-img-handle[data-dir="s"]{left:50%;bottom:-5px;margin-left:-5px;cursor:ns-resize}
.mn-img-handle[data-dir="sw"]{left:-5px;bottom:-5px;cursor:nesw-resize}
.mn-img-handle[data-dir="w"]{left:-5px;top:50%;margin-top:-5px;cursor:ew-resize}
.mn-img-size{position:absolute;right:0;bottom:-24px;padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-secondary,#6b6b70);white-space:nowrap;font-variant-numeric:tabular-nums}
.mn-ghost-caret{position:fixed;z-index:22;width:2px;border-radius:1px;background:var(--dsw-alias-brand-primary,#2f6bff);box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 22%,transparent);pointer-events:none;animation:mn-caret-blink 1.06s step-end infinite}
@keyframes mn-caret-blink{0%,55%{opacity:1}56%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.mn-ghost-caret{animation:none}}
.mn-rich mark{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f0b429) 32%,transparent);color:inherit;padding:0 .12em;border-radius:3px}
.mn-rich .mn-task{width:14px;height:14px;margin:0 .35em 0 0;vertical-align:-2px;accent-color:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-rich .mn-task-item{list-style:none;margin-left:-1.2em}
.mn-rich .mn-table-wrap{overflow:auto;margin:.8em 0;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.22));border-color:var(--mn-block-border);border-radius:8px}
.mn-rich table{border-collapse:collapse;width:100%;font-size:13px}
.mn-rich th,.mn-rich td{border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.2));border-right:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.2));border-color:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b6b70) 38%,transparent);padding:7px 10px;text-align:left;vertical-align:top}
.mn-rich th{background:var(--dsw-alias-bg-layer-1,#f6f6f7);font-weight:600;border-bottom-color:color-mix(in srgb,var(--dsw-alias-label-secondary,#6b6b70) 58%,transparent)}
.mn-rich tr:last-child td{border-bottom:0}
.mn-rich th:last-child,.mn-rich td:last-child{border-right:0}

.mn-empty{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px;text-align:center;color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-empty-icon{width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 9%,transparent);color:var(--dsw-alias-brand-primary,#2f6bff)}
.mn-empty h2{margin:0;font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-empty p{margin:0;font-size:12.5px;line-height:1.8;max-width:460px}
.mn-empty-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:2px}
.mn-empty-path{font-size:11.5px;opacity:.8;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl}
.mn-note-loading{display:flex;align-items:center;justify-content:center;flex:1;color:var(--dsw-alias-label-secondary,#6b6b70);font-size:12.5px}

.mn-btn{appearance:none;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d1d1f);font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap}
.mn-btn:hover{background:var(--dsw-alias-bg-layer-1,#f5f5f6)}
.mn-btn:active{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.08))}
.mn-btn[data-primary="true"]{background:var(--dsw-alias-brand-primary,#2f6bff);border-color:transparent;color:#fff}
.mn-btn[data-primary="true"]:hover{filter:brightness(1.06)}
.mn-btn[data-danger="true"]{color:var(--dsw-alias-state-error-primary,#c62828);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c62828) 35%,transparent)}
.mn-btn:disabled{opacity:.45;cursor:default}
.mn-iconbtn{appearance:none;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#6b6b70);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.mn-iconbtn:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1d1d1f)}
.mn-iconbtn[data-on="true"]{color:#e3a008;background:color-mix(in srgb,#e3a008 13%,transparent)}
.mn-iconbtn[data-danger="true"]:hover{color:var(--dsw-alias-state-error-primary,#c62828);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c62828) 10%,transparent)}
.mn-icon{display:block}

.mn-overlay{position:absolute;inset:0;z-index:30;background:rgba(10,14,24,.36);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px}
.mn-dialog{width:min(480px,94%);max-height:86%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden}
.mn-dialog-head{display:flex;align-items:center;gap:8px;padding:15px 18px 8px}
.mn-dialog-title{font-size:14.5px;font-weight:600;flex:1 1 auto;min-width:0}
.mn-dialog-body{padding:6px 18px 12px;display:flex;flex-direction:column;gap:9px;overflow:auto}
.mn-dialog-text{margin:0;font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-secondary,#55555a);word-break:break-word}
.mn-field{display:flex;flex-direction:column;gap:5px}
.mn-field-label{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-input{height:32px;width:100%;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;padding:0 10px;font-size:12.5px;outline:none}
.mn-input:focus{border-color:var(--dsw-alias-brand-primary,#2f6bff);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 16%,transparent)}
.mn-hint{font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary,#6b6b70)}
.mn-hint code{font-family:Consolas,monospace;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06));padding:1px 4px;border-radius:4px;word-break:break-all}
.mn-dialog-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 18px 16px}
.mn-dialog-error{font-size:11.5px;color:var(--dsw-alias-state-error-primary,#c62828);line-height:1.6;white-space:pre-wrap}
.mn-radio-row{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;cursor:pointer}
.mn-radio-row[data-on="true"]{border-color:var(--dsw-alias-brand-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 6%,transparent)}
.mn-radio-row input{accent-color:var(--dsw-alias-brand-primary,#2f6bff)}

.mn-context{position:fixed;z-index:40;min-width:160px;padding:4px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:9px;background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 10px 30px rgba(0,0,0,.22)}
.mn-context button{display:flex;align-items:center;gap:8px;width:100%;height:28px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#1d1d1f);font-size:12.5px;text-align:left;cursor:pointer;white-space:nowrap}
.mn-context button:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.06))}
.mn-context button[data-danger="true"]{color:var(--dsw-alias-state-error-primary,#c62828)}
.mn-context-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.1))}
.mn-context-label{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8a8a90);padding:4px 9px 2px;letter-spacing:.4px;text-transform:uppercase}

.mn-toast{position:absolute;right:16px;bottom:16px;z-index:50;max-width:min(460px,80%);padding:9px 13px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 10px 30px rgba(0,0,0,.2);font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary,#1d1d1f);display:flex;align-items:flex-start;gap:8px;animation:mn-toast-in .16s ease}
.mn-toast[data-kind="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c62828) 45%,transparent)}
.mn-toast-dot{flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#2e7d32)}
.mn-toast[data-kind="error"] .mn-toast-dot{background:var(--dsw-alias-state-error-primary,#c62828)}
.mn-toast[data-kind="info"] .mn-toast-dot{background:var(--dsw-alias-brand-primary,#2f6bff)}
@keyframes mn-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

.mn-crash{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px;text-align:center;color:var(--dsw-alias-label-secondary,#6b6b70);font-size:13px;line-height:1.7}
.mn-crash strong{color:var(--dsw-alias-state-error-primary,#c62828);font-size:14px}
.mn-spin{width:14px;height:14px;border:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#2f6bff) 30%,transparent);border-top-color:var(--dsw-alias-brand-primary,#2f6bff);border-radius:50%;animation:mn-spin .8s linear infinite}
@keyframes mn-spin{to{transform:rotate(360deg)}}

@media (max-width:1040px){
  .mn-root{--mn-side:232px}
  .mn-root[data-view="split"] .mn-panes{display:flex;flex-direction:column}
  .mn-root[data-view="split"] .mn-splitter{display:none}
  .mn-root[data-view="split"] .mn-pane{flex:1 1 50%}
  .mn-root[data-view="split"] .mn-pane + .mn-pane{border-left:0;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.09))}
}
`;

/* ==================== src/client/30-dialogs.js ==================== */
/**
 * 通用弹层：模态框、输入对话框、确认对话框、右键菜单。
 * 不依赖宿主 UI 组件包，只使用宿主主题 token 与自己的类名前缀。
 *
 * @module @local/markdown-notes/src/client/30-dialogs
 */

/** 模态框外壳：Escape / 点击遮罩关闭。 */
MN.Modal = function Modal(props) {
  const title = props.title || '';
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !props.busy) {
        event.stopPropagation();
        if (typeof props.onClose === 'function') props.onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [props.onClose, props.busy]);

  return h(
    'div',
    {
      className: 'mn-overlay',
      role: 'presentation',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget && !props.busy && typeof props.onClose === 'function') props.onClose();
      },
    },
    h(
      'div',
      {
        className: 'mn-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        style: props.wide ? { width: 'min(640px,96%)' } : undefined,
        onMouseDown: (event) => event.stopPropagation(),
      },
      h(
        'div',
        { className: 'mn-dialog-head' },
        h('div', { className: 'mn-dialog-title' }, title),
        h(
          'button',
          {
            type: 'button',
            className: 'mn-iconbtn',
            title: MN.t('common.close'),
            'aria-label': MN.t('common.close'),
            onClick: () => {
              if (!props.busy && typeof props.onClose === 'function') props.onClose();
            },
          },
          h(MN.Icon, { name: 'close', size: 15 }),
        ),
      ),
      h('div', { className: 'mn-dialog-body' }, props.children),
      props.footer ? h('div', { className: 'mn-dialog-actions' }, props.footer) : null,
    ),
  );
};

/** 单行输入对话框。 */
MN.PromptDialog = function PromptDialog(props) {
  const [value, setValue] = useState(typeof props.initial === 'string' ? props.initial : '');
  const inputRef = useRef(null);
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    const dot = input.value.lastIndexOf('.');
    try {
      if (dot > 0) input.setSelectionRange(0, dot);
      else input.select();
    } catch (error) {
      /* 选择失败不影响输入 */
    }
  }, []);

  const submit = () => {
    const text = value.trim();
    if (text === '' || props.busy) return;
    props.onConfirm(text);
  };

  return h(
    MN.Modal,
    {
      title: props.title,
      onClose: props.onCancel,
      busy: props.busy,
      footer: [
        h(
          'button',
          {
            key: 'cancel',
            type: 'button',
            className: 'mn-btn',
            disabled: props.busy,
            onClick: props.onCancel,
          },
          MN.t('common.cancel'),
        ),
        h(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'mn-btn',
            'data-primary': 'true',
            disabled: props.busy || value.trim() === '',
            onClick: submit,
          },
          props.busy ? MN.t('common.saving') : props.confirmLabel || MN.t('common.confirm'),
        ),
      ],
    },
    h(
      'div',
      { className: 'mn-field' },
      h('label', { className: 'mn-field-label' }, props.label),
      h('input', {
        ref: inputRef,
        className: 'mn-input',
        value,
        placeholder: props.placeholder || '',
        disabled: props.busy,
        maxLength: 140,
        onChange: (event) => setValue(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        },
      }),
    ),
    props.hint ? h('div', { className: 'mn-hint' }, props.hint) : null,
    props.error ? h('div', { className: 'mn-dialog-error' }, props.error) : null,
  );
};

/** 确认对话框（删除等破坏性操作）。 */
MN.ConfirmDialog = function ConfirmDialog(props) {
  return h(
    MN.Modal,
    {
      title: props.title,
      onClose: props.onCancel,
      busy: props.busy,
      footer: [
        h(
          'button',
          { key: 'cancel', type: 'button', className: 'mn-btn', disabled: props.busy, onClick: props.onCancel },
          MN.t('common.cancel'),
        ),
        h(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'mn-btn',
            'data-danger': props.danger === false ? undefined : 'true',
            disabled: props.busy,
            onClick: props.onConfirm,
          },
          props.busy ? MN.t('common.working') : props.confirmLabel || MN.t('common.delete'),
        ),
      ],
    },
    h('p', { className: 'mn-dialog-text' }, props.message),
    props.hint ? h('div', { className: 'mn-hint' }, props.hint) : null,
    props.error ? h('div', { className: 'mn-dialog-error' }, props.error) : null,
  );
};

/** 右键菜单；点击外部 / 滚动 / Escape 关闭。 */
MN.ContextMenu = function ContextMenu(props) {
  const menuRef = useRef(null);
  useEffect(() => {
    const onPointerDown = (event) => {
      const element = menuRef.current;
      if (element !== null && event.target instanceof Node && element.contains(event.target)) return;
      props.onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') props.onClose();
    };
    const onScroll = () => props.onClose();
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [props.onClose]);

  const items = (props.items || []).filter(Boolean);
  const width = 190;
  const height = items.length * 30 + 14;
  const left = Math.max(8, Math.min(props.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(props.y, window.innerHeight - height - 8));

  return h(
    'div',
    {
      ref: menuRef,
      className: 'mn-context',
      style: { left, top },
      role: 'menu',
      onMouseDown: (event) => event.stopPropagation(),
      onContextMenu: (event) => event.preventDefault(),
    },
    items.map((item, index) => {
      if (item.separator) return h('div', { key: 'sep-' + index, className: 'mn-context-sep' });
      if (item.heading) return h('div', { key: 'head-' + index, className: 'mn-context-label' }, item.heading);
      return h(
        'button',
        {
          key: item.id || 'item-' + index,
          type: 'button',
          role: 'menuitem',
          'data-danger': item.danger ? 'true' : undefined,
          onClick: (event) => {
            event.stopPropagation();
            props.onClose();
            item.onClick();
          },
        },
        item.icon ? h(MN.Icon, { name: item.icon, size: 14 }) : null,
        h('span', null, item.label),
      );
    }),
  );
};

/* ==================== src/client/35-tree.js ==================== */
/**
 * 左侧目录树与全文搜索结果列表。
 *
 * @module @local/markdown-notes/src/client/35-tree
 */

/** 树节点（目录可展开；笔记可收藏 / 打开 / 右键）。 */
MN.TreeNode = function TreeNode(props) {
  const node = props.node;
  const depth = props.depth || 0;
  const t = MN.t;
  const active = props.activePath === node.path;

  if (node.type === 'folder') {
    const open = props.expanded.has(node.path);
    return h(
      MN.React.Fragment,
      null,
      h(
        'div',
        {
          className: 'mn-row',
          style: { paddingLeft: 4 + depth * 14 },
          role: 'button',
          tabIndex: 0,
          draggable: true,
          'aria-expanded': open ? 'true' : 'false',
          'data-dragging': props.draggingPath === node.path ? 'true' : undefined,
          'data-drop-target': props.dropTarget === node.path ? 'true' : undefined,
          'data-drop-position':
            props.dropIndicator && props.dropIndicator.path === node.path ? props.dropIndicator.position : undefined,
          title: node.path,
          onClick: () => props.onToggle(node.path),
          onContextMenu: (event) => props.onMenu(event, node),
          onDragStart: (event) => props.onDragStart(event, node),
          onDragEnd: props.onDragEnd,
          onDragOver: (event) => props.onDragOver(event, node),
          onDragLeave: (event) => props.onDragLeave(event, node),
          onDrop: (event) => props.onDrop(event, node),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              props.onToggle(node.path);
            }
          },
        },
        h(
          'span',
          { className: 'mn-chevron', 'data-open': open ? 'true' : 'false' },
          h(MN.Icon, { name: 'chevron', size: 11, strokeWidth: 2 }),
        ),
        h('span', { className: 'mn-row-icon' }, h(MN.Icon, { name: open ? 'folder-open' : 'folder', size: 15 })),
        h('span', { className: 'mn-row-name' }, node.name),
        h(
          'span',
          { className: 'mn-row-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('tree.newNoteHere'),
              'aria-label': t('tree.newNoteHere'),
              onClick: (event) => {
                event.stopPropagation();
                props.onNewNote(node.path);
              },
            },
            h(MN.Icon, { name: 'plus', size: 13 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('tree.newFolderHere'),
              'aria-label': t('tree.newFolderHere'),
              onClick: (event) => {
                event.stopPropagation();
                props.onNewFolder(node.path);
              },
            },
            h(MN.Icon, { name: 'plus-folder', size: 13 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('common.more'),
              'aria-label': t('common.more'),
              onClick: (event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                props.onMenuAt(rect.left, rect.bottom + 4, node);
              },
            },
            h(MN.Icon, { name: 'more', size: 13 }),
          ),
        ),
      ),
      open
        ? h(
            'div',
            { className: 'mn-children' },
            node.children.length === 0
              ? h('div', { className: 'mn-empty-side' }, t('tree.emptyFolder'))
              : node.children.map((child) =>
                  h(MN.TreeNode, {
                    key: child.path,
                    node: child,
                    depth: depth + 1,
                    expanded: props.expanded,
                    activePath: props.activePath,
                    favorites: props.favorites,
                    onToggle: props.onToggle,
                    onOpen: props.onOpen,
                    onMenu: props.onMenu,
                    onMenuAt: props.onMenuAt,
                    onNewNote: props.onNewNote,
                    onNewFolder: props.onNewFolder,
                    onFavorite: props.onFavorite,
                    draggingPath: props.draggingPath,
                    dropTarget: props.dropTarget,
                    dropIndicator: props.dropIndicator,
                    onDragStart: props.onDragStart,
                    onDragEnd: props.onDragEnd,
                    onDragOver: props.onDragOver,
                    onDragLeave: props.onDragLeave,
                    onDrop: props.onDrop,
                  }),
                ),
          )
        : null,
    );
  }

  const favorite = props.favorites.has(node.path);
  return h(
    'div',
    {
      className: 'mn-row',
      style: { paddingLeft: 4 + depth * 14 },
      'data-active': active ? 'true' : 'false',
      'data-dragging': props.draggingPath === node.path ? 'true' : undefined,
      'data-drop-position':
        props.dropIndicator && props.dropIndicator.path === node.path ? props.dropIndicator.position : undefined,
      role: 'button',
      tabIndex: 0,
      draggable: true,
      title: node.path,
      onClick: () => props.onOpen(node.path),
      onContextMenu: (event) => props.onMenu(event, node),
      onDragStart: (event) => props.onDragStart(event, node),
      onDragEnd: props.onDragEnd,
      onDragOver: (event) => props.onDragOver(event, node),
      onDragLeave: (event) => props.onDragLeave(event, node),
      onDrop: (event) => props.onDrop(event, node),
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onOpen(node.path);
        }
      },
    },
    h('span', { className: 'mn-indent' }),
    h('span', { className: 'mn-row-icon' }, h(MN.Icon, { name: 'file', size: 14 })),
    h('span', { className: 'mn-row-name' }, node.name),
    favorite ? h('span', { className: 'mn-fav-mark' }, h(MN.Icon, { name: 'star-filled', size: 11 })) : null,
    h(
      'span',
      { className: 'mn-row-actions' },
      h(
        'button',
        {
          type: 'button',
          className: 'mn-iconbtn',
          'data-on': favorite ? 'true' : undefined,
          title: favorite ? t('common.unfavorite') : t('common.favorite'),
          'aria-label': favorite ? t('common.unfavorite') : t('common.favorite'),
          onClick: (event) => {
            event.stopPropagation();
            props.onFavorite(node.path, !favorite);
          },
        },
        h(MN.Icon, { name: favorite ? 'star-filled' : 'star', size: 13 }),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'mn-iconbtn',
          title: t('common.more'),
          'aria-label': t('common.more'),
          onClick: (event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            props.onMenuAt(rect.left, rect.bottom + 4, node);
          },
        },
        h(MN.Icon, { name: 'more', size: 13 }),
      ),
    ),
  );
};

/** 目录树主体：收藏区 + 全部笔记。 */
MN.TreeView = function TreeView(props) {
  const t = MN.t;
  const [draggingPath, setDraggingPath] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null);
  const favoriteNotes = useMemo(() => {
    const out = [];
    for (const path of props.favorites) {
      const node = MN.findNode(props.allTree, path);
      if (node && node.type === 'note') out.push(node);
    }
    return out;
  }, [props.favorites, props.allTree]);

  const canDropOn = (targetPath) => {
    if (!draggingPath || !targetPath) return false;
    if (targetPath === draggingPath) return false;
    if (MN.dirnameOf(draggingPath) === targetPath) return false;
    // 不能把文件夹拖进自身或它的子级目录。
    if (MN.isSameOrDescendant(targetPath, draggingPath)) return false;
    return true;
  };

  const handleDragStart = (event, node) => {
    if (event.target && typeof event.target.closest === 'function' && event.target.closest('button')) {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) return;
    setDraggingPath(node.path);
    setDropTarget(null);
    setDropIndicator(null);
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', node.path);
    } catch (error) {
      /* 某些环境禁止 setData，不影响内部状态 */
    }
  };

  const handleDragEnd = () => {
    setDraggingPath(null);
    setDropTarget(null);
    setDropIndicator(null);
  };

  /**
   * 同一目录内的行上 / 下缘用于排序；文件夹行中间区域用于「移动到该文件夹」。
   * 笔记行没有「移入」语义，整行都作为排序目标。
   */
  const reorderPositionAt = (event, node) => {
    if (!draggingPath || node.path === draggingPath) return null;
    const sourceParent = MN.dirnameOf(draggingPath);
    const targetParent = MN.dirnameOf(node.path);
    if (sourceParent !== targetParent) return null;
    const row = event.currentTarget;
    const rect = row && typeof row.getBoundingClientRect === 'function' ? row.getBoundingClientRect() : null;
    const ratio = rect && rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    if (node.type === 'folder') {
      if (ratio >= 0.3 && ratio <= 0.7) return null;
      return ratio < 0.5 ? 'before' : 'after';
    }
    return ratio < 0.5 ? 'before' : 'after';
  };

  const handleDragOver = (event, node) => {
    if (!draggingPath) return;
    const position = reorderPositionAt(event, node);
    if (position !== null) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setDropTarget(null);
      if (!dropIndicator || dropIndicator.path !== node.path || dropIndicator.position !== position) {
        setDropIndicator({ path: node.path, position });
      }
      return;
    }
    if (node.type === 'folder' && canDropOn(node.path)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setDropIndicator(null);
      if (dropTarget !== node.path) setDropTarget(node.path);
      return;
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    if (dropTarget === node.path) setDropTarget(null);
    if (dropIndicator && dropIndicator.path === node.path) setDropIndicator(null);
  };

  const handleDragLeave = (event, node) => {
    const related = event.relatedTarget;
    if (related && event.currentTarget && event.currentTarget.contains(related)) return;
    if (dropTarget === node.path) setDropTarget(null);
    if (dropIndicator && dropIndicator.path === node.path) setDropIndicator(null);
  };

  const handleDrop = (event, node) => {
    if (!draggingPath) return;
    const position = reorderPositionAt(event, node);
    const source = draggingPath;
    if (position !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraggingPath(null);
      setDropTarget(null);
      setDropIndicator(null);
      if (props.onReorder) props.onReorder(source, node.path, position);
      return;
    }
    if (node.type === 'folder' && canDropOn(node.path)) {
      event.preventDefault();
      event.stopPropagation();
      setDraggingPath(null);
      setDropTarget(null);
      setDropIndicator(null);
      if (props.onMove) props.onMove(source, node.path);
      return;
    }
    setDropTarget(null);
    setDropIndicator(null);
  };

  const rowProps = {
    expanded: props.expanded,
    activePath: props.activePath,
    favorites: props.favorites,
    onToggle: props.onToggle,
    onOpen: props.onOpen,
    onMenu: props.onMenu,
    onMenuAt: props.onMenuAt,
    onNewNote: props.onNewNote,
    onNewFolder: props.onNewFolder,
    onFavorite: props.onFavorite,
    draggingPath,
    dropTarget,
    dropIndicator,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  if (props.allTree.length === 0) {
    return h(
      'div',
      { className: 'mn-side-scroll' },
      h('div', { className: 'mn-empty-side' }, t('tree.noNotes'), h('br'), t('tree.noNotesHint')),
    );
  }

  return h(
    'div',
    { className: 'mn-side-scroll' },
    favoriteNotes.length > 0
      ? h(
          'div',
          { className: 'mn-section' },
          h(
            'div',
            { className: 'mn-section-head' },
            h(MN.Icon, { name: 'star-filled', size: 11 }),
            h('span', null, t('tree.favorites')),
            h('span', { className: 'mn-section-count' }, String(favoriteNotes.length)),
          ),
          favoriteNotes.map((node) =>
            h(MN.TreeNode, {
              key: 'fav-' + node.path,
              node,
              depth: 0,
              ...rowProps,
            }),
          ),
        )
      : null,
    h(
      'div',
      { className: 'mn-section' },
      h(
        'div',
        { className: 'mn-section-head' },
        h(MN.Icon, { name: 'book', size: 11 }),
        h('span', null, t('tree.allNotes')),
        h('span', { className: 'mn-section-count' }, String(props.noteCount)),
      ),
      props.tree.length === 0
        ? h('div', { className: 'mn-empty-side' }, t('tree.noMatch'))
        : props.tree.map((node) => h(MN.TreeNode, { key: node.path, node, depth: 0, ...rowProps })),
    ),
  );
};

/** 全文搜索结果列表。 */
MN.SearchResults = function SearchResults(props) {
  const t = MN.t;
  const result = props.result;
  return h(
    'div',
    { className: 'mn-side-scroll' },
    h(
      'div',
      { className: 'mn-section-head', style: { padding: '0 4px' } },
      h(MN.Icon, { name: 'search', size: 11 }),
      h('span', null, t('search.results')),
      h('span', { className: 'mn-section-count' }, String(result.total)),
      h(
        'button',
        {
          type: 'button',
          className: 'mn-iconbtn',
          style: { marginLeft: 4, width: 22, height: 22 },
          title: t('search.clear'),
          onClick: props.onClear,
        },
        h(MN.Icon, { name: 'close', size: 12 }),
      ),
    ),
    result.items.length === 0
      ? h('div', { className: 'mn-empty-side' }, t('search.empty'))
      : result.items.map((item) =>
          h(
            'div',
            {
              key: item.path,
              className: 'mn-row',
              style: { height: 'auto', alignItems: 'flex-start', padding: '6px 8px', flexDirection: 'column', gap: 2 },
              role: 'button',
              tabIndex: 0,
              title: item.path,
              onClick: () => props.onOpen(item.path),
              onKeyDown: (event) => {
                if (event.key === 'Enter') props.onOpen(item.path);
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 5, width: '100%', minWidth: 0 } },
              h('span', { className: 'mn-row-icon' }, h(MN.Icon, { name: 'file', size: 13 })),
              h('span', { className: 'mn-row-name' }, item.name),
            ),
            h('div', { style: { fontSize: '10.5px', opacity: 0.65, paddingLeft: 21, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.path),
            item.snippets.length > 0
              ? h(
                  'div',
                  { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', paddingLeft: 21, lineHeight: 1.55, wordBreak: 'break-word' } },
                  item.snippets.slice(0, 2).map((snippet, index) =>
                    h('div', { key: index, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, snippet.text),
                  ),
                )
              : null,
          ),
        ),
  );
};

/* ==================== src/client/40-editor.js ==================== */
/**
 * 编辑器组件：Markdown 原文（textarea）与渲染视图（contenteditable），两者都可直接编辑。
 *
 * 关键设计：
 * - 渲染视图自己维护 DOM，只在「外部内容变化且编辑器未聚焦」时重设 innerHTML，
 *   因此逐字输入时不会被打断光标；
 * - 每次输入都把 DOM 转回 Markdown 交给上层，上层统一做自动保存；
 * - 粘贴 / 拖入图片时先上传到 Host，再在光标处插入 <img>，最后回写 Markdown。
 *
 * @module @local/markdown-notes/src/client/40-editor
 */

/** 把光标放到元素末尾。 */
function placeCaretAtEnd(element) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 图片拖拽缩放的核心计算：等比宽度、限制在 48px .. maxWidth。
 * 右/下/右下三个把手分别吃水平、垂直、水平位移。
 */
MN.imageResizeWidth = function imageResizeWidth(startWidth, dx, dy, direction, ratio, maxWidth) {
  const hasEast = direction.indexOf('e') >= 0;
  const hasWest = direction.indexOf('w') >= 0;
  const hasSouth = direction.indexOf('s') >= 0;
  const hasNorth = direction.indexOf('n') >= 0;
  const horizontal = hasEast || hasWest;
  const dirX = hasEast ? 1 : hasWest ? -1 : 0;
  const dirY = hasSouth ? 1 : hasNorth ? -1 : 0;
  const delta = horizontal ? dx * dirX : dy * dirY * ratio;
  const next = startWidth + delta;
  return Math.round(Math.min(Math.max(48, maxWidth), Math.max(48, next)));
};

/** 读取当前选中的纯文本。 */
function selectedText() {
  const selection = window.getSelection();
  return selection ? String(selection.toString() || '') : '';
}

/** 原文 textarea 的字符偏移 → 1-based 行号 / 0-based 列号 / 该行文本。 */
MN.sourcePosition = function sourcePosition(value, offset) {
  const text = String(value === undefined || value === null ? '' : value);
  const safeOffset = Math.min(text.length, Math.max(0, Number(offset) || 0));
  const before = text.slice(0, safeOffset);
  const lines = text.split('\n');
  const line = before.split('\n').length;
  const lastBreak = before.lastIndexOf('\n');
  const column = safeOffset - (lastBreak + 1);
  return {
    line,
    column,
    lineText: lines[line - 1] === undefined ? '' : lines[line - 1],
  };
};

/** 1-based 行号 / 0-based 列号 → 原文 textarea 的字符偏移。 */
MN.sourceOffsetFromPosition = function sourceOffsetFromPosition(value, line, column) {
  const text = String(value === undefined || value === null ? '' : value);
  const lines = text.split('\n');
  const safeLine = Math.min(lines.length, Math.max(1, Number(line) || 1));
  let offset = 0;
  for (let index = 0; index < safeLine - 1; index += 1) offset += lines[index].length + 1;
  const lineText = lines[safeLine - 1] || '';
  return Math.min(text.length, offset + Math.min(lineText.length, Math.max(0, Number(column) || 0)));
};

/* ------------------------------------------------------------------ */
/* 精确字符定位：Markdown 源码字符 ↔ 渲染 DOM 字符                       */
/* ------------------------------------------------------------------ */

/** 渲染块中会开启新文本行的元素（用于把渲染内容拆成“行段”）。 */
const SEGMENT_BREAK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
  'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

/**
 * 把一行 Markdown 变成「源码字符序列」，并剔除不产生可见文本的语法：
 * 图片、链接 URL、自动链接尖括号、白名单行内标签、块级标记（# / > / - / 1. / 任务框）。
 * 返回的每个字符都带原始源码偏移，供后续与渲染文本做字符级对齐。
 */
MN.sourceLineSkeleton = function sourceLineSkeleton(lineText, lineStartOffset, stripMarkers) {
  const text = String(lineText === undefined || lineText === null ? '' : lineText);
  const length = text.length;
  const base = Number(lineStartOffset) || 0;
  const removed = new Array(length).fill(false);
  const markRemove = (start, end) => {
    const from = Math.max(0, start);
    const to = Math.min(length, end);
    for (let index = from; index < to; index += 1) removed[index] = true;
  };

  // 图片在渲染结果中没有文字，整段剔除。
  text.replace(/!\[[^\]]*\]\([^)]*\)/g, (match, offset) => {
    markRemove(offset, offset + match.length);
    return match;
  });
  // 链接保留可见的 label，剔除 [ 与 ](url)。
  text.replace(/\[([^\]]*)\]\([^)]*\)/g, (match, label, offset) => {
    markRemove(offset, offset + 1);
    markRemove(offset + 1 + label.length, offset + match.length);
    return match;
  });
  // 自动链接只保留 URL 文本，去掉尖括号。
  text.replace(/<(https?:\/\/[^\s>]+)>/g, (match, url, offset) => {
    markRemove(offset, offset + 1);
    markRemove(offset + match.length - 1, offset + match.length);
    return match;
  });
  // 白名单行内标签本身不显示。
  text.replace(/<\/?(?:u|mark|sub|sup|kbd|br)\s*\/?>/gi, (match, offset) => {
    markRemove(offset, offset + match.length);
    return match;
  });

  if (stripMarkers !== false) {
    let cursor = 0;
    // 只剥离真正的块级容器前缀：先连续引用标记，再最多一个标题/列表标记。
    // 列表项内容里以 ">" 或 "#" 开头的字符属于正文，不能被当成标记剥掉。
    for (let depth = 0; depth < 8; depth += 1) {
      const rest = text.slice(cursor);
      const quote = /^\s*>\s?/.exec(rest);
      if (!quote) break;
      markRemove(cursor, cursor + quote[0].length);
      cursor += quote[0].length;
    }
    const container = /^\s*(?:#{1,6}\s+|(?:[-*+]|\d{1,9}[.)])\s+)/.exec(text.slice(cursor));
    if (container) markRemove(cursor, cursor + container[0].length);
    const headingTail = /\s+#+\s*$/.exec(text);
    if (headingTail) markRemove(headingTail.index, length);
  }

  const chars = [];
  for (let index = 0; index < length; index += 1) {
    if (!removed[index]) chars.push({ char: text[index], offset: base + index });
  }
  return {
    chars,
    text: chars.map((entry) => entry.char).join(''),
  };
};

/**
 * 贪心对齐：渲染文本是源码骨架去掉 Markdown 标记后的结果，因此逐字符向后扫描，
 * 为每个渲染字符找到对应的源码字符索引（返回 skeleton 下标数组，-1 表示找不到）。
 */
MN.alignRenderedText = function alignRenderedText(skeleton, renderedText) {
  const chars = skeleton && Array.isArray(skeleton.chars) ? skeleton.chars : [];
  const rendered = String(renderedText === undefined || renderedText === null ? '' : renderedText);
  const mapping = new Array(rendered.length).fill(-1);
  let cursor = 0;
  for (let index = 0; index < rendered.length; index += 1) {
    const target = rendered[index];
    while (cursor < chars.length && chars[cursor].char !== target) cursor += 1;
    if (cursor >= chars.length) break;
    mapping[index] = cursor;
    cursor += 1;
  }
  return mapping;
};

/** 把渲染块拆成可见行段；每段保存文本与“渲染字符 → DOM 文本节点偏移”的映射。 */
function collectRenderedSegments(block) {
  const segments = [];
  let current = { text: '', parts: [] };
  const flush = (preserveEmpty) => {
    if (preserveEmpty === true || current.text !== '' || current.parts.length > 0) segments.push(current);
    current = { text: '', parts: [] };
  };
  const appendText = (node, start, end) => {
    if (end <= start) return;
    const value = node.nodeValue || '';
    const partStart = current.text.length;
    current.text += value.slice(start, end);
    current.parts.push({ node, start, end, partStart });
  };
  const walk = (node) => {
    if (node.nodeType === 3) {
      const value = node.nodeValue || '';
      // 块与块之间由 renderer 用换行分隔，这类纯空白的格式化文本节点
      // 不是源码行，不能当空行段，否则会让 blockquote / 表格后的行号整体错位。
      // 注意：代码高亮会把代码拆成多个 span，span 之间的空格 / 换行是真实代码，
      // 必须保留；纯空格（不含换行）也是行内格式之间的有效文本。
      if (value.trim() === '') {
        let inCode = false;
        let current = node.parentElement;
        while (current) {
          const parentTag = current.tagName ? String(current.tagName).toUpperCase() : '';
          if (parentTag === 'PRE' || parentTag === 'CODE') {
            inCode = true;
            break;
          }
          if (current === block) break;
          current = current.parentElement;
        }
        if (!inCode && value.indexOf('\n') !== -1) return;
      }
      let start = 0;
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] === '\n') {
          appendText(node, start, index);
          flush(true);
          start = index + 1;
        }
      }
      appendText(node, start, value.length);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      // 源码里直接写的 <br> 不算新源码行：保持行段连续，字符偏移才能保持对齐。
      if (node.classList && node.classList.contains('mn-raw-br')) return;
      flush(true);
      return;
    }
    if (node !== block && SEGMENT_BREAK_TAGS.has(tag)) {
      flush(false);
      for (const child of node.childNodes) walk(child);
      flush(false);
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  for (const child of block.childNodes) walk(child);
  flush(false);
  return segments;
}

/** 渲染行段内的字符下标 → DOM 文本节点 + 偏移。 */
function renderedPositionAt(segment, index) {
  if (!segment || segment.parts.length === 0) return null;
  const target = Math.max(0, Math.min(segment.text.length, Number(index) || 0));
  for (const part of segment.parts) {
    const partLength = part.end - part.start;
    if (target <= part.partStart + partLength) {
      return { node: part.node, offset: part.start + Math.max(0, target - part.partStart) };
    }
  }
  const last = segment.parts[segment.parts.length - 1];
  return { node: last.node, offset: last.end };
}

/**
 * 当 Selection 落在元素节点（而不是文本节点）上时，用 comparePoint 找到
 * 光标之后最近的文本字符，避免整个映射退回粗糙的行比例估算。
 */
function renderedIndexForRange(segments, range) {
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    for (const part of segment.parts) {
      let comparison = 1;
      try {
        comparison = typeof range.comparePoint === 'function' ? range.comparePoint(part.node, part.start) : 1;
      } catch (error) {
        comparison = 1;
      }
      if (comparison >= 0) return { segmentIndex, renderedIndex: part.partStart };
    }
  }
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  return { segmentIndex: segments.length - 1, renderedIndex: last.text.length };
}

/** 找到行号对应的渲染块（data-line / data-line-end）。 */
function findPreviewBlockForLine(preview, line) {
  const blocks = preview.querySelectorAll('[data-line]');
  let target = null;
  for (const block of blocks) {
    const start = Number.parseInt(block.getAttribute('data-line'), 10);
    if (!Number.isFinite(start)) continue;
    const end = Number.parseInt(block.getAttribute('data-line-end'), 10) || start;
    if (start <= line) target = { block, start, end };
    if (line >= start && line <= end) return { block, start, end };
    if (start > line) break;
  }
  return target;
}

/** 去掉块级标记后的可见文本（空行返回空串）。 */
function visibleSourceLine(lineText) {
  return String(lineText || '')
    .replace(/^\s*(?:>\s?|#{1,6}\s+|(?:[-*+]|\d{1,9}[.)])\s+)/, '')
    .replace(/\s*#+\s*$/, '')
    .trim();
}

/**
 * 源码块内的可见行列表（用于把“第几行”映射到“第几个渲染行段”）。
 * fenced code 会剔除首尾围栏行；表格等复杂块返回空，让调用方退回几何近似。
 */
function sourceBlockEntries(value, startLine, endLine, block, blockType) {
  if (block && block.classList && block.classList.contains('mn-table-wrap')) return [];
  if (blockType === 'table' || blockType === 'hr') return [];
  const lines = String(value === undefined || value === null ? '' : value).split('\n');
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  let from = Math.max(0, startLine - 1);
  let to = Math.min(lines.length - 1, endLine - 1);
  if (to < from) return [];
  if (blockType === 'pre') {
    if (/^\s*(```|~~~)/.test(lines[from] || '')) from += 1;
    if (from <= to && /^\s*(```|~~~)/.test(lines[to] || '')) to -= 1;
    const entries = [];
    for (let index = from; index <= to; index += 1) {
      entries.push({ lineNumber: index + 1, lineText: lines[index] || '', lineStartOffset: offsets[index] });
    }
    return entries;
  }
  const entries = [];
  for (let index = from; index <= to; index += 1) {
    const lineText = lines[index] || '';
    if (visibleSourceLine(lineText) === '') continue;
    entries.push({ lineNumber: index + 1, lineText, lineStartOffset: offsets[index] });
  }
  return entries;
}

/** 收集单元格里的可见文本与 DOM 文本节点映射（忽略 <br> 标签本身）。 */
function collectCellContent(cell) {
  let text = '';
  const parts = [];
  const append = (node, start, end) => {
    if (end <= start) return;
    const value = node.nodeValue || '';
    const partStart = text.length;
    text += value.slice(start, end);
    parts.push({ node, start, end, partStart });
  };
  const walk = (node) => {
    if (node.nodeType === 3) {
      append(node, 0, (node.nodeValue || '').length);
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName.toLowerCase() === 'br') return;
    for (const child of node.childNodes) walk(child);
  };
  for (const child of cell.childNodes) walk(child);
  return { element: cell, text, parts };
}

/** 把渲染表格拆成行/单元格，保留 tr 与单元格元素以便反向定位。 */
function collectTableRows(wrapper) {
  const table =
    wrapper && wrapper.tagName && wrapper.tagName.toLowerCase() === 'table'
      ? wrapper
      : wrapper && typeof wrapper.querySelector === 'function'
        ? wrapper.querySelector('table')
        : null;
  if (!table) return [];
  const rows = [];
  for (const tr of table.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of tr.children) {
      if (/^(td|th)$/i.test(cell.tagName)) cells.push(collectCellContent(cell));
    }
    if (cells.length === 0) continue;
    rows.push({ tr, header: Boolean(tr.closest && tr.closest('thead')), cells });
  }
  return rows;
}

/** 按渲染器同样的规则解析一行表格：去首尾空白与首尾竖线，再按 | 切分。 */
function parseTableLineCells(lineText, lineStartOffset) {
  const raw = String(lineText || '');
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (trimmed === '') return [];
  const base = (Number(lineStartOffset) || 0) + leading;
  let inner = trimmed;
  let innerBase = base;
  if (inner.startsWith('|')) {
    inner = inner.slice(1);
    innerBase += 1;
  }
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  const cells = [];
  let cursor = 0;
  for (const rawCell of inner.split('|')) {
    const left = rawCell.length - rawCell.trimStart().length;
    cells.push({ text: rawCell.trim(), startOffset: innerBase + cursor + left });
    cursor += rawCell.length + 1;
  }
  return cells;
}

/** 源码表格的行列表：表头 + 数据行（跳过分隔行），并带每格的绝对字符偏移。 */
function sourceTableRows(value, startLine, endLine) {
  const lines = String(value === undefined || value === null ? '' : value).split('\n');
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const headerIndex = startLine - 1;
  if (headerIndex < 0 || headerIndex >= lines.length) return [];
  const rows = [
    {
      lineNumber: startLine,
      lineStartOffset: offsets[headerIndex],
      cells: parseTableLineCells(lines[headerIndex], offsets[headerIndex]),
    },
  ];
  for (let index = headerIndex + 2; index <= Math.min(lines.length - 1, endLine - 1); index += 1) {
    const cells = parseTableLineCells(lines[index], offsets[index]);
    if (cells.length === 0) continue;
    rows.push({ lineNumber: index + 1, lineStartOffset: offsets[index], cells });
  }
  return rows;
}

/** 表格内的原文位置 → 渲染光标矩形。 */
function tablePreviewCaretRect(preview, wrapper, value, offset) {
  const start = Number.parseInt(wrapper.getAttribute('data-line'), 10);
  const end = Number.parseInt(wrapper.getAttribute('data-line-end'), 10) || start;
  const position = MN.sourcePosition(value, offset);
  const rows = sourceTableRows(value, start, end);
  const rowIndex = rows.findIndex((row) => row.lineNumber === position.line);
  if (rowIndex < 0) return null;
  const row = rows[rowIndex];
  let cellIndex = row.cells.findIndex((cell) => offset >= cell.startOffset && offset <= cell.startOffset + cell.text.length);
  if (cellIndex < 0) {
    cellIndex = row.cells.findIndex((cell) => offset < cell.startOffset);
    if (cellIndex < 0) cellIndex = row.cells.length - 1;
  }
  const renderedRows = collectTableRows(wrapper);
  const renderedRow = renderedRows[Math.min(renderedRows.length - 1, rowIndex)];
  if (!renderedRow) return null;
  const sourceCell = row.cells[cellIndex];
  const renderedCell = renderedRow.cells[Math.min(renderedRow.cells.length - 1, cellIndex)];
  if (!sourceCell || !renderedCell) return null;
  const skeleton = MN.sourceLineSkeleton(sourceCell.text, sourceCell.startOffset, false);
  const mapping = MN.alignRenderedText(skeleton, renderedCell.text);
  if (!mapping.some((value) => value >= 0)) return null;
  let renderedIndex = renderedCell.text.length;
  for (let index = 0; index < mapping.length; index += 1) {
    const skeletonIndex = mapping[index];
    if (skeletonIndex >= 0 && skeleton.chars[skeletonIndex].offset >= offset) {
      renderedIndex = index;
      break;
    }
  }
  const domPosition = renderedPositionAt({ text: renderedCell.text, parts: renderedCell.parts }, renderedIndex);
  if (!domPosition) return null;
  try {
    const range = document.createRange();
    range.setStart(domPosition.node, domPosition.offset);
    range.collapse(true);
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width < 1 && rect.height < 1)) {
      const rects = range.getClientRects();
      rect = rects && rects.length > 0 ? rects[0] : null;
    }
    if (!rect) return null;
    const style = window.getComputedStyle(sourceCell.element || wrapper);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    return { left: rect.left, top: rect.top, height: rect.height > 1 ? rect.height : lineHeight };
  } catch (error) {
    return null;
  }
}

/** 表格内的渲染 Selection → 原文位置。 */
function tableSelectionToPosition(wrapper, range, value) {
  const container = range.startContainer;
  const element = container.nodeType === 1 ? container : container.parentElement;
  const cell = element && typeof element.closest === 'function' ? element.closest('td,th') : null;
  if (!cell) return null;
  const tr = cell.closest('tr');
  if (!tr) return null;
  const renderedRows = collectTableRows(wrapper);
  const rowIndex = renderedRows.findIndex((row) => row.tr === tr);
  if (rowIndex < 0) return null;
  const cellIndex = Array.from(tr.children).filter((child) => /^(td|th)$/i.test(child.tagName)).indexOf(cell);
  if (cellIndex < 0) return null;
  const start = Number.parseInt(wrapper.getAttribute('data-line'), 10);
  const end = Number.parseInt(wrapper.getAttribute('data-line-end'), 10) || start;
  const rows = sourceTableRows(value, start, end);
  const sourceRow = rows[rowIndex];
  const renderedCell = renderedRows[rowIndex].cells[cellIndex];
  if (!sourceRow || !renderedCell) return null;
  const sourceCell = sourceRow.cells[Math.min(cellIndex, sourceRow.cells.length - 1)];
  if (!sourceCell) return null;
  let renderedIndex = -1;
  for (const part of renderedCell.parts) {
    if (part.node === container && range.startOffset >= part.start && range.startOffset <= part.end) {
      const relative = range.startOffset - part.start;
      renderedIndex = part.partStart + Math.max(0, Math.min(part.end - part.start, relative));
      break;
    }
  }
  if (renderedIndex < 0) return null;
  if (renderedIndex >= renderedCell.text.length) {
    return MN.sourcePosition(value, sourceCell.startOffset + sourceCell.text.length);
  }
  const skeleton = MN.sourceLineSkeleton(sourceCell.text, sourceCell.startOffset, false);
  const mapping = MN.alignRenderedText(skeleton, renderedCell.text);
  const directIndex = Math.min(renderedIndex, Math.max(0, mapping.length - 1));
  if (mapping.length > 0 && mapping[directIndex] >= 0) {
    return MN.sourcePosition(value, skeleton.chars[mapping[directIndex]].offset);
  }
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < mapping.length; index += 1) {
    if (mapping[index] < 0) continue;
    const distance = Math.abs(index - renderedIndex);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  if (best < 0) return null;
  return MN.sourcePosition(value, skeleton.chars[mapping[best]].offset);
}

/** 旧版几何近似：按块内行数比例放光标，作为字符对齐失败时的兜底。 */
function geometricPreviewCaretRect(preview, line, column, lineLength) {
  if (!preview) return null;
  const found = findPreviewBlockForLine(preview, line);
  if (!found) return null;
  const rect = found.block.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const lineCount = Math.max(1, found.end - found.start + 1);
  const lineOffset = Math.min(lineCount - 1, Math.max(0, line - found.start));
  const lineHeight = Math.max(14, Math.min(30, rect.height / lineCount));
  const fraction = lineLength > 0 ? Math.min(1, Math.max(0, column / lineLength)) : 0;
  return {
    left: rect.left + 2 + fraction * Math.max(1, rect.width - 4),
    top: rect.top + lineOffset * lineHeight,
    height: lineHeight,
  };
}

/**
 * 原文位置 → 渲染视图中的光标矩形（viewport 坐标）。
 * 新签名：previewCaretRect(preview, value, offset)；旧签名仍保留给单测/兜底。
 * 通过 data-line 找到内容块，再把源码行与渲染行段做字符级对齐，
 * 因而 **格式标记之外的每个字符** 都能落到对应 DOM 文本位置。
 */
MN.previewCaretRect = function previewCaretRect(preview, valueOrLine, offsetOrColumn, maybeLineLength) {
  if (typeof valueOrLine === 'number') {
    return geometricPreviewCaretRect(preview, valueOrLine, offsetOrColumn, maybeLineLength);
  }
  if (!preview) return null;
  const value = String(valueOrLine === undefined || valueOrLine === null ? '' : valueOrLine);
  const offset = Math.max(0, Math.min(value.length, Number(offsetOrColumn) || 0));
  const position = MN.sourcePosition(value, offset);
  const found = findPreviewBlockForLine(preview, position.line);
  if (!found) return null;
  if (found.block.classList && found.block.classList.contains('mn-table-wrap')) {
    const tableRect = tablePreviewCaretRect(preview, found.block, value, offset);
    return tableRect || geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
  }
  const blockType = found.block.tagName.toLowerCase();
  const entries = sourceBlockEntries(value, found.start, found.end, found.block, blockType);
  const segments = collectRenderedSegments(found.block);
  if (entries.length === 0 || segments.length === 0) {
    return geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
  }
  const entryIndex = entries.findIndex((entry) => entry.lineNumber === position.line);
  if (entryIndex < 0) {
    return geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
  }
  const entry = entries[entryIndex];
  const segment = segments[Math.min(segments.length - 1, entryIndex)];
  if (!segment) return null;
  const skeleton = MN.sourceLineSkeleton(entry.lineText, entry.lineStartOffset, blockType !== 'pre');
  const mapping = MN.alignRenderedText(skeleton, segment.text);
  if (!mapping.some((value) => value >= 0)) {
    return geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
  }
  let renderedIndex = segment.text.length;
  for (let index = 0; index < mapping.length; index += 1) {
    const skeletonIndex = mapping[index];
    if (skeletonIndex >= 0 && skeleton.chars[skeletonIndex].offset >= offset) {
      renderedIndex = index;
      break;
    }
  }
  const domPosition = renderedPositionAt(segment, renderedIndex);
  if (!domPosition) {
    return geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
  }
  try {
    const range = document.createRange();
    range.setStart(domPosition.node, domPosition.offset);
    range.collapse(true);
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width < 1 && rect.height < 1)) {
      const rects = range.getClientRects();
      rect = rects && rects.length > 0 ? rects[0] : null;
    }
    if (!rect) {
      return geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
    }
    const style = window.getComputedStyle(found.block);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    return {
      left: rect.left,
      top: rect.top,
      height: rect.height > 1 ? rect.height : lineHeight,
    };
  } catch (error) {
    return geometricPreviewCaretRect(preview, position.line, position.column, position.lineText.length);
  }
};

/** 旧版几何近似：从渲染 Selection 的矩形反推行/列。 */
function geometricPreviewSelection(preview, value) {
  if (!preview) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const container = range.startContainer;
  if (!preview.contains(container)) return null;
  const element = container.nodeType === 1 ? container : container.parentElement;
  const block = element && typeof element.closest === 'function' ? element.closest('[data-line]') : null;
  if (!block || !preview.contains(block)) return null;
  const start = Number.parseInt(block.getAttribute('data-line'), 10);
  const end = Number.parseInt(block.getAttribute('data-line-end'), 10) || start;
  if (!Number.isFinite(start)) return null;
  let caretRect = range.getBoundingClientRect();
  if (!caretRect || (caretRect.width < 1 && caretRect.height < 1)) {
    const rects = range.getClientRects();
    caretRect = rects && rects.length > 0 ? rects[0] : null;
  }
  const blockRect = block.getBoundingClientRect();
  if (!caretRect || blockRect.height < 1) return null;
  const lineCount = Math.max(1, end - start + 1);
  const vertical = Math.min(1, Math.max(0, (caretRect.top - blockRect.top) / blockRect.height));
  const lineOffset = Math.min(lineCount - 1, Math.floor(vertical * lineCount));
  const line = Math.min(end, start + lineOffset);
  const lines = String(value === undefined || value === null ? '' : value).split('\n');
  const lineText = lines[line - 1] === undefined ? '' : lines[line - 1];
  const horizontal = Math.min(1, Math.max(0, (caretRect.left - blockRect.left) / Math.max(1, blockRect.width)));
  const column = Math.min(lineText.length, Math.round(horizontal * lineText.length));
  return { line, column };
}

/**
 * 渲染视图中的 DOM Selection → 原文行 / 列。
 * 优先用文本节点偏移与源码骨架的字符级对齐；失败时才用几何比例兜底。
 */
MN.previewSelectionToPosition = function previewSelectionToPosition(preview, value) {
  if (!preview) return null;
  const text = String(value === undefined || value === null ? '' : value);
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const container = range.startContainer;
  if (!preview.contains(container)) return null;
  const element = container.nodeType === 1 ? container : container.parentElement;
  const block = element && typeof element.closest === 'function' ? element.closest('[data-line]') : null;
  if (!block || !preview.contains(block)) return null;
  const start = Number.parseInt(block.getAttribute('data-line'), 10);
  const end = Number.parseInt(block.getAttribute('data-line-end'), 10) || start;
  if (!Number.isFinite(start)) return null;
  if (block.classList && block.classList.contains('mn-table-wrap')) {
    const tablePosition = tableSelectionToPosition(block, range, text);
    if (tablePosition) return tablePosition;
  }
  const blockType = block.tagName.toLowerCase();
  const entries = sourceBlockEntries(text, start, end, block, blockType);
  const segments = collectRenderedSegments(block);
  if (entries.length === 0 || segments.length === 0) return geometricPreviewSelection(preview, text);

  let segmentIndex = -1;
  let renderedIndex = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    for (const part of segment.parts) {
      if (part.node === container && range.startOffset >= part.start && range.startOffset <= part.end) {
        const relative = range.startOffset - part.start;
        renderedIndex = part.partStart + Math.max(0, Math.min(part.end - part.start, relative));
        segmentIndex = index;
        break;
      }
    }
    if (segmentIndex >= 0) break;
  }
  if (segmentIndex < 0) {
    const located = renderedIndexForRange(segments, range);
    if (!located) return geometricPreviewSelection(preview, text);
    segmentIndex = located.segmentIndex;
    renderedIndex = located.renderedIndex;
  }

  const entry = entries[Math.min(entries.length - 1, segmentIndex)];
  if (!entry) return geometricPreviewSelection(preview, text);
  const segment = segments[Math.min(segments.length - 1, segmentIndex)];
  const skeleton = MN.sourceLineSkeleton(entry.lineText, entry.lineStartOffset, blockType !== 'pre');
  const mapping = MN.alignRenderedText(skeleton, segment.text);
  let sourceOffset = null;
  if (renderedIndex >= segment.text.length) {
    // 渲染行末尾：对应到源码该行末尾（允许跳过后面的格式标记）。
    sourceOffset = entry.lineStartOffset + entry.lineText.length;
  } else {
    const directIndex = Math.min(renderedIndex, Math.max(0, mapping.length - 1));
    if (mapping.length > 0 && mapping[directIndex] >= 0) {
      sourceOffset = skeleton.chars[mapping[directIndex]].offset;
    } else {
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < mapping.length; index += 1) {
        if (mapping[index] < 0) continue;
        const distance = Math.abs(index - renderedIndex);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
      if (best >= 0) sourceOffset = skeleton.chars[mapping[best]].offset;
    }
  }
  if (sourceOffset === null) return geometricPreviewSelection(preview, text);
  return MN.sourcePosition(text, sourceOffset);
};

/**
 * 原文 textarea 中某个字符偏移对应的光标矩形（viewport 坐标）。
 * 用隐藏的 mirror 元素复刻 textarea 的排版；mirror 缺失时退化为近似估算。
 */
MN.measureSourceCaret = function measureSourceCaret(textarea, mirror, offset) {
  if (!textarea) return null;
  const style = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight) || 22.75;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const textareaRect = textarea.getBoundingClientRect();
  if (mirror) {
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.tabSize = style.tabSize;
    mirror.style.width = textarea.clientWidth + 'px';
    mirror.style.padding = style.padding;
    mirror.style.boxSizing = 'border-box';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.wordBreak = 'break-word';
    mirror.textContent = String(textarea.value || '').slice(0, Math.max(0, Number(offset) || 0));
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    marker.style.display = 'inline-block';
    marker.style.width = '0';
    marker.style.height = lineHeight + 'px';
    mirror.appendChild(marker);
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    return {
      left: textareaRect.left + (markerRect.left - mirrorRect.left),
      top: textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop,
      height: lineHeight,
    };
  }
  const position = MN.sourcePosition(textarea.value, offset);
  return {
    left: textareaRect.left + paddingLeft + position.column * 8,
    top: textareaRect.top + paddingTop + (position.line - 1) * lineHeight - textarea.scrollTop,
    height: lineHeight,
  };
};

/** 判断光标矩形是否落在某个滚动容器的可见区域内。 */
MN.caretVisibleIn = function caretVisibleIn(rect, element) {
  if (!rect || !element) return false;
  const view = element.getBoundingClientRect();
  const viewRight = typeof view.right === 'number' ? view.right : view.left + view.width;
  const viewBottom = typeof view.bottom === 'number' ? view.bottom : view.top + view.height;
  if (rect.top + rect.height <= view.top + 2) return false;
  if (rect.top >= viewBottom - 2) return false;
  return rect.left >= view.left - 4 && rect.left <= viewRight + 4;
};

/** Markdown 原文编辑器。 */
/** 在原文指定空行处插入 Markdown 块，返回新源码与块起始行号。 */
function insertBlockAtSourceLine(markdown, lineIndex, snippet) {
  const lines = String(markdown === undefined || markdown === null ? '' : markdown).split('\n');
  const at = Math.max(0, Math.min(lines.length - 1, Number(lineIndex) || 0));
  const before = lines.slice(0, at);
  const after = lines.slice(at + 1);
  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  while (after.length > 0 && after[0].trim() === '') after.shift();
  const result = before.slice();
  if (result.length > 0) result.push('');
  const line = result.length + 1;
  result.push(...String(snippet || '').split('\n'));
  if (after.length > 0) {
    result.push('');
    result.push(...after);
  }
  return { markdown: result.join('\n'), line };
}

/** 1-based 行号 → 该行在源码中的起始字符偏移。 */
function sourceLineStartOffset(markdown, lineNumber) {
  const lines = String(markdown === undefined || markdown === null ? '' : markdown).split('\n');
  let offset = 0;
  for (let index = 0; index < Math.max(0, Number(lineNumber) - 1); index += 1) {
    offset += (lines[index] || '').length + 1;
  }
  return offset;
}

/** 原文行触发字符：仅当整行（忽略行首缩进）就是 `/` 或 `、`。 */
function sourceSlashTrigger(lineText) {
  const candidate = String(lineText === undefined || lineText === null ? '' : lineText).replace(/^[ \t]*/, '');
  return candidate === '/' || candidate === '、' ? candidate : null;
}

/** 供测试与原文视图共用：在指定空行插入 Markdown 块。 */
MN.slashInsertSourceMarkdown = function slashInsertSourceMarkdown(markdown, lineIndex, snippet) {
  return insertBlockAtSourceLine(markdown, lineIndex, snippet);
};
MN.sourceSlashTrigger = sourceSlashTrigger;

/** 供测试与渲染视图共用：修改指定围栏行（1-based）的代码语言，返回新源码。 */
MN.setCodeFenceLanguage = function setCodeFenceLanguage(markdown, line, language) {
  const text = String(markdown === undefined || markdown === null ? '' : markdown);
  const lines = text.split('\n');
  const index = Math.max(0, Number(line) - 1);
  const lineText = lines[index] === undefined ? '' : lines[index];
  const match = /^(\s*)(`{3,}|~{3,})\s*[\w+#.-]*\s*$/.exec(lineText);
  if (!match) return { markdown: text, changed: false };
  const value = String(language === undefined || language === null ? '' : language).trim();
  const nextLine = match[1] + match[2] + (value === 'text' ? '' : value);
  if (nextLine === lineText) return { markdown: text, changed: false };
  lines[index] = nextLine;
  return { markdown: lines.join('\n'), changed: true };
};

MN.SourceEditor = function SourceEditor(props) {
  const textareaRef = props.textareaRef;
  const [slashMenu, setSlashMenu] = useState(null);
  const sourceMenuRef = useRef(null);

  const closeSlashMenu = () => setSlashMenu(null);

  /** 当前空行 / 首字符触发行的触发字符。 */
  const findSourceTrigger = (textarea) => {
    if (!textarea) return null;
    const value = String(textarea.value || '');
    const caret = textarea.selectionStart;
    if (caret === null || caret === undefined || caret !== textarea.selectionEnd) return null;
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const lineBreak = value.indexOf('\n', caret);
    const lineEnd = lineBreak < 0 ? value.length : lineBreak;
    const lineText = value.slice(lineStart, lineEnd);
    const trigger = sourceSlashTrigger(lineText);
    if (trigger) {
      return { trigger, line: value.slice(0, caret).split('\n').length - 1 };
    }
    return null;
  };

  /** 字符已经真实输入；菜单只是可选项。 */
  const detectSlashInput = (event) => {
    const textarea = (event && event.currentTarget) || (textareaRef && textareaRef.current);
    if (!textarea) return;
    const found = findSourceTrigger(textarea);
    if (found) {
      if (!slashMenu || slashMenu.trigger !== found.trigger) openSlashMenu(event, found.trigger);
      return;
    }
    if (slashMenu) closeSlashMenu();
  };

  const openSlashMenu = (event, trigger) => {
    const textarea = (event && event.currentTarget) || (textareaRef && textareaRef.current);
    if (!textarea) return false;
    const value = String(textarea.value || '');
    const caret = textarea.selectionStart;
    if (caret === null || caret === undefined || caret !== textarea.selectionEnd) return false;
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const lineBreak = value.indexOf('\n', caret);
    const lineEnd = lineBreak < 0 ? value.length : lineBreak;
    const lineText = value.slice(lineStart, lineEnd);
    const lineTrigger = sourceSlashTrigger(lineText);
    if (trigger) {
      if (lineTrigger !== trigger) return false;
    } else if (lineText.trim() !== '') {
      return false;
    }
    const position = MN.sourcePosition(value, caret);
    const mirror = props.mirrorRef && props.mirrorRef.current;
    let caretRect = null;
    try {
      caretRect = MN.measureSourceCaret(textarea, mirror, caret);
    } catch (error) {
      caretRect = null;
    }
    if (!caretRect) {
      const area = textarea.getBoundingClientRect();
      caretRect = { left: area.left + 12, top: area.top + 8, height: 20 };
    }
    const width = 286;
    const height = 360;
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const left = Math.max(8, Math.min(caretRect.left, viewportWidth - width - 8));
    const top = Math.max(8, Math.min(caretRect.top + (caretRect.height || 20) + 6, viewportHeight - height - 8));
    setSlashMenu({ left, top, index: 0, line: position.line - 1, trigger });
    return true;
  };

  const applySlashItem = (item) => {
    const menu = slashMenu;
    if (!menu) return;
    setSlashMenu(null);
    const textarea = textareaRef && textareaRef.current;
    if (!item) return;
    if (item.snippet === '') {
      if (textarea) textarea.focus();
      return;
    }
    // 用 textarea 当前值：触发字符已经写入，insertBlockAtSourceLine 会整行替换掉它。
    const current = textarea ? textarea.value : props.value;
    const result = MN.slashInsertSourceMarkdown(current, menu.line, item.snippet);
    const lineOffset = sourceLineStartOffset(result.markdown, result.line);
    let innerOffset = String(item.snippet).split('\n')[0].length;
    if (item.id === 'code') innerOffset += 1;
    else if (item.id === 'table') innerOffset = 2;
    else if (item.id === 'divider') innerOffset = String(item.snippet).length;
    props.onChange(result.markdown);
    window.requestAnimationFrame(() => {
      const element = textareaRef && textareaRef.current;
      if (!element) return;
      element.focus();
      try {
        const target = lineOffset + innerOffset;
        element.setSelectionRange(target, target);
        if (props.onCaretChange) props.onCaretChange();
      } catch (error) {
        /* 选区恢复失败不影响插入 */
      }
    });
  };

  const handleSlashMenuKeyDown = (event) => {
    if (!slashMenu) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSlashMenu((previous) => {
        if (!previous) return previous;
        const total = SLASH_ITEMS.length;
        return { ...previous, index: (previous.index + step + total) % total };
      });
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      applySlashItem(SLASH_ITEMS[slashMenu.index] || SLASH_ITEMS[0]);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSlashMenu();
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!slashMenu) return;
    const menu = sourceMenuRef.current;
    if (!menu || typeof menu.querySelector !== 'function') return;
    const active = menu.querySelector('[data-active="true"]');
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
  }, [slashMenu]);

  const textarea = h('textarea', {
    ref: textareaRef,
    className: 'mn-source-input',
    value: props.value,
    placeholder: props.placeholder,
    spellCheck: false,
    onChange: (event) => {
      props.onChange(event.target.value);
      if (!(event && event.nativeEvent && event.nativeEvent.isComposing)) detectSlashInput(event);
    },
    onCompositionEnd: (event) => detectSlashInput(event),
    onFocus: props.onFocus,
    onBlur: (event) => {
      closeSlashMenu();
      if (props.onBlur) props.onBlur(event);
    },
    onScroll: (event) => {
      closeSlashMenu();
      if (props.onScroll) props.onScroll(event);
    },
    onSelect: () => {
      if (props.onCaretChange) props.onCaretChange();
    },
    onKeyUp: (event) => {
      if (props.onCaretChange) props.onCaretChange();
      if (props.onKeyUp) props.onKeyUp(event);
    },
    onClick: () => {
      if (slashMenu) closeSlashMenu();
      if (props.onCaretChange) props.onCaretChange();
    },
    onKeyDown: (event) => {
      if (slashMenu) {
        if (handleSlashMenuKeyDown(event)) return;
        if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) closeSlashMenu();
      }
      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const element = event.currentTarget;
        const start = element.selectionStart;
        const end = element.selectionEnd;
        const next = element.value.slice(0, start) + '  ' + element.value.slice(end);
        props.onChange(next);
        window.requestAnimationFrame(() => {
          try {
            element.setSelectionRange(start + 2, start + 2);
          } catch (error) {
            /* 选区恢复失败不影响输入 */
          }
        });
      }
      if (props.onKeyDown) props.onKeyDown(event);
    },
    onDrop: (event) => {
      if (props.onDropFiles) props.onDropFiles(event);
    },
  });

  const menuElement =
    slashMenu === null
      ? null
      : h(MN.SlashMenu, {
          left: slashMenu.left,
          top: slashMenu.top,
          index: slashMenu.index,
          menuRef: sourceMenuRef,
          onChoose: applySlashItem,
          onHover: (index) => setSlashMenu((previous) => (previous ? { ...previous, index } : previous)),
        });

  return h(MN.React.Fragment, null, textarea, menuElement);
};

/** 渲染视图编辑器（contenteditable）。 */
/** 渲染视图根级空块里输入 `/` / `、` 时可选插入的 Markdown 块。 */
const SLASH_ITEMS = [
  { id: 'code', icon: 'code', labelKey: 'slash.code', descKey: 'slash.codeDesc', snippet: '```\n\n```' },
  { id: 'quote', icon: 'quote', labelKey: 'slash.quote', descKey: 'slash.quoteDesc', snippet: '> ' },
  { id: 'divider', icon: 'hr', labelKey: 'slash.divider', descKey: 'slash.dividerDesc', snippet: '---' },
  { id: 'table', icon: 'table', labelKey: 'slash.table', descKey: 'slash.tableDesc', snippet: '| 列 1 | 列 2 |\n| --- | --- |\n|  |  |' },
  { id: 'task', icon: 'task', labelKey: 'slash.task', descKey: 'slash.taskDesc', snippet: '- [ ] ' },
  { id: 'ordered', icon: 'ordered', labelKey: 'slash.ordered', descKey: 'slash.orderedDesc', snippet: '1. ' },
  { id: 'bullet', icon: 'list', labelKey: 'slash.bullet', descKey: 'slash.bulletDesc', snippet: '- ' },
  { id: 'heading3', icon: 'heading', labelKey: 'slash.heading3', descKey: 'slash.heading3Desc', snippet: '### ' },
  { id: 'heading2', icon: 'heading', labelKey: 'slash.heading2', descKey: 'slash.heading2Desc', snippet: '## ' },
  { id: 'heading1', icon: 'heading', labelKey: 'slash.heading1', descKey: 'slash.heading1Desc', snippet: '# ' },
  { id: 'paragraph', icon: 'file', labelKey: 'slash.paragraph', descKey: 'slash.paragraphDesc', snippet: '' },
];

/** 渲染视图 / 原文视图共用的格式块菜单。 */
MN.SlashMenu = function SlashMenu(props) {
  return h(
    'div',
    {
      ref: props.menuRef,
      className: 'mn-slash-menu',
      role: 'menu',
      'aria-label': MN.t('slash.title'),
      style: { left: props.left + 'px', top: props.top + 'px' },
      onMouseDown: (event) => event.preventDefault(),
    },
    h('div', { className: 'mn-slash-head' }, MN.t('slash.title')),
    h(
      'div',
      { className: 'mn-slash-list' },
      SLASH_ITEMS.map((item, index) =>
        h(
          'button',
          {
            key: item.id,
            type: 'button',
            className: 'mn-slash-item',
            role: 'menuitem',
            'data-active': index === props.index ? 'true' : undefined,
            onMouseEnter: () => props.onHover(index),
            onMouseDown: (event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onChoose(item);
            },
          },
          h('span', { className: 'mn-slash-icon' }, h(MN.Icon, { name: item.icon, size: 16 })),
          h(
            'span',
            { className: 'mn-slash-copy' },
            h('span', { className: 'mn-slash-label' }, MN.t(item.labelKey)),
            h('span', { className: 'mn-slash-desc' }, MN.t(item.descKey)),
          ),
        ),
      ),
    ),
    h('div', { className: 'mn-slash-foot' }, MN.t('slash.hint')),
  );
};

/**
 * 在空块的源码位置插入一段 Markdown，返回插入后的源码与块起始行号。
 * 空块通常没有 data-line（浏览器按 Enter 新建），此时依据前后兄弟块的 data-line 定位。
 */
function insertMarkdownBlock(markdown, block) {
  const text = String(markdown === undefined || markdown === null ? '' : markdown);
  const lines = text.split('\n');
  let index = lines.length;
  if (block && block.getAttribute && block.getAttribute('data-line')) {
    const start = Number.parseInt(block.getAttribute('data-line'), 10);
    if (Number.isFinite(start) && start > 0) index = start - 1;
  } else if (block) {
    let previous = block.previousElementSibling;
    while (previous && !(previous.getAttribute && previous.getAttribute('data-line'))) previous = previous.previousElementSibling;
    let next = block.nextElementSibling;
    while (next && !(next.getAttribute && next.getAttribute('data-line'))) next = next.nextElementSibling;
    if (previous && previous.getAttribute('data-line-end')) {
      const end = Number.parseInt(previous.getAttribute('data-line-end'), 10);
      if (Number.isFinite(end)) index = end;
    } else if (next && next.getAttribute('data-line')) {
      const start = Number.parseInt(next.getAttribute('data-line'), 10);
      if (Number.isFinite(start) && start > 0) index = start - 1;
    }
  }
  const before = lines.slice(0, Math.max(0, Math.min(lines.length, index)));
  const after = lines.slice(Math.max(0, Math.min(lines.length, index)));
  while (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  while (after.length > 0 && after[0].trim() === '') after.shift();
  return { before, after, startLine: before.length + (before.length > 0 ? 2 : 1) };
}

/** 组合插入片段；单独成块之间留一个空行。 */
function composeMarkdownBlock(before, after, snippet) {
  const result = before.slice();
  if (result.length > 0) result.push('');
  result.push(...snippet.split('\n'));
  if (after.length > 0) {
    result.push('');
    result.push(...after);
  }
  const markdown = result.join('\n');
  return markdown;
}

/** 供测试与渲染视图共用：在空块位置插入 Markdown，返回源码与块起始行。 */
MN.slashInsertMarkdown = function slashInsertMarkdown(markdown, block, snippet) {
  const insertion = insertMarkdownBlock(markdown, block);
  return {
    markdown: composeMarkdownBlock(insertion.before, insertion.after, snippet),
    line: insertion.startLine,
  };
};

MN.RichEditor = function RichEditor(props) {
  const elementRef = useRef(null);
  const lastEmittedRef = useRef(typeof props.markdown === 'string' ? props.markdown : '');
  const [seedHtml, setSeedHtml] = useState(() => MN.md.render(props.markdown || '', { mediaUrl: MN.mediaUrl, trackLines: true }));
  const uploadRef = useRef(props.uploadImage);
  uploadRef.current = props.uploadImage;

  // 图片选中 / 缩放：overlay 用 fixed 定位跟随图片，窗口滚动或尺寸变化时重新对齐。
  const selectedImageRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const slashBlockRef = useRef(null);
  const slashMenuRef = useRef(null);
  const pendingCaretRef = useRef(null);

  const clearImageSelection = useCallback(() => {
    const image = selectedImageRef.current;
    if (image && image.classList) image.classList.remove('mn-img-selected');
    selectedImageRef.current = null;
    setImageOverlay(null);
  }, []);

  const syncImageOverlay = useCallback(() => {
    const image = selectedImageRef.current;
    const editor = elementRef.current;
    if (!image || editor === null || !editor.contains(image)) {
      clearImageSelection();
      return;
    }
    const rect = image.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      clearImageSelection();
      return;
    }
    const next = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    setImageOverlay((previous) => {
      if (
        previous &&
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.height === next.height
      ) {
        return previous;
      }
      return next;
    });
  }, [clearImageSelection]);

  /** 把当前 DOM 转回 Markdown。 */
  const emit = useCallback(() => {
    const element = elementRef.current;
    if (element === null) return;
    const markdown = MN.md.htmlToMarkdown(element, { mediaRel: MN.mediaRelFromUrl });
    lastEmittedRef.current = markdown;
    props.onChange(markdown);
    if (selectedImageRef.current) window.requestAnimationFrame(syncImageOverlay);
  }, [props.onChange, syncImageOverlay]);

  /** 切换代码块围栏语言，立即重渲染并回写 Markdown。 */
  const changeCodeLanguage = (select) => {
    if (!select || select.value === undefined) return;
    const editor = elementRef.current;
    const line = Number.parseInt(select.getAttribute('data-code-line'), 10);
    if (!Number.isFinite(line) || line < 1) return;
    const value = String(select.value || '').trim();
    const result = MN.setCodeFenceLanguage(props.markdown, line, value);
    if (!result.changed) return;
    const next = result.markdown;
    lastEmittedRef.current = next;
    const scrollTop = editor ? editor.scrollTop : 0;
    setSeedHtml(MN.md.render(next, { mediaUrl: MN.mediaUrl, trackLines: true }));
    props.onChange(next);
    if (editor) {
      window.requestAnimationFrame(() => {
        editor.scrollTop = scrollTop;
      });
    }
  };
  const codeLanguageHandlerRef = useRef(changeCodeLanguage);
  codeLanguageHandlerRef.current = changeCodeLanguage;

  // 原生 change 监听比 React 的 contenteditable 合成事件更可靠。
  useEffect(() => {
    const editor = elementRef.current;
    if (!editor || typeof editor.addEventListener !== 'function') return undefined;
    const listener = (event) => {
      const target = event.target;
      if (target && target.classList && target.classList.contains('mn-code-lang')) {
        event.stopPropagation();
        codeLanguageHandlerRef.current(target);
      }
    };
    editor.addEventListener('change', listener, true);
    return () => editor.removeEventListener('change', listener, true);
  }, []);


  const findTriggerBlock = (trigger) => {
    const editor = elementRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return null;
    if (!editor.contains(range.startContainer)) return null;
    const normalize = (value) => String(value || '').replace(/\u200b/g, '').replace(/^[ \t]*/, '');
    if (range.startContainer === editor) {
      return normalize(editor.textContent) === trigger ? { editor, block: null } : null;
    }
    let node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    while (node && node.parentElement && node.parentElement !== editor) node = node.parentElement;
    if (!node || node.parentElement !== editor) return null;
    const tag = node.tagName ? String(node.tagName).toUpperCase() : '';
    if (!['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) return null;
    if (normalize(node.textContent) !== trigger) return null;
    return { editor, block: node };
  };

  /** 在根级块中检测 `/` / `、`，字符已经插入；菜单只是可选操作。 */
  const detectSlashInput = () => {
    const editor = elementRef.current;
    if (!editor) return;
    for (const trigger of ['/', '、']) {
      const found = findTriggerBlock(trigger);
      if (found) {
        if (!slashMenu || slashMenu.trigger !== trigger) openSlashMenu(trigger);
        return;
      }
    }
    if (slashMenu) closeSlashMenu();
  };

  /** 在根级触发块处打开 `/` 格式块菜单。 */
  const openSlashMenu = (trigger) => {
    const found = findTriggerBlock(trigger);
    if (!found) return false;
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    let rect = null;
    try {
      if (range && typeof range.getBoundingClientRect === 'function') rect = range.getBoundingClientRect();
    } catch (error) {
      rect = null;
    }
    if (!rect || (rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0)) {
      const target = found.block || found.editor;
      rect = target && typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
    }
    if (!rect) return false;
    const width = 286;
    const height = 360;
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const top = Math.max(8, Math.min((rect.bottom || rect.top) + 6, viewportHeight - height - 8));
    slashBlockRef.current = found.block;
    setSlashMenu({ left, top, index: 0, trigger });
    return true;
  };

  const closeSlashMenu = () => {
    setSlashMenu(null);
    slashBlockRef.current = null;
  };

  /** 选中格式项后，移除触发字符并把块标记写入源码，再重建渲染视图。 */
  const applySlashItem = (item) => {
    const editor = elementRef.current;
    const block = slashBlockRef.current;
    const menu = slashMenu;
    closeSlashMenu();
    if (!item) return;
    if (item.snippet === '') {
      if (editor) editor.focus();
      return;
    }
    // 触发字符已经真实输入到 DOM；选中格式块时先移除它，再按 DOM 当前内容生成源码。
    if (editor) {
      const trigger = menu && menu.trigger ? menu.trigger : '';
      if (trigger) {
        const normalize = (value) => String(value || '').replace(/\u200b/g, '').trim();
        if (block) {
          const text = String(block.textContent || '');
          if (normalize(text) === trigger) block.textContent = '';
          else if (text.startsWith(trigger)) block.textContent = text.slice(trigger.length);
        } else {
          const text = String(editor.textContent || '');
          if (normalize(text) === trigger) editor.textContent = '';
        }
      }
    }
    const markdown = editor ? MN.md.htmlToMarkdown(editor, { mediaRel: MN.mediaRelFromUrl }) : props.markdown;
    const insertion = MN.slashInsertMarkdown(markdown, block, item.snippet);
    const next = insertion.markdown;
    pendingCaretRef.current = insertion.line;
    lastEmittedRef.current = next;
    setSeedHtml(MN.md.render(next, { mediaUrl: MN.mediaUrl, trackLines: true }));
    props.onChange(next);
    if (editor) editor.focus();
  };

  /** 菜单键盘操作：上下选择、Enter 插入、Esc 关闭。返回是否已处理。 */
  const handleSlashMenuKeyDown = (event) => {
    if (!slashMenu) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSlashMenu((previous) => {
        if (!previous) return previous;
        const total = SLASH_ITEMS.length;
        return { ...previous, index: (previous.index + step + total) % total };
      });
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      applySlashItem(SLASH_ITEMS[slashMenu.index] || SLASH_ITEMS[0]);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSlashMenu();
      return true;
    }
    return false;
  };

  // 插入块后把光标放到新块内；hr 无法放置文本光标时退回编辑器末尾。
  useEffect(() => {
    const line = pendingCaretRef.current;
    if (line === null || line === undefined) return;
    pendingCaretRef.current = null;
    const editor = elementRef.current;
    if (!editor) return;
    let target = null;
    try {
      target = editor.querySelector('[data-line="' + line + '"]');
    } catch (error) {
      target = null;
    }
    editor.focus();
    if (target && String(target.tagName || '').toUpperCase() !== 'HR') {
      const nested = target.querySelector ? target.querySelector('li, p, td, th, pre code') : null;
      try {
        placeCaretAtEnd(nested || target);
      } catch (error) {
        placeCaretAtEnd(editor);
      }
    } else {
      placeCaretAtEnd(editor);
    }
    if (props.onCaretChange) props.onCaretChange();
  }, [seedHtml]);

  // 方向键移动选项时把当前项滚入可视区域。
  useEffect(() => {
    if (!slashMenu) return;
    const menu = slashMenuRef.current;
    if (!menu || typeof menu.querySelector !== 'function') return;
    const active = menu.querySelector('[data-active="true"]');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [slashMenu]);

  // 外部（原文编辑器）改动时同步渲染；正在此编辑器输入时不重设 DOM，避免光标跳动。
  useEffect(() => {
    if (typeof props.markdown !== 'string') return;
    if (props.markdown === lastEmittedRef.current) return;
    const element = elementRef.current;
    if (element !== null && element.contains(document.activeElement)) return;
    lastEmittedRef.current = props.markdown;
    setSeedHtml(MN.md.render(props.markdown, { mediaUrl: MN.mediaUrl, trackLines: true }));
  }, [props.markdown]);

  // 外部重渲染后，选中的图片可能已被替换：重新对齐或清除选择。
  useEffect(() => {
    if (imageOverlay !== null) syncImageOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedHtml]);

  // 有选中图片时，点击编辑器 / 浮层之外或滚动页面都要重新对齐。
  useEffect(() => {
    if (imageOverlay === null) return undefined;
    const editor = elementRef.current;
    const onDocumentDown = (event) => {
      const target = event.target;
      if (target && typeof target.closest === 'function' && target.closest('.mn-img-overlay')) return;
      if (target && target.tagName === 'IMG' && editor !== null && editor.contains(target)) return;
      clearImageSelection();
    };
    const onReflow = () => syncImageOverlay();
    document.addEventListener('mousedown', onDocumentDown, true);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    let observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(onReflow);
      if (editor) observer.observe(editor);
      if (selectedImageRef.current) observer.observe(selectedImageRef.current);
    }
    return () => {
      document.removeEventListener('mousedown', onDocumentDown, true);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
      if (observer) observer.disconnect();
    };
  }, [imageOverlay === null, clearImageSelection, syncImageOverlay]);

  // 卸载时摘掉可能还在进行的拖拽监听。
  useEffect(
    () => () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
        resizeCleanupRef.current = null;
      }
    },
    [],
  );

  const insertImage = useCallback(
    (rel, alt) => {
      const element = elementRef.current;
      if (element === null || typeof rel !== 'string' || rel === '') return;
      const image = document.createElement('img');
      image.setAttribute('src', MN.mediaUrl(rel));
      image.setAttribute('alt', alt || '');
      image.setAttribute('loading', 'lazy');
      image.setAttribute('draggable', 'false');
      const selection = window.getSelection();
      const inEditor = selection && selection.rangeCount > 0 && element.contains(selection.anchorNode);
      if (inEditor) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(image);
        range.setStartAfter(image);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        element.appendChild(image);
      }
      emit();
      if (typeof element.focus === 'function') element.focus();
    },
    [emit],
  );

  const uploadAndInsert = useCallback(
    async (file, point) => {
      if (!file || !uploadRef.current) return;
      if (point) {
        const caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(point.x, point.y) : null;
        if (caret) {
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(caret);
          }
        }
      }
      try {
        const rel = await uploadRef.current(file);
        if (typeof rel === 'string' && rel !== '') insertImage(rel, file.name || 'image');
      } catch (error) {
        console.error('[markdown-notes] upload image failed', error);
      }
    },
    [insertImage],
  );

  /** 执行格式命令（预览视图侧重）。 */
  const exec = useCallback(
    (kind, value) => {
      const element = elementRef.current;
      if (element === null) return;
      if (!element.contains(document.activeElement)) {
        element.focus();
        if (window.getSelection && String(window.getSelection().toString()) === '') placeCaretAtEnd(element);
      }
      const command = (name, argument) => {
        try {
          document.execCommand(name, false, argument);
        } catch (error) {
          console.error('[markdown-notes] execCommand failed: ' + name, error);
        }
      };
      switch (kind) {
        case 'bold':
          command('bold');
          break;
        case 'italic':
          command('italic');
          break;
        case 'underline':
          command('underline');
          break;
        case 'strike':
          command('strikeThrough');
          break;
        case 'h1':
          command('formatBlock', 'h1');
          break;
        case 'h2':
          command('formatBlock', 'h2');
          break;
        case 'h3':
          command('formatBlock', 'h3');
          break;
        case 'quote':
          command('formatBlock', 'blockquote');
          break;
        case 'ul':
          command('insertUnorderedList');
          break;
        case 'ol':
          command('insertOrderedList');
          break;
        case 'code':
          command('formatBlock', 'pre');
          break;
        case 'hr':
          command('insertHorizontalRule');
          break;
        case 'task':
          command('insertHTML', '<ul><li><input type="checkbox" contenteditable="false"> </li></ul>');
          break;
        case 'link': {
          const url = String(value || '').trim();
          if (url === '') break;
          const label = selectedText().trim();
          if (label === '') {
            command('insertHTML', '<a href="' + MN.escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + MN.escapeHtml(url) + '</a>');
          } else {
            command('createLink', url);
          }
          break;
        }
        case 'clear':
          command('removeFormat');
          break;
        default:
          break;
      }
      emit();
    },
    [emit],
  );

  // 把命令式 API 暴露给上层（工具栏、图片按钮）。
  useEffect(() => {
    if (!props.apiRef) return;
    props.apiRef.current = {
      exec,
      insertImage,
      focus: () => {
        const element = elementRef.current;
        if (element !== null) element.focus();
      },
      insertText: (text) => {
        const element = elementRef.current;
        if (element === null) return;
        element.focus();
        try {
          document.execCommand('insertText', false, String(text));
        } catch (error) {
          /* 忽略 */
        }
        emit();
      },
      getScrollElement: () => elementRef.current,
    };
    return () => {
      if (props.apiRef) props.apiRef.current = null;
    };
  }, [exec, insertImage, emit, props.apiRef]);

  const handlePaste = (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files = [];
    if (clipboard.items && clipboard.items.length) {
      for (const item of clipboard.items) {
        if (item.kind === 'file' && item.type && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      files.forEach((file) => void uploadAndInsert(file));
      return;
    }
    const text = clipboard.getData('text/plain');
    if (typeof text === 'string' && text !== '') {
      event.preventDefault();
      try {
        document.execCommand('insertText', false, text);
      } catch (error) {
        /* 纯文本粘贴失败时保留默认行为 */
      }
      emit();
    }
  };

  const handleDrop = (event) => {
    const files = event.dataTransfer && event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    const images = files.filter((file) => file.type && file.type.indexOf('image/') === 0);
    if (images.length === 0) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    images.forEach((file) => void uploadAndInsert(file, point));
  };

  /** 点击图片：选中并显示八向缩放把手；点击其它位置取消选择。 */
  const handleEditorMouseDown = (event) => {
    const target = event.target;
    if (target && target.tagName === 'IMG') {
      event.preventDefault();
      if (selectedImageRef.current && selectedImageRef.current !== target && selectedImageRef.current.classList) {
        selectedImageRef.current.classList.remove('mn-img-selected');
      }
      selectedImageRef.current = target;
      if (target.classList) target.classList.add('mn-img-selected');
      syncImageOverlay();
      return;
    }
    clearImageSelection();
  };

  /** 双击图片恢复原始尺寸。 */
  const handleEditorDoubleClick = (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    event.preventDefault();
    target.removeAttribute('width');
    target.removeAttribute('height');
    if (target.style) {
      target.style.width = '';
      target.style.height = '';
    }
    emit();
    syncImageOverlay();
  };

  /** 从某个把手开始拖拽；等比缩放，只把 width 写回 Markdown。 */
  const startImageResize = (event, direction) => {
    const image = selectedImageRef.current;
    const editor = elementRef.current;
    if (!image || editor === null) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = image.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const start = { x: event.clientX, y: event.clientY, width: rect.width };
    const ratio = rect.width / rect.height;
    const maxWidth = Math.max(96, editor.clientWidth - 48);
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      const next = MN.imageResizeWidth(start.width, dx, dy, direction, ratio, maxWidth);
      image.setAttribute('width', String(next));
      image.removeAttribute('height');
      if (image.style) {
        image.style.width = '';
        image.style.height = '';
      }
      syncImageOverlay();
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      resizeCleanupRef.current = null;
      emit();
      syncImageOverlay();
    };
    resizeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const slashMenuElement =
    slashMenu === null
      ? null
      : h(MN.SlashMenu, {
          left: slashMenu.left,
          top: slashMenu.top,
          index: slashMenu.index,
          menuRef: slashMenuRef,
          onChoose: applySlashItem,
          onHover: (index) => setSlashMenu((previous) => (previous ? { ...previous, index } : previous)),
        });

  const imageOverlayElement =
    imageOverlay === null
      ? null
      : h(
          'div',
          {
            className: 'mn-img-overlay',
            style: {
              left: imageOverlay.left + 'px',
              top: imageOverlay.top + 'px',
              width: imageOverlay.width + 'px',
              height: imageOverlay.height + 'px',
            },
            onMouseDown: (event) => event.stopPropagation(),
          },
          ['e', 's', 'se'].map((direction) =>
            h('span', {
              key: direction,
              className: 'mn-img-handle',
              'data-dir': direction,
              onPointerDown: (event) => startImageResize(event, direction),
            }),
          ),
          h(
            'span',
            { className: 'mn-img-size' },
            Math.round(imageOverlay.width) + ' × ' + Math.round(imageOverlay.height),
          ),
        );

  return h(
    'div',
    { className: 'mn-editor-wrap' },
    h(
      'div',
      {
        ref: elementRef,
        className: 'mn-rich',
        contentEditable: true,
        suppressContentEditableWarning: true,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': MN.t('editor.richAria'),
        'data-placeholder': props.placeholder || '',
        spellCheck: false,
        dangerouslySetInnerHTML: { __html: seedHtml },
        onInput: (event) => {
          if (event.target && event.target.classList && event.target.classList.contains('mn-code-lang')) return;
          emit();
          if (!(event && event.nativeEvent && event.nativeEvent.isComposing)) detectSlashInput();
        },
        onCompositionEnd: () => detectSlashInput(),
        onPaste: handlePaste,
        onDrop: handleDrop,
        onFocus: props.onFocus,
        onBlur: (event) => {
          closeSlashMenu();
          if (props.onBlur) props.onBlur(event);
        },
        onScroll: (event) => {
          closeSlashMenu();
          if (props.onScroll) props.onScroll(event);
        },
        onKeyUp: () => {
          if (props.onCaretChange) props.onCaretChange();
        },
        onMouseUp: () => {
          if (props.onCaretChange) props.onCaretChange();
        },
        onMouseDown: (event) => {
          closeSlashMenu();
          handleEditorMouseDown(event);
        },
        onDoubleClick: handleEditorDoubleClick,
        onKeyDown: (event) => {
          if (slashMenu) {
            if (handleSlashMenuKeyDown(event)) return;
            if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
              closeSlashMenu();
            }
          }
          if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            try {
              document.execCommand('insertText', false, '  ');
            } catch (error) {
              /* 忽略 */
            }
            emit();
          }
        },
        onClick: (event) => {
          const target = event.target;
          if (target && target.tagName === 'INPUT' && String(target.type).toLowerCase() === 'checkbox') {
            window.setTimeout(emit, 0);
          }
        },
      },
    ),
    slashMenuElement,
    imageOverlayElement,
  );
};

/** 格式工具栏。 */
MN.Toolbar = function Toolbar(props) {
  const button = (kind, children, title) =>
    h(
      'button',
      {
        key: kind,
        type: 'button',
        className: 'mn-tbtn',
        title,
        'aria-label': title,
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => props.onAction(kind),
      },
      children,
    );
  const iconButton = (kind, icon, title) => button(kind, h(MN.Icon, { name: icon, size: 15 }), title);
  return h(
    'div',
    { className: 'mn-toolbar', role: 'toolbar', 'aria-label': MN.t('toolbar.aria') },
    h('span', { className: 'mn-toolbar-label' }, props.paneLabel),
    button('bold', h('b', null, 'B'), MN.t('toolbar.bold')),
    button('italic', h('i', null, 'I'), MN.t('toolbar.italic')),
    button('underline', h('u', null, 'U'), MN.t('toolbar.underline')),
    button('strike', h('s', null, 'S'), MN.t('toolbar.strike')),
    h('span', { key: 'sep-1', className: 'mn-tool-sep' }),
    iconButton('h1', 'heading', MN.t('toolbar.h1')),
    iconButton('quote', 'quote', MN.t('toolbar.quote')),
    iconButton('ul', 'list', MN.t('toolbar.ul')),
    iconButton('ol', 'ordered', MN.t('toolbar.ol')),
    iconButton('task', 'task', MN.t('toolbar.task')),
    iconButton('code', 'code', MN.t('toolbar.code')),
    h('span', { key: 'sep-2', className: 'mn-tool-sep' }),
    iconButton('link', 'link', MN.t('toolbar.link')),
    iconButton('image', 'image', MN.t('toolbar.image')),
    iconButton('hr', 'hr', MN.t('toolbar.hr')),
    h('span', { key: 'spacer', className: 'mn-tool-spacer' }),
    h(
      'button',
      {
        key: 'save',
        type: 'button',
        className: 'mn-tbtn',
        title: MN.t('toolbar.save'),
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => props.onSave(),
      },
      h(MN.Icon, { name: 'save', size: 14 }),
      h('span', { style: { fontSize: '11.5px' } }, MN.t('toolbar.saveShort')),
    ),
  );
};

/* ==================== src/client/50-page.js ==================== */
/**
 * 笔记管理器主页面：目录树、编辑器、收藏、搜索、设置与自动保存。
 *
 * @module @local/markdown-notes/src/client/50-page
 */

/** 读取 UI 偏好。 */
function loadUiPrefs() {
  const raw = MN.readLS(MN.LS_KEY, {});
  const view = raw && (raw.view === 'source' || raw.view === 'preview' || raw.view === 'split') ? raw.view : 'split';
  const expanded = raw && Array.isArray(raw.expanded) ? raw.expanded.filter((item) => typeof item === 'string') : null;
  const syncScroll = Boolean(raw && raw.syncScroll === true);
  const splitRatio =
    raw && typeof raw.splitRatio === 'number' && Number.isFinite(raw.splitRatio) && raw.splitRatio >= 0.2 && raw.splitRatio <= 0.8
      ? raw.splitRatio
      : 0.5;
  const sideCollapsed = Boolean(raw && raw.sideCollapsed === true);
  const sideWidth =
    raw && typeof raw.sideWidth === 'number' && Number.isFinite(raw.sideWidth)
      ? Math.min(560, Math.max(180, raw.sideWidth))
      : null;
  return { view, expanded, syncScroll, splitRatio, sideCollapsed, sideWidth };
}

/** 把时间戳格式化为 HH:mm。 */
function formatClock(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

/** 读取 File 为 data URL。 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(MN.t('toast.readImageFailed')));
    reader.readAsDataURL(file);
  });
}

/** 渲染边界：渲染失败时给出可读提示，而不是打空整个面板。 */
MN.PageBoundary = class PageBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[markdown-notes] page render failed', error, info);
  }

  render() {
    if (this.state.error !== null) {
      const detail = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error);
      return h(
        'div',
        { className: 'mn-root' },
        h(
          'div',
          { className: 'mn-crash' },
          h('strong', null, MN.t('crash.title')),
          h('div', null, MN.t('crash.hint')),
          h('div', { style: { fontSize: '11.5px', opacity: 0.7 } }, detail),
          h(
            'button',
            { type: 'button', className: 'mn-btn', onClick: () => window.location.reload() },
            MN.t('crash.reload'),
          ),
        ),
      );
    }
    return this.props.children;
  }
};

/** 设置对话框：选择 / 输入本地笔记目录。 */
MN.SettingsDialog = function SettingsDialog(props) {
  const t = MN.t;
  const settings = props.settings;
  const [path, setPath] = useState(settings ? settings.storagePath : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const submit = async () => {
    const value = path.trim();
    if (value === '' || busy) return;
    setBusy(true);
    setError('');
    try {
      if (typeof props.beforeApply === 'function') {
        const saved = await props.beforeApply();
        if (saved === false) throw new Error(t('toast.saveFailed'));
      }
      const data = await MN.api.post('settings', { storagePath: value });
      await props.onSaved(data.settings);
    } catch (failure) {
      setError(failure && failure.message ? failure.message : String(failure));
      setBusy(false);
    }
  };

  const pick = async () => {
    if (typeof props.pickDirectory !== 'function' || picking) return;
    setPicking(true);
    setError('');
    try {
      const picked = await props.pickDirectory();
      if (typeof picked === 'string' && picked !== '') setPath(picked);
      else if (picked === null) setError(t('settings.pickerUnavailable'));
    } catch (failure) {
      setError(failure && failure.message ? failure.message : String(failure));
    } finally {
      setPicking(false);
    }
  };

  return h(
    MN.Modal,
    {
      title: t('settings.title'),
      onClose: busy ? undefined : props.onClose,
      busy,
      wide: true,
      footer: [
        h(
          'button',
          { key: 'cancel', type: 'button', className: 'mn-btn', disabled: busy, onClick: props.onClose },
          t('common.cancel'),
        ),
        h(
          'button',
          {
            key: 'save',
            type: 'button',
            className: 'mn-btn',
            'data-primary': 'true',
            disabled: busy || path.trim() === '',
            onClick: submit,
          },
          busy ? t('common.saving') : t('settings.save'),
        ),
      ],
    },
    h(
      'div',
      { className: 'mn-field' },
      h('label', { className: 'mn-field-label' }, t('settings.storageLabel')),
      h(
        'div',
        { style: { display: 'flex', gap: 6 } },
        h('input', {
          className: 'mn-input',
          value: path,
          placeholder: settings ? settings.defaultStoragePath : '',
          disabled: busy,
          spellCheck: false,
          onChange: (event) => setPath(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          },
        }),
        typeof props.pickDirectory === 'function'
          ? h(
              'button',
              { type: 'button', className: 'mn-btn', disabled: busy || picking, onClick: pick, style: { flex: 'none' } },
              picking ? t('common.working') : t('settings.browse'),
            )
          : null,
      ),
    ),
    h('div', { className: 'mn-hint' }, t('settings.hint')),
    settings
      ? h(
          'div',
          { className: 'mn-hint' },
          t('settings.defaultPath') +
            '：' +
            settings.defaultStoragePath,
        )
      : null,
    settings
      ? h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'var(--dsw-alias-bg-layer-1)',
              fontSize: '11.5px',
              color: 'var(--dsw-alias-label-secondary)',
            },
          },
          h(MN.Icon, { name: 'folder', size: 14 }),
          h('span', { style: { flex: '1 1 auto', wordBreak: 'break-all' } }, t('settings.currentPath') + '：' + settings.storagePath),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-btn',
              style: { height: 24, fontSize: '11px' },
              onClick: () => setPath(settings.defaultStoragePath),
            },
            t('settings.useDefault'),
          ),
        )
      : null,
    error ? h('div', { className: 'mn-dialog-error' }, error) : null,
  );
};

/** 主页面。 */
MN.AppPage = function AppPage(props) {
  const t = MN.t;
  const initialPrefs = useMemo(loadUiPrefs, []);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [state, setState] = useState({
    settings: null,
    tree: [],
    stats: { notes: 0, folders: 0 },
    favorites: [],
    lastOpened: null,
  });
  const [expanded, setExpanded] = useState(() => new Set(initialPrefs.expanded || []));
  const [view, setView] = useState(initialPrefs.view);
  const [syncScroll, setSyncScroll] = useState(initialPrefs.syncScroll);
  const [splitRatio, setSplitRatio] = useState(initialPrefs.splitRatio);
  const [sideCollapsed, setSideCollapsed] = useState(initialPrefs.sideCollapsed);
  const [sideWidth, setSideWidth] = useState(initialPrefs.sideWidth);
  const [ghostCaret, setGhostCaret] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [status, setStatus] = useState('saved');
  const [statusTime, setStatusTime] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [focusPane, setFocusPane] = useState(initialPrefs.view === 'preview' ? 'preview' : 'source');
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [uploading, setUploading] = useState(0);

  const noteRef = useRef(null);
  const pendingRef = useRef(null);
  const sourceRef = useRef(null);
  const sourceMirrorRef = useRef(null);
  const richApiRef = useRef(null);
  const fileInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveSeqRef = useRef(0);
  const toastTimerRef = useRef(null);
  const lastOpenRef = useRef(null);
  const openNoteRef = useRef(null);
  const mountedRef = useRef(true);
  const scrollSyncRef = useRef({ frame: 0, side: null, lockUntil: 0 });
  const ghostFrameRef = useRef(0);
  const panesRef = useRef(null);
  const splitDragCleanupRef = useRef(null);
  const splitClickRef = useRef({ time: 0, x: 0 });
  const rootRef = useRef(null);
  const sideRef = useRef(null);
  const sideDragCleanupRef = useRef(null);

  const favoriteSet = useMemo(() => new Set(state.favorites || []), [state.favorites]);
  const allNotes = useMemo(() => MN.collectNotes(state.tree), [state.tree]);
  const filteredTree = useMemo(() => MN.filterTree(state.tree, query), [state.tree, query]);
  const activeFavorite = note ? favoriteSet.has(note.path) : false;

  const showToast = useCallback((message, kind) => {
    if (!mountedRef.current) return;
    setToast({ message: String(message || ''), kind: kind || 'info', id: MN.uid('toast') });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      if (mountedRef.current) setToast(null);
    }, 4200);
  }, []);

  const applyNote = useCallback((next) => {
    noteRef.current = next;
    setNote(next);
  }, []);

  const saveNow = useCallback(
    async (options) => {
      const pending = pendingRef.current;
      if (!pending || !pending.dirty || !pending.path) return true;
      const seq = saveSeqRef.current + 1;
      saveSeqRef.current = seq;
      setStatus('saving');
      const snapshot = { path: pending.path, content: pending.content };
      try {
        const data = await MN.api.post('note/save', snapshot);
        if (seq !== saveSeqRef.current) return true;
        const current = pendingRef.current;
        if (current && current.dirty && current.path === snapshot.path && current.content === snapshot.content) {
          current.dirty = false;
          setStatus('saved');
          setStatusTime(data.note.mtimeMs);
          setSaveError('');
        } else if (current && current.dirty) {
          setStatus('dirty');
        }
        setNote((previous) => (previous && previous.path === snapshot.path ? { ...previous, mtimeMs: data.note.mtimeMs } : previous));
        return true;
      } catch (error) {
        if (seq === saveSeqRef.current) {
          setStatus('error');
          setSaveError(error && error.message ? error.message : String(error));
          if (!options || options.toast !== false) showToast(error && error.message ? error.message : t('toast.saveFailed'), 'error');
        }
        return false;
      }
    },
    [showToast, t],
  );

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingRef.current && pendingRef.current.dirty) return await saveNow({ toast: true });
    return true;
  }, [saveNow]);

  const scheduleSave = useCallback(() => {
    setStatus('dirty');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow({ toast: false });
    }, 900);
  }, [saveNow]);

  const handleContentChange = useCallback(
    (markdown) => {
      const current = noteRef.current;
      if (!current) return;
      const text = typeof markdown === 'string' ? markdown : '';
      if (text === current.content) return;
      const next = { ...current, content: text };
      noteRef.current = next;
      pendingRef.current = { path: current.path, content: text, dirty: true };
      setNote(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  const refresh = useCallback(async () => {
    const data = await MN.api.get('state');
    setState(data);
    return data;
  }, []);

  /** 预览编辑器内部的滚动容器（RichEditor 内部持有，通过命令式 API 暴露）。 */
  const getPreviewScrollElement = useCallback(() => {
    const api = richApiRef.current;
    return api && typeof api.getScrollElement === 'function' ? api.getScrollElement() : null;
  }, []);

  /**
   * 原文 → 预览：按当前顶部行号找到对应的渲染块，再按块内比例定位，
   * 让两边尽量看到同一段内容，而不是简单按总高度百分比映射。
   */
  const syncSourceToPreview = useCallback(() => {
    const source = sourceRef.current;
    const preview = getPreviewScrollElement();
    if (!source || !preview) return;
    if (source.scrollTop + source.clientHeight >= source.scrollHeight - 2) {
      preview.scrollTop = preview.scrollHeight;
      return;
    }
    if (source.scrollTop <= 1) {
      preview.scrollTop = 0;
      return;
    }
    const sourceStyle = window.getComputedStyle(source);
    const lineHeight = Number.parseFloat(sourceStyle.lineHeight) || 22.75;
    const sourceLine = Math.floor(source.scrollTop / lineHeight) + 1;
    const blocks = preview.querySelectorAll('[data-line]');
    let target = null;
    for (const block of blocks) {
      const line = Number(block.getAttribute('data-line'));
      if (!Number.isFinite(line)) continue;
      if (line <= sourceLine) target = block;
      else break;
    }
    if (!target) {
      preview.scrollTop = 0;
      return;
    }
    const startLine = Number(target.getAttribute('data-line')) || sourceLine;
    const endLine = Number(target.getAttribute('data-line-end')) || startLine;
    const fraction = Math.min(1, Math.max(0, (sourceLine - startLine) / Math.max(1, endLine - startLine + 1)));
    const previewStyle = window.getComputedStyle(preview);
    const paddingTop = Number.parseFloat(previewStyle.paddingTop) || 0;
    const previewRect = preview.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    preview.scrollTop += rect.top + rect.height * fraction - (previewRect.top + paddingTop);
  }, [getPreviewScrollElement]);

  /** 预览 → 原文：找到预览顶部所在块，换算回源码行号与滚动位置。 */
  const syncPreviewToSource = useCallback(() => {
    const source = sourceRef.current;
    const preview = getPreviewScrollElement();
    if (!source || !preview) return;
    if (preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 2) {
      source.scrollTop = source.scrollHeight;
      return;
    }
    if (preview.scrollTop <= 1) {
      source.scrollTop = 0;
      return;
    }
    const blocks = preview.querySelectorAll('[data-line]');
    if (blocks.length === 0) return;
    const previewStyle = window.getComputedStyle(preview);
    const paddingTop = Number.parseFloat(previewStyle.paddingTop) || 0;
    const contentTop = preview.getBoundingClientRect().top + paddingTop;
    let current = null;
    for (const block of blocks) {
      if (block.getBoundingClientRect().top <= contentTop + 2) current = block;
      else break;
    }
    const anchor = current || blocks[0];
    const startLine = Number(anchor.getAttribute('data-line')) || 1;
    const endLine = Number(anchor.getAttribute('data-line-end')) || startLine;
    let fraction = 0;
    if (current) {
      const rect = current.getBoundingClientRect();
      fraction = rect.height > 0 ? Math.min(1, Math.max(0, (contentTop - rect.top) / rect.height)) : 0;
    }
    const sourceLine = startLine + fraction * Math.max(1, endLine - startLine + 1);
    const sourceStyle = window.getComputedStyle(source);
    const lineHeight = Number.parseFloat(sourceStyle.lineHeight) || 22.75;
    const sourcePaddingTop = Number.parseFloat(sourceStyle.paddingTop) || 0;
    source.scrollTop = Math.max(0, sourcePaddingTop + (sourceLine - 1) * lineHeight);
  }, [getPreviewScrollElement]);

  /** 滚动事件节流 + 回环锁：只允许一侧驱动另一侧，避免互相触发抖动。 */
  const handleScrollSync = useCallback(
    (side) => {
      if (!syncScroll || view !== 'split') return;
      const syncState = scrollSyncRef.current;
      if (syncState.lockUntil > Date.now()) return;
      syncState.side = side;
      if (syncState.frame !== 0) return;
      syncState.frame = window.requestAnimationFrame(() => {
        syncState.frame = 0;
        const from = syncState.side;
        syncState.side = null;
        if (!from) return;
        syncState.lockUntil = Date.now() + 45;
        try {
          if (from === 'source') syncSourceToPreview();
          else syncPreviewToSource();
        } catch (error) {
          console.error('[markdown-notes] scroll sync failed', error);
        }
      });
    },
    [syncPreviewToSource, syncSourceToPreview, syncScroll, view],
  );

  const notePathForSync = note ? note.path : null;

  // 关闭同步或切换视图时清掉在途的帧与回环锁。
  useEffect(() => {
    if (syncScroll && view === 'split') return undefined;
    const syncState = scrollSyncRef.current;
    if (syncState.frame !== 0) {
      window.cancelAnimationFrame(syncState.frame);
      syncState.frame = 0;
    }
    syncState.side = null;
    syncState.lockUntil = 0;
    return undefined;
  }, [syncScroll, view]);

  // 启用同步 / 切回分栏 / 切换笔记后，先按原文顶部对齐一次。
  useEffect(() => {
    if (!syncScroll || view !== 'split' || !notePathForSync) return undefined;
    const timer = window.setTimeout(() => {
      try {
        syncSourceToPreview();
      } catch (error) {
        console.error('[markdown-notes] initial scroll sync failed', error);
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [syncScroll, view, notePathForSync, syncSourceToPreview]);

  /**
   * 计算另一侧的光标位置：
   * - 原文聚焦时，在渲染视图里找到对应行/列的内容块位置；
   * - 渲染视图聚焦时，把 DOM Selection 换算回原文行/列，再用 mirror 测量 textarea 中的坐标。
   */
  const updateGhostCaret = useCallback(() => {
    if (view !== 'split' || !noteRef.current) {
      setGhostCaret(null);
      return;
    }
    const source = sourceRef.current;
    const preview = getPreviewScrollElement();
    const active = document.activeElement;
    if (!source || !preview || !active) {
      setGhostCaret(null);
      return;
    }
    if (active === source) {
      const value = noteRef.current.content || '';
      const offset = typeof source.selectionStart === 'number' ? source.selectionStart : 0;
      const sourceStyle = window.getComputedStyle(source);
      const lineHeight = Number.parseFloat(sourceStyle.lineHeight) || 22.75;
      const paddingTop = Number.parseFloat(sourceStyle.paddingTop) || 0;
      const sourcePosition = MN.sourcePosition(value, offset);
      const caretTop = paddingTop + (sourcePosition.line - 1) * lineHeight - source.scrollTop;
      if (caretTop < -lineHeight || caretTop > source.clientHeight) {
        setGhostCaret(null);
        return;
      }
      const rect = MN.previewCaretRect(preview, value, offset);
      if (!rect || !MN.caretVisibleIn(rect, preview)) {
        setGhostCaret(null);
        return;
      }
      setGhostCaret({ left: rect.left, top: rect.top, height: rect.height });
      return;
    }
    if (preview === active || (typeof preview.contains === 'function' && preview.contains(active))) {
      const value = noteRef.current.content || '';
      const position = MN.previewSelectionToPosition(preview, value);
      if (!position) {
        setGhostCaret(null);
        return;
      }
      const offset = MN.sourceOffsetFromPosition(value, position.line, position.column);
      const rect = MN.measureSourceCaret(source, sourceMirrorRef.current, offset);
      if (!rect || !MN.caretVisibleIn(rect, source)) {
        setGhostCaret(null);
        return;
      }
      setGhostCaret({ left: rect.left, top: rect.top, height: rect.height });
      return;
    }
    setGhostCaret(null);
  }, [getPreviewScrollElement, view]);

  const scheduleGhostCaret = useCallback(() => {
    if (ghostFrameRef.current !== 0) return;
    ghostFrameRef.current = window.requestAnimationFrame(() => {
      ghostFrameRef.current = 0;
      updateGhostCaret();
    });
  }, [updateGhostCaret]);

  // 光标移动、选择变化都重新计算另一侧光标。
  useEffect(() => {
    if (view !== 'split') {
      setGhostCaret(null);
      return undefined;
    }
    const onSelectionChange = () => scheduleGhostCaret();
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [view, scheduleGhostCaret]);

  // 面板尺寸变化 / 内容变化后重新定位。
  useEffect(() => {
    if (view !== 'split') return undefined;
    const onResize = () => scheduleGhostCaret();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [view, scheduleGhostCaret]);

  const noteContentForGhost = note ? note.content : null;
  useEffect(() => {
    if (view !== 'split') {
      setGhostCaret(null);
      return;
    }
    scheduleGhostCaret();
  }, [view, noteContentForGhost, scheduleGhostCaret]);

  useEffect(
    () => () => {
      if (ghostFrameRef.current !== 0) {
        window.cancelAnimationFrame(ghostFrameRef.current);
        ghostFrameRef.current = 0;
      }
    },
    [],
  );

  const openNote = useCallback(
    async (path) => {
      if (typeof path !== 'string' || path === '') return;
      if (noteRef.current && noteRef.current.path === path) return;
      const saved = await flushSave();
      if (saved === false) return;
      setNoteLoading(true);
      try {
        const data = await MN.api.get('note', { path });
        const loaded = data.note;
        pendingRef.current = { path: loaded.path, content: loaded.content, dirty: false };
        applyNote(loaded);
        setStatus('saved');
        setStatusTime(loaded.mtimeMs);
        setSaveError('');
        setSearchResult(null);
        lastOpenRef.current = loaded.path;
        setExpanded((previous) => {
          const next = new Set(previous);
          for (const ancestor of MN.ancestorsOf(loaded.path)) next.add(ancestor);
          return next;
        });
        MN.api.post('meta', { lastOpened: loaded.path }).catch(() => {});
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.openFailed'), 'error');
      } finally {
        if (mountedRef.current) setNoteLoading(false);
      }
    },
    [applyNote, flushSave, showToast, t],
  );
  openNoteRef.current = openNote;

  // 首次加载：设置 + 目录树 + 上次打开的笔记。
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const data = await MN.api.get('state');
        if (cancelled) return;
        setState(data);
        setBooting(false);
        setExpanded((previous) => {
          if (previous.size > 0) return previous;
          const next = new Set(previous);
          for (const node of data.tree || []) {
            if (node.type === 'folder') next.add(node.path);
          }
          return next;
        });
        const last = data.lastOpened ? MN.findNode(data.tree, data.lastOpened) : null;
        const first = MN.collectNotes(data.tree)[0];
        const target = last && last.type === 'note' ? last.path : first ? first.path : null;
        if (target) void openNoteRef.current(target);
      } catch (error) {
        if (cancelled) return;
        setBootError(error && error.message ? error.message : String(error));
        setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 卸载时尽力把未保存内容送出（keepalive 不保证被接受，但比丢失好）。
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      const pending = pendingRef.current;
      if (pending && pending.dirty) {
        try {
          fetch(MN.API + '/note/save', {
            method: 'POST',
            keepalive: true,
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: pending.path, content: pending.content }),
          });
        } catch (error) {
          /* 尽力而为 */
        }
      }
    };
  }, []);

  // 持久化视图偏好。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      MN.writeLS(MN.LS_KEY, {
        view,
        syncScroll,
        splitRatio,
        sideCollapsed,
        sideWidth,
        expanded: Array.from(expanded),
        lastOpened: lastOpenRef.current,
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [view, syncScroll, splitRatio, sideCollapsed, sideWidth, expanded]);

  // Ctrl/Cmd + S 立即保存。
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 's') {
        event.preventDefault();
        void saveNow({ toast: true });
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [saveNow]);

  /* ----------------------------- 目录操作 ----------------------------- */

  const toggleFolder = useCallback((path) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    async (path, favorite) => {
      setState((previous) => {
        const set = new Set(previous.favorites || []);
        if (favorite) set.add(path);
        else set.delete(path);
        return { ...previous, favorites: Array.from(set) };
      });
      try {
        await MN.api.post('favorite', { path, favorite });
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.favoriteFailed'), 'error');
        try {
          await refresh();
        } catch (refreshError) {
          /* 忽略 */
        }
      }
    },
    [refresh, showToast, t],
  );

  const openPrompt = useCallback((config) => {
    setDialog({ type: 'prompt', busy: false, error: '', ...config });
  }, []);

  const createNote = useCallback(
    (parentDir) => {
      openPrompt({
        title: t('dialog.newNoteTitle'),
        label: t('dialog.nameLabel'),
        initial: '',
        placeholder: t('dialog.noteNamePlaceholder'),
        confirmLabel: t('common.create'),
        hint: parentDir === '' ? t('dialog.rootHint') : t('dialog.parentHint') + parentDir,
        onSubmit: async (title) => {
          const data = await MN.api.post('note/create', { dir: parentDir || '', title });
          setDialog(null);
          setExpanded((previous) => {
            const next = new Set(previous);
            for (const ancestor of MN.ancestorsOf(data.note.path)) next.add(ancestor);
            return next;
          });
          await refresh();
          await openNoteRef.current(data.note.path);
          showToast(t('toast.noteCreated'), 'info');
        },
      });
    },
    [openPrompt, refresh, showToast, t],
  );

  const createFolder = useCallback(
    (parentDir) => {
      openPrompt({
        title: t('dialog.newFolderTitle'),
        label: t('dialog.nameLabel'),
        initial: '',
        placeholder: t('dialog.folderNamePlaceholder'),
        confirmLabel: t('common.create'),
        hint: parentDir === '' ? t('dialog.rootHint') : t('dialog.parentHint') + parentDir,
        onSubmit: async (name) => {
          const data = await MN.api.post('folder/create', { parent: parentDir || '', name });
          setDialog(null);
          setExpanded((previous) => {
            const next = new Set(previous);
            if (parentDir) next.add(parentDir);
            next.add(data.folder.path);
            return next;
          });
          await refresh();
          showToast(t('toast.folderCreated'), 'info');
        },
      });
    },
    [openPrompt, refresh, showToast, t],
  );

  const renameEntry = useCallback(
    (node) => {
      openPrompt({
        title: node.type === 'folder' ? t('dialog.renameFolderTitle') : t('dialog.renameNoteTitle'),
        label: t('dialog.nameLabel'),
        initial: node.type === 'note' ? node.fileName || node.name : node.name,
        confirmLabel: t('common.rename'),
        hint: node.type === 'note' ? t('dialog.renameNoteHint') : '',
        onSubmit: async (name) => {
          const saved = await flushSave();
          if (saved === false) throw new Error(t('toast.saveFailed'));
          const data = await MN.api.post('entry/rename', { path: node.path, name });
          setDialog(null);
          const newPath = data.entry.path;
          const current = noteRef.current;
          if (current) {
            let mapped = null;
            if (current.path === node.path) mapped = newPath;
            else if (MN.isSameOrDescendant(current.path, node.path)) mapped = newPath + current.path.slice(node.path.length);
            if (mapped !== null) {
              const next = { ...current, path: mapped, name: MN.basenameOf(mapped).replace(/\.(md|markdown)$/i, '') };
              noteRef.current = next;
              pendingRef.current = { path: mapped, content: next.content, dirty: false };
              setNote(next);
              setExpanded((previous) => {
                const set = new Set(previous);
                for (const ancestor of MN.ancestorsOf(mapped)) set.add(ancestor);
                return set;
              });
            }
          }
          await refresh();
          showToast(t('toast.renamed'), 'info');
        },
      });
    },
    [flushSave, openPrompt, refresh, showToast, t],
  );

  const deleteEntry = useCallback(
    (node) => {
      setDialog({
        type: 'confirm',
        title: t('dialog.deleteTitle'),
        confirmLabel: t('common.delete'),
        message:
          node.type === 'folder'
            ? t('dialog.deleteFolderMessage').replace('{name}', node.name)
            : t('dialog.deleteNoteMessage').replace('{name}', node.name),
        hint: t('dialog.deleteHint'),
        busy: false,
        error: '',
        onSubmit: async () => {
          await flushSave();
          await MN.api.post('entry/delete', { path: node.path });
          setDialog(null);
          const current = noteRef.current;
          if (current && MN.isSameOrDescendant(current.path, node.path)) {
            noteRef.current = null;
            pendingRef.current = null;
            setNote(null);
            setStatus('saved');
            setStatusTime(null);
          }
          const data = await refresh();
          const next = MN.collectNotes(data.tree)[0];
          if (!noteRef.current && next) void openNoteRef.current(next.path);
          showToast(t('toast.deleted'), 'info');
        },
      });
    },
    [flushSave, openNote, refresh, showToast, t],
  );

  /** 在系统文件管理器中打开条目：文件会选中，文件夹会直接打开。 */
  const revealEntry = useCallback(
    async (path) => {
      try {
        await MN.api.post('entry/reveal', { path });
        showToast(t('toast.revealed'), 'info');
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.revealFailed'), 'error');
      }
    },
    [showToast, t],
  );

  /** 拖动树节点到目标文件夹：先保存当前笔记，再移动并同步活动笔记路径。 */
  const moveEntry = useCallback(
    async (sourcePath, targetDir) => {
      try {
        const saved = await flushSave();
        if (saved === false) throw new Error(t('toast.saveFailed'));
        const data = await MN.api.post('entry/move', { path: sourcePath, targetDir });
        const moved = data.entry;
        setExpanded((previous) => {
          const next = new Set(previous);
          if (targetDir) next.add(targetDir);
          return next;
        });
        const current = noteRef.current;
        if (current) {
          let mapped = null;
          if (current.path === moved.oldPath) mapped = moved.path;
          else if (MN.isSameOrDescendant(current.path, moved.oldPath)) {
            mapped = moved.path + current.path.slice(moved.oldPath.length);
          }
          if (mapped !== null) {
            const next = { ...current, path: mapped, name: MN.basenameOf(mapped).replace(/\.(md|markdown)$/i, '') };
            noteRef.current = next;
            pendingRef.current = { path: mapped, content: next.content, dirty: false };
            setNote(next);
          }
        }
        await refresh();
        showToast(t('toast.moved'), 'info');
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.moveFailed'), 'error');
        try {
          await refresh();
        } catch (refreshError) {
          /* 忽略刷新失败 */
        }
      }
    },
    [flushSave, refresh, showToast, t],
  );

  /** 同一文件夹内拖动排序：只调整目录顺序，不改变文件内容或路径。 */
  const reorderEntry = useCallback(
    async (sourcePath, targetPath, position) => {
      try {
        await MN.api.post('entry/reorder', { path: sourcePath, target: targetPath, position });
        await refresh();
        showToast(t('toast.reordered'), 'info');
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.reorderFailed'), 'error');
        try {
          await refresh();
        } catch (refreshError) {
          /* 忽略刷新失败 */
        }
      }
    },
    [refresh, showToast, t],
  );

  /* ----------------------------- 搜索 ----------------------------- */
  const runSearch = useCallback(async () => {
    const needle = query.trim();
    if (needle === '') {
      setSearchResult(null);
      return;
    }
    setSearching(true);
    try {
      const data = await MN.api.get('search', { q: needle });
      setSearchResult(data.search);
    } catch (error) {
      showToast(error && error.message ? error.message : t('toast.searchFailed'), 'error');
    } finally {
      setSearching(false);
    }
  }, [query, showToast, t]);

  const clearSearch = useCallback(() => {
    setSearchResult(null);
    setQuery('');
  }, []);

  /* ----------------------------- 图片上传 ----------------------------- */

  const uploadImageFile = useCallback(
    async (file) => {
      if (!file) throw new Error(t('toast.notImage'));
      if (file.size > 20 * 1024 * 1024) throw new Error(t('toast.imageTooLarge'));
      setUploading((count) => count + 1);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const comma = dataUrl.indexOf(',');
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const data = await MN.api.post('image', { name: file.name, mime: file.type, data: base64 });
        return data.image.path;
      } finally {
        if (mountedRef.current) setUploading((count) => Math.max(0, count - 1));
      }
    },
    [t],
  );

  const uploadForPreview = useCallback(
    async (file) => {
      try {
        return await uploadImageFile(file);
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.uploadFailed'), 'error');
        throw error;
      }
    },
    [showToast, t, uploadImageFile],
  );

  const insertSourceText = useCallback(
    (text, position) => {
      const current = noteRef.current;
      if (!current) return;
      const element = sourceRef.current;
      const start =
        typeof position === 'number'
          ? position
          : element && typeof element.selectionStart === 'number'
            ? element.selectionStart
            : current.content.length;
      const next = current.content.slice(0, start) + text + current.content.slice(start);
      handleContentChange(next);
      window.requestAnimationFrame(() => {
        if (element) {
          try {
            element.focus();
            element.setSelectionRange(start + text.length, start + text.length);
          } catch (error) {
            /* 忽略 */
          }
        }
      });
    },
    [handleContentChange],
  );

  const insertImageRel = useCallback(
    (rel, name) => {
      const label = name || MN.basenameOf(rel);
      if (view !== 'source' && focusPane === 'preview' && richApiRef.current) {
        richApiRef.current.insertImage(rel, label);
        return;
      }
      insertSourceText('![' + label + '](' + rel + ')');
    },
    [focusPane, insertSourceText, view],
  );

  const handleFileInput = async (event) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    event.target.value = '';
    if (!file) return;
    try {
      const rel = await uploadImageFile(file);
      insertImageRel(rel, file.name);
      showToast(t('toast.imageInserted'), 'info');
    } catch (error) {
      showToast(error && error.message ? error.message : t('toast.uploadFailed'), 'error');
    }
  };

  const handleSourceDrop = async (event) => {
    const files = event.dataTransfer && event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    const images = files.filter((file) => file.type && file.type.indexOf('image/') === 0);
    if (images.length === 0) return;
    event.preventDefault();
    const element = sourceRef.current;
    const position = element && typeof element.selectionStart === 'number' ? element.selectionStart : null;
    for (const file of images) {
      try {
        const rel = await uploadImageFile(file);
        insertSourceText('![' + file.name + '](' + rel + ')', position);
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.uploadFailed'), 'error');
      }
    }
  };

  /* ----------------------------- 格式操作 ----------------------------- */

  const applySourceTransform = useCallback(
    (transform) => {
      const current = noteRef.current;
      const element = sourceRef.current;
      if (!current || !element) return;
      const start = typeof element.selectionStart === 'number' ? element.selectionStart : 0;
      const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : start;
      const result = transform(current.content, start, end);
      if (!result || typeof result.text !== 'string') return;
      handleContentChange(result.text);
      window.requestAnimationFrame(() => {
        try {
          element.focus();
          element.setSelectionRange(result.start, result.end);
        } catch (error) {
          /* 忽略 */
        }
      });
    },
    [handleContentChange],
  );

  const wrapSourceSelection = useCallback(
    (before, after) => {
      applySourceTransform((value, start, end) => {
        const selected = value.slice(start, end);
        const hasWrap = value.slice(Math.max(0, start - before.length), start) === before && value.slice(end, end + after.length) === after;
        if (hasWrap) {
          const text = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
          const caret = start - before.length;
          return { text, start: caret, end: caret + selected.length };
        }
        if (selected === '') {
          const caret = start + before.length;
          return { text: value.slice(0, start) + before + after + value.slice(end), start: caret, end: caret };
        }
        const text = value.slice(0, start) + before + selected + after + value.slice(end);
        return { text, start: start + before.length, end: end + before.length };
      });
    },
    [applySourceTransform],
  );

  const prefixSourceLines = useCallback(
    (marker) => {
      applySourceTransform((value, start, end) => {
        const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        let lineEnd = value.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = value.length;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const strip = (line) =>
          line.replace(/^(\s*)(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d{1,9}[.)]\s+)/, '$1');
        const nonEmpty = lines.filter((line) => line.trim() !== '');
        const marked = marker.trim();
        const allMarked = nonEmpty.length > 0 && nonEmpty.every((line) => line.replace(/^\s*/, '').startsWith(marked));
        const nextLines = lines.map((line) => {
          if (line.trim() === '') return line;
          const base = strip(line);
          const indent = /^\s*/.exec(base)[0];
          const content = base.slice(indent.length);
          return allMarked ? indent + content : indent + marker + content;
        });
        const nextBlock = nextLines.join('\n');
        return {
          text: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
          start: lineStart,
          end: lineStart + nextBlock.length,
        };
      });
    },
    [applySourceTransform],
  );

  const applySourceFormat = useCallback(
    (kind) => {
      switch (kind) {
        case 'bold':
          wrapSourceSelection('**', '**');
          break;
        case 'italic':
          wrapSourceSelection('*', '*');
          break;
        case 'underline':
          wrapSourceSelection('<u>', '</u>');
          break;
        case 'strike':
          wrapSourceSelection('~~', '~~');
          break;
        case 'code':
          applySourceTransform((value, start, end) => {
            const selected = value.slice(start, end);
            if (selected.includes('\n')) {
              const text = value.slice(0, start) + '```\n' + selected + '\n```' + value.slice(end);
              return { text, start: start + 4, end: end + 4 };
            }
            if (selected === '') {
              return { text: value.slice(0, start) + '``' + value.slice(end), start: start + 1, end: start + 1 };
            }
            return {
              text: value.slice(0, start) + '`' + selected + '`' + value.slice(end),
              start: start + 1,
              end: end + 1,
            };
          });
          break;
        case 'h1':
          prefixSourceLines('# ');
          break;
        case 'h2':
          prefixSourceLines('## ');
          break;
        case 'h3':
          prefixSourceLines('### ');
          break;
        case 'quote':
          prefixSourceLines('> ');
          break;
        case 'ul':
          prefixSourceLines('- ');
          break;
        case 'ol':
          prefixSourceLines('1. ');
          break;
        case 'task':
          prefixSourceLines('- [ ] ');
          break;
        case 'hr':
          insertSourceText('\n\n---\n\n');
          break;
        default:
          break;
      }
    },
    [applySourceTransform, insertSourceText, prefixSourceLines, wrapSourceSelection],
  );

  const promptLink = useCallback(() => {
    openPrompt({
      title: t('dialog.linkTitle'),
      label: t('dialog.linkLabel'),
      initial: 'https://',
      placeholder: 'https://',
      confirmLabel: t('common.insert'),
      onSubmit: async (url) => {
        setDialog(null);
        if (focusPane === 'preview' && view !== 'source' && richApiRef.current) {
          richApiRef.current.exec('link', url);
          return;
        }
        const element = sourceRef.current;
        const selected = element ? currentSourceSelection(element) : '';
        const label = selected || '链接';
        insertSourceText('[' + label + '](' + url + ')');
      },
    });
  }, [focusPane, insertSourceText, openPrompt, t, view]);

  const applyRichFormat = useCallback(
    (kind) => {
      if (kind === 'image') {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
        }
        return;
      }
      if (kind === 'link') {
        promptLink();
        return;
      }
      if (richApiRef.current) richApiRef.current.exec(kind);
    },
    [promptLink],
  );

  const applyFormat = useCallback(
    (kind) => {
      const pane = view === 'source' ? 'source' : view === 'preview' ? 'preview' : focusPane;
      if (kind === 'image') {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
        }
        return;
      }
      if (kind === 'link') {
        promptLink();
        return;
      }
      if (pane === 'preview') applyRichFormat(kind);
      else applySourceFormat(kind);
    },
    [applyRichFormat, applySourceFormat, focusPane, promptLink, view],
  );

  const handleSourceKeyDown = useCallback(
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      const key = String(event.key).toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        applySourceFormat('bold');
      } else if (key === 'i') {
        event.preventDefault();
        applySourceFormat('italic');
      } else if (key === 'u') {
        event.preventDefault();
        applySourceFormat('underline');
      }
    },
    [applySourceFormat],
  );

  /* ----------------------------- 视图 / 设置 ----------------------------- */

  const changeView = useCallback((nextView) => {
    setView(nextView);
    if (nextView === 'preview') setFocusPane('preview');
    else if (nextView === 'source') setFocusPane('source');
  }, []);

  const resetSplitRatio = useCallback(() => setSplitRatio(0.5), []);

  /** 拖拽中间分割线：按容器宽度换算比例，并保证两侧最小宽度。 */
  const startSplitDrag = useCallback(
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const panes = panesRef.current;
      if (!panes) return;
      event.preventDefault();
      const splitter = event.currentTarget;
      const now = Date.now();
      const previousClick = splitClickRef.current;
      if (now - previousClick.time < 320 && Math.abs(event.clientX - previousClick.x) < 8) {
        splitClickRef.current = { time: 0, x: 0 };
        resetSplitRatio();
        return;
      }
      splitClickRef.current = { time: now, x: event.clientX };
      try {
        if (splitter && typeof splitter.focus === 'function') splitter.focus({ preventScroll: true });
      } catch (error) {
        /* 聚焦失败不影响拖动 */
      }
      const rect = panes.getBoundingClientRect();
      const usable = Math.max(1, rect.width);
      const startX = event.clientX;
      const startRatio = splitRatio;
      const minRatio = Math.min(0.45, Math.max(0.2, 240 / usable));
      let latest = startRatio;
      try {
        if (splitter && typeof splitter.setPointerCapture === 'function') splitter.setPointerCapture(event.pointerId);
      } catch (error) {
        /* 指针捕获失败不影响窗口级监听 */
      }
      if (splitter) splitter.setAttribute('data-dragging', 'true');
      const onMove = (moveEvent) => {
        const next = startRatio + (moveEvent.clientX - startX) / usable;
        latest = Math.min(1 - minRatio, Math.max(minRatio, next));
        // 拖动过程中直接改 CSS 变量，避免整个页面每帧重渲染。
        panes.style.setProperty('--mn-split-left', (latest * 100).toFixed(2) + '%');
        if (splitter) splitter.setAttribute('aria-valuenow', String(Math.round(latest * 100)));
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        try {
          if (splitter && typeof splitter.releasePointerCapture === 'function') splitter.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* 已经被释放 */
        }
        if (splitter) splitter.removeAttribute('data-dragging');
        splitDragCleanupRef.current = null;
      };
      function finish() {
        cleanup();
        setSplitRatio(latest);
      }
      splitDragCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [resetSplitRatio, splitRatio],
  );

  const handleSplitterKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.shiftKey ? 0.02 : 0.05;
        setSplitRatio((current) =>
          Math.min(0.8, Math.max(0.2, current + (event.key === 'ArrowRight' ? step : -step))),
        );
      } else if (event.key === 'Home') {
        event.preventDefault();
        resetSplitRatio();
      }
    },
    [resetSplitRatio],
  );

  useEffect(
    () => () => {
      if (splitDragCleanupRef.current) splitDragCleanupRef.current();
    },
    [],
  );

  const sideWidthLimits = () => {
    const root = rootRef.current;
    const max = root ? Math.max(180, Math.min(560, Math.round(root.clientWidth * 0.45))) : 560;
    return { min: 180, max };
  };

  const resetSideWidth = useCallback(() => setSideWidth(null), []);

  /** 拖拽文件栏右侧边缘调整宽度；拖动时直接改变 CSS 变量，避免每帧整页重渲染。 */
  const startSideResize = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const root = rootRef.current;
    const side = sideRef.current;
    if (!root || !side) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = side.getBoundingClientRect().width;
    const limits = sideWidthLimits();
    let latest = startWidth;
    try {
      if (handle && typeof handle.setPointerCapture === 'function') handle.setPointerCapture(event.pointerId);
    } catch (error) {
      /* 指针捕获失败不影响窗口级监听 */
    }
    if (handle) handle.setAttribute('data-dragging', 'true');
    try {
      if (handle && typeof handle.focus === 'function') handle.focus({ preventScroll: true });
    } catch (error) {
      /* 聚焦失败不影响拖动 */
    }
    const onMove = (moveEvent) => {
      latest = Math.min(limits.max, Math.max(limits.min, startWidth + (moveEvent.clientX - startX)));
      root.style.setProperty('--mn-side', Math.round(latest) + 'px');
      if (handle) handle.setAttribute('aria-valuenow', String(Math.round(latest)));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try {
        if (handle && typeof handle.releasePointerCapture === 'function') handle.releasePointerCapture(event.pointerId);
      } catch (error) {
        /* 已经被释放 */
      }
      if (handle) handle.removeAttribute('data-dragging');
      sideDragCleanupRef.current = null;
    };
    function finish() {
      cleanup();
      setSideWidth(Math.round(latest));
    }
    sideDragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, []);

  const handleSideResizeKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.shiftKey ? 20 : 8;
        const current = sideWidth || (sideRef.current ? sideRef.current.getBoundingClientRect().width : 264);
        const limits = sideWidthLimits();
        setSideWidth(Math.min(limits.max, Math.max(limits.min, Math.round(current + (event.key === 'ArrowRight' ? step : -step)))));
      } else if (event.key === 'Home') {
        event.preventDefault();
        resetSideWidth();
      }
    },
    [sideWidth, resetSideWidth],
  );

  useEffect(
    () => () => {
      if (sideDragCleanupRef.current) sideDragCleanupRef.current();
    },
    [],
  );

  // 窗口变窄时收敛自定义文件栏宽度，避免主区被压得过小。
  useEffect(() => {
    if (sideWidth === null) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const clampWidth = () => {
      const max = Math.max(180, Math.min(560, Math.round(root.clientWidth * 0.45)));
      setSideWidth((current) => (current !== null && current > max ? max : current));
    };
    clampWidth();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(clampWidth);
      observer.observe(root);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', clampWidth);
    return () => window.removeEventListener('resize', clampWidth);
  }, [sideWidth === null]);

  // 容器变窄时收敛比例，避免记忆的极端比例把某一侧压得过窄。
  useEffect(() => {
    if (view !== 'split') return undefined;
    const panes = panesRef.current;
    if (!panes) return undefined;
    const clampRatio = () => {
      const width = panes.clientWidth;
      if (width < 1) return;
      const minRatio = Math.min(0.45, Math.max(0.2, 240 / width));
      setSplitRatio((current) => {
        const next = Math.min(1 - minRatio, Math.max(minRatio, current));
        return Math.abs(next - current) < 0.001 ? current : next;
      });
    };
    clampRatio();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(clampRatio);
      observer.observe(panes);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', clampRatio);
    return () => window.removeEventListener('resize', clampRatio);
  }, [view]);

  const handleSettingsSaved = useCallback(
    async (settings) => {
      setState((previous) => ({ ...previous, settings }));
      setDialog(null);
      showToast(t('toast.storageSaved'), 'info');
      noteRef.current = null;
      pendingRef.current = null;
      setNote(null);
      setStatus('saved');
      setStatusTime(null);
      try {
        const data = await MN.api.get('state');
        setState(data);
        const last = data.lastOpened ? MN.findNode(data.tree, data.lastOpened) : null;
        const target = last && last.type === 'note' ? last.path : MN.collectNotes(data.tree)[0];
        if (target) void openNoteRef.current(target.path);
      } catch (error) {
        showToast(error && error.message ? error.message : t('toast.refreshFailed'), 'error');
      }
    },
    [showToast, t],
  );

  const statusText = (() => {
    if (status === 'saving') return t('status.saving');
    if (status === 'dirty') return t('status.dirty');
    if (status === 'error') return t('status.error');
    if (statusTime) return t('status.savedAt') + ' ' + formatClock(statusTime);
    return t('status.saved');
  })();

  /* ----------------------------- 菜单 ----------------------------- */

  const menuNode = menu ? menu.node : null;
  const menuItems = useMemo(() => {
    if (!menuNode) return [];
    const favorite = favoriteSet.has(menuNode.path);
    if (menuNode.type === 'folder') {
      return [
        { id: 'new-note', icon: 'plus', label: t('tree.newNoteHere'), onClick: () => createNote(menuNode.path) },
        { id: 'new-folder', icon: 'plus-folder', label: t('tree.newFolderHere'), onClick: () => createFolder(menuNode.path) },
        { separator: true },
        {
          id: 'reveal',
          icon: 'folder-open',
          label: t('common.revealInFileManager'),
          onClick: () => void revealEntry(menuNode.path),
        },
        { id: 'rename', icon: 'rename', label: t('common.rename'), onClick: () => renameEntry(menuNode) },
        { id: 'delete', icon: 'trash', label: t('common.delete'), danger: true, onClick: () => deleteEntry(menuNode) },
      ];
    }
    return [
      {
        id: 'favorite',
        icon: favorite ? 'star-filled' : 'star',
        label: favorite ? t('common.unfavorite') : t('common.favorite'),
        onClick: () => toggleFavorite(menuNode.path, !favorite),
      },
      { separator: true },
      {
        id: 'reveal',
        icon: 'folder-open',
        label: t('common.revealInFileManager'),
        onClick: () => void revealEntry(menuNode.path),
      },
      { id: 'rename', icon: 'rename', label: t('common.rename'), onClick: () => renameEntry(menuNode) },
      { id: 'delete', icon: 'trash', label: t('common.delete'), danger: true, onClick: () => deleteEntry(menuNode) },
    ];
  }, [createFolder, createNote, deleteEntry, favoriteSet, menuNode, renameEntry, revealEntry, t, toggleFavorite]);

  /* ----------------------------- 渲染 ----------------------------- */

  if (booting) {
    return h(
      'div',
      { className: 'mn-root' },
      h('div', { className: 'mn-note-loading' }, h('span', { className: 'mn-spin' }), h('span', { style: { marginLeft: 8 } }, t('app.loading'))),
    );
  }

  if (bootError !== '') {
    const fallbackSettings =
      state.settings || { storagePath: '', defaultStoragePath: '', dataDir: '', isDefault: true, exists: false };
    return h(
      'div',
      { className: 'mn-root' },
      h(
        'div',
        { className: 'mn-crash' },
        h('strong', null, t('crash.title')),
        h('div', null, bootError),
        h(
          'div',
          { style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' } },
          h(
            'button',
            {
              type: 'button',
              className: 'mn-btn',
              onClick: () => {
                setBootError('');
                setBooting(true);
                window.location.reload();
              },
            },
            t('crash.reload'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-btn',
              onClick: () => setDialog({ type: 'settings' }),
            },
            t('settings.title'),
          ),
        ),
      ),
      dialog && dialog.type === 'settings'
        ? h(MN.SettingsDialog, {
            settings: fallbackSettings,
            pickDirectory: typeof props.pickDirectory === 'function' ? props.pickDirectory : null,
            beforeApply: flushSave,
            onClose: () => setDialog(null),
            onSaved: handleSettingsSaved,
          })
        : null,
    );
  }

  const settings = state.settings;
  const columns = view === 'split' ? 'split' : view;
  const canPickDirectory = typeof props.pickDirectory === 'function';

  const dialogElement = (() => {
    if (!dialog) return null;
    if (dialog.type === 'prompt') {
      return h(MN.PromptDialog, {
        key: 'prompt',
        title: dialog.title,
        label: dialog.label,
        initial: dialog.initial || '',
        placeholder: dialog.placeholder || '',
        hint: dialog.hint || '',
        confirmLabel: dialog.confirmLabel || t('common.confirm'),
        busy: dialog.busy,
        error: dialog.error,
        onCancel: () => setDialog(null),
        onConfirm: (value) => {
          const submit = dialog.onSubmit;
          setDialog((previous) => (previous ? { ...previous, busy: true, error: '' } : previous));
          Promise.resolve(submit(value)).catch((error) => {
            setDialog((previous) =>
              previous ? { ...previous, busy: false, error: error && error.message ? error.message : String(error) } : previous,
            );
          });
        },
      });
    }
    if (dialog.type === 'confirm') {
      return h(MN.ConfirmDialog, {
        key: 'confirm',
        title: dialog.title,
        message: dialog.message,
        hint: dialog.hint || '',
        confirmLabel: dialog.confirmLabel,
        busy: dialog.busy,
        error: dialog.error,
        onCancel: () => setDialog(null),
        onConfirm: () => {
          const submit = dialog.onSubmit;
          setDialog((previous) => (previous ? { ...previous, busy: true, error: '' } : previous));
          Promise.resolve(submit()).catch((error) => {
            setDialog((previous) =>
              previous ? { ...previous, busy: false, error: error && error.message ? error.message : String(error) } : previous,
            );
          });
        },
      });
    }
    if (dialog.type === 'settings') {
      return h(MN.SettingsDialog, {
        key: 'settings',
        settings,
        pickDirectory: canPickDirectory ? props.pickDirectory : null,
        beforeApply: flushSave,
        onClose: () => setDialog(null),
        onSaved: handleSettingsSaved,
      });
    }
    return null;
  })();

  const toolbarVisible = note !== null;

  return h(
    'div',
    {
      className: 'mn-root',
      ref: rootRef,
      style: sideWidth ? { '--mn-side': sideWidth + 'px' } : undefined,
      'data-view': columns,
      'data-side-collapsed': sideCollapsed ? 'true' : 'false',
    },
    sideCollapsed
      ? null
      : h(
      'aside',
      { className: 'mn-side', ref: sideRef },
      h(
        'div',
        { className: 'mn-side-head' },
        h(
          'button',
          {
            type: 'button',
            className: 'mn-iconbtn mn-side-collapse',
            title: t('app.collapseSide'),
            'aria-label': t('app.collapseSide'),
            onClick: () => setSideCollapsed(true),
          },
          h(MN.Icon, { name: 'panel-left', size: 15 }),
        ),
        h('span', { className: 'mn-side-title' }, t('app.title')),
        h(
          'div',
          { className: 'mn-side-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('app.newNote'),
              'aria-label': t('app.newNote'),
              onClick: () => createNote(note ? MN.dirnameOf(note.path) : ''),
            },
            h(MN.Icon, { name: 'plus', size: 16 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('app.newFolder'),
              'aria-label': t('app.newFolder'),
              onClick: () => createFolder(''),
            },
            h(MN.Icon, { name: 'plus-folder', size: 16 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('app.refresh'),
              'aria-label': t('app.refresh'),
              onClick: () => {
                void (async () => {
                  try {
                    await refresh();
                    showToast(t('toast.refreshed'), 'info');
                  } catch (error) {
                    showToast(error && error.message ? error.message : t('toast.refreshFailed'), 'error');
                  }
                })();
              },
            },
            h(MN.Icon, { name: 'refresh', size: 15 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('app.settings'),
              'aria-label': t('app.settings'),
              onClick: () => setDialog({ type: 'settings' }),
            },
            h(MN.Icon, { name: 'settings', size: 15 }),
          ),
        ),
      ),
      h(
        'div',
        { className: 'mn-side-search' },
        h(
          'div',
          { className: 'mn-search-wrap' },
          h('span', { className: 'mn-search-icon' }, h(MN.Icon, { name: 'search', size: 13 })),
          h('input', {
            className: 'mn-search',
            value: query,
            placeholder: t('app.searchPlaceholder'),
            spellCheck: false,
            onChange: (event) => {
              setQuery(event.target.value);
              if (searchResult) setSearchResult(null);
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void runSearch();
              } else if (event.key === 'Escape') {
                clearSearch();
              }
            },
          }),
          query !== ''
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'mn-search-clear',
                  title: t('search.clear'),
                  'aria-label': t('search.clear'),
                  onClick: clearSearch,
                },
                '\u00d7',
              )
            : null,
        ),
      ),
      searchResult !== null
        ? h(MN.SearchResults, { result: searchResult, onOpen: (path) => void openNoteRef.current(path), onClear: clearSearch })
        : h(MN.TreeView, {
            tree: filteredTree,
            allTree: state.tree,
            favorites: favoriteSet,
            noteCount: state.stats ? state.stats.notes : allNotes.length,
            expanded,
            activePath: note ? note.path : null,
            onToggle: toggleFolder,
            onOpen: (path) => void openNoteRef.current(path),
            onMenu: (event, node) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, node });
            },
            onMenuAt: (x, y, node) => setMenu({ x, y, node }),
            onNewNote: createNote,
            onNewFolder: createFolder,
            onFavorite: (path, favorite) => void toggleFavorite(path, favorite),
            onMove: (sourcePath, targetDir) => void moveEntry(sourcePath, targetDir),
            onReorder: (sourcePath, targetPath, position) => void reorderEntry(sourcePath, targetPath, position),
          }),
      h(
        'div',
        { className: 'mn-side-foot' },
        h(
          'button',
          {
            type: 'button',
            className: 'mn-iconbtn',
            style: { width: 22, height: 22 },
            title: t('app.settings'),
            onClick: () => setDialog({ type: 'settings' }),
          },
          h(MN.Icon, { name: 'folder', size: 13 }),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'mn-side-path',
            title: settings ? settings.storagePath : '',
            style: { border: 0, background: 'transparent', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' },
            onClick: () => setDialog({ type: 'settings' }),
          },
          settings ? settings.storagePath : '',
        ),
        h('span', { className: 'mn-side-count' }, String(state.stats ? state.stats.notes : 0)),
      ),
    ),
    sideCollapsed
      ? null
      : h('div', {
          className: 'mn-side-resizer',
          role: 'separator',
          tabIndex: 0,
          'aria-orientation': 'vertical',
          'aria-label': t('app.resizeSide'),
          'aria-valuemin': 180,
          'aria-valuemax': 560,
          'aria-valuenow': Math.round(sideWidth || 264),
          title: t('app.resizeSide'),
          onPointerDown: startSideResize,
          onDoubleClick: resetSideWidth,
          onKeyDown: handleSideResizeKeyDown,
        }),
    sideCollapsed
      ? h(
          'button',
          {
            type: 'button',
            className: 'mn-side-expand',
            title: t('app.expandSide'),
            'aria-label': t('app.expandSide'),
            onClick: () => setSideCollapsed(false),
          },
          h(MN.Icon, { name: 'panel-left', size: 16 }),
        )
      : null,
    h(
      'main',
      { className: 'mn-main' },
      note
        ? h(
            MN.React.Fragment,
            null,
            h(
              'div',
              { className: 'mn-head' },
              h(
                'div',
                { className: 'mn-heading' },
                h(
                  'div',
                  { className: 'mn-title' },
                  h(MN.Icon, { name: 'file', size: 16 }),
                  h('span', { className: 'mn-title-text' }, note.name || t('app.untitled')),
                  note.content !== undefined ? h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', fontWeight: 400 } }, MN.countChars(note.content) + t('app.chars')) : null,
                ),
                h('div', { className: 'mn-subtitle', title: note.path }, note.path),
              ),
              h(
                'div',
                { className: 'mn-head-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mn-iconbtn',
                    'data-on': activeFavorite ? 'true' : undefined,
                    title: activeFavorite ? t('common.unfavorite') : t('common.favorite'),
                    'aria-label': activeFavorite ? t('common.unfavorite') : t('common.favorite'),
                    onClick: () => void toggleFavorite(note.path, !activeFavorite),
                  },
                  h(MN.Icon, { name: activeFavorite ? 'star-filled' : 'star', size: 16 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mn-iconbtn',
                    title: t('common.rename'),
                    'aria-label': t('common.rename'),
                    onClick: () => renameEntry({ type: 'note', path: note.path, name: note.name, fileName: note.fileName }),
                  },
                  h(MN.Icon, { name: 'rename', size: 15 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mn-iconbtn',
                    'data-danger': 'true',
                    title: t('common.delete'),
                    'aria-label': t('common.delete'),
                    onClick: () => deleteEntry({ type: 'note', path: note.path, name: note.name }),
                  },
                  h(MN.Icon, { name: 'trash', size: 15 }),
                ),
                h('span', { className: 'mn-sep-v' }),
                h(
                  'span',
                  {
                    className: 'mn-status',
                    'data-state': status,
                    title: status === 'error' ? saveError : t('status.hint'),
                    onClick: status === 'error' ? () => void saveNow({ toast: true }) : undefined,
                  },
                  statusText,
                ),
                h(
                  'div',
                  { className: 'mn-viewswitch', role: 'group', 'aria-label': t('view.aria') },
                  ['split', 'source', 'preview'].map((mode) =>
                    h(
                      'button',
                      {
                        key: mode,
                        type: 'button',
                        'data-on': view === mode ? 'true' : 'false',
                        title: t('view.' + mode),
                        onClick: () => changeView(mode),
                      },
                      t('view.' + mode),
                    ),
                  ),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'mn-sync-toggle',
                    'data-on': syncScroll ? 'true' : 'false',
                    'aria-pressed': syncScroll ? 'true' : 'false',
                    title: view === 'split' ? t('sync.title') : t('sync.splitOnly'),
                    disabled: view !== 'split',
                    onClick: () => setSyncScroll((enabled) => !enabled),
                  },
                  h(MN.Icon, { name: 'sync', size: 13 }),
                  h('span', null, t('sync.label')),
                ),
              ),
            ),
            toolbarVisible
              ? h(MN.Toolbar, {
                  paneLabel: view === 'split' ? (focusPane === 'preview' ? t('pane.preview') : t('pane.source')) : view === 'preview' ? t('pane.preview') : t('pane.source'),
                  onAction: applyFormat,
                  onSave: () => void saveNow({ toast: true }),
                })
              : null,
            h(
              'div',
              {
                className: 'mn-panes',
                ref: panesRef,
                style: view === 'split' ? { '--mn-split-left': (splitRatio * 100).toFixed(2) + '%' } : undefined,
              },
              view !== 'preview'
                ? h(
                    'section',
                    { className: 'mn-pane mn-pane-source' },
                    h('div', { className: 'mn-pane-label' }, h('span', { className: 'mn-dot' }), h('span', null, t('pane.source'))),
                    h(
                      'div',
                      { className: 'mn-source' },
                      h(MN.SourceEditor, {
                        textareaRef: sourceRef,
                        mirrorRef: sourceMirrorRef,
                        value: note.content,
                        placeholder: t('editor.sourcePlaceholder'),
                        onChange: handleContentChange,
                        onFocus: () => {
                          setFocusPane('source');
                          scheduleGhostCaret();
                        },
                        onBlur: scheduleGhostCaret,
                        onCaretChange: scheduleGhostCaret,
                        onScroll: () => {
                          handleScrollSync('source');
                          scheduleGhostCaret();
                        },
                        onKeyDown: handleSourceKeyDown,
                        onDropFiles: handleSourceDrop,
                      }),
                      h('div', { ref: sourceMirrorRef, className: 'mn-source-mirror', 'aria-hidden': 'true' }),
                    ),
                  )
                : null,
              view === 'split'
                ? h('div', {
                    className: 'mn-splitter',
                    role: 'separator',
                    tabIndex: 0,
                    'aria-orientation': 'vertical',
                    'aria-label': t('splitter.label'),
                    'aria-valuemin': 20,
                    'aria-valuemax': 80,
                    'aria-valuenow': Math.round(splitRatio * 100),
                    title: t('splitter.title'),
                    onPointerDown: startSplitDrag,
                    onDoubleClick: resetSplitRatio,
                    onKeyDown: handleSplitterKeyDown,
                  })
                : null,
              view !== 'source'
                ? h(
                    'section',
                    { className: 'mn-pane mn-pane-preview' },
                    h('div', { className: 'mn-pane-label' }, h('span', { className: 'mn-dot' }), h('span', null, t('pane.preview'))),
                    h(MN.RichEditor, {
                      key: note.path,
                      markdown: note.content,
                      placeholder: t('editor.previewPlaceholder'),
                      onChange: handleContentChange,
                      onFocus: () => {
                        setFocusPane('preview');
                        scheduleGhostCaret();
                      },
                      onBlur: scheduleGhostCaret,
                      onCaretChange: scheduleGhostCaret,
                      onScroll: () => {
                        handleScrollSync('preview');
                        scheduleGhostCaret();
                      },
                      uploadImage: uploadForPreview,
                      apiRef: richApiRef,
                    }),
                  )
                : null,
            ),
          )
        : h(
            'div',
            { className: 'mn-empty' },
            h('div', { className: 'mn-empty-icon' }, h(MN.Icon, { name: 'notes', size: 32, strokeWidth: 1.3 })),
            h('h2', null, allNotes.length === 0 ? t('empty.noNotesTitle') : t('empty.title')),
            h('p', null, allNotes.length === 0 ? t('empty.noNotesText') : t('empty.text')),
            h(
              'div',
              { className: 'mn-empty-actions' },
              h(
                'button',
                { type: 'button', className: 'mn-btn', 'data-primary': 'true', onClick: () => createNote('') },
                h(MN.Icon, { name: 'plus', size: 14 }),
                h('span', null, t('app.newNote')),
              ),
              h(
                'button',
                { type: 'button', className: 'mn-btn', onClick: () => setDialog({ type: 'settings' }) },
                h(MN.Icon, { name: 'folder', size: 14 }),
                h('span', null, t('settings.title')),
              ),
            ),
            settings ? h('div', { className: 'mn-empty-path', title: settings.storagePath }, t('settings.storageLabel') + '：' + settings.storagePath) : null,
          ),
      noteLoading && !note
        ? h(
            'div',
            { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-base)', opacity: 0.85 } },
            h('span', { className: 'mn-spin' }),
            h('span', { style: { marginLeft: 8 } }, t('app.loading')),
          )
        : null,
    ),
    h('input', {
      ref: fileInputRef,
      type: 'file',
      accept: 'image/png,image/jpeg,image/gif,image/webp,image/bmp',
      style: { display: 'none' },
      onChange: (event) => void handleFileInput(event),
    }),
    uploading > 0
      ? h(
          'div',
          { className: 'mn-toast', 'data-kind': 'info', style: { bottom: 46 } },
          h('span', { className: 'mn-toast-dot' }),
          h('span', null, t('toast.uploading')),
        )
      : null,
    toast ? h('div', { key: toast.id, className: 'mn-toast', 'data-kind': toast.kind }, h('span', { className: 'mn-toast-dot' }), h('span', null, toast.message)) : null,
    ghostCaret
      ? h('div', {
          key: 'ghost-caret',
          className: 'mn-ghost-caret',
          'aria-hidden': 'true',
          style: { left: ghostCaret.left + 'px', top: ghostCaret.top + 'px', height: ghostCaret.height + 'px' },
        })
      : null,
    dialogElement,
    menu ? h(MN.ContextMenu, { x: menu.x, y: menu.y, items: menuItems, onClose: () => setMenu(null) }) : null,
  );
};

/** 读取 textarea 当前选中的文本。 */
function currentSourceSelection(element) {
  if (!element) return '';
  try {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    return String(element.value || '').slice(start, end);
  } catch (error) {
    return '';
  }
}

/* ==================== src/client/60-locale.js ==================== */
/**
 * Client 文案字典（中文 / 英文）。
 *
 * @module @local/markdown-notes/src/client/60-locale
 */
MN.DICTIONARIES = {
  zh: {
    'app.title': 'Markdown 笔记',
    'app.collapseSide': '收起文件栏',
    'app.expandSide': '展开文件栏',
    'app.resizeSide': '拖动调整文件栏宽度，双击恢复默认',
    'app.newNote': '新建笔记',
    'app.newFolder': '新建文件夹',
    'app.refresh': '刷新目录',
    'app.settings': '存储设置',
    'app.searchPlaceholder': '搜索文件名或内容，回车全文搜索',
    'app.loading': '正在加载笔记…',
    'app.chars': ' 字',
    'app.untitled': '未命名笔记',
    'common.close': '关闭',
    'common.cancel': '取消',
    'common.confirm': '确定',
    'common.saving': '保存中…',
    'common.working': '处理中…',
    'common.delete': '删除',
    'common.rename': '重命名',
    'common.favorite': '收藏',
    'common.unfavorite': '取消收藏',
    'common.insert': '插入',
    'common.create': '创建',
    'common.more': '更多操作',
    'common.revealInFileManager': '从文件管理器中打开',
    'tree.favorites': '收藏',
    'tree.allNotes': '全部笔记',
    'tree.newNoteHere': '在此新建笔记',
    'tree.newFolderHere': '在此新建文件夹',
    'tree.emptyFolder': '空文件夹',
    'tree.noNotes': '还没有笔记',
    'tree.noNotesHint': '点击左上角 + 新建一篇，或选择已有目录作为存储位置。',
    'tree.noMatch': '没有匹配的笔记',
    'search.results': '搜索结果',
    'search.clear': '清除搜索',
    'search.empty': '没有找到匹配内容',
    'view.aria': '切换编辑视图',
    'view.split': '分栏',
    'view.source': '原文',
    'view.preview': '预览',
    'sync.label': '同步滚动',
    'sync.title': '启用后左右两侧滚动联动，按内容位置对齐（仅分栏模式生效）',
    'sync.splitOnly': '同步滚动仅在分栏模式下生效',
    'splitter.label': '调整左右宽度',
    'splitter.title': '拖动调整左右宽度；双击恢复 50/50；聚焦后用左右方向键微调',
    'pane.source': 'Markdown 原文',
    'pane.preview': '渲染视图',
    'editor.sourcePlaceholder': '在这里写 Markdown……',
    'editor.previewPlaceholder': '渲染结果可直接编辑；输入 / 或 、 会弹出格式块菜单，字符仍会保留。',
    'slash.title': '插入格式块',
    'slash.paragraph': '正文',
    'slash.paragraphDesc': '普通文本段落',
    'slash.heading1': '一级标题',
    'slash.heading1Desc': '文档大标题',
    'slash.heading2': '二级标题',
    'slash.heading2Desc': '章节标题',
    'slash.heading3': '三级标题',
    'slash.heading3Desc': '小节标题',
    'slash.bullet': '无序列表',
    'slash.bulletDesc': '圆点列表',
    'slash.ordered': '有序列表',
    'slash.orderedDesc': '数字编号列表',
    'slash.task': '待办列表',
    'slash.taskDesc': '可勾选的任务项',
    'slash.quote': '引用',
    'slash.quoteDesc': '引用一段内容',
    'slash.code': '代码块',
    'slash.codeDesc': '插入围栏代码块',
    'slash.table': '表格',
    'slash.tableDesc': '插入 2 列表格',
    'slash.divider': '分割线',
    'slash.dividerDesc': '插入一条水平线',
    'slash.hint': '↑↓ 选择 · Enter 插入 · Esc 关闭',
    'editor.richAria': 'Markdown 渲染编辑区',
    'toolbar.aria': '格式工具栏',
    'toolbar.bold': '加粗 (Ctrl+B)',
    'toolbar.italic': '斜体 (Ctrl+I)',
    'toolbar.underline': '下划线 (Ctrl+U)',
    'toolbar.strike': '删除线',
    'toolbar.h1': '一级标题',
    'toolbar.quote': '引用',
    'toolbar.ul': '无序列表',
    'toolbar.ol': '有序列表',
    'toolbar.task': '任务清单',
    'toolbar.code': '代码块',
    'toolbar.link': '插入链接',
    'toolbar.image': '插入图片',
    'toolbar.hr': '分隔线',
    'toolbar.save': '立即保存 (Ctrl+S)',
    'toolbar.saveShort': '保存',
    'status.saving': '保存中…',
    'status.dirty': '未保存',
    'status.error': '保存失败，点击重试',
    'status.savedAt': '已保存',
    'status.saved': '已保存',
    'status.hint': '自动保存已开启，Ctrl+S 可立即保存',
    'dialog.newNoteTitle': '新建笔记',
    'dialog.newFolderTitle': '新建文件夹',
    'dialog.renameNoteTitle': '重命名笔记',
    'dialog.renameFolderTitle': '重命名文件夹',
    'dialog.deleteTitle': '确认删除',
    'dialog.nameLabel': '名称',
    'dialog.noteNamePlaceholder': '例如：项目周报',
    'dialog.folderNamePlaceholder': '例如：工作',
    'dialog.rootHint': '将创建在笔记根目录',
    'dialog.parentHint': '将创建在：',
    'dialog.renameNoteHint': '不写扩展名时保留原来的 .md 扩展名',
    'dialog.linkTitle': '插入链接',
    'dialog.linkLabel': '链接地址',
    'dialog.deleteNoteMessage': '确定删除笔记“{name}”吗？此操作不可撤销。',
    'dialog.deleteFolderMessage': '确定删除文件夹“{name}”及其中的全部内容吗？此操作不可撤销。',
    'dialog.deleteHint': '删除会直接移除磁盘上的文件。',
    'settings.title': '存储设置',
    'settings.save': '应用并切换',
    'settings.storageLabel': '笔记存储目录',
    'settings.browse': '选择目录',
    'settings.hint': '笔记以普通 Markdown 文件保存在该目录中，可直接用其它编辑器或同步盘管理。目录不存在时会自动创建。',
    'settings.defaultPath': '默认目录',
    'settings.currentPath': '当前目录',
    'settings.useDefault': '使用默认',
    'settings.pickerUnavailable': '当前宿主未提供目录选择器，请直接输入绝对路径。',
    'empty.title': '选择一篇笔记开始',
    'empty.text': '左侧是目录树，支持文件夹、收藏与全文搜索；右侧可切换原文 / 预览 / 分栏，两侧都能直接编辑。',
    'empty.noNotesTitle': '开始写第一篇笔记',
    'empty.noNotesText': '笔记会保存为本地 .md 文件。你可以先设置一个存储目录，然后新建笔记。',
    'toast.readImageFailed': '读取图片失败',
    'toast.saveFailed': '保存失败',
    'toast.openFailed': '打开笔记失败',
    'toast.notImage': '请选择图片文件',
    'toast.imageTooLarge': '图片超过 20 MiB 上限',
    'toast.uploadFailed': '图片上传失败',
    'toast.uploading': '正在上传图片…',
    'toast.imageInserted': '图片已插入',
    'toast.noteCreated': '笔记已创建',
    'toast.folderCreated': '文件夹已创建',
    'toast.renamed': '已重命名',
    'toast.deleted': '已删除',
    'toast.favoriteFailed': '收藏操作失败',
    'toast.searchFailed': '搜索失败',
    'toast.storageSaved': '存储目录已更新',
    'toast.refreshed': '目录已刷新',
    'toast.revealed': '已在文件管理器中打开',
    'toast.revealFailed': '打开文件管理器失败',
    'toast.moved': '已移动到目标文件夹',
    'toast.moveFailed': '移动失败',
    'toast.reordered': '顺序已更新',
    'toast.reorderFailed': '排序失败',
    'toast.refreshFailed': '刷新失败',
    'time.justNow': '刚刚',
    'time.minutes': ' 分钟前',
    'time.hours': ' 小时前',
    'time.dateSeparator': '月',
    'crash.title': '笔记面板渲染失败',
    'crash.hint': '可以刷新页面重试；未保存的内容会在刷新前尽量提交。',
    'crash.reload': '刷新页面',
  },
  en: {
    'app.title': 'Markdown Notes',
    'app.collapseSide': 'Collapse file bar',
    'app.expandSide': 'Expand file bar',
    'app.resizeSide': 'Drag to resize the file bar; double-click to reset',
    'app.newNote': 'New note',
    'app.newFolder': 'New folder',
    'app.refresh': 'Refresh tree',
    'app.settings': 'Storage settings',
    'app.searchPlaceholder': 'Filter by name, Enter for full-text search',
    'app.loading': 'Loading notes…',
    'app.chars': ' chars',
    'app.untitled': 'Untitled note',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.confirm': 'OK',
    'common.saving': 'Saving…',
    'common.working': 'Working…',
    'common.delete': 'Delete',
    'common.rename': 'Rename',
    'common.favorite': 'Favorite',
    'common.unfavorite': 'Remove favorite',
    'common.insert': 'Insert',
    'common.create': 'Create',
    'common.more': 'More actions',
    'common.revealInFileManager': 'Open in file manager',
    'tree.favorites': 'Favorites',
    'tree.allNotes': 'All notes',
    'tree.newNoteHere': 'New note here',
    'tree.newFolderHere': 'New folder here',
    'tree.emptyFolder': 'Empty folder',
    'tree.noNotes': 'No notes yet',
    'tree.noNotesHint': 'Use the + button to create one, or choose an existing folder as storage.',
    'tree.noMatch': 'No matching notes',
    'search.results': 'Search results',
    'search.clear': 'Clear search',
    'search.empty': 'Nothing matched',
    'view.aria': 'Change editor view',
    'view.split': 'Split',
    'view.source': 'Source',
    'view.preview': 'Preview',
    'sync.label': 'Sync scroll',
    'sync.title': 'Link both panes by content position (split view only)',
    'sync.splitOnly': 'Sync scroll works in split view only',
    'splitter.label': 'Resize panes',
    'splitter.title': 'Drag to resize panes; double-click for 50/50; focus and use arrow keys to fine-tune',
    'pane.source': 'Markdown source',
    'pane.preview': 'Rendered view',
    'editor.sourcePlaceholder': 'Write Markdown here…',
    'editor.previewPlaceholder': 'Rendered content is editable. Type / or 、 to open the block menu; the typed character stays.',
    'slash.title': 'Insert block',
    'slash.paragraph': 'Text',
    'slash.paragraphDesc': 'A plain paragraph',
    'slash.heading1': 'Heading 1',
    'slash.heading1Desc': 'Large document heading',
    'slash.heading2': 'Heading 2',
    'slash.heading2Desc': 'Section heading',
    'slash.heading3': 'Heading 3',
    'slash.heading3Desc': 'Subsection heading',
    'slash.bullet': 'Bulleted list',
    'slash.bulletDesc': 'A bullet list',
    'slash.ordered': 'Numbered list',
    'slash.orderedDesc': 'A numbered list',
    'slash.task': 'To-do list',
    'slash.taskDesc': 'Checkable task items',
    'slash.quote': 'Quote',
    'slash.quoteDesc': 'Quote a passage',
    'slash.code': 'Code block',
    'slash.codeDesc': 'Insert a fenced code block',
    'slash.table': 'Table',
    'slash.tableDesc': 'Insert a 2-column table',
    'slash.divider': 'Divider',
    'slash.dividerDesc': 'Insert a horizontal rule',
    'slash.hint': '↑↓ select · Enter insert · Esc close',
    'editor.richAria': 'Rendered Markdown editor',
    'toolbar.aria': 'Formatting toolbar',
    'toolbar.bold': 'Bold (Ctrl+B)',
    'toolbar.italic': 'Italic (Ctrl+I)',
    'toolbar.underline': 'Underline (Ctrl+U)',
    'toolbar.strike': 'Strikethrough',
    'toolbar.h1': 'Heading 1',
    'toolbar.quote': 'Quote',
    'toolbar.ul': 'Bullet list',
    'toolbar.ol': 'Numbered list',
    'toolbar.task': 'Task list',
    'toolbar.code': 'Code block',
    'toolbar.link': 'Insert link',
    'toolbar.image': 'Insert image',
    'toolbar.hr': 'Divider',
    'toolbar.save': 'Save now (Ctrl+S)',
    'toolbar.saveShort': 'Save',
    'status.saving': 'Saving…',
    'status.dirty': 'Unsaved',
    'status.error': 'Save failed, click to retry',
    'status.savedAt': 'Saved',
    'status.saved': 'Saved',
    'status.hint': 'Autosave is on; Ctrl+S saves immediately',
    'dialog.newNoteTitle': 'New note',
    'dialog.newFolderTitle': 'New folder',
    'dialog.renameNoteTitle': 'Rename note',
    'dialog.renameFolderTitle': 'Rename folder',
    'dialog.deleteTitle': 'Confirm delete',
    'dialog.nameLabel': 'Name',
    'dialog.noteNamePlaceholder': 'e.g. Weekly report',
    'dialog.folderNamePlaceholder': 'e.g. Work',
    'dialog.rootHint': 'Created in the notes root',
    'dialog.parentHint': 'Created in: ',
    'dialog.renameNoteHint': 'Without an extension the original .md extension is kept',
    'dialog.linkTitle': 'Insert link',
    'dialog.linkLabel': 'URL',
    'dialog.deleteNoteMessage': 'Delete note “{name}”? This cannot be undone.',
    'dialog.deleteFolderMessage': 'Delete folder “{name}” and everything inside? This cannot be undone.',
    'dialog.deleteHint': 'This removes files from disk immediately.',
    'settings.title': 'Storage settings',
    'settings.save': 'Apply and switch',
    'settings.storageLabel': 'Notes storage folder',
    'settings.browse': 'Choose folder',
    'settings.hint': 'Notes are plain Markdown files in this folder, so you can edit or sync them with other tools. Missing folders are created automatically.',
    'settings.defaultPath': 'Default folder',
    'settings.currentPath': 'Current folder',
    'settings.useDefault': 'Use default',
    'settings.pickerUnavailable': 'This host has no folder picker; type an absolute path instead.',
    'empty.title': 'Pick a note to begin',
    'empty.text': 'The left side lists folders, favorites and search; the right side switches between source, preview and split — both panes are editable.',
    'empty.noNotesTitle': 'Write your first note',
    'empty.noNotesText': 'Notes are stored as local .md files. Choose a storage folder first, then create a note.',
    'toast.readImageFailed': 'Could not read the image',
    'toast.saveFailed': 'Save failed',
    'toast.openFailed': 'Could not open the note',
    'toast.notImage': 'Please choose an image file',
    'toast.imageTooLarge': 'Image exceeds the 20 MiB limit',
    'toast.uploadFailed': 'Image upload failed',
    'toast.uploading': 'Uploading image…',
    'toast.imageInserted': 'Image inserted',
    'toast.noteCreated': 'Note created',
    'toast.folderCreated': 'Folder created',
    'toast.renamed': 'Renamed',
    'toast.deleted': 'Deleted',
    'toast.favoriteFailed': 'Favorite update failed',
    'toast.searchFailed': 'Search failed',
    'toast.storageSaved': 'Storage folder updated',
    'toast.refreshed': 'Tree refreshed',
    'toast.revealed': 'Opened in the file manager',
    'toast.revealFailed': 'Could not open the file manager',
    'toast.moved': 'Moved to the target folder',
    'toast.moveFailed': 'Move failed',
    'toast.reordered': 'Order updated',
    'toast.reorderFailed': 'Reorder failed',
    'toast.refreshFailed': 'Refresh failed',
    'time.justNow': 'just now',
    'time.minutes': ' min ago',
    'time.hours': ' h ago',
    'time.dateSeparator': '/',
    'crash.title': 'The notes panel failed to render',
    'crash.hint': 'Reload the page to retry; unsaved content is flushed before reload when possible.',
    'crash.reload': 'Reload page',
  },
};

/* ==================== src/client/99-apply.js ==================== */
/**
 * Client 装配：注册左侧栏入口、主面板、语言字典，并收尾模块工厂。
 *
 * 座位：
 * - `sidebar.panellist` id `markdown-notes`：左侧栏入口图标（点击打开同 id 的主面板）；
 * - `main` key `markdown-notes`：笔记管理器整页。
 *
 * @module @local/markdown-notes/src/client/99-apply
 */

const PANEL_ID = 'markdown-notes';
const LOCALE_NS = 'markdown-notes';

return {
  name: PANEL_ID,
  inject: ['slots', 'locale'],
  apply(ctx) {
    MN.clientCtx = ctx;
    const t = ctx.locale.bind(LOCALE_NS);
    MN.t = t;

    // 目录选择器是可选能力：宿主没有 uiWorkspace 时由设置页提示“请手动输入”。
    const pickDirectory = async function pickDirectory() {
      try {
        const service = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined;
        if (!service || typeof service.pickDirectory !== 'function') return null;
        return await service.pickDirectory();
      } catch (error) {
        console.error('[markdown-notes] pickDirectory failed', error);
        return null;
      }
    };

    const disposers = [];

    disposers.push(
      ctx.effect(() => {
        const localeDisposers = [];
        for (const locale of Object.keys(MN.DICTIONARIES)) {
          localeDisposers.push(ctx.locale.register(LOCALE_NS, locale, MN.DICTIONARIES[locale]));
        }
        return () => {
          for (const dispose of localeDisposers) {
            try {
              dispose();
            } catch (error) {
              /* 忽略重复释放 */
            }
          }
        };
      }, 'markdown-notes: locale dictionaries'),
    );

    function Page() {
      const [, setRevision] = useState(0);
      useEffect(() => ctx.locale.subscribe(() => setRevision((value) => value + 1)), []);
      return h(
        React.Fragment,
        null,
        h('style', { key: 'css' }, MN.CSS),
        h(MN.PageBoundary, { key: 'boundary' }, h(MN.AppPage, { key: 'app', pickDirectory })),
      );
    }

    function PanelIcon(props) {
      const size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'currentColor',
            opacity: props && props.active ? 1 : 0.92,
          },
        },
        h(MN.Icon, { name: 'notes', size, strokeWidth: 1.6 }),
      );
    }

    disposers.push(
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
          },
          Page,
        ),
      ),
    );

    disposers.push(
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            label: () => t('app.title'),
          },
          PanelIcon,
        ),
      ),
    );

    return function dispose() {
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        try {
          disposers[index]();
        } catch (error) {
          console.error('[markdown-notes] slot dispose failed', error);
        }
      }
      MN.clientCtx = null;
    };
  },
};
  },
});
