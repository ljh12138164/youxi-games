import atlas from './assets/actors-pixel-v1.png';
import weapons from './assets/weapons-pixel-v1.png';
import equipment from './assets/equipment-pixel-v1.png';
import { ITEM_SPRITES } from './item-sprites.ts';
import { ACTOR_SPRITES } from './actor-sprites.ts';
import { useId, type CSSProperties } from 'react';

export const artSources=[atlas,weapons,equipment];
export function Art({item,actor='hero',className='',style}:{item?:string;actor?:string;className?:string;style?:CSSProperties}){
  const sprite=item?ITEM_SPRITES[item]:undefined;
  const index=sprite?sprite.index:ACTOR_SPRITES[actor];
  const x=(index%4)*320,y=Math.floor(index/4)*320,width=320,height=320;
  const src=sprite?(sprite.sheet==='weapons'?weapons:equipment):atlas;
  const clip=useId();
  return <svg className={`forest-art ${className}`} style={style} viewBox={`${x} ${y} ${width} ${height}`} aria-hidden="true" data-sprite={sprite?`${sprite.sheet}:${sprite.index}`:undefined} data-actor={sprite?undefined:actor}>
    <defs><clipPath id={clip}><rect x={x} y={y} width={width} height={height}/></clipPath></defs>
    <image clipPath={`url(#${clip})`} href={src} x="0" y="0" width="1280" height={sprite?sprite.rows*320:1280} preserveAspectRatio="none"/>
  </svg>;
}
