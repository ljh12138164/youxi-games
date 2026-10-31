import { CanvasSource, Texture } from 'pixi.js';
import { drawMonster } from './figures.ts';
import { drawApprovedCharacter, drawApprovedPortrait, drawApprovedItem, drawApprovedEnemy, drawApprovedPickup, drawApprovedProjectile } from './approvedArt.ts';

const dataUrlCache = new Map<string, string>();
const textureCache = new Map<string, Texture>();

function getCachedTexture(key: string, build: () => HTMLCanvasElement): Texture {
  const existing = textureCache.get(key);
  if (existing) return existing;
  const canvas = build();
  const source = new CanvasSource({
    resource: canvas,
    scaleMode: 'nearest',
  });
  const tex = new Texture({ source });
  textureCache.set(key, tex);
  return tex;
}

function getCachedDataUrl(key: string, build: () => HTMLCanvasElement): string {
  const existing = dataUrlCache.get(key);
  if (existing) return existing;
  const url = build().toDataURL();
  dataUrlCache.set(key, url);
  return url;
}

// ============================================================================
// 1. HIGH-DETAIL CHARACTER SPRITES (64x64 Canvas Illustration, Supports Silhouette)
// ============================================================================

interface CharAppearance {
  skin: string;
  hair: string;
  tunic: string;
  tunicSub: string;
  cape: string;
  boots: string;
  accent: string;
  pose: 'whip_warrior' | 'mage' | 'old_sage' | 'rogue' | 'skeleton' | 'reaper' | 'queen' | 'noble' | 'tree';
}

const CHAR_APPEARANCES: Record<string, CharAppearance> = {
  torchguard_torren: {
    skin: '#e8b48a',
    hair: '#2a1b12',
    tunic: '#4d7c4f',
    tunicSub: '#2563eb',
    cape: '#6b3410',
    boots: '#64748b',
    accent: '#eab308',
    pose: 'whip_warrior',
  },
  lampwright_mirelle: {
    skin: '#f5cba7',
    hair: '#d97706',
    tunic: '#7e22ce',
    tunicSub: '#3b0764',
    cape: '#b91c1c',
    boots: '#311042',
    accent: '#38bdf8',
    pose: 'mage',
  },
  runescribe_odessa: {
    skin: '#fdebd0',
    hair: '#b45309',
    tunic: '#1d4ed8',
    tunicSub: '#1e3a8a',
    cape: '#eab308',
    boots: '#1e293b',
    accent: '#7dd3fc',
    pose: 'mage',
  },
  quickblade_renzo: {
    skin: '#e5b887',
    hair: '#1e293b',
    tunic: '#334155',
    tunicSub: '#0f172a',
    cape: '#991b1b',
    boots: '#0f172a',
    accent: '#cbd5e1',
    pose: 'rogue',
  },
  emberpriest_cyra: {
    skin: '#e8b48a',
    hair: '#991b1b',
    tunic: '#9a3412',
    tunicSub: '#431407',
    cape: '#dc2626',
    boots: '#292524',
    accent: '#f97316',
    pose: 'mage',
  },
  stormcaller_iona: {
    skin: '#f1f5f9',
    hair: '#e2e8f0',
    tunic: '#1e293b',
    tunicSub: '#0f172a',
    cape: '#c026d3',
    boots: '#0f172a',
    accent: '#38bdf8',
    pose: 'noble',
  },
  herbwise_bode: {
    skin: '#ecc59c',
    hair: '#f8fafc',
    tunic: '#4d7c0f',
    tunicSub: '#78350f',
    cape: '#3f6212',
    boots: '#451a03',
    accent: '#a16207',
    pose: 'old_sage',
  },
  moonveil_velaine: {
    skin: '#fdebd0',
    hair: '#facc15',
    tunic: '#e2e8f0',
    tunicSub: '#94a3b8',
    cape: '#0284c7',
    boots: '#334155',
    accent: '#38bdf8',
    pose: 'mage',
  },
  starward_odd: {
    skin: '#e5b887',
    hair: '#cbd5e1',
    tunic: '#27272a',
    tunicSub: '#09090b',
    cape: '#7f1d1d',
    boots: '#09090b',
    accent: '#38bdf8',
    pose: 'old_sage',
  },
  vowkeeper_oswin: {
    skin: '#dc2626',
    hair: '#f8fafc',
    tunic: '#450a0a',
    tunicSub: '#18181b',
    cape: '#991b1b',
    boots: '#18181b',
    accent: '#facc15',
    pose: 'rogue',
  },
  voidwing_iris: {
    skin: '#fdebd0',
    hair: '#f472b6',
    tunic: '#be185d',
    tunicSub: '#831843',
    cape: '#eab308',
    boots: '#4c0519',
    accent: '#a855f7',
    pose: 'mage',
  },
  saintlight_nadia: {
    skin: '#fdebd0',
    hair: '#f472b6',
    tunic: '#be185d',
    tunicSub: '#831843',
    cape: '#eab308',
    boots: '#4c0519',
    accent: '#a855f7',
    pose: 'mage',
  },
  cleaver_bruna: {
    skin: '#f5cba7',
    hair: '#f8fafc',
    tunic: '#3f6212',
    tunicSub: '#1e293b',
    cape: '#be123c',
    boots: '#1e293b',
    accent: '#f43f5e',
    pose: 'rogue',
  },
  bonewright_ravel: {
    skin: '#f1f5f9',
    hair: '#cbd5e1',
    tunic: '#94a3b8',
    tunicSub: '#475569',
    cape: '#7f1d1d',
    boots: '#64748b',
    accent: '#ef4444',
    pose: 'skeleton',
  },
  ashmask_marrow: {
    skin: '#f8fafc',
    hair: '#991b1b',
    tunic: '#b91c1c',
    tunicSub: '#7f1d1d',
    cape: '#dc2626',
    boots: '#1c1917',
    accent: '#facc15',
    pose: 'reaper',
  },
  crown_seraphine: {
    skin: '#fdebd0',
    hair: '#fef08a',
    tunic: '#eab308',
    tunicSub: '#713f12',
    cape: '#6b21a8',
    boots: '#854d0e',
    accent: '#38bdf8',
    pose: 'queen',
  },
  pavilionsmith_orin: {
    skin: '#15803d',
    hair: '#166534',
    tunic: '#14532d',
    tunicSub: '#052e16',
    cape: '#22c55e',
    boots: '#78350f',
    accent: '#ef4444',
    pose: 'tree',
  },
};

function resolveAppearance(charId: string): CharAppearance {
  if (CHAR_APPEARANCES[charId]) return CHAR_APPEARANCES[charId]!;
  let hash = 0;
  for (let i = 0; i < charId.length; i++) {
    hash = (hash * 31 + charId.charCodeAt(i)) >>> 0;
  }
  const poses: CharAppearance['pose'][] = ['whip_warrior', 'mage', 'noble', 'rogue'];
  const palettes = [
    { tunic: '#2563eb', cape: '#b91c1c', hair: '#fbbf24' },
    { tunic: '#7e22ce', cape: '#eab308', hair: '#f8fafc' },
    { tunic: '#15803d', cape: '#0284c7', hair: '#f97316' },
    { tunic: '#be123c', cape: '#312e81', hair: '#e2e8f0' },
  ];
  const pal = palettes[hash % palettes.length]!;
  return {
    skin: '#f5cba7',
    hair: pal.hair,
    tunic: pal.tunic,
    tunicSub: '#1e293b',
    cape: pal.cape,
    boots: '#334155',
    accent: '#facc15',
    pose: poses[hash % poses.length]!,
  };
}

export const TORREN_PALETTE: Record<string, string | null> = {
  '.': null,
  '0': '#1f1610',
  '1': '#2e2118',
  '2': '#4a3525',
  '3': '#6b4e36',
  '4': '#8f6848',
  '5': '#b45309',
  '6': '#000000',
  '7': '#ffd2a6',
  '8': '#e8a87c',
  '9': '#9e1c32',
  'a': '#6b1022',
  'b': '#3d0712',
  'c': '#b07048',
  'd': '#f59e0b',
  'e': '#221d1a',
  'f': '#3d322c',
  'g': '#110f0e',
  'h': '#fbbf24',
};

export const TORREN_FRAME_STAND = [
  '..................................',
  '..................0110............',
  '.................025442...........',
  '................0111366...........',
  '...............61103676...........',
  '...........666666016876...........',
  '..........64499a9b16676666........',
  '..........6cc499a9b6c6bad6...66...',
  '..........677c49999abbbad66.6ef6..',
  '.........68778c49999bdbb26866gee6.',
  '........67788cbb4499a2bb26886ege6.',
  '.......6f67866aab4499ab26cc8g6666.',
  '.......6ef66.6a9abb44d2b66cgeeg66.',
  '......6eeeg6..699abbbbb6..66egg66.',
  '......6eeg6...6d4daaad6....6ggg6..',
  '.....6ege6....6d44222d6.....666...',
  '...66eeeg6...6a99a42db6...........',
  '..626eee66..6a999abbbbb6..........',
  '.6266ge646..6aa999abbaba6.........',
  '.6d..666d4.6a999999aaa99a6........',
  '.6d.....6d26666a999999a666........',
  '.6d.....26dffee66666666gee6.......',
  '.62d....264ffheeg6..6gggfhh6......',
  '..64....d64fghhh6....6fhhhgf6.....',
  '...64..d646gghhf6....6fhhhgf6.....',
  '....6444466egg66......66gge6......',
  '.....66662eeg6.........6gee6......',
  '........6deg6...........6ee6......',
  '.......dd6gg6...........6ee6......',
  '.......66ggg6...........6gee6.....',
  '........6efg6...........6gegf6....',
  '...66666eeee6666666666666egeee66..',
  '.66666666666666666666666666666666.',
  '..................................',
];

export const TORREN_FRAME_WALK_1 = [
  '..................0110............',
  '.................025442...........',
  '................0111366...........',
  '...............61103676...........',
  '...........6666660168766..........',
  '..........6499a9b61c676a66........',
  '..........6c499a9b6cc6aad6..66....',
  '.........687849999abbbbad666ef6...',
  '.........6777849999adbbbd686gee6..',
  '........6878cbb49999dab26c86ege6..',
  '.......6f6786aab44999a2b6ccg6666..',
  '.......6ef66.6aabb44d2b6.6geeg66..',
  '......6eeeg6..699abbbb6...6egg66..',
  '......6eeg6...6d44daa26...6ggg6...',
  '.....6ege6....6d44422d6....666....',
  '...66eeeg6...6a99a422d6...........',
  '..626eee66...6a999abbbb6..........',
  '.6266ge646..6bba999abbb6..........',
  '.6d..666d4..6a99999aaaa6..........',
  '.6d.....6d2.666a999999a6..........',
  '.6d.....26d.6ff666666666..........',
  '.62d....264.6fhhfee6ee6...........',
  '..64....d64.6fhghh66ff6...........',
  '...64..d646.6ggghf6fhff6..........',
  '....644446..6eeg666fh6f6..........',
  '.....66662..6eeg6666666...........',
  '........6d..6eg6.66666............',
  '.......dd6..6gg6.66g6.............',
  '.......66..6ggg6.66e6.............',
  '...........6gef6.6gee6............',
  '...........6eee6.66ege6...........',
  '...6666666666ee666g6eee666666666..',
  '.66666666666666666666666666666666.',
  '..................................',
];

export const TORREN_FRAME_WALK_2 = [
  '..................................',
  '..................................',
  '..................0110............',
  '.................023442...........',
  '................0111566...........',
  '...............61105676...........',
  '...........666666016876666........',
  '..........6499a9ab1c676946........',
  '..........6499a99bbcc6a946666.....',
  '.........68c49999abbbbaad6ffe6....',
  '.........677c49999a4baaad6eee6....',
  '........687ccb49999daaad66geeg6...',
  '.......6f6886bb449999adb6c666g6...',
  '.......6fg66.6bbb44dddb66c6gge6...',
  '.......6eeg6..699abbbb6..66ggg6...',
  '......6eee6...6d444daa6...6ggg6...',
  '.....6geeg6...6d444d226....666....',
  '....6eegg6...6a9999dbb6...........',
  '...66ee6g6...6a99999abb6..........',
  '..626e64g6..6bbaa9999ab6..........',
  '..62.66d4...6bb999aabbb6..........',
  '..62...642..666a999999a6..........',
  '..62...642..6gg666666666..........',
  '..6d...642..6fggg6gfhhf6..........',
  '..6d2..646.6fffee6fhhhgf6.........',
  '...6d..2d6.6ffeeg6fhhhgf6.........',
  '....6d4d6..6g6eege66gge6..........',
  '.....6662..6eg6666.6gee6..........',
  '.......6d.6eg66.....6ee6..........',
  '.......d6.6gg6......6ee6..........',
  '.......6.66g66......6egg6.........',
  '.........6g6666.....6gefe6........',
  '...666666666ggg666666eeee6666666..',
  '.66666666666666666666666666666666.',
];

export const TORREN_FRAME_WALK_3 = [
  '..................................',
  '..................0110............',
  '.................023442...........',
  '................0111566...........',
  '...............61105676...........',
  '...........6666660168766..........',
  '..........6499a9b61c676a66........',
  '..........6c499a9b6cc6aad6.666....',
  '.........687849999abbbbad66ffe6...',
  '.........6777849999adbbbd66eee6...',
  '........6878cbb49999dab26c6geeg6..',
  '.......6f6786aab44999a2b6cc666g6..',
  '.......6fg66.6aabb44d2b6.6c6gge6..',
  '.......6eeg6..699abbbb6...66ggg6..',
  '......6eee6...6d44daa26....6ggg6..',
  '.....6geeg6...6d44422d6.....666...',
  '....6eegg6...6a99a4bbd6...........',
  '...66ee6g6...69999abbbb6..........',
  '..626e64g6...699999abbbb6.........',
  '..62.66d4....6aa999abbba6.........',
  '..62...642...6a9999999a66.........',
  '..62...642....666666666e6.........',
  '..6d...642.....6geeee6ff6.........',
  '..6d2..646....6fhhhff6ge6.........',
  '...6d..2d6....6fhhgff6ge6.........',
  '....6d4d6.....6fhggf6666..........',
  '.....6662.....66ggg6g6............',
  '.......6d.....6ggg6g6.............',
  '.......d6.....6ee66g6.............',
  '.......6......6ee6666.............',
  '.............6egg66gg6............',
  '.............6gefe6gg6............',
  '...66666666666eeee66666666666666..',
  '.66666666666666666666666666666666.',
];


function renderAsciiSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  palette: Record<string, string | null>,
  offsetX: number,
  offsetY: number,
  scale = 1,
): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      const color = palette[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(offsetX + x * scale),
          Math.floor(offsetY + y * scale),
          Math.ceil(scale),
          Math.ceil(scale),
        );
      }
    }
  }
}

function drawCharacterCanvas(
  charId: string,
  frame = 0,
  silhouette = false,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  const f = frame % 4;
  const frames = [
    TORREN_FRAME_STAND,
    TORREN_FRAME_WALK_1,
    TORREN_FRAME_STAND,
    TORREN_FRAME_WALK_2,
  ];
  const matrix = frames[f] ?? TORREN_FRAME_STAND;

  if (drawApprovedCharacter(ctx, charId, f)) {
    // User-approved bitmap art; unapproved characters retain their existing appearance.
  } else if (charId === 'torchguard_torren') {
    // 托伦（火炬守卫）专属长夜余烬原创像素骑士配色（深红战袍/暗夜斗篷/暖栗发色/琥珀金饰）
    renderAsciiSprite(ctx, matrix, TORREN_PALETTE, 15, 15, 1);
  } else {
    // 其他角色：根据 CHAR_APPEARANCES 动态换色，保持 16-bit 像素步态连贯一致
    const app = resolveAppearance(charId);
    const dynamicPalette: Record<string, string | null> = {
      ...TORREN_PALETTE,
      '0': app.cape,
      '1': app.hair,
      '2': app.hair,
      '3': app.accent,
      '4': app.accent,
      '5': app.hair,
      '7': app.skin,
      '8': app.skin,
      '9': app.tunic,
      'a': app.tunicSub,
      'b': app.cape,
      'c': app.skin,
      'd': app.accent,
      'e': app.boots,
      'f': app.boots,
      'g': '#110f0e',
      'h': app.accent,
    };
    renderAsciiSprite(ctx, matrix, dynamicPalette, 15, 15, 1);
  }

  if (silhouette) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, 64, 64);
    ctx.restore();
  }

  return canvas;
}

export function getCharacterTexture(charId: string, frame = 0): Texture {
  const f = frame % 4;
  return getCachedTexture(`charHi:${charId}:${f}`, () =>
    drawCharacterCanvas(charId, f, false),
  );
}

function drawCharacterPortraitCanvas(charId: string, locked = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 68;
  canvas.height = 68;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  const matrix = TORREN_FRAME_STAND;

  if (drawApprovedPortrait(ctx, charId)) {
    // Portrait and battlefield use the same approved source.
  } else if (charId === 'torchguard_torren') {
    renderAsciiSprite(ctx, matrix, TORREN_PALETTE, 0, 0, 2);
  } else {
    const app = resolveAppearance(charId);
    const dynamicPalette: Record<string, string | null> = {
      ...TORREN_PALETTE,
      '0': app.cape,
      '1': app.hair,
      '2': app.hair,
      '3': app.accent,
      '4': app.accent,
      '5': app.hair,
      '7': app.skin,
      '8': app.skin,
      '9': app.tunic,
      'a': app.tunicSub,
      'b': app.cape,
      'c': app.skin,
      'd': app.accent,
      'e': app.boots,
      'f': app.boots,
      'g': '#110f0e',
      'h': app.accent,
    };
    renderAsciiSprite(ctx, matrix, dynamicPalette, 0, 0, 2);
  }

  if (locked) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, 68, 68);
    ctx.restore();
  }

  return canvas;
}

export function getCharacterPortraitUrl(charId: string, locked = false): string {
  return getCachedDataUrl(`charHiUrl:${charId}:${locked ? 'lock' : 'open'}`, () =>
    drawCharacterPortraitCanvas(charId, locked),
  );
}

// ============================================================================
// 2. 精细武器与被动图标（48x48 画布绘制）
// ============================================================================

function drawItemIconCanvas(itemId: string, background = true): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  const id = itemId.toLowerCase();

  // 辅助函数：在 24x24 像素网格上以 scale=2 (48x48) 绘制单个像素
  function p(x: number, y: number, color: string): void {
    if (x < 0 || x >= 24 || y < 0 || y >= 24) return;
    ctx!.fillStyle = color;
    ctx!.fillRect(x * 2, y * 2, 2, 2);
  }

  function rect(x: number, y: number, w: number, h: number, color: string): void {
    if (!background && color === '#0a0d14') {
      ctx!.clearRect(x * 2, y * 2, w * 2, h * 2);
      return;
    }
    ctx!.fillStyle = color;
    ctx!.fillRect(x * 2, y * 2, w * 2, h * 2);
  }

  // 槽位暗黑基底
  if (background) {
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, 48, 48);
  }

  if (drawApprovedItem(ctx, itemId)) return canvas;

  // --------------------------------------------------------------------------
  // 1. 进阶超武 (EVOLVED WEAPONS) - 优先匹配，防止被基础词拦截
  // --------------------------------------------------------------------------
  if (id.includes('bloody_tear') || id.includes('tear')) {
    // 血泪：带倒刺荆棘的深红血鞭，尖端凝聚猩红血滴与鲜血高光
    rect(3, 17, 3, 5, '#1e1b4b');
    rect(3, 16, 3, 1, '#dc2626');
    const tearPix: [number, number][] = [
      [5,16],[6,15],[7,14],[8,13],[9,11],[10,9],[12,7],[14,6],[16,6],[18,7],[19,9],[20,11],[20,13],
      [19,15],[18,17],[16,18],[14,19],[12,19],[10,18],[9,17],[8,15],[9,13],[11,11],[13,10],[15,10]
    ];
    tearPix.forEach(([x, y]) => {
      p(x, y, '#dc2626');
      p(x + 1, y, '#7f1d1d');
    });
    p(10, 8, '#fca5a5'); p(18, 6, '#fca5a5'); p(21, 12, '#fca5a5'); p(13, 18, '#fca5a5');
    // 凝聚血珠
    rect(13, 12, 3, 4, '#ef4444');
    p(14, 11, '#ffffff');
    p(14, 16, '#dc2626');
    p(14, 18, '#b91c1c');
  }
  else if (id.includes('holy_wand')) {
    // 神圣魔杖：金翼包覆的华贵法杖，顶部镶嵌十字纯白神圣星芒
    for (let i = 0; i < 14; i++) {
      p(5 + i, 19 - i, '#f59e0b');
      p(4 + i, 19 - i, '#b45309');
    }
    rect(16, 3, 7, 7, '#fef08a');
    rect(17, 4, 5, 5, '#ffffff');
    p(14, 7, '#f59e0b'); p(13, 6, '#fde047'); p(12, 5, '#ffffff');
    p(22, 11, '#f59e0b'); p(21, 12, '#fde047'); p(20, 13, '#ffffff');
  }
  else if (id.includes('thousand_edge') || id.includes('thousand')) {
    // 千刃：三柄破空而出的银蓝锋刃，带流线型金色符文与破空残影
    rect(10, 8, 9, 3, '#cbd5e1');
    p(19, 9, '#ffffff'); p(8, 8, '#b45309'); p(8, 9, '#f59e0b'); p(8, 10, '#b45309');
    rect(6, 13, 11, 3, '#94a3b8');
    p(17, 14, '#f8fafc'); p(4, 13, '#b45309'); p(4, 14, '#f59e0b'); p(4, 15, '#b45309');
    rect(8, 18, 7, 3, '#64748b');
    p(15, 19, '#e2e8f0'); p(6, 18, '#b45309'); p(6, 19, '#f59e0b'); p(6, 20, '#b45309');
    p(12, 9, '#38bdf8'); p(9, 14, '#38bdf8');
  }
  else if (id.includes('death_spiral') || id.includes('spiral')) {
    // 死亡螺旋：骷髅雕饰的漆黑巨镰战斧，环绕 9 道猩红与暗影刀风
    rect(4, 18, 2, 4, '#78350f');
    rect(6, 15, 2, 4, '#78350f');
    rect(8, 12, 2, 4, '#78350f');
    rect(10, 9, 2, 4, '#78350f');
    // 双刃暗影斧刃
    rect(9, 5, 6, 4, '#334155');
    rect(8, 3, 8, 2, '#64748b');
    rect(15, 4, 3, 6, '#94a3b8');
    p(18, 5, '#f8fafc'); p(17, 7, '#f8fafc'); p(16, 9, '#f8fafc');
    rect(6, 7, 3, 6, '#94a3b8');
    p(5, 7, '#f8fafc'); p(6, 9, '#f8fafc');
    // 骷髅核心与猩红眼眸
    p(11, 7, '#f1f5f9'); p(12, 7, '#f1f5f9');
    p(11, 8, '#dc2626'); p(12, 8, '#dc2626');
  }
  else if (id.includes('heaven_sword') || id.includes('heaven')) {
    // 天堂之剑：金色剑柄、双刃圣光环绕的巨剑，散发旋转光羽
    for (let i = 0; i < 15; i++) {
      p(4 + i, 19 - i, '#cbd5e1');
      p(5 + i, 19 - i, '#f8fafc');
      p(5 + i, 20 - i, '#94a3b8');
    }
    p(19, 4, '#ffffff'); p(20, 3, '#ffffff');
    p(5, 17, '#f59e0b'); p(6, 16, '#fbbf24'); p(7, 15, '#f59e0b');
    p(3, 19, '#b45309'); p(2, 20, '#78350f');
    // 翠绿与天金光羽
    p(8, 7, '#4ade80'); p(16, 15, '#4ade80');
    p(10, 5, '#fde047'); p(18, 13, '#fde047');
  }
  else if (id.includes('unholy_vespers') || id.includes('vespers')) {
    // 不洁晚祷：暗紫与血红封面的远古禁忌魔典，散发旋转的奥术符文环
    rect(5, 6, 14, 13, '#581c87');
    rect(6, 5, 12, 13, '#7e22ce');
    rect(7, 6, 10, 11, '#3b0764');
    // 封面符文
    rect(11, 8, 2, 7, '#e879f9');
    rect(9, 10, 6, 2, '#e879f9');
    p(11, 11, '#ffffff');
    // 书页边缘与血色书签
    rect(17, 7, 2, 10, '#fef08a');
    rect(12, 17, 2, 4, '#ef4444');
    p(12, 21, '#dc2626');
  }
  else if (id.includes('hellfire')) {
    // 地狱火：燃烧着烈焰魔瞳的黑曜石魔杖，喷射出赤红灼热巨龙火球
    for (let i = 0; i < 10; i++) {
      p(4 + i, 19 - i, '#451a03');
      p(3 + i, 19 - i, '#1c1917');
    }
    // 烈焰魔球
    rect(12, 4, 8, 8, '#ea580c');
    rect(13, 5, 6, 6, '#f97316');
    rect(14, 6, 4, 4, '#fde047');
    rect(15, 7, 2, 2, '#ffffff');
    // 火舌跳跃
    p(11, 3, '#ef4444'); p(15, 2, '#f97316'); p(20, 5, '#ef4444');
    p(21, 10, '#ea580c'); p(18, 13, '#dc2626');
  }
  else if (id.includes('soul_eater')) {
    // 噬魂者：幽魂黑心与噬魂魔口，向外释放深黑与惨绿的摄魂波动
    rect(7, 7, 10, 10, '#064e3b');
    rect(8, 8, 8, 8, '#047857');
    rect(9, 9, 6, 6, '#10b981');
    rect(10, 10, 4, 4, '#022c22');
    p(11, 11, '#6ee7b7'); p(12, 11, '#6ee7b7');
    // 幽魂獠牙
    p(9, 8, '#a7f3d0'); p(14, 8, '#a7f3d0');
    p(9, 15, '#a7f3d0'); p(14, 15, '#a7f3d0');
  }
  else if (id.includes('la_borra') || id.includes('borra')) {
    // 拉·波拉：神圣圣杯与环形流动的水波，泛着幽蓝冰火光华
    rect(7, 6, 10, 9, '#0284c7');
    rect(8, 5, 8, 9, '#38bdf8');
    rect(9, 6, 6, 6, '#bae6fd');
    rect(10, 7, 4, 3, '#ffffff');
    // 杯座
    rect(10, 15, 4, 3, '#0369a1');
    rect(8, 18, 8, 2, '#075985');
    // 旋转水滴
    p(4, 9, '#7dd3fc'); p(19, 9, '#7dd3fc');
    p(5, 14, '#38bdf8'); p(18, 14, '#38bdf8');
  }
  else if (id.includes('no_future') || id.includes('future')) {
    // 无未来：棱角分明的反物质晶体棱镜，受到冲击时爆裂出青紫脉冲
    rect(7, 7, 10, 10, '#312e81');
    rect(8, 8, 8, 8, '#4338ca');
    rect(9, 9, 6, 6, '#6366f1');
    rect(10, 10, 4, 4, '#a5b4fc');
    p(11, 11, '#ffffff'); p(12, 11, '#ffffff');
    // 脉冲刺
    p(11, 3, '#c7d2fe'); p(12, 3, '#c7d2fe');
    p(11, 20, '#c7d2fe'); p(12, 20, '#c7d2fe');
    p(3, 11, '#c7d2fe'); p(3, 12, '#c7d2fe');
    p(20, 11, '#c7d2fe'); p(20, 12, '#c7d2fe');
  }
  else if (id.includes('thunder_loop') || id.includes('loop')) {
    // 雷霆环：双层交织的雷神金环，激荡着高压深紫与亮青色电弧
    rect(6, 6, 12, 12, '#7e22ce');
    rect(8, 8, 8, 8, '#0a0d14');
    rect(7, 7, 10, 10, '#a855f7');
    rect(9, 9, 6, 6, '#0a0d14');
    // 闪电交错
    p(11, 4, '#fde047'); p(12, 5, '#ffffff'); p(11, 6, '#fde047');
    p(18, 11, '#38bdf8'); p(19, 12, '#ffffff'); p(18, 13, '#38bdf8');
    p(11, 18, '#fde047'); p(12, 19, '#ffffff'); p(11, 20, '#fde047');
    p(5, 11, '#38bdf8'); p(4, 12, '#ffffff'); p(5, 13, '#38bdf8');
  }
  else if (id.includes('gorgeous_moon') || id.includes('moon')) {
    // 华丽之月：散发白银与梦幻炫紫光环的满月，伴随群星月晕
    rect(6, 6, 12, 12, '#581c87');
    rect(7, 7, 10, 10, '#c084fc');
    rect(8, 8, 8, 8, '#f3e8ff');
    rect(9, 9, 6, 6, '#ffffff');
    // 月晕星点
    p(12, 3, '#fef08a'); p(3, 12, '#fef08a');
    p(20, 12, '#fef08a'); p(12, 20, '#fef08a');
    p(6, 6, '#ffffff'); p(17, 6, '#ffffff');
    p(6, 17, '#ffffff'); p(17, 17, '#ffffff');
  }
  else if (id.includes('photonstorm') || id.includes('phaser')) {
    // 相位激光/光子风暴：霓虹紫粉高能发射棱柱晶体
    rect(6, 6, 12, 12, '#4a044e');
    rect(7, 7, 10, 10, '#a21caf');
    rect(8, 8, 8, 8, '#f472b6');
    rect(10, 10, 4, 4, '#ffffff');
    p(11, 4, '#38bdf8'); p(12, 4, '#38bdf8'); p(11, 19, '#38bdf8'); p(12, 19, '#38bdf8');
    p(4, 11, '#38bdf8'); p(4, 12, '#38bdf8'); p(19, 11, '#38bdf8'); p(19, 12, '#38bdf8');
  }
  else if (id.includes('vandalier')) {
    // 毁灭者：黑白双羽交织的阴阳凤凰鸟
    rect(8, 6, 4, 11, '#ffffff');
    rect(12, 6, 4, 11, '#3b0764');
    p(9, 4, '#fde047'); p(14, 4, '#9333ea');
    p(4, 7, '#fef08a'); p(5, 8, '#ffffff'); p(6, 9, '#ffffff');
    p(19, 7, '#c084fc'); p(18, 8, '#9333ea'); p(17, 9, '#581c87');
  }
  else if (id.includes('crimson_shroud')) {
    // 绯红裹尸布：镶嵌血月宝石的刺绣战袍，散发鲜血红光
    rect(6, 5, 12, 14, '#7f1d1d');
    rect(7, 6, 10, 12, '#b91c1c');
    rect(8, 7, 8, 10, '#dc2626');
    p(11, 9, '#fde047'); p(12, 9, '#fde047');
    rect(11, 10, 2, 4, '#ef4444');
    p(11, 15, '#ffffff'); p(12, 15, '#ffffff');
  }
  else if (id.includes('infinite_corridor')) {
    // 无尽回廊：金色永恒时钟，刻印着无限符号
    rect(6, 6, 12, 12, '#b45309');
    rect(7, 7, 10, 10, '#f59e0b');
    rect(8, 8, 8, 8, '#0a0d14');
    rect(9, 10, 6, 3, '#38bdf8');
    p(11, 11, '#ffffff'); p(12, 11, '#ffffff');
  }

  // --------------------------------------------------------------------------
  // 2. 基础主动武器 (BASE ACTIVE WEAPONS)
  // --------------------------------------------------------------------------
  else if (id.includes('whip')) {
    // 经典皮革皮鞭：棕褐色缠绕鞭身，黄铜扣环手柄
    rect(3, 17, 3, 5, '#78350f');
    rect(3, 16, 3, 1, '#d97706');
    const whipPix: [number, number][] = [
      [5,16],[6,15],[7,14],[8,13],[9,11],[10,9],[12,7],[14,6],[16,6],[18,7],[19,9],[20,11],[20,13],
      [19,15],[18,17],[16,18],[14,19],[12,19],[10,18],[9,17],[8,15],[9,13],[11,11],[13,10]
    ];
    whipPix.forEach(([x, y]) => {
      p(x, y, '#d97706');
      p(x + 1, y, '#92400e');
    });
    p(14, 6, '#fde047'); p(18, 7, '#fde047');
  }
  else if (id.includes('magic_wand')) {
    // 魔法杖：青蓝法杖镶嵌奥术宝珠
    for (let i = 0; i < 13; i++) {
      p(5 + i, 19 - i, '#475569');
      p(4 + i, 19 - i, '#1e293b');
    }
    rect(16, 4, 6, 6, '#0284c7');
    rect(17, 5, 4, 4, '#38bdf8');
    p(18, 6, '#ffffff'); p(19, 6, '#ffffff');
  }
  else if (id.includes('knife')) {
    // 飞刀：银质反光短刃配皮质护手
    for (let i = 0; i < 12; i++) {
      p(6 + i, 18 - i, '#cbd5e1');
      p(7 + i, 18 - i, '#f8fafc');
    }
    p(18, 6, '#ffffff'); p(19, 5, '#ffffff');
    p(7, 18, '#b45309'); p(6, 19, '#78350f'); p(5, 20, '#451a03');
  }
  else if (id.includes('axe')) {
    // 战斧：粗犷精钢双刃斧配木柄
    rect(5, 17, 3, 5, '#78350f');
    rect(7, 14, 3, 4, '#78350f');
    rect(9, 11, 3, 4, '#78350f');
    rect(11, 8, 3, 4, '#78350f');
    rect(13, 5, 3, 4, '#78350f');
    // 双侧弧形斧刃
    rect(11, 3, 7, 5, '#64748b');
    p(18, 3, '#e2e8f0'); p(17, 4, '#e2e8f0'); p(18, 5, '#e2e8f0'); p(17, 6, '#e2e8f0');
    rect(10, 7, 4, 4, '#475569');
  }
  else if (id.includes('cross')) {
    // 纯金十字架：神圣十字回旋标
    rect(10, 4, 4, 16, '#ca8a04');
    rect(11, 5, 2, 14, '#fde047');
    rect(4, 9, 16, 4, '#ca8a04');
    rect(5, 10, 14, 2, '#fde047');
    p(11, 10, '#ffffff'); p(12, 10, '#ffffff'); p(11, 11, '#ffffff'); p(12, 11, '#ffffff');
  }
  else if (id.includes('king_bible') || id.includes('bible')) {
    // 国王圣经：深蓝硬皮封面的远古圣经，刻印金色十字
    rect(5, 5, 14, 14, '#1e3a8a');
    rect(6, 6, 12, 12, '#1d4ed8');
    rect(11, 8, 2, 8, '#fde047');
    rect(9, 10, 6, 2, '#fde047');
    p(11, 10, '#ffffff'); p(12, 10, '#ffffff');
    rect(17, 7, 2, 10, '#fef08a');
  }
  else if (id.includes('fire_wand')) {
    // 火焰魔杖：红木手杖镶嵌跳跃火晶
    for (let i = 0; i < 11; i++) {
      p(5 + i, 19 - i, '#78350f');
      p(4 + i, 19 - i, '#451a03');
    }
    rect(15, 4, 6, 6, '#ea580c');
    rect(16, 5, 4, 4, '#f97316');
    p(17, 6, '#fde047'); p(18, 6, '#ffffff');
    p(14, 3, '#ef4444'); p(21, 8, '#ef4444');
  }
  else if (id.includes('garlic')) {
    // 大蒜：洁白饱满的蒜瓣与青绿蒜苗
    rect(7, 9, 10, 10, '#cbd5e1');
    rect(8, 8, 8, 10, '#f8fafc');
    rect(9, 9, 6, 8, '#ffffff');
    p(11, 6, '#86efac'); p(12, 5, '#4ade80'); p(12, 4, '#22c55e');
    p(9, 13, '#e2e8f0'); p(14, 13, '#e2e8f0');
  }
  else if (id.includes('santa_water') || id.includes('water')) {
    // 圣水瓶：装有晶莹圣水的深蓝玻璃烧瓶，带软木塞
    rect(10, 4, 4, 3, '#78350f');
    rect(10, 7, 4, 3, '#38bdf8');
    rect(7, 10, 10, 10, '#0284c7');
    rect(8, 11, 8, 8, '#38bdf8');
    rect(9, 13, 6, 5, '#bae6fd');
    p(9, 12, '#ffffff'); p(10, 12, '#ffffff');
  }
  else if (id.includes('runetracer')) {
    // 符文追踪器：悬浮的碧蓝发光符文棱形宝石
    rect(11, 4, 2, 16, '#0284c7');
    rect(4, 11, 16, 2, '#0284c7');
    rect(8, 8, 8, 8, '#0ea5e9');
    rect(9, 9, 6, 6, '#38bdf8');
    rect(10, 10, 4, 4, '#ffffff');
  }
  else if (id.includes('lightning_ring') || id.includes('ring')) {
    // 闪电戒指：镶嵌电光天青石的黄铜指环
    rect(6, 7, 12, 11, '#b45309');
    rect(8, 9, 8, 7, '#0a0d14');
    rect(7, 8, 10, 9, '#f59e0b');
    rect(8, 9, 8, 7, '#0a0d14');
    rect(10, 5, 4, 4, '#38bdf8');
    p(11, 6, '#ffffff'); p(12, 6, '#ffffff');
  }
  else if (id.includes('pentagram')) {
    // 五芒星：刻印在紫水晶圆盘上的金色神圣五角星
    rect(5, 5, 14, 14, '#581c87');
    rect(6, 6, 12, 12, '#7e22ce');
    // 五角星连线
    p(11, 7, '#fde047'); p(12, 7, '#fde047');
    p(8, 14, '#fde047'); p(15, 14, '#fde047');
    p(7, 10, '#fde047'); p(16, 10, '#fde047');
    p(11, 11, '#ffffff'); p(12, 11, '#ffffff');
  }
  else if (id.includes('peachone') || id.includes('white_pigeon')) {
    // 白鸽：纯洁无瑕的圣白飞鸽
    rect(9, 7, 6, 7, '#ffffff');
    rect(8, 8, 8, 5, '#f8fafc');
    p(10, 5, '#ffffff'); p(11, 5, '#ffffff'); p(12, 5, '#f59e0b');
    p(5, 7, '#ffffff'); p(6, 8, '#ffffff'); p(7, 9, '#ffffff');
    p(18, 7, '#ffffff'); p(17, 8, '#ffffff'); p(16, 9, '#ffffff');
    p(10, 14, '#cbd5e1'); p(11, 15, '#cbd5e1'); p(12, 15, '#cbd5e1');
  }
  else if (id.includes('ebony_wings') || id.includes('black_bird')) {
    // 黑翼：幽邃紫羽的暗夜玄鸦
    rect(9, 7, 6, 7, '#1e1b4b');
    rect(8, 8, 8, 5, '#0f172a');
    p(10, 5, '#1e1b4b'); p(11, 5, '#1e1b4b'); p(12, 5, '#ef4444');
    p(5, 7, '#7c3aed'); p(6, 8, '#4c1d95'); p(7, 9, '#1e1b4b');
    p(18, 7, '#7c3aed'); p(17, 8, '#4c1d95'); p(16, 9, '#1e1b4b');
    p(10, 14, '#0f172a'); p(11, 15, '#0f172a'); p(12, 15, '#0f172a');
  }
  else if (id.includes('bone')) {
    // 骨头：古老交错的惨白腿骨
    p(6, 6, '#f1f5f9'); p(7, 6, '#f1f5f9'); p(6, 7, '#f1f5f9');
    p(16, 16, '#f1f5f9'); p(17, 16, '#f1f5f9'); p(17, 17, '#f1f5f9');
    for (let i = 0; i < 9; i++) p(7 + i, 7 + i, '#cbd5e1');
    p(16, 6, '#f1f5f9'); p(17, 6, '#f1f5f9'); p(17, 7, '#f1f5f9');
    p(6, 16, '#f1f5f9'); p(6, 17, '#f1f5f9'); p(7, 17, '#f1f5f9');
    for (let i = 0; i < 9; i++) p(16 - i, 7 + i, '#cbd5e1');
    p(11, 11, '#94a3b8'); p(12, 12, '#94a3b8');
  }
  else if (id.includes('bracelet')) {
    // 手镯：镶嵌三色原石的古代战镯
    rect(6, 7, 12, 11, '#ca8a04');
    rect(8, 9, 8, 7, '#0a0d14');
    rect(7, 8, 10, 9, '#eab308');
    rect(8, 9, 8, 7, '#0a0d14');
    p(11, 6, '#ef4444'); p(12, 6, '#f97316');
    p(6, 12, '#3b82f6'); p(17, 12, '#10b981');
    p(11, 18, '#a855f7');
  }
  else if (id.includes('song_of_mana') || id.includes('mannajja')) {
    // 法力之歌：共鸣天琴音律柱
    rect(11, 4, 3, 16, '#fbbf24');
    p(10, 5, '#d97706'); p(13, 5, '#d97706');
    p(8, 9, '#38bdf8'); p(15, 9, '#38bdf8');
    p(6, 12, '#60a5fa'); p(17, 12, '#60a5fa');
    p(7, 15, '#93c5fd'); p(16, 15, '#93c5fd');
    p(12, 3, '#ffffff');
  }
  else if (id.includes('gaze_of_gaea')) {
    // 盖亚凝视：基岩中的苍翠魔眼
    rect(7, 5, 10, 14, '#3f3f46');
    rect(8, 6, 8, 12, '#52525b');
    rect(9, 9, 6, 6, '#059669');
    rect(10, 10, 4, 4, '#34d399');
    p(11, 11, '#ffffff'); p(12, 11, '#ffffff');
  }
  else if (id.includes('laurel')) {
    // 月桂：翠绿的胜利月桂叶冠
    for (let i = 0; i < 7; i++) {
      p(6 + (i > 3 ? 6 - i : i), 6 + i * 2, '#15803d');
      p(7 + (i > 3 ? 6 - i : i), 6 + i * 2, '#22c55e');
      p(17 - (i > 3 ? 6 - i : i), 6 + i * 2, '#15803d');
      p(16 - (i > 3 ? 6 - i : i), 6 + i * 2, '#22c55e');
    }
    p(11, 17, '#fde047'); p(12, 17, '#fde047');
  }
  else if (id.includes('clock_lancet') || id.includes('lancet')) {
    // 时钟柳叶刀：带有罗马指针的古朴怀表
    rect(6, 6, 12, 12, '#b45309');
    rect(7, 7, 10, 10, '#fef08a');
    rect(8, 8, 8, 8, '#ffffff');
    p(11, 4, '#b45309'); p(12, 4, '#b45309');
    // 指针
    p(11, 11, '#0f172a'); p(11, 9, '#0f172a'); p(13, 11, '#0f172a');
  }

  // --------------------------------------------------------------------------
  // 3. 被动配件 (PASSIVE ACCESSORIES)
  // --------------------------------------------------------------------------
  else if (id.includes('hollow_heart') || id.includes('hollow')) {
    // 空虚之心：幽暗深紫的黑宝石虚空之心
    rect(7, 6, 10, 9, '#3b0764');
    rect(8, 5, 8, 9, '#581c87');
    rect(9, 7, 6, 6, '#7e22ce');
    rect(10, 8, 4, 4, '#0a0d14');
    p(11, 9, '#a855f7');
  }
  else if (id.includes('empty_tome') || id.includes('tome')) {
    // 空白之书：金边纯白魔导书
    rect(6, 5, 12, 14, '#94a3b8');
    rect(7, 6, 10, 12, '#f8fafc');
    rect(8, 7, 8, 10, '#ffffff');
    rect(6, 5, 2, 14, '#b45309');
    p(11, 11, '#f59e0b');
  }
  else if (id.includes('bracer')) {
    // 护腕：镶嵌红铜铆钉的坚固真皮护腕
    rect(6, 7, 12, 10, '#78350f');
    rect(7, 8, 10, 8, '#92400e');
    p(8, 9, '#f59e0b'); p(11, 9, '#f59e0b'); p(14, 9, '#f59e0b');
    p(8, 13, '#f59e0b'); p(11, 13, '#f59e0b'); p(14, 13, '#f59e0b');
    p(8, 11, '#ffffff'); p(11, 11, '#ffffff'); p(14, 11, '#ffffff');
  }
  else if (id.includes('candelabrador') || id.includes('candel')) {
    // 烛台：雕花三叉金色烛台，顶端燃烧明亮火焰
    rect(11, 12, 2, 8, '#b45309');
    rect(9, 18, 6, 2, '#b45309');
    rect(7, 10, 10, 2, '#d97706');
    p(7, 9, '#f59e0b'); p(11, 9, '#f59e0b'); p(16, 9, '#f59e0b');
    p(7, 7, '#f97316'); p(11, 7, '#f97316'); p(16, 7, '#f97316');
    p(7, 6, '#fde047'); p(11, 6, '#fde047'); p(16, 6, '#fde047');
    p(7, 5, '#ffffff'); p(11, 5, '#ffffff'); p(16, 5, '#ffffff');
  }
  else if (id.includes('clover')) {
    // 四叶草：翠绿欲滴的幸运四叶草
    rect(7, 6, 4, 4, '#15803d');
    rect(13, 6, 4, 4, '#15803d');
    rect(7, 12, 4, 4, '#15803d');
    rect(13, 12, 4, 4, '#15803d');
    p(8, 7, '#4ade80'); p(14, 7, '#4ade80');
    p(8, 13, '#4ade80'); p(14, 13, '#4ade80');
    p(11, 11, '#22c55e');
    p(11, 16, '#166534'); p(11, 17, '#166534'); p(10, 18, '#166534');
  }
  else if (id.includes('spellbinder') || id.includes('binder')) {
    // 拼写器：赤金太阳纹章挂坠
    rect(8, 8, 8, 8, '#b45309');
    rect(9, 9, 6, 6, '#f59e0b');
    p(11, 11, '#ffffff'); p(12, 11, '#ffffff');
    p(11, 6, '#fde047'); p(12, 6, '#fde047');
    p(11, 17, '#fde047'); p(12, 17, '#fde047');
    p(6, 11, '#fde047'); p(6, 12, '#fde047');
    p(17, 11, '#fde047'); p(17, 12, '#fde047');
  }
  else if (id.includes('spinach')) {
    // 菠菜：鲜嫩翠绿的菠菜菜叶
    rect(8, 7, 8, 9, '#15803d');
    rect(9, 8, 6, 7, '#16a34a');
    rect(10, 9, 4, 5, '#4ade80');
    p(11, 10, '#86efac');
    p(11, 16, '#14532d'); p(11, 17, '#14532d');
  }
  else if (id.includes('pummarola') || id.includes('tomato')) {
    // 番茄：红润光泽的鲜番茄与绿蒂
    rect(7, 8, 10, 9, '#b91c1c');
    rect(8, 7, 8, 10, '#dc2626');
    rect(9, 8, 6, 8, '#ef4444');
    p(10, 9, '#f87171'); p(11, 9, '#ffffff');
    p(11, 5, '#22c55e'); p(12, 5, '#22c55e');
    p(10, 6, '#15803d'); p(13, 6, '#15803d');
  }
  else if (id.includes('attractorb') || id.includes('orb')) {
    // 吸引器：散发引力幽蓝磁力光芒的悬浮天体球
    rect(7, 7, 10, 10, '#1d4ed8');
    rect(8, 8, 8, 8, '#3b82f6');
    rect(9, 9, 6, 6, '#60a5fa');
    rect(10, 10, 4, 4, '#93c5fd');
    p(11, 11, '#ffffff');
    // 引力外环
    p(4, 11, '#38bdf8'); p(19, 11, '#38bdf8');
    p(11, 4, '#38bdf8'); p(11, 19, '#38bdf8');
  }
  else if (id.includes('armor')) {
    // 护甲：抛光精钢胸甲配金边
    rect(7, 6, 10, 11, '#475569');
    rect(8, 7, 8, 9, '#64748b');
    rect(9, 8, 6, 7, '#94a3b8');
    p(10, 9, '#cbd5e1'); p(11, 9, '#ffffff');
    rect(7, 5, 10, 2, '#f59e0b');
    p(8, 17, '#334155'); p(15, 17, '#334155');
  }
  else if (id.includes('duplicator')) {
    // 复制器：两枚交错共振的黄金魔戒
    rect(6, 6, 8, 8, '#ca8a04');
    rect(7, 7, 6, 6, '#facc15');
    rect(8, 8, 4, 4, '#0a0d14');
    rect(10, 10, 8, 8, '#b45309');
    rect(11, 11, 6, 6, '#fde047');
    rect(12, 12, 4, 4, '#0a0d14');
    p(9, 9, '#ffffff'); p(13, 13, '#ffffff');
  }
  else if (id.includes('crown')) {
    // 王冠：镶嵌三色红蓝宝石的耀眼黄金王冠
    rect(6, 9, 12, 6, '#ca8a04');
    rect(7, 8, 10, 6, '#eab308');
    rect(8, 9, 8, 4, '#fde047');
    // 三个尖峰
    p(6, 7, '#fde047'); p(7, 8, '#fde047');
    p(11, 6, '#fde047'); p(12, 6, '#fde047');
    p(17, 7, '#fde047'); p(16, 8, '#fde047');
    // 镶嵌宝石
    p(7, 11, '#ef4444'); p(11, 11, '#3b82f6'); p(12, 11, '#3b82f6'); p(16, 11, '#10b981');
  }
  else if (id.includes('wings')) {
    // 翅膀：天使之翼
    rect(6, 6, 12, 10, '#cbd5e1');
    rect(7, 7, 10, 8, '#f1f5f9');
    rect(8, 8, 8, 6, '#ffffff');
    p(11, 11, '#38bdf8'); p(12, 11, '#38bdf8');
  }
  else if (id.includes('skull') || id.includes('o_maniac')) {
    // 疯狂颅骨：暗黑诅咒骷髅头
    rect(7, 6, 10, 10, '#334155');
    rect(8, 7, 8, 8, '#475569');
    rect(8, 9, 3, 3, '#581c87');
    rect(13, 9, 3, 3, '#581c87');
    p(9, 10, '#c084fc'); p(14, 10, '#c084fc');
  }
  else if (id.includes('torronas_box') || id.includes('box')) {
    // 盒：金边神秘符文盒
    rect(5, 5, 14, 14, '#78350f');
    rect(6, 6, 12, 12, '#b45309');
    rect(7, 7, 10, 10, '#d97706');
    p(8, 8, '#fef08a'); p(15, 8, '#fef08a'); p(8, 15, '#fef08a'); p(15, 15, '#fef08a');
    rect(10, 10, 4, 4, '#ec4899');
    p(11, 11, '#fbcfe8');
  }
  else {
    // 通用典雅蓝宝石银戒
    rect(6, 7, 12, 11, '#64748b');
    rect(8, 9, 8, 7, '#0a0d14');
    rect(7, 8, 10, 9, '#cbd5e1');
    rect(8, 9, 8, 7, '#0a0d14');
    rect(10, 5, 4, 4, '#38bdf8');
    p(11, 6, '#ffffff');
  }

  return canvas;
}

export function getItemIconUrl(itemId: string): string {
  return getCachedDataUrl(`itemHiUrl:${itemId}`, () => drawItemIconCanvas(itemId));
}

export function getItemTexture(itemId: string): Texture {
  return getCachedTexture(`itemHiTex:${itemId}`, () => drawItemIconCanvas(itemId, false));
}

// Moving magic uses an actual bolt, rather than the inventory's staff icon.
// These textures point right; the battlefield rotates them into the velocity vector.
export function getProjectileTexture(weaponId: string, behavior: string, color: string): Texture {
  const drawnBehaviors = ['nearest_bolt', 'random_pierce_beam', 'facing_knife', 'bounce_tracer', 'bounce_bone', 'clock_freeze_ray', 'thrust_spear', 'vertical_javelin', 'tri_shot', 'dual_diagonal', 'lightning_strike', 'circle_bombard'];
  if (!drawnBehaviors.includes(behavior)) {
    return getItemTexture(weaponId);
  }
  return getCachedTexture(`projectile:${weaponId}:${color}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    if (drawApprovedProjectile(ctx, behavior)) return canvas;
    ctx.fillStyle = color;
    const r = (x: number, y: number, w: number, h: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    };
    if (behavior === 'facing_knife' || behavior === 'thrust_spear' || behavior === 'vertical_javelin') {
      r(5, 21, 33, 7, '#111a24');
      r(9, 22, 25, 4, color);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(5, 22, 8, 4);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(17, 22, 19, 2);
      r(33, 23, 5, 2, '#f0f7ef');
      r(13, 19, 2, 10, '#c6aa65');
    } else if (behavior === 'bounce_bone') {
      r(9, 19, 7, 12, '#82949b'); r(32, 19, 7, 12, '#82949b');
      r(14, 23, 20, 5, '#e4e7d5');
      r(9, 19, 6, 5, '#f4f0da'); r(9, 26, 6, 5, '#e4e7d5');
      r(33, 19, 6, 5, '#f4f0da'); r(33, 26, 6, 5, '#e4e7d5');
      r(16, 23, 15, 1, '#ffffec');
    } else if (behavior === 'clock_freeze_ray') {
      r(8, 23, 30, 2, '#73b8da'); r(20, 16, 10, 16, '#a7dfed');
      r(16, 20, 18, 8, '#a7dfed'); r(23, 12, 4, 24, '#d7f6ef');
      r(18, 18, 14, 2, '#f3fff5'); r(18, 28, 14, 2, '#f3fff5');
      r(23, 21, 5, 6, '#ffffff');
    } else if (behavior === 'lightning_strike') {
      r(24, 3, 8, 13, '#b8c4ff'); r(19, 14, 10, 11, color);
      r(25, 23, 8, 5, '#e6eaff'); r(19, 27, 10, 9, color);
      r(17, 34, 5, 8, '#e6eaff'); r(23, 14, 3, 10, '#ffffff');
    } else if (behavior === 'random_pierce_beam' || behavior === 'circle_bombard') {
      // Ragged flame tongues and a layered hot core; transparent between the tongues.
      r(5, 19, 18, 3, '#a84324'); r(9, 29, 14, 3, '#a84324');
      r(12, 16, 14, 3, '#df6b29'); r(4, 24, 20, 3, '#df6b29');
      r(18, 15, 14, 19, color); r(28, 18, 8, 13, color);
      r(23, 18, 11, 12, '#ffc965'); r(29, 20, 8, 8, '#fff0b1');
      r(32, 21, 5, 5, '#ffffe6');
    } else if (behavior === 'bounce_tracer') {
      r(4, 23, 23, 2, '#6b5a8d'); r(14, 20, 11, 8, color);
      r(24, 16, 6, 16, color); r(30, 19, 5, 10, '#e0ceff');
      r(35, 23, 5, 2, '#ffffff'); r(25, 20, 5, 8, '#f4e9ff');
    } else {
      ctx.fillRect(6, 22, 30, 4);
      ctx.fillRect(18, 18, 16, 12);
      ctx.fillRect(22, 16, 8, 16);
      ctx.fillStyle = behavior === 'random_pierce_beam' ? '#fef08a' : '#f0f9ff';
      ctx.fillRect(24, 20, 12, 8);
    }
    return canvas;
  });
}

// ============================================================================
// 3. HIGH-DETAIL ENEMY SPRITES (Treants, Bats, Skeletons, Knights, Reaper)
// ============================================================================

function drawEnemyCanvas(
  enemyId: string,
  colorHex: string,
  isBoss: boolean,
  isReaper: boolean,
  frame: number,
  flashWhite: boolean,
): HTMLCanvasElement {
  const size = isBoss ? 56 : 44;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;
  if (drawApprovedEnemy(ctx, isReaper ? 'reaper' : enemyId, size, frame, colorHex, flashWhite)) return canvas;
  drawMonster(ctx, isReaper ? 'reaper' : enemyId, colorHex, frame, flashWhite, size);

  return canvas;
}

export function getEnemyTexture(
  enemyId: string,
  colorHex: string,
  isBoss: boolean,
  isReaper: boolean,
  frame: number,
  flashWhite = false,
): Texture {
  const f = frame & 1;
  const key = `enHi:${enemyId}:${colorHex}:${isBoss ? 1 : 0}:${isReaper ? 1 : 0}:${f}:${flashWhite ? 1 : 0}`;
  return getCachedTexture(key, () =>
    drawEnemyCanvas(enemyId, colorHex, isBoss, isReaper, f, flashWhite),
  );
}

// ============================================================================
// 4. PICKUPS & WORLD PROPS
// ============================================================================

export function getPickupTexture(kind: string): Texture {
  return getCachedTexture(`pkHi:${kind}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = false;
    if (drawApprovedPickup(ctx, kind)) return canvas;

    // 辅助画单像素或 2x2 像素
    function p(x: number, y: number, color: string, sz = 2): void {
      ctx!.fillStyle = color;
      ctx!.fillRect(x * sz, y * sz, sz, sz);
    }
    const r = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * 2, y * 2, w * 2, h * 2);
    };

    if (kind === 'chest') {
      // 16x12 经典红木黄铜包角宝箱 (scale = 2)
      // 阴影底
      for (let x = 2; x <= 13; x++) p(x, 12, '#000000');
      // 桃花心木箱体
      for (let y = 5; y <= 11; y++) {
        for (let x = 2; x <= 13; x++) {
          p(x, y, '#78350f');
        }
      }
      // 箱盖高光与接缝
      for (let x = 2; x <= 13; x++) p(x, 5, '#92400e');
      for (let x = 2; x <= 13; x++) p(x, 8, '#451a03');
      // 四角纯金护角
      p(2, 5, '#f59e0b'); p(3, 5, '#fbbf24'); p(2, 6, '#d97706');
      p(13, 5, '#f59e0b'); p(12, 5, '#fbbf24'); p(13, 6, '#d97706');
      p(2, 11, '#d97706'); p(3, 11, '#b45309');
      p(13, 11, '#d97706'); p(12, 11, '#b45309');
      // 中央黄金骷髅锁扣
      p(7, 7, '#f59e0b'); p(8, 7, '#f59e0b');
      p(7, 8, '#fde047'); p(8, 8, '#ffffff');
      p(7, 9, '#d97706'); p(8, 9, '#d97706');
      return canvas;
    }

    if (kind.startsWith('xp_')) {
      const isRed = kind === 'xp_red';
      const isGreen = kind === 'xp_green';

      // 配色方案：纯白高光、亮主色、核心过渡色、阴影暗面、暗黑轮廓
      const cHighlight = '#ffffff';
      const cLight = isRed ? '#fca5a5' : isGreen ? '#86efac' : '#7dd3fc';
      const cMain = isRed ? '#ef4444' : isGreen ? '#22c55e' : '#38bdf8';
      const cDark = isRed ? '#991b1b' : isGreen ? '#15803d' : '#0284c7';
      const cShadow = isRed ? '#450a0a' : isGreen ? '#052e16' : '#0c4a6e';
      const cOutline = '#07090e';

      // 16x16 八面体像素水晶 (scale = 2)
      // 顶点与底点
      p(8, 2, cOutline); p(8, 14, cOutline);
      // 轮廓线
      p(7, 3, cOutline); p(9, 3, cOutline);
      p(6, 4, cOutline); p(10, 4, cOutline);
      p(5, 5, cOutline); p(11, 5, cOutline);
      p(4, 6, cOutline); p(12, 6, cOutline);
      p(4, 7, cOutline); p(12, 7, cOutline);
      p(4, 8, cOutline); p(12, 8, cOutline);
      p(4, 9, cOutline); p(12, 9, cOutline);
      p(5, 10, cOutline); p(11, 10, cOutline);
      p(6, 11, cOutline); p(10, 11, cOutline);
      p(7, 12, cOutline); p(9, 12, cOutline);
      p(8, 13, cOutline);

      // 左上方受光面 (高光与亮面)
      p(8, 3, cLight);
      p(7, 4, cLight); p(8, 4, cLight);
      p(6, 5, cLight); p(7, 5, cHighlight); p(8, 5, cLight);
      p(5, 6, cLight); p(6, 6, cHighlight); p(7, 6, cLight); p(8, 6, cMain);
      p(5, 7, cLight); p(6, 7, cLight); p(7, 7, cMain); p(8, 7, cMain);
      p(5, 8, cLight); p(6, 8, cMain); p(7, 8, cMain); p(8, 8, cMain);

      // 右上方与右侧面 (过渡折射)
      p(9, 4, cMain);
      p(9, 5, cMain); p(10, 5, cDark);
      p(9, 6, cMain); p(10, 6, cDark); p(11, 6, cDark);
      p(9, 7, cMain); p(10, 7, cDark); p(11, 7, cDark);
      p(9, 8, cMain); p(10, 8, cDark); p(11, 8, cShadow);

      // 下半部背光暗面与底部尖锥
      p(5, 9, cDark); p(6, 9, cDark); p(7, 9, cDark); p(8, 9, cDark); p(9, 9, cShadow); p(10, 9, cShadow); p(11, 9, cShadow);
      p(6, 10, cDark); p(7, 10, cDark); p(8, 10, cDark); p(9, 10, cShadow); p(10, 10, cShadow);
      p(7, 11, cDark); p(8, 11, cShadow); p(9, 11, cShadow);
      p(8, 12, cShadow);

      return canvas;
    }

    if (kind === 'roast_chicken') {
      r(8, 8, 5, 3, '#ead9b8'); r(12, 7, 2, 5, '#f9edce');
      r(3, 5, 7, 7, '#2d211c'); r(2, 7, 9, 4, '#2d211c');
      r(3, 6, 7, 5, '#ac522c'); r(4, 5, 5, 2, '#d68143');
      r(3, 7, 3, 2, '#f3b36b'); r(7, 9, 3, 2, '#703729');
      return canvas;
    }
    if (kind === 'little_heart') {
      const rows = ['.###.###.', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];
      renderAsciiSprite(ctx, rows, { '#': '#ee697b' }, 6, 8, 2);
      r(4, 5, 2, 1, '#ffd1c6'); r(7, 8, 3, 1, '#9b354d');
      return canvas;
    }
    if (kind === 'vacuum') {
      r(3, 4, 4, 8, '#101a24'); r(9, 4, 4, 8, '#101a24');
      r(4, 4, 2, 7, '#d66055'); r(10, 4, 2, 7, '#578ec2');
      r(4, 11, 8, 3, '#8597a6'); r(6, 12, 4, 1, '#dce5de');
      r(4, 3, 2, 3, '#dce5de'); r(10, 3, 2, 3, '#dce5de');
      return canvas;
    }
    if (kind === 'rosary') {
      for (const [x, y] of [[5, 3], [8, 2], [11, 3], [12, 6], [11, 9], [8, 10], [5, 9], [4, 6]]) {
        r(x!, y!, 2, 2, '#caaa66'); p(x!, y!, '#f4deb0');
      }
      r(8, 11, 1, 4, '#f4deb0'); r(6, 12, 5, 1, '#f4deb0');
      return canvas;
    }
    if (kind === 'orologion') {
      r(6, 1, 4, 2, '#c5a166'); r(3, 4, 10, 9, '#463c35');
      r(4, 3, 8, 11, '#b28f52'); r(4, 5, 8, 6, '#ebe2ba');
      r(5, 4, 6, 8, '#ebe2ba'); r(7, 5, 1, 4, '#3a4652'); r(7, 8, 3, 1, '#3a4652');
      p(5, 5, '#fff5d3'); p(10, 11, '#a18c69');
      return canvas;
    }
    if (kind === 'nduja_fritta') {
      r(4, 4, 9, 8, '#571e26'); r(3, 6, 11, 5, '#ad3c37');
      r(5, 5, 7, 6, '#d76c46'); r(6, 5, 3, 1, '#f3ad68');
      r(2, 7, 2, 3, '#e4cc9b'); r(13, 5, 2, 3, '#e4cc9b');
      p(7, 8, '#ffcf95'); p(10, 7, '#ffcf95');
      return canvas;
    }
    if (kind === 'coin_bag' || kind === 'rich_bag') {
      const rich = kind === 'rich_bag';
      r(5, 2, 6, 3, '#745338'); r(6, 4, 4, 2, '#e2bf72');
      r(4, 6, 8, 7, '#3d2e24'); r(3, 8, 10, 4, '#3d2e24');
      r(5, 6, 6, 7, rich ? '#b1843a' : '#8e6e49');
      r(4, 8, 8, 4, rich ? '#cba352' : '#a38258');
      r(6, 8, 4, 4, '#e5c87b'); r(7, 9, 2, 2, '#a07530');
      if (rich) { r(11, 11, 3, 2, '#edcc6c'); p(12, 11, '#fff0b6'); }
      return canvas;
    }

    // Coins retain a rounded, beveled outline distinct from bags and consumables.
    for (let y = 4; y <= 12; y++) {
      for (let x = 4; x <= 12; x++) {
        if ((x === 4 || x === 12) && (y < 6 || y > 10)) continue;
        if ((y === 4 || y === 12) && (x < 6 || x > 10)) continue;
        p(x, y, '#b45309');
      }
    }
    for (let y = 5; y <= 11; y++) {
      for (let x = 5; x <= 11; x++) {
        p(x, y, '#f59e0b');
      }
    }
    // 币面亮光
    for (let y = 6; y <= 10; y++) {
      for (let x = 6; x <= 10; x++) {
        p(x, y, '#fde047');
      }
    }
    p(7, 7, '#ffffff'); p(8, 7, '#ffffff');
    p(8, 9, '#ca8a04');

    return canvas;
  });
}

function drawWorldPropCanvas(kind: 'candelabra' | 'tombstone'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  function p(x: number, y: number, color: string, sz = 2): void {
    ctx!.fillStyle = color;
    ctx!.fillRect(x * sz, y * sz, sz, sz);
  }

  function rect(x: number, y: number, w: number, h: number, color: string, sz = 2): void {
    ctx!.fillStyle = color;
    ctx!.fillRect(x * sz, y * sz, w * sz, h * sz);
  }

  if (kind === 'candelabra') {
    // 纯透明背景！经典哥特场景黄铜三叉烛台
    // 底部基座
    rect(5, 15, 6, 2, '#78350f');
    rect(6, 14, 4, 1, '#b45309');
    p(7, 14, '#f59e0b'); p(8, 14, '#f59e0b');

    // 主立柱
    rect(7, 8, 2, 6, '#b45309');
    p(7, 9, '#f59e0b'); p(7, 11, '#f59e0b');

    // 左右弯曲烛臂
    rect(4, 8, 8, 2, '#b45309');
    p(3, 7, '#b45309'); p(3, 6, '#b45309');
    p(12, 7, '#b45309'); p(12, 6, '#b45309');
    p(4, 8, '#f59e0b'); p(11, 8, '#f59e0b');

    // 三只烛托
    rect(2, 5, 3, 1, '#d97706');
    rect(6, 6, 4, 1, '#d97706');
    rect(11, 5, 3, 1, '#d97706');

    // 三支纯白蜡烛身
    rect(3, 3, 1, 2, '#f8fafc');
    rect(7, 4, 2, 2, '#f8fafc');
    rect(12, 3, 1, 2, '#f8fafc');

    // 三朵明亮像素火苗（外围橙红，内芯明黄，尖端纯白）
    p(3, 2, '#ef4444'); p(3, 1, '#f59e0b'); p(3, 0, '#ffffff');
    p(7, 3, '#ef4444'); p(8, 3, '#ef4444');
    p(7, 2, '#f59e0b'); p(8, 2, '#fde047');
    p(7, 1, '#ffffff');
    p(12, 2, '#ef4444'); p(12, 1, '#f59e0b'); p(12, 0, '#ffffff');
  } else {
    // 纯透明背景！风化十字架古代墓碑
    // 底部泥土与青苔基座
    rect(4, 15, 8, 2, '#334155');
    rect(5, 14, 6, 1, '#475569');
    p(4, 15, '#15803d'); p(11, 15, '#15803d');

    // 石碑主躯干
    rect(6, 4, 4, 10, '#64748b');
    rect(7, 4, 2, 10, '#94a3b8');

    // 横向十字翼
    rect(3, 6, 10, 3, '#64748b');
    rect(4, 7, 8, 1, '#94a3b8');

    // 顶部石十字尖顶
    rect(7, 2, 2, 2, '#94a3b8');
    p(7, 2, '#cbd5e1');

    // 风化裂纹与深色石纹
    p(7, 8, '#334155'); p(8, 9, '#334155'); p(8, 10, '#1e293b');
    p(4, 6, '#cbd5e1'); p(11, 8, '#334155');
    // 零星苔藓绿斑
    p(6, 12, '#16a34a'); p(9, 13, '#15803d');
  }

  return canvas;
}

export function getWorldPropTexture(kind: 'candelabra' | 'tombstone'): Texture {
  return getCachedTexture(`propHi:${kind}`, () => drawWorldPropCanvas(kind));
}

// ============================================================================
// 5. 自然草地 / 石地 / 图书馆场景贴图
// ============================================================================

export function getStageTileTexture(
  stageId: string,
  bgPrimary: string,
  bgSecondary: string,
  gridLine: string,
): Texture {
  return getCachedTexture(`stageNat:${stageId}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = false;

    // 基础森林地表底色
    ctx.fillStyle = bgPrimary;
    ctx.fillRect(0, 0, 128, 128);

    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    // 1. 微型暗调土壤与腐殖质斑块 (柔和无缝底纹)
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rand() * 120);
      const y = Math.floor(rand() * 120);
      const w = 4 + Math.floor(rand() * 8);
      const h = 3 + Math.floor(rand() * 6);
      ctx.fillStyle = 'rgba(10, 18, 12, 0.42)';
      ctx.fillRect(x, y, w, h);
    }

    // 2. 经典 16-bit 像素草丛簇 (由深浅双色构成的自然小草簇)
    for (let i = 0; i < 65; i++) {
      const cx = Math.floor(rand() * 120);
      const cy = Math.floor(rand() * 120);

      // 草簇基底暗叶
      ctx.fillStyle = bgSecondary;
      ctx.fillRect(cx - 2, cy + 2, 2, 3);
      ctx.fillRect(cx, cy + 1, 2, 4);
      ctx.fillRect(cx + 2, cy + 2, 2, 3);

      // 受光微光尖端
      ctx.fillStyle = gridLine;
      ctx.fillRect(cx - 2, cy + 1, 1, 2);
      ctx.fillRect(cx, cy, 1, 3);
      ctx.fillRect(cx + 3, cy + 1, 1, 2);
    }

    // 3. 极低对比度的大地自然细节 (柔和微型暗石与湿土痕迹，绝不刺眼发疹)
    for (let i = 0; i < 16; i++) {
      const rx = Math.floor(rand() * 124);
      const ry = Math.floor(rand() * 124);
      if (i % 2 === 0) {
        // 微暗泥土凹陷痕
        ctx.fillStyle = 'rgba(8, 14, 10, 0.45)';
        ctx.fillRect(rx, ry, 2, 2);
      } else {
        // 暗夜森林冷苔点
        ctx.fillStyle = 'rgba(30, 58, 42, 0.5)';
        ctx.fillRect(rx, ry, 2, 1);
      }
    }

    return canvas;
  });
}
