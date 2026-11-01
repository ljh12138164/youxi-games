import atlas from './assets/forest-atlas.png';
import { useId, type CSSProperties } from 'react';

// Atlas was generated with uneven internal padding; crop each sprite explicitly.
const crops=[
  [0,25,318,355],[325,35,310,350],[643,100,290,280],[930,0,350,382],
  [75,392,195,303],[340,405,285,290],[690,405,190,290],[960,455,310,220],
  [20,710,280,245],[350,698,270,260],[680,695,235,260],[995,700,270,250],
  [20,955,290,315],[345,950,290,315],[680,960,250,290],[955,950,320,315],
];
export function Art({icon,className='',style}:{icon:number;className?:string;style?:CSSProperties}){
  const [x,y,width,height]=crops[icon];
  const clip=useId();
  return <svg className={`forest-art ${className}`} style={style} viewBox={`${x} ${y} ${width} ${height}`} aria-hidden="true">
    <defs><clipPath id={clip}><rect x={x} y={y} width={width} height={height}/></clipPath></defs>
    <image clipPath={`url(#${clip})`} href={atlas} x="0" y="0" width="1280" height="1280"/>
  </svg>;
}
