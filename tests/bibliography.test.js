import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBibliography, mergeBibliography } from '../extension/bibliography.js';
import { fetchPaperMetadata } from '../extension/citations.js';

test('bibliographic facts normalize authors without splitting comma-form names, and preserve curated fields',()=>{
  assert.deepEqual(normalizeBibliography({authors:'Lovelace, Ada; 李 明；Lovelace, Ada',year:2024,venue:' ICLR\n2024 '}),{authors:['Lovelace, Ada','李 明'],year:'2024',venue:'ICLR 2024'});
  assert.equal(normalizeBibliography({year:'yesterday'}).year,'');
  const saved={authors:['My correction'],year:'',venue:'Verified journal'};
  mergeBibliography(saved,{authors:['Remote name'],year:2025,venue:'Other journal'});
  assert.deepEqual(saved,{authors:['My correction'],year:'2025',venue:'Verified journal'});
  mergeBibliography(saved,{venue:''},{replace:true});assert.equal(saved.venue,'');
});

test('metadata lookup uses identifiers, falls back to exact titles, and refuses ambiguity',async()=>{
  const original=globalThis.fetch;
  try {
    let calls=[];
    globalThis.fetch=async url=>{calls.push(url);return {ok:true,status:200,json:async()=>({title:'Canonical paper',authors:[{name:'Author A'}],year:2025,venue:'',journal:{name:'A Journal'},url:'https://example.org/paper'})};};
    const byId=await fetchPaperMetadata({sourceUrl:'https://arxiv.org/abs/2501.12345v2'});
    assert.equal(byId.matchedBy,'id');assert.equal(byId.venue,'A Journal');assert.match(calls[0],/arXiv%3A2501.12345/);
    globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({data:[{title:'An unrelated paper',authors:[{name:'Wrong'}]}]})});
    assert.equal((await fetchPaperMetadata({title:'My paper'})).found,false);
    globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({data:[{title:'My paper',year:2025,authors:[{name:'One'}]},{title:'My Paper',year:2020,authors:[{name:'Two'}]}]})});
    assert.equal((await fetchPaperMetadata({title:'My paper'})).ambiguous,true);
    globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({data:[{title:'MY PAPER',year:2025,authors:[{name:'One'}]}]})});
    assert.equal((await fetchPaperMetadata({title:'My paper'})).year,'2025');
    globalThis.fetch=async()=>({ok:false,status:503});
    await assert.rejects(fetchPaperMetadata({title:'My paper'}),/503/);
  } finally {globalThis.fetch=original;}
});

test('Crossref fallback supplies verified DOI metadata when Semantic Scholar is rate-limited',async()=>{
  const original=globalThis.fetch;
  try {
    const urls=[];
    globalThis.fetch=async url=>{
      urls.push(url);
      if(url.includes('semanticscholar'))return {ok:false,status:429};
      return {ok:true,status:200,json:async()=>({message:{DOI:'10.1038/nature14539',title:['Deep learning'],author:[{given:'Yann',family:'LeCun'},{given:'Yoshua',family:'Bengio'},{given:'Geoffrey',family:'Hinton'}],published:{'date-parts':[[2015,5,27]]},'container-title':['Nature']}})};
    };
    const result=await fetchPaperMetadata({title:'Deep learning',sourceUrl:'https://doi.org/10.1038/nature14539'});
    assert.equal(result.provider,'Crossref');assert.equal(result.year,'2015');assert.equal(result.venue,'Nature');assert.deepEqual(result.authors,['Yann LeCun','Yoshua Bengio','Geoffrey Hinton']);
    assert.equal(urls.length,2);assert.match(urls[1],/10.1038%2Fnature14539/);
    assert.equal((await fetchPaperMetadata({sourceUrl:'https://doi.org/10.9999/different'})).found,false);
  } finally {globalThis.fetch=original;}
});
