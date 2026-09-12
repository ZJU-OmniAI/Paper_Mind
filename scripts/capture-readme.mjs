// Reproducible documentation images from the real extension UI and synthetic data.
// No personal browser profile, extension database, clipboard or model key is used.
import { chromium, expect } from '@playwright/test';
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
    await context.addInitScript(({ language, origin }) => {
      localStorage.setItem('paperTagLanguage', language);
      localStorage.setItem('tagLibraryView', 'flat');
      const text = (zh, en) => language === 'zh' ? zh : en;
      const date = '2026-09-09T08:00:00.000Z';
      const entries = [
        ['rag', '检索增强生成', 'Retrieval-augmented generation', ['RAG'], '研究如何将外部知识引入语言模型的生成过程。适用于检索、知识整合与回答溯源；纯检索排序或模型预训练不单独归入此标签。', 'How external knowledge supports language generation. Covers retrieval, knowledge integration and answer grounding; excludes standalone retrieval ranking and pretraining.'],
        ['eval', '评估与可靠性', 'Evaluation', ['evaluation', 'faithfulness'], '关注模型输出是否正确、可验证、值得信赖。包括事实一致性、幻觉检测与评估方法；区别于单纯提升任务得分的训练技术。', 'Whether model outputs are correct, verifiable and dependable. Covers factual consistency, hallucination detection and evaluation methods.'],
        ['agent', '智能体', 'Agents', ['agent', 'tool use'], '关注能调用工具、规划步骤并与环境交互的语言模型系统，适用于任务分解、工具选择和执行反馈。', 'Language model systems that plan, use tools and interact with an environment. Covers task decomposition, tool selection and execution feedback.'],
        ['multi', '多模态', 'Multimodal learning', ['multimodal'], '研究文本、图像等不同模态之间的理解和信息融合，用于跨模态表示、视觉问答与图文检索。', 'Understanding and combining text, images and other modalities, including cross-modal representations and visual question answering.'],
        ['long', '长上下文', 'Long context', ['long context'], '关注模型如何利用长文档中的信息，涉及上下文窗口、信息定位、跨段落推理与长文档问答。', 'How models use information in long documents, including context windows, information localization and reasoning across passages.'],
        ['efficient', '高效训练', 'Efficient training', ['PEFT', 'LoRA'], '在计算或参数预算有限时适配模型，关注参数高效微调、低秩适配和训练资源利用。', 'Adapting models under limited compute or parameter budgets, including parameter-efficient tuning and low-rank adaptation.']
      ];
      const tags = entries.map(([id, zh, en, aliases, descZh, descEn]) => ({ id, name: text(zh, en), aliases, description: text(descZh, descEn), descriptionStatus: 'ready', descriptionProvider: 'Preview', descriptionModel: text('示例说明', 'Demo text'), descriptionUpdatedAt: date, paperIds: [], createdAt: date, updatedAt: date }));
      const rows = [
        ['Grounded Answers with Retrieval-Augmented Generation', ['rag', 'eval'], '比较不同检索策略对回答事实一致性的影响，将检索命中率与生成可信度分开评估。', 'Compare retrieval strategies through answer faithfulness, separating retrieval quality from generation reliability.', 4.5],
        ['When Retrieved Evidence Disagrees', ['rag', 'eval'], '研究外部知识相互冲突时，模型如何识别证据差异、表达不确定性，并给出可追溯的回答。', 'Study how models handle conflicting retrieved evidence, express uncertainty and produce traceable answers.', 4],
        ['Tool Selection for Research Agents', ['agent', 'eval'], '将检索、阅读与归纳拆解为工具步骤，评估研究任务中的规划质量和执行反馈。', 'Break research into retrieval, reading and synthesis steps, with evaluation of planning and execution feedback.', 4],
        ['Visual Evidence in Scientific Question Answering', ['multi'], '结合论文图表与文本段落回答研究问题，分析视觉证据能否补充仅靠文字检索得到的信息。', 'Combine figures and passages to answer scientific questions using visual evidence alongside retrieved text.', 3.5],
        ['Finding Evidence in Long Documents', ['long'], '探索长文档中关键信息的定位与引用方式，比较完整上下文和分段检索的效果。', 'Explore evidence localization and citation in long documents, comparing full-context reading with passage retrieval.', 4],
        ['Adapting Language Models on a Small Budget', ['efficient'], '用少量可训练参数适配领域任务，记录效果、资源开销与可复现的训练设置。', 'Adapt models with a small number of trainable parameters and compare quality, compute cost and reproducibility.', 3.5],
        ['A Reading Note Worth Revisiting', [], '先保留一个值得继续追问的问题，下一次整理时再确定它属于哪个研究方向。', 'Save a question worth revisiting and decide where it belongs during the next review.', 3],
        ['Planning with Feedback from Tools', ['agent'], '把工具执行结果反馈给模型，分析多步任务中的失败恢复与计划修正。', 'Use tool feedback to study failure recovery and plan revision in multi-step tasks.', 4]
      ];
      const papers = rows.map(([title, tagIds, zh, en, valueScore], i) => ({ id: `paper-${i}`, title, abstract: text(zh, en), conversation: text('阅读笔记：关注适用场景、评估设计和下一步可验证的问题。', 'Reading note: focus on scope, evaluation design and the next question to test.'), tagIds, valueScore, citationCount: null, citationStatus: 'notfound', citationUpdatedAt: new Date().toISOString(), createdAt: date, updatedAt: date }));
      const topicPacks = [
        { id: 'pack-rag', name: text('更可信的 RAG', 'Trustworthy RAG'), description: text('同时关注检索增强生成与可靠性评估，整理下一次组会要讨论的方法。', 'Retrieval-augmented generation and reliability evaluation for the next reading group.'), includeTagIds: ['rag', 'eval'], excludeTagIds: ['agent'], matchMode: 'all', createdAt: date, updatedAt: date },
        { id: 'pack-agent', name: text('能完成任务的智能体', 'Agents that finish tasks'), description: text('围绕工具调用与执行反馈积累可复用的方法。', 'Methods for tool use, planning and execution feedback.'), includeTagIds: ['agent'], excludeTagIds: [], matchMode: 'any', createdAt: date, updatedAt: date }
      ];
      const values = { paperTagStore: { papers, tags, topicPacks }, paperTagConfig: { provider: 'qwen', autoDescribeTags: false } };
      window.chrome = {
        storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); }, async set(data) { Object.assign(values, structuredClone(data)); }, async remove(key) { delete values[key]; } } },
        runtime: { id: 'readme-demo', getURL: p => `${origin}/${p}`, async sendMessage() {}, onMessage: { addListener() {} }, async getContexts() { return []; } },
        tabs: { async query() { return [{ id: 1, title: 'Reading Papers with Evidence-Aware Agents', url: 'https://example.org/research/evidence-aware-agents' }]; }, async create({ url }) { location.assign(url); } },
        scripting: { async executeScript({ func }) { return [{ result: func.name === 'pageClipExtractor' ? { ok: false } : { title: 'Reading Papers with Evidence-Aware Agents', description: text('探索研究型智能体如何收集证据、比较观点，并将每一步结论关联到可追溯的来源。', 'Explore how research agents gather evidence, compare claims and connect each conclusion to a traceable source.'), selectedText: text('值得关注：工具调用之后，如何验证收集到的证据？', 'Question to revisit: how should an agent verify evidence after using a tool?') } }]; } }
      };
    }, { language, origin });
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
    expect(saved.conversation).toContain(note);

    await page.locator('#openManagerButton').click();
    await page.waitForURL(`${origin}/manager.html`);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await expect(page.locator('#paperCount')).toHaveText('9');
    await page.locator('#paperLibrarySort').selectOption('created');
    const savedCard = page.locator(`#paperLibraryList [data-open-paper-id="${saved.id}"]`);
    await expect(page.locator('#paperLibraryList .paper-card').first()).toContainText(title);
    await capture('step-05-library');
    await page.locator('#libraryTagFilter').fill('agent');
    await expect(page.locator('#paperLibraryTagList [data-library-tag-id]')).toHaveCount(1);
    await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(9);
    await capture('step-06-find-tag');
    await page.locator('#paperLibraryTagList [data-library-tag-id="agent"]').click();
    await expect(page.locator('#paperLibraryList .paper-card')).toHaveCount(3);
    await expect(savedCard).toBeVisible();
    await capture('step-07-tag-results', page.locator('#view-papers'));
    await savedCard.click();
    await expect(page.locator('#paperDetailTitle')).toHaveText(title);
    await expect(page.locator('#paperDetailConversation')).toContainText(note);
    await expect(page.locator('#paperDetailTags')).toContainText(language === 'zh' ? '智能体' : 'Agents');
    await capture('step-08-paper-detail', page.locator('#view-paper-detail .paper-detail-page'));

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
    console.log(`Captured ${language}: 8 workflow steps + library, tags, topics. Verified saved paper, tags, score, notes and 9 → 3 filtering.`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
