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
  { id: 'recall', mode: 'recall', section: ['这就是 Paper_Mind', 'Meet Paper_Mind'],
    title: ['从模糊印象，回到你收藏的论文。', 'From a vague idea back to a saved paper.'],
    kicker: ['基于标签的轻量论文管理插件 · 可选大模型辅助', 'A lightweight, tag-based paper manager · Optional AI assistance'],
    beats: [
      { visual: 'papers', zh: 'Paper Mind，让模糊印象连上已有标签，回到你收藏的论文。', en: 'Paper Mind connects what you remember to existing tags, and back to your saved papers.' },
      { visual: 'save', zh: '为了下次找回，今天收藏时，就把线索一起留下。', en: 'To find it again tomorrow, keep the clues when you save it today.' }
    ] },
  { id: 'capture', mode: 'popup', section: ['01 · 收藏时，留下线索', '01 · Save the paper and its clues'],
    title: ['论文的信息，\n和你的理解。', 'The paper’s details.\nYour own insight.'],
    kicker: ['保存的不只是标题，还有日后认出它的理由。', 'Keep what will help you recognize it later.'],
    chips: [['作者 · 年份 · 发表出处', '一句话记住它', '正文 · 图片 · 笔记'], ['Authors · Year · Venue', 'A one-line memory', 'Text · Images · Notes']],
    beats: [
      { zh: '打开插件，保存论文或网页。作者、年份和出处一起留下，空缺也能补查。', en: 'Save a paper or web page, with authors, year and venue. Look up missing details when needed.' },
      { zh: '再写一句话，记住为什么关注它。正文、图片和笔记，也能一起保存。', en: 'Add one sentence about why it matters to you. Keep the article, images and notes alongside it.' }
    ] },
  { id: 'search', mode: 'manager', section: ['02 · 下次，只记得一个概念', '02 · Later, all you remember is an idea'],
    title: ['不记得标题，也有路可找。', 'No title? Start with what you remember.'],
    beats: [
      { zh: '以后只记得智能体优化，就从这个概念，找到已有标签。', en: 'Later, all you remember is agent optimization. Start with that idea and find an existing tag.' },
      { headline: ['还可以怎样缩小范围？', 'Narrow it down. One more clue.'], result: ['3 篇 → 2 篇', '3 papers → 2'], zh: '标签选好，还能继续缩小范围。每加一个线索，都知道还剩几篇。', en: 'Choose a tag, then follow suggestions to narrow the results. See how many papers each clue will leave.' },
      { headline: ['看到当时的那句话：“对，就是这篇。”', 'Your own words: “That’s the one.”'], result: ['2 篇 → 找到它', '2 papers → found it'], zh: '看到当时记下的那句话：对，就是这篇。记忆句、笔记和正文，都能成为找回的证据。', en: 'Then you see your own words: that is the one. Your memory sentence, notes and saved text reveal why it matches.' }
    ] },
  { id: 'organize', mode: 'manager', section: ['03 · 材料与进度，各就其位', '03 · Keep your reading organized'],
    title: ['资料放在一起，进度单独管理。', 'Related material together. Reading progress apart.'],
    beats: [
      { zh: '同一篇论文的解读和资料放在一起。重复收藏会提醒，阅读进度单独管理。', en: 'Keep commentary and resources with the paper. Duplicate alerts keep things tidy, while reading progress stays separate from tags.' }
    ] },
  { id: 'tags', mode: 'manager', section: ['04 · 有含义的标签', '04 · Tags with meaning'],
    title: ['你选标签，AI 补上含义。', 'Your tags. More meaning with AI.'],
    beats: [
      { zh: '大模型结合标签和论文补上说明。别名复用、冗余检查和合并，让概念更清楚。', en: 'AI explains your tags using the linked papers. Aliases, redundancy checks and reviewed merges keep concepts clear.' }
    ] },
  { id: 'discovery', mode: 'manager', section: ['05 · 找回之后，继续阅读', '05 · Find it, then keep exploring'],
    title: ['从一篇论文，看到更多关联。', 'See the connections beyond one paper.'],
    beats: [
      { zh: '找回之后，用摘要翻译、引用量、相似论文和标签映射，继续阅读。', en: 'Keep exploring with abstract translations, citation counts, similar papers and a map of connections.' }
    ] },
  { id: 'topics', mode: 'manager', section: ['06 · 积累成一个研究方向', '06 · Build a research direction'],
    title: ['下一次组会，相关论文已经在一起。', 'Your next reading group starts here.'],
    beats: [
      { zh: '再把相关论文组成自动更新的主题包，为组会或下一次研究做准备。', en: 'Turn related papers into topic packs that update automatically, ready for your next reading group or research project.' }
    ] },
  { id: 'models', mode: 'manager', section: ['07 · 用你习惯的模型', '07 · Use the models you prefer'],
    title: ['Claude Code · Codex · 兼容 API', 'Claude Code · Codex · Compatible APIs'],
    beats: [
      { zh: '接入本机 Claude Code、Codex，或你常用的模型 API，按需选择模型和思考强度。', en: 'Connect local Claude Code or Codex through a bridge, or use a compatible API. Choose your model and reasoning effort.' }
    ] },
  { id: 'data', mode: 'manager', section: ['08 · 轻量使用，安心积累', '08 · Lightweight, with local control'],
    title: ['无需注册，论文库留在本地。', 'No sign-up. Your library stays on your device.'],
    beats: [
      { zh: '基础收藏与查找无需模型。双语、主题切换、导入导出和自动备份，让积累留得住。', en: 'Basic capture and search need no model. Bilingual UI, themes, import, export and automatic backups help you keep your collection.' }
    ] },
  { id: 'outro', mode: 'outro', section: ['Paper_Mind', 'Paper_Mind'],
    title: ['通过脑海中的标签，\n找到你的论文。', 'Remember an idea.\nFind your paper.'],
    kicker: ['开源 · 轻量 · 从下一篇论文开始', 'Open source. Lightweight. Start with your next paper.'],
    beats: [
      { zh: 'Paper Mind，通过脑海中的标签，找到你的论文。开源，轻量，从下一篇开始。', en: 'Paper Mind. Find your papers through the ideas you remember. Open source, lightweight, and ready for your next paper.' }
    ] }
];
