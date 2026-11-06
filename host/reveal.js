/**
 * 在系统文件管理器中打开笔记根目录内的条目。
 *
 * Windows：文件夹直接打开；文件用 `explorer.exe /select,` 打开父目录并选中文件。
 * macOS：文件夹 `open`；文件 `open -R`（Finder 中显示并选中）。
 * Linux：用 `xdg-open` 打开父目录（文件管理器选中行为不统一，尽力而为）。
 *
 * @module @local/markdown-notes/host/reveal
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * 打开文件管理器。不会等待子进程结束，失败只写日志，不影响 API 返回。
 *
 * @param {string} absPath 已经过根目录校验的绝对路径。
 * @param {boolean} isDirectory 目标是否为目录。
 * @param {{warn?: Function}} [logger] 日志出口。
 * @returns {{ok: boolean, error?: string}} 是否已发起打开动作。
 */
export function openInFileManager(absPath, isDirectory, logger) {
  if (typeof absPath !== 'string' || absPath === '') {
    return { ok: false, error: '路径为空' };
  }
  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'explorer.exe';
    args = isDirectory ? [absPath] : ['/select,', absPath];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = isDirectory ? [absPath] : ['-R', absPath];
  } else {
    command = 'xdg-open';
    args = [isDirectory ? absPath : path.dirname(absPath)];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.on('error', (error) => {
      logger?.warn?.(
        `[markdown-notes] 打开文件管理器失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    // explorer / open 在成功时也可能返回非 0，或很快退出；不等待退出码。
    child.unref();
    return { ok: true };
  } catch (error) {
    logger?.warn?.(
      `[markdown-notes] 无法启动文件管理器: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
