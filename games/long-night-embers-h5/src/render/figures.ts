// Original pixel figures. Coordinates are authored on a fixed grid; no antialiasing.
function brush(ctx: CanvasRenderingContext2D, ox: number, oy: number, scale: number, flash = false) {
  return (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = flash ? '#fff8e8' : color;
    ctx.fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale);
  };
}

export function drawMonster(ctx: CanvasRenderingContext2D, id: string, color: string, frame: number, flash: boolean, size: number) {
  const p = brush(ctx, (size - 40) / 2, (size - 44) / 2, 2, flash);
  const ink = '#10151c', shade = '#30404b', light = '#e6e8d8', eye = '#ffb875';
  const step = frame ? 1 : 0;
  if (id.includes('bat')) {
    // Broad scalloped wings, angled fingers and a compact body.
    const y = frame ? 8 : 3;
    p(0, y, 2, 2, shade); p(18, y, 2, 2, shade);
    p(2, y + 2, 3, 2, color); p(15, y + 2, 3, 2, color);
    p(4, y + 3, 4, 4, ink); p(12, y + 3, 4, 4, ink);
    p(3, y + 3, 5, 2, color); p(12, y + 3, 5, 2, color);
    p(5, y + 5, 2, 2, shade); p(13, y + 5, 2, 2, shade);
    p(7, 6, 6, 10, ink); p(8, 7, 4, 8, color);
    p(7, 4, 2, 4, color); p(11, 4, 2, 4, color);
    p(8, 9, 1, 1, eye); p(11, 9, 1, 1, eye);
    p(9, 12, 2, 1, light); p(9, 15, 2, 2, shade);
  } else if (id === 'ghost' || id === 'snow_specter') {
    p(7, 3 + step, 7, 2, ink); p(5, 5 + step, 11, 12, ink);
    p(6, 5 + step, 9, 10, color); p(7, 4 + step, 6, 2, color);
    p(6, 6 + step, 2, 7, light); p(14, 9 + step, 2, 8, shade);
    p(3, 10 + step, 3, 4, color); p(16, 10 + step, 2, 4, color);
    p(6, 15 + step, 2, 4, color); p(9, 15 + step, 2, 3, color); p(12, 15 + step, 2, 5 - step, color);
    p(8, 8 + step, 2, 3, ink); p(12, 8 + step, 2, 3, ink); p(10, 12 + step, 2, 2, ink);
    if (id === 'snow_specter') { p(9, 0, 1, 4, light); p(5, 2, 2, 2, light); p(14, 1, 2, 3, light); }
  } else if (id === 'skeleton') {
    p(6, 2, 9, 8, ink); p(7, 2, 7, 7, light); p(8, 8, 5, 2, '#9caeab');
    p(8, 4, 2, 2, ink); p(12, 4, 2, 2, ink); p(10, 7, 1, 1, ink);
    p(10, 9, 1, 8, light);
    for (let y = 10; y < 16; y += 2) p(7, y, 7, 1, light);
    p(5, 10, 2, 5, '#a4b3b3'); p(14, 10, 2, 5, '#a4b3b3');
    p(6, 15, 3, 2, light); p(12, 15, 3, 2, light);
    p(7 - step, 17, 2, 4, light); p(12 + step, 17, 2, 3, light);
    p(6 - step, 20, 4, 1, shade); p(12 + step, 20, 4, 1, shade);
    p(17, 5, 1, 12, '#b1c3c4'); p(16, 15, 3, 1, '#c6a66a');
  } else if (id === 'werewolf') {
    p(5, 4, 12, 10, ink); p(6, 3, 3, 4, color); p(13, 2, 3, 5, color);
    p(6, 6, 10, 8, color); p(12, 8, 6, 4, '#a8aaa3'); p(15, 10, 3, 2, ink);
    p(8, 7, 2, 1, eye); p(13, 7, 2, 1, eye); p(14, 12, 3, 1, light);
    p(4, 11, 11, 7, shade); p(6, 12, 6, 4, color);
    p(1, 13, 4, 5, color); p(14, 12, 4, 5, color);
    p(0, 18, 4, 1, light); p(15, 17, 4, 1, light);
    p(5 - step, 17, 3, 4, color); p(12 + step, 17, 3, 4, color);
  } else if (id === 'boss_blue_venus') {
    p(8, 11, 4, 10, '#64834e'); p(3, 17, 7, 3, '#395c41'); p(11, 15, 7, 3, '#638953');
    p(4, 3, 13, 10, ink); p(2, 5, 16, 6, color); p(5, 2, 10, 12, color);
    p(5, 5, 11, 5, '#101b2b'); p(6, 5, 2, 2, light); p(10, 5, 2, 2, light); p(14, 5, 2, 2, light);
    p(8, 8, 2, 2, light); p(12, 8, 2, 2, light);
    p(5, 3, 7, 1, '#8bc3e8'); p(3, 19, 14, 2, '#395c41');
  } else if (id === 'astro_drone') {
    p(2, 7, 16, 8, ink); p(3, 8, 14, 6, '#718291');
    p(0, 9, 4, 3, '#c2cbd0'); p(16, 9, 4, 3, '#c2cbd0');
    p(6, 5, 8, 12, shade); p(7, 6, 6, 10, color); p(8, 8, 4, 5, light);
    p(4, 14, 3, 4 + step, '#dd9566'); p(13, 14, 3, 4 + step, '#dd9566');
    p(9, 1, 1, 4, '#a2b1b6'); p(8, 1, 3, 1, color);
  } else if (id === 'reaper' || id === 'boss_hag') {
    p(7, 1, 7, 3, ink); p(5, 4, 11, 6, ink); p(4, 10, 13, 10, ink);
    p(8, 2, 5, 3, color); p(6, 5, 9, 6, color); p(5, 11, 11, 9, color);
    p(11, 12, 3, 8, '#483044'); p(6, 20, 3, 1, color); p(13, 20, 3, 1, color);
    p(8, 5, 6, 5, '#d7d9c6'); p(9, 6, 2, 2, ink); p(12, 6, 2, 2, ink);
    p(18, 2, 1, 20, '#997755'); p(12, 1, 7, 2, '#dce5df'); p(10, 3, 3, 3, '#a0b8bb');
    if (id === 'boss_hag') { p(8, 0, 3, 4, '#a388b0'); p(3, 4, 14, 1, shade); p(1, 13, 4, 5, '#a388b0'); }
  } else if (id === 'dullahan' || id === 'boss_atlantean') {
    p(4, 7, 12, 11, ink); p(5, 8, 10, 8, color); p(6, 9, 3, 5, '#d0dad3');
    p(2, 8, 3, 8, shade); p(15, 7, 3, 9, shade);
    p(6 - step, 17, 3, 4, shade); p(12 + step, 17, 3, 4, shade);
    p(7, 5, 6, 2, '#171c24'); p(17, 1, 1, 20, '#b59b64'); p(15, 2, 5, 2, light);
    p(0, 9, 5, 9, ink); p(1, 10, 3, 6, color); p(2, 10, 1, 6, light);
    if (id === 'boss_atlantean') { p(6, 0, 8, 6, ink); p(7, 1, 6, 5, color); p(8, 3, 4, 1, '#6b403c'); }
  } else if (id === 'mudman') {
    p(5, 4, 9, 4, ink); p(3, 8, 14, 11, ink); p(5, 5, 8, 4, color);
    p(4, 9, 12, 9, color); p(1, 12, 4, 7, '#685536'); p(15, 12, 4, 7, '#685536');
    p(6, 9, 2, 2, eye); p(11, 9, 2, 2, eye); p(8, 13, 4, 2, ink);
    p(5, 6, 3, 2, '#82965c'); p(12, 13, 3, 3, '#82965c');
    p(3, 19, 6, 2, '#685536'); p(11, 19, 7, 2, '#685536');
  } else {
    // Corpse and mummy share anatomy, with distinct skin, bandages and torn cloth.
    p(7, 2, 7, 7, ink); p(8, 3, 5, 5, color);
    p(6, 9, 9, 8, ink); p(7, 9, 7, 7, id === 'mummy' ? color : '#566b60');
    p(3, 10, 4, 4, color); p(14, 11, 4, 4, color);
    p(7 - step, 17, 3, 4, shade); p(12 + step, 16, 3, 5, shade);
    p(8, 5, 2, 1, ink); p(11, 5, 2, 1, eye); p(9, 7, 3, 1, ink);
    if (id === 'mummy') {
      for (let y = 3; y < 17; y += 3) { p(7, y, 7, 1, '#a99e79'); p(8, y - 1, 5, 1, '#ece5bd'); }
      p(16, 13, 3, 1, '#ece5bd'); p(18, 14, 1, 3, '#a99e79');
    } else { p(8, 10, 2, 3, '#8eaa76'); p(12, 13, 3, 2, '#9e6c58'); }
  }
}
