import { addVan, advance, BAKERY, BRIDGES, COLS, DURATION, editRoad, findPath, GOAL,
  newTown, ROAD_BUDGET, roadsUsed, TREES } from './engine.ts';

export type Viewport = { width: number; height: number; dpr: number; top: number; bottom: number };
export type Hit = { label: string; x: number; y: number; w: number; h: number; enabled: boolean; tap: () => void };
export type Platform = {
  canvas: HTMLCanvasElement; viewport: () => Viewport;
  readBest: () => number; writeBest: (score: number) => void;
  onControls?: (hits: Hit[]) => void;
};
const W = 420, H = 860, MAP_X = 30, MAP_Y = 236, TILE = 40;
const C = { paper: '#f7f2e6', ink: '#34483e', muted: '#637260', green: '#42654e', lawn: '#dbe5c4',
  water: '#a6d2d2', roof: '#c57253', yellow: '#edb94e', white: '#fffdf5' };

export function createTownGame(platform: Platform) {
  const ctx = platform.canvas.getContext('2d')!;
  let town = newTown(), tool: 'road' | 'erase' = 'road', best = platform.readBest();
  let view = platform.viewport(), scale = 1, offsetX = 0, offsetY = 0;
  let hits: Hit[] = [], dragging = false, previousCell: number | null = null;
  let notice = '', noticeUntil = 0, animationTime = 0, hover: number | null = null;
  let controlSignature = '', savedResult = false, lastHouses = 1;
  const pauses = new Set<string>();
  const running = () => town.started && !town.finished && pauses.size === 0;
  const center = (cell: number) => ({ x: MAP_X + (cell % COLS + .5) * TILE, y: MAP_Y + (Math.floor(cell / COLS) + .5) * TILE });
  function round(x: number, y: number, w: number, h: number, r = 12, fill = C.white) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function text(value: string, x: number, y: number, size = 14, color = C.ink, weight = 500, align: CanvasTextAlign = 'left') {
    ctx.font = `${weight} ${size}px sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
  }
  function line(points: number[][], color: string, width: number) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function dot(x: number, y: number, r: number, fill: string) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }
  function bread(x: number, y: number, size = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    round(-18, -12, 36, 25, 10, '#db9e48'); round(-15, -10, 30, 19, 8, '#f1c46e');
    for (let i = -8; i <= 8; i += 8) line([[i - 2, -5], [i + 1, 2]], '#b77d39', 2);
    ctx.restore();
  }
  function building(cell: number, bakery: boolean, index: number) {
    const { x, y } = center(cell);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#bbc6a5'; ctx.beginPath(); ctx.ellipse(1, 13, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    round(-15, -9, 30, 26, 3, bakery ? '#fff0d0' : ['#f7e0b4', '#e9e7d4', '#f4d9c5', '#e5e7ce'][index % 4]);
    ctx.fillStyle = bakery ? C.roof : ['#7b9a8b', '#c78766', '#738d9a', '#b38b59'][index % 4];
    ctx.beginPath(); ctx.moveTo(-19, -7); ctx.lineTo(0, -23); ctx.lineTo(19, -7); ctx.closePath(); ctx.fill();
    round(-4, 5, 8, 13, 2, '#6b826c'); round(-12, -2, 6, 7, 1, '#98bfc0'); round(7, -2, 6, 7, 1, '#98bfc0');
    if (bakery) {
      for (let i = 0; i < 6; i++) round(-15 + i * 5, -3, 5, 6, 1, i % 2 ? '#fff4d7' : C.roof);
      bread(0, -12, .42); round(-22, 19, 44, 18, 5, C.white); text('面包房', 0, 28, 11, C.ink, 700, 'center');
    }
    ctx.restore();
  }
  function tree(cell: number) {
    const { x, y } = center(cell);
    ctx.fillStyle = '#adbd99'; ctx.beginPath(); ctx.ellipse(x + 4, y + 12, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    round(x - 2, y + 2, 4, 13, 1, '#95744d');
    dot(x - 6, y - 2, 10, '#86a36e'); dot(x + 6, y - 2, 10, '#749560'); dot(x, y - 11, 11, '#94ac78');
  }
  function button(label: string, x: number, y: number, w: number, action: () => void, active = false, enabled = true) {
    round(x, y, w, 48, 12, !enabled ? '#e6e7d9' : active ? C.green : '#e7e9da');
    text(label, x + w / 2, y + 24, 15, !enabled ? '#788170' : active ? C.white : C.ink, 700, 'center');
    hits.push({ label, x: offsetX + x * scale, y: offsetY + y * scale, w: w * scale, h: 48 * scale, enabled, tap: action });
  }
  function setPause(reason: string, value: boolean) {
    if (value) pauses.add(reason); else pauses.delete(reason);
    dragging = false; previousCell = null;
    render();
  }
  function reset() {
    town = newTown(); pauses.delete('manual'); tool = 'road'; notice = ''; savedResult = false; lastHouses = 1; render();
  }
  function status() {
    if (notice && animationTime < noticeUntil) return notice;
    if (!town.started) return findPath(town, 24) ? '连通了！点击「开始营业」，小车就会出发。' : '沿格子拖动画路，把面包房连到右边的住宅。';
    if (town.houses.some(h => !findPath(town, h.cell))) return '有住宅还没连通，给它修一条送面包的路吧。';
    return town.delivered >= GOAL ? '今日目标已完成，继续送出更多热面包吧。' : '小车会优先配送等得最久的订单。';
  }
  function render() {
    const dpr = Math.min(view.dpr || 1, 3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = C.paper; ctx.fillRect(0, 0, view.width, view.height);
    ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); hits = [];
    text('小镇配送员', 30, 43, 30, C.ink, 800); bread(364, 43, 1.15);
    text('把热乎的面包，送到每一扇门前。', 31, 78, 14, C.muted);
    ctx.fillStyle = '#e4e5d4'; ctx.fillRect(30, 101, 360, 1);
    text('已送达', 31, 123, 13, C.muted); text(String(town.delivered).padStart(2, '0'), 30, 150, 29, C.green, 800);
    text(`/ ${GOAL} 单`, 78, 154, 13, C.muted);
    const remaining = Math.ceil(DURATION - town.elapsed);
    text('营业剩余', 182, 123, 13, C.muted); text(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`, 181, 150, 26, C.ink, 700);
    text('可用道路', 306, 123, 13, C.muted); text(String(ROAD_BUDGET - roadsUsed(town)), 306, 150, 26, C.ink, 700);
    text('格', 351, 154, 13, C.muted);
    round(30, 181, 360, 40, 10, '#e8ecdc');
    text(status(), 43, 201, 13, C.green);
    round(MAP_X, MAP_Y, 360, 440, 16, C.lawn);
    ctx.save(); ctx.clip();
    // The grid is an editable map, with very quiet cell intersections.
    for (let y = 0; y < 11; y++) for (let x = 0; x < 9; x++) {
      if ((x * 3 + y * 7) % 5 === 0) { ctx.fillStyle = '#d2dfb9'; ctx.fillRect(MAP_X + x * TILE + 5, MAP_Y + y * TILE + 5, 30, 30); }
      dot(MAP_X + x * TILE, MAP_Y + y * TILE, 1, '#beceab');
    }
    const riverY = MAP_Y + 5 * TILE;
    ctx.fillStyle = '#91bcbc'; ctx.fillRect(MAP_X, riverY - 3, 360, 46);
    ctx.fillStyle = C.water; ctx.fillRect(MAP_X, riverY, 360, 40);
    for (let i = 0; i < 12; i++) {
      const x = MAP_X + i * 34 + Math.sin(animationTime * .6 + i) * 3;
      line([[x, riverY + 12 + i % 3 * 7], [x + 12, riverY + 12 + i % 3 * 7]], '#c7e2dc', 2);
    }
    const roads = new Set([BAKERY, ...town.houses.map(h => h.cell), ...town.roads]);
    for (const cell of roads) {
      const p = center(cell);
      for (const delta of [1, COLS]) {
        const next = cell + delta;
        if (next >= 99 || (delta === 1 && cell % COLS === 8) || !roads.has(next)) continue;
        const q = center(next);
        line([[p.x, p.y + 2], [q.x, q.y + 2]], '#b0b99d', 20);
        line([[p.x, p.y], [q.x, q.y]], '#f4edda', 16);
        ctx.setLineDash([3, 6]); line([[p.x, p.y], [q.x, q.y]], '#c8c4ab', 1); ctx.setLineDash([]);
      }
      if (town.roads.includes(cell)) dot(p.x, p.y, 7.5, '#f4edda');
    }
    for (const cell of BRIDGES) {
      const p = center(cell), built = town.roads.includes(cell);
      if (!built) { ctx.globalAlpha = .6; ctx.setLineDash([4, 4]); line([[p.x - 10, p.y - 17], [p.x - 10, p.y + 17], [p.x + 10, p.y + 17], [p.x + 10, p.y - 17], [p.x - 10, p.y - 17]], '#fffdf0', 2); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      else {
        round(p.x - 13, p.y - 23, 26, 46, 2, '#c5a273');
        for (let y = -18; y <= 18; y += 7) line([[p.x - 11, p.y + y], [p.x + 11, p.y + y]], '#9c7b52', 1);
        line([[p.x - 14, p.y - 23], [p.x - 14, p.y + 23]], '#f2dfb4', 3); line([[p.x + 14, p.y - 23], [p.x + 14, p.y + 23]], '#f2dfb4', 3);
      }
    }
    if (!town.started && town.roads.length === 0) {
      ctx.setLineDash([3, 7]); line([[130, 336], [250, 336]], '#a1b18c', 3); ctx.setLineDash([]);
    }
    for (const cell of TREES) tree(cell);
    building(BAKERY, true, 0);
    town.houses.forEach((house, i) => {
      building(house.cell, false, i);
      const p = center(house.cell), connected = !!findPath(town, house.cell);
      if (house.orders.length) {
        const age = town.elapsed - house.orders[0];
        dot(p.x + 14, p.y - 19, 10, !connected || age > 45 ? '#b65e44' : C.green);
        text(String(house.orders.length), p.x + 14, p.y - 19, 12, C.white, 700, 'center');
        round(p.x - 13, p.y + 21, 26, 3, 1, '#bdc6a8');
        round(p.x - 13, p.y + 21, Math.max(1, 26 * (1 - age / 65)), 3, 1, age > 45 ? '#b65e44' : C.green);
      }
    });
    if (hover !== null && !town.finished) {
      const p = center(hover);
      ctx.globalAlpha = .3; round(p.x - 18, p.y - 18, 36, 36, 7, tool === 'road' ? C.white : '#bc684d'); ctx.globalAlpha = 1;
    }
    town.vans.forEach((van, i) => {
      const segment = Math.floor(van.position), a = center(van.path[segment]), b = center(van.path[Math.min(segment + 1, van.path.length - 1)]);
      const t = van.position - segment;
      const idle = van.target === null && !van.returning;
      const x = idle ? center(BAKERY).x - 24 + i * 25 : a.x + (b.x - a.x) * t;
      const y = idle ? center(BAKERY).y + 41 : a.y + (b.y - a.y) * t;
      ctx.save(); ctx.translate(x, y); if (!idle) ctx.rotate(Math.atan2(b.y - a.y || 0, b.x - a.x || 0));
      round(-11, -7, 23, 16, 4, '#a6ae91'); round(-12, -9, 23, 15, 4, i === 1 ? '#e39362' : C.yellow);
      round(3, -7, 6, 11, 2, '#e9f0d9'); ctx.fillStyle = '#496052'; ctx.fillRect(-7, -11, 5, 3); ctx.fillRect(-7, 6, 5, 3);
      if (!van.returning && !idle) bread(-5, -2, .22);
      ctx.restore();
    });
    ctx.restore();
    text('桥位修桥需 4 格道路 · 擦路可回收', 210, 698, 13, C.muted, 500, 'center');
    button('画路', 30, 724, 104, () => { tool = 'road'; render(); }, tool === 'road');
    button('擦路', 144, 724, 104, () => { tool = 'erase'; render(); }, tool === 'erase');
    button(town.vans.length >= 3 ? '车队已满' : '加车  $30', 258, 724, 132, () => {
      if (addVan(town)) { notice = '新车到岗，自动加入配送。'; noticeUntil = animationTime + 4; render(); }
    }, false, town.coins >= 30 && town.vans.length < 3 && !town.finished);
    const playLabel = !town.started ? '开始营业' : pauses.has('manual') ? '继续配送' : '暂停规划';
    button(playLabel, 30, 788, 240, () => {
      if (!town.started) town.started = true;
      else setPause('manual', !pauses.has('manual'));
      render();
    }, true, !town.finished);
    text(`收入 $${town.coins}`, 297, 801, 15, C.ink, 700); text(`${town.vans.length} 辆配送车`, 297, 823, 12, C.muted);
    if (pauses.size && !town.finished) {
      round(127, 628, 166, 33, 10, C.white);
      text(pauses.has('manual') ? '规划中 · 配送已暂停' : '暂时离开 · 配送已暂停', 210, 645, 13, C.green, 700, 'center');
    }
    if (town.finished) {
      ctx.fillStyle = 'rgba(52,72,62,.5)'; ctx.fillRect(0, 0, W, H); hits = [];
      round(40, 229, 340, 390, 20, C.paper); bread(210, 277, 1.5);
      text(town.delivered >= GOAL ? '今天的小镇，香喷喷的。' : '辛苦了，配送员！', 210, 332, 23, C.ink, 800, 'center');
      text('今日营业结束', 210, 369, 14, C.muted, 500, 'center');
      text(`${town.delivered} 单送达`, 210, 421, 34, C.green, 800, 'center');
      text(`目标 ${GOAL} 单 · 超时 ${town.missed} 单 · 最佳 ${best} 单`, 210, 464, 14, C.muted, 500, 'center');
      text(town.delivered >= GOAL ? '你的路网让每一份等待都值得。' : '试试更短的路线，让小车少绕点路。', 210, 500, 14, C.ink, 500, 'center');
      button('再开一家面包房', 80, 543, 260, reset, true);
    }
    const signature = hits.map(h => `${h.label}:${h.enabled}:${h.x}:${h.y}`).join('|');
    if (signature !== controlSignature) { controlSignature = signature; platform.onControls?.(hits); }
  }
  function resize() {
    view = platform.viewport();
    const dpr = Math.min(view.dpr || 1, 3);
    platform.canvas.width = Math.round(view.width * dpr); platform.canvas.height = Math.round(view.height * dpr);
    scale = Math.min(view.width / W, Math.max(1, view.height - view.top - view.bottom) / H);
    offsetX = (view.width - W * scale) / 2; offsetY = view.top + (view.height - view.top - view.bottom - H * scale) / 2;
    render();
  }
  function cellAt(x: number, y: number) {
    const gx = Math.floor(((x - offsetX) / scale - MAP_X) / TILE), gy = Math.floor(((y - offsetY) / scale - MAP_Y) / TILE);
    return gx >= 0 && gx < 9 && gy >= 0 && gy < 11 ? gy * COLS + gx : null;
  }
  function paint(cell: number) {
    const error = editRoad(town, cell, tool === 'erase');
    if (error) { notice = error; noticeUntil = animationTime + 3; }
  }
  function input(type: 'down' | 'move' | 'up' | 'cancel', x: number, y: number) {
    if (type === 'cancel') { dragging = false; previousCell = null; hover = null; render(); return; }
    if (type === 'down') {
      const hit = hits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (hit) { if (hit.enabled) hit.tap(); return; }
    }
    if (town.finished || [...pauses].some(p => p !== 'manual')) return;
    const cell = cellAt(x, y); hover = cell;
    if (type === 'down') { dragging = cell !== null; previousCell = cell; if (cell !== null) paint(cell); }
    if ((type === 'move' || type === 'up') && dragging && cell !== null) {
      // Fill skipped cells when fingers move faster than touch events arrive.
      let previous = previousCell ?? cell;
      while (previous !== cell) {
        const dx = cell % COLS - previous % COLS;
        previous += dx !== 0 ? Math.sign(dx) : Math.sign(cell - previous) * COLS;
        paint(previous);
      }
      previousCell = cell;
    }
    if (type === 'up') { dragging = false; previousCell = null; hover = null; }
    if (cell === null) previousCell = null;
    render();
  }
  function tick(ms: number) {
    const seconds = Math.max(0, Math.min(ms / 1000, .1));
    if (!pauses.size) animationTime += seconds;
    if (running()) advance(town, seconds);
    if (town.houses.length > lastHouses) { lastHouses = town.houses.length; notice = '新邻居搬来了！记得把道路连到新住宅。'; noticeUntil = animationTime + 5; }
    if (town.finished && !savedResult) { savedResult = true; best = Math.max(best, town.delivered); platform.writeBest(best); }
    render();
  }
  const getState = () => ({ running: running(), paused: [...pauses], tool, best, ...structuredSnapshot(),
    cells: Array.from({ length: 99 }, (_, cell) => { const p = center(cell); return { x: offsetX + p.x * scale, y: offsetY + p.y * scale }; }) });
  function structuredSnapshot() { return { ...town, roads: [...town.roads], houses: town.houses.map(h => ({ ...h, orders: [...h.orders] })), vans: town.vans.map(v => ({ ...v, path: [...v.path] })) }; }
  resize();
  return { input, tick, resize, setPause, getState, getHits: () => hits, isMuted: () => true };
}
