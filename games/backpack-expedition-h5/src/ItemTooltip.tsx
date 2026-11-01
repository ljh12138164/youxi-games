import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function ItemTooltip({anchor,name,onClose,children}:{anchor:HTMLElement;name:string;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLElement>(null);
  const [position,setPosition]=useState({left:12,top:12});
  useLayoutEffect(()=>{
    const place=()=>{
      if(!ref.current||!anchor.isConnected){onClose();return;}
      const rect=anchor.getBoundingClientRect(),box=ref.current.getBoundingClientRect(),gap=12;
      let left=rect.right+gap,top=rect.top;
      if(left+box.width>innerWidth-gap)left=rect.left-box.width-gap;
      if(left<gap){left=rect.left;top=rect.bottom+gap;if(top+box.height>innerHeight-gap)top=rect.top-box.height-gap;}
      setPosition({left:Math.max(gap,Math.min(left,innerWidth-box.width-gap)),top:Math.max(gap,Math.min(top,innerHeight-box.height-gap))});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[anchor,children,onClose]);
  return <section ref={ref} id="item-tooltip" className="item-tooltip parchment" role="dialog" aria-label={`${name}详情`} style={position}>
    <button className="tooltip-close" aria-label="关闭物品详情" onClick={onClose}>×</button>
    {children}
  </section>;
}
