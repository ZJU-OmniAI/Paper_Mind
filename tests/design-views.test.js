import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesignAxes, normalizePaperStances, validateTagSynthesis, TAG_ANALYSIS_VISUAL_VERSION } from '../extension/tag-analysis.js';
import { designMatrix, designSimilarity, similarityOrder, notablePairs, choiceGroups } from '../extension/analysis-visuals.js';
import { bestAxisPair, scatterHtml, spectrumHtml, heatmapHtml } from '../extension/analysis-charts.js';
import { createResearchReport, prepareResearchInput, validateResearchReports, reportToMarkdown, comparisonInTag, fusionSample } from '../extension/research.js';

// Profiles shaped like saved topic-analysis readings: each has verified evidence
// except the placeholder for a paper without material.
const profiles = ['a', 'b', 'c', 'd'].map(id => ({ paperId: id, title: `Paper ${id}`, sourceStatus: 'ready', evidence: [{ id: `${id}:e1`, paperId: id, quote: `quote ${id}`, sourceType: 'abstract' }] }));
const placeholder = { paperId: 'empty', title: 'Empty', sourceStatus: 'insufficient', evidence: [] };
const ids = profiles.map(profile => profile.paperId), refs = profiles.map(profile => profile.evidence[0].id);
const synthesis = extra => ({
  overview: 'Two design families differ in when evidence is checked.',
  commonalities: [{ title: 'Uses retrieved evidence', finding: 'All rely on retrieval.', paperIds: ids, evidenceIds: refs }, { title: 'Separate verifier', finding: 'Some keep a verifier module.', paperIds: ['a', 'b'], evidenceIds: refs.slice(0, 2) }],
  differences: [
    { dimension: 'When evidence is checked', finding: 'Before or during generation.', groups: [{ label: 'Before', paperIds: ['a', 'b'], approach: 'Check first.', tradeoff: 'Simple.' }, { label: 'During', paperIds: ['c', 'd'], approach: 'Check while generating.', tradeoff: 'Costly.' }], evidenceIds: refs },
    { dimension: 'Training', finding: 'Some train, some do not.', groups: [{ label: 'Trained', paperIds: ['a'], approach: 'Fine-tune.', tradeoff: 'Data.' }, { label: 'Frozen', paperIds: ['c'], approach: 'Prompt only.', tradeoff: 'Limited.' }], evidenceIds: [refs[0], refs[2]] }
  ],
  inspirations: [], readingPath: [...ids, 'empty'].map(paperId => ({ paperId, reason: 'Read it.' })), openQuestions: [], ...extra
});

test('design axes keep only evidence-backed relative positions and drop malformed parts without failing the report', () => {
  const axes = normalizeDesignAxes([
    { axis: 'When checks happen', low: 'Before', high: 'During', positions: [{ paperId: 'a', value: -2, reason: 'checks first' }, { paperId: 'b', value: '1.6' }, { paperId: 'c', value: 3 }, { paperId: 'ghost', value: 0 }, { paperId: 'a', value: 2 }, { paperId: 'empty', value: 0 }], evidenceIds: [...refs, 'invented'] },
    { axis: 'No evidence', low: 'x', high: 'y', positions: [{ paperId: 'a', value: 0 }, { paperId: 'b', value: 1 }], evidenceIds: [] },
    { axis: 'Same poles', low: 'x', high: 'x', positions: [{ paperId: 'a', value: 0 }, { paperId: 'b', value: 1 }], evidenceIds: refs },
    { axis: 'One paper only', low: 'x', high: 'y', positions: [{ paperId: 'a', value: 0 }], evidenceIds: refs },
    'not an axis'
  ], [...profiles, placeholder]);
  assert.equal(axes.length, 1);
  assert.deepEqual(axes[0].positions, [{ paperId: 'a', value: -2, reason: 'checks first' }, { paperId: 'b', value: 2 }]);
  assert.deepEqual(axes[0].evidenceIds, ['a:e1', 'b:e1']);
  const stances = normalizePaperStances([{ paperId: 'a', stance: ' Check before writing ' }, { paperId: 'a', stance: 'duplicate' }, { paperId: 'empty', stance: 'no evidence' }, { paperId: 'b', stance: 'x'.repeat(121) }, { paperId: 'c', stance: '' }], [...profiles, placeholder]);
  assert.deepEqual(stances, [{ paperId: 'a', stance: 'Check before writing' }]);
  const result = validateTagSynthesis(synthesis({ designAxes: [{ axis: 'broken' }], paperStances: 'oops' }), [...profiles, placeholder]);
  assert.equal(result.visualVersion, TAG_ANALYSIS_VISUAL_VERSION);
  assert.equal(TAG_ANALYSIS_VISUAL_VERSION, 3);
  assert.equal(result.designAxes, undefined);
  assert.equal(result.paperStances, undefined);
  const full = validateTagSynthesis(synthesis({ designAxes: [{ axis: 'When', low: 'Before', high: 'During', positions: ids.map((paperId, index) => ({ paperId, value: index < 2 ? -1 : 2 })), evidenceIds: refs }], paperStances: ids.map(paperId => ({ paperId, stance: `${paperId} stance` })) }), [...profiles, placeholder]);
  assert.equal(full.designAxes[0].positions.length, 4);
  assert.equal(full.paperStances.length, 4);
});

test('the design matrix, similarity and ordering are derived locally from groups and shared foundations', () => {
  const result = validateTagSynthesis(synthesis(), [...profiles, placeholder]);
  const matrix = designMatrix(result, [...ids, 'empty']);
  assert.deepEqual(matrix.cells.get('a'), [0, 0]);
  assert.deepEqual(matrix.cells.get('b'), [0, -1]);
  assert.deepEqual(matrix.cells.get('d'), [1, -1]);
  assert.deepEqual(matrix.cells.get('empty'), [-1, -1]);
  assert.deepEqual(matrix.coverage, [4, 2]);
  const similarity = designSimilarity(result, ids);
  const ab = similarity.get('a', 'b'), ac = similarity.get('a', 'c'), cd = similarity.get('c', 'd');
  assert.equal(ab.same, 1); assert.equal(ab.compared, 1); assert.equal(ab.foundations, 2);
  assert.equal(ac.same, 0); assert.equal(ac.compared, 2);
  assert.ok(ab.value > ac.value && cd.value > ac.value);
  assert.equal(similarity.get('b', 'a').value, ab.value);
  assert.equal(similarity.get('a', 'a').value, 1);
  const order = similarityOrder(similarity);
  assert.deepEqual([...order].sort(), [...ids].sort());
  assert.ok(Math.abs(order.indexOf('a') - order.indexOf('b')) === 1, 'papers in the same families sit together');
  assert.ok(Math.abs(order.indexOf('c') - order.indexOf('d')) === 1);
  const pairs = notablePairs(similarity);
  assert.deepEqual([pairs.closest[0].a, pairs.closest[0].b], ['a', 'b']);
  assert.ok(pairs.furthest.some(item => [item.a, item.b].sort().join() === 'a,c'));
  assert.deepEqual(choiceGroups([{ choice: 'Before' }, { choice: ' before ' }, { choice: 'During' }, {}, null]), [0, 0, 1, -1, -1]);
});

test('chart builders escape every label and place papers between the named poles', () => {
  const axes = [
    { axis: 'When <checks>', low: 'Before', high: 'During', positions: [{ paperId: 'a', value: -2, reason: '<img src=x>' }, { paperId: 'b', value: 2 }] },
    { axis: 'Training', low: 'Frozen', high: 'Trained', positions: [{ paperId: 'a', value: 0 }, { paperId: 'b', value: 0 }, { paperId: 'c', value: 1 }] }
  ];
  const ui = (zh) => zh;
  const label = id => ({ number: { a: '01', b: '02', c: '03' }[id], name: `<${id}>`, title: `Title ${id}` });
  assert.deepEqual(bestAxisPair(axes), [0, 1]);
  assert.deepEqual(bestAxisPair(axes.slice(1)), [0, -1]);
  const scatter = scatterHtml({ axes, x: 0, y: 1, label, ui, isSelected: id => id === 'b', dotAttrs: id => `data-test="${id}"` });
  assert.equal((scatter.match(/class="design-point(?: selected)?"/g) || []).length, 2);
  assert.match(scatter, /design-point selected/);
  assert.match(scatter, /仅在一条轴上定位：03/);
  assert.doesNotMatch(scatter, /<img|<checks>|<a>/);
  const spectra = spectrumHtml({ axes, label, ui });
  assert.match(spectra, /--x:0%;--row:0/);
  assert.match(spectra, /--x:100%;--row:0/);
  assert.match(spectra, /--x:50%;--row:1/, 'papers at the same position stack instead of overlapping');
  assert.doesNotMatch(spectra, /<img|<checks>/);
  const result = validateTagSynthesis(synthesis(), [...profiles, placeholder]);
  const similarity = designSimilarity(result, ids);
  const heatmap = heatmapHtml({ similarity, order: similarityOrder(similarity), label: id => ({ number: id, name: id }), ui });
  assert.equal((heatmap.match(/class="design-heat-cell"/g) || []).length, 12);
});

// --- Research: tag-scoped comparison and multi-tag fusion ---
const tagged = (id, tagIds, abstract) => ({ id, title: `Title ${id}`, tagIds, abstract, conversation: `Notes for ${id}.` });
const store = () => ({
  tags: [{ id: 'rag', name: 'RAG' }, { id: 'agent', name: 'Agents' }, { id: 'verify', name: 'Verification' }, { id: 'other', name: 'Other' }],
  papers: [
    tagged('r1', ['rag'], 'Retrieve once before generating an answer.'), tagged('r2', ['rag', 'verify'], 'Retrieve on demand and critique retrieved passages.'), tagged('r3', ['rag'], 'Retrieve every few tokens without training.'),
    tagged('a1', ['agent'], 'Interleave reasoning with tool actions.'), tagged('a2', ['agent', 'verify'], 'Reflect verbally on failures and store reflections.'),
    tagged('v1', ['verify'], 'Draft, plan verification questions, then revise.'), tagged('o1', ['other'], 'Unrelated material about something else.')
  ]
});
const quote = (input, id) => ({ paperId: id, quote: input.snapshot ? input.snapshot.papers.find(paper => paper.paperId === id).evidence.split('\n').find(line => /^(Retrieve|Interleave|Reflect|Draft)/.test(line)) : '' });
const experiment = { setup: 'Small prototype', baseline: 'Plain RAG', metric: 'Faithfulness', successCriterion: 'Proposed: better faithfulness' };

test('a tag-scoped comparison keeps choices, stances and design axes, and stays inside its tag', async () => {
  const library = store();
  await assert.rejects(createResearchReport(library, { kind: 'comparison', scopeTagId: 'rag', paperIds: ['r1', 'a1'] }, async () => assert.fail('no model call')), /都属于这个标签/);
  await assert.rejects(createResearchReport(library, { kind: 'comparison', scopeTagId: 'missing', paperIds: ['r1', 'r2'] }, async () => assert.fail('no model call')), /标签不存在/);
  let sent;
  const report = await createResearchReport(library, { kind: 'comparison', scopeTagId: 'rag', paperIds: ['r1', 'r2', 'r3'], question: 'When does retrieval happen?' }, async messages => {
    sent = JSON.parse(messages[1].content);
    const input = prepareResearchInput(library, { kind: 'comparison', scopeTagId: 'rag', paperIds: ['r1', 'r2', 'r3'] });
    const cell = (id, choice) => ({ paperId: id, choice, finding: `${id} finding`, evidence: [quote(input, id)] });
    return { content: { title: 'Retrieval timing', comparison: {
      headline: 'Once, on demand, or on a schedule', summary: 'They differ in when retrieval runs.',
      stances: [{ paperId: 'r1', stance: 'Retrieve once' }, { paperId: 'r2', stance: 'Retrieve on demand' }, { paperId: 'ghost', stance: 'x' }],
      dimensions: [{ name: 'Timing', cells: [cell('r1', 'Before'), cell('r2', 'On demand'), cell('r3', 'Scheduled')] }, { name: 'Training', cells: [cell('r1', 'None'), cell('r2', 'Fine-tune'), { paperId: 'r3', choice: 'should be dropped', finding: '材料未提供', evidence: [] }] }],
      axes: [{ axis: 'Who decides', low: 'Rules', high: 'Model', positions: [{ paperId: 'r1', value: -2 }, { paperId: 'r2', value: 2, reason: 'reflection tokens' }, { paperId: 'r3', value: 9 }] }, { axis: 'Broken', low: 'x', high: 'x', positions: [] }],
      commonalities: ['All retrieve.'], differences: ['Timing differs.'], gaps: ['No shared benchmark.']
    } }, meta: { provider: 'qwen', requestedModel: 'm' } };
  });
  assert.equal(sent.task, 'compare_saved_papers');
  assert.deepEqual(sent.tags.map(tag => tag.id), ['rag']);
  assert.ok(sent.rules.some(rule => /IDENTICAL label/.test(rule)));
  assert.equal(report.scopeTagId, 'rag');
  assert.deepEqual(report.tagIds, ['rag']);
  assert.equal(report.comparison.headline, 'Once, on demand, or on a schedule');
  assert.deepEqual(report.comparison.stances.map(item => item.paperId), ['r1', 'r2']);
  assert.deepEqual(report.comparison.dimensions[0].cells.map(cell => cell.choice), ['Before', 'On demand', 'Scheduled']);
  assert.equal(report.comparison.dimensions[1].cells[2].choice, undefined, 'an unknown cell carries no choice label');
  assert.deepEqual(report.comparison.axes, [{ axis: 'Who decides', low: 'Rules', high: 'Model', positions: [{ paperId: 'r1', value: -2 }, { paperId: 'r2', value: 2, reason: 'reflection tokens' }] }]);
  assert.equal(comparisonInTag(report, 'rag', library.papers), true);
  assert.equal(comparisonInTag(report, 'verify', library.papers), false);
  validateResearchReports({ [report.id]: report });
  const markdown = reportToMarkdown(report);
  assert.match(markdown, /Title r1 — Before/);
  assert.match(markdown, /Design axis: Who decides/);
  assert.match(markdown, /Design stances/);
  const tampered = structuredClone(report);
  tampered.comparison.axes[0].positions[0].value = 7;
  assert.throws(() => validateResearchReports({ [tampered.id]: tampered }), /格式错误/);
  const foreignScope = structuredClone(report);
  foreignScope.kind = 'ideas';
  assert.throws(() => validateResearchReports({ [foreignScope.id]: foreignScope }), /格式错误/);
  // Unscoped legacy comparisons belong to any tag that still holds every paper.
  const legacy = { ...structuredClone(report), scopeTagId: undefined };
  delete legacy.scopeTagId;
  assert.equal(comparisonInTag(legacy, 'rag', library.papers), true);
  assert.equal(comparisonInTag({ ...legacy, paperIds: ['r1', 'a1'] }, 'rag', library.papers), false);
});

test('fusion samples 2–4 tags, distills principles per tag and links ideas to principles from different tags', async () => {
  const library = store();
  for (const tagIds of [['rag'], ['rag', 'agent', 'verify', 'other', 'rag2']]) assert.throws(() => prepareResearchInput(library, { kind: 'ideas', tagIds }), /2–4|标签不存在/);
  const sample = fusionSample(library, ['rag', 'agent', 'verify']);
  assert.ok(['rag', 'agent', 'verify'].every(id => sample.papers.some(paper => paper.tagIds.includes(id))));
  assert.throws(() => prepareResearchInput(library, { kind: 'ideas', tagIds: ['rag', 'agent'], paperIds: ['r1', 'r2'] }), /覆盖每个所选标签/);
  library.tags[0].paperAnalysis = { stale: true, resultProfiles: [{}, {}], result: { headline: 'RAG bets on external evidence', overview: 'Retrieval timing and checking differ.', commonalities: [{ title: 'Retrieval', finding: 'All retrieve.' }], differences: [{ dimension: 'Timing', groups: [{ label: 'Once', approach: 'Before generation.' }] }], designAxes: [{ axis: 'When', low: 'Before', high: 'During' }] } };
  let sent;
  const report = await createResearchReport(library, { kind: 'ideas', tagIds: ['rag', 'agent', 'verify'] }, async messages => {
    sent = JSON.parse(messages[1].content);
    const input = { snapshot: { papers: sent.papers } };
    return { content: {
      title: 'Three-way fusion',
      principles: [
        { id: 'p1', tagId: 'rag', name: 'On-demand evidence', summary: 'Retrieve only when needed.', paperIds: ['r2', 'a1'], evidence: [quote(input, 'r2')] },
        { id: 'p2', tagId: 'agent', name: 'Act then observe', summary: 'Interleave reasoning and actions.', evidence: [quote(input, 'a1'), { paperId: 'r1', quote: quote(input, 'r1').quote }] },
        { id: 'p3', tagId: 'verify', name: 'Draft then verify', summary: 'Check drafts independently.', evidence: [{ paperId: 'v1', quote: 'An invented quote that does not exist.' }] },
        { id: 'p1', tagId: 'agent', name: 'Duplicate id', summary: 'Dropped.', evidence: [quote(input, 'a1')] },
        { id: 'p4', tagId: 'nowhere', name: 'Unknown tag', summary: 'Dropped.', evidence: [quote(input, 'a1')] }
      ],
      ideas: [
        { title: 'Retrieval as an agent action', principleIds: ['p1', 'p2', 'p3', 'ghost'], fusion: 'Retrieval is one action in the agent loop.', hypothesis: 'Fewer wasted retrievals.', rationale: 'Complementary.', evidence: [quote(input, 'r1'), quote(input, 'a1')], assumptions: [], experiment, risks: [] }
      ]
    }, meta: {} };
  });
  assert.equal(sent.task, 'generate_cross_tag_ideas');
  assert.deepEqual(sent.tags.map(tag => tag.id), ['rag', 'agent', 'verify']);
  assert.equal(sent.tagDigests.length, 1);
  assert.equal(sent.tagDigests[0].tagId, 'rag');
  assert.equal(sent.tagDigests[0].stale, true);
  assert.ok(sent.rules.some(rule => /DESIGN PRINCIPLES/.test(rule)));
  assert.ok(report.warnings.some(warning => /专题分析/.test(warning)));
  assert.deepEqual(report.principles.map(item => item.id), ['p1', 'p2']);
  assert.deepEqual(report.principles[0].paperIds, ['r2'], 'only papers of the principle’s own tag are kept');
  assert.deepEqual(report.principles[1].evidence.map(ref => ref.paperId), ['a1'], 'quotes from another tag are removed');
  assert.deepEqual(report.ideas[0].principleIds, ['p1', 'p2']);
  assert.equal(report.ideas[0].fusion, 'Retrieval is one action in the agent loop.');
  validateResearchReports({ [report.id]: report });
  const markdown = reportToMarkdown(report);
  assert.match(markdown, /Design principles by tag/);
  assert.match(markdown, /Fuses: On-demand evidence \+ Act then observe/);
  const forged = structuredClone(report);
  forged.principles[0].evidence[0].quote = 'Not in the snapshot at all.';
  assert.throws(() => validateResearchReports({ [forged.id]: forged }), /格式错误/);
  const dangling = structuredClone(report);
  dangling.ideas[0].principleIds = ['p9'];
  assert.throws(() => validateResearchReports({ [dangling.id]: dangling }), /格式错误/);
  // A fused idea must still cite at least two of the selected tags.
  await assert.rejects(createResearchReport(library, { kind: 'ideas', tagIds: ['rag', 'agent', 'verify'] }, async messages => {
    const input = { snapshot: { papers: JSON.parse(messages[1].content).papers } };
    return { content: { title: 'One-sided', principles: [], ideas: [{ title: 'Only RAG', hypothesis: 'h', rationale: 'r', evidence: [quote(input, 'r1'), quote(input, 'r3')], assumptions: [], experiment, risks: [] }] }, meta: {} };
  }), /至少两个所选标签/);
});

test('earlier two-tag idea reports without principles still validate and export', async () => {
  const library = store();
  const report = await createResearchReport(library, { kind: 'ideas', tagIds: ['rag', 'agent'] }, async messages => {
    const input = { snapshot: { papers: JSON.parse(messages[1].content).papers } };
    return { content: { title: 'Legacy-shaped ideas', ideas: [{ title: 'Idea', hypothesis: 'h', rationale: 'r', evidence: [quote(input, 'r1'), quote(input, 'a1')], assumptions: [], experiment, risks: [] }] }, meta: {} };
  });
  assert.deepEqual(report.principles, []);
  const legacy = structuredClone(report);
  delete legacy.principles;
  validateResearchReports({ [legacy.id]: legacy });
  assert.doesNotMatch(reportToMarkdown(legacy), /Design principles by tag/);
});
