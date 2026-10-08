'use strict';
// A quiet, layered soundscape. All randomness is generated locally.
class LakeSoundscape {
  constructor(context) {
    this.ctx = context;
    this.output = context.createGain();
    this.output.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 15;
    limiter.ratio.value = 3;
    limiter.attack.value = .018;
    limiter.release.value = .5;
    this.monitor=context.createAnalyser();this.monitor.fftSize=512;this.monitorData=new Float32Array(512);
    this.output.connect(limiter).connect(this.monitor).connect(context.destination);
    this.room = context.createConvolver();
    const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 1.6), context.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3) * .2;
    }
    this.room.buffer = impulse;
    const wet = context.createGain(); wet.gain.value = .13;
    this.room.connect(wet).connect(this.output);
    // Thunder has its own longer, darker reverb, leaving the other sounds clear.
    this.thunderRoom = context.createConvolver();
    const thunderImpulse = context.createBuffer(2, Math.floor(context.sampleRate * 4.6), context.sampleRate);
    for (let ch=0; ch<2; ch++) {
      const data=thunderImpulse.getChannelData(ch);let smooth=0;
      for(let i=0;i<data.length;i++) {
        smooth=smooth*.72+(Math.random()*2-1)*.28;
        const seconds=i/context.sampleRate;
        data[i]=seconds<.035?0:smooth*Math.exp(-seconds/1.1);
      }
      for(const delay of [.09,.19,.34,.58]) {
        const start=Math.floor((delay+ch*.012)*context.sampleRate);
        for(let i=0;i<context.sampleRate*.025;i++)data[start+i]+=(Math.random()*2-1)*.3*Math.exp(-delay*2)*(1-i/(context.sampleRate*.025));
      }
    }
    this.thunderRoom.buffer=thunderImpulse;
    const thunderWet=context.createGain();thunderWet.gain.value=.42;
    const thunderTone=context.createBiquadFilter();thunderTone.type='lowpass';thunderTone.frequency.value=2800;
    this.thunderRoom.connect(thunderTone).connect(thunderWet).connect(this.output);
    this.buffers = {};
    this.beds = [
      this.bed('pink', 'lowpass', 3200, -.35),
      this.bed('pink', 'bandpass', 6200, .5),
      this.bed('brown', 'lowpass', 520, -.55),
      this.bed('pink', 'bandpass', 900, .45),
      this.bed('pink', 'bandpass', 2400, .15),
      this.bed('white', 'bandpass', 2600, -.3),
      this.bed('pink', 'bandpass', 1700, .3),
    ];
    this.beds[5].filter.Q.value=2.2;
    this.beds[6].filter.Q.value=5;
    this.howlPitch=1700;this.nextHowl=0;
    this.birdBus=context.createGain();this.birdBus.gain.value=.65;this.birdBus.connect(this.output);
    this.crowPanners=new Set();this.crowVoices=new Map();this.birdSpecies={};this.nextSpeciesBird={};for(const type of ['sparrow','dove','crow']){const bus=context.createGain();bus.gain.value=.65;bus.connect(this.birdBus);this.birdSpecies[type]=bus;this.nextSpeciesBird[type]=0;}
    this.insectBus=context.createGain();this.insectBus.gain.value=.6;this.insectBus.connect(this.output);
    this.insectSpecies={};this.nextSpeciesInsect={};for(const type of ['recorded','cricket']){const bus=context.createGain();bus.connect(this.insectBus);this.insectSpecies[type]=bus;this.nextSpeciesInsect[type]=0;}
    this.nextDrop = this.nextRustle = this.nextBird = this.nextInsect = 0;
    this.cricketBus=context.createGain();this.cricketBus.gain.value=0;this.cricketBus.connect(this.output);this.nextCricket=0;
    this.nextFineRain=0;this.nextMidRain=0;this.nextRainDetail=0;this.nextPuddle=0;this.nextCanopy=0;this.nextRainSwash=0;
    this.birdsEnd = this.insectsEnd = 0;
    this.lastUpdate = -1;
    this.active = false;
  }
  async loadDoveRecording(){
    if(this.doveRecording)return;if(this.doveLoading)return this.doveLoading;
    this.doveLoading=(async()=>{const response=await fetch('assets/dove.mp3');if(!response.ok)throw new Error('Dove recording could not be loaded');
      this.doveRecording=await this.ctx.decodeAudioData(await response.arrayBuffer());
      const data=this.doveRecording.getChannelData(0);let energy=0;for(let i=0;i<data.length;i+=8)energy+=data[i]*data[i];
      this.doveNormalization=Math.min(3,.09/Math.max(.01,Math.sqrt(energy/Math.ceil(data.length/8))));
    })();try{await this.doveLoading}catch(error){this.doveLoading=null;throw error}
  }
  birdPlaybackRate(type){
    this.lastBirdPitch??={};
    const previous=this.lastBirdPitch[type]??999;
    const choices=[-180,-90,0,90,180].filter(value=>Math.abs(value-previous)>=90);
    const cents=choices[Math.floor(Math.random()*choices.length)]+this.random(-12,12);
    this.lastBirdPitch[type]=cents;return Math.pow(2,cents/1200);
  }

  recordedDove(at,pan){
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.doveRecording;
    source.playbackRate.value=this.birdPlaybackRate('dove');
    const duration=source.buffer.duration/source.playbackRate.value,level=this.doveNormalization;
    gain.gain.setValueAtTime(.00001,at);gain.gain.linearRampToValueAtTime(level,at+.25);gain.gain.setValueAtTime(level,at+duration-.35);gain.gain.linearRampToValueAtTime(.00001,at+duration);
    source.connect(gain);const panner=this.route(gain,pan,'bird:dove');source.start(at);source.stop(at+duration);
    source.onended=()=>{source.disconnect();gain.disconnect();this.crowPanners.delete(panner);panner.disconnect()};
  }
  async loadCrowRecording(){
    if(this.crowRecording)return;if(this.crowLoading)return this.crowLoading;
    this.crowLoading=(async()=>{const response=await fetch('assets/crow.mp3');if(!response.ok)throw new Error('Crow recording could not be loaded');
      this.crowRecording=await this.ctx.decodeAudioData(await response.arrayBuffer());
      const data=this.crowRecording.getChannelData(0);let energy=0;for(let i=0;i<data.length;i+=8)energy+=data[i]*data[i];
      this.crowNormalization=Math.min(3,.09/Math.max(.01,Math.sqrt(energy/Math.ceil(data.length/8))));
    })();try{await this.crowLoading}catch(error){this.crowLoading=null;throw error}
  }
  recordedCrow(at,pan){
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=this.crowRecording;source.loop=true;
    const voice=this.crowVoices.get(this.callCrowId);
    source.playbackRate.value=voice?Math.pow(2,(voice.pitch+this.random(-55,55))/1200):this.birdPlaybackRate('crow');
    const duration=source.buffer.duration/source.playbackRate.value,level=this.crowNormalization*(voice?.level??1);
    gain.gain.setValueAtTime(.00001,at);gain.gain.linearRampToValueAtTime(level,at+.25);
    const distanceGain=this.ctx.createGain();distanceGain.gain.value=1;
    const distanceFilter=this.ctx.createBiquadFilter();distanceFilter.type='lowpass';distanceFilter.frequency.value=8500;source.connect(gain).connect(distanceFilter).connect(distanceGain);const panner=this.route(distanceGain,pan,'bird:crow');panner._distanceFilter=distanceFilter;panner._distanceGain=distanceGain;panner._crowSource=source;source.start(at);
    source.onended=()=>{source.disconnect();gain.disconnect();distanceFilter.disconnect();distanceGain.disconnect();this.crowPanners.delete(panner);panner.disconnect()};
  }
  async loadRainRecording() {
    if(this.rainRecording)return;
    if(this.rainLoading)return this.rainLoading;
    this.rainLoading=(async()=>{
      const response=await fetch('assets/rain.mp3');
      if(!response.ok)throw new Error('Rain recording could not be loaded');
      const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
      let energy=0;const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i+=8)energy+=data[i]*data[i];
      const rms=Math.sqrt(energy/Math.ceil(data.length/8));
      this.rainNormalization=Math.min(2,.15/Math.max(.01,rms));
      const source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      const gain=this.ctx.createGain();gain.gain.value=0;
      source.connect(gain).connect(this.output);source.start();
      this.rainRecording={source,gain};
    })();
    try{await this.rainLoading}catch(error){this.rainLoading=null;throw error}
  }
  async loadInsectRecording(){
    if(this.insectRecording)return;if(this.insectLoading)return this.insectLoading;
    this.insectLoading=(async()=>{
      const response=await fetch('assets/crickets.mp3');if(!response.ok)throw Error('蟋蟀錄音載入失敗');
      const original=await this.ctx.decodeAudioData(await response.arrayBuffer());
      const fade=Math.min(Math.floor(original.sampleRate),Math.floor(original.length/8));
      const loop=this.ctx.createBuffer(original.numberOfChannels,original.length-fade,original.sampleRate);
      let energy=0;
      for(let ch=0;ch<original.numberOfChannels;ch++){
        const input=original.getChannelData(ch),data=loop.getChannelData(ch);data.set(input.subarray(0,data.length));
        for(let i=0;i<fade;i++){const f=i/fade;data[i]=input[original.length-fade+i]*(1-f)+input[i]*f}
        if(ch===0)for(let i=0;i<data.length;i+=8)energy+=data[i]*data[i];
      }
      const rms=Math.sqrt(energy/Math.ceil(loop.length/8));this.insectNormalization=Math.min(4,.2/Math.max(.01,rms));
      const source=this.ctx.createBufferSource();source.buffer=loop;source.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=550;
      const gain=this.ctx.createGain();gain.gain.value=0;const panner=this.ctx.createStereoPanner();
      source.connect(filter).connect(gain).connect(panner).connect(this.output);source.start();
      this.insectRecording={source,gain,panner};
    })();
    try{await this.insectLoading}catch(error){this.insectLoading=null;throw error}
  }
  random(a, b) { return a + Math.random() * (b - a); }
  buffer(color) {
    if (this.buffers[color]) return this.buffers[color];
    const b = this.ctx.createBuffer(2, Math.floor(this.ctx.sampleRate * 19.7), this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = b.getChannelData(ch); let brown = 0, p0 = 0, p1 = 0, p2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + .025 * white) / 1.025;
        p0 = .99765 * p0 + white * .099046;
        p1 = .963 * p1 + white * .2965164;
        p2 = .57 * p2 + white * 1.0526913;
        data[i] = color === 'brown' ? brown * 3.5 : color === 'pink' ? (p0 + p1 + p2 + white * .1848) * .16 : white;
      }
      // The seam is gently blended, so the background never clicks.
      const fade = Math.floor(this.ctx.sampleRate * .1);
      for (let i = 0; i < fade; i++) {
        const mix = i / fade;
        data[i] = data[data.length - fade + i] * (1 - mix) + data[i] * mix;
      }
    }
    return (this.buffers[color] = b);
  }
  route(gain, pan = 0, room = true) {
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1,Math.min(1,pan));
    if(room==='bird:crow'){this.crowPanners.add(panner);panner._crow=true;panner._crowId=this.callCrowId;}
    gain.connect(panner).connect(typeof room==='string'&&room.startsWith('bird:')?this.birdSpecies[room.slice(5)]:room==='bird'?this.birdBus:typeof room==='string'&&room.startsWith('insect:')?this.insectSpecies[room.slice(7)]:room==='insect'?this.insectBus:room==='cricket'?this.cricketBus:this.output);
    if (room && !(typeof room==='string'&&(room.startsWith('bird:')||room.startsWith('insect:'))) && room!=='bird' && room!=='insect' && room!=='cricket') panner.connect(room==='thunder'?this.thunderRoom:this.room);
    return panner;
  }
  bed(color, type, frequency, pan) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer(color); source.loop = true;
    source.playbackRate.value = this.random(.83, 1.14);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = .45;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    source.connect(filter).connect(gain);
    const panner = this.route(gain, pan, false);
    source.start(0, this.random(0, 14));
    return { source, filter, gain, panner };
  }
  burst({color='pink',type='bandpass',frequency=2000,q=.6,level=.04,duration=.1,attack=.007,pan=0,at=this.ctx.currentTime,rate=1,reverb=true}) {
    const source = this.ctx.createBufferSource(); source.buffer = this.buffer(color); source.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(.00001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.00002, level), at + attack);
    gain.gain.exponentialRampToValueAtTime(.00001, at + duration);
    source.connect(filter).connect(gain);
    const panner = this.route(gain, pan, reverb);
    source.start(at, this.random(0, 13)); source.stop(at + duration + .05);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.crowPanners.delete(panner);panner.disconnect(); };
  }
  waterDrop(rain,options={}) {
    const now=options.at??this.ctx.currentTime+.008,pan=options.pan??this.random(-.95,.95);
    const depth=options.depth??this.random(.15,1),large=options.large??Math.random()<.35;
    const length=large?this.random(.055,.095):this.random(.025,.055);
    const base=large?this.random(380,700):this.random(900,1600);
    const level=this.random(.045,.09)*(.45+rain*.55)*(.6+depth*.4)*(options.level??1);
    const oscillator=this.ctx.createOscillator(),gain=this.ctx.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(base,now);
    // Stable resonant pitch, with no chirped sweep.

    gain.gain.setValueAtTime(.00001,now);
    gain.gain.exponentialRampToValueAtTime(level,now+.003);
    gain.gain.exponentialRampToValueAtTime(.00001,now+length);
    oscillator.connect(gain);const panner=this.route(gain,pan,depth<.4);
    oscillator.start(now);oscillator.stop(now+length+.02);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();this.crowPanners.delete(panner);panner.disconnect()};
    // Every impact has a low water body and a separate bright splash, without pitch bends.
    this.burst({color:'brown',type:'bandpass',frequency:large?this.random(180,340):this.random(300,520),q:1.1,level:level*(large?2.2:1.2),duration:large?.13:.065,attack:.003,pan,at:now,reverb:false});
    this.burst({color:'white',type:'bandpass',frequency:this.random(3800,7200),q:.7,level:level*(large?.8:1.25),duration:this.random(.025,.065),attack:.002,pan,at:now,reverb:false});
    if(large&&Math.random()<.5)this.burst({type:'bandpass',frequency:this.random(800,1800),q:3,level:level*.28,duration:.08,attack:.004,pan,at:now+this.random(.055,.1)});
    if(this.onDrop&&options.visual!==false)this.onDrop((pan+1)/2,depth);
  }
  puddleSplash(rain) {
    const at=this.ctx.currentTime+.008,pan=this.random(-.8,.8);
    // Close water impacts: a hollow body, broad splash, then smaller droplets.
    this.waterDrop(rain,{at,pan,large:true,depth:.85,level:1.7});
    this.burst({color:'pink',type:'bandpass',frequency:this.random(450,800),q:2,level:rain*.19,duration:.2,attack:.009,pan,at,reverb:false});
    this.burst({color:'white',type:'bandpass',frequency:this.random(1600,3000),q:.65,level:rain*.13,duration:.14,attack:.008,pan,at:at+.015,reverb:false});
    for(let i=0;i<2;i++)this.waterDrop(rain,{at:at+.07+i*.045,pan:pan+this.random(-.08,.08),large:false,depth:.7,level:.4});
  }
  canopyDrips(rain) {
    const at=this.ctx.currentTime+.01,pan=Math.random()<.5?this.random(-.9,-.5):this.random(.5,.9);
    let offset=0;
    for(let i=0;i<3+Math.floor(Math.random()*3);i++){
      this.waterDrop(rain,{at:at+offset,pan,large:i===0,depth:.25,level:this.random(.65,1)});
      this.burst({color:'pink',type:'bandpass',frequency:this.random(850,1700),q:2.6,level:rain*this.random(.05,.09),duration:.12,attack:.004,pan,at:at+offset});
      offset+=this.random(.06,.2);
    }
  }
  rainDetails(rain) {
    const now=this.ctx.currentTime+.01;
    const leaf=Math.random()<.48,pan=this.random(-.95,.95);
    const count=1+Math.floor(this.random(0,4));
    for(let i=0;i<count;i++) {
      this.burst({color:leaf?'pink':'white',type:'bandpass',frequency:leaf?this.random(900,2600):this.random(2800,6500),q:leaf?1.8:.65,level:rain*this.random(.04,.095),duration:leaf?this.random(.04,.13):this.random(.025,.07),attack:.003,pan:Math.max(-1,Math.min(1,pan+this.random(-.12,.12))),at:now+i*this.random(.018,.055)});
    }
  }
  birdPhrase(at=this.ctx.currentTime, pan=this.random(-.85,.85),type='sparrow') {
    if (!this.active) return;
    if(type==='mixed')type=['sparrow','dove','crow'][Math.floor(Math.random()*3)];
    if(type==='dove'&&this.doveRecording){this.recordedDove(at,pan);return;}
    if(type==='crow'&&this.crowRecording){this.recordedCrow(at,pan);return;}
    if(type==='dove'||type==='crow'){this.namedBirdPhrase(at,pan,type);return;}
    const base = this.random(1600, 2850), count = Math.floor(this.random(2, 6));
    const distance = this.random(.8, 1);
    for (let i = 0; i < count; i++) {
      const start = at + i * this.random(.15, .24), length = this.random(.07, .16);
      const osc = this.ctx.createOscillator(), mod = this.ctx.createOscillator(), depth = this.ctx.createGain(), gain = this.ctx.createGain();
      const peak = base * this.random(1.1, 1.55);
      osc.type = 'sine'; osc.frequency.setValueAtTime(base * this.random(.9, 1.08), start);
      osc.frequency.exponentialRampToValueAtTime(peak, start + length * .38);
      osc.frequency.exponentialRampToValueAtTime(base * this.random(.7, 1.05), start + length);
      mod.frequency.value = this.random(25, 48); depth.gain.value = this.random(25, 90);
      mod.connect(depth).connect(osc.frequency);
      gain.gain.setValueAtTime(.00001, start);
      gain.gain.exponentialRampToValueAtTime(.11 * distance, start + .012);
      gain.gain.exponentialRampToValueAtTime(.00001, start + length);
      osc.connect(gain); const panner = this.route(gain, pan,'bird:sparrow');
      osc.start(start); mod.start(start); osc.stop(start + length + .02); mod.stop(start + length + .02);
      osc.onended = () => { osc.disconnect(); mod.disconnect(); depth.disconnect(); gain.disconnect(); this.crowPanners.delete(panner);panner.disconnect(); };
    }
  }
  namedBirdPhrase(at,pan,type) {
    const dove=type==='dove',count=dove?3:Math.floor(this.random(2,5));
    const base=dove?this.random(390,510):this.random(420,650);
    let cursor=at;
    for(let i=0;i<count;i++){
      const start=cursor,length=dove?[.2,.36,.25][i]*this.random(.9,1.1):this.random(.22,.42);
      cursor+=length+(dove?.11:this.random(.12,.3));
      const osc=this.ctx.createOscillator(),mod=this.ctx.createOscillator(),depth=this.ctx.createGain(),gain=this.ctx.createGain(),filter=this.ctx.createBiquadFilter();
      osc.type=dove?'sine':'sawtooth';osc.frequency.setValueAtTime(base*(dove?[1,.87,1][i]:this.random(.85,1.1)),start);
      osc.frequency.linearRampToValueAtTime(base*(dove?.92:.68),start+length);
      mod.frequency.value=dove?this.random(8,12):this.random(55,85);depth.gain.value=dove?5:this.random(55,95);mod.connect(depth).connect(osc.frequency);
      filter.type='lowpass';filter.frequency.value=dove?1100:this.random(1800,2700);filter.Q.value=dove?.5:1.4;
      gain.gain.setValueAtTime(.00001,start);gain.gain.exponentialRampToValueAtTime(dove?.15:.085,start+(dove?.055:.025));gain.gain.exponentialRampToValueAtTime(.00001,start+length);
      osc.connect(filter).connect(gain);
      const panner=this.route(gain,pan,'bird:'+type);osc.start(start);mod.start(start);osc.stop(start+length+.02);mod.stop(start+length+.02);
      osc.onended=()=>{osc.disconnect();mod.disconnect();depth.disconnect();filter.disconnect();gain.disconnect();this.crowPanners.delete(panner);panner.disconnect()};
    }
  }
  insectPhrase(at,pan=0,type='cricket',channel=type) {
    const base=type==='cricket'?this.random(3200,4400):this.random(4300,6300);
    const count=type==='cricket'?3+Math.floor(Math.random()*3):8+Math.floor(Math.random()*7);
    const interval=type==='cricket'?this.random(.075,.105):this.random(.022,.04);
    for(let i=0;i<count;i++){
      const start=at+i*interval,length=type==='cricket'?.043:.025;
      if(type==='cricket'){
        const carrier=this.ctx.createOscillator(),mod=this.ctx.createOscillator(),depth=this.ctx.createGain(),gain=this.ctx.createGain();
        carrier.type='sine';carrier.frequency.value=base;mod.frequency.value=this.random(100,160);depth.gain.value=35;
        mod.connect(depth).connect(carrier.frequency);
        gain.gain.setValueAtTime(.00001,start);gain.gain.exponentialRampToValueAtTime(.09,start+.004);gain.gain.exponentialRampToValueAtTime(.00001,start+length);
        carrier.connect(gain);const panner=this.route(gain,pan,'insect:'+channel);
        carrier.start(start);mod.start(start);carrier.stop(start+length+.01);mod.stop(start+length+.01);
        carrier.onended=()=>{carrier.disconnect();mod.disconnect();depth.disconnect();gain.disconnect();this.crowPanners.delete(panner);panner.disconnect()};
      }
      this.burst({color:type==='cricket'?'pink':'white',frequency:base,q:type==='cricket'?5:1.8,level:type==='cricket'?.06:.26,duration:length,attack:.003,pan,reverb:'insect:'+channel,at:start});
    }
  }
  thunder(now=this.ctx.currentTime+.1, pan=this.random(-.35,.35), strength=1, character='near') {
    if (!this.active) return;
    const near=character==='near';
    const profiles=near?[
      {tone:1.3,edge:1.2,bass:.75,pace:.75},
      {tone:.85,edge:.8,bass:1.15,pace:1.2},
      {tone:1.05,edge:1,bass:.95,pace:1},
    ]:[
      {tone:.65,edge:.65,bass:1.25,pace:1.25},
      {tone:1.25,edge:1.2,bass:.85,pace:.85},
      {tone:.9,edge:.9,bass:1.05,pace:1},
    ];
    this.lastThunderProfile??={};
    const choices=profiles.map((_,i)=>i).filter(i=>i!==this.lastThunderProfile[character]);
    const choice=choices[Math.floor(Math.random()*choices.length)];
    this.lastThunderProfile[character]=choice;const profile=profiles[choice];
    const rise=near?this.random(.09,.18):this.random(.28,.48);
    const stretch=this.random(.8,1.3)*profile.pace;
    const crackLevel=(near?this.random(.25,.34):this.random(.045,.08))*strength*profile.edge;
    const crackLength=near?this.random(.9,1.3):this.random(1.5,2);
    // Each strike has a different distance, spectrum, attack and rolling envelope.
    const roll=({at,duration,peak,cutoff,color,position})=>{
      const source=this.ctx.createBufferSource();source.buffer=this.buffer(color);
      source.playbackRate.value=near?this.random(.85,1.08):this.random(.58,.78);
      const low=this.ctx.createBiquadFilter();low.type='lowpass';low.Q.value=.45;
      low.frequency.setValueAtTime(cutoff*profile.tone,at);
      low.frequency.exponentialRampToValueAtTime(Math.max(90,cutoff*.3),at+duration);
      const high=this.ctx.createBiquadFilter();high.type='highpass';high.frequency.value=28;high.Q.value=.4;
      const gain=this.ctx.createGain();const level=peak*strength*profile.bass;
      gain.gain.setValueAtTime(.00001,at);
      gain.gain.linearRampToValueAtTime(level*this.random(.55,.8),at+rise);
      gain.gain.linearRampToValueAtTime(level,at+rise*2.3);
      const swells=2+Math.floor(Math.random()*4);
      for(let j=0;j<swells;j++){
        const progress=(j+1)/(swells+1);
        const moment=rise*2.3+(duration*.72-rise*2.3)*progress;
        gain.gain.linearRampToValueAtTime(level*this.random(.25,.85)*(1-progress*.65),at+moment);
      }
      gain.gain.exponentialRampToValueAtTime(.00001,at+duration);
      source.connect(low).connect(high).connect(gain);
      const panner=this.route(gain,position,'thunder');
      panner.pan.setValueAtTime(position,at);
      panner.pan.linearRampToValueAtTime(Math.max(-.9,Math.min(.9,position+this.random(-.1,.1))),at+duration);
      source.start(at,this.random(0,10));source.stop(at+duration+.1);
      source.onended=()=>{source.disconnect();low.disconnect();high.disconnect();gain.disconnect();this.crowPanners.delete(panner);panner.disconnect()};
    };
    // A broad tearing front lasts into the rumble, rather than a separate click.
    const crack=this.ctx.createBufferSource();crack.buffer=this.buffer(near?(choice===1?'pink':'white'):'pink');
    crack.playbackRate.value=this.random(.8,1.18);
    const crackHigh=this.ctx.createBiquadFilter();crackHigh.type='highpass';crackHigh.frequency.value=(near?this.random(450,900):this.random(180,350))*profile.tone;crackHigh.Q.value=.5;
    const crackLow=this.ctx.createBiquadFilter();crackLow.type='lowpass';crackLow.Q.value=.5;
    crackLow.frequency.setValueAtTime((near?this.random(4200,7200):this.random(1200,2600))*profile.tone,now);crackLow.frequency.exponentialRampToValueAtTime(near?950:450,now+crackLength);
    const crackGain=this.ctx.createGain();
    crackGain.gain.setValueAtTime(.00001,now);
    crackGain.gain.linearRampToValueAtTime(crackLevel,now+(near?.035:.15));
    crackGain.gain.linearRampToValueAtTime(crackLevel*this.random(.4,.8),now+this.random(.17,.23));
    crackGain.gain.linearRampToValueAtTime(crackLevel*this.random(.6,.95),now+this.random(.27,.36));
    crackGain.gain.linearRampToValueAtTime(crackLevel*this.random(.2,.5),now+this.random(.42,.65));
    crackGain.gain.exponentialRampToValueAtTime(.00001,now+crackLength);
    crack.connect(crackHigh).connect(crackLow).connect(crackGain);
    const crackPan=this.route(crackGain,pan,'thunder');
    crack.start(now,this.random(0,12));crack.stop(now+crackLength+.05);
    crack.onended=()=>{crack.disconnect();crackHigh.disconnect();crackLow.disconnect();crackGain.disconnect();crackPan.disconnect()};
    roll({at:now,duration:this.random(6,8.5),peak:near?.95:.65,cutoff:near?this.random(900,1400):this.random(300,500),color:'pink',position:pan});
    roll({at:now+.07,duration:this.random(7,10),peak:near?.85:1.15,cutoff:near?320:180,color:'brown',position:pan});
    for(let i=0,count=2+Math.floor(Math.random()*3);i<count;i++)roll({at:now+.65+i*this.random(.6,1.1),duration:this.random(5,8),peak:this.random(.28,.46),cutoff:this.random(180,550),color:i%2?'pink':'brown',position:Math.max(-1,Math.min(1,pan+this.random(-.12,.12)))});
  }
  birds(seconds=9) { this.birdsEnd=this.ctx.currentTime+seconds; this.nextBird=this.ctx.currentTime;for(const type of Object.keys(this.nextSpeciesBird))this.nextSpeciesBird[type]=this.ctx.currentTime; }
  insects(seconds=12) { this.insectsEnd=this.ctx.currentTime+seconds; this.nextInsect=this.ctx.currentTime;for(const type of Object.keys(this.nextSpeciesInsect))this.nextSpeciesInsect[type]=this.ctx.currentTime; }
  update({enabled,volume,rain,wind,motion,motionTime,birds,insects,crowSources=[],birdPan=0,insectPan=0,windPan=0,birdNight=0,naturalBirds=true,birdFrequencies={sparrow:.5,dove:.5,crow:.2},birdVolumes={sparrow:.65,dove:.3,crow:.3},birdCount=5,birdVolume=.65,insectDensity=.6,insectVolume=.6,insectVolumes={recorded:.6,cricket:0}}) {
    const now=this.ctx.currentTime;
    this.active=enabled;
    this.output.gain.cancelScheduledValues(now);
    if(!enabled)this.output.gain.setValueAtTime(0,now);
    else this.output.gain.setTargetAtTime(volume*.8,now,.08);
    for(const panner of this.crowPanners){const bird=crowSources.find(b=>b.id===panner._crowId);if(bird){panner.pan.setTargetAtTime(bird.pan,now,.04);if(!panner._fading)panner._distanceGain.gain.setTargetAtTime(1-(bird.distance??0)*.65,now,.25);if(panner._distanceFilter)panner._distanceFilter.frequency.setTargetAtTime(8500-(bird.distance??0)*5500,now,.25);}if(panner._distanceGain&&!panner._fading&&(!bird||!bird.onScreen)){panner._fading=true;const gain=panner._distanceGain.gain;gain.cancelScheduledValues(now);gain.setValueAtTime(Math.max(.0001,gain.value),now);gain.linearRampToValueAtTime(0,now+3.5);panner._crowSource.stop(now+3.55);}}
    const realInsects=!!this.insectRecording;
    if(this.insectRecording){
      this.insectRecording.gain.gain.setTargetAtTime(realInsects&&insectDensity>0&&(insects||now<this.insectsEnd)?insectVolume*(insectVolumes.recorded??0)*.85*this.insectNormalization*(.5+insectDensity*.5):0,now,.35);
      this.insectRecording.panner.pan.setTargetAtTime(insectPan,now,.25);
    }


    for(const type of Object.keys(this.birdSpecies))this.birdSpecies[type].gain.setTargetAtTime(Math.pow(birdVolumes[type]??0,1.6),now,.05);
    this.birdBus.gain.setTargetAtTime(birdCount>0?Math.pow(birdVolume,1.6)*12:0,now,.12);
    for(const type of Object.keys(this.insectSpecies))this.insectSpecies[type].gain.setTargetAtTime(Math.pow(insectVolumes[type]??0,1.6),now,.05);
    this.insectBus.gain.setTargetAtTime(insectDensity>0?Math.pow(insectVolume,1.6)*8:0,now,.12);
    if(now-this.lastUpdate<.075)return;
    this.lastUpdate=now;

    const swell=.78+.15*Math.sin(now*.31)+.07*Math.sin(now*.91+1.6);
    const flow=Math.min(1.6,Math.max(0,motion));
    const recorded=!!this.rainRecording;
    if(recorded)this.rainRecording.gain.gain.setTargetAtTime(Math.pow(rain,.85)*.6*this.rainNormalization,now,.65);
    const levels=[recorded?0:rain*.065*swell,recorded?0:rain*.014,flow*.29,flow*.035,flow*.018*(.7+.3*Math.sin(motionTime*1.7)),Math.pow(flow,1.15)*.16,Math.pow(flow,1.25)*.28];
    for(let i=0;i<this.beds.length;i++)this.beds[i].gain.gain.setTargetAtTime(levels[i],now,.08);
    this.beds[2].filter.frequency.setTargetAtTime(260+flow*380,now,.4);
    this.beds[3].filter.frequency.setTargetAtTime(700+flow*800+Math.sin(motionTime*.8)*160,now,.5);
    this.beds[2].panner.pan.setTargetAtTime(windPan,now,.2);
    if(now>=this.nextHowl){this.howlPitch=this.random(1300,2600);this.nextHowl=now+this.random(1.2,3.4)}
    const howlPitch=this.howlPitch+flow*420+Math.sin(motionTime*1.1)*150;
    this.beds[5].filter.frequency.setTargetAtTime(howlPitch+700,now,.65);
    this.beds[6].filter.frequency.setTargetAtTime(howlPitch,now,.75);
    this.beds[5].panner.pan.setTargetAtTime(windPan,now,.2);
    this.beds[6].panner.pan.setTargetAtTime(windPan,now,.2);
    for(const i of [3,4])this.beds[i].panner.pan.setTargetAtTime(windPan,now,.2);
    if(!enabled)return;
    if(!recorded&&rain>.02&&now>=this.nextDrop){
      const drops=2+Math.floor(rain*this.random(2,5));
      for(let i=0;i<drops;i++)this.waterDrop(rain);
      this.nextDrop=now+this.random(.025,.085)/(rain+.4);
    }
    if(!recorded&&rain>.02&&now>=this.nextRainDetail){
      this.rainDetails(rain);
      this.nextRainDetail=now+this.random(.045,.15)/(rain+.4);
    }
    if(!recorded&&rain>.02&&now>=this.nextFineRain){
      const count=3+Math.floor(rain*8);
      for(let i=0;i<count;i++)this.burst({color:'white',type:'bandpass',frequency:this.random(4200,9500),q:.6,level:rain*this.random(.014,.035),duration:this.random(.014,.045),attack:.002,pan:this.random(-1,1),at:now+.008+i*this.random(.005,.012),reverb:false});
      this.nextFineRain=now+this.random(.035,.11)/(rain+.4);
    }
    if(!recorded&&rain>.02&&now>=this.nextMidRain){
      for(let i=0;i<2+Math.floor(rain*3);i++)this.burst({color:'pink',type:'bandpass',frequency:this.random(650,2400),q:this.random(1.5,3),level:rain*this.random(.055,.1),duration:this.random(.03,.095),attack:.003,pan:this.random(-.9,.9),at:now+.008+i*this.random(.01,.035),reverb:false});
      this.nextMidRain=now+this.random(.07,.2)/(rain+.4);
    }
    if(!recorded&&rain>.02&&now>=this.nextPuddle){
      this.puddleSplash(rain);this.nextPuddle=now+this.random(.15,.42)/(rain+.4);
    }
    if(!recorded&&rain>.02&&now>=this.nextCanopy){
      this.canopyDrips(rain);this.nextCanopy=now+this.random(.8,2.3)/(rain+.35);
    }
    if(!recorded&&rain>.02&&now>=this.nextRainSwash){
      this.burst({color:'pink',type:'lowpass',frequency:this.random(1100,1900),level:rain*.15,duration:this.random(1.1,2),attack:.3,pan:this.random(-.6,.6)});
      this.nextRainSwash=now+this.random(.5,1.4);
    }
    if(wind>.015&&now>=this.nextRustle){
      this.burst({frequency:this.random(1500,3800),q:.5,level:flow*this.random(.028,.065),duration:this.random(.25,.85),attack:this.random(.025,.12),pan:windPan});
      this.nextRustle=now+this.random(.12,.65)/(flow+.35);
    }
    if(birdCount>0&&(birds||now<this.birdsEnd)){
      const daylight=Math.max(0,Math.min(1,(.8-birdNight)/.35));
      const dawnDusk=Math.exp(-Math.pow((birdNight-.4)/.2,2));
      for(const type of ['sparrow','dove']){
        if((birdVolumes[type]??0)<=0||(birdFrequencies[type]??.5)<=0||now<this.nextSpeciesBird[type])continue;
        const activity=naturalBirds?daylight*(type==='dove'?(.28+.72*dawnDusk):1):1;
        if(activity>.01)this.birdPhrase(now+.01,Math.max(-1,Math.min(1,birdPan+this.random(-.08,.08))),type);
        this.nextSpeciesBird[type]=now+(activity>.01&&type==='dove'&&this.doveRecording?this.doveRecording.duration/.89:0)+this.random(2.2,8)*5/Math.max(1,birdCount)/Math.max(.12,activity)*.5/Math.max(.05,birdFrequencies[type]??.5);
      }
      const ids=new Set(crowSources.map(b=>b.id));for(const id of this.crowVoices.keys())if(!ids.has(id))this.crowVoices.delete(id);
      for(const bird of crowSources){
        if(!this.crowVoices.has(bird.id)){
          const previous=[...this.crowVoices.values()].at(-1);
          this.crowVoices.set(bird.id,{pitch:previous?(previous.pitch<0?this.random(80,150):this.random(-150,-80)):this.random(-150,150),level:this.random(.8,1.15),next:now+this.random(.05,.9)});
        }
        const voice=this.crowVoices.get(bird.id);
        if((birdVolumes.crow??0)<=0||(birdFrequencies.crow??.5)<=0||(naturalBirds&&daylight<=.01)||now<voice.next||Math.abs(bird.pan)>.96)continue;
        this.callCrowId=bird.id;this.birdPhrase(now+.01,bird.pan,'crow');this.callCrowId=null;
        voice.next=this.crowRecording?Infinity:now+1.8+this.random(.5,3.5);
      }
    }

    if(insectDensity>0&&(insects||now<this.insectsEnd))for(const type of ['recorded','cricket']){
      if((type==='recorded'&&realInsects)||(insectVolumes[type]??0)<=0||now<this.nextSpeciesInsect[type])continue;
      this.insectPhrase(now+.01,insectPan,type==='recorded'?'cricket':type,type);
      this.nextSpeciesInsect[type]=now+this.random(.3,1.2)/Math.max(.1,insectDensity);
    }
  }
}
