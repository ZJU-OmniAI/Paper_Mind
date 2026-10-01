// Only the authored product narration is sent to the TTS service.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { voices } from './story.mjs';
const run = promisify(execFile);
export const durationOf = async file => Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file])).stdout.trim());
export async function prepareSpeech(story, language, directory) {
  await mkdir(directory, { recursive: true });
  const scenes = structuredClone(story);
  const voice = { ...voices[language], name: process.env[`DEMO_VOICE_${language.toUpperCase()}`] || voices[language].name };
  const tasks = scenes.flatMap(scene => scene.beats.map((beat, index) => ({scene, beat, index})));
  let cursor = 0;
  await Promise.all(Array.from({length: 2}, async () => {
    while (cursor < tasks.length) {
      const { scene, beat, index } = tasks[cursor++];
      const digest = createHash('sha256').update(JSON.stringify({text:beat[language], voice})).digest('hex').slice(0,12);
      beat.audio = path.join(directory, `${scene.id}-${index}-${digest}.mp3`);
      const cached = await stat(beat.audio).then(s => s.size > 1000).catch(() => false);
      if (!cached) {
        const textFile = beat.audio + '.txt';
        await writeFile(textFile, beat[language]);
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await run(process.env.EDGE_TTS_BIN || 'edge-tts', ['--voice', voice.name, `--rate=${voice.rate}`, `--pitch=${voice.pitch}`, '--file', textFile, '--write-media', beat.audio], { timeout: 90000 });
            break;
          } catch (error) {
            if (attempt === 2) throw new Error(`Speech failed for ${language}/${scene.id}/${index}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
          }
        }
      }
      beat.duration = await durationOf(beat.audio);
      if (!(beat.duration > 0.5)) throw new Error('Invalid speech duration');
      console.log(`Speech ${language}/${scene.id}/${index}: ${beat.duration.toFixed(1)}s${cached ? ' (cached)' : ''}`);
    }
  }));
  return { scenes, voice };
}
