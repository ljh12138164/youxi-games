import { cloneBoard, controlled, DELTAS, hasProperty, LABELS, move, newBoard, readRules } from './engine.ts';
import type { Board, Direction, Entity, Property, Rule } from './engine.ts';
import { CHALLENGE_START, LEVELS } from './levels.ts';
import { readProgress } from './storage.ts';
import type { Sound } from './audio.ts';

export type Viewport = { width: number; height: number; dpr: number; top: number; bottom: number };
export type Hit = { label: string; x: number; y: number; w: number; h: number; enabled: boolean; tap: () => void; direction?: Direction };
export type Platform = {
  canvas: HTMLCanvasElement; createImage: () => HTMLImageElement; atlas: string;
  viewport: () => Viewport; load: () => string | null; save: (value: string) => void; sound: Sound;
  ready?: () => void; onControls?: (hits: Hit[]) => void;
  reducedMotion?: boolean;
};
const C = { paper: '#f7edda', ink: '#204d43', muted: '#657265', red: '#be6040', line: '#b3baa0', pale: '#e9e5cd', white: '#fff9ed' };
const PROPERTY_LABELS: Record<Property, string> = { you: '可控制', push: '可推动', win: '是终点', stop: '会挡路', sink: '接触会沉没' };
type Screen = 'home' | 'play' | 'levels' | 'settings';

export function createRuleGame(platform: Platform) {
  const ctx = platform.canvas.getContext('2d')!, progress = readProgress(platform.load());
  let level = progress.level, board = progress.board ?? newBoard(LEVELS[level]), history = progress.history ?? [];
  let screen: Screen = 'home', returnScreen: Screen = 'home', loading = true, assetError = false;
  let chapter = level >= CHALLENGE_START ? 1 : 0;
  let showHint = false, clock = 0, elapsed = 0, notice = '', noticeUntil = 0;
  let view = platform.viewport(), wide = false, compact = false, w = 420, h = 900, scale = 1, ox = 0, oy = 0;
  let map = { x: 30, y: 198, tile: 40 }, hits: Hit[] = [], signature = '', temporaryMuted = false;
  let gesture: { x: number; y: number; lastX: number; lastY: number; board: boolean } | null = null;
  let held: Direction | null = null, repeatAt = 0, motion: { previous: Board; elapsed: number } | null = null;
  let systemReducedMotion = platform.reducedMotion ?? false, hovered = '', pressed = '', pressedUntil = 0;
  let blocked: { direction: Direction; ids: number[]; until: number } | null = null;
  let changedRules: { added: Rule[]; removed: Rule[]; until: number } | null = null;
  const reducedMotion = () => systemReducedMotion || progress.reducedMotion;
  const pauses = new Set<string>();
  const atlas = platform.createImage();
  const running = () => !loading && !assetError && screen === 'play' && !board.won && !pauses.size && !(compact && !wide && showHint);
  const controlsEnabled = () => !loading && !assetError && !pauses.size;
  function syncSound() { platform.sound.setMuted(progress.muted || temporaryMuted); platform.sound.setPaused(!running()); }
  function save() {
    progress.level = level; progress.board = cloneBoard(board); progress.history = history.slice(-64).map(cloneBoard);
    platform.save(JSON.stringify(progress));
  }
  function round(x: number, y: number, width: number, height: number, fill: string, radius = 12, stroke?: string) {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
  }
  function text(value: string, x: number, y: number, size = 16, color = C.ink, align: CanvasTextAlign = 'left', weight = 500, display = false) {
    ctx.font = `${weight} ${size}px ${display ? 'KaiTi, STKaiti, serif' : 'sans-serif'}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
  }
  function wrap(value: string, x: number, y: number, width: number, size = 15, color = C.ink) {
    let line = '', row = 0;
    ctx.font = `500 ${size}px sans-serif`;
    for (const ch of value) {
      if (ctx.measureText(line + ch).width > width) {
        const carry = /[，。！？、；：]/.test(ch) ? line.slice(-2) : '';
        text(carry ? line.slice(0, -2) : line, x, y + row * (size + 9), size, color); line = carry + ch; row++;
      }
      else line += ch;
    }
    if (line) text(line, x, y + row * (size + 9), size, color);
    return (row + 1) * (size + 9);
  }
  function line(x1: number, y1: number, x2: number, y2: number, color = C.line, width = 1) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
  }
  function sprite(index: number, x: number, y: number, size: number, flip = false) {
    if (loading || assetError) return;
    const cw = atlas.width / 3, ch = atlas.height / 2, padding = .09;
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(atlas, index % 3 * cw + cw * padding, Math.floor(index / 3) * ch + ch * padding, cw * (1 - padding * 2), ch * (1 - padding * 2), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  function button(label: string, x: number, y: number, width: number, height: number, action: () => void, options: { primary?: boolean; enabled?: boolean; direction?: Direction } = {}) {
    const enabled = (options.enabled ?? true) && controlsEnabled();
    const isPressed = enabled && ((options.direction && options.direction === held) || (pressed === label && clock < pressedUntil));
    const isHovered = enabled && hovered === label;
    round(x, y, width, height, isPressed ? C.ink : options.direction || isHovered ? C.pale : options.primary ? enabled ? C.ink : '#879487' : enabled ? C.paper : '#e7e4d4', 11, options.primary ? undefined : C.ink);
    if (options.direction) {
      const [dx, dy] = DELTAS[options.direction];
      const cx = x + width / 2, cy = y + height / 2;
      ctx.beginPath(); ctx.moveTo(cx + dx * 10, cy + dy * 10); ctx.lineTo(cx - dx * 6 + dy * 8, cy - dy * 6 - dx * 8); ctx.lineTo(cx - dx * 6 - dy * 8, cy - dy * 6 + dx * 8); ctx.closePath(); ctx.fillStyle = isPressed ? C.white : enabled ? C.ink : C.muted; ctx.fill();
    } else text(label, x + width / 2, y + height / 2, 16, isPressed || options.primary && !isHovered ? C.white : enabled ? C.ink : C.muted, 'center', 700);
    hits.push({ label, x: ox + x * scale, y: oy + y * scale, w: width * scale, h: height * scale, enabled, tap: () => { if (!enabled) return; pressed = label; pressedUntil = clock + .12; action(); render(); }, direction: options.direction });
  }
  function enterLevel(index: number) {
    if ((index >= progress.unlocked && index !== CHALLENGE_START) || !LEVELS[index]) return;
    progress.unlocked = Math.max(progress.unlocked, index + 1);
    level = index; board = newBoard(LEVELS[index]); history = []; screen = 'play'; motion = null; showHint = false; notice = ''; held = null; blocked = null; changedRules = null;
    pauses.delete('manual'); save(); syncSound(); render();
  }
  function act(direction: Direction) {
    if (!running()) return;
    pressed = { up: '向上', down: '向下', left: '向左', right: '向右' }[direction]; pressedUntil = clock + .12;
    const result = move(board, direction);
    if (!result.moved) {
      const actors = controlled(board), [dx, dy] = DELTAS[direction], rules = readRules(board.entities);
      if (!actors.length) return;
      const outside = actors.every(e => e.x + dx < 0 || e.x + dx >= 9 || e.y + dy < 0 || e.y + dy >= 10);
      const stopper = board.entities.find(e => actors.some(actor => actor.x + dx === e.x && actor.y + dy === e.y) && hasProperty(e, 'stop', rules) && !hasProperty(e, 'push', rules));
      notice = outside ? '到棋盘边缘了，换个方向吧。' : stopper ? `${LABELS[stopper.kind as keyof typeof LABELS]}在挡路，试试调整规则。` : '前面推不动，换个方向或调整站位。';
      noticeUntil = clock + 1.8;
      if (!blocked || clock >= blocked.until) blocked = { direction, ids: actors.map(e => e.id), until: clock + .15 };
      held = null; render(); return;
    }
    history.push(cloneBoard(board)); if (history.length > 256) history.shift();
    const previous = visualBoard(), beforeRules = readRules(board.entities);
    if (blocked) { notice = ''; noticeUntil = 0; }
    board = result.board; motion = reducedMotion() ? null : { previous, elapsed: 0 }; blocked = null;
    if (result.rulesChanged) {
      const after = readRules(board.entities), key = (r: Rule) => `${r.noun}:${r.property}`;
      const added = after.filter(r => !beforeRules.some(old => key(old) === key(r)));
      const removed = beforeRules.filter(r => !after.some(next => key(next) === key(r)));
      changedRules = added.length || removed.length ? { added, removed, until: clock + .65 } : null;
      const labels = (rules: Rule[]) => [...new Set(rules.map(r => `${LABELS[r.noun]} 是 ${LABELS[r.property]}`))].join('、');
      notice = added.length ? `新规则：${labels(added)}` : removed.length ? `规则失效：${labels(removed)}` : '同样的规则仍在生效。'; noticeUntil = clock + 3;
    }
    else if (result.removed) { notice = '水和碰到它的东西一起沉没了，留下的空格可以通行。'; noticeUntil = clock + 4; }
    if (!controlled(board).length) { notice = '现在没有「你」了。点撤销，就能回到上一步。'; noticeUntil = Infinity; held = null; }
    if (board.won) {
      held = null;
      if (!progress.completed.includes(level)) progress.completed.push(level);
      progress.best[level] = Math.min(progress.best[level] ?? Infinity, board.steps);
      progress.unlocked = Math.min(LEVELS.length, Math.max(progress.unlocked, level + 2));
    }
    platform.sound.play(board.won ? 'win' : result.rulesChanged ? 'rule' : 'move'); save(); render();
  }
  function undo() {
    if (!controlsEnabled() || !history.length || screen !== 'play') return;
    const previous = visualBoard(); board = history.pop()!;
    motion = reducedMotion() ? null : { previous, elapsed: 0 }; notice = '已撤销上一步。'; noticeUntil = clock + 1.4;
    blocked = null; changedRules = null; held = null; save(); syncSound(); render();
  }
  function restart() {
    if (!controlsEnabled() || screen !== 'play') return;
    if (board.steps > 0) { history.push(cloneBoard(board)); if (history.length > 256) history.shift(); }
    board = newBoard(LEVELS[level]); motion = null; showHint = false; blocked = null; changedRules = null; held = null;
    notice = history.length ? '已重来，可撤销返回刚才的局面。' : '已经回到起点了。'; noticeUntil = clock + 3;
    save(); syncSound(); render();
  }
  function visualBoard(): Board {
    if (!motion) return cloneBoard(board);
    const t = 1 - Math.pow(1 - Math.min(1, motion.elapsed / .12), 3);
    return { ...board, entities: board.entities.map(entity => { const from = motion!.previous.entities.find(e => e.id === entity.id); return from ? { ...entity, x: from.x + (entity.x - from.x) * t, y: from.y + (entity.y - from.y) * t } : { ...entity }; }) };
  }
  function setPause(reason: string, paused: boolean) {
    if (paused) pauses.add(reason); else pauses.delete(reason);
    held = null; gesture = null; hovered = ''; pressed = ''; syncSound(); render();
  }
  function openMenu(target: 'levels' | 'settings') {
    if (target === 'levels') chapter = level >= CHALLENGE_START ? 1 : 0;
    returnScreen = screen === 'play' ? 'play' : 'home'; screen = target; held = null; gesture = null; syncSound(); render();
  }
  function paper() {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, w, h);
    // Fixed paper speckles stay still; the puzzle never relies on color alone.
    ctx.fillStyle = '#c5ae8330';
    for (let i = 0; i < 900; i++) { const x = (i * 127.53) % w, y = (i * 73.97) % h; ctx.fillRect(x, y, i % 3 === 0 ? 1.2 : .6, .7); }
    round(12, 12, w - 24, h - 24, '#00000000', 20, C.ink);
  }
  function heading() {
    text('文字世界', wide ? 49 : 30, wide ? 61 : 48, wide ? 38 : 32, C.ink, 'left', 800, true);
    sprite(0, wide ? 966 : 364, wide ? 62 : 49, wide ? 62 : 52);
    line(wide ? 49 : 30, wide ? 100 : 83, w - (wide ? 49 : 30), wide ? 100 : 83);
  }
  function drawBoard() {
    const { x, y, tile } = map;
    round(x - 2, y - 2, tile * 9 + 4, tile * 10 + 4, '#f4e6c9', 8, C.ink);
    for (let row = 0; row < 10; row++) for (let col = 0; col < 9; col++) {
      if ((row * 5 + col * 7) % 4 === 0) { ctx.fillStyle = '#e9d6b02b'; ctx.fillRect(x + col * tile, y + row * tile, tile, tile); }
    }
    for (let col = 1; col < 9; col++) line(x + col * tile, y, x + col * tile, y + tile * 10, '#9cae9566');
    for (let row = 1; row < 10; row++) line(x, y + row * tile, x + tile * 9, y + row * tile, '#9cae9566');
    const rules = readRules(board.entities), active = new Set(rules.flatMap(r => r.ids));
    const order = (entity: Entity) => entity.kind === 'wall' ? 0 : entity.kind === 'flag' ? 1 : entity.kind === 'rock' ? 2 : entity.kind === 'text' ? 3 : 4;
    for (const entity of [...board.entities].sort((a, b) => order(a) - order(b))) {
      const previous = motion?.previous.entities.find(e => e.id === entity.id);
      const t = motion ? 1 - Math.pow(1 - Math.min(1, motion.elapsed / .12), 3) : 1;
      const gx = previous ? previous.x + (entity.x - previous.x) * t : entity.x;
      const gy = previous ? previous.y + (entity.y - previous.y) * t : entity.y;
      let cx = x + (gx + .5) * tile, cy = y + (gy + .5) * tile;
      if (!reducedMotion() && blocked && clock < blocked.until && blocked.ids.includes(entity.id)) {
        const p = 1 - (blocked.until - clock) / .15, [dx, dy] = DELTAS[blocked.direction];
        const distance = Math.sin(p * Math.PI) * 3 * (1 - p); cx += dx * distance; cy += dy * distance;
      }
      ctx.save();
      if (motion && !previous) ctx.globalAlpha = .5 + .5 * t;
      if (entity.kind === 'text') {
        const isProperty = ['you', 'push', 'win', 'stop', 'sink'].includes(entity.word!);
        if (entity.word === 'is') round(cx - tile * .45, cy - tile * .45, tile * .9, tile * .9, C.ink, 5);
        else sprite(isProperty ? 5 : 4, cx, cy, tile * 1.12);
        if (!active.has(entity.id)) { ctx.fillStyle = '#f7edda44'; ctx.fillRect(cx - tile * .43, cy - tile * .43, tile * .86, tile * .86); }
        text(LABELS[entity.word!], cx, cy + .5, LABELS[entity.word!].length > 1 ? Math.max(12, tile * .38) : Math.max(14, tile * .45), isProperty || entity.word === 'is' ? C.white : C.ink, 'center', 800, true);
        if (active.has(entity.id)) { ctx.fillStyle = isProperty || entity.word === 'is' ? '#fff5df' : C.ink; ctx.fillRect(cx - 3, cy + tile * .34, 6, 1.5); }
        if (changedRules && clock < changedRules.until) {
          const added = changedRules.added.some(r => r.ids.includes(entity.id));
          const removed = changedRules.removed.some(r => r.ids.includes(entity.id));
          if (added || removed) {
            ctx.save(); ctx.globalAlpha *= reducedMotion() ? 1 : Math.min(1, (changedRules.until - clock) / .24);
            ctx.strokeStyle = added ? C.ink : C.red; ctx.lineWidth = 2.5; if (!added) ctx.setLineDash([3, 3]);
            ctx.strokeRect(cx - tile * .47, cy - tile * .47, tile * .94, tile * .94); ctx.restore();
          }
        }
      } else if (entity.kind === 'water') {
        round(cx - tile * .46, cy - tile * .46, tile * .92, tile * .92, '#a9c9c4', 5, '#507f79');
        for (const dy of [-.18, .15]) {
          ctx.beginPath(); ctx.moveTo(cx - tile * .3, cy + tile * dy); ctx.quadraticCurveTo(cx - tile * .15, cy + tile * (dy - .12), cx, cy + tile * dy); ctx.quadraticCurveTo(cx + tile * .15, cy + tile * (dy + .12), cx + tile * .3, cy + tile * dy); ctx.strokeStyle = '#416c68'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      } else {
        sprite(entity.kind === 'cat' ? 0 : entity.kind === 'rock' ? 1 : entity.kind === 'wall' ? 2 : 3, cx, cy, tile * (entity.kind === 'wall' ? 1.27 : 1.03));
        if (entity.kind !== 'cat' && rules.some(r => r.noun === entity.kind && r.property === 'you')) {
          round(cx - tile * .34, cy + tile * .22, tile * .68, tile * .29, C.ink, 3); text('你', cx, cy + tile * .36, tile * .23, C.white, 'center', 700);
        }
      }
      ctx.restore();
    }
  }
  function drawDpad(x: number, y: number, size: number, gap: number) {
    for (const direction of ['up', 'left', 'right', 'down'] as Direction[]) {
      const [dx, dy] = DELTAS[direction];
      button({ up: '向上', down: '向下', left: '向左', right: '向右' }[direction], x + (dx + 1) * (size + gap), y + (dy + 1) * (size + gap), size, size, () => act(direction), { enabled: running(), direction });
    }
    text('移动', x + size * 1.5 + gap, y + size * 1.5 + gap, 12, C.muted, 'center');
  }
  function drawRules(x: number, y: number, width: number) {
    const rules = readRules(board.entities), seen = new Set<string>();
    text('此刻的规则', x, y, 15, C.muted);
    let row = 0;
    for (const rule of rules) {
      const key = `${rule.noun}:${rule.property}`; if (seen.has(key)) continue; seen.add(key);
      if (row >= 5) break;
      text(`${LABELS[rule.noun]} 是 ${LABELS[rule.property]}`, x, y + 32 + row * 29, 17, C.ink, 'left', 700, true);
      text(PROPERTY_LABELS[rule.property], x + width, y + 32 + row * 29, 13, C.muted, 'right'); row++;
    }
    if (!rules.some(r => r.property === 'you')) wrap('没有可控制的对象，试试撤销。', x, y + 36 + row * 29, width, 15, C.red);
  }
  function drawPlay() {
    if (compact) { drawCompactPlay(); if (board.won) drawWin(); return; }
    const current = LEVELS[level];
    if (wide) {
      round(48, 120, 80, 27, C.red, 7); text(`第 ${String(level + 1).padStart(2, '0')} 关`, 88, 134, 14, C.white, 'center', 700);
      text(current.title, 143, 134, 21, C.ink, 'left', 700, true);
      text(`${board.steps} 步`, 568, 134, 15, C.muted);
      button('选关', 818, 115, 74, 40, () => openMenu('levels'));
      button('设置', 904, 115, 88, 40, () => openMenu('settings'));
      drawBoard(); drawRules(568, 185, 410);
      wrap(showHint ? current.hint : current.intro, 568, 371, 410, 16);
      if (notice && clock < noticeUntil) wrap(notice, 568, 444, 410, 14, C.red);
      button('撤销', 568, 511, 122, 47, undo, { enabled: history.length > 0 });
      button('重来', 568, 572, 122, 47, restart);
      button(showHint ? '收起提示' : '给点提示', 568, 633, 122, 44, () => { showHint = !showHint; render(); });
      drawDpad(769, 502, 51, 4);
      text('方向键 / WASD 移动 · Z 撤销 · R 重来', 48, 676, 14, C.muted);
    } else {
      round(30, 102, 88, 29, C.red, 7); text(`第 ${String(level + 1).padStart(2, '0')} 关`, 74, 117, 14, C.white, 'center', 700);
      text(current.title, 130, 118, 18, C.ink, 'left', 700, true);
      text(`${board.steps} 步`, 31, 155, 14, C.muted);
      button('选关', 244, 144, 67, 37, () => openMenu('levels')); button('设置', 321, 144, 69, 37, () => openMenu('settings'));
      drawBoard();
      const message = notice && clock < noticeUntil ? notice : showHint ? current.hint : current.intro;
      wrap(message, 30, 625, 360, 14, !controlled(board).length ? C.red : C.ink);
      button('撤销', 30, 705, 126, 47, undo, { enabled: history.length > 0 });
      button('重来', 30, 766, 126, 47, restart);
      button(showHint ? '收起提示' : '给点提示', 30, 827, 126, 41, () => { showHint = !showHint; render(); });
      drawDpad(222, 704, 50, 6);
      text('滑动棋盘 / 方向按钮', 306, 881, 12, C.muted, 'center');
    }
    if (board.won) drawWin();
  }
  function drawWin() {
    held = null; hits = [];
    ctx.fillStyle = '#203e3670'; ctx.fillRect(0, 0, w, h);
    if (compact && wide) {
      round(16, 16, w - 32, h - 32, C.paper, 16, C.ink); sprite(0, w * .24, h * .48, Math.min(140, h * .45));
      const x = w * .43, width = w * .5;
      text(progress.completed.length === LEVELS.length ? '小猫改写了整个世界！' : '这条规则，你说了算。', x, 66, 24, C.ink, 'left', 800, true);
      text(`${board.steps} 步过关 · 已完成 ${progress.completed.length} / ${LEVELS.length} 关`, x, 112, 14, C.muted);
      button(level < LEVELS.length - 1 ? '去下一关' : '看看全部关卡', x, h - 130, width, 48, () => level < LEVELS.length - 1 ? enterLevel(level + 1) : openMenu('levels'), { primary: true });
      button('撤销最后一步', x, h - 70, width, 44, undo, { enabled: history.length > 0 }); return;
    }
    const boxW = wide ? 440 : 350, boxH = 386, x = (w - boxW) / 2, y = (h - boxH) / 2;
    round(x, y, boxW, boxH, C.paper, 18, C.ink); sprite(0, w / 2, y + 66, 84);
    const allDone = progress.completed.length === LEVELS.length;
    text(allDone ? '小猫改写了整个世界！' : '这条规则，你说了算。', w / 2, y + 133, wide ? 26 : 23, C.ink, 'center', 800, true);
    text(`${board.steps} 步过关 · 本关最佳 ${progress.best[level]} 步`, w / 2, y + 179, 15, C.muted, 'center');
    text(`已完成 ${progress.completed.length} / ${LEVELS.length} 关`, w / 2, y + 212, 14, C.muted, 'center');
    button(level < LEVELS.length - 1 ? '去下一关' : '看看全部关卡', x + 36, y + 249, boxW - 72, 49,
      () => level < LEVELS.length - 1 ? enterLevel(level + 1) : openMenu('levels'), { primary: true });
    button('撤销最后一步', x + 36, y + 316, boxW - 72, 42, undo, { enabled: history.length > 0 });
  }
  function drawHome() {
    const cx = w / 2;
    sprite(0, cx, wide ? 220 : 240, wide ? 180 : 175);
    text('推开文字，改写小世界。', cx, wide ? 335 : 365, wide ? 32 : 27, C.ink, 'center', 800, true);
    text('小猫听谁的？由你写下的规则决定。', cx, wide ? 380 : 411, 15, C.muted, 'center');
    const x = cx - 142, y = wide ? 433 : 481;
    button(progress.completed.length || board.steps ? '继续解谜' : '开始解谜', x, y, 284, 54, () => { screen = 'play'; syncSound(); render(); }, { primary: true });
    button('挑选关卡', x, y + 75, 136, 47, () => openMenu('levels'));
    button('设置与操作', x + 148, y + 75, 136, 47, () => openMenu('settings'));
    text(`${LEVELS.length} 个手工关卡 · 不限时 · 随时撤销`, cx, y + 158, 14, C.muted, 'center');
    text(`已完成 ${progress.completed.length} / ${LEVELS.length} 关`, cx, y + 191, 14, C.ink, 'center');
  }
  function drawLevels() {
    const left = wide ? 170 : 30, top = wide ? 177 : 206, gap = wide ? 20 : 12, bw = wide ? 220 : 112, bh = wide ? 89 : 112;
    text('选一页，开始新的发现。', wide ? 170 : 30, wide ? 132 : 126, wide ? 25 : 21, C.ink, 'left', 700, true);
    chapterTabs(wide ? 480 : 30, wide ? 116 : 148, wide ? 390 : 360);
    const first = chapter ? CHALLENGE_START : 0, last = chapter ? LEVELS.length : CHALLENGE_START;
    for (let i = first; i < last; i++) {
      const slot = i - first, x = left + slot % 3 * (bw + gap), y = top + Math.floor(slot / 3) * (bh + gap), done = progress.completed.includes(i), enabled = i < progress.unlocked || i === CHALLENGE_START;
      button(`${String(i + 1).padStart(2, '0')}${done ? ' · 已过' : !enabled ? ' · 待解锁' : ''}`, x, y, bw, bh, () => enterLevel(i), { primary: i === level, enabled });
      text(LEVELS[i].title.length > 6 && !wide ? LEVELS[i].title.slice(0, 6) : LEVELS[i].title, x + bw / 2, y + bh * .78, wide ? 15 : 12, i === level ? C.white : C.muted, 'center');
    }
    button('返回', left, wide ? 627 : 728, wide ? 220 : 360, 48, () => { screen = returnScreen; syncSound(); render(); });
    text(chapter ? '挑战篇可以直接开始；过关解锁下一题。' : '入门认识规则，挑战练习组合与取舍。', w / 2, wide ? 694 : 806, 14, C.muted, 'center');
  }
  function chapterTabs(x: number, y: number, width: number) {
    const labels = [`入门 · ${CHALLENGE_START} 关`, `挑战 · ${LEVELS.length - CHALLENGE_START} 关`];
    labels.forEach((label, index) => button(label, x + index * (width + 10) / 2, y, (width - 10) / 2, 44, () => { chapter = index; render(); }, { primary: chapter === index }));
  }
  function drawSettings() {
    const x = wide ? 260 : 30, width = wide ? 520 : 360, y = wide ? 140 : 143;
    text('让小猫听得懂你。', x, y, 27, C.ink, 'left', 800, true);
    text('手机与平板', x, y + 58, 18, C.ink, 'left', 700); wrap('在棋盘上滑动，一次走一格；也可以点住方向按钮连续移动。', x, y + 92, width, 16);
    text('电脑', x, y + 165, 18, C.ink, 'left', 700); wrap('方向键 / WASD 移动，Z 撤销，R 重来，Esc 暂停。鼠标也能点击方向按钮。', x, y + 199, width, 16);
    wrap('规则从左到右或从上到下读。文字总能推动。失去控制时，撤销就能找回小猫。', x, y + 291, width, 15, C.muted);
    button(progress.muted ? '音效：关' : '音效：开', x, y + 387, width, 48, () => { progress.muted = !progress.muted; syncSound(); save(); render(); });
    motionSetting(x, y + 449, width, 48);
    button('返回游戏', x, y + 511, width, 48, () => { screen = returnScreen; syncSound(); render(); }, { primary: true });
  }
  function motionSetting(x: number, y: number, width: number, height: number) {
    button(systemReducedMotion ? '动态效果：系统已减少' : progress.reducedMotion ? '动态效果：关' : '动态效果：开', x, y, width, height, () => {
      progress.reducedMotion = !progress.reducedMotion; if (reducedMotion()) motion = null; save(); render();
    }, { enabled: !systemReducedMotion });
  }
  function compactHeading() {
    text('文字世界', 16, 23, 25, C.ink, 'left', 800, true); if (!wide) sprite(0, w - 30, 22, 35);
  }
  function drawCompactPlay() {
    const current = LEVELS[level], message = notice && clock < noticeUntil ? notice : showHint ? current.hint : current.intro;
    if (wide) {
      const side = map.x + map.tile * 9 + 26, available = w - side - 18;
      text(`${String(level + 1).padStart(2, '0')} · ${current.title}`, side, 78, 20, C.ink, 'left', 700, true);
      button('选关', w - 174, 13, 70, 44, () => openMenu('levels')); button('设置', w - 94, 13, 76, 44, () => openMenu('settings'));
      drawBoard();
      wrap(message, side, 118, Math.max(140, available - 177), 14);
      const ruleText = readRules(board.entities).map(r => `${LABELS[r.noun]}是${LABELS[r.property]}`).join(' · ');
      wrap(ruleText, side, h - 146, available, 13, C.muted);
      const bw = Math.min(110, (available - 16) / 3);
      button('撤销', side, h - 98, bw, 44, undo, { enabled: history.length > 0 });
      button('重来', side + bw + 8, h - 98, bw, 44, restart);
      button(showHint ? '收起提示' : '提示', side + (bw + 8) * 2, h - 98, bw, 44, () => { showHint = !showHint; render(); });
      drawDpad(w - 172, 112, 44, 6); text(`${board.steps} 步 · 方向键 / WASD 移动，Z 撤销`, side, h - 25, 13, C.muted);
    } else {
      text(`${String(level + 1).padStart(2, '0')} · ${current.title}`, 16, 65, 15, C.ink, 'left', 700, true);
      button('选关', w - 78, 40, 62, 44, () => openMenu('levels')); drawBoard();
      wrap(notice && clock < noticeUntil ? notice : current.intro, 16, map.y + map.tile * 10 + 16, w - 32, 13);
      const toolbarY = h - 180, bw = Math.min(142, w - 228);
      button('撤销', 16, toolbarY, bw, 44, undo, { enabled: history.length > 0 });
      button('重来', 16, toolbarY + 50, bw, 44, restart);
      button('提示', 16, toolbarY + 112, (bw - 4) / 2, 44, () => { showHint = !showHint; render(); });
      button('设置', 16 + (bw + 4) / 2, toolbarY + 112, (bw - 4) / 2, 44, () => openMenu('settings'));
      drawDpad(w - 196, toolbarY, 52, 6);
      if (showHint && !board.won) {
        ctx.fillStyle = '#203e3670'; ctx.fillRect(0, 0, w, h); hits = [];
        const y = (h - 286) / 2;
        round(16, y, w - 32, 286, C.paper, 16, C.ink); text('给小猫一点提示', 36, y + 35, 22, C.ink, 'left', 700, true);
        wrap(current.hint, 36, y + 80, w - 72, 16);
        button('收起提示', 36, y + 220, w - 72, 44, () => { showHint = false; render(); }, { primary: true });
      }
    }
    if (board.won) return;
  }
  function drawCompactHome() {
    const cx = w / 2;
    if (wide) {
      sprite(0, w * .25, h * .5, Math.min(170, h * .48)); text('推开文字，改写小世界。', w * .48, 96, 25, C.ink, 'left', 800, true);
      button(progress.completed.length || board.steps ? '继续解谜' : '开始解谜', w * .48, 150, w * .43, 50, () => { screen = 'play'; syncSound(); render(); }, { primary: true });
      button('挑选关卡', w * .48, 216, w * .2, 44, () => openMenu('levels')); button('设置与操作', w * .71, 216, w * .2, 44, () => openMenu('settings'));
      text(`${LEVELS.length} 个关卡 · 随时撤销`, w * .48, h - 35, 14, C.muted); return;
    }
    sprite(0, cx, h * .28, Math.min(150, h * .26)); text('推开文字，改写小世界。', cx, h * .47, 23, C.ink, 'center', 800, true);
    text('让小猫听懂你写下的规则。', cx, h * .54, 14, C.muted, 'center');
    button(progress.completed.length || board.steps ? '继续解谜' : '开始解谜', 24, h - 206, w - 48, 50, () => { screen = 'play'; syncSound(); render(); }, { primary: true });
    button('挑选关卡', 24, h - 137, (w - 60) / 2, 44, () => openMenu('levels')); button('设置与操作', w / 2 + 6, h - 137, (w - 60) / 2, 44, () => openMenu('settings'));
    text(`${LEVELS.length} 个关卡 · 已完成 ${progress.completed.length} 关`, cx, h - 56, 14, C.muted, 'center');
  }
  function drawCompactLevels() {
    const cols = wide ? 6 : 3, gap = 8, bw = (w - 32 - gap * (cols - 1)) / cols;
    const first = chapter ? CHALLENGE_START : 0, last = chapter ? LEVELS.length : CHALLENGE_START;
    const top = 146, rows = Math.ceil((last - first) / cols), bh = Math.min(88, (h - top - 82 - gap * (rows - 1)) / rows);
    text('选一页，开始新的发现。', 16, 65, 19, C.ink, 'left', 700, true);
    chapterTabs(16, 88, w - 32);
    for (let i = first; i < last; i++) {
      const slot = i - first, x = 16 + slot % cols * (bw + gap), y = top + Math.floor(slot / cols) * (bh + gap), done = progress.completed.includes(i), enabled = i < progress.unlocked || i === CHALLENGE_START;
      button(`${String(i + 1).padStart(2, '0')}${done ? ' · 已过' : !enabled ? ' · 待解锁' : ''}`, x, y, bw, bh, () => enterLevel(i), { primary: i === level, enabled });
    }
    button('返回', 16, h - 64, w - 32, 44, () => { screen = returnScreen; syncSound(); render(); });
  }
  function drawCompactSettings() {
    const x = 20, width = wide ? w * .55 - 30 : w - 40;
    text('操作与设置', x, 73, 23, C.ink, 'left', 800, true);
    wrap('手机：滑动棋盘，或按住方向按钮移动。', x, 118, width, 15);
    wrap('电脑：方向键 / WASD 移动；Z 撤销，R 重来；Esc 暂停。', x, wide ? 170 : 201, width, 15);
    wrap('横着或竖着，把文字连成规则。文字总能推，失去控制就撤销。', x, wide ? 243 : 294, width, 14, C.muted);
    const bx = wide ? w * .61 : 20, by = wide ? 130 : h - 188, bwidth = wide ? w * .34 : w - 40;
    button(progress.muted ? '音效：关' : '音效：开', bx, by, bwidth, 44, () => { progress.muted = !progress.muted; syncSound(); save(); render(); });
    motionSetting(bx, by + 62, bwidth, 44);
    button('返回游戏', bx, by + 124, bwidth, 44, () => { screen = returnScreen; syncSound(); render(); }, { primary: true });
  }
  function render() {
    const dpr = Math.min(view.dpr || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#eee4cf'; ctx.fillRect(0, 0, view.width, view.height);
    ctx.translate(ox, oy); ctx.scale(scale, scale); hits = []; paper(); if (compact) compactHeading(); else heading();
    if (loading || assetError) {
      text(assetError ? '小猫的画册没能打开。' : '小猫正在整理它的规则……', w / 2, h / 2 - 20, 21, C.ink, 'center', 700);
      if (assetError) { text('点击下方重试，或重新打开游戏。', w / 2, h / 2 + 20, 15, C.muted, 'center');
        // Asset retries must remain available while the game itself is disabled.
        const x = w / 2 - 90, y = h / 2 + 60; round(x, y, 180, 48, C.ink);
        text('重新加载素材', w / 2, y + 24, 16, C.white, 'center'); hits.push({ label: '重新加载素材', x: ox + x * scale, y: oy + y * scale, w: 180 * scale, h: 48 * scale, enabled: true, tap: loadAtlas });
      }
    } else {
      if (screen === 'home') { if (compact) drawCompactHome(); else drawHome(); }
      else if (screen === 'play') drawPlay();
      else if (screen === 'levels') { if (compact) drawCompactLevels(); else drawLevels(); }
      else { if (compact) drawCompactSettings(); else drawSettings(); }
      if (pauses.size && screen === 'play' && !board.won) {
        ctx.fillStyle = '#203e3670'; ctx.fillRect(0, 0, w, h); hits = [];
        round(w / 2 - 155, h / 2 - 104, 310, 210, C.paper, 16, C.ink); text('小猫休息一下', w / 2, h / 2 - 56, 26, C.ink, 'center', 800, true);
        if (pauses.has('manual') && pauses.size === 1) {
          // A paused screen has one intentionally enabled recovery control.
          const x = w / 2 - 115, y = h / 2 + 4;
          round(x, y, 230, 48, C.ink); text('继续解谜', w / 2, y + 24, 16, C.white, 'center', 700);
          hits.push({ label: '继续解谜', x: ox + x * scale, y: oy + y * scale, w: 230 * scale, h: 48 * scale, enabled: true, tap: () => setPause('manual', false) });
        } else text('回到游戏后继续，进度会留在这里。', w / 2, h / 2 + 22, 15, C.muted, 'center');
      }
    }
    const nextSignature = hits.map(hit => `${hit.label}:${hit.enabled}:${hit.x}:${hit.y}`).join('|');
    if (signature !== nextSignature) { signature = nextSignature; platform.onControls?.(hits); }
  }
  function resize() {
    view = platform.viewport(); wide = view.width / Math.max(1, view.height - view.top - view.bottom) > 1.25;
    compact = view.height - view.top - view.bottom < 760 || view.width < 360;
    w = wide ? 1040 : 420; h = wide ? 720 : 900; map = wide ? { x: 48, y: 165, tile: 48 } : { x: 30, y: 198, tile: 40 };
    if (compact) {
      w = view.width; h = Math.max(240, view.height - view.top - view.bottom);
      const tile = Math.min((w - 32) / 9, (h - 324) / 10);
      map = wide ? { x: 16, y: 70, tile: (h - 92) / 10 } : { x: (w - tile * 9) / 2, y: 92, tile };
    }
    const dpr = Math.min(view.dpr || 1, 2);
    platform.canvas.width = Math.round(view.width * dpr); platform.canvas.height = Math.round(view.height * dpr);
    scale = Math.min(view.width / w, Math.max(1, view.height - view.top - view.bottom) / h);
    ox = (view.width - w * scale) / 2; oy = view.top + (view.height - view.top - view.bottom - h * scale) / 2;
    held = null; gesture = null; render();
  }
  function input(type: 'down' | 'move' | 'up' | 'cancel', x: number, y: number) {
    if (type === 'cancel') { held = null; gesture = null; pressed = ''; hovered = ''; render(); return; }
    if (type === 'up') { swipe(x, y); held = null; gesture = null; render(); return; }
    if (type === 'down') {
      const hit = hits.find(hit => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h);
      if (hit) { if (hit.enabled) { hit.tap(); if (hit.direction && running() && !(blocked && clock < blocked.until)) { held = hit.direction; repeatAt = clock + .34; } } return; }
      const lx = (x - ox) / scale, ly = (y - oy) / scale;
      gesture = { x, y, lastX: x, lastY: y, board: lx >= map.x && lx < map.x + map.tile * 9 && ly >= map.y && ly < map.y + map.tile * 10 };
    }
    if (type === 'move') {
      if (held) { const hit = hits.find(hit => hit.direction === held); if (!hit || x < hit.x || x > hit.x + hit.w || y < hit.y || y > hit.y + hit.h) held = null; }
      swipe(x, y);
    }
  }
  function swipe(x: number, y: number) {
    if (!gesture?.board || !running()) return;
    const dx = x - gesture.lastX, dy = y - gesture.lastY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.max(14, map.tile * scale * .5)) return;
    act(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'); gesture.lastX = x; gesture.lastY = y;
  }
  function hover(x: number, y: number) {
    const hit = hits.find(hit => hit.enabled && x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h);
    const next = hit?.label ?? ''; if (next !== hovered) { hovered = next; render(); } return Boolean(hit);
  }
  function key(code: string) {
    const directions: Record<string, Direction> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    if (code === 'Escape' && screen === 'play' && !board.won) { setPause('manual', !pauses.has('manual')); return; }
    if (!controlsEnabled()) return;
    if (directions[code]) act(directions[code]); else if (code === 'KeyZ') undo(); else if (code === 'KeyR' && screen === 'play') restart();
  }
  function tick(milliseconds: number) {
    const seconds = Math.max(0, Math.min(milliseconds / 1000, .1));
    if (!pauses.size) clock += seconds;
    if (running()) { elapsed += seconds; if (held && clock >= repeatAt) { repeatAt = clock + .14; act(held); } }
    if (motion && !pauses.size) { motion.elapsed += seconds; if (motion.elapsed >= .12) motion = null; }
    render();
  }
  function loadAtlas() { assetError = false; loading = true; atlas.src = platform.atlas; render(); }
  atlas.onload = () => { loading = false; assetError = false; render(); platform.ready?.(); };
  atlas.onerror = () => { loading = false; assetError = true; render(); };
  resize(); syncSound(); loadAtlas();
  return {
    input, key, tick, resize, setPause, hover,
    setReducedMotion: (value: boolean) => { systemReducedMotion = value; if (reducedMotion()) motion = null; render(); },
    setTemporaryMuted: (muted: boolean) => { temporaryMuted = muted; syncSound(); return true; },
    isMuted: () => progress.muted || temporaryMuted || !running(), getHits: () => hits,
    getState: () => ({ ready: !loading && !assetError, running: running(), screen, level, elapsed, paused: [...pauses], muted: progress.muted,
      board: cloneBoard(board), rules: readRules(board.entities), undoCount: history.length, unlocked: progress.unlocked, completed: [...progress.completed], best: { ...progress.best }, showHint,
      feedback: { notice: clock < noticeUntil ? notice : '', reducedMotion: reducedMotion(), moving: Boolean(motion), blocked: Boolean(blocked && clock < blocked.until),
        ruleChanges: changedRules && clock < changedRules.until ? { added: changedRules.added.map(r => `${LABELS[r.noun]} 是 ${LABELS[r.property]}`), removed: changedRules.removed.map(r => `${LABELS[r.noun]} 是 ${LABELS[r.property]}`) } : null },
      layout: { wide, scale, x: ox, y: oy, map: { x: ox + map.x * scale, y: oy + map.y * scale, tile: map.tile * scale } } }),
  };
}
