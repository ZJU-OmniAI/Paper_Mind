import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';

const values = {};
const messages = [];
const locks = new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {} });
Object.defineProperty(globalThis.navigator, 'locks', { value: { request(name, fn) { const task = (locks.get(name) || Promise.resolve()).then(fn); locks.set(name, task.catch(() => {})); return task; } } });
globalThis.chrome = { storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); }, async set(data) { Object.assign(values, structuredClone(data)); }, async remove(keys) { for (const key of [keys].flat()) delete values[key]; } } }, runtime: { sendMessage(message) { messages.push(message); return Promise.resolve(); } } };
const api = (path, body, method = 'POST') => handleApi(path, { method, body });
const state = () => handleApi('/api/state');
const READER = 'chrome-extension://acafiedlcaibhilacmadmiklkfhmlhjo/reader/reader.html';
async function reset(papers = []) {
  await api('/api/import', { papers, tags: [], topicPacks: [] });
  await api('/api/settings', { provider: 'qwen', autoDescribeTags: false, clearQwenKey: true });
  messages.length = 0;
}
const atom = (...entries) => `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">${entries.map(([id, title, comment = '']) => `<entry><id>http://arxiv.org/abs/${id}v1</id><title>${title}</title><summary>${`Full abstract of ${title}. `.repeat(12)}</summary><published>2026-01-26T00:00:00Z</published>${comment ? `<arxiv:comment>${comment}</arxiv:comment>` : ''}<author><name>First Author</name></author><author><name>Second Author</name></author></entry>`).join('')}</feed>`;
const text = body => ({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });

test('the same paper opened from alphaXiv, arXiv, Hugging Face or a PDF reader is one record', async () => {
  await reset([{ id: 'paper-a', title: 'A Pragmatic VLA Foundation Model', sourceUrl: 'https://www.alphaxiv.org/abs/2601.18692?chatId=1', tagIds: [] }]);
  for (const sourceUrl of [`${READER}?id=2601.18692v2`, 'https://arxiv.org/pdf/2601.18692v1', 'https://huggingface.co/papers/2601.18692']) {
    const duplicate = await api('/api/papers/check-duplicate', { title: 'arXiv:2601.18692', sourceUrl });
    assert.equal(duplicate.duplicate, true, sourceUrl);
    assert.equal(duplicate.reason, 'sourceUrl');
  }
  assert.equal((await api('/api/papers/check-duplicate', { title: 'Unrelated', sourceUrl: 'https://arxiv.org/abs/2601.99999' })).duplicate, false);
});

test('saving from a reader stores the paper address and asks the background to fill gaps', async () => {
  await reset();
  const { paper } = await api('/api/papers', { title: 'VIDEOTREE: Adaptive Trees · LLM_in_PDF', sourceUrl: `${READER}?id=2405.19209`, manualTags: [] });
  assert.equal(paper.sourceUrl, 'https://arxiv.org/abs/2405.19209');
  assert.equal(paper.title, 'VIDEOTREE: Adaptive Trees');
  assert.ok(messages.some(message => message.type === 'auto-fill-bibliography' && message.paperId === paper.id));
  messages.length = 0;
  await api('/api/papers', { title: '一文讲透人形机器人', sourceUrl: 'https://mp.weixin.qq.com/s/abc', manualTags: [] });
  assert.equal(messages.some(message => message.type === 'auto-fill-bibliography'), false);
  // A local PDF has no web address; keep the reader address so the same file deduplicates.
  const local = `${READER}?local=local%3A${'b'.repeat(64)}`;
  assert.equal((await api('/api/papers', { title: 'Local notes paper', sourceUrl: local, manualTags: [] })).paper.sourceUrl, local);
});

test('one paper is filled from arXiv without overwriting curated fields', async t => {
  await reset([{ id: 'paper-v', title: 'VIDEOTREE: ADAPTIVE TREES FOR VIDEO', sourceUrl: `${READER}?id=2405.19209`, authors: [], venue: 'Kept venue', abstract: 'Full abstract of VideoTree: Adaptive Trees for Video. Full abstract of...', abstractZh: '截断的译文', tagIds: [] }]);
  t.mock.method(globalThis, 'fetch', async () => text(atom(['2405.19209', 'VideoTree: Adaptive Trees for Video', 'CVPR 2025; project page'])));
  const result = await api('/api/papers/paper-v/bibliography');
  assert.equal(result.status, 'filled');
  const paper = (await state()).papers[0];
  assert.deepEqual(paper.authors, ['First Author', 'Second Author']);
  assert.equal(paper.year, '2025');
  assert.equal(paper.venue, 'Kept venue');
  assert.equal(paper.title, 'VideoTree: Adaptive Trees for Video');
  assert.equal(paper.sourceUrl, 'https://arxiv.org/abs/2405.19209');
  assert.match(paper.abstract, /^Full abstract of VideoTree/);
  assert.ok(paper.abstract.length > 200);
  assert.equal(paper.abstractZh, '');
  assert.ok(messages.some(message => message.type === 'auto-translate-abstract' && message.paperId === 'paper-v'));
  assert.equal((await api('/api/papers/paper-v/bibliography')).status, 'unchanged');
});

test('the library backfill batches arXiv lookups and skips commentary pages', async t => {
  await reset([
    { id: 'p1', title: 'Paper One', sourceUrl: 'https://www.alphaxiv.org/abs/2601.00001', tagIds: [] },
    { id: 'p2', title: 'Paper Two', sourceUrl: 'https://arxiv.org/pdf/2601.00002', tagIds: [] },
    { id: 'p3', title: 'Paper Three', sourceUrl: 'https://huggingface.co/papers/2601.00003', tagIds: [] },
    { id: 'w1', title: '一篇公众号解读', sourceUrl: 'https://mp.weixin.qq.com/s/xyz', tagIds: [] },
    { id: 'done', title: 'Complete', sourceUrl: 'https://arxiv.org/abs/2601.00009', authors: ['A'], year: '2026', venue: 'ICLR 2026', abstract: 'x'.repeat(400), tagIds: [] }
  ]);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return text(atom(['2601.00001', 'Paper One', 'Accepted to ICLR 2026'], ['2601.00002', 'Paper Two'])); });
  const result = await api('/api/papers/bibliography', { paperIds: ['p1', 'p2', 'p3', 'w1', 'done'] });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /id_list=2601\.00001,2601\.00002,2601\.00003/);
  assert.deepEqual(result.summary, { total: 3, filled: 2, unchanged: 0, notfound: 1, ambiguous: 0, error: 0 });
  const papers = Object.fromEntries((await state()).papers.map(paper => [paper.id, paper]));
  assert.equal(papers.p1.venue, 'ICLR 2026');
  assert.equal(papers.p2.year, '2026');
  assert.deepEqual(papers.w1.authors, []);
  assert.equal(result.papers.length, 2);
});

test('a failed arXiv batch is reported as errors instead of slow per-paper retries', async t => {
  await reset([
    { id: 'a1', title: 'Paper One', sourceUrl: 'https://arxiv.org/abs/2601.00001', tagIds: [] },
    { id: 'a2', title: 'Paper Two', sourceUrl: 'https://arxiv.org/abs/2601.00002', tagIds: [] }
  ]);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status: 503, text: async () => '' }; });
  const result = await api('/api/papers/bibliography', { paperIds: ['a1', 'a2'] });
  assert.deepEqual(result.summary, { total: 2, filled: 0, unchanged: 0, notfound: 0, ambiguous: 0, error: 2 });
  assert.equal(calls, 2); // one request plus one retry after rate limiting
});
