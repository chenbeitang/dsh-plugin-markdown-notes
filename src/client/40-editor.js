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
  const allParts = [];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    for (const part of segments[segmentIndex].parts) allParts.push({ segmentIndex, part });
  }
  const container = range.startContainer;
  // Selection 落在元素节点时（常见于点击列表圆点 / 行间空白），
  // 按 container.childNodes[startOffset] 的位置选择下一段或上一段的文本。
  if (container && container.nodeType === 1 && container.childNodes) {
    const inside = (node, ancestor) => {
      let current = node;
      while (current) {
        if (current === ancestor) return true;
        current = current.parentElement;
      }
      return false;
    };
    const children = Array.from(container.childNodes);
    const offset = Math.max(0, Math.min(children.length, Number(range.startOffset) || 0));
    const indexes = [];
    if (offset < children.length) indexes.push(offset);
    if (offset > 0) indexes.push(offset - 1);
    for (const childIndex of indexes) {
      const child = children[childIndex];
      if (!child) continue;
      const candidates = allParts.filter(
        ({ part }) => part.node === child || inside(part.node, child),
      );
      if (candidates.length === 0) continue;
      const chosen = childIndex >= offset ? candidates[0] : candidates[candidates.length - 1];
      return {
        segmentIndex: chosen.segmentIndex,
        renderedIndex:
          childIndex >= offset
            ? chosen.part.partStart
            : chosen.part.partStart + (chosen.part.end - chosen.part.start),
      };
    }
    const inContainer = allParts.filter(({ part }) => inside(part.node, container));
    if (inContainer.length > 0) {
      return { segmentIndex: inContainer[0].segmentIndex, renderedIndex: inContainer[0].part.partStart };
    }
  }
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
  let container = range.startContainer;
  let startOffset = range.startOffset;
  if (!preview.contains(container)) return null;
  const element = container.nodeType === 1 ? container : container.parentElement;
  const block = element && typeof element.closest === 'function' ? element.closest('[data-line]') : null;
  if (!block || !preview.contains(block)) return null;
  // 某些列表 / 布局点击会让 Selection 落在 <li>/<ul> 元素节点上。
  // 用点击位置反查一次精确文本节点，避免按元素节点只能退化为“第一/最后一段”。
  if (container.nodeType === 1 && typeof document.caretRangeFromPoint === 'function') {
    try {
      const caretRect = range.getBoundingClientRect();
      if (caretRect && (caretRect.width > 0 || caretRect.height > 0)) {
        const y = caretRect.top + Math.max(1, caretRect.height / 2);
        const probes = [caretRect.left + 1, caretRect.left, caretRect.left + 4];
        for (const x of probes) {
          const precise = document.caretRangeFromPoint(x, y);
          if (
            precise &&
            precise.startContainer &&
            precise.startContainer.nodeType === 3 &&
            block.contains(precise.startContainer)
          ) {
            container = precise.startContainer;
            startOffset = precise.startOffset;
            break;
          }
        }
      }
    } catch (error) {
      /* 反查失败时保留原始元素 Selection */
    }
  }
  const start = Number.parseInt(block.getAttribute('data-line'), 10);
  const end = Number.parseInt(block.getAttribute('data-line-end'), 10) || start;
  if (!Number.isFinite(start)) return null;
  if (block.classList && block.classList.contains('mn-table-wrap')) {
    const tablePosition = tableSelectionToPosition(block, { startContainer: container, startOffset }, text);
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
      if (part.node === container && startOffset >= part.start && startOffset <= part.end) {
        const relative = startOffset - part.start;
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

/** 把原文的 scrollTop 调整到能看到指定光标矩形的位置（光标放在视口上部约 1/3）。 */
MN.sourceScrollTopToReveal = function sourceScrollTopToReveal(source, rect, margin) {
  if (!source || !rect || typeof source.getBoundingClientRect !== 'function') return null;
  if (MN.caretVisibleIn(rect, source)) return source.scrollTop;
  const box = source.getBoundingClientRect();
  const offset = Number(margin) || Math.min(120, Math.max(24, box.height * 0.3));
  const raw = source.scrollTop + rect.top - box.top - offset;
  const max = Math.max(0, (source.scrollHeight || 0) - (source.clientHeight || 0));
  return Math.max(0, Math.min(max, raw));
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

/** 给原文选区套 Markdown / 行内 HTML 标记。 */
MN.wrapSourceSelection = function wrapSourceSelection(value, start, end, kind) {
  const text = String(value === undefined || value === null ? '' : value);
  const wrappers = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    underline: ['<u>', '</u>'],
    strike: ['~~', '~~'],
  };
  const pair = wrappers[kind];
  if (!pair) return { markdown: text, selectionStart: start, selectionEnd: end, changed: false };
  const from = Math.max(0, Math.min(text.length, Number(start) || 0));
  const to = Math.max(from, Math.min(text.length, Number(end) || 0));
  if (from === to) return { markdown: text, selectionStart: from, selectionEnd: to, changed: false };
  const selected = text.slice(from, to);
  const markdown = text.slice(0, from) + pair[0] + selected + pair[1] + text.slice(to);
  const selectionStart = from + pair[0].length;
  return {
    markdown,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
    changed: true,
  };
};

/** 划词悬浮格式工具栏：原文 textarea 与渲染视图共用。 */
MN.SelectionToolbar = function SelectionToolbar(props) {
  const items = [
    { kind: 'bold', icon: 'bold', labelKey: 'selection.bold' },
    { kind: 'italic', icon: 'italic', labelKey: 'selection.italic' },
    { kind: 'underline', icon: 'underline', labelKey: 'selection.underline' },
    { kind: 'strike', icon: 'strike', labelKey: 'selection.strike' },
  ];
  return h(
    'div',
    {
      className: 'mn-selection-toolbar',
      style: { left: props.left + 'px', top: props.top + 'px' },
      onMouseDown: (event) => event.preventDefault(),
    },
    items.map((item) =>
      h(
        'button',
        {
          key: item.kind,
          type: 'button',
          className: 'mn-selection-btn',
          title: MN.t(item.labelKey),
          'aria-label': MN.t(item.labelKey),
          onMouseDown: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          onClick: (event) => {
            event.preventDefault();
            props.onAction(item.kind);
          },
        },
        h('span', { className: 'mn-selection-label' }, MN.t(item.labelKey)),
        h('span', { className: 'mn-selection-icon' }, h(MN.Icon, { name: item.icon, size: 13 })),
      ),
    ),
  );
};

MN.SourceEditor = function SourceEditor(props) {
  const textareaRef = props.textareaRef;
  const [slashMenu, setSlashMenu] = useState(null);
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const selectionFrameRef = useRef(0);
  const selectionToolbarSuppressRef = useRef(0);
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

  const hideSelectionToolbar = useCallback(() => {
    if (selectionFrameRef.current !== 0) {
      window.cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = 0;
    }
    setSelectionToolbar(null);
  }, []);

  const updateSelectionToolbar = useCallback(() => {
    if (selectionFrameRef.current !== 0) return;
    selectionFrameRef.current = window.requestAnimationFrame(() => {
      selectionFrameRef.current = 0;
      if (Date.now() < selectionToolbarSuppressRef.current) {
        setSelectionToolbar(null);
        return;
      }
      const textarea = textareaRef && textareaRef.current;
      if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
        setSelectionToolbar(null);
        return;
      }
      const start = Math.min(textarea.selectionStart, textarea.selectionEnd);
      const end = Math.max(textarea.selectionStart, textarea.selectionEnd);
      if (String(textarea.value || '').slice(start, end).trim() === '') {
        setSelectionToolbar(null);
        return;
      }
      const mirror = props.mirrorRef && props.mirrorRef.current;
      let startRect = null;
      let endRect = null;
      try {
        startRect = MN.measureSourceCaret(textarea, mirror, start);
        endRect = MN.measureSourceCaret(textarea, mirror, end);
      } catch (error) {
        startRect = null;
        endRect = null;
      }
      if (!startRect && !endRect) {
        setSelectionToolbar(null);
        return;
      }
      const first = startRect || endRect;
      const last = endRect || startRect;
      const width = 264;
      const height = 34;
      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const center = (first.left + last.left) / 2;
      const left = Math.max(8, Math.min(center - width / 2, viewportWidth - width - 8));
      let top = Math.min(first.top, last.top) - height - 8;
      if (top < 8) top = Math.min(viewportHeight - height - 8, Math.max(first.top, last.top) + first.height + 8);
      setSelectionToolbar((previous) =>
        previous && Math.abs(previous.left - left) < 1 && Math.abs(previous.top - top) < 1
          ? previous
          : { left, top },
      );
    });
  }, []);

  const applySourceSelectionFormat = (kind) => {
    const textarea = textareaRef && textareaRef.current;
    if (!textarea) return;
    const start = Math.min(textarea.selectionStart, textarea.selectionEnd);
    const end = Math.max(textarea.selectionStart, textarea.selectionEnd);
    const result = MN.wrapSourceSelection(textarea.value, start, end, kind);
    if (!result.changed) return;
    selectionToolbarSuppressRef.current = Date.now() + 300;
    hideSelectionToolbar();
    props.onChange(result.markdown);
    window.requestAnimationFrame(() => {
      const element = textareaRef && textareaRef.current;
      if (!element) return;
      element.focus();
      try {
        element.setSelectionRange(result.selectionStart, result.selectionEnd);
        if (props.onCaretChange) props.onCaretChange();
      } catch (error) {
        /* 选区恢复失败不影响格式写入 */
      }
    });
  };

  useEffect(() => {
    const onViewportChange = () => hideSelectionToolbar();
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [hideSelectionToolbar]);

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
      hideSelectionToolbar();
      if (!(event && event.nativeEvent && event.nativeEvent.isComposing)) detectSlashInput(event);
    },
    onCompositionEnd: (event) => detectSlashInput(event),
    onFocus: props.onFocus,
    onBlur: (event) => {
      closeSlashMenu();
      hideSelectionToolbar();
      if (props.onBlur) props.onBlur(event);
    },
    onScroll: (event) => {
      closeSlashMenu();
      hideSelectionToolbar();
      if (props.onScroll) props.onScroll(event);
    },
    onSelect: () => {
      if (props.onCaretChange) props.onCaretChange();
      updateSelectionToolbar();
    },
    onKeyUp: (event) => {
      if (props.onCaretChange) props.onCaretChange();
      updateSelectionToolbar();
      if (props.onKeyUp) props.onKeyUp(event);
    },
    onClick: () => {
      if (slashMenu) closeSlashMenu();
      updateSelectionToolbar();
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

  const selectionElement =
    selectionToolbar === null
      ? null
      : h(MN.SelectionToolbar, {
          left: selectionToolbar.left,
          top: selectionToolbar.top,
          onAction: applySourceSelectionFormat,
        });

  return h(MN.React.Fragment, null, textarea, menuElement, selectionElement);
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

/** 表格行列快捷编辑：line 为表格起始行，rowIndex 为 tr 下标（0 是表头）。 */
MN.editTableMarkdown = function editTableMarkdown(markdown, line, rowIndex, columnIndex, action) {
  const text = String(markdown === undefined || markdown === null ? '' : markdown);
  const lines = text.split('\n');
  const headerIndex = Number(line) - 1;
  const isTableLine = (value) => String(value || '').trim().includes('|');
  if (headerIndex < 0 || !isTableLine(lines[headerIndex]) || !isTableLine(lines[headerIndex + 1])) {
    return { markdown: text, changed: false };
  }
  const parse = (value) => {
    let raw = String(value || '').trim();
    if (raw.startsWith('|')) raw = raw.slice(1);
    if (raw.endsWith('|')) raw = raw.slice(0, -1);
    return raw.split('|').map((cell) => cell.trim());
  };
  const format = (cells) => '| ' + cells.join(' | ') + ' |';
  const header = parse(lines[headerIndex]);
  let bodyEnd = headerIndex + 2;
  while (bodyEnd < lines.length && lines[bodyEnd].trim() !== '' && isTableLine(lines[bodyEnd])) bodyEnd += 1;
  const bodyCount = bodyEnd - (headerIndex + 2);
  const columnCount = Math.max(header.length, 1);
  const emptyRow = () => format(new Array(columnCount).fill(''));
  const rowIndexNumber = Math.max(0, Number(rowIndex) || 0);
  if (action === 'rowAbove' || action === 'rowBelow') {
    let bodyIndex = 0;
    if (rowIndexNumber > 0) bodyIndex = action === 'rowAbove' ? rowIndexNumber - 1 : rowIndexNumber;
    bodyIndex = Math.max(0, Math.min(bodyCount, bodyIndex));
    lines.splice(headerIndex + 2 + bodyIndex, 0, emptyRow());
    return { markdown: lines.join('\n'), changed: true };
  }
  if (action === 'colLeft' || action === 'colRight') {
    const at = Math.max(0, Number(columnIndex) || 0) + (action === 'colRight' ? 1 : 0);
    const insertCell = (cells) => {
      const next = cells.slice();
      while (next.length < at) next.push('');
      next.splice(at, 0, '');
      return next;
    };
    lines[headerIndex] = format(insertCell(header));
    const separator = insertCell(parse(lines[headerIndex + 1]));
    separator[at] = '---';
    lines[headerIndex + 1] = format(separator);
    for (let index = headerIndex + 2; index < bodyEnd; index += 1) {
      lines[index] = format(insertCell(parse(lines[index])));
    }
    return { markdown: lines.join('\n'), changed: true };
  }
  if (action === 'rowDelete') {
    if (rowIndexNumber <= 0) return { markdown: text, changed: false };
    const sourceIndex = headerIndex + 2 + (rowIndexNumber - 1);
    if (sourceIndex < headerIndex + 2 || sourceIndex >= bodyEnd) return { markdown: text, changed: false };
    lines.splice(sourceIndex, 1);
    return { markdown: lines.join('\n'), changed: true };
  }
  if (action === 'colDelete') {
    if (header.length <= 1) return { markdown: text, changed: false };
    const at = Math.max(0, Math.min(header.length - 1, Number(columnIndex) || 0));
    const deleteCell = (cells) => {
      const next = cells.slice();
      if (at < next.length) next.splice(at, 1);
      return next;
    };
    lines[headerIndex] = format(deleteCell(header));
    lines[headerIndex + 1] = format(deleteCell(parse(lines[headerIndex + 1])));
    for (let index = headerIndex + 2; index < bodyEnd; index += 1) {
      lines[index] = format(deleteCell(parse(lines[index])));
    }
    return { markdown: lines.join('\n'), changed: true };
  }
  return { markdown: text, changed: false };
};


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

/** 图片预览：初始适应窗口比例 / 缩放范围 / 以某点为中心缩放后的偏移。 */
MN.imageViewerFitScale = function imageViewerFitScale(naturalWidth, naturalHeight, availableWidth, availableHeight) {
  const width = Math.max(1, Number(naturalWidth) || 1);
  const height = Math.max(1, Number(naturalHeight) || 1);
  const maxWidth = Math.max(64, Number(availableWidth) || 64);
  const maxHeight = Math.max(64, Number(availableHeight) || 64);
  return Math.max(0.02, Math.min(1, maxWidth / width, maxHeight / height));
};

MN.imageViewerClampScale = function imageViewerClampScale(value, fitScale) {
  const fit = Math.max(0.02, Number(fitScale) || 1);
  const min = Math.max(0.02, fit * 0.25);
  const max = Math.max(8, fit * 8);
  return Math.max(min, Math.min(max, Number(value) || fit));
};

MN.imageViewerZoomOffset = function imageViewerZoomOffset(offset, currentScale, nextScale, cx, cy) {
  const current = Number(currentScale) || 1;
  const ratio = (Number(nextScale) || current) / current;
  return {
    x: cx - (cx - (offset.x || 0)) * ratio,
    y: cy - (cy - (offset.y || 0)) * ratio,
  };
};

/** 预览图片双击后的全屏查看层：滚轮缩放、拖拽平移、适应窗口 / 1:1。 */
MN.ImageViewer = function ImageViewer(props) {
  const [scale, setScale] = useState(0);
  const [fitScale, setFitScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const scaleRef = useRef(0);
  const dragRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root && typeof root.focus === 'function') {
      try {
        root.focus({ preventScroll: true });
      } catch (error) {
        /* 忽略聚焦失败 */
      }
    }
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const applyZoom = useCallback(
    (nextScale, clientX, clientY) => {
      const stage = stageRef.current;
      if (!stage) return;
      const current = scaleRef.current || fitScale;
      const clamped = MN.imageViewerClampScale(nextScale, fitScale);
      if (Math.abs(clamped - current) < 0.0001) return;
      const rect = stage.getBoundingClientRect();
      const cx = Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
      const cy = Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
      setOffset((previous) => MN.imageViewerZoomOffset(previous, current, clamped, cx, cy));
      scaleRef.current = clamped;
      setScale(clamped);
    },
    [fitScale],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        props.onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [props.onClose]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof stage.addEventListener !== 'function') return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const base = scaleRef.current || fitScale;
      const factor = event.deltaY < 0 ? 1.15 : 0.87;
      applyZoom(base * factor, event.clientX, event.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [applyZoom, fitScale]);

  const onImageLoad = (event) => {
    const image = event.currentTarget;
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const stage = stageRef.current;
    const availableWidth = stage ? Math.max(120, stage.clientWidth - 48) : Math.max(120, window.innerWidth * 0.88);
    const availableHeight = stage ? Math.max(120, stage.clientHeight - 48) : Math.max(120, window.innerHeight * 0.76);
    const fit = MN.imageViewerFitScale(width, height, availableWidth, availableHeight);
    setNatural({ width, height });
    setFitScale(fit);
    scaleRef.current = fit;
    setScale(fit);
    setOffset({ x: 0, y: 0 });
  };

  const resetFit = () => {
    scaleRef.current = fitScale;
    setScale(fitScale);
    setOffset({ x: 0, y: 0 });
  };

  const resetActual = () => {
    scaleRef.current = 1;
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        /* 忽略指针捕获失败 */
      }
    }
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.offset.x + event.clientX - drag.x,
      y: drag.offset.y + event.clientY - drag.y,
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const viewerButton = (key, label, title, onClick) =>
    h(
      'button',
      {
        key,
        type: 'button',
        className: 'mn-image-viewer-btn',
        title,
        'aria-label': title,
        onClick,
      },
      label,
    );

  const percent = scale > 0 ? Math.round(scale * 100) + '%' : '—';
  return h(
    'div',
    {
      ref: rootRef,
      tabIndex: -1,
      className: 'mn-image-viewer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': MN.t('imageViewer.title'),
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) props.onClose();
      },
    },
    h(
      'div',
      { className: 'mn-image-viewer-bar' },
      h(
        'div',
        { className: 'mn-image-viewer-caption' },
        h('span', { className: 'mn-image-viewer-name' }, props.alt || MN.t('imageViewer.title')),
        natural.width > 0 ? h('span', { className: 'mn-image-viewer-meta' }, natural.width + ' × ' + natural.height) : null,
      ),
      h(
        'div',
        { className: 'mn-image-viewer-actions' },
        viewerButton('out', '−', MN.t('imageViewer.zoomOut'), () => applyZoom((scaleRef.current || fitScale) / 1.25)),
        viewerButton('percent', percent, MN.t('imageViewer.fit'), resetFit),
        viewerButton('in', '+', MN.t('imageViewer.zoomIn'), () => applyZoom((scaleRef.current || fitScale) * 1.25)),
        viewerButton('fit', MN.t('imageViewer.fit'), MN.t('imageViewer.fit'), resetFit),
        viewerButton('actual', '1:1', MN.t('imageViewer.actual'), resetActual),
        h(
          'button',
          {
            type: 'button',
            className: 'mn-image-viewer-btn mn-image-viewer-close',
            title: MN.t('imageViewer.close'),
            'aria-label': MN.t('imageViewer.close'),
            onClick: props.onClose,
          },
          h(MN.Icon, { name: 'close', size: 15 }),
        ),
      ),
    ),
    h(
      'div',
      {
        ref: stageRef,
        className: 'mn-image-viewer-stage',
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onDoubleClick: () => {
          if (Math.abs((scaleRef.current || fitScale) - fitScale) < 0.0001) resetActual();
          else resetFit();
        },
      },
      failed
        ? h('div', { className: 'mn-image-viewer-error' }, MN.t('imageViewer.error'))
        : h('img', {
            src: props.src,
            alt: props.alt || '',
            draggable: false,
            className: 'mn-image-viewer-img',
            style: {
              transform: 'translate(' + offset.x + 'px, ' + offset.y + 'px) scale(' + scale + ')',
              opacity: scale > 0 ? 1 : 0,
            },
            onLoad: onImageLoad,
            onError: () => setFailed(true),
          }),
    ),
  );
};


/** 代码块收起状态：按笔记路径存入 localStorage，重新打开文档时恢复。 */
function codeCollapseStorageKey(notePath) {
  return 'mn-code-collapsed:' + encodeURIComponent(String(notePath || ''));
}

function loadCollapsedCodeBlocks(notePath) {
  if (!notePath) return new Set();
  try {
    const raw = window.localStorage.getItem(codeCollapseStorageKey(notePath));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value) => Number.isInteger(value) && value >= 0));
  } catch (error) {
    return new Set();
  }
}

function saveCollapsedCodeBlocks(notePath, indexes) {
  if (!notePath) return;
  try {
    window.localStorage.setItem(
      codeCollapseStorageKey(notePath),
      JSON.stringify(Array.from(indexes).filter((value) => Number.isInteger(value) && value >= 0).sort((a, b) => a - b)),
    );
  } catch (error) {
    /* localStorage 不可用时只保留当前会话内的状态 */
  }
}

function setCodeBlockCollapsed(block, collapsed) {
  if (!block) return;
  if (collapsed) block.setAttribute('data-collapsed', 'true');
  else block.removeAttribute('data-collapsed');
  const toggle = typeof block.querySelector === 'function' ? block.querySelector('.mn-code-toggle') : null;
  if (!toggle) return;
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.setAttribute('title', collapsed ? '展开代码块' : '收起代码块');
  toggle.setAttribute('aria-label', collapsed ? '展开代码块' : '收起代码块');
  const label = toggle.querySelector('.mn-code-toggle-text');
  if (label) label.textContent = collapsed ? '▸ 展开' : '▾ 收起';
}

function applyCodeCollapseStates(editor, indexes) {
  if (!editor || !indexes || typeof editor.querySelectorAll !== 'function') return;
  const blocks = editor.querySelectorAll('.mn-code-block[data-code-index]');
  for (const block of blocks) {
    const index = Number.parseInt(block.getAttribute('data-code-index'), 10);
    if (Number.isFinite(index)) setCodeBlockCollapsed(block, indexes.has(index));
  }
}

MN.loadCollapsedCodeBlocks = loadCollapsedCodeBlocks;
MN.saveCollapsedCodeBlocks = saveCollapsedCodeBlocks;
MN.applyCodeCollapseStates = applyCodeCollapseStates;

MN.RichEditor = function RichEditor(props) {
  const elementRef = useRef(null);
  const lastEmittedRef = useRef(typeof props.markdown === 'string' ? props.markdown : '');
  const notePathRef = useRef(props.notePath || '');
  notePathRef.current = props.notePath || '';
  const collapsedCodeRef = useRef(loadCollapsedCodeBlocks(props.notePath || ''));
  const [seedHtml, setSeedHtml] = useState(() => MN.md.render(props.markdown || '', { mediaUrl: MN.mediaUrl, trackLines: true }));
  const uploadRef = useRef(props.uploadImage);
  uploadRef.current = props.uploadImage;

  // 图片选中 / 缩放：overlay 用 fixed 定位跟随图片，窗口滚动或尺寸变化时重新对齐。
  const selectedImageRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const [tableMenu, setTableMenu] = useState(null);
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  const selectionFrameRef = useRef(0);
  const selectionToolbarSuppressRef = useRef(0);
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

  const hideSelectionToolbar = useCallback(() => {
    if (selectionFrameRef.current !== 0) {
      window.cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = 0;
    }
    setSelectionToolbar(null);
  }, []);

  const updateSelectionToolbar = useCallback(() => {
    if (selectionFrameRef.current !== 0) return;
    selectionFrameRef.current = window.requestAnimationFrame(() => {
      selectionFrameRef.current = 0;
      if (Date.now() < selectionToolbarSuppressRef.current) {
        setSelectionToolbar(null);
        return;
      }
      const editor = elementRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setSelectionToolbar(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
        setSelectionToolbar(null);
        return;
      }
      if (String(selection.toString() || '').trim() === '') {
        setSelectionToolbar(null);
        return;
      }
      const startElement = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const endElement = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
      const forbidden = 'pre, code, table, .mn-code-block, .mn-table-wrap, select, input';
      if (
        (startElement && startElement.closest(forbidden)) ||
        (endElement && endElement.closest(forbidden))
      ) {
        setSelectionToolbar(null);
        return;
      }
      let rect = null;
      try {
        const rects = range.getClientRects ? Array.from(range.getClientRects()) : [];
        rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      } catch (error) {
        rect = null;
      }
      if (!rect || (rect.width < 1 && rect.height < 1)) {
        setSelectionToolbar(null);
        return;
      }
      const width = 264;
      const height = 34;
      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - 8));
      let top = rect.top - height - 8;
      if (top < 8) top = Math.min(viewportHeight - height - 8, rect.bottom + 8);
      setSelectionToolbar((previous) =>
        previous && Math.abs(previous.left - left) < 1 && Math.abs(previous.top - top) < 1
          ? previous
          : { left, top },
      );
    });
  }, []);

  useEffect(() => {
    const editor = elementRef.current;
    if (!editor) return undefined;
    const onSelectionChange = () => updateSelectionToolbar();
    const onScroll = () => hideSelectionToolbar();
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      if (selectionFrameRef.current !== 0) {
        window.cancelAnimationFrame(selectionFrameRef.current);
        selectionFrameRef.current = 0;
      }
    };
  }, [hideSelectionToolbar, updateSelectionToolbar]);


  const openTableMenu = (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const cell = target.closest('td,th');
    if (!cell) return;
    const wrapper = cell.closest('.mn-table-wrap');
    const row = cell.closest('tr');
    const table = cell.closest('table');
    if (!wrapper || !row || !table) return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const rowIndex = rows.indexOf(row);
    const cells = Array.from(row.children || []).filter((child) => /^(TD|TH)$/.test(child.tagName || ''));
    const columnIndex = cells.indexOf(cell);
    const line = Number.parseInt(wrapper.getAttribute('data-line'), 10);
    if (!Number.isFinite(line) || rowIndex < 0 || columnIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const editor = elementRef.current;
    if (editor) {
      editor.querySelectorAll('.mn-cell-selected').forEach((selected) => selected.classList.remove('mn-cell-selected'));
    }
    if (cell.tagName === 'TD') cell.classList.add('mn-cell-selected');
    const headerCells = rows.length > 0 ? Array.from(rows[0].children || []).filter((child) => /^(TD|TH)$/.test(child.tagName || '')) : [];
    setTableMenu({
      x: event.clientX,
      y: event.clientY,
      line,
      rowIndex,
      columnIndex,
      columnCount: headerCells.length || cells.length,
    });
  };

  const applyTableAction = (action) => {
    const menu = tableMenu;
    setTableMenu(null);
    if (!menu) return;
    const result = MN.editTableMarkdown(props.markdown, menu.line, menu.rowIndex, menu.columnIndex, action);
    if (!result.changed) return;
    lastEmittedRef.current = result.markdown;
    const editor = elementRef.current;
    const scrollTop = editor ? editor.scrollTop : 0;
    setSeedHtml(MN.md.render(result.markdown, { mediaUrl: MN.mediaUrl, trackLines: true }));
    props.onChange(result.markdown);
    if (editor) {
      window.requestAnimationFrame(() => {
        editor.scrollTop = scrollTop;
      });
    }
  };


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
    const onToggleCode = (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      const toggle = target.closest('.mn-code-toggle');
      if (!toggle) {
        const cell = target.closest('td,th');
        const editor = elementRef.current;
        if (editor) {
          editor.querySelectorAll('.mn-cell-selected').forEach((selected) => selected.classList.remove('mn-cell-selected'));
        }
        if (cell && cell.tagName === 'TD') cell.classList.add('mn-cell-selected');
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const block = toggle.closest('.mn-code-block');
      if (!block) return;
      const collapsed = block.getAttribute('data-collapsed') === 'true';
      setCodeBlockCollapsed(block, !collapsed);
      const index = Number.parseInt(block.getAttribute('data-code-index'), 10);
      if (Number.isFinite(index) && notePathRef.current) {
        if (collapsed) collapsedCodeRef.current.delete(index);
        else collapsedCodeRef.current.add(index);
        saveCollapsedCodeBlocks(notePathRef.current, collapsedCodeRef.current);
      }
    };
    editor.addEventListener('change', listener, true);
    editor.addEventListener('click', onToggleCode, true);
    return () => {
      editor.removeEventListener('change', listener, true);
      editor.removeEventListener('click', onToggleCode, true);
    };
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

  // 笔记切换或重新挂载时恢复代码块收起状态。
  useEffect(() => {
    const path = props.notePath || '';
    notePathRef.current = path;
    collapsedCodeRef.current = loadCollapsedCodeBlocks(path);
    applyCodeCollapseStates(elementRef.current, collapsedCodeRef.current);
  }, [props.notePath]);

  // 重新渲染（语言切换 / 外部编辑 / 打开文档）后重新套用收起状态。
  useEffect(() => {
    applyCodeCollapseStates(elementRef.current, collapsedCodeRef.current);
  }, [seedHtml]);

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

  /** 双击图片恢复原始尺寸（Alt+双击保留原行为）。 */
  const resetImageSize = (target) => {
    target.removeAttribute('width');
    target.removeAttribute('height');
    if (target.style) {
      target.style.width = '';
      target.style.height = '';
    }
    emit();
    syncImageOverlay();
  };

  /** 双击图片打开大图查看层；Alt+双击仍恢复原始尺寸。 */
  const handleEditorDoubleClick = (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.altKey) {
      resetImageSize(target);
      return;
    }
    const src = target.currentSrc || target.src;
    if (!src) return;
    setImageViewer({ src, alt: target.alt || '' });
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

  const selectionToolbarElement =
    selectionToolbar === null
      ? null
      : h(MN.SelectionToolbar, {
          left: selectionToolbar.left,
          top: selectionToolbar.top,
          onAction: (kind) => {
            selectionToolbarSuppressRef.current = Date.now() + 300;
            hideSelectionToolbar();
            exec(kind);
          },
        });

  const tableMenuItems = [];
  if (tableMenu !== null) {
    tableMenuItems.push(
      { id: 'row-above', label: MN.t('table.rowAbove'), onClick: () => applyTableAction('rowAbove') },
      { id: 'row-below', label: MN.t('table.rowBelow'), onClick: () => applyTableAction('rowBelow') },
      { separator: true },
      { id: 'col-left', label: MN.t('table.colLeft'), onClick: () => applyTableAction('colLeft') },
      { id: 'col-right', label: MN.t('table.colRight'), onClick: () => applyTableAction('colRight') },
      { separator: true },
    );
    if (tableMenu.rowIndex > 0) {
      tableMenuItems.push({ id: 'row-delete', label: MN.t('table.rowDelete'), danger: true, onClick: () => applyTableAction('rowDelete') });
    }
    if (tableMenu.columnCount > 1) {
      tableMenuItems.push({ id: 'col-delete', label: MN.t('table.colDelete'), danger: true, onClick: () => applyTableAction('colDelete') });
    }
  }

  const tableMenuElement =
    tableMenu === null
      ? null
      : h(MN.ContextMenu, {
          x: tableMenu.x,
          y: tableMenu.y,
          onClose: () => setTableMenu(null),
          items: tableMenuItems,
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

  const imageViewerElement = imageViewer
    ? h(MN.ImageViewer, {
        src: imageViewer.src,
        alt: imageViewer.alt,
        onClose: () => setImageViewer(null),
      })
    : null;

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
        onContextMenu: openTableMenu,
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
          hideSelectionToolbar();
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
    selectionToolbarElement,
    slashMenuElement,
    tableMenuElement,
    imageOverlayElement,
    imageViewerElement,
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
