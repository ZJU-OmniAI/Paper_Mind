// Edit by recorded frame markers, not by time spent waiting for the browser.
export const FRAME_RATE = 25;
export const SPEECH_LEAD = 4 / FRAME_RATE;
const SHOT_TAIL = 8 / FRAME_RATE;

export function shotTiming(audioDuration, index, outputStartFrame) {
  if (!(audioDuration > 0) || !Number.isInteger(index) || index < 0 || index >= 64 || !Number.isInteger(outputStartFrame) || outputStartFrame < 0) throw new Error('Invalid shot timing');
  const frameCount = Math.ceil((SPEECH_LEAD + audioDuration + SHOT_TAIL) * FRAME_RATE);
  const start = outputStartFrame / FRAME_RATE;
  return { frameCount, outputStartFrame, start, end: (outputStartFrame + frameCount) / FRAME_RATE,
    speechStart: start + SPEECH_LEAD, marker: [24 + (index % 8) * 30, 220, 24 + Math.floor(index / 8) * 30] };
}

export function locateShotFrames(rgb, shots) {
  if (rgb.length % 3) throw new Error('Incomplete RGB marker frames');
  const runs = shots.map(() => ({ start: -1, length: 0 }));
  let start = -1;
  for (let frame = 0; frame <= rgb.length / 3; frame++) {
    // Ready markers have green=220; the idle marker has green=0. Segment by
    // that channel, then identify each take by its median color. A VP8 keyframe
    // can briefly distort a tiny marker's red/blue channels without ending it.
    const ready = frame < rgb.length / 3 && rgb[frame * 3 + 1] > 140;
    if (ready && start < 0) start = frame;
    if (ready || start < 0) continue;
    const color = [0,1,2].map(channel => {
      const values = [];
      for (let i = start; i < frame; i++) values.push(rgb[i * 3 + channel]);
      return values.sort((a,b) => a-b)[Math.floor(values.length / 2)];
    });
    let found = -1, distance = Infinity;
    shots.forEach((shot, index) => {
      const delta = shot.marker.map((value, channel) => Math.abs(color[channel] - value));
      const score = delta.reduce((sum, value) => sum + value * value, 0);
      if (Math.max(...delta) <= 35 && score < distance) { found = index; distance = score; }
    });
    if (found >= 0 && frame - start > runs[found].length) runs[found] = { start, length: frame - start };
    start = -1;
  }
  return shots.map((shot, index) => {
    const run = runs[index];
    if (run.length < shot.frameCount) throw new Error(`Shot ${index}: only ${run.length} ready frames; need ${shot.frameCount}`);
    return { ...shot, sourceStartFrame: run.start, sourceEndFrame: run.start + shot.frameCount };
  });
}
