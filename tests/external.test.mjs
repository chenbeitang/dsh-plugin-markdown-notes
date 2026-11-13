import assert from 'node:assert/strict';
import { isExternalBrowserUrl } from '../host/external.js';

assert.equal(isExternalBrowserUrl('https://example.com/a?b=1&c=2'), true);
assert.equal(isExternalBrowserUrl('http://127.0.0.1:3000/x'), true);
assert.equal(isExternalBrowserUrl('mailto:someone@example.com'), true);
assert.equal(isExternalBrowserUrl('javascript:alert(1)'), false);
assert.equal(isExternalBrowserUrl('file:///C:/Windows/win.ini'), false);
assert.equal(isExternalBrowserUrl('data:text/html,<b>x</b>'), false);
assert.equal(isExternalBrowserUrl('not a url'), false);

console.log('external link tests passed');
