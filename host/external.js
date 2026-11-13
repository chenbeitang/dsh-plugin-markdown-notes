/**
 * 用系统默认浏览器打开外部链接。
 *
 * 只放行 http / https / mailto，避免把 file:、javascript: 等交给系统处理器。
 * 不等待子进程退出；失败只记录日志。
 *
 * @module @local/markdown-notes/host/external
 */
import { spawn } from 'node:child_process';

/** 判断 URL 是否允许交给系统浏览器。 */
export function isExternalBrowserUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch (error) {
    return false;
  }
}

/**
 * 调用系统默认浏览器打开 URL。
 *
 * @param {string} value 已通过 allowlist 校验的 URL。
 * @param {{warn?: Function}} [logger] 日志出口。
 * @returns {{ok: boolean, error?: string}}
 */
export function openExternalUrl(value, logger) {
  if (!isExternalBrowserUrl(value)) {
    return { ok: false, error: '仅支持 http / https / mailto 链接' };
  }
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', String(value)];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [String(value)];
  } else {
    command = 'xdg-open';
    args = [String(value)];
  }
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (error) => {
      logger?.warn?.(
        `[markdown-notes] 打开外部链接失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    logger?.warn?.(
      `[markdown-notes] 无法打开外部链接: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
