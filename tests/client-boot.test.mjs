/**
 * 用轻量桩执行构建产物 client.js，验证模块工厂与 apply() 的座位注册。
 * 运行：node tests/client-boot.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, '..', 'client.js'), 'utf8');

class StubComponent {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }
  setState(next) {
    this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) };
  }
}
const hooks = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial === undefined ? null : initial }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
};
const React = {
  Fragment: 'Fragment',
  Component: StubComponent,
  createElement(type, props, ...children) {
    const merged = { ...(props || {}) };
    if (children.length === 1) merged.children = children[0];
    else if (children.length > 1) merged.children = children;
    return { type, props: merged };
  },
  useState: hooks.useState,
  useEffect: hooks.useEffect,
  useRef: hooks.useRef,
  useCallback: hooks.useCallback,
  useMemo: hooks.useMemo,
};
const windowStub = {
  __ModuleLoader__: { load(config) { windowStub.__config = config; } },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { origin: 'http://127.0.0.1', reload() {} },
  innerWidth: 1280,
  innerHeight: 800,
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: (fn) => fn(),
};
const documentStub = {
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  querySelector: () => null,
  activeElement: null,
};
const requireStub = (name) => {
  if (name === 'react') return React;
  throw new Error('unexpected module: ' + name);
};

new Function('window', 'document', 'fetch', 'console', code)(windowStub, documentStub, async () => ({}), console);
assert.equal(windowStub.__config.id, '@local/markdown-notes');
const moduleExports = windowStub.__config.factory(requireStub);
assert.equal(moduleExports.name, 'markdown-notes');

const registrations = [];
const localeRegistrations = [];
const ctx = {
  get: () => undefined,
  locale: {
    bind: () => (key) => key,
    register: (...args) => {
      localeRegistrations.push(args);
      return () => {};
    },
    subscribe: () => () => {},
  },
  effect: (callback) => {
    const disposer = callback();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  slots: {
    inject: (key, callback) => {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => {};
    },
  },
};

const dispose = moduleExports.apply(ctx);
assert.equal(typeof dispose, 'function');
assert.equal(localeRegistrations.length, 2);

const sidebar = registrations.find((entry) => entry.options.id === 'markdown-notes');
assert.ok(sidebar, 'sidebar.panellist registration missing');
assert.equal(sidebar.options.name, 'sidebar.panellist');
assert.equal(sidebar.options.order, 30);
assert.equal(sidebar.options.label(), 'app.title');

const main = registrations.find((entry) => entry.options.key === 'markdown-notes');
assert.ok(main, 'main registration missing');
assert.equal(main.options.name, 'main');

const icon = sidebar.component({ size: 20, active: true });
assert.ok(icon && icon.type === 'span', 'sidebar icon did not render');
assert.ok(main.component({}) && main.component({}).type === 'Fragment', 'main page did not render');

dispose();
console.log('client boot test passed');
