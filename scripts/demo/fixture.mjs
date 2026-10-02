// Isolated, synthetic data for documentation screenshots and the feature video.
export async function installDemo(context, language, origin, { overview = false } = {}) {
  await context.addInitScript(({ language, origin, overview }) => {
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
    if (overview) {
      const agentTag=tags.find(tag=>tag.id==='agent');
      agentTag.name=text('智能体优化','Agent optimization');
      agentTag.aliases.push('agent optimization','智能体优化');
      agentTag.description=text('关注智能体的规划、工具使用和执行反馈如何改进，适用于任务分解、工具选择、证据检查和计划修正。','Improving agent planning, tool use and execution feedback. Covers task decomposition, tool selection, evidence checks and plan revision.');
      papers[0].abstract = 'Compare retrieval strategies through answer faithfulness, separating retrieval quality from generation reliability.';
      papers[0].abstractZh = '比较不同检索策略对回答事实一致性的影响，将检索质量与生成可信度分开评估。（示例译文）';
      papers[0].abstractZhModel = 'Demo translation';
      papers[1].abstract = 'Study how models handle conflicting retrieved evidence, express uncertainty and produce traceable answers.';
      papers[1].abstractZh = '研究模型如何处理相互冲突的检索证据、表达不确定性，并给出可追溯的回答。（示例译文）';
      papers[1].abstractZhModel = 'Demo translation';
      papers[0].memory = text('检索质量与回答可信度，需要分开评估。', 'Evaluate retrieval quality separately from answer reliability.');
      papers[0].links = [{id:'demo-resource',title:text('补充实验与阅读记录', 'Supplementary experiments and notes'),url:'https://example.org/research/grounded-answers/notes',createdAt:date}];
      papers[0].clips = [
        {id:'demo-reading',title:text('方法解读：证据如何支撑回答', 'Commentary: how evidence supports answers'),sourceUrl:'https://example.org/commentary/evidence',siteName:'Demo reading notes',markdown:text('## 方法概览\n\n将检索过程与生成过程分开评估，观察证据是否能够支撑回答。\n\n- 检查来源的相关性\n- 比较结论的一致性\n- 记录值得继续验证的问题', '## Method overview\n\nEvaluate retrieval and generation separately to see whether the evidence supports the answer.\n\n- Check source relevance\n- Compare consistency\n- Keep questions for the next reading'),imageCount:0,createdAt:date},
        {id:'demo-discussion',title:text('组会讨论：适用范围与局限', 'Reading group: scope and limitations'),sourceUrl:'https://example.org/discussion/evidence',siteName:'Demo reading group',markdown:text('## 讨论要点\n\n关注冲突证据、任务边界，以及下一次实验需要控制的变量。', '## Discussion notes\n\nConsider conflicting evidence, task boundaries, and variables to control in the next experiment.'),imageCount:0,createdAt:date}
      ];
    }
    const topicPacks = [
      { id: 'pack-rag', name: text('更可信的 RAG', 'Trustworthy RAG'), description: text('同时关注检索增强生成与可靠性评估，整理下一次组会要讨论的方法。', 'Retrieval-augmented generation and reliability evaluation for the next reading group.'), includeTagIds: ['rag', 'eval'], excludeTagIds: ['agent'], matchMode: 'all', createdAt: date, updatedAt: date },
      { id: 'pack-agent', name: text('能完成任务的智能体', 'Agents that finish tasks'), description: text('围绕工具调用与执行反馈积累可复用的方法。', 'Methods for tool use, planning and execution feedback.'), includeTagIds: ['agent'], excludeTagIds: [], matchMode: 'any', createdAt: date, updatedAt: date }
    ];
    const values = { paperTagStore: { papers, tags, topicPacks }, paperTagConfig: { provider: 'qwen', autoDescribeTags: false } };
    window.chrome = {
      storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(values[key])])); }, async set(data) { Object.assign(values, structuredClone(data)); }, async remove(key) { delete values[key]; } } },
      runtime: { id: 'readme-demo', getURL: p => `${origin}/${p}`, async sendMessage() {}, onMessage: { addListener() {} }, async getContexts() { return []; } },
      tabs: { async query() { return [{ id: 1, title: 'Reading Papers with Evidence-Aware Agents', url: 'https://example.org/research/evidence-aware-agents' }]; }, async create({ url }) { location.assign(url); } },
      scripting: { async executeScript({ func }) { return [{ result: func.name === 'pageClipExtractor' ? { ok: false } : { title: 'Reading Papers with Evidence-Aware Agents', description: text('探索研究型智能体如何收集证据、比较观点，并将每一步结论关联到可追溯的来源。', 'Explore how research agents gather evidence, compare claims and connect each conclusion to a traceable source.'), authors: ['Alex Chen', 'Morgan Lee'], year: '2026', venue: text('研究方法研讨会（示例）', 'Research Methods Workshop (demo)'), selectedText: text('值得关注：工具调用之后，如何验证收集到的证据？', 'Question to revisit: how should an agent verify evidence after using a tool?') } }]; } }
    };
  }, { language, origin, overview });
}
