import './youxi-game-v1.js';

export type YouxiUser = {
  id: string;
  nickname: string;
  avatarId?: string;
  revision?: number;
};

export type YouxiIdentity = {
  guest?: boolean;
  user?: YouxiUser | null;
};

export type YouxiSceneState = {
  sidebar: boolean;
  boss: boolean;
};

export type YouxiPanel = 'sidebar' | 'login' | 'instructions' | 'settings';

export type YouxiConnectOptions = {
  platformOrigin?: string;
  onIdentity?: (identity: YouxiIdentity) => void;
  onState?: (state: YouxiSceneState) => void;
  setTemporaryMuted?: (muted: boolean) => boolean;
  isRunning?: () => boolean;
};

export type YouxiPlatformHandle = {
  ready: () => void;
  open: (panel?: YouxiPanel) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YouxiGame?: {
      connect: (options: {
        platformOrigin: string;
        onIdentity?: (identity: YouxiIdentity) => void;
        onState?: (state: YouxiSceneState) => void;
        setTemporaryMuted?: (muted: boolean) => boolean;
        isRunning?: () => boolean;
      }) => YouxiPlatformHandle;
    };
  }
}

export const DEFAULT_PLATFORM_ORIGIN = 'https://scalia.ltd';

export function connectYouxiPlatform(options: YouxiConnectOptions): YouxiPlatformHandle | null {
  if (typeof window === 'undefined' || window.parent === window || !window.YouxiGame) {
    return null;
  }
  const platformOrigin = options.platformOrigin ?? DEFAULT_PLATFORM_ORIGIN;
  if (platformOrigin === window.location.origin) {
    return null;
  }
  try {
    return window.YouxiGame.connect({
      platformOrigin,
      onIdentity: options.onIdentity,
      onState: options.onState,
      setTemporaryMuted: options.setTemporaryMuted,
      isRunning: options.isRunning,
    });
  } catch {
    return null;
  }
}
