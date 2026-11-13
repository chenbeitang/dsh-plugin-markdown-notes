/**
 * Client bundle 外壳 + 工厂作用域。
 *
 * 本文件必须排第一，99-apply.js 必须排最后；build.mjs 按文件名顺序拼接所有 part。
 * 整个 bundle 是普通副作用脚本：没有顶层 ESM import/export，React 只能从工厂
 * 的 require 获取，不读写 MN 以外的全局。
 *
 * @module @local/markdown-notes/src/client/00-header
 */
window.__ModuleLoader__.load({
  id: '@local/markdown-notes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo, Component } = React;

    /** 本包 Client 侧唯一命名空间：各 part 只往这里挂方法/组件。 */
    const MN = {
      id: 'markdown-notes',
      version: '1.20.1',
      React,
      h,
      useState,
      useEffect,
      useRef,
      useCallback,
      useMemo,
      Component,
      /** 由 99-apply 绑定：ctx.locale.bind(...) 得到的翻译函数。 */
      t: (key) => key,
      /** 由 99-apply 绑定的 Client Context，供打开系统目录选择器等可选能力用。 */
      clientCtx: null,
    };
