import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { BureauAudio } from '../src/audio.ts';
import { buildCases } from '../src/content.ts';

test('each generated recording matches the complete briefing across seeds', () => {
  const root = new URL('../src/assets/briefings/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  for (const seed of [1, 9636]) {
    const cases = buildCases(seed);
    assert.deepEqual(manifest.cases, cases.map(c => ({ id: c.id, text: c.briefing })));
    for (const level of cases) {
      assert.ok(statSync(new URL(`case-${level.id}.mp3`, root)).size > 1000);
    }
  }
});

test('recorded briefings restart, pause, resume, follow volume/mute, stop, and handle playback errors', async () => {
  const instances: FakeAudio[] = [];
  class FakeAudio {
    readonly src: string;
    volume = 1;
    muted = false;
    currentTime = 0;
    paused = true;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    playResult = Promise.resolve();
    constructor(src: string) { this.src = src; instances.push(this); }
    play() { this.paused = false; return this.playResult; }
    pause() { this.paused = true; }
  }
  const originalAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio as unknown as typeof Audio;
  const audio = new BureauAudio();
  let errors = 0;
  const onError = () => { errors++; };
  try {
    audio.setPaused(false);
    audio.playBriefing('case-1.mp3', onError);
    const first = instances[0];
    assert.equal(first.src, 'case-1.mp3');
    assert.equal(first.paused, false);
    assert.equal(first.volume, 0.6);
    first.currentTime = 12;
    audio.setPaused(true);
    assert.equal(first.paused, true);
    audio.setPaused(false);
    assert.equal(first.paused, false);
    assert.equal(first.currentTime, 12);
    audio.update({ master: 0.3, music: 0, effects: 0, muted: true });
    assert.equal(first.volume, 0.3);
    assert.equal(first.muted, true);
    audio.setTemporaryMuted(true);
    audio.update({ master: 0.4, music: 0, effects: 0, muted: false });
    assert.equal(first.muted, true);
    audio.setTemporaryMuted(false);
    assert.equal(first.muted, false);

    audio.playBriefing('case-2.mp3', onError);
    const second = instances[1];
    assert.equal(first.paused, true);
    assert.equal(first.currentTime, 0);
    assert.equal(second.paused, false);
    audio.stopBriefing();
    audio.setPaused(true);
    audio.setPaused(false);
    assert.equal(second.paused, true, 'stopped audio must not resume');

    audio.playBriefing('ended.mp3', onError);
    instances[2].onended?.();
    assert.equal(instances[2].paused, true);
    audio.playBriefing('broken.mp3', onError);
    instances[3].onerror?.();
    assert.equal(errors, 1);
    assert.equal(instances[3].paused, true);

    audio.playBriefing('pending.mp3', onError);
    const pending = instances[4];
    pending.playResult = Promise.reject(new Error('decode failed'));
    audio.setPaused(true);
    audio.setPaused(false);
    await Promise.resolve();
    assert.equal(errors, 2);
    assert.equal(pending.paused, true);

    audio.playBriefing('cancelled.mp3', onError);
    const cancelled = instances[5];
    cancelled.playResult = Promise.reject(new Error('old recording failed'));
    audio.setPaused(true);
    audio.setPaused(false);
    audio.playBriefing('replacement.mp3', onError);
    await Promise.resolve();
    assert.equal(errors, 2, 'a replaced recording must not report a stale error');
    assert.equal(instances[6].paused, false);
    audio.destroy();
    assert.equal(instances[6].paused, true);
  } finally {
    audio.destroy();
    if (originalAudio) globalThis.Audio = originalAudio;
    else Reflect.deleteProperty(globalThis, 'Audio');
  }
});
