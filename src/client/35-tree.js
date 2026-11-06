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
          title: node.path,
          onClick: () => props.onToggle(node.path),
          onContextMenu: (event) => props.onMenu(event, node),
          onDragStart: (event) => props.onDragStart(event, node),
          onDragEnd: props.onDragEnd,
          onDragOver: (event) => props.onDragOver(event, node.path),
          onDragLeave: (event) => props.onDragLeave(event, node.path),
          onDrop: (event) => props.onDrop(event, node.path),
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
      role: 'button',
      tabIndex: 0,
      draggable: true,
      title: node.path,
      onClick: () => props.onOpen(node.path),
      onContextMenu: (event) => props.onMenu(event, node),
      onDragStart: (event) => props.onDragStart(event, node),
      onDragEnd: props.onDragEnd,
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
  };

  const handleDragOver = (event, targetPath) => {
    if (!canDropOn(targetPath)) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      if (dropTarget === targetPath) setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (dropTarget !== targetPath) setDropTarget(targetPath);
  };

  const handleDragLeave = (event, targetPath) => {
    const related = event.relatedTarget;
    if (related && event.currentTarget && event.currentTarget.contains(related)) return;
    if (dropTarget === targetPath) setDropTarget(null);
  };

  const handleDrop = (event, targetPath) => {
    if (!canDropOn(targetPath)) return;
    event.preventDefault();
    event.stopPropagation();
    const source = draggingPath || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');
    setDraggingPath(null);
    setDropTarget(null);
    if (source) props.onMove(source, targetPath);
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
