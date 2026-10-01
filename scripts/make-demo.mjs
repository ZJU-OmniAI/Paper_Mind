// Bilingual feature-overview videos. UI stays local; only public narration goes to TTS.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installDemo } from './demo/fixture.mjs';
import { story } from './demo/story.mjs';
import { prepareSpeech } from './demo/speech.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, 'dist/demo-v2');
const output = path.join(root, 'assets/videos');
const checkOnly = process.env.DEMO_CHECK === '1';
const encodeOnly = process.env.DEMO_ENCODE_ONLY === '1';
if (checkOnly && encodeOnly) throw new Error('Choose either DEMO_CHECK or DEMO_ENCODE_ONLY');
const languages = process.env.DEMO_LANG ? [process.env.DEMO_LANG] : ['zh', 'en'];
if (languages.some(lang => !['zh','en'].includes(lang))) throw new Error('DEMO_LANG must be zh or en');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const timestamp = seconds => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2,'0')}:${String(Math.floor(ms / 60000) % 60).padStart(2,'0')}:${String(Math.floor(ms / 1000) % 60).padStart(2,'0')},${String(ms % 1000).padStart(3,'0')}`;
};
const chapterTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
await mkdir(output, {recursive:true});
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png' };
const server = createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const base = pathname.startsWith('/assets/') ? root : path.join(root,'extension');
  const file = pathname === '/__demo' ? path.join(root,'scripts/demo/stage.html') : path.resolve(base,'.'+pathname);
  if (pathname !== '/__demo' && !file.startsWith(base+path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({channel:process.env.PW_CHANNEL || undefined});
  for (const language of languages) {
    if (encodeOnly) {
      const metadata=JSON.parse(await readFile(path.join(scratch,`${language}-timeline.json`),'utf8'));
      await encode(metadata);await makePoster(language,metadata.duration);await exportText(metadata);continue;
    }
    const en = language === 'en';
    const qa = path.join(scratch,'qa',language);
    await mkdir(qa,{recursive:true});
    const speech = checkOnly ? { scenes:structuredClone(story), voice:null } : await prepareSpeech(story,language,path.join(scratch,'audio',language));
    const scenes = speech.scenes;
    const context = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1,
      ...(!checkOnly ? {recordVideo:{dir:scratch,size:{width:1920,height:1080}}} : {}),
      colorScheme:'light', locale:en?'en-US':'zh-CN', timezoneId:'Asia/Shanghai' });
    await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    await installDemo(context,language,origin,{overview:true});
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto(origin+'/__demo');
    const app = page.frameLocator('#app');
    await expect(app.locator('#titleInput')).toHaveValue('Reading Papers with Evidence-Aware Agents');
    // Prepare a real capture form before the synchronization marker; no simulated success UI.
    await page.evaluate(()=>document.body.dataset.mode='popup');
    const memory = en ? 'Check tool evidence before an agent answers questions about a paper.' : '先验证工具返回的证据，再让智能体回答论文问题。';
    await app.locator('#captureMemory').fill(memory);
    await app.locator('#captureReadingStatus').selectOption('reading');
    await app.locator('#valueScoreInput').fill('4.5');
    for(const alias of ['agent','evaluation']) {
      await app.locator('#tagInput').fill(alias);
      await app.locator('#tagSuggestions .tag-suggestion:not(.create)').click();
    }
    await app.locator('body').evaluate(()=>window.scrollTo(0,0));
    await page.evaluate(({scene,language,total})=>window.cue(scene,0,total,language),{scene:scenes[0],language,total:scenes.length});
    await page.evaluate(()=>document.fonts.ready);
    await pause(400);
    let savedId;
    const focus = async locator => {
      await locator.evaluate(el=>el.scrollIntoView({block:'center',behavior:'smooth'}));
      await pause(checkOnly?180:380);
      const box=await locator.boundingBox();
      if(!box)throw new Error('Hidden feature in recording');
      await page.evaluate(box=>{window.highlight(box);window.point(box.x+Math.min(box.width/2,100),box.y+Math.min(box.height/2,60));},box);
      await pause(checkOnly?80:300);
    };
    const click = async locator => {await locator.click();await pause(checkOnly?80:220);};
    const library = async () => {
      await click(app.locator('[data-view="papers"]'));
      if(await app.locator('#clearLibraryFilters').isVisible())await click(app.locator('#clearLibraryFilters'));
    };
    const openPaper = async id => {await library();await click(app.locator(`#paperLibraryList [data-open-paper-id="${id}"]`));};
    const actions = {
      intro:[async()=>{},async()=>{}],
      recall:[async()=>{},async()=>{}],
      capture:[async()=>{await focus(app.locator('#titleInput'));},async()=>{
        await click(app.locator('#saveButton'));
        await expect(app.locator('#message')).toHaveClass(/success/);
        await focus(app.locator('#savedBanner'));
        const saved=await app.locator('body').evaluate(async()=>{const {handleApi}=await import('/storage.js');return(await handleApi('/api/state')).papers.find(p=>p.title==='Reading Papers with Evidence-Aware Agents');});
        expect(saved.memory).toBe(memory);expect(saved.valueScore).toBe(4.5);expect(saved.readingStatus).toBe('reading');expect(saved.tagIds.slice().sort()).toEqual(['agent','eval']);savedId=saved.id;
      }],
      materials:[async()=>{
        await click(app.locator('#openManagerButton'));await expect(app.locator('#paperCount')).toHaveText('9');
        await openPaper('paper-0');await focus(app.locator('#paperDetailLinks'));
      },async()=>{await focus(app.locator('#paperDetailClips'));await expect(app.locator('#paperDetailClips .clip-section')).toHaveCount(2);}],
      memory:[async()=>{await openPaper(savedId);await focus(app.locator('.detail-memory'));},async()=>{
        await app.locator('#detailQuickStatus').selectOption('revisit');await library();
        await app.locator('#libraryReadingStatus').selectOption('revisit');await expect(app.locator('#paperLibraryList .paper-card')).toHaveCount(1);await focus(app.locator('.library-filters'));
      }],
      search:[async()=>{
        await library();await app.locator('#conceptQuery').fill(en?'tools':'工具');
        await expect(app.locator('#conceptResults [data-concept-tag-id]')).toHaveCount(1);await focus(app.locator('.concept-search'));
      },async()=>{
        await click(app.locator('#conceptResults [data-concept-tag-id="agent"]'));
        await expect(app.locator('#paperLibraryList .paper-card')).toHaveCount(3);await focus(app.locator(`#paperLibraryList [data-open-paper-id="${savedId}"]`));
      }],
      tags:[async()=>{
        await click(app.locator('[data-view="tags"]'));await click(app.locator('#tagTree [data-tag-id="agent"]'));await focus(app.locator('#tagDetail .tag-description-block'));
      },async()=>{await focus(app.locator('#tagTree'));await expect(app.locator('#tagDetail')).toContainText('agent');}],
      discovery:[async()=>{
        await openPaper('paper-1');await focus(app.locator('#abstractLangToggle'));
        await expect(app.locator('#abstractLangToggle')).toBeVisible();
        await pause(checkOnly?100:1000);await focus(app.locator('.recommendations-layout'));
      },async()=>{
        await library();await click(app.locator('[data-paper-library-mode="map"]'));await focus(app.locator('#paperMapShell'));
        await expect(app.locator('#paperMapTags [data-map-tag-id]').first()).toBeVisible();
      }],
      topics:[async()=>{
        await click(app.locator('[data-view="topics"]'));await click(app.locator('[data-edit-topic-pack-id="pack-rag"]'));await focus(app.locator('#topicPackForm'));
      },async()=>{
        await click(app.locator('[data-open-topic-pack-id="pack-rag"]'));await focus(app.locator('#topicPaperList'));await expect(app.locator('#topicPaperList .paper-card')).toHaveCount(2);
      }],
      models:[async()=>{
        await click(app.locator('[data-view="settings"]'));await app.locator('[name="provider"][value="claude"]').check();
        await app.locator('#claudeModelSelect').selectOption('sonnet');await app.locator('#claudeEffort').selectOption('medium');await app.locator('#codexEffort').selectOption('high');
        await focus(app.locator('#localBackendSettings .local-model-group').first());expect(await app.locator('#bridgeToken').inputValue()).toBe('');
      },async()=>{await app.locator('[name="provider"][value="custom"]').check();await focus(app.locator('#customBackendSettings'));}],
      data:[async()=>{
        await library();await click(app.locator('[data-paper-library-mode="list"]'));
        await page.emulateMedia({colorScheme:'dark'});await focus(app.locator('#paperLibraryList .paper-card').first());
      },async()=>{
        await page.emulateMedia({colorScheme:'light'});await click(app.locator('[data-view="settings"]'));await focus(app.locator('.data-actions'));
        const exported=await app.locator('body').evaluate(async()=>{const {handleApi}=await import('/storage.js');return await handleApi('/api/export');});
        expect(exported.store.papers).toHaveLength(9);expect(JSON.stringify(exported)).not.toContain('bridgeToken');
      }],
      outro:[async()=>{},async()=>{}]
    };
    const timeline=[];
    const started=Date.now();
    await page.evaluate(()=>document.getElementById('marker').style.background='#00e080');
    for(let i=0;i<scenes.length;i++) {
      const scene=scenes[i];
      await page.evaluate(({scene,i,total,language})=>window.cue(scene,i,total,language),{scene,i,total:scenes.length,language});
      for(let j=0;j<scene.beats.length;j++) {
        const beat=scene.beats[j],start=(Date.now()-started)/1000;
        await page.evaluate(({beat,language})=>window.subtitles(beat,language),{beat,language});
        await actions[scene.id][j]();
        const fits=await page.locator('#captionWrap').evaluate(el=>{
          const box=el.getBoundingClientRect();return box.bottom<=innerHeight && Array.from(el.children).every(c=>{const r=c.getBoundingClientRect();return r.left>=20&&r.right<=innerWidth-20&&r.top>=box.top&&r.bottom<=box.bottom;});
        });
        expect(fits,'Bilingual subtitles fit inside the frame').toBe(true);
        if(['memory','recall'].includes(scene.mode)) {
          const visualFits=await page.locator(scene.mode==='memory'?'#memoryStage':'#recallStage').evaluate(el=>[el,...el.querySelectorAll('*')].every(c=>{const r=c.getBoundingClientRect();return r.left>=30&&r.right<=innerWidth-30&&r.bottom<=885;}));
          expect(visualFits,'Opening illustration fits above the bilingual subtitles').toBe(true);
        }
        await page.screenshot({path:path.join(qa,`${String(i).padStart(2,'0')}-${scene.id}-${j}.png`)});
        await pause(checkOnly?80:Math.max(250,(beat.duration+0.55)*1000-((Date.now()-started)-start*1000)));
        timeline.push({...beat,scene:scene.id,section:scene.section,title:scene.title,start,end:(Date.now()-started)/1000});
      }
      console.log(`${language} ${scene.id}: ${((Date.now()-started)/1000).toFixed(1)}s`);
    }
    const videoLength=(Date.now()-started)/1000;
    const raw=checkOnly?null:await page.video().path();
    await context.close();
    if(errors.length)throw new Error(errors.join('\n'));
    if(checkOnly){console.log(`${language}: all feature views and bilingual subtitles verified.`);continue;}
    const metadata={language,voice:speech.voice,duration:videoLength,raw,timeline};
    await writeFile(path.join(scratch,`${language}-timeline.json`),JSON.stringify(metadata,null,2));
    await encode(metadata);
    await makePoster(language,videoLength);
    await exportText(metadata);
  }
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}

async function encode({language,duration,raw,timeline}) {
  const pixels=(await run('ffmpeg',['-v','error','-i',raw,'-vf','crop=8:8:0:0,scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:1024*1024})).stdout;
  let first=-1;
  for(let i=0;i<pixels.length;i+=3)if(pixels[i]<80&&pixels[i+1]>140&&pixels[i+2]<190){first=i/3;break;}
  if(first<0)throw new Error('Synchronization marker missing');
  const fpsText=(await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate','-of','default=nw=1:nk=1',raw])).stdout.trim();
  const [num,den=1]=fpsText.split('/').map(Number),offset=first/(num/den);
  const args=['-y','-v','error','-i',raw];
  for(const beat of timeline)args.push('-i',beat.audio);
  const audioInputs=timeline.flatMap(beat=>['-i',beat.audio]);
  const delayed=base=>timeline.map((beat,i)=>`[${i+base}:a]adelay=${Math.round((beat.start+0.18)*1000)}:all=1[a${i}]`).join(';');
  // Gentle presence/warmth shaping; the natural neural voice provides the timbre.
  const mix=`${timeline.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0,highpass=f=65,equalizer=f=145:t=q:w=0.8:g=1.2,acompressor=threshold=0.18:ratio=1.6:attack=15:release=180,apad,atrim=duration=${duration}`;
  // Measure the entire narration before normalization, leaving headroom for AAC.
  const measured=await run('ffmpeg',['-hide_banner','-nostats',...audioInputs,'-filter_complex',`${delayed(0)};${mix},loudnorm=I=-16:TP=-2:LRA=10:print_format=json[a]`,'-map','[a]','-f','null','-'],{maxBuffer:2*1024*1024});
  const stats=JSON.parse(measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'null');
  if(!stats || !Number.isFinite(Number(stats.input_i)))throw new Error('Unable to measure narration loudness');
  const normalize=`loudnorm=I=-16:TP=-2:LRA=10:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
  // Limit after resampling too: AAC reconstruction can otherwise overshoot peaks.
  const filters=[`[0:v]trim=start=${offset}:duration=${duration},setpts=PTS-STARTPTS,drawbox=x=0:y=0:w=8:h=8:color=0xf1f5f2:t=fill,format=yuv420p[v]`,delayed(1),`${mix},${normalize},aresample=48000,alimiter=limit=0.63:level=false:latency=true[a]`];
  args.push('-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-c:v','libx264','-preset','slow','-crf','21','-c:a','aac','-b:a','160k','-ar','48000','-metadata:s:a:0',`language=${language==='zh'?'zho':'eng'}`,'-movflags','+faststart','-t',String(duration),path.join(output,`paper-mind-intro-${language}.mp4`));
  console.log(`${language}: encoding final video…`);await run('ffmpeg',args,{maxBuffer:4*1024*1024});
}
async function makePoster(language,duration) {
  const en=language==='en';
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin+'/__demo');
  await page.evaluate(({scene,language,duration})=>{
    const en=language==='en';window.cue(scene,0,1,language);document.body.dataset.visual='papers';
    document.getElementById('section').textContent=en?'ENGLISH NARRATION · 中文 / EN SUBTITLES':'中文磁性男声 · 中文 / EN 双语字幕';
    document.getElementById('coverButton').textContent=en?'▶  Watch the overview':'▶　观看功能全景';
    document.getElementById('coverButton').style.display='block';document.getElementById('coverButton').style.left='50%';document.getElementById('coverButton').style.transform='translateX(-50%)';
    document.getElementById('marker').style.display='none';
    window.subtitles({zh:'收藏与剪藏 · 概念检索 · 标签管理 · 研究整理 · 模型与数据',en:'Capture · Find · Organize · Read · Research · Connect'},language);
    document.getElementById('note').textContent=`${Math.floor(duration/60)}:${String(Math.round(duration%60)).padStart(2,'0')} · 1080p · Paper_Mind`;
  },{scene:story.find(s=>s.id==='recall'),language,duration});
  await page.evaluate(()=>document.fonts.ready);
  const file=path.join(output,`paper-mind-intro-poster-${language}.png`);
  await page.screenshot({path:file});
  await page.evaluate(({scene,language})=>{window.cue(scene,0,1,language);document.body.dataset.visual='papers';document.getElementById('coverButton').style.display='none';},{scene:story.find(s=>s.id==='recall'),language});
  await page.screenshot({path:path.join(root,`assets/screenshots/concept-recall-${language}.png`),clip:{x:65,y:105,width:1790,height:740}});
  await context.close();
  if(!en)await copyFile(file,path.join(output,'paper-mind-intro-poster.png'));
}
async function exportText({language,voice,duration,timeline}) {
  const other=language==='zh'?'en':'zh';
  const srt=timeline.map((b,i)=>`${i+1}\n${timestamp(b.start+0.18)} --> ${timestamp(b.start+0.18+b.duration)}\n${b[language]}\n${b[other]}\n`).join('\n');
  await writeFile(path.join(output,`paper-mind-intro-${language}.srt`),srt);
  const title=language==='zh'?'功能全景 · 中文配音 / 中英双语字幕':'Feature overview · English narration / bilingual subtitles';
  const sections=[];
  for(const scene of story){const beats=timeline.filter(b=>b.scene===scene.id);sections.push(`## ${chapterTime(beats[0].start)} · ${scene.section[language==='zh'?0:1]}\n\n${beats.map(b=>`${b[language]}\n\n${b[other]}`).join('\n\n')}\n`);}
  await writeFile(path.join(output,language==='zh'?'transcript.zh-CN.md':'transcript.en.md'),`# ${title}\n\n${sections.join('\n')}`);
  await writeFile(path.join(output,`production-${language}.json`),JSON.stringify({language,voice,duration:Math.round(duration*100)/100,resolution:'1920x1080',subtitles:['zh','en'],scenes:story.map(s=>({id:s.id,start:timeline.find(b=>b.scene===s.id).start}))},null,2)+'\n');
  console.log(`${language}: complete, ${duration.toFixed(1)} seconds.`);
}
