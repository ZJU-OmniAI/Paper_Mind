import { test, expect } from '@playwright/test';

// This browser-local library and every model response are synthetic. No account
// credentials, user library or live model service is used by these tests.
async function setup(page, { configured = true, count = 12, tagCount = 2, extraValues = null } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ configured, count, tagCount, extraValues }) => {
    const now = new Date().toISOString();
    const tags = ['检索方法', '证据评估', '智能体规划'].slice(0, tagCount).map((name, index) => ({ id: `tag-${index}`, name, aliases: [], description: `${name}的示例资料`, descriptionStatus: 'ready', paperIds: [], createdAt: now, updatedAt: now }));
    const papers = Array.from({ length: count }, (_, index) => ({
      id: `paper-${index}`, title: `Fixture paper ${index + 1}`,
      abstract: `Source ${index + 1}: retrieved evidence supports answer verification. The saved material contains no measured accuracy result.`,
      memory: `关注第 ${index + 1} 篇论文的证据`, conversation: `Notes for paper ${index + 1}`,
      tagIds: [`tag-${index % tagCount}`], sourceUrl: `https://example.org/paper/${index + 1}`,
      valueScore: 3, citationCount: 0, citationStatus: 'ok', citationMatchVersion: 2, citationSource: 'semanticscholar:title', citationUpdatedAt: now, createdAt: now, updatedAt: now
    }));
    const values = JSON.parse(localStorage.getItem('research-test-values') || 'null') || {
      paperTagStore: { papers, tags, topicPacks: [], ...(extraValues ? { meta: extraValues } : {}) },
      paperTagConfig: { qwenKey: configured ? 'synthetic-test-key' : '', autoDescribeTags: false }
    };
    window.chrome = {
      storage: { local: {
        async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); },
        async set(data) { Object.assign(values, structuredClone(data)); localStorage.setItem('research-test-values', JSON.stringify(values)); },
        async remove(key) { delete values[key]; localStorage.setItem('research-test-values', JSON.stringify(values)); }
      } },
      runtime: { id: 'research-test-extension', getURL: path => `http://127.0.0.1:4178/${path}`, sendMessage: async () => {}, onMessage: { addListener() {} }, getContexts: async () => [] },
      tabs: { query: async () => [], create: async () => {} }, scripting: { executeScript: async () => [] }
    };
  }, { configured, count, tagCount, extraValues });
  await page.route('https://**/*', route => route.fulfill({ json: {} }));
  await page.goto('/manager.html');
  await expect(page.locator('#paperCount')).toHaveText(String(count));
  await page.locator('[data-view="research"]').click();
  return errors;
}

const experiment = {
  setup: 'Compare verification with and without evidence checks on held-out questions.',
  baseline: 'The same retrieval pipeline without evidence checks.',
  metric: 'Human-rated groundedness and response latency.',
  successCriterion: 'Proposed criterion: improve groundedness without doubling latency.'
};

const references = input => input.papers.map(paper => ({ paperId: paper.paperId, quote: paper.evidence.slice(0, 100) }));

function modelOutput(input) {
  const evidence = references(input);
  if (input.task === 'compare_saved_papers') return {
    title: 'Evidence comparison <img src=x onerror=alert(1)>',
    comparison: {
      summary: 'The saved material describes evidence use; no comparable scores are available.',
      dimensions: [{ name: 'Evidence strategy', cells: evidence.map(ref => ({ paperId: ref.paperId, finding: 'Uses retrieved evidence for verification.', evidence: [ref] })) }],
      commonalities: ['Both discuss retrieved evidence.'], differences: ['Methods need fuller descriptions.'], gaps: ['Measured accuracy is not available.']
    }
  };
  if (input.task === 'generate_cross_tag_ideas') {
    const first = input.tags.map(tag => input.papers.find(paper => paper.tagIds.includes(tag.id)));
    const principles = input.tags.map((tag, index) => ({ id: `p${index + 1}`, tagId: tag.id, name: `${tag.name}理念`, summary: `What ${tag.name} papers bet on.`, paperIds: [first[index].paperId], evidence: [{ paperId: first[index].paperId, quote: first[index].evidence.slice(0, 100) }] }));
    return {
      title: '检索与验证交叉探索', principles,
      ideas: [{ title: 'Evidence-aware retrieval', principleIds: principles.slice(0, 2).map(item => item.id), fusion: 'Evidence checks decide when retrieval runs.', hypothesis: 'Evidence checks may improve grounded responses.', rationale: 'Combine retrieval methods with evidence evaluation.', evidence: first.slice(0, 2).map(paper => ({ paperId: paper.paperId, quote: paper.evidence.slice(0, 100) })),
        assumptions: ['Evidence quality can be measured.'], experiment, risks: ['Checks may increase latency.'] }]
    };
  }
  if (input.task === 'critique_and_refine_library_idea') return {
    critique: ['Verification may inherit retrieval errors.'], refinedHypothesis: `Round ${input.round}: independent checks may reduce correlated errors.`, evidence: evidence.slice(0, 2),
    experiment, risks: ['Independent evidence may be unavailable.'], nextSteps: ['Collect held-out questions and verify source coverage.']
  };
  if (input.task === 'discuss_saved_research') return {
    answerKind: 'grounded', answer: `Answer to: ${input.question}\nThe saved evidence supports verification, while improved accuracy remains a hypothesis. <img src=x onerror=alert(1)>`,
    evidence: evidence.slice(0, 1), suggestedQuestions: ['What would falsify the proposed hypothesis?']
  };
  throw new Error(`Unexpected model task: ${input.task}`);
}

async function mockModel(page, transform = output => output) {
  const requests = [];
  await page.route('**/chat/completions', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    requests.push(input);
    const output = transform(modelOutput(input), input);
    await route.fulfill({ json: { model: 'synthetic-research-model', choices: [{ message: { content: JSON.stringify(output) } }] } });
  });
  return requests;
}

async function chooseTags(page, ids = ['tag-0', 'tag-1']) {
  for (const button of await page.locator('[data-fusion-tag]').all()) {
    const id = await button.getAttribute('data-fusion-tag'), pressed = await button.getAttribute('aria-pressed') === 'true';
    if (pressed !== ids.includes(id)) await button.click();
  }
  await page.locator('#researchQuestion').fill('Fuse evidence checks without assuming measured accuracy.');
}

async function fuseTwo(page) {
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchReport .research-report')).toBeVisible();
}

async function readReports(page) {
  return page.evaluate(async () => {
    const { handleApi } = await import('/storage.js');
    return (await handleApi('/api/research')).reports;
  });
}

test('research requires a configured model and explains setup in both languages', async ({ page }) => {
  const errors = await setup(page, { configured: false });
  await expect(page.locator('#researchGenerate')).toBeDisabled();
  await expect(page.locator('#view-research')).toContainText('请先在“模型设置”中配置并测试模型');
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('#view-research')).toContainText('Configure and test a model');
  expect(errors).toEqual([]);
});

test('fusion distills principles per tag, keeps evidence and survives reload, JSON round-trip and Markdown download', async ({ page }) => {
  const errors = await setup(page);
  const requests = await mockModel(page, (output, input) => {
    if (input.task === 'generate_cross_tag_ideas') output.principles[0].summary += ' <img src=x onerror=alert(1)>';
    return output;
  });
  await expect(page.locator('[data-research-mode]')).toHaveCount(0);
  await expect(page.locator('#view-research')).toContainText('选篇对比');
  await page.screenshot({ path: 'test-results/deep-exploration-empty-demo.png', animations: 'disabled' });
  await chooseTags(page, ['tag-0']);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchError')).toContainText('两个不同的标签');
  expect(requests).toHaveLength(0);
  await fuseTwo(page);
  expect(requests).toHaveLength(1);
  expect(requests[0].task).toBe('generate_cross_tag_ideas');
  expect(requests[0].tags.map(tag => tag.id)).toEqual(['tag-0', 'tag-1']);
  expect(requests[0].question).toContain('without assuming');
  await expect(page.locator('#researchReport')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#researchReport img')).toHaveCount(0);
  await expect(page.locator('.fusion-map .fusion-principle')).toHaveCount(2);
  await expect(page.locator('.fusion-map .fusion-idea')).toHaveCount(1);
  await expect.poll(() => page.locator('.fusion-links path').count()).toBe(2);
  await expect(page.locator('.research-idea .fusion-formula')).toContainText('检索方法理念');
  await expect(page.locator('.research-idea .fusion-formula')).toContainText('证据评估理念');
  await expect(page.locator('.fusion-mechanism')).toContainText('Evidence checks decide when retrieval runs.');
  const report = (await readReports(page))[0];
  expect(report.principles.map(item => item.tagId)).toEqual(['tag-0', 'tag-1']);
  expect(report.ideas[0].principleIds).toEqual(['p1', 'p2']);
  expect(report.snapshot.papers[0].evidence).toContain('Source 1:');
  expect(report.model.responseModel).toBe('synthetic-research-model');
  await page.locator('#researchReport').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/research-fusion-desktop.png' });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#researchDownload').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`Paper_Mind-${report.id}.md`);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('Source 1:');
  expect(markdown).toContain('&lt;img');
  expect(markdown).toContain('https://example.org/paper/1');
  expect(markdown).toContain('Design principles by tag');
  expect(markdown).toContain('Fuses: 检索方法理念 + 证据评估理念');
  await page.reload();
  await page.locator('[data-view="research"]').click();
  await page.locator(`[data-research-report="${report.id}"]`).click();
  await expect(page.locator('#researchReport')).toContainText('检索与验证交叉探索');
  expect(requests).toHaveLength(1);
  const exported = await page.evaluate(async () => {
    const { handleApi } = await import('/storage.js');
    const result = await handleApi('/api/export');
    await handleApi('/api/import', { method: 'POST', body: result });
    return result;
  });
  expect(exported.store.meta.researchReports[report.id].snapshot).toEqual(report.snapshot);
  expect(exported.store.meta.researchReports[report.id].principles).toEqual(report.principles);
  expect(JSON.stringify(exported)).not.toContain('synthetic-test-key');
  expect((await readReports(page))[0].id).toBe(report.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('#researchReport')).toContainText('Fusion map');
  await expect(page.locator('#researchReport')).toContainText('Design principles by tag');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/research-fusion-mobile-dark.png', fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#researchDelete').click();
  await expect(page.locator('[data-research-report]')).toHaveCount(0);
  expect(await readReports(page)).toEqual([]);
  await expect(page.locator('#paperCount')).toHaveText('12');
  expect(errors).toEqual([]);
});

test('complete notes and every clip reach the model, including retries after a context rejection', async ({ page }) => {
  const errors = await setup(page, { count: 2 });
  const notes = `个人笔记\n${'完整笔记内容。'.repeat(20000)}\nNOTES_END_CAN_BE_CITED`;
  const clips = [
    `# 完整剪藏一\n${'方法细节。'.repeat(18000)}\nCLIP_ONE_END_CAN_BE_CITED`,
    '# 完整剪藏二\n```python\n    result = "保留缩进"\n```\nCLIP_TWO_END_CAN_BE_CITED'
  ];
  await page.evaluate(async ({ notes, clips }) => {
    const { handleApi } = await import('/storage.js');
    const backup = await handleApi('/api/export');
    const paper = backup.store.papers.find(paper => paper.id === 'paper-0');
    paper.conversation = notes;
    paper.clips = clips.map((markdown, index) => ({ id: `large-clip-${index}`, title: `Full clip ${index}`, markdown }));
    await handleApi('/api/import', { method: 'POST', body: backup });
  }, { notes, clips });
  await page.reload();
  await page.locator('[data-view="research"]').click();
  await expect(page.locator('.research-disclosure')).toContainText('全部剪藏 Markdown');
  const requests = [];
  await page.route('**/chat/completions', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    requests.push(input);
    if (requests.length === 1) return route.fulfill({ status: 400, json: { error: { message: 'Model context length exceeded' } } });
    const result = modelOutput(input);
    if (input.task === 'discuss_saved_research') result.evidence = [{ paperId: 'paper-0', quote: 'CLIP_TWO_END_CAN_BE_CITED' }];
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(result) } }] } });
  });
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchError')).toContainText('Model context length exceeded');
  expect(await readReports(page)).toEqual([]);
  await expect(page.locator('#researchQuestion')).toHaveValue('Fuse evidence checks without assuming measured accuracy.');
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchReport .research-report')).toBeVisible();
  expect(requests[1].papers).toEqual(requests[0].papers);
  await page.locator('#researchChatInput').fill('What does the final clipping say?');
  await page.locator('#researchChatSend').click();
  await expect(page.locator('[data-research-prompt]')).toContainText(['What would falsify']);
  const report = (await readReports(page))[0];
  expect(report.chatTurns[0].evidence[0].quote).toBe('CLIP_TWO_END_CAN_BE_CITED');
  for (const input of requests) {
    const paper = input.papers.find(paper => paper.paperId === 'paper-0');
    expect(paper.evidence.length).toBeGreaterThan(140000);
    expect(paper.evidence).toContain(notes);
    clips.forEach(markdown => expect(paper.evidence).toContain(markdown));
    expect(paper.truncated).toBe(false);
    expect(paper.evidence).toBe(report.snapshot.papers[0].evidence);
  }
  expect(errors).toEqual([]);
});

test('cross-tag ideas balance sources, carry previous rounds and stop at the exploration budget', async ({ page }) => {
  const errors = await setup(page);
  const requests = await mockModel(page);
  await chooseTags(page, ['tag-0']);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchError')).toContainText('两个不同');
  expect(requests).toHaveLength(0);
  await chooseTags(page);
  const previewTitles = await page.locator('.fusion-sample-paper:has(input:checked) span').allTextContents();
  expect(previewTitles).toHaveLength(8);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchReport .research-idea')).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].papers).toHaveLength(8);
  expect(requests[0].papers.map(paper => paper.title).sort()).toEqual([...previewTitles].sort());
  expect(requests[0].papers.filter(paper => paper.tagIds.includes('tag-0'))).toHaveLength(4);
  expect(requests[0].papers.filter(paper => paper.tagIds.includes('tag-1'))).toHaveLength(4);
  await expect(page.locator('#researchReport')).toContainText('新颖性');
  await page.locator('.research-idea').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/research-idea-desktop.png' });
  await page.locator('#researchRounds').selectOption('3');
  await page.locator('#researchFollowup').fill('Use one GPU and test the weakest assumption first.');
  await page.locator('#researchExplore').click();
  await expect(page.locator('.research-round')).toHaveCount(3);
  await expect(page.locator('#researchExplore')).toBeDisabled();
  expect(requests).toHaveLength(4);
  expect(requests.slice(1).map(request => request.previousRounds.length)).toEqual([0, 1, 2]);
  expect(requests[3].question).toContain('one GPU');
  expect((await readReports(page))[0].rounds).toHaveLength(3);
  await page.screenshot({ path: 'test-results/research-ideas-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('invented evidence is rejected without replacing a saved fusion, while an unsupported principle is only dropped', async ({ page }) => {
  const errors = await setup(page);
  await mockModel(page);
  await fuseTwo(page);
  const original = (await readReports(page))[0];
  await mockModel(page, output => {
    output.ideas[0].evidence[0].quote = 'Invented source text that never appeared in this library.';
    return output;
  });
  await page.locator('#researchNew').click();
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchError')).toContainText('不匹配');
  expect((await readReports(page)).map(report => report.id)).toEqual([original.id]);
  await page.locator(`[data-research-report="${original.id}"]`).click();
  await expect(page.locator('#researchReport')).toContainText(original.title);
  await mockModel(page, output => {
    output.principles[0].evidence[0].quote = 'A principle quote that is not in the saved material.';
    return output;
  });
  await page.locator('#researchNew').click();
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('.fusion-map .fusion-principle')).toHaveCount(1);
  const partial = (await readReports(page)).find(report => report.id !== original.id);
  expect(partial.principles.map(item => item.id)).toEqual(['p2']);
  expect(partial.ideas[0].principleIds).toEqual(['p2']);
  await page.route('**/chat/completions', route => route.fulfill({ status: 503, json: { error: { message: 'Synthetic model offline' } } }));
  await page.locator('#researchNew').click();
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchError')).toContainText('Synthetic model offline');
  expect((await readReports(page)).map(report => report.id).sort()).toEqual([original.id, partial.id].sort());
  expect(errors).toEqual([]);
});

test('deep exploration continues a grounded conversation with suggestions and durable export', async ({ page }) => {
  const errors = await setup(page);
  const requests = await mockModel(page);
  await expect(page.locator('[data-view="research"]')).toHaveText('深度探索');
  await fuseTwo(page);
  const original = (await readReports(page))[0];
  await page.locator('#researchChatAction').selectOption('critique');
  await page.locator('#researchChatInput').fill('Challenge the weakest assumption.');
  await page.locator('#researchChatInput').press('Enter');
  await expect(page.locator('#researchChatInput')).toHaveValue('Challenge the weakest assumption.\n');
  expect(requests).toHaveLength(1);
  await page.locator('#researchChatInput').press('Control+Enter');
  await expect(page.locator('.agent-chat-turn')).toHaveCount(1);
  expect(requests[1].task).toBe('discuss_saved_research');
  expect(requests[1].action).toBe('critique');
  expect(requests[1].recentChat).toEqual([]);
  expect(requests[1].initialAnalysis.title).toBe(original.title);
  await expect(page.locator('.agent-chat-turn .agent-answer')).toContainText('improved accuracy remains a hypothesis');
  await expect(page.locator('.agent-chat-turn img')).toHaveCount(0);
  await expect(page.locator('#researchArtifact')).not.toHaveAttribute('open');
  await page.locator('[data-research-prompt]').filter({ hasText: 'What would falsify' }).last().click();
  await expect(page.locator('#researchChatInput')).toHaveValue('What would falsify the proposed hypothesis?');
  expect(requests).toHaveLength(2);
  await page.locator('#researchChatSend').click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(2);
  expect(requests[2].recentChat).toHaveLength(1);
  expect(requests[2].recentChat[0].question).toBe('Challenge the weakest assumption.');
  const saved = (await readReports(page))[0];
  expect(saved.chatTurns).toHaveLength(2);
  expect(saved.chatTurns[0].evidence[0].quote).toContain('Source 1:');
  await page.reload();
  await page.locator('[data-view="research"]').click();
  await page.locator(`[data-research-report="${saved.id}"]`).click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(2);
  expect(requests).toHaveLength(3);
  const backup = await page.evaluate(async () => {
    const { handleApi } = await import('/storage.js');
    const exported = await handleApi('/api/export');
    await handleApi('/api/import', { method: 'POST', body: exported });
    return exported;
  });
  expect(backup.store.meta.researchReports[saved.id].chatTurns).toEqual(saved.chatTurns);
  expect((await readReports(page))[0].chatTurns).toEqual(saved.chatTurns);
  await page.locator('#researchShowReport').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#researchDownload').click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const markdown = Buffer.concat(chunks).toString('utf8');
  expect(markdown).toContain('Challenge the weakest assumption.');
  expect(markdown).toContain('What would falsify the proposed hypothesis?');
  expect(markdown).toContain('improved accuracy remains a hypothesis');
  expect(markdown).toContain('&lt;img');
  await page.locator('.agent-chat-turn').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/deep-exploration-chat-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('[data-view="research"]')).toHaveText('Deep exploration');
  await page.locator('.agent-chat-turn').last().scrollIntoViewIfNeeded();
  await page.locator('#researchChatInput').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/deep-exploration-chat-mobile-dark.png' });
  expect(errors).toEqual([]);
});

test('chat failure and invalid citations retain history and a retried insufficient answer explains missing input', async ({ page }) => {
  const errors = await setup(page);
  await mockModel(page);
  await fuseTwo(page);
  await page.locator('#researchChatInput').fill('What does the evidence establish?');
  await page.locator('#researchChatSend').click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(1);
  let started, release;
  const ready = new Promise(resolve => started = resolve), gate = new Promise(resolve => release = resolve);
  await page.route('**/chat/completions', async route => {
    started(); await gate;
    await route.fulfill({ status: 503, json: { error: { message: 'Synthetic chat unavailable' } } });
  });
  await page.locator('#researchChatInput').fill('What is the exact measured accuracy?');
  await page.locator('#researchChatSend').click();
  await ready;
  await expect(page.locator('.research-pending-message')).toBeVisible();
  await expect(page.locator('#researchChatSend')).toBeDisabled();
  release();
  await expect(page.locator('#researchError')).toContainText('Synthetic chat unavailable');
  await expect(page.locator('.research-pending-message')).toHaveCount(0);
  expect((await readReports(page))[0].chatTurns).toHaveLength(1);
  await expect(page.locator('#researchChatInput')).toHaveValue('What is the exact measured accuracy?');
  await mockModel(page, output => ({ ...output, evidence: [{ paperId: 'paper-0', quote: 'This fabricated result does not exist in the saved material.' }] }));
  await page.locator('#researchChatSend').click();
  await expect(page.locator('#researchError')).toContainText('不匹配');
  expect((await readReports(page))[0].chatTurns).toHaveLength(1);
  await mockModel(page, () => ({ answerKind: 'insufficient', answer: 'The saved material does not provide measured accuracy. Please add the results table.', evidence: [], suggestedQuestions: ['Can you provide the results table and evaluation protocol?'] }));
  await page.locator('#researchChatSend').click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(2);
  await expect(page.locator('.agent-chat-turn').last()).toContainText('does not provide measured accuracy');
  const turns = (await readReports(page))[0].chatTurns;
  expect(turns[1].answerKind).toBe('insufficient');
  expect(turns[1].evidence).toEqual([]);
  await expect(page.locator('#researchError')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('a full chat history preserves the separate automatic research budget', async ({ page }) => {
  const errors = await setup(page);
  const requests = await mockModel(page);
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchChatSend')).toBeVisible();
  await page.locator('#researchChatInput').fill('How would evidence checks fail?');
  await page.locator('#researchChatSend').click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(1);
  const reportId = await page.evaluate(async () => {
    const { handleApi } = await import('/storage.js');
    const exported = await handleApi('/api/export');
    const report = Object.values(exported.store.meta.researchReports)[0];
    const first = report.chatTurns[0];
    report.chatTurns = Array.from({ length: 20 }, (_, index) => ({ ...structuredClone(first), id: `turn-fixture-${index}`, question: `Saved follow-up ${index + 1}` }));
    await handleApi('/api/import', { method: 'POST', body: exported });
    return report.id;
  });
  await page.reload();
  await page.locator('[data-view="research"]').click();
  await page.locator(`[data-research-report="${reportId}"]`).click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(20);
  await expect(page.locator('#researchChatSend')).toBeDisabled();
  await page.locator('#researchShowReport').click();
  await expect(page.locator('#researchExplore')).toBeEnabled();
  await page.locator('#researchRounds').selectOption('1');
  await page.locator('#researchExplore').click();
  await expect(page.locator('.research-round')).toHaveCount(1);
  const saved = (await readReports(page))[0];
  expect(saved.chatTurns).toHaveLength(20);
  expect(saved.rounds).toHaveLength(1);
  expect(requests).toHaveLength(3);
  await expect(page.locator('#researchChatSend')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('stopping waits for the current round and a later failure retains completed rounds', async ({ page }) => {
  const errors = await setup(page);
  let release, started;
  const gate = new Promise(resolve => release = resolve);
  const ready = new Promise(resolve => started = resolve);
  const requests = [];
  await page.route('**/chat/completions', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    requests.push(input);
    if (input.task === 'critique_and_refine_library_idea') { started(); await gate; }
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(modelOutput(input)) } }] } });
  });
  await chooseTags(page);
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchExplore')).toBeVisible();
  await page.locator('#researchRounds').selectOption('3');
  await page.locator('#researchExplore').click();
  await ready;
  await page.locator('#researchStop').click();
  await expect(page.locator('#researchStop')).toBeDisabled();
  release();
  await expect(page.locator('#researchStatus')).toContainText('已停止后续探索');
  await expect(page.locator('.research-round')).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect((await readReports(page))[0].rounds).toHaveLength(1);

  let furtherRounds = 0;
  await page.route('**/chat/completions', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    furtherRounds++;
    if (furtherRounds === 2) {
      await route.fulfill({ status: 503, json: { error: { message: 'Synthetic exploration interrupted' } } });
    } else {
      await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(modelOutput(input)) } }] } });
    }
  });
  await page.locator('#researchRounds').selectOption('2');
  await page.locator('#researchExplore').click();
  await expect(page.locator('#researchError')).toContainText('Synthetic exploration interrupted');
  await expect(page.locator('#researchStatus')).toContainText('已完成的报告和轮次仍保留');
  await expect(page.locator('.research-round')).toHaveCount(2);
  expect((await readReports(page))[0].rounds).toHaveLength(2);
  await expect(page.locator('#researchExplore')).toBeEnabled();
  await expect(page.locator('#researchRounds option')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('late chat replies preserve the reading position and do not refocus after opening a source', async ({ page }) => {
  const errors = await setup(page);
  await mockModel(page, (output, input) => input.task === 'discuss_saved_research' ? { ...output, answer: `${output.answer}\n${'A longer synthetic explanation of what the evidence can establish.\n'.repeat(35)}` } : output);
  await fuseTwo(page);
  await page.locator('#researchChatInput').fill('Explain the evidence carefully.');
  await page.locator('#researchChatSend').click();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(1);

  let started, release;
  const ready = new Promise(resolve => started = resolve), gate = new Promise(resolve => release = resolve);
  await page.route('**/chat/completions', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    started(); await gate;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(modelOutput(input)) } }] } });
  });
  await page.locator('#researchChatInput').fill('Give a concise follow-up.');
  await page.locator('#researchChatSend').click();
  await ready;
  const scrollRoom = await page.locator('#researchConversation').evaluate(element => {
    element.scrollTop = 0; element.focus();
    return element.scrollHeight - element.clientHeight;
  });
  expect(scrollRoom).toBeGreaterThan(200);
  release();
  await expect(page.locator('.agent-chat-turn')).toHaveCount(2);
  await expect(page.locator('#researchChatSend')).toBeEnabled();
  expect(await page.locator('#researchConversation').evaluate(element => element.scrollTop)).toBeLessThan(80);
  await expect(page.locator('#researchConversation')).toBeFocused();

  let nextStarted, nextRelease;
  const nextReady = new Promise(resolve => nextStarted = resolve), nextGate = new Promise(resolve => nextRelease = resolve);
  await page.route('**/chat/completions', async route => {
    const input = JSON.parse(route.request().postDataJSON().messages[1].content);
    nextStarted(); await nextGate;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(modelOutput(input)) } }] } });
  });
  await page.locator('#researchChatInput').fill('Check the source again.');
  await page.locator('#researchChatSend').click();
  await nextReady;
  await page.locator('.research-session-sources [data-research-paper="paper-0"]').click();
  await expect(page.locator('#view-paper-detail')).toBeVisible();
  await page.locator('#editPaperDetailButton').focus();
  nextRelease();
  await expect.poll(async () => (await readReports(page))[0].chatTurns.length).toBe(3);
  await expect(page.locator('#researchChatSend')).toBeEnabled();
  await expect(page.locator('#view-paper-detail')).toBeVisible();
  await expect(page.locator('#editPaperDetailButton')).toBeFocused();
  expect(errors).toEqual([]);
});

test('IME input survives rerender without sending and conversation drafts remain isolated', async ({ page }) => {
  const errors = await setup(page);
  const requests = await mockModel(page);
  await fuseTwo(page);
  const firstId = (await readReports(page))[0].id;
  await page.locator('#researchChatAction').selectOption('critique');
  await page.locator('#researchChatInput').fill('第一份会话的草稿与约束');
  await page.locator('#researchChatInput').evaluate(element => { element.focus(); element.setSelectionRange(3, 7); });
  const originalInput = await page.locator('#researchChatInput').elementHandle();
  await page.locator('#researchChatInput').dispatchEvent('compositionstart');
  await page.locator('#researchChatInput').dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
  await page.locator('#languageSelect').selectOption('en');
  expect(await originalInput.evaluate(element => element.isConnected)).toBe(true);
  expect(requests).toHaveLength(1);
  await page.locator('#researchChatInput').dispatchEvent('compositionend');
  await expect(page.locator('#researchChatSend')).toHaveText('Send');
  await expect(page.locator('#researchChatInput')).toHaveValue('第一份会话的草稿与约束');
  expect(await page.locator('#researchChatInput').evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([3, 7]);
  await expect(page.locator('#researchChatInput')).toBeFocused();
  expect(requests).toHaveLength(1);
  await page.locator('#researchNew').click();
  await fuseTwo(page);
  const secondId = (await readReports(page)).find(report => report.id !== firstId).id;
  await page.locator('#researchChatInput').fill('Second conversation draft');
  await page.locator(`[data-research-report="${firstId}"]`).click();
  await expect(page.locator('#researchChatInput')).toHaveValue('第一份会话的草稿与约束');
  await expect(page.locator('#researchChatAction')).toHaveValue('critique');
  await page.locator(`[data-research-report="${secondId}"]`).click();
  await expect(page.locator('#researchChatInput')).toHaveValue('Second conversation draft');
  await expect(page.locator('#researchChatAction')).toHaveValue('followup');
  expect(requests).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('three-tag fusion samples every tag, draws one column per tag and honours an adjusted sample', async ({ page }) => {
  const errors = await setup(page, { tagCount: 3 });
  const requests = await mockModel(page);
  await chooseTags(page, ['tag-0', 'tag-1', 'tag-2']);
  await expect(page.locator('.fusion-sample-group')).toHaveCount(3);
  await expect(page.locator('.fusion-sample-paper input:checked')).toHaveCount(8);
  for (const id of ['tag-0', 'tag-1', 'tag-2']) await expect(page.locator(`[data-fusion-tag="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  const dropped = await page.locator('.fusion-sample-paper input:checked').first().getAttribute('data-fusion-paper');
  await page.locator(`[data-fusion-paper="${dropped}"]`).uncheck();
  await expect(page.locator('.research-sample > summary')).toContainText('7');
  await page.locator('[data-fusion-reset]').click();
  await expect(page.locator('.fusion-sample-paper input:checked')).toHaveCount(8);
  await page.locator(`[data-fusion-paper="${dropped}"]`).uncheck();
  await page.locator('#researchGenerate').click();
  await expect(page.locator('#researchReport .research-idea')).toHaveCount(1);
  expect(requests[0].papers).toHaveLength(7);
  expect(requests[0].papers.map(paper => paper.paperId)).not.toContain(dropped);
  for (const id of ['tag-0', 'tag-1', 'tag-2']) expect(requests[0].papers.some(paper => paper.tagIds.includes(id))).toBe(true);
  await expect(page.locator('.fusion-map.many .fusion-sources .fusion-column')).toHaveCount(3);
  await expect(page.locator('.fusion-principle-group')).toHaveCount(3);
  const report = (await readReports(page))[0];
  expect(report.tagIds).toEqual(['tag-0', 'tag-1', 'tag-2']);
  expect(new Set(report.principles.map(item => item.tagId)).size).toBe(3);
  await page.locator('#researchNew').click();
  await expect(page.locator('[data-fusion-reset]')).toHaveCount(0);
  await expect(page.locator('.fusion-sample-paper input:checked')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('earlier unscoped comparisons stay readable here while tag-scoped ones move to the tag', async ({ page }) => {
  const errors = await setup(page);
  await mockModel(page);
  await page.evaluate(async () => {
    const { handleApi } = await import('/storage.js');
    await handleApi('/api/research', { method: 'POST', body: JSON.stringify({ kind: 'comparison', paperIds: ['paper-0', 'paper-1'], question: 'Legacy comparison' }) });
    await handleApi('/api/research', { method: 'POST', body: JSON.stringify({ kind: 'comparison', scopeTagId: 'tag-0', paperIds: ['paper-0', 'paper-2'], question: 'Scoped comparison' }) });
  });
  await page.reload();
  await page.locator('[data-view="research"]').click();
  await expect(page.locator('.research-legacy > summary')).toContainText('旧版论文对比 · 1');
  await page.locator('.research-legacy > summary').click();
  await page.locator('.research-legacy [data-research-report]').click();
  await expect(page.locator('#researchReport .research-table')).toBeVisible();
  await expect(page.locator('#researchReport')).toContainText('Evidence comparison');
  await page.locator('[data-view="tags"]').click();
  await page.locator('#tagTree [data-tag-id="tag-0"]').click();
  await page.locator('[data-analysis-tab="compare"]').click();
  await expect(page.locator('.compare-history-item')).toHaveCount(1);
  await expect(page.locator('.compare-report')).toContainText('Evidence comparison');
  await page.locator('#tagDetail [data-research-tag="tag-0"]').click();
  await expect(page.locator('#view-research')).toHaveClass(/active/);
  await expect(page.locator('[data-fusion-tag="tag-0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-fusion-tag="tag-1"]')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
