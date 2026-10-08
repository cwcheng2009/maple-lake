'use strict';
(()=>{
 const canvas=document.createElement('canvas');canvas.className='outreach-background';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
 const c=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),small=matchMedia('(max-width:640px)');
 let w=0,h=0,last=0,t=0,pointer={x:0,y:0,active:false},ripples=[],trails=[];
 const kind=location.pathname.includes('research')?'waves':location.pathname.includes('collaboration')?'stars':'mist';
 const clouds=Array.from({length:small.matches?7:11},(_,i)=>({x:Math.random(),y:Math.random(),phase:Math.random()*6.28,r:.18+Math.random()*.18,speed:.07+Math.random()*.08}));
 const stars=Array.from({length:small.matches?16:32},()=>({x:Math.random(),y:Math.random(),phase:Math.random()*6.28}));
 function resize(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,small.matches?1.25:1.5);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);c.setTransform(d,0,0,d,0,0);paint(0);}
 function paint(dt){
  t+=dt;c.clearRect(0,0,w,h);c.fillStyle='#102724';c.fillRect(0,0,w,h);
  for(const cloud of clouds){
   let x=(cloud.x+.12*Math.sin(t*cloud.speed+cloud.phase))*w,y=(cloud.y+.09*Math.cos(t*cloud.speed*.7+cloud.phase))*h;
   if(pointer.active&&!reduced.matches){const dx=x-pointer.x,dy=y-pointer.y,d=Math.hypot(dx,dy),f=Math.max(0,1-d/250);x+=dx*f*.09;y+=dy*f*.09;}
   const r=Math.max(w,h)*cloud.r*(1+.12*Math.sin(t*.16+cloud.phase));
   const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,cloud.phase<2?'rgba(171,149,88,.065)':'rgba(81,134,117,.16)');g.addColorStop(.5,'rgba(72,112,101,.055)');g.addColorStop(1,'rgba(72,112,101,0)');
   c.save();c.translate(x,y);c.rotate(Math.sin(t*.08+cloud.phase)*.4);c.scale(1.25,.8);c.translate(-x,-y);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
  }
  if(kind==='waves')for(let j=0;j<4;j++){
   c.beginPath();c.strokeStyle=`rgba(182,204,178,${.025+j*.006})`;c.lineWidth=.8;
   for(let x=0;x<=w;x+=12){const y=h*(.22+j*.18)+Math.sin(x/w*9+t*.25+j)*14+Math.sin(x/w*21-t*.18+j)*5;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
  }
  if(kind==='stars')for(const star of stars){let x=star.x*w+Math.sin(t*.12+star.phase)*12,y=star.y*h+Math.cos(t*.1+star.phase)*9;
   if(pointer.active&&!reduced.matches){const dx=pointer.x-x,dy=pointer.y-y,d=Math.hypot(dx,dy),f=Math.max(0,1-d/170);x+=dx*f*.12;y+=dy*f*.12;}
   c.fillStyle=`rgba(218,203,151,${.12+.08*Math.sin(t*.6+star.phase)})`;c.beginPath();c.arc(x,y,1.2,0,Math.PI*2);c.fill();
  }
  for(let i=trails.length-1;i>=0;i--){const p=trails[i];p.age+=dt;if(p.age>1.8){trails.splice(i,1);continue;}const r=18+p.age*24,g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(148,186,154,${.025*(1-p.age/1.8)})`);g.addColorStop(1,'rgba(148,186,154,0)');c.fillStyle=g;c.fillRect(p.x-r,p.y-r,r*2,r*2);}
  for(let i=ripples.length-1;i>=0;i--){const p=ripples[i];p.age+=dt;if(p.age>2.5){ripples.splice(i,1);continue;}c.strokeStyle=`rgba(218,204,161,${.14*(1-p.age/2.5)})`;c.lineWidth=.8;c.beginPath();c.ellipse(p.x,p.y,8+p.age*52,5+p.age*29,0,0,Math.PI*2);c.stroke();}
 }
 let lastTrail=0;
 addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY,active:true};if(!reduced.matches&&performance.now()-lastTrail>65){trails.push({x:e.clientX,y:e.clientY,age:0});lastTrail=performance.now();if(trails.length>28)trails.shift();}},{passive:true});
 addEventListener('pointerout',e=>{if(!e.relatedTarget)pointer.active=false;},{passive:true});
 addEventListener('pointerdown',e=>{if(reduced.matches||e.target.closest('a,button,input,select,textarea'))return;pointer={x:e.clientX,y:e.clientY,active:true};ripples.push({x:e.clientX,y:e.clientY,age:0});if(ripples.length>6)ripples.shift();},{passive:true});
 function frame(stamp){if(document.hidden||reduced.matches){last=stamp;requestAnimationFrame(frame);return;}const interval=small.matches?50:33;if(stamp-last>=interval){paint(Math.min(.1,(stamp-last)/1000||.033));last=stamp;}requestAnimationFrame(frame);}
 addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>last=performance.now());reduced.addEventListener('change',()=>{ripples=[];trails=[];paint(0);});resize();requestAnimationFrame(frame);
})();
