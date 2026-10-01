import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBridge, loadToken } from '../bridge/server.mjs';
import { runProcess, validateRequest, cliArgs } from '../bridge/cli.mjs';

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
    const result=JSON.stringify({cwd:process.cwd(),received:input.includes('Reply with JSON')});
    if(process.argv.includes('exec')) {
      fs.writeFileSync(process.argv[process.argv.indexOf('-o')+1],result);
      console.log(JSON.stringify({type: input.includes('fail-fixture') ? 'turn.failed' : 'turn.completed'}));
    } else console.log(JSON.stringify({type:'result',is_error:input.includes('fail-fixture'),result,modelUsage:{'fixture-model':{}}}));`);
  for(const provider of ['claude','codex']) {
    const key='PAPER_MIND_'+provider.toUpperCase()+'_BIN', previous=process.env[key];
    process.env[key]=fake;
    try {
      const result=await generate({...payload,provider});
      const answer=JSON.parse(result.content);assert.equal(answer.received,true);await assert.rejects(access(answer.cwd));
      if(provider==='claude')assert.equal(result.model,'fixture-model');
      await assert.rejects(generate({...payload,provider,messages:[{role:'user',content:'fail-fixture'}]}),/调用失败/);
    } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
  }
});
