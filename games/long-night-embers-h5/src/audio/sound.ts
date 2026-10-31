export type SoundEffectName =
  | 'attack'
  | 'hit'
  | 'gem'
  | 'levelup'
  | 'chest'
  | 'evolution'
  | 'hurt'
  | 'unlock';

export class SoundController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private userMuted = false;
  private platformMuted = false;
  private sfxVolume = 0.7;
  private musicVolume = 0.5;

  private syncMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const effective = this.userMuted || this.platformMuted ? 0 : this.sfxVolume;
    this.masterGain.gain.value = effective;
    try {
      this.masterGain.gain.setValueAtTime(effective, this.ctx.currentTime);
    } catch {
      // Ignore if AudioContext is closed
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.userMuted || this.platformMuted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.syncMasterGain();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setUserAudioPreferences(prefs: {
    userMuted: boolean;
    sfxVolume: number;
    musicVolume: number;
  }): void {
    this.userMuted = prefs.userMuted;
    this.sfxVolume = Math.max(0, Math.min(1, prefs.sfxVolume));
    this.musicVolume = Math.max(0, Math.min(1, prefs.musicVolume));
    this.syncMasterGain();
  }

  public setPlatformTemporaryMute(muted: boolean): boolean {
    this.platformMuted = muted;
    this.syncMasterGain();
    return true;
  }

  public isEffectivelyMuted(): boolean {
    return this.userMuted || this.platformMuted || (this.sfxVolume <= 0 && this.musicVolume <= 0);
  }

  public play(effect: SoundEffectName): void {
    if (this.userMuted || this.platformMuted || this.sfxVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(this.masterGain);

    const now = ctx.currentTime;
    if (effect === 'gem') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.05);
      env.gain.setValueAtTime(0.14, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (effect === 'attack') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);
      env.gain.setValueAtTime(0.12, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (effect === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.07);
      env.gain.setValueAtTime(0.15, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (effect === 'levelup') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.06);
      osc.frequency.setValueAtTime(659, now + 0.12);
      env.gain.setValueAtTime(0.22, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (effect === 'chest' || effect === 'evolution') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.08);
      osc.frequency.setValueAtTime(784, now + 0.16);
      osc.frequency.setValueAtTime(1046, now + 0.24);
      env.gain.setValueAtTime(0.25, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (effect === 'hurt') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      env.gain.setValueAtTime(0.22, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (effect === 'unlock') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      env.gain.setValueAtTime(0.2, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  public destroy(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
