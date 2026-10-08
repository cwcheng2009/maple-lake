const birdFrequencies={sparrow:.5,dove:.5,crow:.2};
const insectVolumes={recorded:.6,cricket:0},insectNames={recorded:'蟋蟀實錄',cricket:'蟋蟀模擬'};
const birdVolumes={sparrow:.65,dove:.3,crow:.3},birdNames={sparrow:'麻雀',dove:'珠頸斑鳩',crow:'灰背鴉'};
'use strict';
const $=id=>document.getElementById(id), canvas=$('scene'),c=canvas.getContext('2d');
let W,H,dpr,time=0,last=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,mode='auto',rain=.25,wind=.2,flash=0,gust=0,birdUntil=0,insectUntil=0,nextEvent=8,micStream,micAnalyser,micData,lastTrigger=0,lastThunderTrigger=0;
let manualThunderHistory=[],manualRainTarget=null;
let ctx,soundscape,audioEnabled=false;
let ecoMode=false,sleepDeadline=0,sleepFactor=1;
let windFlow=.2;
// One smoothed wind field drives both the sound level and the tree deformation.
function windMotion(){return windFlow}
function advanceWind(dt){
  const target=Math.max(0,wind*(.75+.32*Math.sin(time*.72)+.18*Math.sin(time*1.57+2))+gust*(.9+.18*Math.sin(time*1.6)));
  windFlow+=(target-windFlow)*(1-Math.exp(-dt/.24));
}
let rainRippleBudget=0,leafEmissionBudget=0,nextLeafEmission=-Math.log(Math.max(.000001,Math.random()));
const ripples=[],leaves=[],trees=[];let seed=4821;function rand(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646}for(let i=0;i<78;i++){
  const t={x:rand(),y:rand(),size:.55+rand()*.7,color:rand(),phase:rand()*6.28,height:.72+rand()*.75,width:.7+rand()*.65,lean:(rand()-.5)*20,crown:[]};
  const count=12+Math.floor(rand()*8);
  for(let j=0;j<count;j++){const angle=rand()*Math.PI*2,radius=Math.sqrt(rand());t.crown.push({x:Math.cos(angle)*radius*43*t.width+t.lean,y:Math.sin(angle)*radius*35-8*rand(),rx:15+rand()*17,ry:13+rand()*16,rotation:(rand()-.5)*.8,color:Math.floor(rand()*5)})}
  // An uneven upper silhouette with occasional projecting branch clusters.
  for(let j=0;j<2+Math.floor(rand()*3);j++)t.crown.push({x:(rand()-.5)*55*t.width+t.lean,y:-30-rand()*25,rx:10+rand()*12,ry:12+rand()*14,rotation:(rand()-.5)*.8,color:Math.floor(rand()*5)});
  t.flex=.7+rand()*.7;t.tempo=.65+rand()*.95;t.delay=rand()*1.4;t.bend=0;t.velocity=0;
  trees.push(t);
}
const lightning=[];
let stormEnd=0;
function makeBolt(x){
  const type=Math.floor(Math.random()*3),steps=9+Math.floor(Math.random()*13);
  const top=Math.random()*.09,bottom=.29+Math.random()*.12;
  const drift=(Math.random()-.5)*(type===2?.38:.15),jag=type===1?.065:.025;
  const points=[[x,top]];
  for(let i=1;i<=steps;i++){
    const progress=i/steps;
    points.push([Math.max(.05,Math.min(.95,x+drift*progress+(Math.random()-.5)*jag)),top+(bottom-top)*progress]);
  }
  const branches=[],branchCount=type===0?1+Math.floor(Math.random()*2):3+Math.floor(Math.random()*4);
  for(let k=0;k<branchCount;k++){
    const point=points[2+Math.floor(Math.random()*(steps-3))],direction=Math.random()<.5?-1:1;
    const path=[point],length=2+Math.floor(Math.random()*6),spread=.007+Math.random()*.018;
    for(let j=1;j<=length;j++)path.push([Math.max(.02,Math.min(.98,point[0]+direction*j*spread+(Math.random()-.5)*.015)),Math.min(.43,point[1]+j*(.007+Math.random()*.014))]);
    branches.push(path);
  }
  return {points,branches,width:1.2+Math.random()*2.2,glow:12+Math.random()*24};
}
function rainWildlife(){return Math.max(0,Math.min(1,(.45-rain)/.4))}
function birdCenter(){return Math.max(0,Math.min(1,((time*48+(Number($('birdCount').value)-1)*24.5)%(W+200)-100)/W))}
let crows=[],nextCrowAt=0,crowSerial=0;
function advanceCrows(dt){
  const frequency=birdFrequencies.crow,limit=Number($('birdCount').value);
  const active=frequency>0&&birdVolumes.crow>0&&Number($('birdCount').value)>0&&(time<birdUntil||rainWildlife()>.08&&nightBlend<.8);
  if(!active){crows=[];nextCrowAt=time+1;return;}
  for(const bird of crows)bird.x+=bird.direction*bird.speed*dt;
  crows=crows.filter(b=>b.x>-100&&b.x<W+100).slice(0,limit);
  if(time>=nextCrowAt&&crows.length<limit){
    const count=1+Math.floor(Math.random()*(limit-crows.length));
    for(let i=0;i<count;i++){
      const direction=i===1&&Math.random()<.65?-crows[crows.length-1].direction:(Math.random()<.5?1:-1);
      let altitude=.09+Math.random()*.28;
      if(crows.some(b=>Math.abs(b.y/H-altitude)<.055)){
        const slots=[.09,.16,.23,.30,.37].filter(h=>crows.every(b=>Math.abs(b.y/H-h)>=.055));
        altitude=slots.length?slots[Math.floor(Math.random()*slots.length)]:altitude;
      }
      crows.push({id:++crowSerial,x:direction===1?-65:W+65,y:H*altitude,direction,speed:160+Math.random()*90+W*.06,phase:Math.random()*Math.PI*2,scale:.85+Math.random()*.25});
    }
    nextCrowAt=time+(2+Math.random()*3)/Math.max(.05,frequency);
  }
}
function drawCrows(){for(const bird of crows)drawCrow(bird)}
function drawCrow(bird){
  if(birdVolumes.crow<=0||Number($('birdCount').value)<=0)return;
  if(!(time<birdUntil||rainWildlife()>.08&&nightBlend<.8))return;
  const pos=bird,flap=Math.sin(time*7+bird.phase);
  c.save();c.translate(pos.x,pos.y);c.scale(bird.direction*bird.scale,bird.scale);c.rotate(-.04);
  const wing=(far)=>{
    c.save();c.translate(-2,-1);c.rotate(-.25+flap*(far?.7:.9));c.scale(far?.85:1,far?.8:1);
    const shade=c.createLinearGradient(0,0,-16,-30);shade.addColorStop(0,far?'#3b4245':'#263139');shade.addColorStop(1,'#11191f');
    c.fillStyle=shade;c.beginPath();c.moveTo(3,2);c.bezierCurveTo(4,-12,-4,-28,-16,-34);
    c.bezierCurveTo(-22,-37,-24,-33,-21,-29);c.bezierCurveTo(-19,-25,-16,-23,-15,-18);
    c.bezierCurveTo(-12,-10,-8,-2,-5,3);c.quadraticCurveTo(0,5,3,2);c.fill();
    c.strokeStyle=far?'#1a252d':'#0f1921';c.lineWidth=2.1;c.lineCap='round';
    for(let i=0;i<4;i++){c.beginPath();c.moveTo(-11-i*2,-19-i*3);c.lineTo(-20-i*.8,-26-i*2.4);c.stroke();}c.restore();
  };
  wing(true);
  c.fillStyle='#18232b';c.beginPath();c.moveTo(-10,0);c.lineTo(-26,1);c.quadraticCurveTo(-30,2,-27,5);c.lineTo(-10,5);c.fill();
  const bodyShade=c.createLinearGradient(0,-6,0,7);bodyShade.addColorStop(0,'#89918f');bodyShade.addColorStop(1,'#525e62');
  c.fillStyle=bodyShade;c.beginPath();c.ellipse(-2,1,12,5.8,.06,0,Math.PI*2);c.fill();
  c.fillStyle='#18232a';c.beginPath();c.moveTo(4,-2);c.quadraticCurveTo(7,-10,13,-9);c.quadraticCurveTo(20,-9,19,-3);c.quadraticCurveTo(18,2,8,4);c.closePath();c.fill();
  c.fillStyle='#0e171e';c.beginPath();c.moveTo(17,-6);c.quadraticCurveTo(23,-6,26,-3);c.lineTo(18,-2);c.closePath();c.fill();
  c.fillStyle='#b6bdba';c.beginPath();c.arc(16,-6,1.1,0,Math.PI*2);c.fill();c.fillStyle='#0b1015';c.beginPath();c.arc(16.2,-6,.6,0,Math.PI*2);c.fill();
  c.strokeStyle='#15212a';c.lineWidth=1.2;c.beginPath();c.moveTo(0,6);c.lineTo(-5,8);c.lineTo(-8,7);c.stroke();
  wing(false);c.restore();
}
let insectCenter=.5,gustStart=0;
function windPan(){return gust>.02?-.8+1.6*Math.min(1,(time-gustStart)/5):Math.sin(time*.16)*.25}
function drawLightning(){
  const now=performance.now();
  for(let i=lightning.length-1;i>=0;i--){
    const strike=lightning[i],age=(now-strike.at)/1000;
    if(age>.9){lightning.splice(i,1);continue}if(age<0)continue;
    const glow=Math.exp(-age*7)*strike.strength;
    c.save();c.fillStyle=`rgba(214,230,255,${glow*.2})`;c.fillRect(0,0,W,H);
    const trace=(points,width)=>{c.lineWidth=width;c.beginPath();points.forEach((p,j)=>j?c.lineTo(p[0]*W,p[1]*H):c.moveTo(p[0]*W,p[1]*H));c.stroke()};
    c.globalAlpha=glow;c.lineJoin='round';c.shadowColor='#9dbbff';c.shadowBlur=strike.glow;
    c.strokeStyle='#b9ceff';trace(strike.points,strike.width*3);c.strokeStyle='#f6f8ff';trace(strike.points,strike.width);
    strike.branches.forEach(branch=>trace(branch,1));
    c.shadowBlur=0;
    c.restore();
  }
}
// Irregular left-bank clusters, ordered from the far shore toward the viewer.
const leftBank=[
  {x:-.012,y:.53,size:.85,tree:3},
  {x:.061,y:.61,size:1.15,tree:12},
  {x:.017,y:.66,size:1.48,tree:5},
  {x:.127,y:.71,size:1.08,tree:20},
  {x:.076,y:.79,size:1.85,tree:7},
  {x:-.021,y:.85,size:2.1,tree:15},
  {x:.155,y:.94,size:1.62,tree:23},
  {x:.035,y:1.04,size:2.55,tree:31},
];
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;c.setTransform(dpr,0,0,dpr,0,0)}addEventListener('resize',resize);resize();
function ellipse(x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()}
function drawMapleLeaf(leaf){
  c.save();c.translate(leaf.x,leaf.y);c.rotate(leaf.r);
  const scale=leaf.size??1;c.scale(scale*(.65+.35*Math.abs(Math.cos(leaf.r*.7))),scale);
  // Exactly five leaf tips, deep sinuses, a stem and branching veins.
  const outline=[[0,7],[-4,3],[-12,0],[-6,-3],[-8,-11],[-3,-7],[0,-16],[3,-7],[8,-11],[6,-3],[12,0],[4,3]];
  c.fillStyle=leaf.color??'#dc9b49';c.beginPath();outline.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fill();
  c.strokeStyle='#713a2590';c.lineWidth=.65;c.lineCap='round';
  c.beginPath();c.moveTo(0,11);c.quadraticCurveTo(1,7,0,3);c.lineTo(0,-12);
  for(const [x,y] of [[-10,-3],[-6,-9],[10,-3],[6,-9]]){c.moveTo(0,4);c.lineTo(x,y)}c.stroke();
  c.restore();
}
function advanceTreeSway(dt){
  for(const t of trees){
    const localTime=time-t.delay;
    const turbulence=.5*Math.sin(localTime*t.tempo*1.6+t.phase)+.24*Math.sin(localTime*t.tempo*2.7+t.phase*2.3);
    const gustAge=time-gustStart-t.delay;
    const localGust=gustAge>0?Math.max(0,1-gustAge*.12):0;
    const target=t.flex*(windMotion()*(.4+turbulence)+localGust*.35*(gust>.02?1:0));
    const stiffness=8+t.tempo*4,damping=2.4+t.flex;
    t.velocity+=(stiffness*(target-t.bend)-damping*t.velocity)*dt;
    t.bend+=t.velocity*dt;t.bend=Math.max(-.65,Math.min(1.4,t.bend));
  }
}
function tree(x,y,s,t,reflection=false){
  const force=windMotion(), phase=t.phase;
  const bend=t.bend;
  const sway=bend*70*s, height=80*s*t.height;
  c.save();c.translate(x,y);if(reflection)c.scale(1,-.62);
  c.strokeStyle='#333a2b';c.lineCap='round';c.lineWidth=4*s;
  c.beginPath();c.moveTo(0,0);c.bezierCurveTo(0,-height*.3,sway*.35,-height*.7,sway,-height);c.stroke();
  const colors=['#983f28','#bc5930','#d1813e','#977040','#b04b26'];
  for(let j=0;j<16;j++){
    const a=j*2.4,rr=(20+(j%4)*8)*s;
    const flutter=Math.sin(time*(t.tempo*1.6+j%3*.4)+phase+j)*force*(6+t.flex*5)*s;
    const xx=sway+Math.cos(a)*rr+flutter, yy=-height*.9+Math.sin(a)*rr*.85+Math.sin(time*t.tempo+phase+j*.7)*force*2*s;
    c.strokeStyle='#4e3c29';c.lineWidth=1.3*s;
    c.beginPath();c.moveTo(sway*.35,-height*.55);c.quadraticCurveTo(sway*.8,-height*.8,xx,yy);c.stroke();
    c.save();c.translate(xx,yy);c.rotate(bend*.09+Math.sin(time*2+phase+j)*force*.045);
    ellipse(0,0,(24+j%3*5)*s,(19+j%4*3)*s,colors[Math.floor(t.color*5)]);c.restore();
  }
  c.restore();
}
let dryLight=0,autoLightFrom=0,rainbowOpacity=0;
const autoPhases=['rain','clearing','birds','insects','quiet'];
let autoPhase=0,autoStarted=0,autoDuration=24,autoRain=.25,autoRainFrom=.25;
function resetAuto(){
  autoPhase=0;autoStarted=time;autoDuration=22+Math.random()*10;
  autoLightFrom=dryLight;autoRainFrom=rain;autoRain=.35+Math.random()*.4;nextEvent=time+8;
  $('modeHelp').textContent='下雨 → 漸停 → 鳥語 → 蟲鳴 → 靜息，自然循環。';
}
function advanceAuto(){
  if(mode!=='auto')return;
  let elapsed=time-autoStarted;
  if(elapsed>=autoDuration){
    autoPhase=(autoPhase+1)%autoPhases.length;autoStarted=time;elapsed=0;
    autoDuration=[22+Math.random()*10,8,16+Math.random()*8,18+Math.random()*8,8][autoPhase];
    autoLightFrom=dryLight;autoRainFrom=rain;autoRain=.35+Math.random()*.4;nextEvent=time+5;
    const phase=autoPhases[autoPhase];
    if(phase==='birds'){trigger('bird');birdUntil=time+autoDuration}
    if(phase==='insects'){trigger('insect');insectUntil=time+autoDuration;birdUntil=0}
    if(phase==='clearing')$('status').textContent='雨勢逐漸減弱，陽光與彩虹慢慢浮現。';
    if(phase==='quiet')$('status').textContent='雨後靜息，稍後迎來下一場雨。';
    if(phase==='rain')$('status').textContent='新一場雨慢慢落下。';
  }
  const phase=autoPhases[autoPhase];
  if(phase==='rain'){
    rain=autoRainFrom+(autoRain-autoRainFrom)*Math.min(1,elapsed/6);
    if(time>nextEvent){trigger(Math.random()<.7?'wind':'thunder');nextEvent=time+10+Math.random()*8}
  }else if(phase==='clearing')rain=autoRainFrom*Math.max(0,1-elapsed/autoDuration);
  else rain=0;
  dryLight=phase==='rain'?autoLightFrom*(1-Math.min(1,elapsed/6)):phase==='clearing'?Math.min(1,elapsed/autoDuration):1;
  $('rain').value=rain;
}
let nightBlend=0;
function advanceDay(dt){
  const choice=$('dayMode').value,target=choice==='night'?1:choice==='day'?0:(1-Math.cos(time*Math.PI*2/180))/2;
  nightBlend+=(target-nightBlend)*(1-Math.exp(-dt/2.5));
  $('dayLabel').textContent=nightBlend<.25?'白天':nightBlend>.75?'夜晚':'晨昏';
}
function nightColor(day,night){return `rgb(${day.map((v,i)=>Math.round(v+(night[i]-v)*nightBlend)).join(',')})`}
const moonSprite=document.createElement('canvas');moonSprite.width=64;moonSprite.height=64;
const moonCtx=moonSprite.getContext('2d');moonCtx.fillStyle='#e4eced';moonCtx.beginPath();moonCtx.arc(32,32,20,0,Math.PI*2);moonCtx.fill();
moonCtx.globalCompositeOperation='destination-out';moonCtx.beginPath();moonCtx.arc(40,26,18,0,Math.PI*2);moonCtx.fill();
function drawNight(){
  if(nightBlend<.01)return;
  c.save();c.fillStyle=`rgba(4,13,36,${nightBlend*.38})`;c.fillRect(0,0,W,H);
  const visibility=nightBlend*(1-rain*.9);
  c.globalAlpha=visibility;
  for(let i=0;i<65;i++){const x=((i*127.73)%997)/997*W,y=.025*H+((i*83.41)%313)/313*H*.26;ellipse(x,y,i%5===0?1.5:.8,i%5===0?1.5:.8,`rgba(218,231,255,${.55+.25*Math.sin(time*.7+i)})`)}
  c.globalAlpha=Math.max(0,Math.min(1,(nightBlend-.55)/.35))*(1-rain*.9);
  const x=W*.72,y=H*.17;
  c.drawImage(moonSprite,x-32,y-32);
  c.restore();
}
function skyTone(overcast,sunny){
  const day=overcast.map((v,i)=>v+(sunny[i]-v)*dryLight);
  const twilight=Math.sin(nightBlend*Math.PI)*.45,dusk=[207,143,119];
  const tone=day.map((v,i)=>v+(dusk[i]-v)*twilight);
  return nightColor(tone,overcast[0]<150?[12,24,47]:[43,57,76]);
}
const duckShelterLayout={left:[{x:.27,y:.60},{x:.35,y:.70},{x:.27,y:.60}],right:[{x:.645,y:.565},{x:.69,y:.59},{x:.645,y:.565}]};
const lakeDucks=Array.from({length:3},(_,i)=>({state:'swim',age:0,x:.42+i*.06,y:.62+i*.025,phase:Math.random()*6.28,direction:i%2?-1:1,speed:.016+Math.random()*.010,tempo:.12+Math.random()*.18,wingTempo:8+Math.random()*5,flightDuration:3+Math.random()*2,lane:.60+i*.033,behavior:'swim',nextBehavior:2+Math.random()*7,headTilt:0}));
const duckHideouts=[{x:.27,y:.60},{x:.35,y:.70},{x:.645,y:.565},{x:.91,y:.67}];
function chooseDuckRoute(bird){
 const available=duckHideouts.filter(n=>Math.abs(n.x-bird.x)>.07);
 const target=available[Math.floor(Math.random()*available.length)];
 bird.routeFrom={x:bird.x,y:bird.y};bird.routeTo=target;bird.routeProgress=0;bird.direction=target.x>bird.x?1:-1;
}
const duckWakes=[];
function advanceDucks(dt){
  for(let i=duckWakes.length-1;i>=0;i--){duckWakes[i].age+=dt;if(duckWakes[i].age>2.8)duckWakes.splice(i,1);}
  for(let i=0;i<lakeDucks.length;i++){
    const bird=lakeDucks[i],leftShelter=duckShelterLayout.left[i],rightShelter=duckShelterLayout.right[i];bird.age+=dt;
    if((bird.state==='swim'||bird.state==='return')&&rain>.1){const wasFlying=bird.state==='return';bird.state='leave';bird.age=wasFlying?0:-(i*.3+Math.random()*1.1);bird.fromX=bird.x;bird.fromY=bird.y;}
    if(bird.state==='away'&&rain<.025){bird.state='return';bird.age=-(i*.4+Math.random()*1.4);bird.targetX=.4+Math.random()*.2;bird.targetY=bird.lane;}
    if(bird.state==='leave'){const f=Math.max(0,Math.min(1,bird.age/bird.flightDuration));bird.x=bird.fromX+(1.15-bird.fromX)*f;bird.y=bird.fromY+(-.1-bird.fromY)*f;if(f===1)bird.state='away';}
    else if(bird.state==='return'){const f=Math.max(0,Math.min(1,bird.age/(bird.flightDuration+.5)));bird.x=-.1+(bird.targetX+.1)*f;bird.y=.08+(bird.targetY-.08)*f;if(f===1){bird.state='swim';bird.age=0;bird.direction=i===1?-1:1;bird.routeTo=null;}}
    else if(bird.state==='swim'){
      if(time>=bird.nextBehavior){
        bird.behavior=['swim','swim','rest','forage','preen'][Math.floor(Math.random()*5)];
        bird.behaviorStart=time;bird.actionDuration=.65+Math.random()*.65;
        bird.nextBehavior=time+(bird.behavior==='swim'?4+Math.random()*8:2+Math.random()*3);
        bird.paceTarget=bird.behavior==='rest'?.15+Math.random()*.15:.5+Math.random()*.9;
        bird.driftTarget=(Math.random()-.5)*.028;
      }
      const actionAge=time-(bird.behaviorStart??time);
      const actionEnvelope=actionAge<bird.actionDuration?Math.sin(Math.PI*actionAge/bird.actionDuration):0;
      const headTarget=bird.behavior==='forage'?.85*actionEnvelope:bird.behavior==='preen'?-.65*actionEnvelope:Math.sin(time*1.3+bird.phase)*.07;
      bird.headTilt+=(headTarget-bird.headTilt)*(1-Math.exp(-dt*9));
      bird.pace=(bird.pace??.8)+((bird.paceTarget??.8)-(bird.pace??.8))*(1-Math.exp(-dt/1.8));
      const paddle=bird.pace*(.85+.15*Math.sin(time*(.8+bird.tempo)+bird.phase));
      if(!bird.routeTo)chooseDuckRoute(bird);
      if(bird.turnTime>0)bird.turnTime=Math.max(0,bird.turnTime-dt);
      else {
        const from=bird.routeFrom,to=bird.routeTo,span=Math.abs(to.x-from.x);
        bird.routeProgress=Math.min(1,bird.routeProgress+dt*Math.max(bird.speed,4/W)*paddle/Math.max(.07,span));
        const progress=bird.routeProgress;
        bird.x=from.x+(to.x-from.x)*progress;
        // Complete the vertical approach early, then enter cover horizontally from its side.
        const middle=Math.max(0,Math.min(1,(progress-.18)/.52));
        const ease=middle*middle*(3-2*middle);
        const driftEnvelope=Math.sin(Math.PI*Math.max(0,Math.min(1,(progress-.15)/.55)));
        bird.y=from.y+(to.y-from.y)*ease+(progress>.15&&progress<.70?driftEnvelope*(bird.driftTarget??0)*.35:0);
        if(progress===1){bird.x=to.x;bird.y=to.y;chooseDuckRoute(bird);bird.turnTime=.6+Math.random()*1.6;bird.behavior='swim';}
      }
      bird.wakeClock=(bird.wakeClock??0)+dt;
      if(bird.wakeClock>.14+bird.tempo*.25){
        bird.wakeClock=0;duckWakes.push({x:bird.x,y:bird.y,age:0,direction:bird.direction,phase:bird.phase});
      }


    }
  }
}
function drawDucks(flying){
  if(!flying){
    const scale=Math.max(.6,Math.min(1,W/950));
    c.save();c.lineWidth=1;
    for(const wake of duckWakes){
      const age=wake.age,fade=Math.pow(Math.max(0,1-age/2.8),1.5);
      const x=wake.x*W-wake.direction*(10+age*6)*scale;
      const y=wake.y*H+4*scale+Math.sin(time*1.4+wake.phase+age)*.7;
      c.strokeStyle=`rgba(190,222,213,${fade*.27})`;
      c.beginPath();c.ellipse(x,y,(7+age*19)*scale,(2+age*5)*scale,0,.15,Math.PI*1.85);c.stroke();
    }
    c.restore();
  }
  for(const bird of lakeDucks){if(bird.state==='away')continue;const flight=(bird.state==='leave'&&bird.age>=0)||bird.state==='return';if(flight!==flying||(bird.state==='return'&&bird.age<0))continue;
    const x=bird.x*W,y=bird.y*H+Math.sin(time*(1.1+bird.tempo)+bird.phase)*.8,scale=Math.max(.6,Math.min(1,W/950));
    if(!flight){c.save();c.globalAlpha=.16;c.fillStyle='#73806d';c.beginPath();c.ellipse(x,y+8*scale,12*scale,4*scale,0,0,Math.PI*2);c.fill();c.restore();}
    c.save();c.translate(x,y);c.scale((flight?1:bird.direction)*scale,scale);if(!flight)c.rotate(Math.sin(time*(.7+bird.tempo)+bird.phase)*.025);
    // A rounded floating body, tapered tail and a gently curved neck.
    c.fillStyle='#847969';c.beginPath();c.moveTo(-14,-2);c.quadraticCurveTo(-6,-11,6,-7);c.quadraticCurveTo(14,-5,13,0);c.quadraticCurveTo(6,8,-7,5);c.quadraticCurveTo(-12,4,-14,-2);c.fill();
    c.fillStyle='#5d574d';c.beginPath();c.ellipse(-2,-2,8,4,-.12,0,Math.PI*2);c.fill();
    c.save();c.translate(5,-5);c.rotate(bird.headTilt);c.translate(-5,5);
    c.fillStyle='#f0e6c8';c.beginPath();c.moveTo(5,-5);c.quadraticCurveTo(9,-8,8,-12);c.lineTo(13,-11);c.quadraticCurveTo(14,-4,10,0);c.closePath();c.fill();
    c.fillStyle='#345b4b';c.beginPath();c.ellipse(12,-12,5.7,4.8,-.08,0,Math.PI*2);c.fill();
    c.fillStyle='#d5ae58';c.beginPath();c.moveTo(16,-13);c.quadraticCurveTo(22,-13,23,-10);c.lineTo(16,-9);c.closePath();c.fill();
    c.fillStyle='#101b18';c.beginPath();c.arc(14,-13,1,0,Math.PI*2);c.fill();c.restore();
    c.fillStyle='#534b3e';c.beginPath();c.moveTo(-10,-2);c.lineTo(-19,-5);c.quadraticCurveTo(-17,0,-12,2);c.fill();
    if(flight){c.save();c.translate(-1,-4);c.rotate(Math.sin(time*bird.wingTempo+bird.phase)*.65);c.fillStyle='#71695e';c.beginPath();c.moveTo(4,2);c.bezierCurveTo(2,-11,-5,-20,-15,-24);c.quadraticCurveTo(-21,-23,-17,-17);c.quadraticCurveTo(-10,-5,-5,3);c.closePath();c.fill();c.restore();}
    c.restore();
  }
}
// Reed-covered rocks conceal the ducks while they change direction.
// Each bank has a distinct, stable arrangement; wind deforms whole stems and leaves.
const reedPatches=Array.from({length:6},(_,i)=>{
 const count=[20,9,0,27,18,5][i],spread=[72,39,0,87,58,43][i];
 return Array.from({length:count},()=>({x:(Math.random()-.5)*spread,h:20+Math.random()*(i<3?40:29),lean:(Math.random()-.5)*14,phase:Math.random()*6.28,flex:.7+Math.random()*.8,seed:Math.random()})).sort((a,b)=>b.h-a.h);
});
function drawDuckShelters(){
 const scale=Math.max(.6,Math.min(1,W/950));
 for(const side of [.30,.72])for(let i=0;i<3;i++){
  if(side===.30&&i===2)continue;
  const left=side===.30,index=(left?0:3)+i,position=!left&&i===2?{x:.87,y:.73}:duckShelterLayout[left?'left':'right'][i],x=position.x*W,y=position.y*H,patch=reedPatches[index];
  c.save();c.translate(x,y);c.scale(scale,scale);
  if(left||i!==2){
  c.fillStyle=nightColor([61,77,65],[18,31,33]);c.beginPath();c.ellipse(0,5,37,7,0,0,Math.PI*2);c.fill();
  c.fillStyle=nightColor([72,82,69],[23,35,36]);c.beginPath();c.moveTo(-32,5);c.bezierCurveTo(-35,-10,-22,-16,-10,-20);c.bezierCurveTo(5,-25,27,-18,32,-5);c.quadraticCurveTo(38,8,-32,5);c.fill();
  c.strokeStyle=nightColor([100,112,82],[36,49,42]);c.lineWidth=.8;c.beginPath();c.moveTo(-23,-8);c.quadraticCurveTo(-8,-19,8,-16);c.stroke();
  }
  for(const reed of patch){
   const offset=left?[-17,9,-8][i]:[12,-16,20][i];
   const spread=left?[1.2,.7,1][i]:[1.35,.85,.7][i];
   const height=left?[.85,.65,1][i]:[1.15,.85,.65][i];
   const origin=reed.x*spread+offset,h=reed.h*height;
   const force=windMotion(),bend=(left?10:-12)+reed.lean*(left?1:-1)+force*reed.flex*(11+Math.sin(time*(.9+reed.seed*.8)+reed.phase)*9+Math.sin(time*2.1+reed.phase)*3);
   const stemX=t=>origin+bend*t*t,stemY=t=>4-h*t;
   c.strokeStyle=nightColor([91+reed.seed*30,103+reed.seed*20,57],[29,44,35]);c.lineWidth=.65+reed.seed*.45;
   c.beginPath();c.moveTo(origin,4);c.bezierCurveTo(origin,4-h*.34,origin+bend*.45,4-h*.73,stemX(1),stemY(1));c.stroke();
   // Narrow, tapered reed blades rise then arch downward, attached to the moving stem.
   for(let k=0;k<3;k++){
    const t=.3+k*.2,xx=stemX(t),yy=stemY(t),sign=(k+(reed.seed>.5?1:0))%2?1:-1;
    const length=12+reed.seed*13-k*2,flutter=Math.sin(time*(1.8+reed.seed)+reed.phase+k)*force*4;
    c.fillStyle=nightColor([106+reed.seed*25,115+reed.seed*15,65],[34,48,36]);c.beginPath();c.moveTo(xx,yy);
    c.bezierCurveTo(xx+sign*length*.35+force*3,yy-9,xx+sign*length*.8+force*5,yy-10+flutter,xx+sign*length+force*6,yy-1+flutter);
    c.bezierCurveTo(xx+sign*length*.66+force*3,yy-6+flutter,xx+sign*length*.2,yy-4,xx,yy);c.fill();
   }
   if(reed.seed>.48){
    c.save();c.translate(stemX(1),stemY(1));c.rotate(-bend/reed.h*.55);
    c.strokeStyle=nightColor([159,137,98],[59,55,42]);c.lineWidth=.55;c.beginPath();c.moveTo(0,2);c.lineTo(0,-15);c.stroke();
    for(let k=0;k<10;k++){const t=k/10,width=1+Math.sin(t*Math.PI)*3.5;
     c.strokeStyle=nightColor([170+reed.seed*20,150,111],[66,61,47]);c.beginPath();c.moveTo(0,-k*1.4);c.quadraticCurveTo(-width,-k*1.4-2,-width*.7,-k*1.4-4);c.moveTo(0,-k*1.4);c.quadraticCurveTo(width,-k*1.4-1,width*.8,-k*1.4-3);c.stroke();
    }c.restore();
   }
  }c.restore();
 }
}
function drawCabin(c=canvas.getContext('2d')){
  const x=W*.73,y=H*.52,s=Math.max(.55,Math.min(1.2,W/1050)),lamp=Math.max(0,Math.min(1,(nightBlend-.35)/.45));
  c.save();c.translate(x,y);c.scale(s,s);
  c.fillStyle='#15272355';c.beginPath();c.ellipse(0,15,62,10,0,0,Math.PI*2);c.fill();
  // Piles support a timber deck above the lake; a short walkway meets the bank.
  c.fillStyle=nightColor([77,56,37],[29,28,24]);
  for(const px of [-45,-15,18,45])c.fillRect(px-3,5,6,18+(px%3));
  c.fillStyle=nightColor([97,69,44],[36,30,25]);c.fillRect(-55,4,110,8);
  c.fillStyle=nightColor([156,112,67],[54,43,31]);c.beginPath();c.moveTo(-58,3);c.lineTo(-49,-7);c.lineTo(51,-7);c.lineTo(59,3);c.closePath();c.fill();
  c.strokeStyle=nightColor([107,74,43],[35,29,24]);c.lineWidth=1;
  for(let px=-48;px<=48;px+=9){c.beginPath();c.moveTo(px,-6);c.lineTo(px,3);c.stroke();}
  const bankX=(W*.99-x)/s,bankY=-H*.055/s;
  c.fillStyle=nightColor([101,105,62],[28,40,31]);c.beginPath();c.ellipse(bankX+12,bankY+1,34,12,-.2,0,Math.PI*2);c.fill();
  const nearA={x:43,y:-5},nearB={x:55,y:6},farA={x:bankX,y:bankY-4},farB={x:bankX+5,y:bankY+3};
  c.fillStyle=nightColor([79,54,34],[27,26,22]);c.beginPath();c.moveTo(nearB.x,nearB.y);c.lineTo(farB.x,farB.y);c.lineTo(farB.x,farB.y+3);c.lineTo(nearB.x,nearB.y+6);c.closePath();c.fill();
  c.fillStyle=nightColor([147,105,63],[48,38,28]);c.beginPath();c.moveTo(nearA.x,nearA.y);c.lineTo(farA.x,farA.y);c.lineTo(farB.x,farB.y);c.lineTo(nearB.x,nearB.y);c.closePath();c.fill();
  const boards=Math.ceil((bankX-45)/8);
  for(let i=0;i<=boards;i++){const f=1-Math.pow(1-i/boards,1.35);c.beginPath();c.moveTo(nearA.x+(farA.x-nearA.x)*f,nearA.y+(farA.y-nearA.y)*f);c.lineTo(nearB.x+(farB.x-nearB.x)*f,nearB.y+(farB.y-nearB.y)*f);c.stroke();}
  c.fillStyle=nightColor([74,52,34],[28,25,23]);
  for(const f of [.2,.5,.78]){const px=nearB.x+(farB.x-nearB.x)*f,py=nearB.y+(farB.y-nearB.y)*f+3;c.fillRect(px-2,py,4-f*1.5,17*(1-f)+5);}

  c.fillStyle=nightColor([113,72,43],[43,33,28]);c.fillRect(-42,-44,84,44);
  c.fillStyle=nightColor([145,95,54],[53,39,29]);c.beginPath();c.moveTo(-42,-44);c.lineTo(0,-76);c.lineTo(42,-44);c.fill();
  c.fillStyle=nightColor([65,54,43],[23,27,29]);c.beginPath();c.moveTo(-53,-41);c.lineTo(-3,-81);c.lineTo(4,-81);c.lineTo(53,-41);c.lineTo(44,-38);c.lineTo(0,-70);c.lineTo(-44,-38);c.closePath();c.fill();
  c.fillStyle=nightColor([95,69,48],[31,30,29]);c.fillRect(22,-76,11,25);c.fillStyle='#333632';c.fillRect(20,-78,15,4);
  c.strokeStyle=nightColor([84,52,32],[31,26,24]);c.lineWidth=1.1;for(let i=0;i<7;i++){c.beginPath();c.moveTo(-42,-41+i*6);c.lineTo(42,-41+i*6);c.stroke()}
  c.fillStyle=nightColor([65,49,34],[24,25,24]);c.fillRect(-8,-31,17,31);c.fillStyle='#b99c63';c.fillRect(4,-16,2,2);
  for(const wx of [-28,23]){
    if(lamp>.01){const glow=c.createRadialGradient(wx,-25,0,wx,-25,27);glow.addColorStop(0,`rgba(255,190,80,${lamp*.38})`);glow.addColorStop(1,'rgba(255,190,80,0)');c.fillStyle=glow;c.fillRect(wx-27,-52,54,54);}
    c.fillStyle='#322a24';c.fillRect(wx-10,-36,20,21);
    c.fillStyle=lamp>.01?`rgba(255,${Math.round(165+lamp*52)},105,${.45+lamp*.55})`:'#829694';c.fillRect(wx-8,-34,16,17);
    c.strokeStyle='#593d28';c.lineWidth=2;c.beginPath();c.moveTo(wx,-34);c.lineTo(wx,-17);c.moveTo(wx-8,-25);c.lineTo(wx+8,-25);c.stroke();
  }
  c.fillStyle=nightColor([115,94,67],[35,36,33]);c.fillRect(-13,0,29,4);c.fillRect(-18,4,39,3);c.restore();
}
const cabinMirror=document.createElement('canvas'),cabinMirrorCtx=cabinMirror.getContext('2d');
function drawCabinReflection(){
  if(cabinMirror.width!==Math.ceil(W)||cabinMirror.height!==Math.ceil(H)){cabinMirror.width=Math.ceil(W);cabinMirror.height=Math.ceil(H)}
  cabinMirrorCtx.clearRect(0,0,W,H);drawCabin(cabinMirrorCtx);
  const scale=Math.max(.55,Math.min(1.2,W/1050)),waterline=H*.52+24*scale,height=110*scale;
  c.save();c.beginPath();c.moveTo(W*.02,H*.43+24);c.lineTo(W*.98,H*.43+24);c.lineTo(W*.75,H);c.lineTo(W*.25,H);c.closePath();c.clip();
  const rough=.5+windMotion()*.8+rain*.35;
  for(let offset=0;offset<height;offset+=3){
    const depth=offset/height,shift=Math.sin(time*1.8+offset*.12)*rough*(2+depth*7);
    c.globalAlpha=(.34-nightBlend*.09)*(1-depth*.75);c.drawImage(cabinMirror,0,waterline-offset-3,W,3,shift,waterline+offset*.78,W,2.4);
  }
  c.restore();
}
function drawWaterReflections(){
  const horizon=H*.43,rough=.55+windMotion()*.75+rain*.4;
  c.save();c.beginPath();c.moveTo(W*.02,horizon+24);c.lineTo(W*.98,horizon+24);c.lineTo(W*.75,H);c.lineTo(W*.25,H);c.closePath();c.clip();
  c.globalCompositeOperation='screen';
  const lightPath=(sourceX,color,power)=>{
    if(power<.01)return;
    for(let i=0;i<150;i++){
      const depth=i/150,baseY=horizon+25+depth*(H-horizon-25);
      const y=baseY+Math.sin(time*1.8+i*.3)*(1+depth*6)*rough;
      const spread=W*(.005+Math.pow(depth,1.3)*(.045+rough*.025));
      const center=sourceX*W+(Math.sin(time*1.7+i*.31)+.4*Math.sin(time*2.8+i*.11))*rough*(5+depth*25);
      const glint=.3+.7*Math.pow(Math.max(0,Math.sin(i*2.31+time*(1.8+rough))),2);
      for(let j=-3;j<=3;j++){
        const shift=j/3,alpha=power*Math.exp(-shift*shift*3)*glint*(.25+.55*Math.sin(depth*Math.PI));
        const xx=center+shift*spread;
        c.strokeStyle=`rgba(${color},${alpha})`;c.lineWidth=.65+depth*1.8;
        const length=(1+depth*8)*(1+rough)*(.5+.5*Math.sin(i*8+j*3)**2);
        c.beginPath();c.moveTo(xx-length,y);c.lineTo(xx+length,y+Math.sin(time+i)*rough*.7);c.stroke();
      }
    }
  };
  lightPath(.72,'255,219,144',$('dayMode').value==='night'?0:dryLight*Math.max(0,Math.min(1,(.45-nightBlend)/.25))*.75);
  lightPath(.72,'182,212,255',nightBlend*(1-rain*.9)*.55);
  const cabinLight=Math.max(0,Math.min(1,(nightBlend-.35)/.45));
  if(cabinLight>.01)for(let i=0;i<48;i++){
    const depth=i/48,y=H*.525+depth*H*.24;
    const x=W*.73+Math.sin(time*1.9+i*.6)*(2+depth*12),width=(3+depth*10)*(.6+.4*Math.sin(time*2.2+i*.8)**2);
    c.strokeStyle=`rgba(255,190,92,${cabinLight*(1-depth)*.32})`;c.lineWidth=1+depth;c.beginPath();c.moveTo(x-width,y);c.lineTo(x+width,y+Math.sin(time*2+i)*1.2);c.stroke();
  }
  const now=performance.now();
  for(const strike of lightning){
    const age=(now-strike.at)/1000;if(age<0||age>.9)continue;
    const brightness=Math.exp(-age*7)*strike.strength;
    const end=strike.points[strike.points.length-1];lightPath(end[0],'209,225,255',brightness*.9);
    // Mirror the actual bolt shape, broken into wave-sized fragments.
    for(let k=0;k<strike.points.length-1;k++){
      const a=strike.points[k],b=strike.points[k+1];
      for(let j=0;j<4;j++){
        const mix=j/4,xx=(a[0]+(b[0]-a[0])*mix)*W;
        const yy=horizon+(horizon-(a[1]+(b[1]-a[1])*mix)*H)*.95;
        const wobble=Math.sin(yy*.16+time*2)*rough*14;
        c.lineWidth=1.2;c.strokeStyle=`rgba(214,231,255,${brightness*.6})`;
        c.beginPath();c.moveTo(xx+wobble-4,yy);c.lineTo(xx+wobble+4+rough*8,yy);c.stroke();
      }
    }
  }
  c.restore();
}
const rainStreaks=[];
function resetRainStreak(drop,initial=false){
  drop.x=Math.random()*(W+160)-80;drop.y=initial?Math.random()*H:-Math.random()*H*.2;
  drop.depth=Math.random();drop.speed=330+Math.random()*300+drop.depth*210;
  drop.length=8+Math.random()*16+drop.depth*11;drop.alpha=.22+Math.random()*.3+drop.depth*.13;
  drop.width=.65+drop.depth*.85;drop.drift=(Math.random()-.5)*30;
}
function drawRainStreaks(dt){
  const count=Math.round((ecoMode?.55:1)*rain*550*Math.max(.7,Math.min(1.8,W*H/(900*650))));
  while(rainStreaks.length<count){const drop={};resetRainStreak(drop,true);rainStreaks.push(drop)}
  rainStreaks.length=count;const slant=.06+windMotion()*.25;
  c.save();c.lineCap='round';
  for(const drop of rainStreaks){
    drop.y+=drop.speed*dt;drop.x+=(drop.speed*slant+drop.drift)*dt;
    if(drop.y>H+40||drop.x>W+100||drop.x<-100)resetRainStreak(drop);
    const dx=drop.length*(slant+drop.drift/drop.speed);
    c.strokeStyle=`rgba(224,241,245,${drop.alpha})`;c.lineWidth=drop.width;
    c.beginPath();c.moveTo(drop.x-dx,drop.y-drop.length);c.lineTo(drop.x,drop.y);c.stroke();
  }
  c.restore();
}
let cloudTravel=0,cloudFlowTime=0,cloudFrameAge=1;
const cloudCanvas=document.createElement('canvas');cloudCanvas.width=240;cloudCanvas.height=96;
const cloudCtx=cloudCanvas.getContext('2d'),cloudPixels=cloudCtx.createImageData(240,96);
function cloudHash(x,y){let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function cloudNoise(x,y){const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const a=cloudHash(ix,iy),b=cloudHash(ix+1,iy),d=cloudHash(ix,iy+1),e=cloudHash(ix+1,iy+1);return a+(b-a)*fx+(d-a)*fy+(a-b-d+e)*fx*fy;}
function cloudFbm(x,y){return cloudNoise(x,y)*.55+cloudNoise(x*2.03+17,y*2.03+9)*.28+cloudNoise(x*4.1+31,y*4.1+23)*.12+cloudNoise(x*8.2,y*8.2)*.05;}
function drawClouds(dt){
  const flow=Math.min(1.6,Math.max(0,windMotion()));
  // Even still weather advects clouds; stronger wind accelerates the same continuous field.
  cloudTravel+=dt*(.018+flow*.17);cloudFlowTime+=dt*(.45+flow*.65);cloudFrameAge+=dt;
  if(cloudFrameAge>=(ecoMode?.12:.05)){
    cloudFrameAge=0;const storm=Math.min(1,rain*2),pixels=cloudPixels.data;
    for(let py=0;py<96;py++)for(let px=0;px<240;px++){
      const u=px/240*7.5-cloudTravel*7.5,v=py/96*3.4,t=cloudFlowTime;
      const warpX=cloudFbm(u*.65+t*.55,v*.9+6-t*.22),warpY=cloudFbm(u*.8+18-t*.35,v*.7+t*.4);
      const warpedU=u+(warpX-.5)*2.6,warpedV=v+(warpY-.5)*2;
      const density=cloudFbm(warpedU+t*.08,warpedV)+.1*Math.sin(t*.9+warpX*5+warpY*4);
      const threshold=.49-storm*.13;
      const q=Math.max(0,Math.min(1,(density-threshold+.07)/.4)),edge=q*q*(3-2*q);
      const horizonFade=Math.min(1,(1-py/96)*5);
      const shade=Math.max(0,Math.min(1,(density-.4)*1.5));
      const idx=(py*240+px)*4;
      const day=[250-28*shade,252-25*shade,250-20*shade],dark=[85-43*shade,96-45*shade,111-45*shade];
      for(let ch=0;ch<3;ch++){const daylight=day[ch]+(dark[ch]-day[ch])*storm;const nightColor=[86,99,120][ch]-shade*27-storm*23;pixels[idx+ch]=daylight*(1-nightBlend)+nightColor*nightBlend;}
      pixels[idx+3]=255*edge*horizonFade*(.68+storm*.22);
    }
    cloudCtx.putImageData(cloudPixels,0,0);
  }
  c.save();c.imageSmoothingEnabled=true;c.filter='blur(9px)';c.drawImage(cloudCanvas,0,0,W,H*.425);c.restore();
}
function drawSunshine(){
  if($('dayMode').value==='night')return;
  const sunVisibility=dryLight*Math.max(0,Math.min(1,(.45-nightBlend)/.25));
  if(sunVisibility<.01)return;
  c.save();c.globalAlpha=sunVisibility;
  const x=W*.72,y=H*.17;
  const glow=c.createRadialGradient(x,y,10,x,y,H*.4);
  glow.addColorStop(0,'#ffedb680');glow.addColorStop(1,'#ffedb600');c.fillStyle=glow;c.fillRect(0,0,W,H*.55);
  ellipse(x,y,27,27,'#fff2c4');
  c.globalAlpha=sunVisibility*.07;c.fillStyle='#fff7cf';
  for(let i=0;i<5;i++){c.beginPath();c.moveTo(x-7+i*10,y);c.lineTo(x-160+i*75,H*.9);c.lineTo(x-105+i*75,H*.9);c.closePath();c.fill()}
  c.restore();
}
function drawRainbow(dt){
  // Keep the arc shallow on portrait screens instead of stretching it vertically.
  const visibility=Math.max(0,Math.min(1,(dryLight-.15)/.85));
  const target=visibility*visibility*(3-2*visibility)*.255*Math.pow(1-nightBlend,2);
  const fadeSeconds=target>rainbowOpacity?3:5;
  rainbowOpacity+=(target-rainbowOpacity)*(1-Math.exp(-dt/fadeSeconds));
  if(rainbowOpacity<.0001)return;
  const radiusX=W*.38,radiusY=Math.min(H*.34,radiusX*.65);
  const bandWidth=Math.max(1.2,Math.min(H*.007,radiusY*.024));
  c.save();c.globalAlpha=rainbowOpacity;c.lineWidth=bandWidth;c.shadowBlur=3;
  const colors=['#ed7774','#f5ae6c','#f5db89','#9bc894','#81bccd','#939dce','#b89aca'];
  colors.forEach((color,i)=>{
    c.strokeStyle=color;c.shadowColor=color;c.beginPath();
    c.ellipse(W*.48,H*.47,radiusX-i*bandWidth,radiusY-i*bandWidth,0,Math.PI,Math.PI*2);c.stroke();
  });c.restore();
}
function draw(dt){if(mode==='manual'&&manualRainTarget!==null){rain+=(manualRainTarget-rain)*(1-Math.exp(-dt/2));if(Math.abs(rain-manualRainTarget)<.002){rain=manualRainTarget;manualRainTarget=null}$('rain').value=rain}time+=dt;advanceDay(dt);advanceAuto();advanceCrows(dt);advanceDucks(dt);if(mode!=='auto')dryLight+=( (rain<.04?1:0)-dryLight)*(1-Math.exp(-dt/3));const horizon=H*.43;gust=Math.max(0,gust-dt*.12);advanceWind(dt);advanceTreeSway(dt);flash=Math.max(0,flash-dt*2);const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,skyTone([119,143,137],[111,170,192]));sky.addColorStop(.42,skyTone([192,188,155],[224,219,177]));sky.addColorStop(.44,nightColor([113,139,125],[31,51,68]));sky.addColorStop(1,nightColor([25,63,64],[7,22,38]));c.fillStyle=sky;c.fillRect(0,0,W,H);drawClouds(dt);drawSunshine();for(let n=0;n<3;n++){c.fillStyle=['#70867b','#617b71','#47665d'][n];c.beginPath();c.moveTo(0,horizon);for(let x=0;x<=W+10;x+=10)c.lineTo(x,horizon-35-n*18-Math.sin(x/W*9+n)*25-Math.cos(x/W*19+n)*12);c.lineTo(W,horizon+20);c.fill()}
drawRainbow(dt);
for(const t of trees){const x=t.x*W,y=horizon+t.y*24,s=(.38+t.y*.2)*Math.max(.8,W/1500);c.globalAlpha=.2;tree(x,y+9,s,t,true);c.globalAlpha=1;tree(x,y,s,t)}
// Small surface waves persist even without rain or strong wind.
const waterMotion=1.6+windMotion()*2.4;
c.save();c.beginPath();c.moveTo(W*.02,horizon+24);c.lineTo(W*.98,horizon+24);c.lineTo(W*.75,H);c.lineTo(W*.25,H);c.closePath();c.clip();
for(let i=0;i<140;i++){
  const depth=i/140,y=horizon+25+depth*(H-horizon-25);
  const length=(20+depth*85)*(1+windMotion()*.3);
  for(let j=0;j<3;j++){
    const x=((i*137.37+j*W*.34+time*(9+depth*18))%(W+length))-length;
    const phase=i*.71+j*1.9;
    c.lineWidth=.8+depth*.8;
    c.strokeStyle=`rgba(172,207,193,${.1+depth*.13})`;
    c.beginPath();
    for(let k=0;k<=10;k++){
      const xx=x+k/10*length;
      const yy=y+(Math.sin(time*1.7+phase+k*.3)+.35*Math.sin(time*2.6+phase*1.4+k*.6))*waterMotion*(.5+depth*2.4);
      if(k===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);
    }
    c.stroke();
  }
}
c.restore();
c.save();c.beginPath();c.moveTo(W*.02,horizon+24);c.lineTo(W*.98,horizon+24);c.lineTo(W*.75,H);c.lineTo(W*.25,H);c.closePath();c.clip();
// Rainfall controls surface impact density independently of the audio recording.
const rainRate=rain<=.001?0:(5*rain+95*Math.pow(rain,1.6))*Math.max(.55,Math.min(1.5,W*H/(1280*720)));
rainRippleBudget+=rainRate*dt;
while(rainRippleBudget>=1){
  rainRippleBudget-=1;
  const depth=Math.random(),size=.7+Math.random()*(.6+rain*.5);
  ripples.push({x:W*(.18+Math.random()*.64),y:horizon+18+depth*(H-horizon-45),age:0,size:size*(.55+depth*.95),life:1.6+Math.random()*.9,rain:true});
}
if(rainRate===0)rainRippleBudget=0;
for(let i=ripples.length-1;i>=0;i--){
  const r=ripples[i];r.age+=dt;
  const life=r.life??2.7,size=r.size??1,fade=Math.max(0,1-r.age/life);
  const radius=(r.age*27+2)*size;
  if(r.rain){
    // A bright rim and dark trough give the circular waves visible relief.
    for(let ring=0;ring<3;ring++){
      const age=r.age-ring*.15;if(age<0)continue;
      const rr=(age*27+2)*size,alpha=fade*(.58-ring*.14);
      c.lineWidth=Math.max(.85,size*.85);c.strokeStyle=`rgba(203,233,222,${alpha})`;
      c.beginPath();c.ellipse(r.x,r.y,rr,rr*.3,0,0,Math.PI*2);c.stroke();
      c.lineWidth=.8;c.strokeStyle=`rgba(8,42,44,${alpha*.65})`;
      c.beginPath();c.ellipse(r.x,r.y+1.4,rr+1,rr*.3+1,0,0,Math.PI*2);c.stroke();
    }
    if(r.age<.22){
      const splash=1-r.age/.22;c.strokeStyle=`rgba(227,245,234,${splash*.8})`;c.lineWidth=1;
      c.beginPath();c.moveTo(r.x-size*2,r.y);c.lineTo(r.x-size*3,r.y-splash*size*5);
      c.moveTo(r.x+size*2,r.y);c.lineTo(r.x+size*3,r.y-splash*size*4);c.stroke();
      ellipse(r.x,r.y,1.5*size,1*size,`rgba(227,245,234,${splash*.8})`);
    }
  }else{
    c.lineWidth=1.2;c.strokeStyle=`rgba(219,223,190,${fade*.5})`;
    c.beginPath();c.ellipse(r.x,r.y,radius,radius*.26,0,0,Math.PI*2);c.stroke();
  }
  if(r.age>life)ripples.splice(i,1);
}

c.restore();
// All water reflections are behind the opaque cabin and foreground banks.
drawCabinReflection();drawWaterReflections();
drawCabin();drawDucks(false);drawDuckShelters();
// Near banks frame the open water.
for(const bank of leftBank)tree(bank.x*W,bank.y*H,bank.size*Math.max(.7,W/1400),trees[bank.tree]);
for(let i=0;i<7;i++)tree(W-i*W*.028,H*.65+i*H*.055,(1.15+i*.13)*Math.max(.7,W/1400),trees[i+9]);
// Random emission follows the same wind field as sound and tree movement.
const leafWind=Math.min(1.6,Math.max(0,windMotion()));
leafEmissionBudget+=dt*(.12+50*Math.pow(leafWind,1.7));
while(leafEmissionBudget>=nextLeafEmission){
  leafEmissionBudget-=nextLeafEmission;
  nextLeafEmission=-Math.log(Math.max(.000001,Math.random()));
  if(leaves.length<250)leaves.push({x:Math.random()*W,y:Math.random()*H*.5,v:20+Math.random()*40,r:Math.random()*6,size:.65+Math.random()*.65,color:['#db7b35','#ba4527','#e8a34b','#a73525'][Math.floor(Math.random()*4)]});
}
for(let i=leaves.length-1;i>=0;i--){
  const l=leaves[i];l.x+=dt*(8+leafWind*100);l.y+=l.v*dt;l.r+=dt*(.7+leafWind*2);drawMapleLeaf(l);
  if(l.y>H||l.x>W+20)leaves.splice(i,1);
}
drawRainStreaks(dt);
drawNight();
drawDucks(true);drawCrows();if(time<birdUntil||rainWildlife()>.08&&nightBlend<.8){for(let i=0;i<Number($('birdCount').value);i++){let x=((time*48+i*49)% (W+200))-100;const y=H*.17+Math.sin(time+i)*20;const audible=Object.keys(birdVolumes).filter(t=>birdVolumes[t]>0);if(!audible.length)continue;const type=audible[i%audible.length];if(type==='crow'||birdFrequencies[type]===0)continue;x=((time*48+i*49)%(W+200+240*(1/birdFrequencies[type]-1)))-100;if(x>W+50)continue;const span=type==='crow'?13:type==='dove'?10:7;c.strokeStyle=type==='crow'?'#151c20':'#293e38';c.lineWidth=type==='crow'?3:2;c.beginPath();c.moveTo(x-span,y+Math.sin(time*(type==='crow'?5:9))*4);c.lineTo(x,y);c.lineTo(x+span,y+Math.sin(time*(type==='crow'?5:9))*4);c.stroke()}}
if(time<insectUntil||rainWildlife()>.08){for(let i=0;i<Math.round(Number($('insectDensity').value)*36);i++)ellipse((i%2?W*.91:W*.09)+Math.sin(i*14)*W*.025+Math.sin(time+i)*5,H*.72+Math.sin(i*14)*H*.09+Math.cos(time+i)*5,2,2,`rgba(232,220,128,${.4+.4*Math.sin(time*3+i)})`)}drawLightning();}
async function startAudio(enable=true){
  if(enable&&!sleepDeadline)sleepFactor=1;
  if(!ctx){ctx=new AudioContext();soundscape=new LakeSoundscape(ctx);soundscape.onDrop=(x,depth)=>{if(!paused&&rain>.001)ripples.push({x:x*W,y:H*(.46+depth*.45),age:0})}}
  await ctx.resume();
  void soundscape.loadWildlifeRecordings().catch(()=>{});
  if(!soundscape.crowRecording)void soundscape.loadCrowRecording().catch(()=>{$('status').textContent='灰背鴉錄音載入失敗，暫用合成聲。'});
  if(!soundscape.doveRecording)void soundscape.loadDoveRecording().catch(()=>{$('status').textContent='斑鳩錄音載入失敗，暫用合成聲。'});
  if(!soundscape.insectRecording)void soundscape.loadInsectRecording().then(()=>{$('status').textContent='蟋蟀實錄已就緒 · syncopika / CC0'}).catch(()=>{$('status').textContent='蟋蟀錄音載入失敗，暫用合成蟋蟀聲。'});
  audioEnabled=enable;$('soundPrompt').hidden=true;$('audio').textContent='聲音已開啟 ✓';ctx.onstatechange=()=>{const playing=audioEnabled&&!paused&&ctx.state==='running';$('soundPrompt').hidden=playing;$('soundPrompt').textContent=audioEnabled?'♫ 點此恢復自然音景':'♫ 點此開啟自然音景';$('audio').textContent=playing?'聲音已開啟 ✓':'開啟聲音 ↗'};updateAudio();
  if(soundscape.rainRecording)$('status').textContent='自然雨聲錄音已就緒 · Ylmir / CC0';
  if(!soundscape.rainRecording){
    $('status').textContent='正在載入自然雨聲錄音…';
    try{await soundscape.loadRainRecording();$('status').textContent='自然雨聲錄音已就緒 · Ylmir / CC0';updateAudio()}
    catch(error){$('status').textContent='雨聲錄音載入失敗，暫用合成雨聲；請重新開啟聲音重試。'}
  }
}
function updateAudio(){
  if(!soundscape)return;
  soundscape.update({enabled:audioEnabled&&!paused,volume:Number($('volume').value)*sleepFactor,rain,wind:wind+gust,motion:windMotion(),motionTime:time,birds:time<birdUntil||rainWildlife()>.02,insects:time<insectUntil||rainWildlife()>.02,crowSources:crows.map(b=>({id:b.id,onScreen:b.x>=-35&&b.x<=W+35,pan:Math.max(-1,Math.min(1,b.x/W*2-1)),distance:Math.max(0,Math.min(1,(.38-b.y/H)/.30))})),birdPan:birdCenter()*2-1,insectPan:insectCenter*2-1,windPan:windPan(),birdNight:nightBlend,naturalBirds:mode==='auto',birdFrequencies:{...birdFrequencies},birdVolumes:{...birdVolumes},birdCount:Number($('birdCount').value),birdVolume:(1-nightBlend*.85)*(time<birdUntil?1:Math.sqrt(rainWildlife())),insectDensity:Number($('insectDensity').value),insectVolumes:{...insectVolumes},insectVolume:1*(.35+.65*nightBlend)*(time<insectUntil?1:Math.sqrt(rainWildlife()))});
}
function chirp(){if(soundscape&&audioEnabled)soundscape.birds()}
function thunder(){
  const start=performance.now();if(start<stormEnd)return false;
  const count=Math.random()<.4?1:2;let offset=0;
  const firstCharacter=count===2?'near':(Math.random()<.7?'near':'far');
  for(let i=0;i<count;i++){
    const x=.15+Math.random()*.7,bolt=makeBolt(x),pan=bolt.points[bolt.points.length-1][0]*2-1,strength=.75+Math.random()*.25;
    const character=i===0?firstCharacter:(Math.random()<.8?'near':'far');
    lightning.push({...bolt,at:start+offset*1000,strength});
    if(soundscape&&audioEnabled)soundscape.thunder(ctx.currentTime+offset+.15,pan,strength,character);
    offset+=.3+Math.random()*.25;
  }
  stormEnd=start+offset*1000+1800;return true;
}
function trigger(kind){let stormRain=false;if(kind==='rain'){manualRainTarget=null;rain=rain>.5?.15:.8;$('rain').value=rain}if(kind==='wind'){gust=1;gustStart=time}if(kind==='thunder'){gust=.7;gustStart=time;if(thunder()&&mode==='manual'){const now=performance.now();manualThunderHistory=manualThunderHistory.filter(at=>now-at<=15000);manualThunderHistory.push(now);if(manualThunderHistory.length>=3){manualRainTarget=Math.max(rain,.8);manualThunderHistory=[];stormRain=true}}}if(kind==='bird'){birdUntil=time+9;chirp()}if(kind==='insect'){insectCenter=.15+Math.random()*.7;insectUntil=time+12;if(soundscape&&audioEnabled)soundscape.insects()}const names={rain:'雨滴落在湖面',wind:'陣風掠過楓林，樹葉沙沙作響',thunder:'連續雷擊劃過天空，殘響在湖畔迴盪',bird:'鳥群飛過天空',insect:'林間蟲鳴，微光浮現'};$('status').textContent=stormRain?'15 秒內連續觸發 3 次雷鳴，雨勢逐漸增強。':names[kind];updateAudio()}
$('audio').onclick=async()=>{try{if(audioEnabled&&ctx.state==='running'){audioEnabled=false;$('soundPrompt').hidden=false;$('audio').textContent='開啟聲音 ↗';updateAudio()}else await startAudio()}catch(e){$('status').textContent='無法啟動聲音，請使用支援 Web Audio 的瀏覽器。'}};
for(const id of ['rain','wind','volume'])$(id).oninput=()=>{if(id==='rain')manualRainTarget=null;rain=Number($('rain').value);wind=Number($('wind').value);updateAudio()};
for(const id of ['birdCount','insectDensity'])$(id).oninput=()=>{
  $('birdCountValue').textContent=$('birdCount').value+' 隻';updateAudio();
  if(id.startsWith('bird')&&Number($('birdCount').value)>0){birdUntil=Math.max(birdUntil,time+12);if(soundscape)soundscape.birds(12)}
  if((id.startsWith('insect')||id.startsWith('cricket'))&&Number($('insectDensity').value)>0){insectUntil=Math.max(insectUntil,time+12);if(soundscape)soundscape.insects(12)}
};
function showInsectControls(){const type=$('insectType').value;$('insectVolume').value=insectVolumes[type];$('insectVolumeLabel').textContent=insectNames[type]+'音量';$('insectVolumeValue').textContent=Math.round(insectVolumes[type]*100)+'%';$('insectMixSummary').textContent=Object.keys(insectVolumes).map(t=>insectNames[t]+' '+Math.round(insectVolumes[t]*100)+'%').join(' · ')}
$('insectType').onchange=showInsectControls;
$('insectVolume').oninput=()=>{insectVolumes[$('insectType').value]=Number($('insectVolume').value);showInsectControls();updateAudio();if(insectVolumes[$('insectType').value]>0){insectUntil=Math.max(insectUntil,time+12);if(soundscape)soundscape.insects(12)}};
showInsectControls();
function showBirdControls(){const type=$('birdType').value;$('birdFrequency').value=birdFrequencies[type];$('birdFrequencyValue').textContent=birdFrequencies[type]===0?'關閉':birdFrequencies[type]<.3?'偶爾':birdFrequencies[type]<.7?'中等':'頻繁';$('birdVolume').value=birdVolumes[type];$('birdVolumeLabel').textContent=birdNames[type]+'音量';$('birdVolumeValue').textContent=Math.round(birdVolumes[type]*100)+'%';$('birdMixSummary').textContent=Object.keys(birdVolumes).map(t=>birdNames[t]+' '+Math.round(birdVolumes[t]*100)+'%').join(' · ')}
$('birdType').onchange=showBirdControls;
$('birdVolume').oninput=()=>{birdVolumes[$('birdType').value]=Number($('birdVolume').value);showBirdControls();updateAudio();if(birdVolumes[$('birdType').value]>0){birdUntil=Math.max(birdUntil,time+12);if(soundscape)soundscape.birds(12)}};
showBirdControls();
function setMode(m){mode=m;manualThunderHistory=[];manualRainTarget=null;$('auto').classList.toggle('selected',m==='auto');$('manual').classList.toggle('selected',m==='manual');$('auto').setAttribute('aria-pressed',String(m==='auto'));$('manual').setAttribute('aria-pressed',String(m==='manual'));$('modeHelp').textContent=m==='auto'?'下雨 → 漸停 → 鳥語 → 蟲鳴 → 靜息，自然循環。':'按下事件按鈕，或開啟麥克風。音量超過風聲門檻觸發陣風，超過較高雷聲門檻觸發雷鳴；15 秒內觸發 3 次雷鳴會轉為下雨。';nextEvent=time+10;if(m==='auto')resetAuto()} $('auto').onclick=()=>setMode('auto');$('manual').onclick=()=>{setMode('manual');void startMic()};document.querySelectorAll('[data-event]').forEach(b=>b.onclick=async()=>{try{if(paused)return;trigger(b.dataset.event)}catch(e){$('status').textContent='聲音無法啟動，請再按一次開啟聲音。'}});
canvas.onclick=e=>{if(e.clientY>H*.43){ripples.push({x:e.clientX,y:e.clientY,age:0});if(soundscape&&audioEnabled)soundscape.waterDrop(.5,{pan:e.clientX/W*2-1,large:true,depth:.8,visual:false})}};
// Both values use the same RMS scale: 0–0.5 maps to 0–100%.
function showInputLevel(rms=0){
  const level=Math.min(100,rms/.5*100),threshold=Number($('threshold').value)/.5*100;
  $('inputLevel').textContent=Math.round(level)+'%';
  $('thresholdLevel').textContent=Math.round(threshold)+'%';
  $('inputFill').style.width=level+'%';$('thresholdMarker').style.left=threshold+'%';$('thunderLevel').textContent=Math.round(Number($('thunderThreshold').value)*200)+'%';$('thunderMarker').style.left=Number($('thunderThreshold').value)*200+'%';
  const track=document.querySelector('.input-track');track.setAttribute('aria-valuenow',String(Math.round(level)));
  const over=rms>Number($('threshold').value);document.querySelector('.input-volume').classList.toggle('over',over);
  $('inputHelp').textContent=!micAnalyser?'啟用麥克風後顯示即時音量':over?(performance.now()-lastTrigger<1800?'已觸發，冷卻中…':'已超過門檻；降低音量後重新待命'):(rms<.0001&&performance.now()-micOpenedAt>4000?'尚未收到聲音，請確認瀏覽器麥克風裝置及系統權限。':(performance.now()-lastTrigger<1800?'冷卻中…':micArmed?'待命中，超過門檻即可觸發':'請降低音量以重新待命'));
}
let currentInputRms=0,micArmed=true,thunderArmed=true;
$('inputGain').oninput=()=>{$('gainValue').textContent=$('inputGain').value+'×';micArmed=true;showInputLevel(currentInputRms)};
$('threshold').oninput=()=>{if(Number($('threshold').value)>=Number($('thunderThreshold').value))$('thunderThreshold').value=Math.min(.5,Number($('threshold').value)+.01);micArmed=true;thunderArmed=true;showInputLevel(currentInputRms)};
$('thunderThreshold').oninput=()=>{if(Number($('thunderThreshold').value)<=Number($('threshold').value))$('threshold').value=Math.max(.03,Number($('thunderThreshold').value)-.01);micArmed=true;thunderArmed=true;showInputLevel(currentInputRms)};
showInputLevel();
let micSource,micSink,micStarting=false,micOpenedAt=0;
function stopMic(){
  if(micStream)micStream.getTracks().forEach(t=>t.stop());
  if(micSource)micSource.disconnect();if(micAnalyser)micAnalyser.disconnect();if(micSink)micSink.disconnect();
  micStream=null;micSource=null;micAnalyser=null;micSink=null;currentInputRms=0;showInputLevel();
  $('mic').textContent='啟用麥克風互動';$('meter').style.color='#627c6b';
}
async function startMic(){
  if(micStarting||micStream)return;
  micStarting=true;$('mic').disabled=true;$('mic').textContent='等待麥克風授權…';
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('此瀏覽器不提供麥克風存取，請使用 Chrome / Safari 的 HTTPS 或 localhost 網址。');
    // Request capture directly from the click, independently of downloading rain audio.
    const capture=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:false}});
    void startAudio(audioEnabled).catch(error=>{$('status').textContent='聲音引擎啟動失敗：'+error.message});
    micStream=await capture;await ctx.resume();
    micAnalyser=ctx.createAnalyser();micAnalyser.fftSize=2048;
    micSource=ctx.createMediaStreamSource(micStream);micSink=ctx.createGain();micSink.gain.value=0;
    // Keep the graph rendered without playing the microphone back through speakers.
    micSource.connect(micAnalyser);micAnalyser.connect(micSink);micSink.connect(ctx.destination);
    micData=new Float32Array(micAnalyser.fftSize);micOpenedAt=performance.now();previousLevel=0;micArmed=true;thunderArmed=true;lastTrigger=lastThunderTrigger=performance.now()-1800;
    setMode('manual');$('mic').textContent='停止麥克風';
    const track=micStream.getAudioTracks()[0];
    $('status').textContent='已連接 '+(track.label||'麥克風')+'；音量僅在本機分析。';
    track.onended=()=>{stopMic();$('status').textContent='麥克風連線已中斷，請重新啟用。'};
  }catch(error){
    stopMic();
    const messages={NotAllowedError:'麥克風權限被拒絕。請在瀏覽器網站權限允許麥克風，再按一次啟用。',NotFoundError:'找不到麥克風，請確認裝置已連接。',NotReadableError:'麥克風無法開啟，可能正被其他程式占用。'};
    $('status').textContent=messages[error.name]||error.message;
  }finally{micStarting=false;$('mic').disabled=false}
}
$('mic').onclick=()=>micStream?stopMic():startMic();
let previousLevel=0;function frame(stamp){const dt=Math.min((stamp-last)/1000||.016,.12);if(document.hidden){last=stamp;requestAnimationFrame(frame);return;}if(!ecoMode||dt>=1/30){last=stamp;if(!paused)draw(dt);}if(micAnalyser){micAnalyser.getFloatTimeDomainData(micData);const rms=Math.min(.5,Math.sqrt(micData.reduce((a,v)=>a+v*v,0)/micData.length)*Number($('inputGain').value));currentInputRms=rms;showInputLevel(rms);$('meter').style.color=rms>Number($('threshold').value)?'#edc989':'#627c6b';const windThreshold=Number($('threshold').value),thunderThreshold=Number($('thunderThreshold').value);
if(rms<windThreshold*.75)micArmed=true;if(rms<thunderThreshold*.75)thunderArmed=true;
if(mode==='manual'){
  if(thunderArmed&&rms>=thunderThreshold&&stamp-lastThunderTrigger>=1800){lastThunderTrigger=lastTrigger=stamp;thunderArmed=false;micArmed=false;trigger('thunder')}
  else if(micArmed&&rms>=windThreshold&&rms<thunderThreshold&&stamp-lastTrigger>=1800){lastTrigger=stamp;micArmed=false;trigger('wind')}
}previousLevel=previousLevel*.8+rms*.2}updateAudio();requestAnimationFrame(frame)}resetAuto();draw(0);requestAnimationFrame(frame);$('pause').textContent=paused?'繼續播放':'暫停畫面與聲音';$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'繼續播放':'暫停畫面與聲音';updateAudio();$('audioHealth').textContent=paused?'畫面與聲音已暫停':audioEnabled?'音景已恢復':'聲音已關閉'};$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(e){$('status').textContent='此瀏覽器不支援全螢幕。'}};addEventListener('pagehide',stopMic);

$('togglePanel').onclick=()=>{
  const panel=$('parameterPanel');panel.hidden=!panel.hidden;
  $('togglePanel').textContent=panel.hidden?'顯示參數':'隱藏參數';
  $('togglePanel').setAttribute('aria-expanded',String(!panel.hidden));
};

$('soundPrompt').onclick=()=>startAudio().catch(()=>{$('status').textContent='聲音無法啟動，請再次點擊重試。'});

$('birdFrequency').oninput=()=>{const type=$('birdType').value,value=Number($('birdFrequency').value);birdFrequencies[type]=value;showBirdControls();if(type==='crow'){nextCrowAt=time+(value>0?(2+Math.random()*3)/value:0);if(value===0)crows=[];}if(soundscape)soundscape.nextSpeciesBird[type]=ctx.currentTime+1;updateAudio();};

$('resumeAudio').onclick=async()=>{try{await startAudio();soundscape.birds(12);soundscape.insects(12);$('status').textContent='已重新啟動音景。'}catch(e){$('audioHealth').textContent='啟動失敗，請再試一次';}};
setInterval(()=>{
  if(paused){$('audioHealth').textContent='畫面與聲音已暫停';return;}if(!ctx||!audioEnabled){$('audioHealth').textContent='聲音已關閉';return;}
  if(ctx.state!=='running'){$('audioHealth').textContent='播放已暫停，請按恢復聲音';return;}
  soundscape.monitor.getFloatTimeDomainData(soundscape.monitorData);
  const rms=Math.sqrt(soundscape.monitorData.reduce((sum,v)=>sum+v*v,0)/soundscape.monitorData.length);
  $('audioHealth').textContent=rms>.00001?'音景輸出 '+Math.round(20*Math.log10(rms))+' dBFS':'播放中 · 目前音景安靜';
},500);

// Presets adjust the environment without starting sound or requesting a microphone.
$('preset').onchange=()=>{
 const presets={morning:{day:'day',rain:0,wind:.12,birds:[.65,.24,.12],bugs:.18},breeze:{day:'day',rain:0,wind:.48,birds:[.5,.2,.1],bugs:.25},night:{day:'night',rain:0,wind:.08,birds:[0,0,0],bugs:.65}};
 const p=presets[$('preset').value];if(!p)return;
 setMode('manual');manualRainTarget=null;rain=p.rain;wind=p.wind;gust=0;dryLight=1;
 $('dayMode').value=p.day;$('rain').value=rain;$('wind').value=wind;
 ['sparrow','dove','crow'].forEach((type,i)=>birdVolumes[type]=p.birds[i]);insectVolumes.recorded=p.bugs;insectVolumes.cricket=0;
 birdUntil=time+12;insectUntil=time+12;showBirdControls();showInsectControls();updateAudio();
 $('modeHelp').textContent='預設音景持續播放；可調整參數，或切回自動流轉。';
 $('status').textContent=$('preset').selectedOptions[0].textContent+' · 按開啟聲音聆聽';
};
if(matchMedia('(max-width:700px)').matches){$('parameterPanel').hidden=true;$('togglePanel').textContent='顯示參數';$('togglePanel').setAttribute('aria-expanded','false');}
setInterval(()=>{
 $('audio').setAttribute('aria-pressed',String(audioEnabled));
 $('audio').textContent=audioEnabled?'靜音音景':'開啟聲音';
 $('pause').textContent=paused?'繼續播放':'暫停播放';
},200);

// Long-session controls use wall-clock time, so sleep also works in background tabs.
$('ecoMode').onchange=()=>{ecoMode=$('ecoMode').checked;savePreferences();};
$('sleepTimer').onchange=()=>{sleepDeadline=Number($('sleepTimer').value)>0?Date.now()+Number($('sleepTimer').value)*60000:0;sleepFactor=1;updateAudio();};
setInterval(()=>{
 if(!sleepDeadline){$('sleepStatus').textContent='未設定定時';return;}
 const remaining=sleepDeadline-Date.now();sleepFactor=Math.max(0,Math.min(1,remaining/30000));
 $('sleepStatus').textContent=remaining>30000?'剩餘 '+Math.ceil(remaining/60000)+' 分鐘':remaining>0?'音量逐漸淡出…':'已定時停止';
 if(remaining<=0){sleepDeadline=0;audioEnabled=false;paused=true;$('sleepTimer').value='0';}
 updateAudio();
},250);
const preferenceIds=['dayMode','rain','wind','volume','birdCount','insectDensity','inputGain','threshold','thunderThreshold'];
function savePreferences(){try{localStorage.setItem('mapleLake.preferences.v1',JSON.stringify({values:Object.fromEntries(preferenceIds.map(id=>[id,$(id).value])),birdVolumes,insectVolumes,birdFrequencies,ecoMode}));}catch{}}
try{
 const saved=JSON.parse(localStorage.getItem('mapleLake.preferences.v1')||'null');
 if(saved){for(const id of preferenceIds){const v=saved.values?.[id];if(v!==undefined&&Number.isFinite(Number(v))||id==='dayMode'&&['cycle','day','night'].includes(v))$(id).value=v;}
 for(const [target,source] of [[birdVolumes,saved.birdVolumes],[insectVolumes,saved.insectVolumes],[birdFrequencies,saved.birdFrequencies]])for(const key of Object.keys(target))if(Number.isFinite(source?.[key]))target[key]=Math.max(0,Math.min(1,source[key]));
 ecoMode=!!saved.ecoMode;$('ecoMode').checked=ecoMode;wind=Number($('wind').value);rain=Number($('rain').value);showBirdControls();showInsectControls();resetAuto();}
}catch{}
$('parameterPanel').addEventListener('input',savePreferences);$('parameterPanel').addEventListener('change',savePreferences);
document.addEventListener('visibilitychange',()=>{last=performance.now();});

setInterval(()=>{
 if(!audioEnabled||paused||document.hidden||!soundscape?.active)return;
 const frequency=Number($('duckFrequency').value),volume=Number($('duckVolume').value);
 if(!frequency||!volume)return;
 for(const bird of lakeDucks){
  if(bird.nextCall===undefined){bird.nextCall=time+3+Math.random()*25;continue;}
  if(bird.state!=='swim'||time<bird.nextCall)continue;
  bird.nextCall=time+(10+Math.random()*35)/Math.max(.1,frequency);
  soundscape.duckCall({pan:Math.max(-1,Math.min(1,bird.x*2-1))},volume);
 }
},500);
