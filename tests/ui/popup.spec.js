import { test, expect } from '@playwright/test';

const READER = 'chrome-extension://acafiedlcaibhilacmadmiklkfhmlhjo/reader/reader.html';
const TITLE = 'VideoTree: Adaptive Tree-based Video Representation for LLM Reasoning on Long Videos';
const ABSTRACT = 'Long-form video understanding is complicated by the high redundancy of video data and the abundance of query-irrelevant information. To tackle these challenges, we propose VideoTree, a training-free framework.';
const feed = entries => `<?xml version='1.0' encoding='UTF-8'?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">${entries.map(([id, title, comment]) => `<entry><id>http://arxiv.org/abs/${id}v3</id><title>${title}</title><summary>${ABSTRACT}</summary><published>2024-05-29T15:49:09Z</published><arxiv:comment>${comment}</arxiv:comment><author><name>Ziyang Wang</name></author><author><name>Shoubin Yu</name></author><author><name>Elias Stengel-Eskin</name></author></entry>`).join('')}</feed>`;

// tab：当前标签页；page：注入脚本的返回值，null 表示像别的扩展页面那样不允许注入
async function openPopup(browserPage, { tab, page = null, delayMs = 0, entries = [['2405.19209', TITLE, 'CVPR 2025; Project page: https://videotree2024.github.io/']] }) {
  const errors = [];
  browserPage.on('pageerror', error => errors.push(error.message));
  const requests = [];
  await browserPage.route('https://export.arxiv.org/**', async route => {
    requests.push(route.request().url());
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: 'application/atom+xml', headers: { 'access-control-allow-origin': '*' }, body: feed(entries) });
  });
  await browserPage.route('https://api.semanticscholar.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":[]}' }));
  await browserPage.addInitScript(({ tab, page }) => {
    const values = { paperTagStore: { papers: [], tags: [], topicPacks: [] }, paperTagConfig: { autoDescribeTags: false } };
    window.chrome = {
      storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); }, async set(data) { Object.assign(values, structuredClone(data)); }, async remove(key) { delete values[key]; } } },
      runtime: { id: 'test-extension', getURL: path => `http://127.0.0.1:4178/${path}`, sendMessage: async () => {}, onMessage: { addListener() {} } },
      tabs: { query: async () => [tab], create: async () => {} },
      scripting: { async executeScript({ func }) {
        if (!page) throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.');
        return [{ result: func.name === 'pagePaperMetadata' ? page : { ok: false } }];
      } }
    };
  }, { tab, page });
  await browserPage.goto('/popup.html');
  return { errors, requests };
}

test('a PDF reader page that blocks scripts is filled from its arXiv ID and saved under the paper address', async ({ page }) => {
  const { errors, requests } = await openPopup(page, { tab: { id: 7, url: `${READER}?id=2405.19209`, title: 'arXiv:2405.19209 · LLM_in_PDF' } });
  await expect(page.locator('#titleInput')).toHaveValue(TITLE);
  await expect(page.locator('[data-bib-field="authors"]')).toHaveValue('Ziyang Wang; Shoubin Yu; Elias Stengel-Eskin');
  await expect(page.locator('[data-bib-field="year"]')).toHaveValue('2025');
  await expect(page.locator('[data-bib-field="venue"]')).toHaveValue('CVPR 2025');
  await expect(page.locator('#abstractInput')).toHaveValue(ABSTRACT);
  await expect(page.locator('#captureBibliography [role="status"]')).toContainText('已从 arXiv 补全');
  await expect(page.locator('#conversationInput')).toHaveValue('来源页面：https://arxiv.org/abs/2405.19209');
  expect(requests[0]).toContain('id_list=2405.19209');
  await page.locator('#saveButton').click();
  await expect(page.locator('#message')).toContainText('已收藏');
  const saved = await page.evaluate(async () => (await import('/storage.js')).handleApi('/api/state').then(state => state.papers[0]));
  expect(saved.sourceUrl).toBe('https://arxiv.org/abs/2405.19209');
  expect(saved.authors).toEqual(['Ziyang Wang', 'Shoubin Yu', 'Elias Stengel-Eskin']);
  expect(errors).toEqual([]);
});

test('edits made while the lookup is running are kept', async ({ page }) => {
  await openPopup(page, { tab: { id: 7, url: `${READER}?id=2405.19209`, title: 'VIDEOTREE: ADAPTIVE TREE-BASED VIDEO REPRESENTATION · LLM_in_PDF' }, delayMs: 900 });
  await page.locator('#titleInput').fill('My preferred title');
  await page.locator('#abstractInput').fill('My own summary.');
  await expect(page.locator('[data-bib-field="authors"]')).toHaveValue('Ziyang Wang; Shoubin Yu; Elias Stengel-Eskin');
  await expect(page.locator('#titleInput')).toHaveValue('My preferred title');
  await expect(page.locator('#abstractInput')).toHaveValue('My own summary.');
});

test('a code repository is matched to the linked arXiv paper whose title it carries', async ({ page }) => {
  await openPopup(page, {
    tab: { id: 8, url: 'https://github.com/Ziyang412/VideoTree', title: `GitHub - Ziyang412/VideoTree: Code for CVPR25 paper "${TITLE}"` },
    page: { title: `[CVPR 2025] ${TITLE}`, titleSource: 'page', titleCandidates: [`[CVPR 2025] ${TITLE}`, `GitHub - Ziyang412/VideoTree: Code for CVPR25 paper "${TITLE}"`], description: 'Code for CVPR25 paper', abstractSource: 'description', selectedText: '', authors: [], year: '', venue: '', doi: '', arxivIds: ['2405.19209', '2212.04501'], scholarly: false },
    entries: [['2212.04501', 'Learning Video Representations from Large Language Models', ''], ['2405.19209', TITLE, 'CVPR 2025']]
  });
  await expect(page.locator('[data-bib-field="authors"]')).toHaveValue('Ziyang Wang; Shoubin Yu; Elias Stengel-Eskin');
  await expect(page.locator('#titleInput')).toHaveValue(TITLE);
  await expect(page.locator('#abstractInput')).toHaveValue(ABSTRACT);
});

test('a complete scholarly page keeps its own facts and only gains the missing venue', async ({ page }) => {
  const pageAbstract = `${ABSTRACT} The page shows the complete abstract.`;
  await openPopup(page, {
    tab: { id: 9, url: 'https://www.alphaxiv.org/abs/2405.19209', title: `${TITLE} | alphaXiv` },
    page: { title: TITLE, titleSource: 'meta', titleCandidates: [TITLE], description: pageAbstract, abstractSource: 'paper', selectedText: '', authors: ['Ziyang Wang', 'Shoubin Yu'], year: '2024', venue: '', doi: '', arxivIds: ['2405.19209'], scholarly: true }
  });
  await expect(page.locator('[data-bib-field="venue"]')).toHaveValue('CVPR 2025');
  await expect(page.locator('[data-bib-field="authors"]')).toHaveValue('Ziyang Wang; Shoubin Yu');
  await expect(page.locator('[data-bib-field="year"]')).toHaveValue('2024');
  await expect(page.locator('#abstractInput')).toHaveValue(pageAbstract);
  await expect(page.locator('#titleInput')).toHaveValue(TITLE);
});
