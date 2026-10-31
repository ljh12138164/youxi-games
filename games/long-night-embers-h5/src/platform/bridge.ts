import {
  DEFAULT_PLATFORM_ORIGIN,
  connectYouxiPlatform,
  type YouxiIdentity,
  type YouxiPlatformHandle,
} from '@shared/platform';
import type { SoundController } from '../audio/sound.ts';
import type { LongNightEmbersEngine } from '../core/engine.ts';

export class LongNightEmbersPlatformBridge {
  private handle: YouxiPlatformHandle | null = null;
  private identity: YouxiIdentity | null = null;
  private onIdentityListener?: (identity: YouxiIdentity | null) => void;
  private readySent = false;

  constructor(
    engine: LongNightEmbersEngine,
    sound: SoundController,
    onIdentityChange?: (identity: YouxiIdentity | null) => void,
    platformOrigin: string = DEFAULT_PLATFORM_ORIGIN,
  ) {
    this.onIdentityListener = onIdentityChange;
    this.handle = connectYouxiPlatform({
      platformOrigin,
      onIdentity: (id) => {
        this.identity = id;
        this.onIdentityListener?.(id);
      },
      onState: ({ sidebar, boss }) => {
        engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'sidebar', active: sidebar });
        engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'boss', active: boss });
      },
      setTemporaryMuted: (muted) => {
        return sound.setPlatformTemporaryMute(muted);
      },
      isRunning: () => {
        return engine.isRunning();
      },
    });
  }

  public notifyGameReady(): void {
    if (this.readySent) return;
    this.readySent = true;
    this.handle?.ready();
  }

  public getIdentity(): YouxiIdentity | null {
    return this.identity;
  }

  public openPanel(panel: 'sidebar' | 'login' | 'instructions' | 'settings' = 'sidebar'): void {
    this.handle?.open(panel);
  }

  public destroy(): void {
    this.handle?.destroy();
    this.handle = null;
  }
}
