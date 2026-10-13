"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBoardWebGPUHarness, bundleBoxes, flushAsyncWork, deviceCallSnapshot } = require("./runtime-test-harness.js");

async function setup({ post = false, timing = false, optIn = false } = {}) {
  let now = 0;
  const resolves = [];
  const writes = [];
  const h = await createBoardWebGPUHarness({ fresh: true, verboseTelemetry: false,
    performanceNow: () => now, fakeDeviceOptions: { timestampQuery: timing },
    configureDevice(device, state, env) {
      env.context.__gosx_scene3d_webgpu_pass_timing = optIn;
      const create = device.createCommandEncoder;
      device.createCommandEncoder = function(...args) {
        const encoder = create.apply(this, args);
        const resolve = encoder.resolveQuerySet;
        encoder.resolveQuerySet = function(...args) { resolves.push(args[2]); return resolve.apply(this, args); };
        return encoder;
      };
    },
  });
  const api = h.env.context.__gosx_scene3d_api;
  const bundle = api.createSceneRenderBundle(640, 480, "#000",
    { x: 0, y: 0, z: 6, fov: 60, near: 0.05, far: 128 },
    bundleBoxes(10, 1).map(o => ({ ...o, castShadow: true, receiveShadow: true })),
    [], [], [], [], {}, 0, [], [], [], [], [], 0, false);
  bundle.lights = [{ kind: "directional", directionX: -1, directionY: -2, directionZ: -1, intensity: 1, castShadow: true, color: "#fff" }];
  if (post) bundle.postEffects = [{ kind: "bloom", threshold: 0.8, intensity: 0.5 }, { kind: "toneMapping" }];
  const set = h.mount.setAttribute;
  h.mount.setAttribute = function(name, value) { writes.push([name, value]); return set.call(this, name, value); };
  const frame = async time => { now = time; const result = h.renderer.render(bundle, { width: 640, height: 480 }, { nowMS: time, active: true }); await flushAsyncWork(); return result; };
  for (let i = 0; i < 12; i++) await frame(i * 16);
  return { ...h, bundle, frame, resolves, writes };
}

test("WebGPU bloom and tone mapping present in seven render passes", async () => {
  const h = await setup({ post: true });
  try {
    const before = deviceCallSnapshot(h.fake);
    await h.frame(192);
    assert.equal(deviceCallSnapshot(h.fake).renderPasses - before.renderPasses, 7);
    const final = h.fake.state.renderPasses.at(-1);
    assert.equal(final.descriptor.colorAttachments[0].view.__kind, "canvasTextureView");
    assert.equal(final.draws[0].pipeline.desc.fragment.targets[0].format, h.configureCalls.at(-1).format);
  } finally { h.renderer.dispose(); }
});

for (const optIn of [false, true]) test(`WebGPU per-pass query resolves require opt-in (${optIn})`, async () => {
  const h = await setup({ timing: true, optIn });
  try {
    const before = h.resolves.length;
    await h.frame(192);
    const resolves = h.resolves.slice(before);
    assert.ok(resolves.includes(2), "adaptive quality retains frame timestamps");
    assert.equal(resolves.includes(4), optIn);
  } finally { h.renderer.dispose(); }
});

test("WebGPU steady frames avoid DOM writes and reuse frame stats", async () => {
  const h = await setup();
  try {
    const stats = h.mount.__gosxScene3DWebGPUStats;
    const seq = stats.frameSeq;
    let before = h.writes.length;
    await h.frame(192);
    assert.equal(h.writes.length - before, 0);
    assert.equal(h.mount.__gosxScene3DWebGPUStats, stats);
    assert.equal(stats.frameSeq, seq + 1);
    before = h.writes.length;
    await h.frame(512);
    assert.ok(h.writes.length - before < 12, "4 Hz mirror writes only changed values");
    assert.equal(Number(h.mount.getAttribute("data-gosx-scene3d-webgpu-frame-seq")), stats.frameSeq);
  } finally { h.renderer.dispose(); }
});


test("WebGPU scaled and unknown trailing effects retain the present blit", async () => {
  const h = await setup({ post: true });
  try {
    for (const scale of [0.5, 1, 0.5, 1]) {
      h.bundle.postFXMaxPixels = scale === 1 ? 0 : 640 * 480 / 4;
      const before = h.fake.state.renderPasses.length;
      await h.frame(512);
      const passes = h.fake.state.renderPasses.slice(before);
      assert.equal(passes.length, scale === 1 ? 7 : 8);
      assert.equal(passes.at(-1).draws[0].pipeline.desc.fragment.module.label,
        scale === 1 ? "post-toneMapping" : "post-present");
    }
    h.bundle.postEffects.push({ kind: "unknown" });
    await h.frame(768);
    assert.equal(h.fake.state.renderPasses.at(-1).draws[0].pipeline.desc.fragment.module.label, "post-present");
    h.bundle.postEffects = [];
    await h.frame(1024);
    assert.equal(h.mount.__gosxScene3DWebGPUStats.postChain, undefined, "prior post results must not survive a post toggle");
  } finally { h.renderer.dispose(); }
});

test("mount watchdog reads current JS progress without DOM attribute reads", () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../runtime/scene3d/mount.ts"), "utf8");
  const start = source.indexOf("    function readSceneWebGPUProgress()");
  const end = source.indexOf("    /* @ts-expect-error", start);
  const api = vm.createContext({ renderer: { getFrameProgress: () => ({ frameSeq: 123, frameAt: 456 }) },
    sceneDebugAttr() { throw new Error("watchdog must not read throttled DOM progress"); } });
  vm.runInContext(source.slice(start, end), api);
  assert.deepEqual(JSON.parse(JSON.stringify(api.readSceneWebGPUProgress())), { seq: 123, at: 456 });
});
