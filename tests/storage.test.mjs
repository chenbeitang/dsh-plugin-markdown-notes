/**
 * 笔记仓库的离线单测：在临时目录里跑完整的增删改查、收藏、图片与路径安全。
 * 运行：node tests/storage.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotesError, NotesStore } from '../host/storage.js';

const sandbox = mkdtempSync(join(tmpdir(), 'markdown-notes-test-'));
process.env.DSH_PROFILE_DIR = join(sandbox, 'profile');
const root = join(sandbox, 'notes');

const store = new NotesStore({ config: { storagePath: root } });

const PNG_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lYQ5WQAAAABJRU5ErkJggg==';

function check(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (error) {
    console.error('FAIL - ' + name);
    throw error;
  }
}

try {
  await store.ensure();

  check('initial state has storage settings', async () => {});
  const settings = store.getSettings();
  assert.equal(settings.storagePath, root);
  assert.equal(settings.exists, true);

  const folder = await store.createFolder('', '工作');
  assert.equal(folder.path, '工作');

  const note = await store.createNote('工作', '周报');
  assert.equal(note.path, '工作/周报.md');
  assert.equal(note.content, '# 周报\n\n');

  await store.saveNote(note.path, '# 周报\n\n- 完成 A\n- 完成 B\n');
  const read = await store.readNote(note.path);
  assert.match(read.content, /完成 A/);

  const nested = await store.createFolder('工作', '子目录');
  assert.equal(nested.path, '工作/子目录');
  const nestedNote = await store.createNote(nested.path, '子笔记');
  assert.equal(nestedNote.path, '工作/子目录/子笔记.md');

  await store.setFavorite(note.path, true);
  let state = await store.state();
  assert.deepEqual(state.favorites, [note.path]);
  assert.equal(state.stats.folders, 2);
  assert.equal(state.stats.notes, 2);

  const renamed = await store.renameEntry('工作', '项目');
  assert.equal(renamed.path, '项目');
  state = await store.state();
  assert.deepEqual(state.favorites, ['项目/周报.md']);

  const renamedNote = await store.renameEntry('项目/周报.md', '周报-第 1 周');
  assert.equal(renamedNote.path, '项目/周报-第 1 周.md');

  const search = await store.search('完成');
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].path, renamedNote.path);

  const archive = await store.createFolder('', '归档');
  const moved = await store.moveEntry(renamedNote.path, archive.path);
  assert.equal(moved.path, '归档/周报-第 1 周.md');
  state = await store.state();
  assert.deepEqual(state.favorites, ['归档/周报-第 1 周.md']);
  const noteLocation = await store.entryLocation(moved.path);
  assert.equal(noteLocation.isDirectory, false);
  const folderLocation = await store.entryLocation('项目');
  assert.equal(folderLocation.isDirectory, true);

  let rejectedMove = false;
  try {
    await store.moveEntry('项目', '项目/子目录');
  } catch (error) {
    rejectedMove = error instanceof NotesError && error.code === 'invalid-target';
  }
  assert.equal(rejectedMove, true);

  const noteA = await store.createNote('', 'A排序');
  const noteB = await store.createNote('', 'B排序');
  const reordered = await store.reorderEntry(noteB.path, noteA.path, 'before');
  assert.equal(reordered.position, 'before');
  state = await store.state();
  const rootNotes = state.tree.filter((node) => node.type === 'note').map((node) => node.fileName);
  assert.ok(rootNotes.indexOf('B排序.md') < rootNotes.indexOf('A排序.md'));
  store.meta = null;
  state = await store.state();
  const persistedRootNotes = state.tree.filter((node) => node.type === 'note').map((node) => node.fileName);
  assert.ok(persistedRootNotes.indexOf('B排序.md') < persistedRootNotes.indexOf('A排序.md'));

  let rejectedReorder = false;
  try {
    await store.reorderEntry(noteA.path, '项目/子目录', 'before');
  } catch (error) {
    rejectedReorder = error instanceof NotesError && error.code === 'invalid-target';
  }
  assert.equal(rejectedReorder, true);
  await store.deleteEntry(noteA.path);
  await store.deleteEntry(noteB.path);

  const uploaded = await store.uploadImage({ name: 'pixel.png', mime: 'image/png', data: PNG_PIXEL });
  assert.match(uploaded.path, /^assets\/\d{4}-\d{2}\//);
  const media = await store.readMedia(uploaded.path);
  assert.equal(media.contentType, 'image/png');
  assert.ok(media.bytes.length > 10);

  let rejected = false;
  try {
    await store.readNote('../../etc/passwd');
  } catch (error) {
    rejected = error instanceof NotesError && error.code === 'invalid-path';
  }
  assert.equal(rejected, true);

  let badImage = false;
  try {
    await store.uploadImage({ name: 'x.svg', mime: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') });
  } catch (error) {
    badImage = error instanceof NotesError;
  }
  assert.equal(badImage, true);

  await store.deleteEntry('项目/子目录');
  state = await store.state();
  assert.equal(state.stats.notes, 1);

  const store2Root = join(sandbox, 'notes-2');
  const switched = await store.setStoragePath(store2Root);
  assert.equal(switched.storagePath, store2Root);
  const fresh = await store.state();
  assert.equal(fresh.stats.notes, 0);

  console.log('all storage tests passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
