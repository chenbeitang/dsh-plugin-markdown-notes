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
