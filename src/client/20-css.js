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
