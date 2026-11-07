import type {SaveStorage} from './storage.ts';

export type GameInput={type:'down'|'move'|'up'|'cancel';x:number;y:number;touch:boolean;button:number};
export type GameHit={label:string;x:number;y:number;w:number;h:number;enabled:boolean;tap:()=>void;item?:number};
export type GamePlatform={
  canvas:HTMLCanvasElement;
  createImage:()=>HTMLImageElement;
  viewport:()=>{width:number;height:number;dpr:number;top:number;bottom:number};
  storage:SaveStorage;
  saveKey?:string;
  resources:Record<string,string>;
  reducedMotion:boolean;
  sound:{play:(kind:'hit'|'move'|'reward'|'end')=>void;setUserMuted:(v:boolean)=>void;setPaused:(v:boolean)=>void;isMuted:()=>boolean};
  exportText:(text:string)=>Promise<void>;
  importText:()=>Promise<string>;
  onState?:(state:GameSnapshot,hits:GameHit[])=>void;
  ready?:()=>void;
};
export type GameSnapshot={running:boolean;frame:number;paused:string[];started:boolean;ready:boolean;run:import('./engine.ts').Run;selected:number|null;rotation:number;screen:string|null;notice:string;motion:{def:string;kind:string;elapsed:number;result:string;target?:number}|null;scroll:number;ui:{text:string[];neighbors:number[];tooltip:number|null;tooltipBounds:{x:number;y:number;w:number;h:number}|null;ground:{x:number;y:number;w:number;h:number};focus:string|null;preview:{destination:string[];returns:string[];targets:number[];blocked:number[];valid:boolean}|null;panel:{x:number;y:number;w:number;h:number;tab:string;scroll:number;maxScroll:number}|null}};
