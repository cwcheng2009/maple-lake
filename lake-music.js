(() => {
 const tracks=[{id:'dawn',name:'湖畔晨光'},{id:'ripples',name:'湖光微瀾'},{id:'felt',name:'柔光琴語'}];
 const choice=document.querySelector('#lakeMusicChoice'),toggle=document.querySelector('#lakeMusicToggle'),slider=document.querySelector('#lakeMusicVolume'),value=document.querySelector('#lakeMusicValue'),status=document.querySelector('#lakeMusicStatus');
 const audio=new Audio();audio.preload='none';audio.volume=0;audio.id='lakeMusicAudio';audio.hidden=true;document.body.append(audio);
 let enabled=false,sitePaused=typeof paused==='boolean'?paused:false,factor=1,current=null,bag=[],frame=0,token=0;
 const blocked=()=>sitePaused;
 const volume=()=>Number(slider.value)*factor;
 function ramp(target,ms=700,done=()=>{}){clearTimeout(frame);const start=performance.now(),initial=audio.volume;function tick(now){const t=Math.max(0,Math.min(1,(now-start)/ms));audio.volume=Math.max(0,Math.min(1,initial+(target-initial)*t));if(t<1)frame=setTimeout(()=>tick(performance.now()),50);else{frame=0;done();}}frame=setTimeout(()=>tick(performance.now()),50);}
 function show(){toggle.textContent=enabled?'♫ 關閉音樂':'♫ 播放音樂';toggle.setAttribute('aria-pressed',String(enabled));value.textContent=Math.round(Number(slider.value)*100)+'%';status.textContent=!enabled?'音樂已關閉':blocked()?'配樂已暫停':current?'正在播放：'+current.name+(choice.value==='random'?' · 自動隨機':' · 循環播放'):'正在載入配樂…';}
 function pick(){if(choice.value!=='random')return tracks.find(t=>t.id===choice.value);if(!bag.length){bag=tracks.map(t=>t.id).filter(id=>id!==current?.id);for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}}const id=bag.pop();return tracks.find(t=>t.id===id);}
 async function start(next){const attempt=++token;clearTimeout(frame);audio.pause();audio.volume=0;if(next||!current){current=pick();audio.src='assets/music/'+current.id+'.mp3';}show();if(!enabled||blocked())return;try{await audio.play();if(attempt!==token)return;if(!enabled||blocked()){audio.pause();return;}ramp(volume());show();}catch{if(attempt!==token)return;enabled=false;show();status.textContent='配樂未能播放，請點擊播放音樂重試。';}}
 toggle.addEventListener('click',()=>{enabled=!enabled;if(enabled)void start(false);else{++token;ramp(0,600,()=>audio.pause());show();}});
 choice.addEventListener('change',()=>{bag=[];if(enabled){++token;ramp(0,450,()=>void start(true));}else{current=null;audio.removeAttribute('src');show();}save();});
 slider.addEventListener('input',()=>{show();if(enabled&&!blocked())ramp(volume(),150);save();});
 audio.addEventListener('ended',()=>{if(enabled){if(choice.value==='random')void start(true);else{audio.currentTime=0;void start(false);}}});
 window.lakeMusicState=state=>{factor=state.sleepFactor;const changed=sitePaused!==state.paused;sitePaused=state.paused;if(changed){if(sitePaused){++token;clearTimeout(frame);audio.pause();show();}else if(enabled)void start(false);}else if(enabled&&!blocked()&&!audio.paused&&!frame)audio.volume=volume();};
 // Sleep fades are updated independently from the track's short entrance ramp.
 setInterval(()=>{if(enabled&&!blocked()&&!audio.paused&&factor<1)audio.volume=volume();},250);
 window.addEventListener('pagehide',()=>{++token;clearTimeout(frame);audio.pause();});
 function save(){try{localStorage.setItem('mapleLake.music.v1',JSON.stringify({choice:choice.value,volume:slider.value}));}catch{}}
 try{const saved=JSON.parse(localStorage.getItem('mapleLake.music.v1'));if(saved){if(['random',...tracks.map(t=>t.id)].includes(saved.choice))choice.value=saved.choice;if(Number.isFinite(Number(saved.volume)))slider.value=Math.max(0,Math.min(1,Number(saved.volume)));}}catch{}
 show();
})();
