import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBridge, loadToken } from '../bridge/server.mjs';
import { runProcess, validateRequest, cliArgs } from '../bridge/cli.mjs';
import { probeModels, normalizeModels } from '../bridge/models.mjs';

const token='a'.repeat(64);
const payload={provider:'codex',model:'default',messages:[{role:'user',content:'Reply with JSON'}],json:true};
async function start(t, options={}) {
  const server=createBridge({token,...options});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>server.stop());
  return 'http://127.0.0.1:'+server.address().port;
}
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};

test('bridge rejects untrusted origins, wrong tokens, host rebinding and arbitrary backend input',async t=>{
  let calls=0;
  const url=await start(t,{inspect:async()=>({ok:true}),run:async()=>{calls++;return {content:'{"ok":true}'};}});
  assert.equal((await fetch(url+'/health')).status,401);
  assert.equal((await fetch(url+'/health',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const badHost = await new Promise((resolve, reject) => { const req = http.get(url + '/health', { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(badHost, 403);
  const origin='chrome-extension://'+'a'.repeat(32);
  const preflight=await fetch(url+'/v1/generate',{method:'OPTIONS',headers:{Origin:origin}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await fetch(url+'/health',{headers})).status,200);
  assert.equal((await fetch(url+'/v1/generate',{method:'POST',headers,body:JSON.stringify({...payload,provider:'sh'})})).status,400);
  assert.equal((await fetch(url+'/v1/generate',{method:'POST',headers,body:JSON.stringify({...payload,model:'--dangerously-bypass-approvals-and-sandbox'})})).status,400);
  assert.equal(calls,0);
  const valid=await fetch(url+'/v1/generate',{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal((await valid.json()).content,'{"ok":true}');assert.equal(calls,1);
});

test('bridge queues background calls with at most two running and cancels disconnected requests',async t=>{
  let running=0,peak=0;const releases=[];
  const url=await start(t,{run:async (_body,signal)=>{
    running++;peak=Math.max(peak,running);
    try { await new Promise((resolve,reject)=>{releases.push(resolve);signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});return {content:'done'}; }
    finally {running--;}
  }});
  const requests=Array.from({length:4},()=>fetch(url+'/v1/generate',{method:'POST',headers,body:JSON.stringify(payload)}).then(r=>r.json()));
  while(releases.length<2)await new Promise(r=>setTimeout(r,5));
  assert.equal(running,2);releases.shift()();
  while(releases.length<2)await new Promise(r=>setTimeout(r,5));
  releases.shift()();
  while(releases.length<2)await new Promise(r=>setTimeout(r,5));
  releases.splice(0).forEach(release=>release());
  await Promise.all(requests);assert.equal(peak,2);assert.equal(running,0);
  const controller=new AbortController();
  const response=await fetch(url+'/v1/generate',{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});
  const pending=response.text();controller.abort();await assert.rejects(pending);
  for(let i=0;i<100 && running;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(running,0);
});

test('tokens persist privately; CLI invocation never interpolates a shell and validates bounded context',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'paper-mind-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const first=await loadToken(dir);assert.equal(first,await loadToken(dir));assert.equal(first.length,64);
  if(process.platform!=='win32')assert.equal((await stat(path.join(dir,'bridge-token'))).mode & 0o777,0o600);
  assert.throws(()=>validateRequest({...payload,messages:[{role:'tool',content:'x'}]}));
  assert.throws(()=>validateRequest({...payload,messages:[{role:'user',content:'x'.repeat(160001)}]}));
  assert.throws(()=>validateRequest({...payload,effort:'high"; malicious'}), /effort/);
  assert.throws(()=>validateRequest({...payload,provider:'claude',effort:'ultra'}), /effort/);
  assert.ok(cliArgs('claude','sonnet',dir,'answer','high').includes('--effort'));
  assert.ok(cliArgs('codex','fixture-model',dir,'answer','xhigh').includes('model_reasoning_effort="xhigh"'));
  assert.ok(!cliArgs('claude','default',dir,'answer').includes('--effort'));
  assert.ok(!cliArgs('codex','default',dir,'answer').some(arg=>arg.includes('model_reasoning_effort')));
  const args=cliArgs('codex','default',dir,path.join(dir,'answer'));assert.ok(args.includes('read-only'));assert.ok(args.includes('--ephemeral'));assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
  const text='$(touch should-not-exist); `whoami`';
  const result=await runProcess(process.execPath,['-e','process.stdin.pipe(process.stdout)'],{cwd:dir,input:text});
  assert.equal(result.stdout,text);assert.equal(result.code,0);
  await assert.rejects(runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:dir,timeout:50}),/timed out/);
  await assert.rejects(runProcess(process.execPath,['-e','process.stdout.write("x".repeat(10000))'],{cwd:dir,maxOutput:100}),/too large/);
});

test('CLI adapters parse successful finals and reject error or partial finals, cleaning request directories',async t=>{
  const {writeFile,access}=await import('node:fs/promises');
  const {generate}=await import('../bridge/cli.mjs');
  const dir=await mkdtemp(path.join(os.tmpdir(),'paper-mind-cli-fixture-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const fake=path.join(dir,'fake.mjs');
  await writeFile(fake, `import fs from 'node:fs';
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const result=JSON.stringify({cwd:process.cwd(),received:input.includes('Reply with JSON'),args:process.argv});
    if(process.argv.includes('exec')) {
      fs.writeFileSync(process.argv[process.argv.indexOf('-o')+1],result);
      console.log(JSON.stringify({type: input.includes('fail-fixture') ? 'turn.failed' : 'turn.completed'}));
    } else console.log(JSON.stringify({type:'result',is_error:input.includes('fail-fixture'),result,modelUsage:{'fixture-model':{}}}));`);
  for(const provider of ['claude','codex']) {
    const key='PAPER_MIND_'+provider.toUpperCase()+'_BIN', previous=process.env[key];
    process.env[key]=fake;
    try {
      const result=await generate({...payload,provider,model:'fixture-model',effort:'high'});
      const answer=JSON.parse(result.content);assert.equal(answer.received,true);await assert.rejects(access(answer.cwd));
      assert.ok(answer.args.includes('fixture-model'));
      assert.ok(answer.args.includes(provider==='claude' ? '--effort' : 'model_reasoning_effort="high"'));
      if(provider==='claude')assert.equal(result.model,'fixture-model');
      await assert.rejects(generate({...payload,provider,messages:[{role:'user',content:'fail-fixture'}]}),/调用失败/);
    } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
  }
});

test('model catalogs require authentication and never dispatch a generation',async t=>{
  let lists=0;
  const url=await start(t,{list:async force=>{assert.equal(force,true);lists++;return {codex:{models:[{id:'fixture',efforts:['low','high']}]}};},run:async()=>assert.fail('generation not allowed')});
  assert.equal((await fetch(url+'/models')).status,401);assert.equal(lists,0);
  const result=await fetch(url+'/models?refresh=1',{headers});assert.equal(result.status,200);
  assert.deepEqual((await result.json()).codex.models[0].efforts,['low','high']);assert.equal(lists,1);
});

test('CLI capability probes paginate, sanitize effort metadata, reject errors and time out without generation',async t=>{
  const {writeFile}=await import('node:fs/promises');
  const dir=await mkdtemp(path.join(os.tmpdir(),'paper-mind-catalog-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const fake=path.join(dir,'fake.mjs');
  await writeFile(fake,`import readline from 'node:readline';
    const output = message => process.stdout.write(JSON.stringify(message)+'\\n');
    for await (const line of readline.createInterface({input:process.stdin})) {
      const message=JSON.parse(line);
      if(message.type==='control_request' && message.request.subtype==='initialize') output({type:'control_response',response:{request_id:'models',response:{models:[{value:'sonnet',displayName:'Sonnet',supportsEffort:true,supportedEffortLevels:['low','high']},{value:'haiku',displayName:'Haiku'}]}}});
      else if(message.method==='initialize') output({id:1,result:{}});
      else if(message.method==='initialized') {}
      else if(message.method==='model/list') output({id:2,result:message.params.cursor ? {data:[{id:'second',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]} : {data:[{id:'first',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'invented'}]},{id:'hidden',hidden:true}],nextCursor:'page2'}});
      else process.exit(2);
    }`);
  for (const provider of ['claude','codex']) {
    const key='PAPER_MIND_'+provider.toUpperCase()+'_BIN',previous=process.env[key];
    process.env[key]=fake;
    try {
      const models=normalizeModels(provider,await probeModels(provider));
      assert.equal(models.length,2);
      assert.deepEqual(models[0].efforts,provider==='claude'?['low','high']:['low']);
      assert.deepEqual(models[1].efforts,provider==='claude'?[]:['high']);
    } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
  }
  const key='PAPER_MIND_CODEX_BIN',previous=process.env[key];process.env[key]=fake;
  try {
    await writeFile(fake,'setInterval(()=>{},1000);');
    await assert.rejects(probeModels('codex',{timeout:100}),/timed out/);
    await writeFile(fake,'console.log(JSON.stringify({id:1,error:{message:"fixture"}}));setInterval(()=>{},1000);');
    await assert.rejects(probeModels('codex'),/目录/);
  } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
});
