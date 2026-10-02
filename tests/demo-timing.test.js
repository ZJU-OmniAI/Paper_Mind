import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_RATE, SPEECH_LEAD, shotTiming, locateShotFrames } from '../scripts/demo/timing.mjs';

test('video cuts, narration and subtitles share one frame-based timeline', () => {
  let next = 0;
  for (const [index, duration] of [3.713, 6.811, 4.007, 8.122].entries()) {
    const shot = shotTiming(duration, index, next);
    assert.equal(shot.start, next / FRAME_RATE);
    assert.equal(shot.speechStart, shot.start + SPEECH_LEAD);
    assert.ok(shot.speechStart + duration <= shot.end);
    next += shot.frameCount;
    assert.equal(shot.end, next / FRAME_RATE);
  }
});

test('frame markers exclude arbitrary navigation waits and tolerate compression noise', () => {
  const shots = [shotTiming(1, 0, 0), shotTiming(2, 1, 37)];
  const frames = [], idle = [220, 0, 220];
  const add = (color, count) => { for (let i = 0; i < count; i++) frames.push(...color); };
  add(idle, 83);
  add(shots[0].marker.map(v => v + 2), 20);
  add([47,199,66], 1); // A single distorted VP8 keyframe stays in the same take.
  add(shots[0].marker.map(v => v - 2), shots[0].frameCount + 10 - 21);
  add(idle, 212);
  add(shots[1].marker.map(v => v - 2), shots[1].frameCount + 10);
  const result = locateShotFrames(Buffer.from(frames), shots);
  assert.equal(result[0].sourceStartFrame, 83);
  assert.equal(result[1].sourceStartFrame, 83 + shots[0].frameCount + 10 + 212);
  assert.equal(result[1].sourceEndFrame - result[1].sourceStartFrame, shots[1].frameCount);
});

test('missing or truncated ready footage fails instead of silently desynchronizing', () => {
  const shot = shotTiming(2, 0, 0);
  assert.throws(() => locateShotFrames(Buffer.from([220, 0, 220]), [shot]), /ready frames/);
  assert.throws(() => locateShotFrames(Buffer.from(shot.marker), [shot]), /ready frames/);
  assert.throws(() => shotTiming(0, 0, 0), /Invalid/);
});
