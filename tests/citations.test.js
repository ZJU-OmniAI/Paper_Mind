import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCitationCount, __testing } from '../extension/citations.js';
import { normalizeCitation, citationNeedsRefresh, citationSourceLink, hasCitationCount, citationQueryKey } from '../extension/citation-state.js';

const id = 'a'.repeat(40);
const paper = (extra = {}) => ({ paperId: id, title: 'Attention Is All You Need', citationCount: 12, ...extra });
const ok = value => ({ ok: true, status: 200, json: async () => value });

test('a title match with zero citations is a real count, not missing data', async t => {
  t.mock.method(globalThis, 'fetch', async () => ok({ data: [paper({ citationCount: 0 })] }));
  const result = await fetchCitationCount({ title: 'Attention Is All You Need | arXiv' });
  assert.equal(result.status, 'ok'); assert.equal(result.count, 0); assert.equal(result.externalId, id);
});

test('more popular substring and token-overlap titles cannot replace the actual paper', async t => {
  t.mock.method(globalThis, 'fetch', async () => ok({ data: [
    paper({ paperId: 'b'.repeat(40), title: 'Attention Is All You Need: A Survey', citationCount: 9000 }),
    paper({ citationCount: 4 }),
    paper({ paperId: 'c'.repeat(40), title: 'Attention Is Not All You Need', citationCount: 8000 })
  ] }));
  assert.equal((await fetchCitationCount({ title: paper().title })).count, 4);
  assert.equal((await fetchCitationCount({ title: 'Attention' })).status, 'notfound');
  const longTitle = 'A very long paper title '.repeat(35);
  t.mock.method(globalThis, 'fetch', async () => ok({ data: [paper({ title: longTitle.slice(0, 600) })] }));
  assert.equal((await fetchCitationCount({ title: longTitle })).status, 'notfound');
});

test('same-title records stay ambiguous regardless of their citation counts', async t => {
  t.mock.method(globalThis, 'fetch', async () => ok({ data: [paper(), paper({ paperId: 'b'.repeat(40), citationCount: 900 })] }));
  const result = await fetchCitationCount({ title: paper().title });
  assert.equal(result.status, 'ambiguous'); assert.equal(result.count, null);
});

test('known authors and year can disambiguate an exact title without popularity ranking', async t => {
  t.mock.method(globalThis, 'fetch', async () => ok({ data: [
    paper({ year: 2024, authors: [{ name: 'Ada Lovelace' }], citationCount: 0 }),
    paper({ paperId: 'b'.repeat(40), year: 2020, authors: [{ name: 'Other Author' }], citationCount: 900 })
  ] }));
  const result = await fetchCitationCount({ title: paper().title, authors: ['Lovelace, Ada'], year: '2024' });
  assert.equal(result.count, 0); assert.equal(result.status, 'ok');
});

test('source identifiers are parsed from trusted URL paths, never notes or query parameters', () => {
  assert.equal(__testing.extractArxivId({ sourceUrl: 'https://www.alphaxiv.org/overview/1706.03762v7' }), '1706.03762');
  assert.equal(__testing.extractArxivId({ sourceUrl: 'https://arxiv.org/pdf/hep-th/9901001v2.pdf' }), 'hep-th/9901001');
  assert.equal(__testing.extractArxivId({ sourceUrl: 'https://evil.test/arxiv.org/abs/1706.03762' }), '');
  assert.equal(__testing.extractArxivId({ conversation: 'Related: https://arxiv.org/abs/1706.03762' }), '');
  assert.equal(__testing.extractDoi({ sourceUrl: 'https://example.org/?reference=10.1234/wrong' }), '');
  assert.equal(__testing.extractDoi({ sourceUrl: 'https://doi.org/10.1002/(SICI)1099-0844(199912)17:4<290::AID-CBF846>3.0.CO;2-X' }), '10.1002/(sici)1099-0844(199912)17:4<290::aid-cbf846>3.0.co;2-x');
  assert.equal(__testing.extractDoi({ sourceUrl: 'https://doi.org/10.1000%2Fabc(42)' }), '10.1000/abc(42)');
});

test('an unrelated reference in notes cannot hijack a citation lookup', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return ok({ data: [paper()] }); });
  assert.equal((await fetchCitationCount({ title: paper().title, conversation: 'https://arxiv.org/abs/1111.11111 doi:10.9999/wrong' })).status, 'ok');
  assert.equal(urls.length, 1); assert.match(urls[0], /\/search\?/);
});

test('identifier requests are encoded and mismatched returned titles require review', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return ok(paper()); });
  const result = await fetchCitationCount({ title: 'Different paper', sourceUrl: 'https://arxiv.org/pdf/hep-th/9901001.pdf' });
  assert.equal(result.status, 'ambiguous'); assert.equal(result.count, null);
  assert.equal(urls.length, 1); assert.match(urls[0], /arXiv%3Ahep-th%2F9901001/);
});

test('404 falls back to exact title but a conflicting external ID is rejected', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('/search?')
    ? ok({ data: [paper({ externalIds: { ArXiv: '1111.11111' } })] }) : { ok: false, status: 404 });
  assert.equal((await fetchCitationCount({ title: paper().title, sourceUrl: 'https://arxiv.org/abs/1706.03762' })).status, 'ambiguous');
});

test('invalid or missing counts stay unavailable; network errors are not zero citations', async t => {
  for (const count of [null, -1, 1.5, NaN, Infinity, '12']) {
    t.mock.method(globalThis, 'fetch', async () => ok({ data: [paper({ citationCount: count })] }));
    assert.equal((await fetchCitationCount({ title: paper().title })).status, 'notfound');
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(fetchCitationCount({ title: paper().title }), /503/);
});

test('legacy counts and changed paper identities are invalidated, without changing paper content', () => {
  const record = { title: 'My paper', memory: 'Keep this', citationCount: 9999, citationStatus: 'ok', citationUpdatedAt: new Date().toISOString() };
  normalizeCitation(record);
  assert.equal(record.citationCount, null); assert.equal(record.memory, 'Keep this'); assert.ok(citationNeedsRefresh(record));
  Object.assign(record, { citationCount: 0, citationStatus: 'ok', citationSource: 'semanticscholar:title', citationUpdatedAt: new Date().toISOString() });
  normalizeCitation(record); assert.ok(hasCitationCount(record)); assert.equal(citationNeedsRefresh(record), false);
  record.title = 'Another paper'; normalizeCitation(record);
  assert.equal(record.citationCount, null); assert.equal(record.citationStatus, 'unverified');
});

test('failed refreshes retry sooner, preserve valid zero counts and only link to safe source IDs', () => {
  const now = Date.now(); const record = { title: 'A', citationMatchVersion: 2, citationStatus: 'error', citationCount: 0, citationCheckedAt: new Date(now - 11 * 60e3).toISOString() };
  assert.ok(hasCitationCount(record)); assert.ok(citationNeedsRefresh(record, now));
  record.citationStatus = 'ok'; assert.equal(citationNeedsRefresh(record, now), false);
  record.citationSource = 'semanticscholar:doi'; record.citationExternalId = id;
  assert.equal(citationSourceLink(record), `https://www.semanticscholar.org/paper/${id}`);
  record.citationExternalId = '\" onclick=alert(1)'; assert.equal(citationSourceLink(record), '');
  record.citationQueryKey = citationQueryKey({ title: 'B' }); assert.equal(hasCitationCount(record), false);
});
