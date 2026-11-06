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
