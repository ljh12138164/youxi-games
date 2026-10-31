import torren from '../../assets/approved-v1/torren.png';
import mirelle from '../../assets/approved-v1/mirelle.png';
import renzo from '../../assets/approved-v1/renzo.png';
import cyra from '../../assets/approved-v1/cyra.png';
import marrow from '../../assets/approved-v1/marrow.png';
import staff from '../../assets/approved-v1/staff.png';
import lantern from '../../assets/approved-v1/lantern.png';
import daggers from '../../assets/approved-v1/daggers.png';
import scepter from '../../assets/approved-v1/scepter.png';
import book from '../../assets/approved-v1/book.png';
import scythe from '../../assets/approved-v1/scythe.png';
import sword from '../../assets/approved-v1/sword.png';
import shield from '../../assets/approved-v1/shield.png';

const sources: Record<string, string> = {
  torchguard_torren: torren, lampwright_mirelle: mirelle, quickblade_renzo: renzo,
  emberpriest_cyra: cyra, ashmask_marrow: marrow,
  magic_wand: staff, knife: daggers, fire_wand: scepter, king_bible: book,
  death_spiral: scythe, victory_sword: sword, armor: shield, lantern,
};
const expandedSources = import.meta.glob<string>('../../assets/approved-v2/*.png', {
  eager: true, query: '?url', import: 'default',
});
const battleSources = import.meta.glob<string>('../../assets/battle-v3/*.png', {
  eager: true, query: '?url', import: 'default',
});
for (const [path, url] of Object.entries({ ...expandedSources, ...battleSources })) {
  const id = path.split('/').at(-1)!.replace(/\.png$/, '');
  sources[id] = url;
}

export function hasApprovedArt(id: string): boolean {
  return Object.hasOwn(sources, id);
}
const images = new Map<string, HTMLImageElement>();
let preparation: Promise<void> | undefined;

// Decode before mounting React so portraits and cached Pixi textures never capture an empty image.
export function prepareApprovedArt(): Promise<void> {
  return preparation ??= Promise.all(Object.entries(sources).map(async ([id, url]) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    images.set(id, image);
  })).then(() => {});
}

export function drawApprovedCharacter(ctx: CanvasRenderingContext2D, id: string, frame = 0): boolean {
  const image = images.get(id);
  if (!image) return false;
  ctx.imageSmoothingEnabled = false;
  // Same 64px canvas and foot baseline as the original sprite. The sword/scythe fits inside it.
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  ctx.drawImage(image, 6, 0 + bob, 52, 52);
  return true;
}

export function drawApprovedPortrait(ctx: CanvasRenderingContext2D, id: string): boolean {
  const image = images.get(id);
  if (!image) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, 68, 68);
  return true;
}

export function drawApprovedItem(ctx: CanvasRenderingContext2D, id: string): boolean {
  const image = images.get(id);
  if (!image) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 3, 3, 42, 42);
  return true;
}

export function drawApprovedEnemy(
  ctx: CanvasRenderingContext2D, id: string, size: number, frame: number,
  color: string, flash: boolean,
): boolean {
  const image = images.get(`enemy_${id}`);
  if (!image) return false;
  ctx.imageSmoothingEnabled = false;
  const flying = id.includes('bat') || id.includes('ghost') || id === 'snow_specter' || id === 'astro_drone';
  const bob = frame ? 1 : 0;
  // Preserve the existing canvas/collision scale. Flight has a small two-phase vertical motion.
  ctx.drawImage(image, 2, 2 + bob, size - 4, size - 4 - (flying && frame ? 2 : 0));
  if (flash || color === '#38bdf8') {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = flash ? 1 : 0.5;
    ctx.fillStyle = flash ? '#ffffff' : color;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }
  return true;
}

export function drawApprovedPickup(ctx: CanvasRenderingContext2D, kind: string): boolean {
  const image = images.get(`pickup_${kind}`);
  if (!image) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, 32, 32);
  return true;
}

export function drawApprovedProjectile(ctx: CanvasRenderingContext2D, behavior: string): boolean {
  const key: Record<string, string> = {
    nearest_bolt: 'arcane', random_pierce_beam: 'fire', facing_knife: 'knife',
    bounce_tracer: 'rune', bounce_bone: 'bone', clock_freeze_ray: 'frost',
    thrust_spear: 'ice_spear', vertical_javelin: 'javelin',
  };
  const image = images.get(`projectile_${key[behavior]}`);
  if (!image) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, 48, 48);
  return true;
}
