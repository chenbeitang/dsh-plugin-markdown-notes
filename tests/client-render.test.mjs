/**
 * Client 组件离线冒烟测试：用轻量 React / DOM 桩执行组件渲染路径，捕获未定义引用与结构错误。
 * 不验证浏览器中的真实视觉表现（那需要已连接的页面）。
 * 运行：node tests/client-render.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const partDir = join(here, '..', 'src', 'client');
const PARTS = [
  '05-util.js',
  '10-markdown.js',
  '15-icons.js',
  '20-css.js',
  '30-dialogs.js',
  '35-tree.js',
  '40-editor.js',
  '50-page.js',
  '60-locale.js',
];
const source = PARTS.map((name) => readFileSync(join(partDir, name), 'utf8')).join('\n');

class StubComponent {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }
  setState(next) {
    this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) };
  }
}

const React = {
  Fragment: 'Fragment',
  Component: StubComponent,
  createElement(type, props, ...children) {
    const merged = { ...(props || {}) };
    if (children.length === 1) merged.children = children[0];
    else if (children.length > 1) merged.children = children;
    return { type, props: merged };
  },
};

let currentSelection = { rangeCount: 0, getRangeAt: () => null };

const windowStub = {
  innerWidth: 1280,
  innerHeight: 800,
  location: { origin: 'http://127.0.0.1:1', reload() {} },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: (fn) => fn(),
  getSelection: () => currentSelection,
  getComputedStyle: () => ({
    lineHeight: '20px',
    paddingTop: '0px',
    paddingLeft: '0px',
    fontFamily: 'sans-serif',
    fontSize: '14px',
    fontWeight: '400',
    fontStyle: 'normal',
    letterSpacing: 'normal',
    tabSize: '4',
    padding: '0px',
  }),
};
const documentStub = {
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }),
  querySelector: () => null,
  activeElement: null,
  createRange() {
    const range = {
      startOffset: 0,
      node: null,
      setStart(node, offset) {
        this.node = node;
        this.startOffset = offset;
      },
      collapse() {},
      getBoundingClientRect() {
        return {
          left: 100 + this.startOffset * 8,
          top: 200,
          width: 0,
          height: 20,
          right: 100 + this.startOffset * 8,
          bottom: 220,
        };
      },
      getClientRects() {
        return [this.getBoundingClientRect()];
      },
    };
    documentStub.lastRange = range;
    return range;
  },
};

function makeEnv() {
  const MN = { t: (key) => key };
  let values = [];
  let index = 0;
  const useState = (initial) => {
    const value = index < values.length ? values[index] : typeof initial === 'function' ? initial() : initial;
    index += 1;
    return [value, () => {}];
  };
  const useEffect = () => {};
  const useRef = (initial) => ({ current: initial === undefined ? null : initial });
  const useCallback = (fn) => fn;
  const useMemo = (fn) => fn();
  const h = React.createElement;
  const factory = new Function(
    'MN',
    'React',
    'h',
    'useState',
    'useEffect',
    'useRef',
    'useCallback',
    'useMemo',
    'Component',
    'window',
    'document',
    'fetch',
    'console',
    source,
  );
  factory(
    MN,
    React,
    h,
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    StubComponent,
    windowStub,
    documentStub,
    async () => ({ json: async () => ({}) }),
    console,
  );
  MN.React = React;
  return {
    MN,
    reset(next) {
      values = next || [];
      index = 0;
    },
  };
}

function childNodes(node) {
  if (!node || typeof node !== 'object' || !node.props) return [];
  const children = node.props.children;
  if (children === undefined || children === null) return [];
  return Array.isArray(children) ? children : [children];
}

function hasClass(node, className) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => hasClass(child, className));
  if (node.props && typeof node.props.className === 'string' && node.props.className.split(/\s+/).includes(className)) return true;
  return childNodes(node).some((child) => hasClass(child, className));
}

function collectText(node, out) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return;
  }
  if (typeof node !== 'object') return;
  if (node.props) collectText(node.props.children, out);
}

/** 找到第一个带指定 class 的宿主元素。 */
function findClass(node, className) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findClass(child, className);
      if (found) return found;
    }
    return null;
  }
  if (node.props && typeof node.props.className === 'string' && node.props.className.split(/\s+/).includes(className)) {
    return node;
  }
  for (const child of childNodes(node)) {
    const found = findClass(child, className);
    if (found) return found;
  }
  return null;
}

/** 递归执行函数组件，得到真正的宿主元素树（测试桩没有 React 协调器）。 */
function deepRender(env, node) {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map((child) => deepRender(env, child));
  if (typeof node !== 'object') return node;
  if (node.type === 'Fragment') return deepRender(env, node.props ? node.props.children : null);
  if (typeof node.type === 'function') {
    if (node.type.prototype && node.type.prototype.isReactComponent) return node;
    env.reset([]);
    return deepRender(env, node.type(node.props || {}));
  }
  if (node.props && node.props.children !== undefined) {
    return { ...node, props: { ...node.props, children: deepRender(env, node.props.children) } };
  }
  return node;
}

const fakeTree = [
  {
    type: 'folder',
    name: '工作',
    path: '工作',
    children: [{ type: 'note', name: '周报', fileName: '周报.md', path: '工作/周报.md', mtimeMs: 1, size: 10 }],
  },
];
const fakeNote = {
  path: '工作/周报.md',
  name: '周报',
  fileName: '周报.md',
  content: '# 周报\n\n- 完成 A\n\n**加粗**',
  mtimeMs: Date.now(),
  size: 30,
};
const fakeSettings = {
  storagePath: 'C:/notes',
  defaultStoragePath: 'C:/default-notes',
  dataDir: 'C:/profile/markdown-notes',
  isDefault: false,
  exists: true,
};
const fakeState = {
  settings: fakeSettings,
  tree: fakeTree,
  stats: { notes: 1, folders: 1 },
  favorites: ['工作/周报.md'],
  lastOpened: '工作/周报.md',
};

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    failures += 1;
    console.error('FAIL - ' + name + ': ' + (error && error.stack ? error.stack : error));
  }
}

check('AppPage renders the note workspace', () => {
  const env = makeEnv();
  env.reset([
    false,
    '',
    fakeState,
    new Set(['工作']),
    'split',
    true,
    0.5,
    false,
    null,
    null,
    '',
    null,
    false,
    fakeNote,
    false,
    'saved',
    Date.now(),
    '',
    'source',
    null,
    null,
    null,
    0,
  ]);
  const element = deepRender(env, env.MN.AppPage({ pickDirectory: async () => null }));
  assert.ok(hasClass(element, 'mn-root'));
  assert.ok(hasClass(element, 'mn-side'));
  assert.ok(hasClass(element, 'mn-toolbar'));
  assert.ok(hasClass(element, 'mn-panes'));
  assert.ok(hasClass(element, 'mn-rich'));
  assert.ok(hasClass(element, 'mn-sync-toggle'));
  assert.ok(hasClass(element, 'mn-splitter'));
  assert.ok(hasClass(element, 'mn-side-resizer'));
  const text = [];
  collectText(element, text);
  assert.ok(text.join(' ').includes('周报'));
});

check('AppPage renders the empty state', () => {
  const env = makeEnv();
  const emptyState = { settings: fakeSettings, tree: [], stats: { notes: 0, folders: 0 }, favorites: [], lastOpened: null };
  env.reset([false, '', emptyState, new Set(), 'source', false, 0.5, false, null, null, '', null, false, null, false, 'saved', null, '', 'source', null, null, null, 0]);
  const element = deepRender(env, env.MN.AppPage({ pickDirectory: null }));
  assert.ok(hasClass(element, 'mn-root'));
  assert.ok(hasClass(element, 'mn-empty'));
});

check('AppPage collapses and expands the file sidebar', () => {
  const env = makeEnv();
  env.reset([
    false,
    '',
    fakeState,
    new Set(['工作']),
    'split',
    false,
    0.5,
    true,
    null,
    null,
    '',
    null,
    false,
    fakeNote,
    false,
    'saved',
    Date.now(),
    '',
    'source',
    null,
    null,
    null,
    0,
  ]);
  const element = deepRender(env, env.MN.AppPage({ pickDirectory: null }));
  assert.ok(!hasClass(element, 'mn-side'));
  assert.ok(hasClass(element, 'mn-side-expand'));
  assert.ok(hasClass(element, 'mn-main'));
});

check('TreeView renders folders, notes and favorites', () => {
  const env = makeEnv();
  env.reset([]);
  const element = deepRender(
    env,
    env.MN.TreeView({
      tree: fakeTree,
      allTree: fakeTree,
      favorites: new Set(['工作/周报.md']),
      noteCount: 1,
      expanded: new Set(['工作']),
      activePath: '工作/周报.md',
      onToggle() {},
      onOpen() {},
      onMenu() {},
      onMenuAt() {},
      onNewNote() {},
      onNewFolder() {},
      onFavorite() {},
    }),
  );
  const text = [];
  collectText(element, text);
  assert.ok(text.join('').includes('工作'));
  assert.ok(text.join('').includes('周报'));
});

check('SearchResults renders snippets', () => {
  const env = makeEnv();
  env.reset([]);
  const element = deepRender(
    env,
    env.MN.SearchResults({
      result: {
        total: 1,
        truncated: false,
        items: [{ path: '工作/周报.md', name: '周报', snippets: [{ line: 1, text: '# 周报' }] }],
      },
      onOpen() {},
      onClear() {},
    }),
  );
  const text = [];
  collectText(element, text);
  assert.ok(text.join(' ').includes('周报'));
});

check('Toolbar renders every action', () => {
  const env = makeEnv();
  env.reset([]);
  const element = deepRender(env, env.MN.Toolbar({ paneLabel: 'source', onAction() {}, onSave() {} }));
  const text = [];
  collectText(element, text);
  assert.ok(text.join('').includes('B'));
});

check('PromptDialog and ConfirmDialog render', () => {
  const promptEnv = makeEnv();
  promptEnv.reset(['abc']);
  const prompt = deepRender(
    promptEnv,
    promptEnv.MN.PromptDialog({
      title: 't',
      label: 'l',
      initial: 'abc',
      onCancel() {},
      onConfirm() {},
    }),
  );
  assert.ok(hasClass(prompt, 'mn-overlay'));
  const confirmEnv = makeEnv();
  confirmEnv.reset([]);
  const confirm = deepRender(
    confirmEnv,
    confirmEnv.MN.ConfirmDialog({
      title: 't',
      message: 'm',
      onCancel() {},
      onConfirm() {},
    }),
  );
  assert.ok(hasClass(confirm, 'mn-overlay'));
});

check('SettingsDialog renders', () => {
  const env = makeEnv();
  env.reset(['C:/notes', false, '', false]);
  const element = deepRender(
    env,
    env.MN.SettingsDialog({
      settings: fakeSettings,
      onClose() {},
      onSaved: async () => {},
      pickDirectory: async () => null,
    }),
  );
  assert.ok(hasClass(element, 'mn-overlay'));
  const text = [];
  collectText(element, text);
  assert.ok(text.join(' ').includes('C:/notes'));
});

check('ContextMenu renders items', () => {
  const env = makeEnv();
  env.reset([]);
  const element = deepRender(
    env,
    env.MN.ContextMenu({
      x: 20,
      y: 20,
      items: [{ id: 'a', label: '收藏', onClick() {} }],
      onClose() {},
    }),
  );
  assert.ok(hasClass(element, 'mn-context'));
});

check('SourceEditor and RichEditor render', () => {
  const env = makeEnv();
  env.reset([]);
  const sourceTree = deepRender(
    env,
    env.MN.SourceEditor({
      textareaRef: { current: null },
      value: '# hi',
      onChange() {},
      onFocus() {},
    }),
  );
  const sourceEditor = Array.isArray(sourceTree) ? sourceTree.find((node) => node && node.type === 'textarea') : sourceTree;
  assert.equal(sourceEditor.type, 'textarea');
  env.reset([{ left: 10, top: 20, index: 0 }]);
  const sourceMenuTree = deepRender(
    env,
    env.MN.SourceEditor({
      textareaRef: { current: null },
      value: '',
      onChange() {},
      onFocus() {},
    }),
  );
  assert.ok(hasClass(sourceMenuTree, 'mn-slash-menu'));
  const sourceMenuText = [];
  collectText(sourceMenuTree, sourceMenuText);
  assert.ok(sourceMenuText.join(' ').includes('slash.code'));
  const sourceMenuJoined = sourceMenuText.join(' ');
  const expectedOrder = [
    'slash.code',
    'slash.quote',
    'slash.divider',
    'slash.table',
    'slash.task',
    'slash.ordered',
    'slash.bullet',
    'slash.heading3',
    'slash.heading2',
    'slash.heading1',
    'slash.paragraph',
  ];
  const positions = expectedOrder.map((key) => sourceMenuJoined.indexOf(key));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  env.reset([]);
  const richRoot = deepRender(
    env,
    env.MN.RichEditor({
      markdown: '# hi\n\n**bold**',
      onChange() {},
      onFocus() {},
      uploadImage: async () => null,
      apiRef: { current: null },
    }),
  );
  assert.ok(hasClass(richRoot, 'mn-rich'));
  const rich = findClass(richRoot, 'mn-rich');
  const seedHtml = String(rich.props.dangerouslySetInnerHTML.__html);
  assert.match(seedHtml, /<h1[ >]/);
  assert.match(seedHtml, /data-line="1"/);
});

check('slash block insertion targets the empty block', () => {
  const env = makeEnv();
  env.reset([]);
  const empty = env.MN.slashInsertMarkdown('', null, '```\n\n```');
  assert.equal(empty.markdown, '```\n\n```');
  assert.equal(empty.line, 1);

  const byLine = env.MN.slashInsertMarkdown('a\n\nb', { getAttribute: (name) => (name === 'data-line' ? '2' : null) }, '> ');
  assert.equal(byLine.markdown, 'a\n\n> \n\nb');
  assert.equal(byLine.line, 3);

  const between = env.MN.slashInsertMarkdown(
    'a\n\nb',
    {
      getAttribute: () => null,
      previousElementSibling: { getAttribute: (name) => (name === 'data-line-end' ? '1' : null) },
      nextElementSibling: { getAttribute: (name) => (name === 'data-line' ? '3' : null) },
    },
    '---',
  );
  assert.equal(between.markdown, 'a\n\n---\n\nb');
  assert.equal(between.line, 3);
});

check('slash source insertion replaces the empty line', () => {
  const env = makeEnv();
  env.reset([]);
  assert.deepEqual(env.MN.slashInsertSourceMarkdown('', 0, '# '), { markdown: '# ', line: 1 });
  assert.deepEqual(env.MN.slashInsertSourceMarkdown('a\n\nb', 1, '---'), { markdown: 'a\n\n---\n\nb', line: 3 });
  assert.deepEqual(env.MN.slashInsertSourceMarkdown('a\n', 1, '```\n\n```'), {
    markdown: 'a\n\n```\n\n```',
    line: 3,
  });
  assert.deepEqual(env.MN.slashInsertSourceMarkdown('/\n', 0, '# '), { markdown: '# ', line: 1 });
  assert.deepEqual(env.MN.slashInsertSourceMarkdown('a\n、\nb', 1, '---'), { markdown: 'a\n\n---\n\nb', line: 3 });
});

check('slash source trigger only matches an optional whole-line character', () => {
  const env = makeEnv();
  env.reset([]);
  assert.equal(env.MN.sourceSlashTrigger('/'), '/');
  assert.equal(env.MN.sourceSlashTrigger('、'), '、');
  assert.equal(env.MN.sourceSlashTrigger('  /'), '/');
  assert.equal(env.MN.sourceSlashTrigger('/ '), null);
  assert.equal(env.MN.sourceSlashTrigger('/a'), null);
});

check('code fence language can be changed without touching the body', () => {
  const env = makeEnv();
  env.reset([]);
  const changed = env.MN.setCodeFenceLanguage('```js\nconst x = 1;\n```', 1, 'python');
  assert.equal(changed.changed, true);
  assert.equal(changed.markdown, '```python\nconst x = 1;\n```');

  const plain = env.MN.setCodeFenceLanguage('```java\nclass A {}\n```', 1, 'text');
  assert.equal(plain.markdown, '```\nclass A {}\n```');

  const untouched = env.MN.setCodeFenceLanguage('plain text', 1, 'java');
  assert.equal(untouched.changed, false);
  assert.equal(untouched.markdown, 'plain text');
});

check('RichEditor renders the slash block menu', () => {
  const env = makeEnv();
  env.reset(['<p>hi</p>', null, { left: 20, top: 30, index: 0 }]);
  const root = deepRender(
    env,
    env.MN.RichEditor({
      markdown: '',
      onChange() {},
      onFocus() {},
      uploadImage: async () => null,
      apiRef: { current: null },
    }),
  );
  assert.ok(hasClass(root, 'mn-slash-menu'));
  const text = [];
  collectText(root, text);
  assert.ok(text.join(' ').includes('slash.code'));
  assert.ok(text.join(' ').includes('slash.table'));
  assert.ok(text.join(' ').includes('slash.divider'));
});

check('htmlToMarkdown keeps image width', () => {
  const env = makeEnv();
  env.reset([]);
  const image = {
    nodeType: 1,
    tagName: 'IMG',
    childNodes: [],
    style: {},
    getAttribute(name) {
      if (name === 'src') return 'http://127.0.0.1:1/markdown-notes/api/media?path=assets%2Fa.png';
      if (name === 'alt') return 'shot';
      if (name === 'width') return '320';
      return null;
    },
  };
  const paragraph = {
    nodeType: 1,
    tagName: 'P',
    childNodes: [image],
    style: {},
    getAttribute() {
      return null;
    },
  };
  const root = {
    nodeType: 1,
    tagName: 'DIV',
    childNodes: [paragraph],
    style: {},
    getAttribute() {
      return null;
    },
  };
  const markdown = env.MN.md.htmlToMarkdown(root, { mediaRel: env.MN.mediaRelFromUrl });
  assert.equal(markdown, '![shot](assets/a.png){width=320}');
});

check('image resize math follows handles and clamps', () => {
  const env = makeEnv();
  env.reset([]);
  const resize = env.MN.imageResizeWidth;
  assert.equal(resize(300, 120, 0, 'e', 1.5, 900), 420);
  assert.equal(resize(300, 120, 0, 'se', 1.5, 900), 420);
  assert.equal(resize(300, 0, 60, 's', 2, 900), 420);
  assert.equal(resize(300, 0, -60, 's', 2, 900), 180);
  assert.equal(resize(300, -500, 0, 'e', 1, 900), 48);
  assert.equal(resize(300, 5000, 0, 'e', 1, 900), 900);
});

check('source position round trip', () => {
  const env = makeEnv();
  env.reset([]);
  const value = 'line one\n第二行 abc\nthird';
  const position = env.MN.sourcePosition(value, 15);
  assert.equal(position.line, 2);
  assert.equal(position.column, 6);
  assert.equal(position.lineText, '第二行 abc');
  const offset = env.MN.sourceOffsetFromPosition(value, 2, 6);
  assert.equal(offset, 15);
});

check('preview caret rect maps by block line', () => {
  const env = makeEnv();
  env.reset([]);
  const block = {
    getAttribute(name) {
      if (name === 'data-line') return '1';
      if (name === 'data-line-end') return '3';
      return null;
    },
    getBoundingClientRect() {
      return { left: 100, top: 200, width: 300, height: 60 };
    },
  };
  const preview = { querySelectorAll: () => [block] };
  const rect = env.MN.previewCaretRect(preview, 2, 5, 10);
  assert.equal(rect.top, 220);
  assert.equal(rect.height, 20);
  assert.equal(rect.left, 250);
  const element = { getBoundingClientRect: () => ({ left: 0, top: 190, width: 500, height: 200, right: 500, bottom: 390 }) };
  assert.equal(env.MN.caretVisibleIn(rect, element), true);
  assert.equal(env.MN.caretVisibleIn({ ...rect, top: 900 }, element), false);
});

check('source skeleton drops markdown-only characters', () => {
  const env = makeEnv();
  env.reset([]);
  assert.equal(env.MN.sourceLineSkeleton('## 标题 ##', 0, true).text, '标题');
  assert.equal(env.MN.sourceLineSkeleton('- [ ] task', 0, true).text, '[ ] task');
  assert.equal(env.MN.sourceLineSkeleton('[link](https://x) tail', 0, true).text, 'link tail');
  assert.equal(env.MN.sourceLineSkeleton('see ![alt](a.png) now', 0, true).text, 'see  now');
  assert.equal(env.MN.sourceLineSkeleton('<u>under</u>', 0, true).text, 'under');
  assert.equal(env.MN.sourceLineSkeleton('> - item', 0, true).text, 'item');
  assert.equal(env.MN.sourceLineSkeleton('- > literal', 0, true).text, '> literal');
  assert.equal(env.MN.sourceLineSkeleton('- # literal', 0, true).text, '# literal');
});

check('rendered text aligns to source characters', () => {
  const env = makeEnv();
  env.reset([]);
  const skeleton = env.MN.sourceLineSkeleton('**bold** and *em*', 0, true);
  const mapping = env.MN.alignRenderedText(skeleton, 'bold and em');
  assert.equal(skeleton.chars[mapping[0]].offset, 2);
  assert.equal(skeleton.chars[mapping[3]].offset, 5);
  assert.equal(skeleton.chars[mapping[5]].offset, 9);
  assert.equal(skeleton.chars[mapping[9]].offset, 14);

  const linkSkeleton = env.MN.sourceLineSkeleton('[link](https://x) tail', 0, true);
  const linkMapping = env.MN.alignRenderedText(linkSkeleton, 'link tail');
  assert.equal(linkSkeleton.chars[linkMapping[0]].offset, 1);
  assert.equal(linkSkeleton.chars[linkMapping[5]].offset, 18);

  const taskSkeleton = env.MN.sourceLineSkeleton('- [ ] task', 0, true);
  const taskMapping = env.MN.alignRenderedText(taskSkeleton, ' task');
  assert.equal(taskSkeleton.chars[taskMapping[1]].offset, 6);
});

check('exact char mapping positions the preview caret', () => {
  const env = makeEnv();
  env.reset([]);
  const value = '**bold** and text';
  const textNode = { nodeType: 3, nodeValue: 'bold and text', parentElement: null };
  const block = {
    nodeType: 1,
    tagName: 'P',
    childNodes: [textNode],
    classList: { contains: () => false },
    getAttribute(name) {
      if (name === 'data-line') return '1';
      if (name === 'data-line-end') return '1';
      return null;
    },
    getBoundingClientRect() {
      return { left: 90, top: 180, width: 400, height: 20 };
    },
  };
  textNode.parentElement = { closest: () => block };
  const preview = {
    querySelectorAll: () => [block],
    contains: (node) => node === block || node === textNode,
  };
  const atBold = env.MN.previewCaretRect(preview, value, 2);
  assert.equal(atBold.left, 100);
  assert.equal(atBold.height, 20);
  const atD = env.MN.previewCaretRect(preview, value, 5);
  assert.equal(atD.left, 124);

  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({
      startContainer: textNode,
      startOffset: 3,
      getBoundingClientRect: () => ({ left: 124, top: 200, width: 0, height: 20 }),
    }),
  };
  const position = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(position.line, 1);
  assert.equal(position.column, 5);
  currentSelection = { rangeCount: 0, getRangeAt: () => null };
});

check('blockquote with leading > maps characters', () => {
  const env = makeEnv();
  env.reset([]);
  const value = '> line one\n> line two';
  const text1 = { nodeType: 3, nodeValue: 'line one', parentElement: null };
  const text2 = { nodeType: 3, nodeValue: 'line two', parentElement: null };
  const br = { nodeType: 1, tagName: 'BR', childNodes: [], classList: { contains: () => false } };
  const paragraph = { nodeType: 1, tagName: 'P', childNodes: [text1, br, text2] };
  text1.parentElement = paragraph;
  text2.parentElement = paragraph;
  const block = {
    nodeType: 1,
    tagName: 'BLOCKQUOTE',
    childNodes: [paragraph],
    classList: { contains: () => false },
    getAttribute(name) {
      if (name === 'data-line') return '1';
      if (name === 'data-line-end') return '2';
      return null;
    },
    getBoundingClientRect: () => ({ left: 40, top: 80, width: 400, height: 40 }),
  };
  paragraph.closest = (selector) => (selector === '[data-line]' ? block : null);
  const preview = { querySelectorAll: () => [block], contains: () => true };

  const first = env.MN.previewCaretRect(preview, value, 2);
  assert.equal(first.left, 100);
  assert.equal(first.top, 200);
  const mid = env.MN.previewCaretRect(preview, value, 5);
  assert.equal(mid.left, 124);
  const second = env.MN.previewCaretRect(preview, value, 13);
  assert.equal(second.left, 100);
  assert.equal(second.top, 200);

  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: text2, startOffset: 2 }),
  };
  const position = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(position.line, 2);
  assert.equal(position.column, 4);

  // 内容可编辑区域把光标落在元素节点（而不是文本节点）时也要能定位。
  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({
      startContainer: paragraph,
      startOffset: 0,
      comparePoint: () => 1,
    }),
  };
  const elementPosition = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(elementPosition.line, 1);
  assert.equal(elementPosition.column, 2);
  currentSelection = { rangeCount: 0, getRangeAt: () => null };
});

check('blockquote ignores renderer newline text nodes between blocks', () => {
  const env = makeEnv();
  env.reset([]);
  const value = '> one\n> two\n>\n> three';
  const t1 = { nodeType: 3, nodeValue: 'one', parentElement: null };
  const t2 = { nodeType: 3, nodeValue: 'two', parentElement: null };
  const t3 = { nodeType: 3, nodeValue: 'three', parentElement: null };
  const br = { nodeType: 1, tagName: 'BR', childNodes: [], classList: { contains: () => false } };
  const p1 = { nodeType: 1, tagName: 'P', childNodes: [t1, br, t2] };
  const p2 = { nodeType: 1, tagName: 'P', childNodes: [t3] };
  t1.parentElement = p1;
  t2.parentElement = p1;
  t3.parentElement = p2;
  const separator = { nodeType: 3, nodeValue: '\n' };
  const block = {
    nodeType: 1,
    tagName: 'BLOCKQUOTE',
    childNodes: [p1, separator, p2],
    classList: { contains: () => false },
    getAttribute(name) {
      if (name === 'data-line') return '1';
      if (name === 'data-line-end') return '4';
      return null;
    },
    getBoundingClientRect: () => ({ left: 40, top: 80, width: 400, height: 60 }),
  };
  p1.closest = (selector) => (selector === '[data-line]' ? block : null);
  p2.closest = (selector) => (selector === '[data-line]' ? block : null);
  const preview = { querySelectorAll: () => [block], contains: () => true };

  const rect = env.MN.previewCaretRect(preview, value, 16);
  assert.equal(rect.left, 100);
  assert.equal(documentStub.lastRange.node, t3);
  assert.equal(documentStub.lastRange.startOffset, 0);

  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: t3, startOffset: 1 }),
  };
  const position = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(position.line, 4);
  assert.equal(position.column, 3);
  currentSelection = { rangeCount: 0, getRangeAt: () => null };
});

check('highlighted code spans keep character mapping', () => {
  const env = makeEnv();
  env.reset([]);
  const value = '```js\nconst x = 1;\n```';
  const keyword = { nodeType: 3, nodeValue: 'const', parentElement: null };
  const gap1 = { nodeType: 3, nodeValue: ' ', parentElement: null };
  const name = { nodeType: 3, nodeValue: 'x', parentElement: null };
  const gap2 = { nodeType: 3, nodeValue: ' ', parentElement: null };
  const equal = { nodeType: 3, nodeValue: '=', parentElement: null };
  const gap3 = { nodeType: 3, nodeValue: ' ', parentElement: null };
  const number = { nodeType: 3, nodeValue: '1', parentElement: null };
  const semi = { nodeType: 3, nodeValue: ';', parentElement: null };
  const keywordSpan = { nodeType: 1, tagName: 'SPAN', childNodes: [keyword], classList: { contains: () => false } };
  const operatorSpan = { nodeType: 1, tagName: 'SPAN', childNodes: [equal], classList: { contains: () => false } };
  const numberSpan = { nodeType: 1, tagName: 'SPAN', childNodes: [number], classList: { contains: () => false } };
  keyword.parentElement = keywordSpan;
  gap1.parentElement = null;
  name.parentElement = null;
  gap2.parentElement = null;
  equal.parentElement = operatorSpan;
  gap3.parentElement = null;
  number.parentElement = numberSpan;
  semi.parentElement = null;
  const code = {
    nodeType: 1,
    tagName: 'CODE',
    childNodes: [keywordSpan, gap1, name, gap2, operatorSpan, gap3, numberSpan, semi],
    classList: { contains: () => false },
  };
  keywordSpan.parentElement = code;
  operatorSpan.parentElement = code;
  numberSpan.parentElement = code;
  gap1.parentElement = code;
  name.parentElement = code;
  gap2.parentElement = code;
  gap3.parentElement = code;
  semi.parentElement = code;
  const block = {
    nodeType: 1,
    tagName: 'PRE',
    childNodes: [code],
    classList: { contains: () => false },
    getAttribute(nameAttr) {
      if (nameAttr === 'data-line') return '1';
      if (nameAttr === 'data-line-end') return '3';
      return null;
    },
    closest(selector) {
      return selector === '[data-line]' ? block : null;
    },
    getBoundingClientRect: () => ({ left: 40, top: 80, width: 400, height: 40 }),
  };
  code.parentElement = block;
  code.closest = (selector) => (selector === '[data-line]' ? block : null);
  const preview = { querySelectorAll: () => [block], contains: () => true };

  const rect = env.MN.previewCaretRect(preview, value, 16);
  const caretNode = documentStub.lastRange.node;
  const caretOffset = documentStub.lastRange.startOffset;
  const caretAtNumberStart =
    (caretNode === number && caretOffset === 0) || (caretNode === gap3 && caretOffset === 1);
  assert.ok(caretAtNumberStart, 'caret should sit before the highlighted number');
  assert.equal(rect.top, 200);
  assert.equal(rect.height, 20);

  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: gap1, startOffset: 0 }),
  };
  const position = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(position.line, 2);
  assert.equal(position.column, 5);
  currentSelection = { rangeCount: 0, getRangeAt: () => null };
});

check('multiline code selection maps to the right source line', () => {
  const env = makeEnv();
  env.reset([]);
  const value = '```\nfirst\nsecond\n```';
  const text = { nodeType: 3, nodeValue: 'first\nsecond', parentElement: null };
  const code = {
    nodeType: 1,
    tagName: 'CODE',
    childNodes: [text],
    classList: { contains: () => false },
  };
  const block = {
    nodeType: 1,
    tagName: 'PRE',
    childNodes: [code],
    classList: { contains: () => false },
    getAttribute(name) {
      if (name === 'data-line') return '1';
      if (name === 'data-line-end') return '4';
      return null;
    },
    closest(selector) {
      return selector === '[data-line]' ? block : null;
    },
  };
  text.parentElement = code;
  code.parentElement = block;
  code.closest = (selector) => (selector === '[data-line]' ? block : null);
  const preview = { querySelectorAll: () => [block], contains: () => true };

  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: text, startOffset: 6 }),
  };
  const position = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(position.line, 3);
  assert.equal(position.column, 0);
  currentSelection = { rangeCount: 0, getRangeAt: () => null };
});

check('table cells map characters both ways', () => {
  const env = makeEnv();
  env.reset([]);
  const value = '| 名称 | 说明 |\n| --- | --- |\n| A | B |';
  let wrapper = null;
  const headerText = { nodeType: 3, nodeValue: '名称', parentElement: null };
  const headerCell = {
    nodeType: 1,
    tagName: 'TH',
    childNodes: [headerText],
    closest(selector) {
      if (selector === 'td,th') return headerCell;
      if (selector === 'tr') return headerRow;
      if (selector === '[data-line]') return wrapper;
      return null;
    },
  };
  headerText.parentElement = headerCell;
  const headerRow = {
    nodeType: 1,
    tagName: 'TR',
    children: [headerCell],
    closest(selector) {
      return selector === 'thead' ? {} : null;
    },
  };
  const bodyText = { nodeType: 3, nodeValue: 'A', parentElement: null };
  const bodyCell = {
    nodeType: 1,
    tagName: 'TD',
    childNodes: [bodyText],
    closest(selector) {
      if (selector === 'td,th') return bodyCell;
      if (selector === 'tr') return bodyRow;
      if (selector === '[data-line]') return wrapper;
      return null;
    },
  };
  bodyText.parentElement = bodyCell;
  const bodyRow = {
    nodeType: 1,
    tagName: 'TR',
    children: [bodyCell],
    closest() {
      return null;
    },
  };
  const table = { querySelectorAll: () => [headerRow, bodyRow] };
  wrapper = {
    nodeType: 1,
    tagName: 'DIV',
    classList: { contains: (name) => name === 'mn-table-wrap' },
    getAttribute(name) {
      if (name === 'data-line') return '1';
      if (name === 'data-line-end') return '3';
      return null;
    },
    querySelector: () => table,
    getBoundingClientRect: () => ({ left: 50, top: 100, width: 300, height: 90 }),
  };
  const preview = { querySelectorAll: () => [wrapper], contains: () => true };

  const caret = env.MN.previewCaretRect(preview, value, 2);
  assert.equal(caret.left, 100);
  assert.equal(caret.height, 20);

  currentSelection = {
    rangeCount: 1,
    getRangeAt: () => ({ startContainer: headerText, startOffset: 1 }),
  };
  const position = env.MN.previewSelectionToPosition(preview, value);
  assert.equal(position.line, 1);
  assert.equal(position.column, 3);
  currentSelection = { rangeCount: 0, getRangeAt: () => null };
});

if (failures > 0) {
  console.error(failures + ' client render checks failed');
  process.exit(1);
}
console.log('all client render tests passed');
