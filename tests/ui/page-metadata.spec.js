import { test, expect } from '@playwright/test';
import { pagePaperMetadata } from '../../extension/bibliography.js';

// Chrome serializes the extractor into the tab, so run it the same way: as source text,
// inside a page served at a realistic address (hostname-specific rules depend on it).
async function extract(page, html, url = 'https://papers.example.org/paper') {
  await page.route(url, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(url);
  return page.evaluate(`(${pagePaperMetadata.toString()})()`);
}

test('Highwire and Dublin Core tags are read case-insensitively and names become "First Last"', async ({ page }) => {
  const result = await extract(page, `<head><meta name="citation_title" content="Deep Residual Learning for Image Recognition"><meta name="citation_author" content="He, Kaiming"><meta name="citation_author" content="Zhang, Xiangyu"><meta name="citation_publication_date" content="2016"><meta name="citation_conference_title" content="CVPR"><meta name="citation_doi" content="10.1109/CVPR.2016.90"></head>
    <body><div id="abstract">Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks.</div></body>`);
  expect(result.authors).toEqual(['Kaiming He', 'Xiangyu Zhang']);
  expect(result.abstractSource).toBe('paper');
  expect(result.doi).toBe('10.1109/cvpr.2016.90');
  const acm = await extract(page, `<head><meta name="dc.Title" content="ImageNet classification with deep convolutional neural networks"><meta name="dc.Creator" content="Alex Krizhevsky"><meta name="dc.Creator" content="Ilya Sutskever"><meta name="dc.Date" content="2017-05-24"></head>`);
  expect([acm.title, acm.authors, acm.year, acm.titleSource]).toEqual(['ImageNet classification with deep convolutional neural networks', ['Alex Krizhevsky', 'Ilya Sutskever'], '2017', 'meta']);
  // A blog using DC.creator without a document title keeps its byline out of the authors.
  expect((await extract(page, `<head><meta name="DC.creator" content="Blog Writer"><meta property="og:title" content="My weekly notes"></head>`)).authors).toEqual([]);
});

test('an "Abstract" heading supplies the abstract instead of a citation-string description', async ({ page }) => {
  const result = await extract(page, `<head><meta name="citation_title" content="BERT"><meta name="citation_author" content="Jacob Devlin"><meta name="description" content="Jacob Devlin, Ming-Wei Chang. Proceedings of NAACL 2019."></head>
    <body><div class="card-body acl-abstract"><h5 class="card-title">Abstract</h5><span>We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers.</span></div></body>`);
  expect(result.description).toMatch(/^We introduce a new language representation model/);
  const neurips = await extract(page, `<body><h4>Abstract</h4><p></p><p>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration.</p></body>`);
  expect(neurips.description).toMatch(/^The dominant sequence transduction/);
  expect(neurips.abstractSource).toBe('paper');
  const blog = await extract(page, `<head><meta name="description" content="A short site description."></head><body><h2>摘要</h2><p>${'这是一篇公众号文章的内容摘要，不是论文摘要。'.repeat(5)}</p></body>`);
  expect(blog.abstractSource).toBe('description');
});

test('academic project pages list authors without venue lines or affiliations, and expose linked arXiv IDs', async ({ page }) => {
  const result = await extract(page, `<head><title>VideoTree</title></head><body>
    <h1 class="title publication-title">VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos</h1>
    <div class="is-size-5 publication-authors"><span class="author-block">CVPR 2025</span><span class="author-block"><a href="#">Ziyang Wang</a><sup>*</sup>,</span><span class="author-block"><a href="#">Shoubin Yu</a><sup>1,2</sup>,</span></div>
    <div class="is-size-5 publication-authors"><span class="author-block"><sup>1</sup>UNC Chapel Hill University</span></div>
    <a href="https://arxiv.org/abs/2405.19209/">arXiv</a><a href="https://arxiv.org/pdf/2405.19209v2">PDF</a><a href="https://arxiv.org/abs/2212.04501">Related</a>
    <h2 class="title is-3">Abstract</h2><div class="content"><p>Video-language understanding tasks have historically focused on short video clips, often struggling with long-form video.</p></div></body>`);
  expect(result.authors).toEqual(['Ziyang Wang', 'Shoubin Yu']);
  expect(result.title).toBe('VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos');
  expect(result.arxivIds).toEqual(['2405.19209', '2212.04501']);
});

test('GitHub repositories prefer the README heading over "GitHub - owner/repo"', async ({ page }) => {
  const result = await extract(page, `<head><meta property="og:title" content="GitHub - Ziyang412/VideoTree: Code for CVPR25 paper"></head><body><article class="markdown-body"><h1>[CVPR 2025] VideoTree: Adaptive Tree-based Video Representation</h1></article></body>`, 'https://github.com/Ziyang412/VideoTree');
  expect(result.title).toBe('[CVPR 2025] VideoTree: Adaptive Tree-based Video Representation');
  expect(result.titleSource).toBe('page');
});
