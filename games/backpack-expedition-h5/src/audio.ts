export class ForestAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private userMuted=false;
  private temporaryMuted=false;
  private paused=false;
  private sync(){if(this.master)this.master.gain.value=this.userMuted||this.temporaryMuted||this.paused?0:0.12;}
  setUserMuted(muted:boolean){this.userMuted=muted;this.sync();}
  setTemporaryMuted(muted:boolean){this.temporaryMuted=muted;this.sync();return true;}
  setPaused(paused:boolean){this.paused=paused;this.sync();}
  isMuted(){return this.userMuted||this.temporaryMuted||this.paused;}
  play(kind:'hit'|'move'|'reward'|'end'){
    if(this.isMuted())return;
    try{
      this.context??=new AudioContext();
      this.master??=this.context.createGain();this.master.disconnect();this.master.connect(this.context.destination);this.sync();
      void this.context.resume();
      const oscillator=this.context.createOscillator(),gain=this.context.createGain();
      const start=this.context.currentTime;
      oscillator.type='triangle';oscillator.frequency.setValueAtTime({hit:220,move:440,reward:660,end:330}[kind],start);
      oscillator.frequency.exponentialRampToValueAtTime(kind==='reward'?880:110,start+0.12);
      gain.gain.setValueAtTime(0.8,start);gain.gain.exponentialRampToValueAtTime(0.001,start+0.16);
      oscillator.connect(gain);gain.connect(this.master);oscillator.start(start);oscillator.stop(start+0.17);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }catch{/* Audio remains optional when the browser blocks it. */}
  }
}
