// Adapted from supplied SYNTH static/js/03-charts.js: indexed candles, zoom,
// crosshair, SMA/EMA and canvas rendering. Instance-local and feed-independent.
const priceText=v=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const timeText=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function smaSeries(candles,period){const out=[];let sum=0;for(let i=0;i<candles.length;i++){sum+=candles[i].close;if(i>=period)sum-=candles[i-period].close;if(i>=period-1)out.push({...candles[i],price:sum/period});}return out;}
export function emaSeries(candles,period){const out=[],k=2/(period+1);let ema=null;for(let i=0;i<candles.length;i++){ema=ema==null?candles[i].close:candles[i].close*k+ema*(1-k);if(i>=period-1)out.push({...candles[i],price:ema});}return out;}
export function clampView(view,base){if(!view)return null;const total=Math.max(1,base.to-base.from),span=Math.min(total+12,Math.max(8,view.to-view.from));const from=Math.max(base.from-4,Math.min(base.to+8-span,view.from));return {from,to:from+span};}
function indexedLine(ctx,points,x,y,color,width=1.5){if(points.length<2)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.index),y(p.price)):ctx.moveTo(x(p.index),y(p.price)));ctx.stroke();}
export class PulseChart {
  constructor(container){
    this.container=container;this.doc=container.ownerDocument;this.win=this.doc.defaultView;this.canvas=this.doc.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Market price chart. Use plus and minus to zoom, F to fit, L to follow the latest price.');
    this.canvas.style.cssText='width:100%;height:310px;display:block;touch-action:pan-y;outline-offset:-3px';container.append(this.canvas);
    this.tip=this.doc.createElement('div');this.tip.className='chart-tip';this.tip.hidden=true;container.append(this.tip);
    this.rows=[];this.config={};this.view=null;this.hover=null;this.drag=null;this.follow=true;this.events=[];
    const on=(type,fn,opts)=>{this.canvas.addEventListener(type,fn,opts);this.events.push([type,fn,opts]);};
    const point=e=>{const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    on('wheel',e=>{if(!this.map)return;e.preventDefault();const p=point(e);this.zoom(e.deltaY>0?1.22:.82,(p.x-this.map.pad.l)/this.map.plotW);},{passive:false});
    on('pointerdown',e=>{if(!this.map)return;const p=point(e);this.drag={x:p.x,view:{...this.map.view}};this.canvas.setPointerCapture?.(e.pointerId);this.follow=false;});
    on('pointermove',e=>{const p=point(e);this.hover=p;if(this.drag&&this.map){const dx=(p.x-this.drag.x)/this.map.plotW*(this.drag.view.to-this.drag.view.from);this.view=clampView({from:this.drag.view.from-dx,to:this.drag.view.to-dx},this.base);}this.draw();});
    on('pointerup',()=>this.drag=null);on('pointercancel',()=>this.drag=null);on('pointerleave',()=>{this.hover=null;this.tip.hidden=true;this.draw();});
    on('dblclick',()=>this.fit());on('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();this.zoom(.8);}if(e.key==='-'){e.preventDefault();this.zoom(1.25);}if(e.key.toLowerCase()==='f')this.fit();if(e.key.toLowerCase()==='l')this.latest();});
    this.resize=()=>this.draw();if(this.win.ResizeObserver){this.observer=new this.win.ResizeObserver(this.resize);this.observer.observe(container);}else this.win.addEventListener('resize',this.resize);
  }
  update(rows,config={},levels=[]){this.rows=rows;this.config=config;this.levels=levels;this.draw();}
  fit(){this.view=null;this.follow=false;this.draw();}
  latest(){this.view=null;this.follow=true;this.draw();}
  zoom(factor,ratio=.5){if(!this.map)return;ratio=Math.max(0,Math.min(1,ratio));const v=this.map.view,span=(v.to-v.from)*factor,focus=v.from+(v.to-v.from)*ratio;this.view=clampView({from:focus-span*ratio,to:focus+span*(1-ratio)},this.base);this.follow=false;this.draw();}
  draw(){
    const rect=this.canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    const dpr=Math.min(3,this.win.devicePixelRatio||1),w=rect.width,h=rect.height;
    this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);
    const ctx=this.canvas.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fbfdf9';ctx.fillRect(0,0,w,h);
    if(!this.rows.length){ctx.fillStyle='#75847b';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('Your live chart builds as prices arrive.',w/2,h/2-5);ctx.font='11px system-ui';ctx.fillText('No invented history. Gaps stay visible.',w/2,h/2+19);this.tip.hidden=true;return;}
    const interval=this.rows[0].intervalMs,first=this.rows[0].time,rows=this.rows.map(r=>({...r,index:(r.time-first)/interval}));
    this.base={from:0,to:rows.at(-1).index};
    if(this.follow)this.view={from:Math.max(-2,this.base.to-80),to:Math.max(12,this.base.to+5)};
    else this.view=clampView(this.view,this.base);
    const view=this.view||{from:-2,to:Math.max(12,this.base.to+5)},visible=rows.filter(r=>r.index>=view.from-1&&r.index<=view.to+1);
    const prices=visible.flatMap(r=>[r.low,r.high]);if(!prices.length)return;
    let lo=Math.min(...prices),hi=Math.max(...prices),margin=Math.max((hi-lo)*.14,hi*.00015);lo-=margin;hi+=margin;
    const pad={l:w<500?12:22,r:76,t:20,b:33},hasVolume=this.config.showVolume&&visible.some(r=>r.volume!=null),volumeH=hasVolume?55:0;
    const bottom=h-pad.b-volumeH,plotW=Math.max(1,w-pad.l-pad.r),plotH=bottom-pad.t;
    const x=i=>pad.l+(i-view.from)/(view.to-view.from)*plotW,y=p=>pad.t+(hi-p)/(hi-lo)*plotH;
    this.map={pad,plotW,view,bottom};ctx.font='10px system-ui';ctx.lineWidth=1;
    for(let i=0;i<5;i++){const yy=pad.t+plotH*i/4;ctx.strokeStyle='#e3eae0';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#73816f';ctx.textAlign='left';ctx.fillText(priceText(hi-(hi-lo)*i/4),w-pad.r+9,yy+3);}
    const ticks=Math.max(2,Math.floor(plotW/125));ctx.textAlign='center';
    for(let i=0;i<=ticks;i++){const index=view.from+(view.to-view.from)*i/ticks,xx=x(index);ctx.fillStyle='#73816f';ctx.fillText(timeText(first+index*interval),xx,h-10);}
    ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,plotW,plotH);ctx.clip();
    const width=Math.max(1,Math.min(14,plotW/(view.to-view.from)*.65)),type=this.config.chartType||'candles';
    if(type==='line'||type==='area'){
      if(type==='area'){
        const groups=[];for(const r of visible){if(!groups.length||r.index-groups.at(-1).at(-1).index>1)groups.push([]);groups.at(-1).push(r);}
        const gradient=ctx.createLinearGradient(0,pad.t,0,bottom);gradient.addColorStop(0,'#7caf8866');gradient.addColorStop(1,'#7caf8800');ctx.fillStyle=gradient;
        for(const group of groups){ctx.beginPath();group.forEach((r,i)=>i?ctx.lineTo(x(r.index),y(r.close)):ctx.moveTo(x(r.index),y(r.close)));ctx.lineTo(x(group.at(-1).index),bottom);ctx.lineTo(x(group[0].index),bottom);ctx.closePath();ctx.fill();}
      }
      // Break lines across intervals with no observations.
      ctx.strokeStyle='#2d7963';ctx.lineWidth=2;ctx.beginPath();visible.forEach((r,i)=>i&&r.index-visible[i-1].index<=1?ctx.lineTo(x(r.index),y(r.close)):ctx.moveTo(x(r.index),y(r.close)));ctx.stroke();
    }else for(const r of visible){const xx=x(r.index),up=r.close>=r.open;ctx.strokeStyle=up?'#318770':'#be6258';ctx.fillStyle=up?'#63a58a':'#d98a7d';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(xx,y(r.high));ctx.lineTo(xx,y(r.low));ctx.stroke();
      if(type==='ohlc'){ctx.beginPath();ctx.moveTo(xx-width/2,y(r.open));ctx.lineTo(xx,y(r.open));ctx.moveTo(xx,y(r.close));ctx.lineTo(xx+width/2,y(r.close));ctx.stroke();}
      else ctx.fillRect(xx-width/2,Math.min(y(r.open),y(r.close))-Number(r.open===r.close),width,Math.max(2,Math.abs(y(r.close)-y(r.open))));}
    if(this.config.showMA)indexedLine(ctx,smaSeries(rows,20),x,y,'#bb9334');
    if(this.config.showEMA)indexedLine(ctx,emaSeries(rows,50),x,y,'#6d83b9');
    for(const level of this.levels||[]){if(!Number.isFinite(level.price))continue;ctx.strokeStyle='#879268';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pad.l,y(level.price));ctx.lineTo(w-pad.r,y(level.price));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#63704b';ctx.textAlign='left';ctx.fillText(level.label||'Entry',pad.l+4,y(level.price)-5);}
    ctx.restore();
    if(hasVolume){const max=Math.max(1,...visible.map(r=>r.volume||0));for(const r of visible){if(r.volume==null)continue;ctx.fillStyle=r.close>=r.open?'#a8cdb8':'#e7b4a9';const bh=r.volume/max*(volumeH-12);ctx.fillRect(x(r.index)-width/2,h-pad.b-bh,width,bh);}}
    const last=rows.at(-1),lastY=Math.min(bottom,Math.max(pad.t,y(last.close)));ctx.setLineDash([4,4]);ctx.strokeStyle='#4c896b99';ctx.beginPath();ctx.moveTo(pad.l,lastY);ctx.lineTo(w-pad.r,lastY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#214e3d';ctx.fillRect(w-pad.r+3,lastY-10,72,20);ctx.fillStyle='#f2f9dc';ctx.textAlign='center';ctx.fillText(priceText(last.close),w-pad.r+39,lastY+3);
    if(this.hover&&this.hover.x>=pad.l&&this.hover.x<=w-pad.r&&this.hover.y<=bottom){const target=view.from+(this.hover.x-pad.l)/plotW*(view.to-view.from);let nearest=visible[0];for(const row of visible)if(Math.abs(row.index-target)<Math.abs(nearest.index-target))nearest=row;
      ctx.strokeStyle='#748775';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x(nearest.index),pad.t);ctx.lineTo(x(nearest.index),bottom);ctx.moveTo(pad.l,this.hover.y);ctx.lineTo(w-pad.r,this.hover.y);ctx.stroke();ctx.setLineDash([]);
      this.tip.textContent=`${timeText(nearest.time)} · O ${priceText(nearest.open)}   H ${priceText(nearest.high)}   L ${priceText(nearest.low)}   C ${priceText(nearest.close)} · Volume ${nearest.volume==null?'unavailable':priceText(nearest.volume)}${nearest.samples==null?'':` · ${nearest.samples} sample${nearest.samples===1?'':'s'}`}`;this.tip.hidden=false;
    }else this.tip.hidden=true;
  }
  destroy(){this.observer?.disconnect();this.win.removeEventListener('resize',this.resize);for(const [t,f,o] of this.events)this.canvas.removeEventListener(t,f,o);this.canvas.remove();this.tip.remove();}
}
