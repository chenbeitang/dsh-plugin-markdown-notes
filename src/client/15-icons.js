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
