'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../examples/gosx-docs/public/blackglass-spyglass.js'),'utf8');
class Node {
  constructor(){this.listeners=new Map();this.dataset={};this.textContent='';this.attrs={};}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(f=>f!==fn));}
  dispatchEvent(e){e.target=e.target||this;for(const f of this.listeners.get(e.type)||[])f(e);return true;}
  emit(type,extra={}){this.dispatchEvent({type,...extra});}
  setAttribute(name,value){this.attrs[name]=value;}
  focus(){this.focused=true;}
}
function fixture(){
  const root=new Node(),panel=new Node(),toggle=new Node(),plot=new Node(),close=new Node(),scene=new Node(),canvas=new Node(),chart=new Node();
  const output={};for(const name of ['bearing','name','range'])output[name]=new Node();
  root.dataset={view:'ship',coastChartPlaces:JSON.stringify([{name:'Drift Isle',x:0,z:-100,view:'drift',island:true},{name:'Bell Rock',x:100,z:0,view:'bell',island:true}])};
  root.querySelector=s=>s==='[data-coast-spyglass]'?toggle:s==='.bgb__spyglass'?panel:scene;
  root.querySelectorAll=()=>[chart];
  panel.querySelector=s=>s==='[data-coast-sight-plot]'?plot:s==='[data-coast-spyglass-close]'?close:output[s.slice(18,-1)];
  scene.querySelector=()=>canvas;
  let camera={x:0,z:0,rotationY:0},seq=0,observing=false;
  const factors=[],plots=[],timers=new Map(),window=new Node(),document=new Node();
  scene.__gosxScene3DHandle={getCamera:()=>camera};
  scene.addEventListener('gosx:scene3d:optical-zoom',e=>{factors.push(e.detail.factor);root.emit('gosx:scene3d:optical-zoom-state',{target:scene,detail:e.detail});});
  root.addEventListener('blackglass:plot-course',e=>plots.push(e.detail.view));
  document.readyState='complete';document.hidden=false;document.querySelector=()=>root;
  vm.runInNewContext(source,{window,document,CustomEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},MutationObserver:class{observe(){observing=true;}disconnect(){observing=false;}},setInterval:fn=>{timers.set(++seq,fn);return seq;},clearInterval:id=>timers.delete(id)});
  return {root,panel,toggle,plot,close,scene,canvas,chart,output,factors,plots,timers,window,document,observing:()=>observing,setCamera:c=>{camera=c;for(const fn of timers.values())fn();}};
}
test('spyglass follows looking bearing through north and plots only a surveyed island',()=>{
  const f=fixture();assert.equal(f.toggle.disabled,false);f.toggle.emit('click');
  assert.equal(f.output.bearing.textContent,'000° N');assert.equal(f.output.name.textContent,'Drift Isle');assert.equal(f.plot.disabled,false);
  f.setCamera({x:0,z:0,rotationY:Math.PI/180});assert.equal(f.output.bearing.textContent,'359° N');
  f.setCamera({x:0,z:0,rotationY:-Math.PI/2});assert.equal(f.output.bearing.textContent,'090° E');assert.equal(f.output.name.textContent,'Bell Rock');
  f.plot.emit('click');assert.deepEqual(f.plots,['bell']);assert.deepEqual(f.factors,[3,1]);assert.equal(f.timers.size,0);
  f.toggle.emit('click');f.setCamera({x:0,z:0,rotationY:-Math.PI});assert.equal(f.output.name.textContent,'Open sea');assert.equal(f.plot.disabled,true);
  f.plot.emit('click');assert.deepEqual(f.plots,['bell']);
});
test('lighting retains optics; changing the view or pressing Escape puts it away',()=>{
  const f=fixture();f.toggle.emit('click');f.root.dataset.period='blue-hour';f.root.emit('blackglass:view-changed');assert.equal(f.panel.hidden,false);assert.equal(f.timers.size,1);
  f.root.dataset.view='pools';f.root.emit('blackglass:view-changed');assert.equal(f.panel.hidden,true);assert.equal(f.timers.size,0);
  f.toggle.emit('click');let prevented=false;f.root.emit('keydown',{key:'Escape',preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(prevented,true);assert.equal(f.panel.hidden,true);assert.equal(f.toggle.focused,true);
});
test('hidden pages stop sampling and browser back cache restores instrument availability',()=>{
  const f=fixture();f.toggle.emit('click');f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.timers.size,0);
  f.document.hidden=false;f.document.emit('visibilitychange');assert.equal(f.timers.size,1);
  f.window.emit('pagehide');assert.equal(f.timers.size,0);assert.equal(f.observing(),false);assert.equal(f.panel.hidden,true);
  f.window.emit('pageshow',{persisted:true});assert.equal(f.observing(),true);f.toggle.emit('click');assert.equal(f.timers.size,1);
  f.chart.open=true;f.chart.emit('toggle');assert.equal(f.panel.hidden,true);
});
test('scene camera reset clears the lens and collecting the pocket handheld puts the spyglass away',()=>{
  const f=fixture();f.toggle.emit('click');f.root.emit('gosx:scene3d:optical-zoom-state',{target:f.scene,detail:{factor:1}});assert.equal(f.panel.hidden,true);assert.equal(f.timers.size,0);
  f.toggle.emit('click');f.root.emit('gosx:scene3d:input',{detail:{kind:'pick',input:{type:'select',targetID:'shore-handheld/case'}}});assert.equal(f.panel.hidden,true);assert.deepEqual(f.factors,[3,3,1]);
});
