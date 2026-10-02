// A short, benefit-led tour. Every narrated claim has a matching view or action.
export const voices = {
  zh: { name: 'zh-CN-YunyangNeural', rate: '-8%', pitch: '-5Hz' },
  en: { name: 'en-US-AndrewNeural', rate: '-8%', pitch: '-4Hz' }
};
export const story = [
  { id: 'intro', mode: 'memory', section: ['你可能也有这样的阅读记忆', 'A familiar moment after reading'],
    title: ['明明读过，却想不起是哪一篇。', 'You read it. But which paper was it?'],
    kicker: ['标题忘了，方法细节也模糊了。', 'The title is gone. The method is hazy.'],
    beats: [
      { visual: 'forget', zh: '读过的论文，标题和方法都模糊了。脑海里，只剩几个印象。', en: 'You read the paper, but the title and method have faded. Just a few impressions remain.' },
      { visual: 'remember', zh: '好像是智能体的优化，似乎关于 OPD 算法，可能是某个团队出品。', en: 'Something about agent optimization. Perhaps the OPD algorithm. Maybe a paper from a particular team.' }
    ] },
  { id: 'recall', mode: 'recall', section: ['这就是 Paper_Mind 的标签系统', 'How Paper_Mind uses tags'],
    title: ['一篇论文，由多个标签共同描述。', 'One paper. Several tags.'],
    kicker: ['研究方向、方法、团队，都可以成为同一篇论文的线索。', 'Direction, method and team: different clues to the same paper.'],
    beats: [
      { visual: 'papers', zh: 'Paper Mind 用多个标签描述同一篇论文。研究方向、方法、团队，都是线索。', en: 'Paper Mind describes one paper with several tags. Its research direction, method and team are all clues.' },
      { visual: 'papers', zh: '比如，智能体优化、OPD、某个团队，三个标签可以同时属于这一篇论文。', en: 'For example, agent optimization, OPD and a team label can all belong to this one paper.' }
    ] },
  { id: 'capture', mode: 'popup', section: ['01 · 收藏时，把线索一起留下', '01 · Save the paper and its clues'],
    title: ['论文的信息，\n和你的理解。', 'The paper’s details.\nYour own insight.'],
    kicker: ['为同一篇论文，留下多个角度的描述。', 'Keep several ways to recognize the same paper.'],
    chips: [['作者 · 年份 · 发表出处', '多个标签共同描述', '一句话记住它'], ['Authors · Year · Venue', 'Several tags per paper', 'A one-line memory']],
    beats: [
      { zh: '所以，收藏时先保留作者、年份和出处，缺失的信息还能补查。', en: 'When saving a paper, keep its authors, year and venue. Missing details can be looked up.' },
      { headline: ['给同一篇论文，\n选上多个标签。', 'One paper.\nMore than one tag.'], zh: '再给同一篇论文选上多个标签。这里既是智能体优化，也关注评估与可靠性。', en: 'Give this paper several tags. This example is about both agent optimization and evaluation.' },
      { headline: ['再用一句话，\n记住为什么关注它。', 'One sentence.\nWhy it matters to you.'], zh: '再用一句话，留下你当时关注它的理由。', en: 'Add one sentence about why this paper mattered to you.' }
    ] },
  { id: 'search', mode: 'manager', section: ['02 · 用标签组合，逐步找回', '02 · Combine tags to find it again'],
    title: ['不记得标题，就从概念开始。', 'No title? Start with an idea.'],
    beats: [
      { zh: '下次只记得智能体优化，就从这个概念找到已有标签。', en: 'Later, start with the idea you remember: agent optimization. It leads to an existing tag.' },
      { headline: ['一个标签，先找到相关的一组。', 'One tag finds a group of papers.'], result: ['9 篇 → 3 篇', '9 papers → 3'], zh: '选中这个标签，先找到三篇相关论文。系统会提示还能怎样缩小范围。', en: 'That tag finds three related papers. Suggestions show which clue can narrow them further.' },
      { headline: ['同时包含两个标签，范围更小。', 'Both tags together narrow the results.'], result: ['3 篇 → 2 篇', '3 papers → 2'], zh: '再选评估与可靠性，只看同时包含两个标签的论文，就剩两篇。', en: 'Add evaluation. Only papers with both tags remain: two papers.' },
      { headline: ['当时的那句话，让你认出它。', 'Your own words help you recognize it.'], result: ['2 篇 → 1 篇', '2 papers → 1'], zh: '再搜一点记得的内容，看到当时那句话和命中笔记：对，就是这篇。', en: 'Search a remembered phrase. Your own sentence and matching notes make it clear: that is the one.' }
    ] },
  { id: 'organize', mode: 'manager', section: ['03 · 资料和进度，各就其位', '03 · Keep your reading organized'],
    title: ['一篇论文，相关材料放在一起。', 'One paper, with its supporting material.'],
    beats: [
      { zh: '相关解读、剪藏正文和笔记，放在同一篇论文里，方便回看。', en: 'Keep commentary, saved article text and notes with the same paper, ready to revisit.' },
      { headline: ['阅读进度单独管理，不占概念标签。', 'Reading progress stays separate from tags.'], zh: '未读、在读、已读和待重读单独管理，不占用概念标签。', en: 'Track To read, Reading, Read and Revisit separately from your concept tags.' }
    ] },
  { id: 'tags', mode: 'manager', section: ['04 · 每个标签，都有说明', '04 · Every tag has context'],
    title: ['你选标签，AI 解释它的含义与范围。', 'Your tags. AI explains their meaning and scope.'],
    beats: [
      { zh: '大模型根据你选的标签和关联论文生成说明，解释它的含义与适用范围。', en: 'AI uses your tags and linked papers to explain each tag’s meaning and scope.' }
    ] },
  { id: 'discovery', mode: 'manager', section: ['05 · 找回之后，继续阅读', '05 · Find it, then keep exploring'],
    title: ['读懂摘要，再看相关论文。', 'Read the abstract. Explore related papers.'],
    beats: [
      { zh: '摘要翻译，让你更快回到论文的核心内容。', en: 'Translate the abstract to return quickly to the paper’s main ideas.' },
      { headline: ['共享标签，带你找到相似论文。', 'Shared tags lead to related papers.'], zh: '相似论文按共享标签关联，帮你顺着线索继续阅读。', en: 'Related papers are connected through shared tags, so you can keep following the idea.' },
      { headline: ['一个标签关联多篇，一篇论文也有多标签。', 'Tags connect papers in more than one way.'], zh: '标签映射还能看到：一个标签关联多篇论文，一篇论文也有多个标签。', en: 'The map shows both sides: one tag can link many papers, and one paper can have several tags.' }
    ] },
  { id: 'topics', mode: 'manager', section: ['06 · 积累成一个研究方向', '06 · Build a research direction'],
    title: ['把一组标签，变成持续更新的清单。', 'Turn a tag combination into a living list.'],
    beats: [
      { zh: '用包含和排除标签组成主题包，自动汇集相关论文，为下一次组会做准备。', en: 'Topic packs use inclusion and exclusion tags to collect relevant papers automatically for your next reading group.' }
    ] },
  { id: 'models', mode: 'manager', section: ['07 · 选择你习惯的模型', '07 · Use the models you prefer'],
    title: ['Claude Code · Codex', 'Claude Code · Codex'],
    beats: [
      { zh: '通过本机桥接接入 Claude Code 或 Codex，自选模型与思考强度。', en: 'Connect Claude Code or Codex through a local bridge, choosing your model and reasoning effort.' },
      { headline: ['也可以使用你常用的模型 API。', 'Or connect a compatible model API.'], zh: '也可以接入你常用的兼容模型 API。', en: 'Or connect a compatible model API you already use.' }
    ] },
  { id: 'data', mode: 'manager', section: ['08 · 轻量使用，安心积累', '08 · Lightweight, with local control'],
    title: ['无需注册，基础收藏与查找无需模型。', 'No sign-up. Basic capture and search need no model.'],
    beats: [
      { zh: '无需注册，基础收藏与查找无需模型，还支持双语和深浅主题。', en: 'No sign-up. Basic capture and search need no model, with bilingual UI and light or dark themes.' },
      { headline: ['论文库留在本地，备份也由你掌握。', 'Your library and backups stay under your control.'], zh: '论文库留在本地，支持导入导出和自动备份。', en: 'Your library stays on your device, with import, export and automatic backups.' }
    ] },
  { id: 'outro', mode: 'outro', section: ['Paper_Mind', 'Paper_Mind'],
    title: ['通过脑海中的标签，\n找到你的论文。', 'Remember an idea.\nFind your paper.'],
    kicker: ['开源 · 轻量 · 从下一篇论文开始', 'Open source. Lightweight. Start with your next paper.'],
    beats: [
      { zh: 'Paper Mind，通过脑海中的标签，找到你的论文。开源，轻量，从下一篇开始。', en: 'Paper Mind. Find your papers through the ideas you remember. Open source, lightweight, and ready for your next paper.' }
    ] }
];
