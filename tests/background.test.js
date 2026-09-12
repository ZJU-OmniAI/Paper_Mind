import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../extension/storage.js';
const values={paperTagConfig:{provider:'qwen',autoDescribeTags:false}};
const queues=new Map();
if (!globalThis.navigator) Object.defineProperty(globalThis, "navigator", { value: {} });
Object.defineProperty(navigator,'locks',{value:{request(name,run){const result=(queues.get(name)||Promise.resolve()).then(run);queues.set(name,result.catch(()=>{}));return result;}}});
const listeners=[];
const broadcasts=[];
const event={addListener(){}};
globalThis.chrome={storage:{local:{async get(keys){return Object.fromEntries(keys.map(key=>[key,structuredClone(values[key])]));},async set(data){Object.assign(values,structuredClone(data));},async remove(key){delete values[key];}}},runtime:{id:'test',onMessage:{addListener(fn){listeners.push(fn);}},onInstalled:event,onStartup:event,getPlatformInfo(fn){fn?.({});},async sendMessage(message){broadcasts.push(message);}},alarms:{onAlarm:event,async get(){return null;},async create(){},async clear(){}},downloads:{}};
const api=(path,body)=>handleApi(path,{method:'POST',body});
const state=()=>handleApi('/api/state');

test('background batch queue finishes every tag when explicitly requested with auto-generation disabled',async()=>{
  await api('/api/import',{papers:[{id:'paper',title:'Evidence',abstract:'Research methods',tagIds:Array.from({length:9},(_,i)=>`tag-${i}`)}],tags:Array.from({length:9},(_,i)=>({id:`tag-${i}`,name:`Topic ${i}`,aliases:[]}))});
  await api('/api/settings',{qwenKey:'test-key',autoDescribeTags:false});
  let calls=0;
  globalThis.fetch=async(_url,options)=>{
    calls++;const input=JSON.parse(JSON.parse(options.body).messages[1].content);
    return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({descriptions:input.tags.map(tag=>({tagId:tag.id,description:'该标签根据关联论文整理，用于归纳研究方法及其适用场景；具体概念边界仍需结合论文证据判断。'}))})}}]})};
  };
  await import('../extension/background.js');
  listeners.forEach(listener=>listener({type:'auto-describe-tags',retry:true},{id:'test'}));
  let db;
  for(let i=0;i<100;i++){db=await state();if(db.tags.filter(t=>t.descriptionStatus==='ready'&&!t.system).length===9)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(db.tags.filter(t=>t.descriptionStatus==='ready'&&!t.system).length,9);
  assert.equal(calls,3);
  await new Promise(r=>setTimeout(r,30));
  assert.ok(broadcasts.some(message=>message.type==='tag-descriptions-updated'));
  assert.equal(calls,3);
});
