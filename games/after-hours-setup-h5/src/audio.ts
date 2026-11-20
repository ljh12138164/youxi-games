export type NightTrackMeta = {
  id: number;
  file: string;
  title: string;
  subtitle: string;
  attribution: string;
};

/** 深夜维修台背景音乐曲目列表（真实钢琴录音 MP3） */
export const NIGHT_TRACKS: NightTrackMeta[] = [
  {
    id: 0,
    file: '01-gymnopedie.mp3',
    title: '深夜待机曲',
    subtitle: 'Satie · Gymnopédie No. 1',
    attribution: 'Kevin MacLeod (CC BY 3.0)',
  },
  {
    id: 1,
    file: '02-clair-de-lune.mp3',
    title: '凌晨两点的收件箱',
    subtitle: 'Debussy · Clair de Lune',
    attribution: 'Laurens Goedhart (CC BY 3.0)',
  },
  {
    id: 2,
    file: '03-raindrop.mp3',
    title: '窗外细雨与进度条',
    subtitle: 'Chopin · Op. 28 No. 15',
    attribution: 'Musopen (CC0 1.0)',
  },
  {
    id: 3,
    file: '04-goldberg-aria.mp3',
    title: '许可协议慢板',
    subtitle: 'Bach · Goldberg Aria',
    attribution: 'Kimiko Ishizaka (CC0 1.0)',
  },
];

/** Web Audio SFX + real studio piano MP3 background music controller. */
export class RetroAudio {
  private ctx: AudioContext | null = null;
  private sfxMaster: GainNode | null = null;

  private sources: Record<string, string> = {};
  private bgmEl: HTMLAudioElement | null = null;
  private bgmFile: string | null = null;
  private unlocked = false;

  private userMuted = false;
  private tempMuted = false;
  private paused = false;
  private musicEnabled = true;
  private trackIndex = 0;

  setTrackSources(sources: Record<string, string>) {
    this.sources = sources;
    this.syncBgm();
  }

  unlock() {
    this.unlocked = true;
    if (typeof window !== 'undefined' && window.AudioContext) {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.sfxMaster = this.ctx.createGain();
        this.sfxMaster.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    }
    this.syncGain();
  }

  setState(opts: {
    userMuted?: boolean;
    tempMuted?: boolean;
    paused?: boolean;
    musicEnabled?: boolean;
    trackIndex?: number;
  }) {
    if (opts.userMuted !== undefined) this.userMuted = opts.userMuted;
    if (opts.tempMuted !== undefined) this.tempMuted = opts.tempMuted;
    if (opts.paused !== undefined) this.paused = opts.paused;
    if (opts.musicEnabled !== undefined) this.musicEnabled = opts.musicEnabled;
    if (opts.trackIndex !== undefined) {
      const len = NIGHT_TRACKS.length;
      this.trackIndex = ((opts.trackIndex % len) + len) % len;
    }
    this.syncGain();
  }

  private isAudible(): boolean {
    return !this.userMuted && !this.tempMuted && !this.paused;
  }

  private isMusicAudible(): boolean {
    return this.isAudible() && this.musicEnabled;
  }

  private syncGain() {
    if (this.ctx && this.sfxMaster) {
      this.sfxMaster.gain.setTargetAtTime(this.isAudible() ? 0.14 : 0, this.ctx.currentTime, 0.02);
    }
    this.syncBgm();
  }

  private stopBgmElement() {
    if (!this.bgmEl) return;
    this.bgmEl.pause();
    this.bgmEl.src = '';
    this.bgmEl = null;
    this.bgmFile = null;
  }

  private syncBgm() {
    if (typeof Audio === 'undefined') return;
    const track = NIGHT_TRACKS[this.trackIndex % NIGHT_TRACKS.length] ?? NIGHT_TRACKS[0];
    const url = this.sources[track.file];
    if (!url) return;

    if (!this.bgmEl || this.bgmFile !== track.file) {
      this.stopBgmElement();
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      this.bgmEl = el;
      this.bgmFile = track.file;
    }

    const el = this.bgmEl;
    el.volume = 0.28;
    el.muted = !this.isMusicAudible();

    if (this.isMusicAudible() && this.unlocked) {
      if (el.paused) {
        void el.play().catch(() => {});
      }
    } else if (!el.paused) {
      el.pause();
    }
  }

  private ensureSfxContext(): { ctx: AudioContext; sfxMaster: GainNode } | null {
    if (!this.isAudible() || typeof window === 'undefined' || !window.AudioContext) return null;
    this.unlock();
    return this.ctx && this.sfxMaster ? { ctx: this.ctx, sfxMaster: this.sfxMaster } : null;
  }

  private playNotes(notes: Array<{ freq: number; delay: number; dur: number; type?: OscillatorType }>) {
    const audio = this.ensureSfxContext();
    if (!audio) return;
    const { ctx, sfxMaster } = audio;
    const now = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type ?? 'triangle';
      osc.frequency.setValueAtTime(n.freq, now + n.delay);
      gain.gain.setValueAtTime(0.42, now + n.delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.delay + n.dur);
      osc.connect(gain).connect(sfxMaster);
      osc.start(now + n.delay);
      osc.stop(now + n.delay + n.dur + 0.01);
    }
  }

  click() {
    this.playNotes([{ freq: 860, delay: 0, dur: 0.04, type: 'square' }]);
  }

  mail() {
    this.playNotes([
      { freq: 523.25, delay: 0, dur: 0.11 },
      { freq: 659.25, delay: 0.08, dur: 0.16 },
    ]);
  }

  money() {
    this.playNotes([
      { freq: 987.77, delay: 0, dur: 0.08, type: 'square' },
      { freq: 1318.51, delay: 0.07, dur: 0.22, type: 'triangle' },
    ]);
  }

  error() {
    this.playNotes([
      { freq: 240, delay: 0, dur: 0.14, type: 'sawtooth' },
      { freq: 185, delay: 0.12, dur: 0.24, type: 'sawtooth' },
    ]);
  }

  success() {
    this.playNotes([
      { freq: 523.25, delay: 0, dur: 0.1 },
      { freq: 659.25, delay: 0.08, dur: 0.1 },
      { freq: 783.99, delay: 0.16, dur: 0.12 },
      { freq: 1046.5, delay: 0.25, dur: 0.26 },
    ]);
  }

  destroy() {
    this.stopBgmElement();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.sfxMaster = null;
  }
}
