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
