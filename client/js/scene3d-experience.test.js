'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../runtime/node_modules/typescript');
const source=ts.transpileModule(fs.readFileSync(__dirname+'/../runtime/scene3d/mount-presentation.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){const records=[],subscriptions=new Map();const ctx={window:{__gosx_runtime_api:{}},Map,URL,AbortController,console,location:{href:'https://coast.test/demos',origin:'https://coast.test'},gosxSubscribeSharedSignal:(name,fn)=>{subscriptions.set(name,fn);return()=>subscriptions.delete(name)},setSharedSignalValue:(name,value)=>records.push({name,value}),hashLightContent:()=>1,hashEnvironmentContent:()=>1};vm.runInNewContext(source+'\nglobalThis.api={cycle:sceneCreateDayCycle,presentation:sceneSetupPresentation};',ctx);return{ctx,records,subscriptions,api:ctx.api};}
test('day cycle is continuous, seeded, pausable and independent of camera or vessel ownership',()=>{
 const h=harness(),state={environment:{sky:{mode:'physical',clouds:{}},haze:{}},lights:new Map([['sun',{}]]),camera:{x:3},vessel:{x:120}};
 const cycle=h.api.cycle({durationSeconds:1080,initialHour:17.5,sunLightId:'sun',seed:42,weather:true,inputSignal:'$clock',outputSignal:'$day'},state);
 cycle.advance(0);let a=h.records.at(-1).value;assert.equal(a.Hour,17.5);assert.equal(a.HourLabel,'17:30');const coverage=state.environment.sky.clouds.coverage;
 cycle.advance(270);a=h.records.at(-1).value;assert.equal(a.Hour,23.5);assert.ok(state.environment.envIntensity<.03);assert.equal(state.lights.get('sun').intensity,0);
 h.subscriptions.get('$clock')(false);cycle.advance(540);assert.equal(h.records.at(-1).value.Hour,23.5);
 cycle.seek(12);cycle.advance(541);assert.equal(h.records.at(-1).value.Hour,12);assert.ok(state.lights.get('sun').intensity>8);
 h.subscriptions.get('$clock')(true);cycle.advance(811);assert.equal(h.records.at(-1).value.Hour,18);
 assert.deepEqual(state.camera,{x:3});assert.deepEqual(state.vessel,{x:120});assert.notEqual(coverage,state.environment.sky.clouds.coverage);
 const second={environment:{sky:{mode:'physical',clouds:{}},haze:{}},lights:new Map()};const c2=h.api.cycle({durationSeconds:1080,initialHour:17.5,seed:42,weather:true},second);c2.advance(0);assert.equal(second.environment.sky.clouds.coverage,coverage);
 for(let seconds=812;seconds<=3000;seconds+=37){cycle.advance(seconds);const sky=state.environment.sky;assert.ok(Object.values(sky.sunDirection).every(Number.isFinite));assert.ok(sky.clouds.coverage>=.18&&sky.clouds.coverage<=.88);assert.ok(h.records.at(-1).value.Hour>=0&&h.records.at(-1).value.Hour<24);}
 cycle.dispose();assert.equal(h.subscriptions.size,0);assert.equal(h.api.cycle(null,state),null);
});
test('experience descriptors require the same origin, bound bytes and preserve authored geometry',async()=>{
 const h=harness();vm.runInNewContext(source+'\nglobalThis.load=sceneLoadExperience;',h.ctx);
 const geometry={id:'terrain'},props={experienceRef:'/api/experience',scene:geometry,background:'#123'};
 h.ctx.fetch=async()=>({ok:true,text:async()=>JSON.stringify({dayCycle:{initialHour:12},scene:{id:'foreign'},background:'#fff',__proto__:{bad:true}})});
 const result=await h.ctx.load(props);assert.equal(result.scene,geometry);assert.equal(result.background,'#123');assert.equal(result.dayCycle.initialHour,12);
 await assert.rejects(h.ctx.load({experienceRef:'https://foreign.test/experience'}),/same-origin/);
 h.ctx.fetch=async()=>({ok:true,text:async()=> 'x'.repeat(131073)});await assert.rejects(h.ctx.load(props),/descriptor budget/);
 const inline={scene:geometry};assert.equal(await h.ctx.load(inline),inline);
});
