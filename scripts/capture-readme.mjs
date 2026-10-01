// Reproducible documentation images from the real extension UI and synthetic data.
// No personal browser profile, extension database, clipboard or model key is used.
import { chromium, expect } from '@playwright/test';
import { installDemo } from './demo/fixture.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const output = path.join(root, 'assets/screenshots');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const file = path.resolve(extension, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(extension + path.sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  for (const language of ['zh', 'en']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, colorScheme: 'light', locale: language === 'zh' ? 'zh-CN' : 'en-US' });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await installDemo(context, language, origin);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const title = 'Reading Papers with Evidence-Aware Agents';
    const note = language === 'zh'
      ? '阅读笔记：组会讨论工具调用之后的证据验证。重点比较证据来源、冲突处理和结论可追溯性。'
      : 'Reading note: discuss evidence verification after tool use. Compare sources, conflict handling and traceability of conclusions.';
    const capture = async (name, locator) => {
      await page.evaluate(() => document.fonts.ready);
      const options = { path: path.join(output, `${name}-${language}.png`), animations: 'disabled' };
      if (locator) await locator.screenshot(options);
      else { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot(options); }
    };

    // Follow one paper through real form submission, IndexedDB persistence and tag filtering.
    await page.setViewportSize({ width: 480, height: 1100 });
    await page.goto(`${origin}/popup.html`);
    await expect(page.locator('#titleInput')).toHaveValue(title);
    await expect(page.locator('#serverStatus')).toContainText('8');
    await capture('step-01-capture', page.locator('.popup'));
    await page.locator('#tagInput').fill('agent');
    await expect(page.locator('#tagSuggestions .tag-suggestion:not(.create)')).toHaveCount(1);
    await capture('step-02-tag-search', page.locator('.popup'));
    await page.locator('#tagSuggestions .tag-suggestion:not(.create)').click();
    await page.locator('#tagInput').fill('evaluation');
    await page.locator('#tagSuggestions .tag-suggestion:not(.create)').click();
    await expect(page.locator('#tagBox .chip')).toHaveCount(2);
    await page.locator('#valueScoreInput').fill('4.5');
    const memory = language === 'zh' ? '先验证工具返回的证据，再让智能体回答论文问题。' : 'Check tool evidence before an agent answers questions about a paper.';
    await page.locator('#captureMemory').fill(memory);
    await page.locator('#captureReadingStatus').selectOption('reading');
    await page.locator('#conversationInput').fill(`${await page.locator('#conversationInput').inputValue()}\n\n${note}`);
    await capture('step-03-ready-to-save', page.locator('.popup'));
    await page.locator('#saveButton').click();
    await expect(page.locator('#savedBanner')).toBeVisible();
    await expect(page.locator('#message')).toHaveClass(/success/);
    await expect(page.locator('#serverStatus')).toContainText('9');
    await capture('step-04-saved', page.locator('.popup'));
    const saved = await page.evaluate(async title => {
      const { handleApi } = await import('/storage.js');
      const data = await handleApi('/api/state');
      return data.papers.find(paper => paper.title === title);
    }, title);
    expect(saved.tagIds.slice().sort()).toEqual(['agent', 'eval']);
    expect(saved.valueScore).toBe(4.5);
    expect(saved.memory).toBe(memory);
    expect(saved.readingStatus).toBe('reading');
    expect(saved.conversation).toContain(note);

    await page.locator('#openManagerButton').click();
    await page.waitForURL(`${origin}/manager.html`);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await expect(page.locator('#paperCount')).toHaveText('9');
    await page.locator('#paperLibrarySort').selectOption('created');
    const savedCard = page.locator(`#paperLibraryList [data-open-paper-id="${saved.id}"]`);
    await expect(page.locator('#paperLibraryList .paper-card').first()).toContainText(title);
    await capture('step-05-library');
    await page.locator('#conceptQuery').fill(language === 'zh' ? '我记得与智能体有关' : 'agents that read papers');
    await expect(page.locator('#conceptResults [data-concept-tag-id]')).toHaveCount(1);
    await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(9);
    await capture('step-06-find-tag');
    await page.locator('#conceptResults [data-concept-tag-id="agent"]').click();
    await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(3);
    await expect(savedCard).toBeVisible();
    await capture('step-07-tag-results', page.locator('#view-papers'));
    await savedCard.click();
    await expect(page.locator('#paperDetailTitle')).toHaveText(title);
    await expect(page.locator('#paperDetailConversation')).toContainText(note);
    await expect(page.locator('#paperDetailMemory')).toHaveText(memory);
    await expect(page.locator('#detailQuickStatus')).toHaveValue('reading');
    await expect(page.locator('#paperDetailTags')).toContainText(language === 'zh' ? '智能体' : 'Agents');
    await capture('step-08-paper-detail', page.locator('#view-paper-detail .paper-detail-page'));

    await page.locator('[data-view="papers"]').click();
    await page.locator('#libraryReadingStatus').selectOption('reading');
    await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(1);
    await capture('reading-status', page.locator('#view-papers'));
    await page.locator('[data-view="settings"]').click();
    await page.locator('[name="provider"][value="codex"]').check();
    await page.locator('#claudeModelSelect').selectOption('sonnet');
    await page.locator('#claudeEffort').selectOption('medium');
    await page.locator('#codexEffort').selectOption('high');
    await capture('local-models', page.locator('#view-settings'));

    // Additional feature views use the same collection after the walkthrough.
    await page.goto(`${origin}/manager.html`);
    await expect(page.locator('#paperCount')).toHaveText('9');
    await page.locator('#paperLibraryFilter').fill('RAG');
    await page.locator('#paperLibraryTagList [data-library-tag-id="eval"]').click();
    await page.locator('#paperLibraryList .paper-card').nth(1).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, `library-${language}.png`), fullPage: true, animations: 'disabled' });
    await page.locator('[data-view="tags"]').click();
    await page.locator('#tagTree [data-tag-id="rag"]').click();
    await page.screenshot({ path: path.join(output, `tags-${language}.png`), fullPage: true, animations: 'disabled' });
    await page.locator('[data-view="topics"]').click();
    await page.locator('[data-edit-topic-pack-id="pack-rag"]').click();
    await page.locator('#view-topics .topics-layout').screenshot({ path: path.join(output, `topics-${language}.png`), animations: 'disabled' });
    if (errors.length) throw new Error(errors.join('\n'));
    await context.close();
    console.log(`Captured ${language}: 8 workflow steps + 5 feature views. Verified memory, reading status, tags, score, notes and 9 → 3 → 1 filtering.`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
