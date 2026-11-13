/**
 * 笔记管理器主页面：目录树、编辑器、收藏、搜索、设置与自动保存。
 *
 * @module @local/markdown-notes/src/client/50-page
 */

/** 把标题行里的常见 Markdown 标记去掉，得到纯文本目录标题。 */
function headingPlainText(raw) {
  return String(raw || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+.!>-])/g, '$1')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

/** 提取 Markdown 的 # 标题（跳过 fenced code block 里的伪标题）。 */
function extractHeadings(markdown) {
  const lines = String(markdown === undefined || markdown === null ? '' : markdown).split('\n');
  const headings = [];
  let fence = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === '') fence = marker;
      else if (fence === marker) fence = '';
      continue;
    }
    if (fence !== '') continue;
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (!heading) continue;
    const text = headingPlainText(heading[2]);
    if (text === '') continue;
    headings.push({ level: heading[1].length, text, line: index + 1 });
  }
  return headings;
}

MN.extractHeadings = extractHeadings;

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
  const navOpen = Boolean(raw && raw.navOpen === true);
  return { view, expanded, syncScroll, splitRatio, sideCollapsed, sideWidth, navOpen };
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
  const [navOpen, setNavOpen] = useState(initialPrefs.navOpen);
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
      let rect = MN.measureSourceCaret(source, sourceMirrorRef.current, offset);
      // 点击预览定位到原文时，若目标行在原文视口外，原文栏自动滚到该行，
      // 否则光标提示会被隐藏，看起来像“没有定位成功”。
      if (rect && !MN.caretVisibleIn(rect, source)) {
        const target = MN.sourceScrollTopToReveal(source, rect);
        if (target !== null && Math.abs(target - source.scrollTop) > 1) {
          scrollSyncRef.current.lockUntil = Date.now() + 180;
          source.scrollTop = target;
          rect = MN.measureSourceCaret(source, sourceMirrorRef.current, offset);
        }
      }
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

  // 面板尺寸变化 / 内容变化后重新定位。除窗口缩放外，文件栏调宽、
  // 分栏拖动也会改变编辑器实际宽度，需要监听 pane 自身尺寸。
  useEffect(() => {
    if (view !== 'split') return undefined;
    const onResize = () => scheduleGhostCaret();
    window.addEventListener('resize', onResize);
    let observer = null;
    const panes = panesRef.current;
    if (panes && typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(onResize);
      observer.observe(panes);
      panes.querySelectorAll('.mn-pane').forEach((pane) => observer.observe(pane));
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (observer) observer.disconnect();
    };
  }, [view, scheduleGhostCaret, note !== null]);

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
        navOpen,
        expanded: Array.from(expanded),
        lastOpened: lastOpenRef.current,
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [view, syncScroll, splitRatio, sideCollapsed, sideWidth, navOpen, expanded]);

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
      scheduleGhostCaret();
    }
    sideDragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, [scheduleGhostCaret]);

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
  const outlineHeadings = note ? extractHeadings(note.content) : [];

  /** 点击目录项：分别把原文 textarea 和渲染视图滚动到标题所在行。 */
  const scrollToOutlineLine = (line) => {
    // 目录跳转的两次滚动是显式定位，短暂压住同步滚动，避免被回环覆盖。
    scrollSyncRef.current.lockUntil = Date.now() + 120;
    const value = noteRef.current ? noteRef.current.content : '';
    const source = sourceRef.current;
    if (source) {
      const offset = MN.sourceOffsetFromPosition(value, line, 0);
      let delta = null;
      try {
        const rect = MN.measureSourceCaret(source, sourceMirrorRef.current, offset);
        if (rect) delta = rect.top - source.getBoundingClientRect().top;
      } catch (error) {
        delta = null;
      }
      if (delta === null) {
        const style = window.getComputedStyle(source);
        const lineHeight = Number.parseFloat(style.lineHeight) || 22.75;
        const paddingTop = Number.parseFloat(style.paddingTop) || 0;
        delta = paddingTop + (line - 1) * lineHeight - source.scrollTop;
      }
      source.scrollTop = Math.max(0, source.scrollTop + delta - 20);
    }
    const preview = getPreviewScrollElement();
    if (preview) {
      const blocks = preview.querySelectorAll('[data-line]');
      let target = null;
      for (const block of blocks) {
        const start = Number.parseInt(block.getAttribute('data-line'), 10);
        const end = Number.parseInt(block.getAttribute('data-line-end'), 10) || start;
        if (!Number.isFinite(start)) continue;
        if (start === line) {
          target = block;
          break;
        }
        if (start <= line && line <= end) target = block;
      }
      if (target) {
        const delta = target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
        preview.scrollTop = Math.max(0, preview.scrollTop + delta - 12);
      }
    }
  };

  const navPanel = navOpen
    ? h(
        'aside',
        { className: 'mn-nav-panel', 'aria-label': t('nav.title') },
        h(
          'div',
          { className: 'mn-nav-head' },
          h(MN.Icon, { name: 'book', size: 14 }),
          h('span', { className: 'mn-nav-title' }, t('nav.title')),
          h('span', { className: 'mn-nav-count' }, String(outlineHeadings.length)),
          h(
            'button',
            {
              type: 'button',
              className: 'mn-iconbtn',
              title: t('nav.close'),
              'aria-label': t('nav.close'),
              onClick: () => setNavOpen(false),
            },
            h(MN.Icon, { name: 'close', size: 12 }),
          ),
        ),
        outlineHeadings.length > 0
          ? h(
              'div',
              { className: 'mn-nav-list', role: 'list' },
              outlineHeadings.map((item, index) =>
                h(
                  'button',
                  {
                    key: item.line + ':' + index,
                    type: 'button',
                    className: 'mn-nav-item',
                    role: 'link',
                    'data-level': item.level,
                    title: item.text,
                    style: { paddingLeft: 10 + (item.level - 1) * 14 + 'px' },
                    onClick: () => scrollToOutlineLine(item.line),
                  },
                  h('span', { className: 'mn-nav-hash' }, '#'.repeat(item.level)),
                  h('span', { className: 'mn-nav-text' }, item.text),
                ),
              ),
            )
          : h('div', { className: 'mn-nav-empty' }, t('nav.empty')),
      )
    : null;

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
                    className: 'mn-sync-toggle mn-nav-toggle',
                    'data-on': navOpen ? 'true' : 'false',
                    'aria-pressed': navOpen ? 'true' : 'false',
                    title: t('nav.title'),
                    onClick: () => setNavOpen((open) => !open),
                  },
                  h(MN.Icon, { name: 'nav', size: 13 }),
                  h('span', null, t('nav.label')),
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
              { className: 'mn-main-body' },
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
                      notePath: note.path,
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
              navPanel,
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
