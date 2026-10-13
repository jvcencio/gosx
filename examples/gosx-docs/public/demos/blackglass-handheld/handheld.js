import init, { GameBoy, GameBoyMode, PadKey, StateManager, SaveStateFormat, StateFormat, FromGbOptions } from "./vendor/boytacean-0.13.2/boytacean.js";

const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d", { alpha:false });
const status = document.querySelector("[data-status]"), sound = document.querySelector("[data-sound]");
const speedControl = document.querySelector("[data-speed]"), audioSources = new Set();
const image = ctx.createImageData(160,144), pressed = new Set(), pendingReleases = new Set();
const keyboard = { ArrowUp:"Up",ArrowDown:"Down",ArrowLeft:"Left",ArrowRight:"Right",KeyZ:"A",KeyJ:"A",KeyX:"B",KeyK:"B",Enter:"Start",ShiftLeft:"Select",ShiftRight:"Select" };
let gb = null, cartridge = null, romHash = "", frame = 0, last = 0, elapsed = 0, running = false, saveAt = 0;
let allowedToRun = parent === window, romBytes = null, romName = "";
let audio = null, audioAt = 0, muted = true, activeLoad = 0;
let speed = 3;
const maxROM = 8*1024*1024, frameMS = 1000/59.7275;
canvas.dataset.emulationSpeed = String(speed);
canvas.dataset.playing = "false";
function note(text) { status.textContent = text; }
function stopAudio() {
  for (const source of audioSources) { try { source.stop(); } catch (_) {} }
  audioSources.clear();audioAt=0;
}
function release() {
  for (const key of pressed) if (gb) gb.key_lift(PadKey[key]);
  pressed.clear();
  pendingReleases.clear();
  for (const button of document.querySelectorAll("[data-key]")) button.dataset.pressed = "false";
}
function key(name, down) {
  if (!gb || !running || !(name in PadKey)) return;
  if (down) { pendingReleases.delete(name); pressed.add(name); gb.key_press(PadKey[name]); }
  else if (pressed.has(name)) pendingReleases.add(name);
  for (const button of document.querySelectorAll('[data-key="'+name+'"]')) button.dataset.pressed = String(down);
}
function save() {
  if (!gb || !romHash) return;
  const ram = gb.ram_data_eager();
  if (!ram.length) return;
  try {
    let binary="";for(let i=0;i<ram.length;i+=32768)binary+=String.fromCharCode(...ram.subarray(i,i+32768));
    localStorage.setItem("gosx.blackglass.cartridge."+romHash,btoa(binary));
  }
  catch (_) { note("Autosave is unavailable here. Export save keeps a copy."); }
}
const checkpointPrefix="gosx.blackglass.pocket-state.v1.",maxCheckpoint=2*1024*1024;
function encode(data) {
  let binary="";for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
  return btoa(binary);
}
function checkpoint() {
  if(!gb||!romHash)return false;
  try {
    const data=StateManager.save_wa(gb,SaveStateFormat.Bosc,FromGbOptions.new(true,StateFormat.Full,"GoSX Pocket","1"));
    if(!data.length||data.length>maxCheckpoint)throw new Error("Checkpoint too large.");
    localStorage.setItem(checkpointPrefix+romHash,JSON.stringify({version:1,core:"boytacean-0.13.2",romHash,speed,savedAt:Date.now(),data:encode(data)}));
    canvas.dataset.checkpoint="saved";
    note(romName+" · pocket checkpoint saved on this device");
    parent.postMessage({type:"blackglass-handheld-saved",ok:true},location.origin);
    return true;
  } catch(_) {
    canvas.dataset.checkpoint="unavailable";
    note("Pocket autosave is unavailable. This session still resumes; Export save keeps your battery save.");
    parent.postMessage({type:"blackglass-handheld-saved",ok:false},location.origin);
    return false;
  }
}
function restoreCheckpoint() {
  const stored=localStorage.getItem(checkpointPrefix+romHash);
  if(!stored)return false;
  if(stored.length>maxCheckpoint*4/3+1024)throw new Error("Checkpoint too large.");
  const entry=JSON.parse(stored);
  if(entry.version!==1||entry.core!=="boytacean-0.13.2"||entry.romHash!==romHash||typeof entry.data!=="string")throw new Error("Incompatible checkpoint.");
  const data=Uint8Array.from(atob(entry.data),c=>c.charCodeAt(0));
  if(!data.length||data.length>maxCheckpoint||StateManager.format_wa(data)!==SaveStateFormat.Bosc)throw new Error("Invalid checkpoint.");
  StateManager.validate_wa(data);StateManager.load_wa(data,gb,SaveStateFormat.Bosc);
  speed=entry.speed===1?1:3;speedControl.value=String(speed);canvas.dataset.emulationSpeed=String(speed);
  canvas.dataset.checkpoint="restored";
  return true;
}
function insert(bytes,mode) {
  if(cartridge)cartridge.free();if(gb)gb.free();
  gb=new GameBoy(mode);gb.load_unsafe(true);cartridge=gb.load_rom_wa(bytes);
  if(mode===GameBoyMode.Dmg)gb.load_boot_state();
}
function pixels() {
  const data = gb.frame_buffer_eager();
  if (data.length === image.data.length) image.data.set(data);
  else if (data.length === 160*144*3) {
    for (let i=0,j=0;i<data.length;i+=3,j+=4) { image.data[j]=data[i];image.data[j+1]=data[i+1];image.data[j+2]=data[i+2];image.data[j+3]=255; }
  } else throw new Error("Unexpected cartridge screen format.");
  ctx.putImageData(image,0,0);
  canvas.dataset.frame = String(gb.ppu_frame());
}
function samples() {
  const data = gb.audio_buffer_eager(true);
  if (!audio || muted || !data.length || audio.state !== "running") return;
  const channels = gb.audio_channels(), rate = gb.audio_sampling_rate();
  const count = Math.floor(data.length/channels);
  if (!count) return;
  const buffer = audio.createBuffer(channels,count,rate);
  for (let ch=0;ch<channels;ch++) { const dest=buffer.getChannelData(ch);for(let i=0;i<count;i++)dest[i]=data[i*channels+ch]/32768; }
  if (audioAt<audio.currentTime || audioAt>audio.currentTime+.18) audioAt=audio.currentTime+.025;
  const source=audio.createBufferSource();source.buffer=buffer;source.playbackRate.value=speed;
  source.connect(audio.destination);audioSources.add(source);source.onended=()=>audioSources.delete(source);
  source.start(audioAt);audioAt+=buffer.duration/speed;
}
function tick(now) {
  frame = 0;
  if (!running || document.hidden || !gb) { last=0;return; }
  try {
    elapsed += (last ? Math.min(now-last,50) : frameMS)*speed; last=now;
    let steps=0;
    while (elapsed>=frameMS && steps<3*speed) {
      gb.next_frame();elapsed-=frameMS;steps++;
      // A tap between RAF callbacks must reach at least one emulated frame.
      for(const name of pendingReleases){gb.key_lift(PadKey[name]);pressed.delete(name);}
      pendingReleases.clear();
    }
    if (steps) { pixels();samples(); }
    if (now-saveAt>5000) { save();saveAt=now; }
    frame=requestAnimationFrame(tick);
  } catch (error) { play(false);note("Cartridge stopped: "+error.message); }
}
function play(value) {
  running=!!(value&&allowedToRun&&gb);release();last=0;elapsed=0;stopAudio();
  if(frame)cancelAnimationFrame(frame);frame=0;
  if(running && gb && !document.hidden)frame=requestAnimationFrame(tick);
  if(!running){save();checkpoint();if(audio)audio.suspend().catch(()=>{});}else if(audio&&!muted)audio.resume().catch(()=>{});
  canvas.dataset.playing=String(running);
}
async function load(bytes, name, importedRAM = null, expectedHash = "") {
  const generation=++activeLoad;
  let headerChecksum=0;for(let i=0x134;i<0x14d;i++)headerChecksum=(headerChecksum-(bytes[i]||0)-1)&255;
  if (bytes.length<32768 || bytes.length>maxROM || bytes.length%16384 || headerChecksum!==bytes[0x14d] || !GameBoy.verify_rom(bytes)) throw new Error("Choose a valid .gb or .gbc cartridge, up to 8 MB.");
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  if(generation!==activeLoad)return;
  const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
  if(expectedHash && hash!==expectedHash)throw new Error("Deployment cartridge changed. Reload the handheld.");
  play(false);
  romHash=hash;
  romBytes=bytes;romName=name;
  const mode=(bytes[0x143]&0x80)?GameBoyMode.Cgb:GameBoyMode.Dmg;
  insert(bytes,mode);
  let ram=importedRAM,restored=false,restoreFailed=false;
  try {
    const stored=importedRAM ? null : localStorage.getItem("gosx.blackglass.cartridge."+romHash);
    ram=importedRAM || (stored ? Uint8Array.from(atob(stored),c=>c.charCodeAt(0)) : null);
    if(ram && ram.length===gb.ram_data_eager().length)gb.set_ram_data(ram);
  } catch (_) {}
  if(importedRAM) {
    gb.set_ram_data(importedRAM);
    try {localStorage.removeItem(checkpointPrefix+romHash);}catch(_) {}
  } else {
    try {restored=restoreCheckpoint();} catch(_) {
      restoreFailed=true;insert(bytes,mode);if(ram && ram.length===gb.ram_data_eager().length)gb.set_ram_data(ram);
      canvas.dataset.checkpoint="invalid";
    }
  }
  document.body.dataset.cartridge=name;
  document.querySelector("[data-screen-prompt]").hidden=true;
  for(const control of document.querySelectorAll("[data-key], [data-save], [data-import-save], [data-sound]"))control.disabled=false;
  note(name+(restored?" · pocket checkpoint restored":restoreFailed?" · checkpoint unavailable; battery save loaded":" · saves stay on this device"));
  document.querySelector("[data-hint]").textContent="Put away to pause and autosave your exact place. Pick up to continue. Arrows · Z/X · Enter · Shift";
  pixels();
  play(allowedToRun);if(allowedToRun)canvas.focus({preventScroll:true});
}
await init();
note("Load your Pokémon Yellow .gb cartridge to switch on.");
speedControl.addEventListener("change",()=>{
  speed=speedControl.value==="1"?1:3;speedControl.value=String(speed);
  canvas.dataset.emulationSpeed=String(speed);last=0;elapsed=0;stopAudio();
});
document.querySelector("[data-rom]").addEventListener("change",async event=>{
  const file=event.target.files[0];if(!file)return;
  try { if(file.size>maxROM)throw new Error("This handheld accepts cartridges up to 8 MB.");await load(new Uint8Array(await file.arrayBuffer()),file.name); }
  catch(error){note(error.message);}finally{event.target.value="";}
});
document.querySelector("[data-import-save]").addEventListener("change",async event=>{
  const file=event.target.files[0];if(!file||!gb)return;
  try{if(file.size!==gb.ram_data_eager().length)throw new Error("That save has a different cartridge RAM size.");const ram=new Uint8Array(await file.arrayBuffer());await load(romBytes,romName,ram);save();note("Save imported. Cartridge restarted from your battery save.");}
  catch(error){note(error.message);}finally{event.target.value="";}
});
document.querySelector("[data-save]").addEventListener("click",()=>{
  if(!gb)return;const data=gb.ram_data_eager();
  if(!data.length){note("This cartridge does not have battery-save memory.");return;}
  const url=URL.createObjectURL(new Blob([data],{type:"application/octet-stream"}));
  const link=document.createElement("a");link.href=url;link.download=(document.body.dataset.cartridge||"blackglass").replace(/\.(gb|gbc)$/i,"")+".sav";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
sound.addEventListener("click",async()=>{
  try{if(!audio)audio=new AudioContext();muted=!muted;stopAudio();if(!muted&&running)await audio.resume();else await audio.suspend();sound.textContent=muted?"Sound off":"Sound on";sound.setAttribute("aria-pressed",String(!muted));}
  catch(_){note("Sound is unavailable. The cartridge can still play.");}
});
for(const button of document.querySelectorAll("[data-key]")){
  button.addEventListener("pointerdown",event=>{event.preventDefault();button.setPointerCapture(event.pointerId);key(button.dataset.key,true);});
  for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,()=>key(button.dataset.key,false));
  button.addEventListener("keydown",event=>{if(event.code==="Space"||event.code==="Enter"){event.preventDefault();key(button.dataset.key,true);}});
  button.addEventListener("keyup",event=>{if(event.code==="Space"||event.code==="Enter"){event.preventDefault();key(button.dataset.key,false);}});
}
window.addEventListener("keydown",event=>{
  if(event.key==="Escape"){event.preventDefault();parent.postMessage({type:"blackglass-handheld-close"},location.origin);return;}
  if(event.target.tagName==="BUTTON"||event.target.tagName==="INPUT"||event.target.tagName==="SELECT")return;
  const name=keyboard[event.code];if(name){event.preventDefault();key(name,true);}
});
window.addEventListener("keyup",event=>{const name=keyboard[event.code];if(name){event.preventDefault();key(name,false);}});
window.addEventListener("blur",release);
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="blackglass-handheld"){allowedToRun=event.data.action==="resume";play(allowedToRun);}});
document.addEventListener("visibilitychange",()=>{if(document.hidden){release();save();checkpoint();stopAudio();if(audio)audio.suspend().catch(()=>{});if(frame)cancelAnimationFrame(frame);frame=0;last=0;elapsed=0;}else if(running&&gb){last=0;if(audio&&!muted)audio.resume().catch(()=>{});frame=requestAnimationFrame(tick);}});
window.addEventListener("pagehide",event=>{allowedToRun=false;play(false);if(!event.persisted){if(cartridge)cartridge.free();if(gb)gb.free();gb=null;}});
parent.postMessage({type:"blackglass-handheld-ready"},location.origin);
// A deployment may supply a cartridge without adding its bytes to Git. The
// manifest is fetched only inside the opened pocket, and never displaces a
// cartridge the player selected while the download was in flight.
const defaultGeneration=activeLoad;
try{
  const signal=AbortSignal.timeout(10000);
  const response=await fetch("/api/blackglass-cartridge",{cache:"no-store",signal});
  if(response.ok){
    const config=await response.json();
    if(config.available && activeLoad===defaultGeneration && /^\/api\/blackglass-cartridge\/rom\?sha256=[a-f0-9]{64}$/.test(config.url) && /^[a-f0-9]{64}$/.test(config.sha256) && config.bytes<=maxROM){
      const cartridgeResponse=await fetch(config.url,{signal});
      if(!cartridgeResponse.ok)throw new Error("The deployment cartridge is unavailable. Load a local cartridge.");
      const bytes=new Uint8Array(await cartridgeResponse.arrayBuffer());
      if(activeLoad===defaultGeneration)await load(bytes,config.name,null,config.sha256);
    }
  }
}catch(error){if(activeLoad===defaultGeneration)note("Load a local cartridge. "+error.message);}
