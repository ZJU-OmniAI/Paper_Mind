import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBibliography, isTruncatedAbstract, lookupPaperMetadata, metadataFromArxiv, needsBibliography, parseArxivFeed, parseCitationMeta, titleMatchesCandidates, titleSearchAllowed, venueFromArxiv } from '../extension/paper-metadata.js';

const READER = 'chrome-extension://acafiedlcaibhilacmadmiklkfhmlhjo/reader/reader.html';
const entry = ({ id, title, authors = ['Ziyang Wang', 'Shoubin Yu'], summary = 'A long abstract about adaptive trees for long video reasoning. '.repeat(4), published = '2024-05-29T15:49:09Z', comment = '', journal = '' }) => `
  <entry>
    <id>http://arxiv.org/abs/${id}v3</id>
    <title>${title}</title>
    <updated>2025-03-14T13:57:16Z</updated>
    <summary>${summary}</summary>
    <published>${published}</published>
    ${comment ? `<arxiv:comment>${comment}</arxiv:comment>` : ''}
    ${journal ? `<arxiv:journal_ref>${journal}</arxiv:journal_ref>` : ''}
    ${authors.map(name => `<author>\n      <name>${name}</name>\n    </author>`).join('\n')}
  </entry>`;
const feed = (...entries) => `<?xml version='1.0' encoding='UTF-8'?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">${entries.join('')}</feed>`;
const VIDEOTREE = entry({ id: '2405.19209', title: 'VideoTree: Adaptive Tree-based Video\n      Representation for LLM Reasoning on Long Videos', comment: 'CVPR 2025; First three authors contributed equally; Project page: https://videotree2024.github.io/' });
const text = body => ({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
const fail = status => ({ ok: false, status, text: async () => '', json: async () => ({}) });

test('arXiv feeds parse out of order, decode entities, skip error entries and keep legacy identifiers', () => {
  const entries = parseArxivFeed(feed(
    entry({ id: 'hep-th/9901001', title: 'String Junctions &amp; Their Duals', authors: ['Philipp Kr&#228;henb&#xFC;hl'] }),
    VIDEOTREE,
    '<entry><id>https://arxiv.org/api/errors#incorrect_id_format_for_abc</id><title>Error</title><summary>incorrect id format for abc</summary></entry>'
  ));
  assert.deepEqual(entries.map(item => item.arxivId), ['hep-th/9901001', '2405.19209']);
  assert.equal(entries[0].title, 'String Junctions & Their Duals');
  assert.deepEqual(entries[0].authors, ['Philipp Krähenbühl']);
  assert.equal(entries[1].title, 'VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos');
  const metadata = metadataFromArxiv(entries[1]);
  assert.equal(metadata.venue, 'CVPR 2025');
  assert.equal(metadata.year, '2025');
  assert.equal(metadata.sourceUrl, 'https://arxiv.org/abs/2405.19209');
  assert.equal(metadataFromArxiv(entries[0]).year, '2024');
});

test('venues come from journal_ref or accepted-paper comments, never submissions or extensions', () => {
  assert.deepEqual(venueFromArxiv({ journalRef: 'Nature 600, 70-74 (2021)' }), { venue: 'Nature 600, 70-74 (2021)', year: '2021' });
  assert.equal(venueFromArxiv({ comment: 'Accepted to NeurIPS 2024 (Spotlight). Code: https://x' }).venue, 'NeurIPS 2024');
  assert.equal(venueFromArxiv({ comment: "ECCV'24 Oral" }).venue, 'ECCV 2024');
  assert.equal(venueFromArxiv({ comment: 'Findings of ACL 2024' }).venue, 'Findings of ACL 2024');
  assert.equal(venueFromArxiv({ comment: 'Accepted at the ICLR 2025 Workshop on World Models' }).venue, 'ICLR 2025 Workshop');
  assert.equal(venueFromArxiv({ comment: 'Accepted by Conference on Computer Vision and Pattern Recognition (CVPR) 2026' }).venue, 'CVPR 2026');
  for (const comment of ['Submitted to ICLR 2025', 'Under review at NeurIPS 2025', 'Extended version of our CVPR 2023 paper', 'Technical report for the CVPR 2024 challenge', 'Our CVPR 2024 paper code', 'Tech report']) {
    assert.equal(venueFromArxiv({ comment }).venue, '', comment);
  }
});

test('a reader page is looked up by its arXiv ID, with the abs page as fallback when the API fails', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return text(feed(VIDEOTREE)); });
  const result = await lookupPaperMetadata({ sourceUrl: `${READER}?id=2405.19209`, title: 'arXiv:2405.19209' });
  assert.equal(result.found, true);
  assert.equal(result.matchedBy, 'id');
  assert.equal(result.provider, 'arXiv');
  assert.deepEqual(result.authors, ['Ziyang Wang', 'Shoubin Yu']);
  assert.match(urls[0], /export\.arxiv\.org\/api\/query\?id_list=2405\.19209/);

  const absPage = `<html><head><meta name="citation_title" content="VideoTree: Adaptive Tree-based Video Representation" /><meta name="citation_author" content="Wang, Ziyang" /><meta name="citation_author" content="Yu, Shoubin" /><meta name="citation_date" content="2024/05/29" /><meta name="citation_abstract" content="${'Long-form video understanding is hard. '.repeat(4)}" /></head>
    <body><td class="tablecell comments mathjax">Accepted to CVPR 2025</td></body></html>`;
  t.mock.method(globalThis, 'fetch', async url => url.includes('export.arxiv.org') ? fail(503) : text(absPage));
  const fallback = await lookupPaperMetadata({ sourceUrl: 'https://arxiv.org/html/2405.19209v2' });
  assert.deepEqual(fallback.authors, ['Ziyang Wang', 'Shoubin Yu']);
  assert.equal(fallback.venue, 'CVPR 2025');
});

test('OpenReview PDFs use the API when the browser passed its challenge, otherwise the forum page', async t => {
  const note = { notes: [{ content: { title: { value: 'An Image is Worth 16x16 Words' }, authors: { value: ['Alexey Dosovitskiy', 'Lucas Beyer'] }, abstract: { value: 'While the Transformer architecture has become the de-facto standard. '.repeat(3) }, venue: { value: 'ICLR 2021 Oral' } }, pdate: Date.UTC(2021, 0, 12) }] };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push([url, options.credentials]); return text(JSON.stringify(note)); });
  const viaApi = await lookupPaperMetadata({ sourceUrl: `${READER}?url=${encodeURIComponent('https://openreview.net/pdf?id=YicbFdNTTy')}` });
  assert.equal(viaApi.provider, 'OpenReview');
  assert.equal(viaApi.venue, 'ICLR 2021 Oral');
  assert.equal(viaApi.year, '2021');
  assert.deepEqual(calls[0], ['https://api2.openreview.net/notes?id=YicbFdNTTy', 'include']);

  const rejected = { notes: [{ content: { title: { value: 'Rejected idea' }, authors: { value: ['A B'] }, venue: { value: 'Submitted to ICLR 2024' } }, cdate: Date.UTC(2023, 8, 1) }] };
  t.mock.method(globalThis, 'fetch', async () => text(JSON.stringify(rejected)));
  assert.equal((await lookupPaperMetadata({ sourceUrl: 'https://openreview.net/pdf?id=AbCdEf123' })).venue, '');

  const forum = '<meta name="citation_title" content="An Image is Worth 16x16 Words"><meta name="citation_author" content="Alexey Dosovitskiy"><meta name="citation_online_date" content="2021/01/12"><meta name="citation_conference_title" content="International Conference on Learning Representations">';
  t.mock.method(globalThis, 'fetch', async url => url.includes('api') ? fail(403) : text(forum));
  const viaForum = await lookupPaperMetadata({ sourceUrl: 'https://openreview.net/pdf?id=YicbFdNTTy' });
  assert.equal(viaForum.provider, 'openreview.net');
  assert.equal(viaForum.venue, 'International Conference on Learning Representations');
});

test('arXiv links on a page count only when their title matches the page', async t => {
  const related = entry({ id: '2212.04501', title: 'Learning Video Representations from Large Language Models' });
  t.mock.method(globalThis, 'fetch', async () => text(feed(related, VIDEOTREE)));
  const readme = await lookupPaperMetadata({
    sourceUrl: 'https://github.com/Ziyang412/VideoTree', title: 'VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos',
    arxivCandidates: ['2405.19209', '2212.04501', '2403.10517'], titleCandidates: ['GitHub - Ziyang412/VideoTree: Code for CVPR25 paper "VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos"'], looseTitleMatch: true
  });
  assert.equal(readme.matchedBy, 'link');
  assert.equal(readme.arxivId, '2405.19209');
  // A blog post that cites the paper is not the paper.
  const blog = await lookupPaperMetadata({ sourceUrl: 'https://blog.example/post', title: 'Five papers I liked this week', arxivCandidates: ['2405.19209', '2212.04501'], titleCandidates: ['Five papers I liked this week'] });
  assert.equal(blog.found, false);
  assert.equal(titleMatchesCandidates('VideoTree: Adaptive Tree-based Video', ['VideoTree']), true);
  assert.equal(titleMatchesCandidates('VideoTree: Adaptive Tree-based Video', ['Review of VideoTree: Adaptive Tree-based Video']), false);
  assert.equal(titleMatchesCandidates('VideoTree: Adaptive Tree-based Video', ['Review of VideoTree: Adaptive Tree-based Video'], { loose: true }), true);
});

test('title search needs one exact arXiv match; generic pages never search by title', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(url); return text(feed(VIDEOTREE)); });
  const found = await lookupPaperMetadata({ title: 'VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos', allowTitleSearch: true });
  assert.equal(found.matchedBy, 'title');
  assert.match(decodeURIComponent(urls[0]), /search_query=ti:"videotree adaptive tree based video representation/);
  urls.length = 0;
  assert.equal((await lookupPaperMetadata({ title: 'VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos' })).found, false);
  assert.equal(urls.length, 0);
  const twins = feed(entry({ id: '2401.00001', title: 'Same Title For Two Papers' }), entry({ id: '2402.00002', title: 'Same title for two papers' }));
  t.mock.method(globalThis, 'fetch', async url => url.includes('arxiv') ? text(twins) : text(JSON.stringify({ data: [] })));
  assert.equal((await lookupPaperMetadata({ title: 'Same Title For Two Papers', allowTitleSearch: true })).found, false);
});

test('network failures surface as errors instead of a silent "not found"', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(lookupPaperMetadata({ sourceUrl: 'https://arxiv.org/abs/2405.19209' }), /网络请求失败/);
});

test('landing pages parse citation tags and IEEE records without a DOM', () => {
  const page = parseCitationMeta(`<meta name="citation_title" content="Deep Residual Learning"><meta content="He, Kaiming" name="citation_author"><meta name='citation_author' content='Zhang, Xiangyu'><meta name="citation_publication_date" content="2016/06/27"><meta name="citation_conference_title" content="CVPR"><div id="abstract">${'Deeper neural networks are more difficult to train. '.repeat(3)}</div>`);
  assert.deepEqual(page.authors, ['Kaiming He', 'Xiangyu Zhang']);
  assert.equal(page.year, '2016');
  assert.match(page.abstract, /^Deeper neural networks/);
  const ieee = parseCitationMeta(`<script>xplGlobal.document.metadata={"title":"Deep Residual Learning","authors":[{"name":"Kaiming He"}],"publicationTitle":"2016 IEEE CVPR","publicationYear":"2016","doi":"10.1109/CVPR.2016.90","abstract":"Deeper networks."};\n</script>`);
  assert.deepEqual([ieee.title, ieee.authors[0], ieee.venue, ieee.year, ieee.doi], ['Deep Residual Learning', 'Kaiming He', '2016 IEEE CVPR', '2016', '10.1109/cvpr.2016.90']);
});

test('filling a saved paper only touches gaps and upgrades truncated abstracts', () => {
  const full = 'Long-form video understanding is complicated by the high redundancy of video data and the abundance of query-irrelevant information. To tackle these challenges we propose VideoTree.';
  assert.equal(isTruncatedAbstract('Long-form video understanding is complicated by the high redundancy of video data and the ...', full), true);
  assert.equal(isTruncatedAbstract('A different abstract written by the user about the same paper.', full), false);
  const paper = { title: 'VIDEOTREE: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos', authors: [], year: '', venue: 'My venue note', abstract: '', abstractZh: '旧译文', sourceUrl: `${READER}?id=2405.19209` };
  const filled = applyBibliography(paper, { found: true, matchedBy: 'id', ...metadataFromArxiv(parseArxivFeed(feed(VIDEOTREE))[0]) });
  assert.deepEqual(filled.sort(), ['abstract', 'authors', 'sourceUrl', 'title', 'year']);
  assert.equal(paper.venue, 'My venue note');
  assert.equal(paper.title, 'VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos');
  assert.equal(paper.sourceUrl, 'https://arxiv.org/abs/2405.19209');
  assert.equal(paper.abstractZh, '');
  const curated = { title: 'My own wording of the paper title', authors: ['Kept Author'], year: '2023', abstract: 'Short note.', sourceUrl: 'https://arxiv.org/abs/2405.19209' };
  assert.deepEqual(applyBibliography(curated, { found: true, matchedBy: 'id', title: 'VideoTree', authors: ['Other'], year: '2025', venue: 'CVPR 2025', abstract: full }), ['venue']);
  assert.equal(curated.title, 'My own wording of the paper title');
  // Punctuation differences are not case-only: keep the readable title instead of arXiv's LaTeX.
  const rendered = { title: 'π∗0.6: a VLA That Learns From Experience', authors: [], sourceUrl: 'https://arxiv.org/abs/2511.14759' };
  applyBibliography(rendered, { found: true, matchedBy: 'id', title: '$π^{*}_{0.6}$: a VLA That Learns From Experience', authors: ['A'] });
  assert.equal(rendered.title, 'π∗0.6: a VLA That Learns From Experience');
  assert.equal(curated.abstract, 'Short note.');
});

test('only paper-like records are queued for lookup', () => {
  assert.equal(needsBibliography({ title: 'LabHarness：用 AI 驾驭长周期自主实验', sourceUrl: 'https://mp.weixin.qq.com/s/abc' }), false);
  assert.equal(needsBibliography({ title: 'A Pragmatic VLA Foundation Model', sourceUrl: 'https://www.alphaxiv.org/abs/2601.18692', authors: ['A'], year: '2026', abstract: 'x'.repeat(400) }), true);
  assert.equal(needsBibliography({ title: 'A Pragmatic VLA Foundation Model', sourceUrl: 'https://arxiv.org/abs/2601.18692', authors: ['A'], year: '2026', venue: 'ICLR 2026', abstract: 'x'.repeat(400) }), false);
  assert.equal(needsBibliography({ title: 'GEM: Generative Supervision Helps Embodied Intelligence', sourceUrl: '' }), true);
  assert.equal(needsBibliography({ title: 'VIDEOTREE', authors: ['A'], year: '2024', sourceUrl: `${READER}?id=2405.19209` }), true);
  assert.equal(titleSearchAllowed({ title: 'Hyra: 简单有效的科学发现智能体', sourceUrl: 'https://hy.tencent.com/research/hyra' }), false);
  assert.equal(titleSearchAllowed({ title: 'Some Paper Title Here', sourceUrl: 'https://example.org/files/paper.pdf' }), true);
});
