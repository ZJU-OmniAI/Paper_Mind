// Feature-level overview, with paired narration/subtitles for both editions.
export const voices = {
  zh: { name: 'zh-CN-YunyangNeural', rate: '-8%', pitch: '-5Hz' },
  en: { name: 'en-US-AndrewNeural', rate: '-8%', pitch: '-4Hz' }
};
export const story = [
  { id: 'intro', mode: 'memory', section: ['你可能也有这样的阅读记忆', 'A familiar moment after reading'],
    title: ['明明读过，却想不起是哪一篇。', 'You read it. But which paper was it?'],
    kicker: ['标题忘了，方法细节也模糊了。', 'The title is gone. The details of the method are hazy.'],
    beats: [
      { visual: 'forget', zh: '读过的论文，过一阵子，标题和方法怎么实现的，往往都记不清了。', en: 'Some time after reading a paper, you may forget its title and how the method actually works.' },
      { visual: 'remember', zh: '脑海里留下的，可能是：好像是智能体的优化，似乎关于 OPD 算法，或者可能是某个团队出品。', en: 'What stays might be: something about agent optimization, perhaps the OPD algorithm, or maybe a paper from a particular team.' }
    ] },
  { id: 'recall', mode: 'recall', section: ['因此，我们开发了 Paper_Mind', 'Why we built Paper_Mind'],
    title: ['从模糊印象，回到你收藏的论文。', 'From a vague idea back to a saved paper.'],
    kicker: ['基于标签的轻量论文管理插件 · 可选大模型辅助', 'A lightweight, tag-based paper manager · Optional AI assistance'],
    beats: [
      { visual: 'connect', zh: '因此，我们开发了 Paper Mind，一个基于标签的轻量论文管理插件。', en: 'That is why we built Paper Mind: a lightweight browser extension that organizes papers around tags.' },
      { visual: 'papers', zh: '方向、算法或团队，都可以成为查找线索。先匹配已有标签，再回到论文；描述模糊时，可以让大模型辅助。', en: 'A research direction, algorithm, or team can be a clue. Match it to existing tags, then return to your papers, with optional AI help.' },
      { visual: 'save', zh: '想在以后凭这些印象找回论文，就从今天收藏时，留下线索开始。', en: 'To find a paper through those memories later, start by keeping the clues when you save it today.' }
    ] },
  { id: 'capture', mode: 'popup', section: ['01 · 收藏与剪藏', '01 · Capture and collect'],
    title: ['今天读到，\n顺手留下。', 'Read it today.\nKeep the clues.'],
    kicker: ['论文、网页、阅读笔记，汇入同一个论文库。', 'Papers, web articles and notes, in one library.'],
    chips: [['页面信息自动提取', '手动录入', '网页正文与图片'], ['Metadata capture', 'Manual entry', 'Web text and images']],
    beats: [
      { zh: '读到论文，打开插件，自动提取信息；也支持手动录入，保留来源和笔记。', en: 'When you read a paper, open the extension to capture its details, or enter them manually, keeping sources and notes.' },
      { zh: '博客和解读文章也能剪藏，正文与图片一并留存。', en: 'Clip blogs and commentary too, preserving article text and saving images locally.' }
    ] },
  { id: 'materials', mode: 'manager', section: ['02 · 材料归档', '02 · Connected materials'],
    title: ['一篇论文，多份材料。', 'One paper. All its supporting material.'],
    beats: [
      { zh: '围绕这篇论文读到的解读文章和外部资料，也能放进同一条记录。', en: 'As you read more about that paper, keep commentary and external resources together in the same record.' },
      { zh: '重复收藏会提示，相关材料可确认合并，避免资料越存越散。', en: 'Duplicate alerts and confirmed merges keep related material together as your collection grows.' }
    ] },
  { id: 'memory', mode: 'manager', section: ['03 · 记忆与阅读进度', '03 · Memory and reading progress'],
    title: ['记下理解，也管理进度。', 'Keep your insight. Track your progress.'],
    beats: [
      { zh: '资料存好，再用一句话记住它；配合笔记和评分，保留当时的理解。', en: 'With the material saved, add a one-line memory, notes and a rating to preserve what you understood at the time.' },
      { zh: '未读、在读、已读和待重读独立管理，不再挤占概念标签。', en: 'Track To read, Reading, Read and Revisit separately from your concept tags.' }
    ] },
  { id: 'search', mode: 'manager', section: ['04 · 从概念找到论文', '04 · From concepts to papers'],
    title: ['不记得标题，也能找到。', 'Find it, even without the title.'],
    beats: [
      { zh: '等到下次，只记得“智能体优化”，就从已有标签缩小范围，找回相关论文。', en: 'Later, when all you remember is agent optimization, follow existing tags to narrow the search and find those papers again.' },
      { zh: '还支持全文检索、多标签组合，以及阅读状态和评分筛选。', en: 'Full-text search, combined tags, reading status and rating filters help narrow the results.' }
    ] },
  { id: 'tags', mode: 'manager', section: ['05 · 有含义的标签系统', '05 · Tags with meaning'],
    title: ['你定义概念，AI 补充说明。', 'You define the concept. AI adds context.'],
    beats: [
      { zh: '为了让这些标签更好用，大模型可结合你给的标签和论文，补充含义与适用范围。', en: 'To make those tags more useful, AI can use your labels and linked papers to explain their meaning and scope.' },
      { zh: '别名复用、冗余分析和合并审核，让分类清晰；标签数量不设上限。', en: 'Aliases, redundancy checks and reviewed merge suggestions keep tags clear, with no limit on their number.' }
    ] },
  { id: 'discovery', mode: 'manager', section: ['06 · 阅读与发现', '06 · Reading and discovery'],
    title: ['从一篇论文，看到更多关联。', 'See the connections beyond one paper.'],
    beats: [
      { zh: '找回之后，还能借助摘要翻译、引用量和相似论文，继续阅读与发现。', en: 'Once you have found the paper, abstract translation, citation counts and similar papers help you keep reading and exploring.' },
      { zh: '标签映射直观呈现论文关系，也支持按时间、评分和引用量整理。', en: 'A tag-to-paper map reveals connections, while date, rating and citation sorting organize your view.' }
    ] },
  { id: 'topics', mode: 'manager', section: ['07 · 研究主题包', '07 · Research topic packs'],
    title: ['把研究方向，变成持续更新的清单。', 'Turn a research question into a living list.'],
    beats: [
      { zh: '当相关论文积累起来，用包含和排除标签，组成自动更新的研究主题包。', en: 'As related papers accumulate, inclusion and exclusion tags turn them into topic packs that update automatically.' },
      { zh: '适合准备组会、整理相关工作，也适合持续跟进一个方向。', en: 'Use them for reading groups, related-work reviews, or following a research direction over time.' }
    ] },
  { id: 'models', mode: 'manager', section: ['08 · 灵活的模型接入', '08 · Flexible model backends'],
    title: ['选择适合你的模型与思考强度。', 'Choose your model and reasoning effort.'],
    beats: [
      { zh: '这些 AI 能力可通过本机桥接接入 Claude Code 或 Codex，复用登录，自选模型与思考强度。', en: 'These AI features can use Claude Code or Codex through a local bridge, reusing sign-in with your choice of model and reasoning effort.' },
      { zh: '也支持通用兼容 API，以及通义、智谱、Kimi 和 DeepSeek 等预设服务。', en: 'You can also use compatible APIs and presets for Qwen, GLM, Kimi and DeepSeek.' }
    ] },
  { id: 'data', mode: 'manager', section: ['09 · 轻量使用，自主管理', '09 · Lightweight, with local control'],
    title: ['数据留在本地，阅读习惯由你决定。', 'Your library stays on your device.'],
    beats: [
      { zh: '日常使用无需注册，基础收藏与检索无需模型，还支持双语界面、深浅主题和快捷操作。', en: 'For everyday use, no sign-up is needed. Basic capture and search work without a model, with bilingual UI, themes and shortcuts.' },
      { zh: '本地导入导出与每日自动备份，让阅读积累可以迁移和保存。', en: 'Local import, export and daily automatic backups help you preserve and move your reading collection.' }
    ] },
  { id: 'outro', mode: 'outro', section: ['Paper_Mind', 'Paper_Mind'],
    title: ['让下一次想起，\n成为一次找回。', 'Remember an idea.\nFind your paper.'],
    kicker: ['轻量收藏 · 清晰整理 · 从概念开始查找', 'Capture simply. Organize clearly. Search from an idea.'],
    beats: [
      { zh: '这样，今天留下的理解，就能成为日后从模糊印象找回论文的线索。', en: 'The understanding you keep today becomes the clue that brings you back to a paper when only a vague impression remains.' },
      { zh: 'Paper Mind，现已开源。', en: 'Paper Mind is open source. Start with your next paper.' }
    ] }
];
