import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { ARTICLES, EPISODES } from '../worker/src/media/catalog.js';

const get = (p) => worker.fetch(new Request(`https://wefagh.ir${p}`), {});

test('فهرست مقاله‌ها بدون متن کامل برگردانده می‌شود', async () => {
  const res = await get('/api/media/articles');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.articles.length, ARTICLES.length);
  assert.ok(body.articles.every((a) => !('body' in a)));
});

test('متن مقاله با slug درست برگردانده می‌شود و slug ناشناخته ۴۰۴ می‌دهد', async () => {
  const ok = await get(`/api/media/articles/${ARTICLES[0].slug}`);
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).article.body.length >= 1);
  assert.equal((await get('/api/media/articles/nope')).status, 404);
  assert.equal((await get('/api/media/articles/..%2Fsecret')).status, 404);
});

test('قسمت‌های پادکست برگردانده می‌شوند و بدون فایل صوتی، audioUrl خالی است', async () => {
  const body = await (await get('/api/media/episodes')).json();
  assert.equal(body.episodes.length, EPISODES.length);
  assert.ok(body.episodes.every((e) => e.audioUrl === null || /^https:\/\//.test(e.audioUrl)));
});

test('رسانه فقط خواندنی است', async () => {
  const res = await worker.fetch(new Request('https://wefagh.ir/api/media/articles', { method: 'POST' }), {});
  assert.equal(res.status, 405);
});
