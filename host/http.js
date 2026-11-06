/**
 * HTTP 协议小工具：请求体收集、JSON / 二进制应答、错误分类。
 *
 * 只处理 Node 的 IncomingMessage / ServerResponse 细节，不判断业务。
 * 所有写响应函数都容忍「连接已断开」，绝不二次抛错拖垮宿主进程。
 *
 * @module @local/markdown-notes/host/http
 */

/** 请求体上限：图片以 base64 上传，留足 40 MiB。 */
export const MAX_BODY_BYTES = 40 * 1024 * 1024;

/**
 * 收集请求体文本。Promise 保证只落地一次。
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
export function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      finish();
    };
    const onData = (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settle(() => rejectPromise(Object.assign(new Error('request body too large'), { code: 'body-too-large' })));
        if (typeof req.resume === 'function') req.resume();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => settle(() => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    const onError = (error) => settle(() => rejectPromise(error));
    const onAborted = () => settle(() => rejectPromise(Object.assign(new Error('client aborted'), { code: 'client-aborted' })));
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onAborted);
    req.on('aborted', onAborted);
  });
}

/** 响应是否已经不可写。 */
export function responseClosed(res) {
  return Boolean(res && (res.destroyed || res.writableEnded || res.headersSent));
}

/** 发送 JSON；响应已结束时安静跳过。 */
export function sendJson(res, status, obj) {
  if (responseClosed(res)) return;
  let body;
  try {
    body = JSON.stringify(obj);
  } catch {
    body = JSON.stringify({ ok: false, code: 'serialize', error: '响应序列化失败' });
  }
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    /* 连接已断，交给宿主回收 socket */
  }
}

/** 发送二进制内容（图片等）。 */
export function sendBytes(res, status, headers, bytes) {
  if (responseClosed(res)) return;
  try {
    res.writeHead(status, { 'content-length': bytes.length, 'cache-control': 'private, max-age=120', ...headers });
    res.end(bytes);
  } catch {
    /* 连接已断，忽略 */
  }
}

/** 把异常归一成短错误码。 */
export function errorCodeOf(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'body-too-large') return 'body-too-large';
  if (code === 'client-aborted') return 'client-aborted';
  return 'internal-error';
}
