import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTags, suggestTags, paperSearchScore, mergeStoreChanges, safeWebUrl, contextFingerprint, descriptionContext } from '../extension/library-tools.js';

test('canonical tags normalize unicode, delimiters and case without guessing semantic equivalence', () => {
  assert.deepEqual(splitTags([' ＃ＲＡＧ，rag; 检索、评估', '检索']), ['rag', '检索', '评估']);
});
const tags = [{ id:'rag', name:'检索增强生成', aliases:['RAG'], description:'通过外部知识检索增强语言模型的回答', paperIds:['p'] }, { id:'eval', name:'评估', aliases:[], paperIds:['p'] }];
const paper = { id:'p', title:'Reliable Retrieval', tagIds:['rag','eval'], abstract:'Measure hallucination', abstractZh:'幻觉评估', clips:[{ markdown:'正文内容 '.repeat(3000) + '隐藏在末尾的知识'}] };
test('AND query searches across fields, aliases, descriptions, translations and full clip content', () => {
  assert.ok(paperSearchScore(paper,tags,'RAG hallucination') > 0);
  assert.ok(paperSearchScore(paper,tags,'外部知识 幻觉') > 0);
  assert.ok(paperSearchScore(paper,tags,'隐藏在末尾的知识') > 0);
  assert.equal(paperSearchScore(paper,tags,'RAG diffusion'), 0);
  assert.equal(paperSearchScore(paper,tags,'"retrieval hallucination"'), 0);
});
test('suggestions search aliases and descriptions, exclude chosen tags, and stay bounded', () => {
  assert.equal(suggestTags(tags,'rag')[0].id,'rag');
  assert.equal(suggestTags(tags,'外部知识')[0].id,'rag');
  assert.deepEqual(suggestTags(tags,'unrelated'),[]);
  assert.deepEqual(suggestTags(tags,'rag',{selected:['ＲＡＧ']}),[]);
  assert.equal(suggestTags(Array.from({length:30},(_,i)=>({ id:String(i), name:`Tag ${i}` })), '').length,8);
});
test('unsafe URL schemes and credentials never become clickable links', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://u:secret@example.com', 'not a url']) assert.equal(safeWebUrl(value),'');
  assert.equal(safeWebUrl('https://example.com/a'),'https://example.com/a');
});
test('store merge preserves independent additions and background fields, rejects same-field and delete conflicts', () => {
  const base={papers:[{id:'a',title:'A',citationCount:0}],tags:[],topicPacks:[],meta:{}};
  const edited=structuredClone(base); edited.papers[0].title='Edited'; edited.papers.push({id:'b',title:'B'});
  const live=structuredClone(base); live.papers[0].citationCount=42; live.papers.push({id:'c',title:'C'});
  const result=mergeStoreChanges(base,edited,live);
  assert.equal(result.papers.length,3); assert.equal(result.papers[0].citationCount,42); assert.equal(result.papers[0].title,'Edited');
  live.papers[0].title='Other edit'; assert.throws(()=>mergeStoreChanges(base,edited,live),/另一个页面/);
  live.papers=[]; assert.throws(()=>mergeStoreChanges(base,edited,live),/另一个页面/);
});
test('description fingerprint tracks meaningful source content, not citation count', () => {
  const original=contextFingerprint(descriptionContext(tags[0],[paper]));
  assert.equal(original,contextFingerprint(descriptionContext(tags[0],[{...paper,citationCount:88}])));
  assert.notEqual(original,contextFingerprint(descriptionContext(tags[0],[{...paper,abstract:'New evidence'}])));
});
