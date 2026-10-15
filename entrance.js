(() => {
 const videos=[...document.querySelectorAll('.film')],button=document.querySelector('#motion');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let active=0,paused=reduced.matches,swapping=false;
 const sync=()=>{button.textContent=paused?'播放背景影片':'暫停背景影片';button.setAttribute('aria-pressed',String(paused));};
 const play=video=>video.play().catch(()=>{paused=true;sync();});
 videos.forEach((video,i)=>{
  video.muted=true;
  video.addEventListener('timeupdate',async()=>{
   if(i!==active||paused||swapping||!Number.isFinite(video.duration)||video.duration-video.currentTime>1.4)return;
   swapping=true;const next=videos[1-i];next.currentTime=0;
   try{await next.play();if(paused||document.hidden){next.pause();swapping=false;return;}next.classList.add('visible');video.classList.remove('visible');active=1-i;setTimeout(()=>{video.pause();swapping=false;},1300);}catch{swapping=false;video.currentTime=0;}
  });
  video.addEventListener('ended',()=>{if(i===active&&!paused){video.currentTime=0;play(video);}});
 });
 button.addEventListener('click',()=>{paused=!paused;sync();if(paused)videos.forEach(v=>v.pause());else play(videos[active]);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)videos.forEach(v=>v.pause());else if(!paused)play(videos[active]);});
 reduced.addEventListener('change',e=>{if(e.matches){paused=true;videos.forEach(v=>v.pause());sync();}});
 sync();if(!paused)play(videos[active]);
})();

(() => {
 const audio=document.querySelector('#entranceMusic'),button=document.querySelector('#music'),slider=document.querySelector('#musicVolume');
 let enabled=false,fade=0;
 audio.loop=true;audio.volume=0;
 const ramp=(target,duration=1200,done=()=>{})=>{clearTimeout(fade);const initial=audio.volume,start=performance.now();const tick=now=>{const t=Math.max(0,Math.min(1,(now-start)/duration));audio.volume=initial+(target-initial)*t;if(t<1)fade=setTimeout(()=>tick(performance.now()),50);else done();};fade=setTimeout(()=>tick(performance.now()),50);};
 const sync=()=>{button.textContent=enabled?'♫ 關閉音樂':'♫ 開啟音樂';button.setAttribute('aria-pressed',String(enabled));};
 button.addEventListener('click',async()=>{if(enabled){enabled=false;sync();ramp(0,800,()=>audio.pause());}else{clearTimeout(fade);try{await audio.play();enabled=true;sync();ramp(Number(slider.value));}catch{button.textContent='音樂載入失敗 · 請重試';}}});
 slider.addEventListener('input',()=>{if(enabled)ramp(Number(slider.value),150);});
 document.querySelector('.enter').addEventListener('click',e=>{if(!enabled)return;e.preventDefault();const href=e.currentTarget.href;enabled=false;sync();ramp(0,650,()=>{audio.pause();location.href=href;});});
 document.querySelector('.entrance-guide').addEventListener('click',()=>{clearTimeout(fade);enabled=false;audio.pause();audio.volume=0;sync();});
 window.addEventListener('pagehide',()=>{clearTimeout(fade);audio.pause();});
})();
