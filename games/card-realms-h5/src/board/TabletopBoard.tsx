import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { CARD_MAP, RECIPES } from '../content/ledger.ts';
import type { SoundController } from '../audio/sound.ts';
import { getEffectiveVillagerStats, type CardRealmsEngine } from '../core/engine.ts';
import type { CardCategory, CardInstance, Job, RunState, Stack } from '../core/types.ts';

const CARD_WIDTH = 112;
const CARD_HEADER_OFFSET = 28;

const CATEGORY_META: Record<CardCategory, { label: string; color: string; bg: string; icon: string }> = {
  villager: { label: '村民', color: '#854d0e', bg: '#fef3c7', icon: '🧑' },
  animal: { label: '动物', color: '#9a3412', bg: '#ffedd5', icon: '🐾' },
  food: { label: '食物', color: '#991b1b', bg: '#fee2e2', icon: '🍎' },
  resource: { label: '资源', color: '#374151', bg: '#f3f4f6', icon: '🪵' },
  harvestable: { label: '采集点', color: '#166534', bg: '#dcfce7', icon: '🌲' },
  building: { label: '建筑', color: '#1e40af', bg: '#dbeafe', icon: '🏠' },
  equipable: { label: '装备', color: '#5b21b6', bg: '#ede9fe', icon: '⚔️' },
  enemy: { label: '敌对', color: '#7f1d1d', bg: '#fecaca', icon: '👹' },
  blueprint: { label: '主意', color: '#0369a1', bg: '#e0f2fe', icon: '💡' },
  rumor: { label: '传闻', color: '#0f766e', bg: '#ccfbf1', icon: '📜' },
  portal: { label: '传送门', color: '#6b21a8', bg: '#f3e8ff', icon: '🌀' },
  container: { label: '容器', color: '#92400e', bg: '#fde68a', icon: '📦' },
  boat: { label: '船只', color: '#1d4ed8', bg: '#bfdbfe', icon: '⛵' },
  currency: { label: '货币', color: '#a16207', bg: '#fef08a', icon: '🪙' },
  corpse: { label: '遗骸', color: '#4b5563', bg: '#e5e7eb', icon: '🪦' },
  system: { label: '系统', color: '#6b7280', bg: '#f3f4f6', icon: '⚙️' },
};

type DragState = {
  moved: boolean;
  originX: number;
  originY: number;
  pointerId: number;
  sourceStackId: string;
  startCardIndex: number;
  cardIds: string[];
  offsetX: number;
  offsetY: number;
  worldX: number;
  worldY: number;
  overSellZone: boolean;
  hoverTargetStackId?: string;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originPanX: number;
  originPanY: number;
};

type Props = {
  revealedCardIds: Set<string>;
  engine: CardRealmsEngine;
  run: RunState;
  sound: SoundController;
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string) => void;
};

export function TabletopBoard({
  engine,
  run,
  sound,
  selectedInstanceId,
  onSelectInstance,
  revealedCardIds,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sellZoneRef = useRef<HTMLDivElement | null>(null);

  const [camera, setCamera] = useState({ x: 30, y: 20, scale: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const lastPress = useRef<{ id: string; time: number } | null>(null);

  useEffect(() => {
    const cancel = () => {
      setDrag(null);
      setPan(null);
      lastPress.current = null;
      engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'drag', active: false });
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [engine]);

  const board = run.boards[run.activeRegion];
  const jobsByStackId = new Map<string, Job>();
  for (const job of Object.values(board.jobs)) {
    jobsByStackId.set(job.stackId, job);
  }

  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: (clientX - rect.left - camera.x) / camera.scale,
      y: (clientY - rect.top - camera.y) / camera.scale,
    };
  }

  function isClientOverSellZone(clientX: number, clientY: number): boolean {
    const rect = sellZoneRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function findSnapTargetStack(
    worldX: number,
    worldY: number,
    excludeStackId: string,
  ): Stack | undefined {
    let best: Stack | undefined;
    let bestDist = 88;
    for (const stk of Object.values(board.stacks)) {
      if (stk.stackId === excludeStackId || stk.lockedByEncounterId || stk.cardIds.length === 0) {
        continue;
      }
      const stackBottomY = stk.y + (stk.cardIds.length - 1) * CARD_HEADER_OFFSET;
      const dist = Math.hypot(stk.x - worldX, stackBottomY - worldY);
      if (dist < bestDist) {
        bestDist = dist;
        best = stk;
      }
    }
    return best;
  }

  function computePreviewHint(d: DragState): string | null {
    if (d.overSellZone) {
      let total = 0;
      for (const cid of d.cardIds) {
        const inst = run.instances[cid];
        const def = inst ? CARD_MAP[inst.defId] : undefined;
        if (def && def.value > 0 && def.category !== 'currency') {
          total += def.value;
          if (inst && inst.storedCount > 0 && inst.storedDefId) {
            total += inst.storedCount * Math.max(1, CARD_MAP[inst.storedDefId]?.value ?? 1);
          }
        }
      }
      return total > 0
        ? `松开出售（+${total} ${run.activeRegion === 'island' ? '贝壳' : '金币'}）`
        : '此卡牌不可出售';
    }

    if (!d.hoverTargetStackId) return null;
    const target = board.stacks[d.hoverTargetStackId];
    if (!target || target.cardIds.length === 0) return null;

    const topTargetInst = run.instances[target.cardIds[target.cardIds.length - 1]!];
    const firstMovingInst = run.instances[d.cardIds[0]!];
    if (!topTargetInst || !firstMovingInst) return null;

    const topDef = CARD_MAP[topTargetInst.defId]!;
    const movingDef = CARD_MAP[firstMovingInst.defId]!;

    if (topDef.id === 'trash_can') {
      return '放入垃圾桶销毁';
    }
    if (topDef.category === 'container') {
      return `存入 ${topDef.nameZh}`;
    }
    if (d.cardIds.length === 1 && movingDef.category === 'equipable' && topDef.category === 'villager') {
      return `为 ${topDef.nameZh} 装备 ${movingDef.nameZh}`;
    }

    // Check if combined stack matches a recipe
    const combinedDefCounts: Record<string, number> = {};
    let hasWorker = false;
    for (const cid of [...target.cardIds, ...d.cardIds]) {
      const inst = run.instances[cid];
      if (!inst) continue;
      combinedDefCounts[inst.defId] = (combinedDefCounts[inst.defId] ?? 0) + 1;
      if (CARD_MAP[inst.defId]?.category === 'villager' && inst.defId !== 'kid') {
        hasWorker = true;
      }
    }
    for (const r of RECIPES) {
      if (r.requireWorker && !hasWorker) continue;
      const inputsOk =
        Object.keys(r.inputs).length > 0 &&
        Object.entries(r.inputs).every(([k, qty]) => (combinedDefCounts[k] ?? 0) >= qty);
      const catsOk = r.catalysts.every((c) => (combinedDefCounts[c] ?? 0) >= 1);
      if (inputsOk && catsOk) {
        return `可合成：${r.nameZh}`;
      }
    }

    if (
      hasWorker &&
      [...target.cardIds, ...d.cardIds].some(
        (id) => CARD_MAP[run.instances[id]?.defId ?? '']?.category === 'harvestable',
      )
    ) {
      return '开始采集工作';
    }

    return `叠放到 ${topDef.nameZh}`;
  }

  function handleCardPointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    stack: Stack,
    cardIndex: number,
    instance: CardInstance,
  ) {
    if (e.button === 1) return; // Let middle-button panning bubble to the viewport.
    e.stopPropagation();
    onSelectInstance(instance.instanceId);
    if (e.button !== 0 || stack.lockedByEncounterId || run.monthEndPhase === 'feed') return;

    const now = performance.now();
    const doublePress = lastPress.current?.id === instance.instanceId && now - lastPress.current.time < 350;
    lastPress.current = { id: instance.instanceId, time: now };
    const effectiveIndex = e.shiftKey || doublePress ? 0 : cardIndex;
    const movingIds = stack.cardIds.slice(effectiveIndex);
    if (movingIds.length === 0) return;

    const worldPt = clientToWorld(e.clientX, e.clientY);
    const cardWorldY = stack.y + effectiveIndex * CARD_HEADER_OFFSET;

    if (engine.getSnapshot().profile.settings.pauseOnDrag) {
      engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'drag', active: true });
    }
    sound.play('pickup');

    viewportRef.current?.setPointerCapture(e.pointerId);
    setDrag({
      moved: false,
      originX: stack.x,
      originY: cardWorldY,
      pointerId: e.pointerId,
      sourceStackId: stack.stackId,
      startCardIndex: effectiveIndex,
      cardIds: movingIds,
      offsetX: worldPt.x - stack.x,
      offsetY: worldPt.y - cardWorldY,
      worldX: stack.x,
      worldY: cardWorldY,
      overSellZone: false,
    });
  }

  function handleBoardPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.button !== 0 && e.button !== 1) || drag) return;
    e.preventDefault();
    viewportRef.current?.setPointerCapture(e.pointerId);
    setPan({
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: camera.x,
      originPanY: camera.y,
    });
  }

  function handleBoardPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag && e.pointerId === drag.pointerId) {
      const worldPt = clientToWorld(e.clientX, e.clientY);
      const nextX = worldPt.x - drag.offsetX;
      const nextY = worldPt.y - drag.offsetY;
      const moved = drag.moved || Math.hypot(nextX - drag.originX, nextY - drag.originY) > 3;
      if (moved) lastPress.current = null;
      const overSell = isClientOverSellZone(e.clientX, e.clientY);
      const snapTarget = overSell ? undefined : findSnapTargetStack(nextX, nextY, drag.sourceStackId);
      setDrag({
        ...drag,
        moved,
        worldX: nextX,
        worldY: nextY,
        overSellZone: overSell,
        hoverTargetStackId: snapTarget?.stackId,
      });
      return;
    }

    if (pan && e.pointerId === pan.pointerId) {
      setCamera((prev) => ({
        ...prev,
        x: pan.originPanX + (e.clientX - pan.startClientX),
        y: pan.originPanY + (e.clientY - pan.startClientY),
      }));
    }
  }

  function finishDragOrPan(pointerId: number) {
    if (drag && drag.pointerId === pointerId) {
      if (engine.getSnapshot().profile.settings.pauseOnDrag) {
        engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'drag', active: false });
      }
      if (!drag.moved) {
        setDrag(null);
        return;
      }
      if (drag.overSellZone) {
        const sold = engine.dispatch({
          type: 'SELL_STACK',
          stackId: drag.sourceStackId,
          startCardIndex: drag.startCardIndex,
        });
        sound.play(sold ? 'coin' : 'drop');
      } else {
        engine.dispatch({
          type: 'MOVE_CARDS',
          sourceStackId: drag.sourceStackId,
          startCardIndex: drag.startCardIndex,
          x: drag.worldX,
          y: drag.worldY,
          targetStackId: drag.hoverTargetStackId,
        });
        sound.play('drop');
      }
      setDrag(null);
    }
    if (pan && pan.pointerId === pointerId) {
      setPan(null);
    }
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setCamera((prev) => {
      const nextScale = Math.min(1.6, Math.max(0.55, Number((prev.scale + delta).toFixed(2))));
      return { ...prev, scale: nextScale };
    });
  }

  const previewText = drag ? computePreviewHint(drag) : null;
  const sortedStacks = Object.values(board.stacks).sort((a, b) => a.z - b.z);

  return (
    <div
      ref={viewportRef}
      className={`board-viewport region-${run.activeRegion}`}
      onPointerDown={handleBoardPointerDown}
      onPointerMove={handleBoardPointerMove}
      onPointerUp={(e) => finishDragOrPan(e.pointerId)}
      onPointerCancel={() => {
        setDrag(null);
        setPan(null);
        lastPress.current = null;
        engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'drag', active: false });
      }}
      onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
      onWheel={handleWheel}
    >
      {/* Top action strip: Sell box + camera controls */}
      <div className="board-overlay-top" onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={sellZoneRef}
          className={`sell-dropzone ${drag?.overSellZone ? 'sell-dropzone-active' : ''}`}
        >
          <span className="sell-icon">🪙</span>
          <div>
            <strong>拖拽到此出售</strong>
            <small>
              换取{run.activeRegion === 'island' ? '海岛贝壳' : '大陆金币'}（Shift+拖拽可整堆移动）
            </small>
          </div>
        </div>

        <div className="camera-controls">
          <button
            type="button"
            className="btn-subtle"
            onClick={() => engine.dispatch({ type: 'AUTO_ARRANGE_BOARD' })}
            title="按类别网格对齐整理当前桌面卡牌"
          >
            整理桌面
          </button>
          <button
            type="button"
            className="btn-subtle"
            onClick={() => setCamera({ x: 30, y: 20, scale: 1 })}
            title="重置视角与缩放"
          >
            重置视角 ({Math.round(camera.scale * 100)}%)
          </button>
          {run.activeRegion === 'forest' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => engine.dispatch({ type: 'RETREAT_FOREST' })}
            >
              撤离森林返回大陆
            </button>
          )}
        </div>
      </div>

      {previewText && (
        <div className="drag-preview-banner" role="status">
          {previewText}
        </div>
      )}

      {/* World Canvas */}
      <div
        className="board-world"
        style={{
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
        }}
      >
        {sortedStacks.map((stack) => {
          const isDraggingSource = drag?.sourceStackId === stack.stackId;
          const visibleCardIds = isDraggingSource
            ? stack.cardIds.slice(0, drag.startCardIndex)
            : stack.cardIds;
          if (visibleCardIds.length === 0) return null;

          const activeJob = jobsByStackId.get(stack.stackId);
          const encounter = stack.lockedByEncounterId
            ? board.encounters[stack.lockedByEncounterId]
            : undefined;
          const isHoverTarget = drag?.hoverTargetStackId === stack.stackId;

          const hasBoat = visibleCardIds.some(
            (id) => CARD_MAP[run.instances[id]?.defId ?? '']?.category === 'boat',
          );
          const hasPortal = visibleCardIds.some(
            (id) => CARD_MAP[run.instances[id]?.defId ?? '']?.category === 'portal',
          );

          return (
            <div
              key={stack.stackId}
              className={`card-stack ${isHoverTarget ? 'stack-hover-target' : ''} ${
                encounter ? 'stack-in-combat' : ''
              }`}
              style={{
                transform: `translate3d(${stack.x}px, ${stack.y}px, 0)`,
                zIndex: stack.z,
                width: CARD_WIDTH,
                height: 132 + (visibleCardIds.length - 1) * CARD_HEADER_OFFSET,
              }}
            >
              {activeJob && (
                <div className="stack-job-bar" title="工作进度">
                  <div
                    className="stack-job-fill"
                    style={{
                      width: `${Math.min(100, Math.round((activeJob.elapsedTicks / activeJob.totalTicks) * 100))}%`,
                    }}
                  />
                </div>
              )}

              {encounter && (
                <div className="stack-combat-banner">
                  ⚔️ {encounter.lastActionText}
                </div>
              )}

              {visibleCardIds.map((cid, idx) => {
                const inst = run.instances[cid];
                if (!inst) return null;
                const def = CARD_MAP[inst.defId];
                if (!def) return null;
                const meta = CATEGORY_META[def.category];
                const isSelected = selectedInstanceId === inst.instanceId;
                const effStats =
                  def.category === 'villager' ? getEffectiveVillagerStats(run, inst) : null;

                return (
                  <div
                    key={inst.instanceId}
                    tabIndex={0}
                    role="button"
                    aria-label={`${def.nameZh}，类别 ${meta.label}，售价 ${def.value > 0 ? def.value : '不可售'}`}
                    className={`paper-card ${isSelected ? 'paper-card-selected' : ''} ${revealedCardIds.has(cid) ? 'paper-card-revealed' : ''}`}
                    style={{
                      top: idx * CARD_HEADER_OFFSET,
                      backgroundColor: meta.bg,
                      borderColor: meta.color,
                    }}
                    onPointerDown={(e) => handleCardPointerDown(e, stack, idx, inst)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onSelectInstance(inst.instanceId);
                      }
                    }}
                  >
                    <div className="paper-card-header" style={{ backgroundColor: meta.color }}>
                      <span className="paper-card-title">{def.nameZh}</span>
                      {def.value > 0 && <span className="paper-card-coin">{def.value}</span>}
                    </div>
                    <div className="paper-card-body">
                      <div className="paper-card-icon">{meta.icon}</div>
                      <div className="paper-card-tag">{meta.label}</div>

                      <div className="paper-card-badges">
                        {def.foodValue > 0 && (
                          <span className="badge badge-food" title="食物值">
                            🍖{def.foodValue}
                          </span>
                        )}
                        {inst.maxHp > 0 && (
                          <span className="badge badge-hp" title="生命值">
                            ❤️{inst.hp}/{inst.maxHp}
                          </span>
                        )}
                        {(effStats ? effStats.attack : def.attack) > 0 && (
                          <span className="badge badge-atk" title="攻击力">
                            🗡️{effStats ? effStats.attack : def.attack}
                          </span>
                        )}
                        {inst.remainingUses > 0 && inst.remainingUses < 90 && (
                          <span className="badge badge-uses" title="剩余可采集次数">
                            ⛏️{inst.remainingUses}
                          </span>
                        )}
                        {def.category === 'container' && (
                          <span className="badge badge-store" title="容器储量">
                            📦{inst.storedCount}/{def.containerMax ?? 30}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasBoat && (
                <button
                  type="button"
                  className="stack-action-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    engine.dispatch({
                      type: 'TRAVEL_BOAT',
                      boatStackId: stack.stackId,
                      targetRegion: run.activeRegion === 'island' ? 'mainland' : 'island',
                    })
                  }
                >
                  ⛵ 航行前往{run.activeRegion === 'island' ? '大陆' : '海岛'}
                </button>
              )}

              {hasPortal && run.activeRegion !== 'forest' && (
                <button
                  type="button"
                  className="stack-action-btn stack-action-portal"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    engine.dispatch({
                      type: 'ENTER_PORTAL',
                      portalStackId: stack.stackId,
                    })
                  }
                >
                  🌀 进入黑暗森林
                </button>
              )}
            </div>
          );
        })}

        {/* Floating dragged stack */}
        {drag && (
          <div
            className="card-stack card-stack-dragging"
            style={{
              transform: `translate3d(${drag.worldX}px, ${drag.worldY}px, 0)`,
              zIndex: 99999,
              width: CARD_WIDTH,
              height: 132 + (drag.cardIds.length - 1) * CARD_HEADER_OFFSET,
            }}
          >
            {drag.cardIds.map((cid, idx) => {
              const inst = run.instances[cid];
              if (!inst) return null;
              const def = CARD_MAP[inst.defId];
              if (!def) return null;
              const meta = CATEGORY_META[def.category];
              return (
                <div
                  key={inst.instanceId}
                  className="paper-card"
                  style={{
                    top: idx * CARD_HEADER_OFFSET,
                    backgroundColor: meta.bg,
                    borderColor: meta.color,
                  }}
                >
                  <div className="paper-card-header" style={{ backgroundColor: meta.color }}>
                    <span className="paper-card-title">{def.nameZh}</span>
                    {def.value > 0 && <span className="paper-card-coin">{def.value}</span>}
                  </div>
                  <div className="paper-card-body">
                    <div className="paper-card-icon">{meta.icon}</div>
                    <div className="paper-card-tag">{meta.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
