import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const ts = createRequire(new URL("../runtime/package.json", import.meta.url))("typescript");
const source = name => fs.readFileSync(new URL("../runtime/scene3d/" + name, import.meta.url), "utf8");
function run(code, context) {
  return vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
function harness() {
  const events = [];
  const state = { objects: new Map([0, 1, 2].map(i => [i, { id: `hero/slot-0/prim-${i}`, visible: true, opacity: 1 }])),
    _modelHydrationGeneration: 4, _modelHydrationUncommitted: false };
  const renderer = { kind: "webgl" };
  const mount = { dispatchEvent(event) { events.push(event); } };
  let sets = 0;
  class CountingSet extends Set { constructor(...args) { super(...args); sets++; } }
  const context = vm.createContext({ Set: CountingSet, state, sceneState: state, renderer, mount, disposed: false,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, performance: { now: () => 1 } });
  const telemetry = source("mount-telemetry.ts");
  run(telemetry.slice(telemetry.indexOf("function sceneCreateFrameRequest")), context);
  const mounted = source("mount.ts");
  run(mounted.slice(mounted.indexOf("    let lastMountCommandRevision = 0;"), mounted.indexOf("    function createSceneRenderFrameMeta")), context);
  run(`lastMountCommandRevision=9;
    pendingFrameRequest=sceneCreateFrameRequest({id:'drop',modelIDs:['hero/slot-0']},6);
    pendingFrameRequest.accepted=true;
    var receipt=scenePrepareFrameRequest(pendingFrameRequest,state,9);
    var meta={frameRequest:receipt,frameRenderer:renderer,commandRevision:9,hydrationGeneration:4};`, context);
  return { context, events, state, eval: code => run(code, context), sets: () => sets };
}

test("requested submission needs every live color primitive, not a declaration or shadow pass", () => {
  const h = harness();
  for (const outcome of ["pending", "empty", "failed", undefined]) {
    assert.equal(h.eval(`finishSceneSubmission(${JSON.stringify(outcome)},meta)`), false);
    assert.equal(h.events.length, 0);
  }
  h.eval("receipt.record('other/slot-0/prim-0');receipt.record('hero/slot-0/prim-0')");
  assert.equal(h.eval("finishSceneSubmission('submitted',meta)"), true);
  assert.equal(h.events.length, 0, "a partial actor must keep admission pending");
  h.eval("receipt.record('hero/slot-0/prim-1');receipt.record('hero/slot-0/prim-2');finishSceneSubmission('submitted',meta)");
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].type, "gosx:scene3d:frame-submitted");
  assert.equal(h.events[0].detail.revision, 6);
  assert.equal(h.events[0].detail.commandRevision, 9, "later camera/pose revisions do not starve the request");
  assert.equal(h.events[0].detail.objectIDs.length, 3);
  h.eval("finishSceneSubmission('submitted',meta)");
  assert.equal(h.events.length, 1, "one request emits one receipt");
});

test("hydration, command, renderer and cancellation fences reject stale submissions", () => {
  for (const mutation of ["state._modelHydrationGeneration=5", "state._modelHydrationUncommitted=true",
    "lastMountCommandRevision=10", "renderer={kind:'webgl'}", "disposed=true",
    "pendingFrameRequest=sceneCreateFrameRequest({id:'new',modelIDs:['hero/slot-0']},10)",
    "cancelSceneFrameRequest({target:mount,detail:{id:'drop'}})"]) {
    const h=harness(); h.eval("for (const id of receipt.expected) receipt.record(id)");
    h.eval(mutation); h.eval("finishSceneSubmission('submitted',meta)"); assert.equal(h.events.length,0,mutation);
  }
  const h=harness();
  h.eval("cancelSceneFrameRequest({target:mount,detail:{id:'old'}});cancelSceneFrameRequest({target:{},detail:{id:'drop'}})");
  assert.equal(h.eval("pendingFrameRequest.id"),'drop');
  h.state.objects.clear();
  assert.equal(h.eval("scenePrepareFrameRequest(receipt,state,9)"),null,"empty lobby membership cannot admit gameplay");
});

test("normal settled submission frames allocate no request sets and emit no receipt events", () => {
  const h=harness();h.eval("pendingFrameRequest=null;meta.frameRequest=null");const before=h.sets();
  h.eval("for(let i=0;i<10000;i++) finishSceneSubmission('submitted',meta)");
  assert.equal(h.sets(),before);assert.equal(h.events.length,0);
});

test("WebGPU partial validation submission returns pending instead of a positive full-frame outcome", () => {
  const gpu=source("webgpu.ts");const events=[];
  const c=vm.createContext({guard:{},wgpuSubmitPendingFrame:()=>events.push('partial'),fail:()=>events.push('failure')});
  run(gpu.slice(gpu.indexOf("    function wrapFrame("),gpu.indexOf("    function release(")),c);
  assert.equal(run("wrapFrame(()=>{throw {pipelineValidation:true}},()=>{})(null,null,null)",c),'pending');
  assert.equal(run("wrapFrame(()=>{throw new Error('bad')},()=>{})(null,null,null)",c),'failed');
  assert.equal(run("wrapFrame(()=> 'submitted',()=>{})(null,null,null)",c),'submitted');
  assert.deepEqual(events,['partial','partial','failure']);
});
