import type { Direction, Entity, Level, Noun, Property, Word } from './engine.ts';

function level(title: string, intro: string, hint: string, setup: (b: Builder) => void, solution: string): Level {
  const b = new Builder(); setup(b);
  const keys: Record<string, Direction> = { U: 'up', D: 'down', L: 'left', R: 'right' };
  return { title, intro, hint, entities: b.entities, solution: [...solution].map(c => keys[c]) };
}
class Builder {
  entities: Entity[] = [];
  object(kind: Noun, x: number, y: number) { this.entities.push({ id: this.entities.length, kind, x, y }); }
  word(word: Word, x: number, y: number) { this.entities.push({ id: this.entities.length, kind: 'text', word, x, y }); }
  rule(noun: Noun, property: Property, x: number, y: number) { this.word(noun, x, y); this.word('is', x + 1, y); this.word(property, x + 2, y); }
  wallColumn(x: number, from = 0, to = 9) { for (let y = from; y <= to; y++) this.object('wall', x, y); }
  wallRow(y: number, from = 0, to = 8, gap = -1) { for (let x = from; x <= to; x++) if (x !== gap) this.object('wall', x, y); }
  basic() { this.rule('cat', 'you', 0, 0); this.rule('wall', 'stop', 0, 1); this.rule('flag', 'win', 5, 0); this.rule('rock', 'push', 5, 1); }
}

export const LEVELS: Level[] = [
  level('先认识小猫', '「小猫 是 你」让你控制小猫。走进旗子所在的格子吧。', '从墙中间的缺口穿过去，再往右找旗子。', b => {
    b.basic(); b.wallRow(5, 0, 8, 4); b.object('cat', 2, 7); b.object('flag', 6, 4);
  }, 'URRUURR'),
  level('让石头挪个窝', '「石头 是 推」生效时，石头可以一块接一块地推动。', '朝右推。石头可以和旗子待在同一格，小猫到达才算过关。', b => {
    b.basic(); b.wallRow(4, 0, 8); b.wallRow(8, 0, 8); b.wallColumn(0, 5, 7); b.wallColumn(8, 5, 7);
    b.object('cat', 2, 6); b.object('rock', 3, 6); b.object('flag', 6, 6);
  }, 'RRRR'),
  level('墙真的挡路吗', '文字也是能推的方块。拆开一句规则，世界就会变。', '走到「挡」下面，把它向上推一格。没有「墙 是 挡」，墙就能穿过。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 2); b.rule('flag', 'win', 5, 0);
    b.wallColumn(4); b.object('cat', 2, 5); b.object('flag', 6, 5);
  }, 'UUURRRRDDD'),
  level('补上最后一个字', '旗子还不是终点。把「赢」推到「旗子 是」后面。', '先向上推「赢」，和上面的「旗子 是」排成一行，再去碰旗子。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 1);
    b.word('flag', 5, 4); b.word('is', 6, 4); b.word('win', 7, 6);
    b.wallRow(7, 1, 5); b.object('cat', 7, 8); b.object('flag', 2, 5);
  }, 'UUULLLLL'),
  level('另一边的我', '「你」可以不止一个。试着让墙另一边的石头也听你指挥。', '把右侧的「你」推到「石头 是」后面。随后向右，石头就会碰到旗子。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 1); b.rule('flag', 'win', 5, 0);
    b.word('rock', 5, 2); b.word('is', 6, 2); b.word('you', 7, 4);
    b.wallColumn(4); b.object('cat', 7, 6); b.object('rock', 1, 6); b.object('flag', 2, 6);
  }, 'UUUR'),
  level('石头也能是奖品', '「赢」是性质，不是旗子的专属。让石头变成终点吧。', '向上把「赢」推到「石头 是」后面，再往右碰到石头。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 1);
    b.word('rock', 2, 3); b.word('is', 3, 3); b.word('win', 4, 5);
    b.wallRow(7, 0, 2); b.object('cat', 4, 7); b.object('rock', 6, 4);
  }, 'UUURR'),
  level('把整面墙推开', '把「挡」换成「推」，墙就成了可以搬动的积木。', '从下方向上推「推」，把「挡」顶出去。然后向右，把墙也推走。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 2); b.rule('flag', 'win', 5, 0); b.word('push', 2, 4);
    b.wallColumn(4); b.object('cat', 2, 6); b.object('flag', 6, 3);
  }, 'UUURRRR'),
  level('借一个赢字', '够不到旗子，也可以把它的「赢」借给别的东西。', '从上往下把「赢」推两格，接在「石头 是」后面。终点就来到你这边了。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 5, 1); b.rule('flag', 'win', 0, 3);
    b.word('rock', 0, 5); b.word('is', 1, 5); b.wallColumn(4);
    b.object('cat', 2, 1); b.object('rock', 3, 7); b.object('flag', 6, 7);
  }, 'DDDRDDD'),
  level('竖着读也可以', '完整的规则可以从左向右读，也可以从上向下读。', '把「赢」向上推，竖着接在「旗子」「是」下面。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 1);
    b.word('flag', 7, 3); b.word('is', 7, 4); b.word('win', 7, 7);
    b.wallColumn(4, 4, 9); b.object('cat', 7, 9); b.object('flag', 6, 3);
  }, 'UUULUUU'),
  level('摸不到的终点', '墙可以是终点，但「挡」仍会阻止你走进去。两句规则要一起想。', '先补好「墙 是 赢」，再绕到「挡」下面把它往上推。此时才能走进墙里。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 2);
    b.word('wall', 0, 5); b.word('is', 1, 5); b.word('win', 2, 7);
    b.wallColumn(4); b.object('cat', 2, 9);
  }, 'UUURUUULURR'),
  level('一字两用', '两句话可以共用同一个「是」。认出竖着的「小猫 是 你」了吗？', '补上横向的「石头 是 赢」。小心，向左推「你」会让你暂时失去控制。', b => {
    b.rule('wall', 'stop', 0, 0);
    b.word('cat', 4, 3); b.word('is', 4, 4); b.word('you', 4, 5);
    b.word('rock', 3, 4); b.word('win', 5, 6);
    b.wallColumn(7, 3, 8); b.object('cat', 5, 8); b.object('rock', 2, 6);
  }, 'UUUDLLL'),
  level('最后一次猫猫接力', '小猫出不去了。把控制权交给外面的石头，让它完成最后一程。', '向下把「你」从「小猫 是」送到「石头 是」后面，再向右移动石头。', b => {
    b.rule('cat', 'you', 0, 4); b.rule('wall', 'stop', 5, 0); b.rule('flag', 'win', 5, 1);
    b.word('rock', 0, 5); b.word('is', 1, 5); b.wallColumn(4, 0, 7); b.wallRow(7, 0, 3);
    b.object('cat', 2, 2); b.object('rock', 1, 8); b.object('flag', 6, 8);
  }, 'DDRRRRR'),
  level('把石头送到对岸', '水会吞掉碰到它的东西。先安排好石头，再让小猫过河。', '中间只有最上方能通过。先从下面推石头，再绕到侧面，把它送进水里。', b => {
    b.basic(); b.rule('water', 'sink', 5, 2); b.wallRow(3); b.wallRow(9); b.wallColumn(0, 4, 8); b.wallColumn(8, 4, 8);
    b.wallColumn(3, 5, 8); for (let y = 4; y <= 8; y++) b.object('water', 4, y);
    b.object('cat', 1, 4); b.object('rock', 2, 7); b.object('flag', 7, 8);
  }, 'DDDDRUUULURRRRRRDDDD'),
  level('让终点过河', '旗子不是这次的终点。怎样把右岸的「赢」带回左岸？', '先清出通道，再从右岸把「赢」带回来。左岸的文字也会挡路，先为最后的转向留出站位。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 0, 1); b.rule('water', 'sink', 5, 2);
    b.word('rock', 2, 5); b.word('is', 2, 6); b.word('push', 2, 7);
    b.wallRow(3); b.wallRow(9); b.wallColumn(0, 4, 8); b.wallColumn(8, 4, 8);
    for (let y = 4; y <= 8; y++) b.object('water', 4, y);
    b.word('rock', 1, 4); b.word('is', 2, 4); b.word('win', 6, 7);
    b.object('cat', 1, 6); b.object('rock', 3, 6); b.object('rock', 1, 8);
  }, 'RRRRDDRURULLLLDLDLUURDRUUDDDLL'),
  level('不是拆掉就能过', '这里的水有两个性质。只让它不再沉没，还不够。', '把左下角的「推」移到「水 是」后面，顶开「沉」。先向右调整它的位置，再从下方往上推。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('wall', 'stop', 5, 0); b.rule('water', 'stop', 5, 2); b.rule('water', 'sink', 1, 4);
    for (let y = 0; y < 10; y++) b.object('water', 4, y);
    b.word('push', 1, 8); b.object('cat', 1, 2); b.object('flag', 8, 1); b.rule('flag', 'win', 5, 1);
  }, 'LDDDDDDRRDRUUUURRRRURUUU'),
  level('把一个字留在水里', '没有多余的石头。哪些文字必须留下，哪些可以舍弃？', '先把「墙 是 挡」里的「是」向上挪开，再把「挡」送进河里。清出的通道要留给「赢」。', b => {
    b.rule('cat', 'you', 0, 0); b.rule('water', 'sink', 5, 0); b.rule('wall', 'stop', 0, 4);
    for (let y = 0; y < 10; y++) b.object('water', 4, y);
    b.word('flag', 5, 2); b.word('is', 6, 2); b.word('win', 2, 7);
    b.object('cat', 1, 6); b.object('flag', 7, 8);
  }, 'UURRDDDDLUUULURRRRRDRUUDDDDD'),
  level('接力前的准备', '小猫和石头分在两边。交出控制权之前，还有一件事要做。', '先把「水 是 沉」改为「水 是 推」，再把「你」向下交给石头。石头过水时，先向上再拐弯，别一直顶着同一格。', b => {
    b.rule('cat', 'you', 0, 4); b.rule('water', 'sink', 0, 1); b.rule('water', 'stop', 5, 0); b.rule('wall', 'stop', 5, 1); b.rule('flag', 'win', 5, 2);
    b.word('rock', 0, 5); b.word('is', 1, 5); b.word('push', 2, 2); b.wallColumn(4);
    for (let x = 5; x <= 8; x++) b.object('water', x, 5);
    b.object('cat', 1, 7); b.object('rock', 6, 8); b.object('flag', 7, 3);
  }, 'RRUUUULUDDUUUURU'),
  level('谁写下最后一句', '先改写通路，再交出控制权，最后还要重新定义终点。', '小猫负责把「沉」换成「推」，并把「你」交给石头。石头过水后，站到「赢」下面，把它竖直推上去补齐右岸的规则。', b => {
    b.rule('cat', 'you', 0, 4); b.rule('water', 'sink', 0, 1); b.rule('water', 'stop', 5, 0); b.rule('wall', 'stop', 5, 1);
    b.word('rock', 0, 5); b.word('is', 1, 5); b.word('push', 2, 2); b.word('flag', 5, 2); b.word('is', 6, 2); b.word('win', 7, 4);
    b.wallColumn(4); for (let x = 5; x <= 8; x++) b.object('water', x, 6);
    b.object('cat', 1, 7); b.object('rock', 6, 8); b.object('flag', 5, 4);
  }, 'RRUUUULUDDUUURUULLD'),
];

export const CHALLENGE_START = 12;
