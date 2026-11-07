export type TrackMeta = {
  id: number;
  title: string;
  subtitle: string;
  origin: string;
  mood: string;
  tempoMs: number;
  melody: number[];
  bass: number[];
  chords: number[][];
};

export const BUREAU_TRACKS: TrackMeta[] = [
  {
    id: 0,
    title: '雨夜值班室 · 裸体歌舞曲',
    subtitle: 'Gymnopédie No. 1 (Rainy Desk Edit)',
    origin: 'Erik Satie (1888 · 公有领域)',
    mood: '舒缓 · 雨夜阅卷',
    tempoMs: 360,
    melody: [66, 69, 67, 66, 61, 59, 61, 62, 57, 59, 61, 62, 66, 64, 62, 61],
    bass: [43, 43, 38, 38, 43, 43, 38, 38],
    chords: [
      [59, 62, 66],
      [57, 61, 66],
      [59, 62, 66],
      [57, 61, 64],
    ],
  },
  {
    id: 1,
    title: '月光下的旧档案',
    subtitle: 'Clair de Lune (Nocturne Lo-Fi)',
    origin: 'Claude Debussy (1905 · 公有领域)',
    mood: '静谧 · 线索比对',
    tempoMs: 340,
    melody: [69, 66, 64, 62, 64, 61, 57, 59, 61, 62, 64, 66, 69, 71, 69, 66],
    bass: [38, 45, 42, 35, 38, 40, 45, 38],
    chords: [
      [57, 62, 66],
      [54, 59, 62],
      [55, 59, 62],
      [57, 61, 64],
    ],
  },
  {
    id: 2,
    title: '街角路灯与蓝调',
    subtitle: 'Lin-Gang Midnight Blues',
    origin: '局内原创 (CC0 无版权)',
    mood: '微醺 · 深夜追查',
    tempoMs: 310,
    melody: [64, 67, 69, 71, 72, 71, 69, 67, 65, 69, 67, 64, 62, 64, 67, 64],
    bass: [45, 48, 50, 51, 52, 50, 48, 45],
    chords: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 67],
      [57, 60, 64, 69],
    ],
  },
  {
    id: 3,
    title: '雨滴前奏 · 窗台橘猫',
    subtitle: 'Raindrop Prelude Op. 28 No. 15',
    origin: 'Frédéric Chopin (1838 · 公有领域)',
    mood: '温润 · 笔记摘录',
    tempoMs: 330,
    melody: [64, 62, 60, 59, 60, 64, 67, 65, 64, 62, 60, 62, 64, 67, 64, 60],
    bass: [48, 48, 43, 43, 45, 45, 41, 43],
    chords: [
      [60, 64, 67],
      [59, 62, 67],
      [57, 60, 64],
      [55, 59, 62],
    ],
  },
  {
    id: 4,
    title: '迷雾追踪 · 哥德堡慢板',
    subtitle: 'Goldberg Aria (Detective Edit)',
    origin: 'J.S. Bach (1741 · 公有领域)',
    mood: '秩序 · 逻辑推理',
    tempoMs: 320,
    melody: [67, 67, 69, 71, 69, 67, 66, 62, 64, 67, 66, 64, 62, 60, 59, 62],
    bass: [43, 42, 40, 38, 36, 38, 42, 43],
    chords: [
      [59, 62, 67],
      [57, 62, 66],
      [55, 59, 64],
      [57, 60, 66],
    ],
  },
  {
    id: 5,
    title: '黎明前的归档柜',
    subtitle: 'Archive Room at Dawn',
    origin: '局内原创 (CC0 无版权)',
    mood: '明朗 · 结案发稿',
    tempoMs: 290,
    melody: [67, 71, 72, 74, 76, 74, 72, 71, 69, 72, 71, 67, 69, 71, 74, 72],
    bass: [48, 43, 45, 40, 41, 43, 48, 48],
    chords: [
      [60, 64, 67, 71],
      [57, 60, 64, 69],
      [53, 57, 60, 64],
      [55, 59, 62, 67],
    ],
  },
];

export class BureauAudio {
  private context: AudioContext | undefined;
  private output: GainNode | undefined;
  private filter: BiquadFilterNode | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private step = 0;
  private temporaryMuted = false;
  private paused = true;
  private briefing: HTMLAudioElement | undefined;
  private onBriefingError: (() => void) | undefined;
  private settings = { master: 0.6, music: 0.22, effects: 0.4, muted: false };
  track = 0;
  playing = true;

  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1850;
      this.output = this.context.createGain();
      this.filter.connect(this.output);
      this.output.connect(this.context.destination);
      this.scheduleNextBeat();
    }
    if (this.context.state === 'suspended') void this.context.resume();
    this.update(this.settings);
  }

  private scheduleNextBeat() {
    if (this.timer) clearTimeout(this.timer);
    const currentTrack = BUREAU_TRACKS[this.track % BUREAU_TRACKS.length] ?? BUREAU_TRACKS[0];
    this.timer = setTimeout(() => {
      this.beat();
      this.scheduleNextBeat();
    }, currentTrack.tempoMs);
  }

  update(settings: typeof this.settings) {
    this.settings = settings;
    if (this.briefing) {
      this.briefing.volume = settings.master;
      this.briefing.muted = settings.muted || this.temporaryMuted;
    }
    if (this.output && this.context) {
      this.output.gain.setTargetAtTime(
        settings.muted || this.temporaryMuted || this.paused ? 0 : settings.master,
        this.context.currentTime,
        0.03,
      );
    }
  }

  setPaused(paused: boolean) {
    const wasPaused = this.paused;
    this.paused = paused;
    if (paused) this.briefing?.pause();
    else if (wasPaused) this.resumeBriefing();
    this.update(this.settings);
  }

  setTemporaryMuted(muted: boolean) {
    this.temporaryMuted = muted;
    this.update(this.settings);
    return true;
  }

  private midiToFreq(midi: number) {
    return 440 * 2 ** ((midi - 69) / 12);
  }

  tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'triangle', detuneCents = 0) {
    if (!this.context || !this.filter || this.paused || this.temporaryMuted || this.settings.muted || volume <= 0.001) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detuneCents;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  click() {
    this.tone(480, 0.055, this.settings.effects * 0.09, 'triangle');
  }

  success() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) =>
      setTimeout(() => this.tone(n, 0.28, this.settings.effects * 0.11, 'triangle', 4), i * 95),
    );
  }

  private beat() {
    if (this.paused || !this.playing) return;
    const tr = BUREAU_TRACKS[this.track % BUREAU_TRACKS.length] ?? BUREAU_TRACKS[0];
    const s = this.step % 16;
    const note = tr.melody[s % tr.melody.length];

    // Electric piano lead (warm dual-detuned voices)
    this.tone(this.midiToFreq(note), 0.75, this.settings.music * 0.12, 'triangle', -4);
    this.tone(this.midiToFreq(note), 0.55, this.settings.music * 0.07, 'sine', 5);

    // Warm bass on every 2nd step
    if (s % 2 === 0) {
      const bassNote = tr.bass[Math.floor(s / 2) % tr.bass.length];
      this.tone(this.midiToFreq(bassNote), 1.15, this.settings.music * 0.15, 'sine');
    }

    // Soft chord pad on every 4th step
    if (s % 4 === 0) {
      const chord = tr.chords[Math.floor(s / 4) % tr.chords.length] ?? [];
      for (const cNote of chord) {
        this.tone(this.midiToFreq(cNote), 1.65, this.settings.music * 0.045, 'sine', 3);
      }
    }

    this.step++;
  }

  playBriefing(source: string, onError: () => void) {
    this.stopBriefing();
    const briefing = new Audio(source);
    this.briefing = briefing;
    this.onBriefingError = onError;
    briefing.onended = () => this.stopBriefing();
    briefing.onerror = () => this.failBriefing(briefing);
    this.update(this.settings);
    if (!this.paused) this.resumeBriefing();
  }

  private resumeBriefing() {
    const briefing = this.briefing;
    if (!briefing) return;
    void briefing.play().catch(error => {
      if (error.name !== 'AbortError') this.failBriefing(briefing);
    });
  }

  private failBriefing(briefing: HTMLAudioElement) {
    if (this.briefing !== briefing) return;
    const onError = this.onBriefingError;
    this.stopBriefing();
    onError?.();
  }

  stopBriefing() {
    if (this.briefing) {
      this.briefing.onended = null;
      this.briefing.onerror = null;
      this.briefing.pause();
      this.briefing.currentTime = 0;
      this.briefing = undefined;
    }
    this.onBriefingError = undefined;
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.stopBriefing();
    void this.context?.close();
  }
}
