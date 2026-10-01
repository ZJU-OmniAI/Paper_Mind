// Record real extension interactions, synthesize local narration, then export MP4.
// Requires macOS `say`, ffmpeg/ffprobe and Playwright. No live model calls or user data.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installDemo } from './demo/fixture.mjs';
import { story } from './demo/story.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, 'dist/demo');
const output = path.join(root, 'assets/videos');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const durationOf = async file => Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file])).stdout.trim());
await mkdir(scratch, { recursive: true });
await mkdir(path.join(scratch, 'qa'), { recursive: true });
await mkdir(output, { recursive: true });

for (const scene of story) {
  const text = path.join(scratch, `${scene.id}.txt`);
  const aiff = path.join(scratch, `${scene.id}.aiff`);
  scene.audio = path.join(scratch, `${scene.id}.wav`);
  await writeFile(text, scene.voice);
  await run('say', ['-v', process.env.DEMO_VOICE || 'Tingting', '-r', '210', '-f', text, '-o', aiff]);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', aiff, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', scene.audio]);
  scene.voiceDuration = await durationOf(scene.audio);
  scene.hold = Math.max(scene.minimum, scene.voiceDuration + 1.4);
}
console.log(`Narration ready: ${story.length} scenes, about ${Math.round(story.reduce((n, s) => n + s.hold, 0))} seconds.`);

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const base = pathname.startsWith('/assets/') ? root : path.join(root, 'extension');
  const file = pathname === '/__demo' ? path.join(root, 'scripts/demo/stage.html') : path.resolve(base, '.' + pathname);
  if (pathname !== '/__demo' && !file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const timeline = [];
let browser, raw, videoLength;
try {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    recordVideo: { dir: scratch, size: { width: 1920, height: 1080 } }, colorScheme: 'light', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await installDemo(context, 'zh', origin);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/__demo`);
  const app = page.frameLocator('#app');
  await expect(app.locator('#titleInput')).toHaveValue('Reading Papers with Evidence-Aware Agents');
  await page.evaluate(() => document.fonts.ready);
  await pause(400);

  // A tiny marker gives the exact encoded first-frame offset for voice and SRT.
  // It is covered by the matching background color during the final encode.
  const started = Date.now();
  await page.evaluate(() => { document.getElementById('marker').style.background = '#00e080'; });
  const focus = async (locator, click = false) => {
    await locator.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    await pause(400);
    const box = await locator.boundingBox();
    if (!box) throw new Error('Cannot highlight a hidden control');
    await page.evaluate(box => { window.point(box.x + Math.min(box.width / 2, 100), box.y + box.height / 2); window.highlight(box); }, box);
    await pause(540);
    if (click) { await locator.click(); await pause(200); await page.evaluate(() => document.getElementById('ring').style.opacity = 0); }
  };
  const type = async (locator, text, delay = 75) => {
    await focus(locator, true); await locator.fill(''); await locator.pressSequentially(text, { delay });
  };
  const select = async (locator, value) => { await focus(locator); await locator.selectOption(value); await pause(500); };
  const title = 'Reading Papers with Evidence-Aware Agents';
  const memory = '先验证工具返回的证据，再让智能体回答论文问题。';
  let paperId;
  const actions = {
    intro: async () => {}, idea: async () => {},
    capture: async () => { await focus(app.locator('#titleInput')); await expect(app.locator('#serverStatus')).toContainText('8'); },
    memory: async () => { await type(app.locator('#captureMemory'), memory, 100); await select(app.locator('#captureReadingStatus'), 'reading'); },
    tags: async () => {
      await type(app.locator('#tagInput'), 'agent', 160);
      await expect(app.locator('#tagSuggestions .tag-suggestion:not(.create)')).toHaveCount(1);
      await pause(1200);
      await focus(app.locator('#tagSuggestions .tag-suggestion:not(.create)'), true);
      await type(app.locator('#tagInput'), 'evaluation', 80);
      await focus(app.locator('#tagSuggestions .tag-suggestion:not(.create)'), true);
      await expect(app.locator('#tagBox .chip')).toHaveCount(2);
      await focus(app.locator('#tagBox'));
    },
    save: async () => {
      await focus(app.locator('#saveButton'), true);
      await expect(app.locator('#message')).toHaveClass(/success/);
      await expect(app.locator('#serverStatus')).toContainText('9');
      await focus(app.locator('#savedBanner'));
      const saved = await app.locator('body').evaluate(async (_, title) => {
        const { handleApi } = await import('/storage.js');
        return (await handleApi('/api/state')).papers.find(p => p.title === title);
      }, title);
      expect(saved.memory).toBe(memory); expect(saved.readingStatus).toBe('reading');
      expect(saved.tagIds.slice().sort()).toEqual(['agent', 'eval']); paperId = saved.id;
    },
    library: async () => {
      await app.locator('#openManagerButton').click();
      await expect(app.locator('#paperCount')).toHaveText('9');
      await app.locator('#paperLibrarySort').selectOption('created');
      await expect(app.locator('#paperLibraryList .paper-card').first()).toContainText(title);
      await focus(app.locator(`#paperLibraryList [data-open-paper-id="${paperId}"]`));
    },
    recall: async () => {
      await app.locator('#conceptQuery').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await type(app.locator('#conceptQuery'), '我记得与智能体有关', 200);
      await expect(app.locator('#conceptResults [data-concept-tag-id]')).toHaveCount(1);
      await expect(app.locator('#paperLibraryList .paper-card')).toHaveCount(9);
      await focus(app.locator('#conceptResults [data-concept-tag-id="agent"]'));
    },
    find: async () => {
      await focus(app.locator('#conceptResults [data-concept-tag-id="agent"]'), true);
      await expect(app.locator('#paperLibraryList .paper-card')).toHaveCount(3);
      await focus(app.locator(`#paperLibraryList [data-open-paper-id="${paperId}"]`));
    },
    detail: async () => {
      await focus(app.locator(`#paperLibraryList [data-open-paper-id="${paperId}"]`), true);
      await expect(app.locator('#paperDetailTitle')).toHaveText(title);
      await expect(app.locator('#paperDetailMemory')).toHaveText(memory);
      await focus(app.locator('#paperDetailMemory'));
    },
    status: async () => {
      await select(app.locator('#detailQuickStatus'), 'revisit');
      await focus(app.locator('[data-view="papers"]'), true);
      await select(app.locator('#libraryReadingStatus'), 'revisit');
      await expect(app.locator('#paperLibraryList .paper-card')).toHaveCount(1);
      await focus(app.locator(`#paperLibraryList [data-open-paper-id="${paperId}"]`));
    },
    descriptions: async () => {
      await focus(app.locator('[data-view="tags"]'), true);
      await focus(app.locator('#tagTree [data-tag-id="agent"]'), true);
      await expect(app.locator('#tagDetail')).toContainText('调用工具');
      await app.locator('#tagDetail .tag-description-block').evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await focus(app.locator('#tagDetail .tag-description-block'));
    },
    models: async () => {
      await focus(app.locator('[data-view="settings"]'), true);
      await app.locator('[name="provider"][value="claude"]').check();
      await select(app.locator('#claudeModelSelect'), 'sonnet');
      await select(app.locator('#claudeEffort'), 'medium');
      await select(app.locator('#codexEffort'), 'high');
      await app.locator('#localBackendSettings .local-model-group').first().evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await focus(app.locator('#localBackendSettings .local-model-group').first());
      expect(await app.locator('#bridgeToken').inputValue()).toBe('');
    },
    api: async () => {
      await app.locator('[name="provider"][value="custom"]').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await pause(400);
      await focus(app.locator('[name="provider"][value="custom"]'), true);
      await focus(app.locator('#customBackendSettings'));
    },
    outro: async () => {}
  };
  for (let i = 0; i < story.length; i++) {
    const scene = story[i];
    const start = (Date.now() - started) / 1000;
    await page.evaluate(({ scene, i, total }) => window.cue(scene, i, total), { scene, i, total: story.length });
    await pause(650);
    await actions[scene.id]();
    await page.screenshot({ path: path.join(scratch, 'qa', `${String(i).padStart(2, '0')}-${scene.id}.png`) });
    await pause(Math.max(700, scene.hold * 1000 - (Date.now() - started - start * 1000)));
    const end = (Date.now() - started) / 1000;
    timeline.push({ ...scene, start, end });
    console.log(`${scene.id}: ${start.toFixed(1)}–${end.toFixed(1)}s`);
  }
  videoLength = (Date.now() - started) / 1000;
  raw = await page.video().path();
  await context.close();
  if (errors.length) throw new Error(errors.join('\n'));

  // A separate, unrecorded cover includes a clear play affordance.
  const cover = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await cover.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const poster = await cover.newPage();
  await poster.goto(`${origin}/__demo`);
  await poster.evaluate(({ scene, seconds }) => {
    window.cue(scene, 0, 1);
    document.getElementById('caption').textContent = '收藏 → 记忆 → 标签 → 论文 · 中文配音 / 字幕';
    document.getElementById('section').textContent = `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒 · 功能介绍`;
    document.getElementById('coverButton').style.display = 'block';
    document.getElementById('marker').style.display = 'none';
  }, { scene: story[1], seconds: videoLength });
  await poster.evaluate(() => document.fonts.ready);
  await poster.screenshot({ path: path.join(output, 'paper-mind-intro-poster.png') });
  await cover.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

const pixels = (await run('ffmpeg', ['-v', 'error', '-i', raw, '-vf', 'crop=8:8:0:0,scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1024 * 1024 })).stdout;
let first = -1;
for (let i = 0; i < pixels.length; i += 3) if (pixels[i] < 80 && pixels[i + 1] > 140 && pixels[i + 2] < 190) { first = i / 3; break; }
if (first < 0) throw new Error('Video/audio synchronization marker not found');
const fpsText = (await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=nw=1:nk=1', raw])).stdout.trim();
const [num, den = 1] = fpsText.split('/').map(Number);
const offset = first / (num / den);
const args = ['-y', '-v', 'error', '-i', raw];
for (const scene of timeline) args.push('-i', scene.audio);
const filters = [`[0:v]trim=start=${offset}:duration=${videoLength},setpts=PTS-STARTPTS,drawbox=x=0:y=0:w=8:h=8:color=0xf1f5f2:t=fill,format=yuv420p[v]`];
for (let i = 0; i < timeline.length; i++) filters.push(`[${i + 1}:a]adelay=${Math.round((timeline[i].start + 0.4) * 1000)}:all=1[a${i}]`);
filters.push(`${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${videoLength}[audio]`);
const mp4 = path.join(output, 'paper-mind-intro-zh.mp4');
args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[audio]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-t', String(videoLength), mp4);
console.log('Encoding H.264/AAC video…');
await run('ffmpeg', args, { maxBuffer: 4 * 1024 * 1024 });
const timestamp = seconds => { const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
await writeFile(path.join(output, 'paper-mind-intro-zh.srt'), timeline.map((s, i) => `${i + 1}\n${timestamp(s.start + 0.4)} --> ${timestamp(s.start + 0.4 + s.voiceDuration)}\n${s.voice.replaceAll('。', '。\n').trim()}\n`).join('\n'));
const chapterTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
await writeFile(path.join(output, 'transcript.zh-CN.md'), '# 功能介绍视频 · 中文旁白\n\n' + timeline.map(s => `## ${chapterTime(s.start)} · ${s.section}\n\n${s.voice}\n`).join('\n'));
await writeFile(path.join(scratch, 'timeline.json'), JSON.stringify({ offset, duration: videoLength, scenes: timeline }, null, 2));
console.log(`Created ${mp4}\nDuration: ${videoLength.toFixed(1)}s; sync offset: ${offset.toFixed(2)}s`);
