import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  TilingSprite,
} from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import {
  ENEMY_MAP,
  PASSIVE_MAP,
  RELIC_MAP,
  STAGE_MAP,
} from '../content/ledger.ts';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type LongNightEmbersEngine,
} from '../core/engine.ts';
import {
  getCharacterTexture,
  getEnemyTexture,
  getItemTexture,
  getProjectileTexture,
  getPickupTexture,
  getStageTileTexture,
  getWorldPropTexture,
} from './pixelArt.ts';

type Props = {
  engine: LongNightEmbersEngine;
};

function hexToNumber(hex: string, fallback = 0xffffff): number {
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return Number.parseInt(cleaned, 16);
  }
  return fallback;
}

const LABEL_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 11,
  fontWeight: 'bold',
  fill: 0xfef08a,
  stroke: { color: 0x05070c, width: 3 },
});

const DMG_NORMAL_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 13,
  fontWeight: 'bold',
  fill: 0xffffff,
  stroke: { color: 0x05070c, width: 3 },
});

const DMG_CRIT_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 16,
  fontWeight: 'bold',
  fill: 0xfacc15,
  stroke: { color: 0x7f1d1d, width: 4 },
});

interface FloatingDamage {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  crit: boolean;
  life: number;
  maxLife: number;
  node: Text;
}

interface DeathParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  life: number;
}

export function BattlefieldCanvas({ engine }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const enemySprites = new Map<string, Sprite>();
    const enemyPrevHp = new Map<string, { hp: number; x: number; y: number; color: number }>();
    const enemyHitFlashUntil = new Map<string, number>();
    const pickupSprites = new Map<string, Sprite>();
    const projectileSprites = new Map<string, Sprite>();
    const propSprites = new Map<string, Sprite>();
    const labelPool = new Map<string, Text>();
    const floatingDamages: FloatingDamage[] = [];
    const deathParticles: DeathParticle[] = [];
    let nextDmgId = 1;
    let renderTick = 0;

    const canvas = document.createElement('canvas');
    canvas.className = 'lne-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'fill';
    canvas.style.display = 'block';

    let logicalW = LOGICAL_WIDTH;
    let logicalH = LOGICAL_HEIGHT;

    const initialHostW = host.clientWidth || window.innerWidth || 960;
    const initialHostH = host.clientHeight || window.innerHeight || 540;
    const initialAspect = Math.max(0.5, Math.min(3.0, initialHostW / initialHostH));
    logicalH = 540;
    logicalW = Math.round(540 * initialAspect);

    canvas.width = logicalW;
    canvas.height = logicalH;
    host.innerHTML = '';
    host.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'contextLost', active: true });
    };
    const onContextRestored = () => {
      engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'contextLost', active: false });
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    let resizeObserver: ResizeObserver | null = null;
    let onWindowResize: (() => void) | null = null;

    async function bootPixi() {
      try {
        const pixiApp = new Application();
        await pixiApp.init({
          canvas,
          width: logicalW,
          height: logicalH,
          preference: 'webgl',
          antialias: false,
          backgroundAlpha: 1,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: false,
        });

        if (disposed) {
          pixiApp.destroy(false, { children: true });
          return;
        }

        app = pixiApp;
        const worldRoot = new Container();

        const initialStage = STAGE_MAP['mad_forest']!;
        const initialTileTex = getStageTileTexture(
          initialStage.id,
          initialStage.palette.bgPrimary,
          initialStage.palette.bgSecondary,
          initialStage.palette.gridLine,
        );
        const tilingFloor = new TilingSprite({
          texture: initialTileTex,
          width: logicalW + 128,
          height: logicalH + 128,
        });
        tilingFloor.position.set(-64, -64);
        let currentStageId = initialStage.id;

        const currentHost = host;
        if (!currentHost) return;

        const updateDimensions = () => {
          if (disposed || !pixiApp?.renderer) return;
          const hostW = currentHost.clientWidth || window.innerWidth || 960;
          const hostH = currentHost.clientHeight || window.innerHeight || 540;
          const aspect = Math.max(0.5, Math.min(3.0, hostW / hostH));
          logicalH = 540;
          logicalW = Math.round(540 * aspect);
          pixiApp.renderer.resize(logicalW, logicalH);
          tilingFloor.width = logicalW + 128;
          tilingFloor.height = logicalH + 128;
        };

        resizeObserver = new ResizeObserver(updateDimensions);
        resizeObserver.observe(currentHost);
        onWindowResize = updateDimensions;
        window.addEventListener('resize', onWindowResize);
        updateDimensions();

        const stagePropsGraphics = new Graphics();
        const propContainer = new Container();
        const hazardGraphics = new Graphics();
        const pickupContainer = new Container();
        const pickupFxGraphics = new Graphics();
        const enemyContainer = new Container();
        const enemyHpGraphics = new Graphics();
        const playerSprite = new Sprite(getCharacterTexture('torchguard_torren', 0));
        playerSprite.anchor.set(0.5, 0.5);
        const playerFxGraphics = new Graphics();
        const projectileContainer = new Container();
        const projectileFxGraphics = new Graphics();
        const particleGraphics = new Graphics();
        const labelContainer = new Container();
        const damageTextContainer = new Container();

        worldRoot.addChild(
          tilingFloor,
          stagePropsGraphics,
          propContainer,
          hazardGraphics,
          pickupFxGraphics,
          pickupContainer,
          enemyContainer,
          enemyHpGraphics,
          playerFxGraphics,
          playerSprite,
          projectileFxGraphics,
          projectileContainer,
          particleGraphics,
          labelContainer,
          damageTextContainer,
        );
        pixiApp.stage.addChild(worldRoot);

        const getOrCreateLabel = (key: string, content: string): Text => {
          let item = labelPool.get(key);
          if (!item) {
            item = new Text({ text: content, style: LABEL_STYLE });
            item.anchor.set(0.5, 1);
            labelPool.set(key, item);
            labelContainer.addChild(item);
          } else if (item.text !== content) {
            item.text = content;
          }
          item.visible = true;
          return item;
        };

        const spawnFloatingDamage = (x: number, y: number, amount: number, crit: boolean) => {
          if (floatingDamages.length > 65) return;
          const node = new Text({
            text: `${Math.max(1, Math.round(amount))}`,
            style: crit ? DMG_CRIT_STYLE : DMG_NORMAL_STYLE,
          });
          node.anchor.set(0.5, 0.5);
          damageTextContainer.addChild(node);
          floatingDamages.push({
            id: nextDmgId++,
            x: x + ((nextDmgId % 5) - 2) * 4,
            y: y - 12,
            vy: crit ? -1.4 : -1.0,
            text: node.text,
            crit,
            life: 28,
            maxLife: 28,
            node,
          });
        };

        const spawnDeathBurst = (x: number, y: number, color: number) => {
          if (deathParticles.length > 150) return;
          for (let i = 0; i < 7; i++) {
            const angle = (Math.PI * 2 * i) / 7 + (renderTick % 3) * 0.2;
            const speed = 1.5 + (i % 3) * 0.85;
            deathParticles.push({
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              color,
              size: i % 2 === 0 ? 4 : 3,
              life: 16,
            });
          }
        };

        pixiApp.ticker.add(() => {
          if (disposed) return;
          renderTick++;
          const { run, profile } = engine.getSnapshot();
          const stageDef = STAGE_MAP[run.stageId] ?? STAGE_MAP['mad_forest']!;
          const hasMilkyMap = profile.unlockedRelicIds.includes('milky_way_map');

          for (const lbl of labelPool.values()) {
            lbl.visible = false;
          }

          if (run.modes.inverse) {
            worldRoot.scale.set(1, -1);
            worldRoot.position.set(0, logicalH);
          } else {
            worldRoot.scale.set(1, 1);
            worldRoot.position.set(0, 0);
          }

          const camX = run.player.x - logicalW / 2;
          const camY = run.player.y - logicalH / 2;
          const playerScreenX = logicalW / 2;
          const playerScreenY = logicalH / 2;

          // 1. Organic 128x128 Stage Floor + Architectural Walls & Props
          if (currentStageId !== stageDef.id) {
            currentStageId = stageDef.id;
            tilingFloor.texture = getStageTileTexture(
              stageDef.id,
              stageDef.palette.bgPrimary,
              stageDef.palette.bgSecondary,
              stageDef.palette.gridLine,
            );
          }
          tilingFloor.tilePosition.set(-camX - 64, -camY - 64);

          stagePropsGraphics.clear();
          const obstacleColor = hexToNumber(stageDef.palette.obstacleColor, 0x0d1710);

          if (stageDef.geometry === 'horizontal_corridor') {
            // Inlaid Library ornate crimson & gold carpet runner
            const carpetTop = -80 - camY;
            stagePropsGraphics
              .rect(0, carpetTop, logicalW, 160)
              .fill({ color: 0x7f1d1d, alpha: 0.72 });
            stagePropsGraphics
              .rect(0, carpetTop + 6, logicalW, 148)
              .stroke({ color: 0xfacc15, width: 3, alpha: 0.8 });
            stagePropsGraphics
              .rect(0, carpetTop + 12, logicalW, 136)
              .stroke({ color: 0xb45309, width: 1, alpha: 0.65 });

            const topWallY = -220 - camY;
            const botWallY = 220 - camY;
            if (topWallY > 0) {
              stagePropsGraphics.rect(0, 0, logicalW, topWallY).fill({ color: obstacleColor });
              // Bookshelves row
              stagePropsGraphics
                .rect(0, Math.max(0, topWallY - 36), logicalW, 36)
                .fill({ color: 0x451a03 });
              for (let bx = -(camX % 32); bx < logicalW; bx += 32) {
                stagePropsGraphics
                  .rect(bx + 2, topWallY - 32, 6, 12)
                  .fill({ color: 0xdc2626 });
                stagePropsGraphics
                  .rect(bx + 10, topWallY - 32, 6, 12)
                  .fill({ color: 0x2563eb });
                stagePropsGraphics
                  .rect(bx + 18, topWallY - 32, 6, 12)
                  .fill({ color: 0x16a34a });
                stagePropsGraphics
                  .rect(bx + 4, topWallY - 16, 8, 12)
                  .fill({ color: 0xd97706 });
                stagePropsGraphics
                  .rect(bx + 14, topWallY - 16, 10, 12)
                  .fill({ color: 0x9333ea });
              }
            }
            if (botWallY < logicalH) {
              stagePropsGraphics
                .rect(0, botWallY, logicalW, logicalH - botWallY)
                .fill({ color: obstacleColor });
              stagePropsGraphics
                .rect(0, botWallY, logicalW, 14)
                .fill({ color: 0x78350f });
            }
          } else if (stageDef.geometry === 'vertical_tower') {
            const leftWallX = -280 - camX;
            const rightWallX = 280 - camX;
            if (leftWallX > 0) {
              stagePropsGraphics.rect(0, 0, leftWallX, logicalH).fill({ color: obstacleColor });
              stagePropsGraphics
                .rect(leftWallX - 12, 0, 12, logicalH)
                .fill({ color: 0x475569 });
            }
            if (rightWallX < logicalW) {
              stagePropsGraphics
                .rect(rightWallX, 0, logicalW - rightWallX, logicalH)
                .fill({ color: obstacleColor });
              stagePropsGraphics
                .rect(rightWallX, 0, 12, logicalH)
                .fill({ color: 0x475569 });
            }
          } else if (stageDef.geometry === 'fixed_arena') {
            stagePropsGraphics
              .rect(-440 - camX, -360 - camY, 880, 720)
              .stroke({ color: 0xd97706, width: 8 });
          } else if (stageDef.geometry === 'cart_track') {
            const trackTop = -175 - camY;
            const trackBot = 175 - camY;
            stagePropsGraphics
              .moveTo(0, trackTop)
              .lineTo(logicalW, trackTop)
              .moveTo(0, trackBot)
              .lineTo(logicalW, trackBot)
              .stroke({ color: 0x94a3b8, width: 4 });
          }

          // World Candelabras & Tombstones (Pixel Sprites + Warm Torchlight Halos)
          const activePropKeys = new Set<string>();
          const propStep = 280;
          const bxStart = Math.floor(camX / propStep) * propStep;
          const byStart = Math.floor(camY / propStep) * propStep;

          for (let bx = bxStart; bx <= camX + logicalW + propStep; bx += propStep) {
            for (let by = byStart; by <= camY + logicalH + propStep; by += propStep) {
              const cellHash = Math.abs((bx / propStep) * 37 + (by / propStep) * 17) % 5;
              if (cellHash > 1) continue;
              const sx = bx - camX;
              const sy = by - camY;
              if (sx < -40 || sx > logicalW + 40 || sy < -40 || sy > logicalH + 40) {
                continue;
              }
              const key = `${bx}_${by}`;
              activePropKeys.add(key);
              const kind = cellHash === 0 ? 'candelabra' : 'tombstone';
              const tex = getWorldPropTexture(kind);

              let sp = propSprites.get(key);
              if (!sp) {
                sp = new Sprite(tex);
                sp.anchor.set(0.5, 0.8);
                propSprites.set(key, sp);
                propContainer.addChild(sp);
              } else if (sp.texture !== tex) {
                sp.texture = tex;
              }
              sp.visible = true;
              sp.position.set(sx, sy);

              // 纯净透明的烛台像素表现，移除粗糙的土黄色大圆晕，地面干干净净
              if (kind === 'candelabra') {
                const flicker = 1 + Math.sin(renderTick * 0.3 + bx) * 0.5;
                stagePropsGraphics
                  .rect(sx - 1, sy - 28, 2, 2)
                  .fill({ color: 0xffffff, alpha: 0.6 * flicker });
              }
            }
          }

          for (const [k, sp] of propSprites.entries()) {
            if (!activePropKeys.has(k)) {
              sp.destroy();
              propSprites.delete(k);
            }
          }

          // 2. Hazard Zones (Garlic occult rune circle, Santa Water flames, Gaea)
          hazardGraphics.clear();
          for (const hz of Object.values(run.hazardZones)) {
            const sx = hz.x - camX;
            const sy = hz.y - camY;
            if (
              sx + hz.radius < -30 ||
              sx - hz.radius > logicalW + 30 ||
              sy + hz.radius < -30 ||
              sy - hz.radius > logicalH + 30
            ) {
              continue;
            }
            const color = hexToNumber(hz.color, 0xfef08a);
            const pulse = 1 + Math.sin(renderTick * 0.15) * 0.03;
            const r = hz.radius * pulse;
            // 内部完全透明！仅保留边缘一道柔和轻盈的半透明微光震颤光圈，绝不遮挡草地和视野
            hazardGraphics.circle(sx, sy, r).stroke({ color, width: 1.5, alpha: 0.28 });
            // 外圈柔和暗晕
            hazardGraphics.circle(sx, sy, r + 2).stroke({ color, width: 1, alpha: 0.12 });
            // 6 颗旋转微型符文小光点
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI * 2 * i) / 6 + renderTick * 0.02;
              hazardGraphics
                .rect(sx + Math.cos(a) * r - 1, sy + Math.sin(a) * r - 1, 2, 2)
                .fill({ color, alpha: 0.45 });
            }
          }

          // 3. Pickups (Pixel Gems, Coins, Chests, Chickens, Stage Passives, Relics)
          pickupFxGraphics.clear();
          const activePickupIds = new Set<string>();

          for (const [pkId, pk] of Object.entries(run.pickups)) {
            const sx = pk.x - camX;
            const sy = pk.y - camY;
            const onScreen =
              sx >= -28 && sx <= logicalW + 28 && sy >= -28 && sy <= logicalH + 28;

            if (!onScreen) {
              if (
                hasMilkyMap &&
                (pk.kind === 'stage_passive' || pk.kind === 'relic' || pk.kind === 'chest')
              ) {
                const angle = Math.atan2(sy - playerScreenY, sx - playerScreenX);
                const gx = playerScreenX + Math.cos(angle) * 235;
                const gy = playerScreenY + Math.sin(angle) * 235;
                const guideColor =
                  pk.kind === 'relic' ? 0xf43f5e : pk.kind === 'chest' ? 0xfacc15 : 0x38bdf8;
                // 经典像素罗盘指南针小三角箭头 (指向场外道具方向，绝非孤立脏圆点)
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                const tipX = gx + cosA * 8;
                const tipY = gy + sinA * 8;
                const leftX = gx - cosA * 5 - sinA * 4;
                const leftY = gy - sinA * 5 + cosA * 4;
                const rightX = gx - cosA * 5 + sinA * 4;
                const rightY = gy - sinA * 5 - cosA * 4;

                pickupFxGraphics
                  .poly([tipX, tipY, leftX, leftY, gx - cosA * 2, gy - sinA * 2, rightX, rightY])
                  .fill({ color: guideColor, alpha: 0.95 })
                  .stroke({ color: 0x000000, width: 1.5 });
                // 箭头后方微光信标点
                pickupFxGraphics
                  .rect(gx - cosA * 8 - 1, gy - sinA * 8 - 1, 2, 2)
                  .fill({ color: 0xffffff, alpha: 0.9 });
              }
              continue;
            }

            activePickupIds.add(pkId);
            let sp = pickupSprites.get(pkId);
            const tex =
              pk.kind === 'stage_passive' || pk.kind === 'relic'
                ? getItemTexture(pk.targetId ?? 'clover')
                : getPickupTexture(pk.kind);

            if (!sp) {
              sp = new Sprite(tex);
              sp.anchor.set(0.5, 0.5);
              pickupSprites.set(pkId, sp);
              pickupContainer.addChild(sp);
            } else if (sp.texture !== tex) {
              sp.texture = tex;
            }

            sp.visible = true;
            const bob =
              pk.kind === 'chest' || pk.kind === 'stage_passive' || pk.kind === 'relic'
                ? Math.sin(renderTick * 0.12) * 2.5
                : 0;
            sp.position.set(sx, sy + bob);

            if (pk.kind === 'chest') {
              pickupFxGraphics
                .circle(sx, sy, 20 + Math.sin(renderTick * 0.15) * 3)
                .fill({ color: 0xfacc15, alpha: 0.25 });
            } else if (pk.kind === 'stage_passive' || pk.kind === 'relic') {
              const labelText =
                pk.kind === 'relic'
                  ? RELIC_MAP[pk.targetId ?? '']?.nameZh ?? '遗物'
                  : PASSIVE_MAP[pk.targetId ?? '']?.nameZh ?? '道具';
              pickupFxGraphics
                .circle(sx, sy, 16)
                .fill({ color: pk.kind === 'relic' ? 0xf43f5e : 0xa855f7, alpha: 0.26 });
              const lbl = getOrCreateLabel(`pk:${pkId}`, labelText);
              lbl.position.set(sx, sy - 18);
            }
          }

          for (const [pkId, sp] of pickupSprites.entries()) {
            if (!activePickupIds.has(pkId)) {
              sp.destroy();
              pickupSprites.delete(pkId);
            }
          }

          // 4. Enemies & Bosses (24x24 Shaded Pixel Sprites + Hit Flash + Floating Damage)
          enemyHpGraphics.clear();
          const activeEnemyIds = new Set<string>();
          const animFrame = (run.tick >> 4) & 1;

          for (const [enId, en] of Object.entries(run.enemies)) {
            activeEnemyIds.add(enId);
            const sx = en.x - camX;
            const sy = en.y - camY;
            const def = ENEMY_MAP[en.defId];
            const colorHex =
              en.freezeTicks > 0 || run.globalFreezeTicks > 0
                ? '#38bdf8'
                : (def?.color ?? '#ef4444');
            const colorNum = hexToNumber(colorHex, 0xef4444);

            const prev = enemyPrevHp.get(enId);
            if (prev && en.hp < prev.hp) {
              const dmg = prev.hp - en.hp;
              enemyHitFlashUntil.set(enId, renderTick + 5);
              if (
                !profile.settings.lowFxMode &&
                sx >= -20 &&
                sx <= logicalW + 20 &&
                sy >= -20 &&
                sy <= logicalH + 20
              ) {
                spawnFloatingDamage(sx, sy, dmg, dmg >= 28);
              }
            }
            enemyPrevHp.set(enId, { hp: en.hp, x: sx, y: sy, color: colorNum });

            if (
              sx + en.radius < -44 ||
              sx - en.radius > logicalW + 44 ||
              sy + en.radius < -44 ||
              sy - en.radius > logicalH + 44
            ) {
              const hiddenSp = enemySprites.get(enId);
              if (hiddenSp) hiddenSp.visible = false;
              continue;
            }

            // Ground shadow under enemy
            enemyHpGraphics
              .ellipse(sx, sy + en.radius * 0.75, en.radius * 0.7, 4)
              .fill({ color: 0x000000, alpha: 0.45 });

            const flashWhite = (enemyHitFlashUntil.get(enId) ?? 0) > renderTick;
            const tex = getEnemyTexture(
              en.defId,
              colorHex,
              en.isBoss,
              Boolean(en.isReaper),
              animFrame,
              flashWhite,
            );

            let sp = enemySprites.get(enId);
            if (!sp) {
              sp = new Sprite(tex);
              sp.anchor.set(0.5, 0.5);
              enemySprites.set(enId, sp);
              enemyContainer.addChild(sp);
            } else if (sp.texture !== tex) {
              sp.texture = tex;
            }

            sp.visible = true;
            sp.position.set(sx, sy);
            const faceDir = en.x > run.player.x ? -1 : 1;
            const baseScale = en.isReaper ? 1.45 : en.isBoss ? 1.2 : 1.0;
            sp.scale.set(faceDir * baseScale, baseScale);

            if (en.isBoss) {
              const barW = Math.max(40, en.radius * 2.4);
              const hpRatio = Math.max(0, Math.min(1, en.hp / Math.max(1, en.maxHp)));
              enemyHpGraphics
                .rect(sx - barW / 2 - 1, sy - en.radius - 16, barW + 2, 6)
                .fill({ color: 0x05070c });
              enemyHpGraphics
                .rect(sx - barW / 2, sy - en.radius - 15, barW * hpRatio, 4)
                .fill({ color: en.isReaper ? 0xfacc15 : 0xef4444 });
            }
          }

          for (const [enId, sp] of enemySprites.entries()) {
            if (!activeEnemyIds.has(enId)) {
              const last = enemyPrevHp.get(enId);
              if (last && !profile.settings.lowFxMode) {
                spawnDeathBurst(last.x, last.y, last.color);
              }
              enemyPrevHp.delete(enId);
              enemyHitFlashUntil.delete(enId);
              sp.destroy();
              enemySprites.delete(enId);
            }
          }

          // 5. Projectiles & Weapon Crescent Slashes
          projectileFxGraphics.clear();
          const activeProjIds = new Set<string>();

          for (const [pjId, pj] of Object.entries(run.projectiles)) {
            const sx = pj.x - camX;
            const sy = pj.y - camY;
            if (
              sx + pj.radius < -60 ||
              sx - pj.radius > logicalW + 60 ||
              sy + pj.radius < -60 ||
              sy - pj.radius > logicalH + 60
            ) {
              continue;
            }

            const pjColor = hexToNumber(pj.color, 0xf8fafc);

            if (pj.behavior === 'whip_horizontal' || pj.behavior === 'omni_sword') {
              // 经典水平锐利鞭击破空斩光 (Castlevania / VS 经典水平电光抽打，绝非香蕉拱桥)
              const dir = pj.attackDirectionX ?? (sx >= playerScreenX ? 1 : -1);
              const isEvolved = pj.weaponId.includes('tear') || pj.weaponId.includes('bloody');
              const primaryColor = isEvolved ? 0xef4444 : 0xf59e0b;
              const shadowColor = isEvolved ? 0x7f1d1d : 0x92400e;
              const coreColor = isEvolved ? 0xfca5a5 : 0xfef08a;

              const halfW = pj.radius;
              const startX = sx - halfW;
              const fullW = halfW * 2;

              // 水平双层刃光：中段饱满利落，两端微收
              projectileFxGraphics
                .rect(startX, sy - 3, fullW, 6)
                .fill({ color: shadowColor, alpha: 0.35 });
              projectileFxGraphics
                .rect(startX + 4, sy - 2, fullW - 8, 4)
                .fill({ color: primaryColor, alpha: 0.9 });
              projectileFxGraphics
                .rect(startX + 8, sy - 1, fullW - 16, 2)
                .fill({ color: coreColor, alpha: 1.0 });
              projectileFxGraphics
                .rect(startX + 16, sy, fullW - 32, 1)
                .fill({ color: 0xffffff, alpha: 1.0 });

              // 挥击前哨爆鸣十字火花
              const tipX = dir > 0 ? sx + halfW : sx - halfW;
              projectileFxGraphics
                .rect(tipX - 2, sy - 2, 4, 4)
                .fill({ color: 0xffffff, alpha: 1.0 });
              projectileFxGraphics
                .rect(tipX + dir * 3, sy - 3, 2, 2)
                .fill({ color: coreColor, alpha: 0.9 });
              projectileFxGraphics
                .rect(tipX + dir * 6, sy + 1, 2, 2)
                .fill({ color: primaryColor, alpha: 0.8 });

              continue;
            } else if (pj.behavior === 'scan_phaser') {
              // 高能光子扫描激光：朝面向方向穿透喷射，前端收束，带光子等离子火花与尾端聚能环
              const dir = pj.attackDirectionX ?? (run.player.facingX < 0 ? -1 : 1);
              const beamOriginX = sx - dir * pj.radius;
              const beamEndX = sx + dir * pj.radius;
              const startX = Math.min(beamOriginX, beamEndX);
              const beamLen = Math.abs(beamEndX - beamOriginX);

              // 激光束主脉冲（外围等离子紫、内层高能粉、中心纯白强光）
              projectileFxGraphics
                .rect(startX, sy - 2, beamLen, 5)
                .fill({ color: 0x701a75, alpha: 0.45 });
              projectileFxGraphics
                .rect(startX, sy - 1, beamLen, 3)
                .fill({ color: 0xf472b6, alpha: 0.9 });
              projectileFxGraphics
                .rect(startX, sy, beamLen, 1)
                .fill({ color: 0xffffff, alpha: 1.0 });

              // 发射源高能等离子十字聚光点
              projectileFxGraphics
                .rect(beamOriginX - 3, sy - 3, 6, 6)
                .fill({ color: 0xf472b6, alpha: 0.8 });
              projectileFxGraphics
                .rect(beamOriginX - 2, sy - 2, 4, 4)
                .fill({ color: 0xffffff, alpha: 1.0 });

              // 穿透尖峰离子火星
              const tipX = beamEndX;
              projectileFxGraphics
                .rect(tipX - 2, sy - 2, 4, 4)
                .fill({ color: 0xffffff, alpha: 1.0 });
              projectileFxGraphics
                .rect(tipX + dir * 4, sy - 4, 2, 2)
                .fill({ color: 0x38bdf8, alpha: 0.85 });
              projectileFxGraphics
                .rect(tipX + dir * 8, sy + 3, 2, 2)
                .fill({ color: 0xf472b6, alpha: 0.85 });

              continue;
            }

            activeProjIds.add(pjId);
            let sp = projectileSprites.get(pjId);
            const tex = getProjectileTexture(pj.weaponId, pj.behavior, pj.color);
            if (!sp) {
              sp = new Sprite(tex);
              sp.anchor.set(0.5, 0.5);
              projectileSprites.set(pjId, sp);
              projectileContainer.addChild(sp);
            } else if (sp.texture !== tex) {
              sp.texture = tex;
            }

            sp.visible = true;
            sp.position.set(sx, sy);
            // The visible body should fit the same radius used by collision.
            sp.width = sp.height = pj.radius * 2;

            if (
              pj.behavior === 'orbit_ring' ||
              pj.behavior === 'lob_arc' ||
              pj.behavior === 'boomerang_cross' ||
              pj.behavior === 'bounce_bone'
            ) {
              sp.rotation = renderTick * 0.24;
            } else {
              sp.rotation = Math.atan2(pj.vy, pj.vx);
            }

            projectileFxGraphics
              .circle(sx, sy, Math.min(18, Math.max(7, pj.radius * 0.6)))
              .fill({ color: pjColor, alpha: 0.24 });
          }

          for (const [pjId, sp] of projectileSprites.entries()) {
            if (!activeProjIds.has(pjId)) {
              sp.destroy();
              projectileSprites.delete(pjId);
            }
          }

          // 6. Player 24x24 Shaded Pixel Character + Under-Feet HP Bar
          playerFxGraphics.clear();
          const isMoving =
            Math.hypot(run.player.moveInputX, run.player.moveInputY) > 0.05;
          const playerFrame = isMoving ? (run.tick >> 3) % 4 : 0;

          playerSprite.texture = getCharacterTexture(run.characterId, playerFrame);
          playerSprite.position.set(playerScreenX, playerScreenY);
          const facingSign = run.player.facingX < 0 ? -1 : 1;
          playerSprite.scale.set(facingSign, 1.0);
          playerSprite.alpha =
            run.player.invulnerableTicks > 0 && (run.tick & 2) === 0 ? 0.5 : 1;

          // 贴合角色脚底的自然像素暗影 (无生硬浮空与死板圆盘)
          playerFxGraphics
            .ellipse(playerScreenX, playerScreenY + 16, 16, 5)
            .fill({ color: 0x000000, alpha: 0.52 });

          if (run.player.laurelCharges > 0) {
            playerFxGraphics
              .circle(playerScreenX, playerScreenY, 26)
              .stroke({ color: 0x4ade80, width: 2, alpha: 0.85 });
          }

          // Embers of the Long Night HP bar directly under character's feet
          const hpBarW = 44;
          const hpRatio = Math.max(0, Math.min(1, run.player.hp / Math.max(1, run.player.maxHp)));
          playerFxGraphics
            .rect(playerScreenX - hpBarW / 2 - 1, playerScreenY + 26, hpBarW + 2, 7)
            .fill({ color: 0x05070c });
          playerFxGraphics
            .rect(playerScreenX - hpBarW / 2, playerScreenY + 27, hpBarW, 5)
            .fill({ color: 0x450a0a });
          playerFxGraphics
            .rect(playerScreenX - hpBarW / 2, playerScreenY + 27, hpBarW * hpRatio, 5)
            .fill({ color: 0xef4444 });

          // 7. Death Particles & Floating Damage Numbers
          particleGraphics.clear();
          for (let i = deathParticles.length - 1; i >= 0; i--) {
            const pt = deathParticles[i]!;
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life--;
            if (pt.life <= 0) {
              deathParticles.splice(i, 1);
              continue;
            }
            particleGraphics
              .rect(pt.x, pt.y, pt.size, pt.size)
              .fill({ color: pt.color, alpha: pt.life / 16 });
          }

          for (let i = floatingDamages.length - 1; i >= 0; i--) {
            const fd = floatingDamages[i]!;
            fd.y += fd.vy;
            fd.life--;
            if (fd.life <= 0) {
              fd.node.destroy();
              floatingDamages.splice(i, 1);
              continue;
            }
            fd.node.position.set(fd.x, fd.y);
            fd.node.alpha = Math.min(1, fd.life / 12);
          }
        });
      } catch (err) {
        if (!disposed) {
          setWebglError(err instanceof Error ? err.message : 'WebGL 渲染器初始化失败');
        }
      }
    }

    void bootPixi();

    return () => {
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (onWindowResize) {
        window.removeEventListener('resize', onWindowResize);
        onWindowResize = null;
      }
      if (app) {
        app.destroy(false, { children: true });
        app = null;
      }
      enemySprites.clear();
      pickupSprites.clear();
      projectileSprites.clear();
      propSprites.clear();
      labelPool.clear();
    };
  }, [engine]);

  return (
    <div ref={hostRef} className="lne-canvas-host">
      {webglError ? (
        <div className="lne-webgl-error" role="alert">
          PixiJS WebGL 渲染器无法启动：{webglError}
        </div>
      ) : null}
    </div>
  );
}
