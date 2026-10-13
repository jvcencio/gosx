"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBoardWebGPUHarness, flushAsyncWork, deviceCallSnapshot } = require("./runtime-test-harness.js");

async function materialHarness(selena = false, count = 50, renderBundles = true) {
  const harness = await createBoardWebGPUHarness({ fresh: true, fakeDeviceOptions: { renderBundles, validateBindings: true } });
  const api = harness.env.context.__gosx_scene3d_api;
  const fixture = selena && JSON.parse(fs.readFileSync(path.join(__dirname, "testdata/water-object-material-selena.json"), "utf8"));
  const material = selena ? { id: "m", shaderBackend: "selena", customVertexWGSL: fixture.wgsl,
    customFragmentWGSL: fixture.wgsl, shaderLayout: fixture.layout } : { id: "m", color: "#8de1ff", roughness: 0.4, metalness: 0.1 };
  const state = api.createSceneState({ scene: { materials: [material], objects: Array.from({ length: count }, (_, i) => ({
    id: "box-" + i, kind: "box", width: 0.4, height: 0.4, depth: 0.4,
    x: (i % 20) * 0.5 - 5, y: Math.floor(i / 20) * 0.5 - 2, material: "m", wireframe: false,
  })) } }, { tier: "full" });
  let frame = 0;
  const bundle = () => api.createSceneRenderBundle(640, 480, "#000000",
    { x: 0, y: 0, z: 14, fov: 60, near: 0.05, far: 128 }, api.sceneStateObjectsWithMaterials(state),
    [], [], [], [], {}, 0, [], [], [], [], [], 0, false, { retainedGeometry: true });
  const render = async (b = bundle()) => {
    const result = harness.renderer.render(b, { width: 640, height: 480 }, { nowMS: frame++ * 16, active: true });
    await flushAsyncWork();
    return result;
  };
  return { ...harness, api, state, bundle, render };
}

for (const selena of [false, true]) test(`persistent ${selena ? "Selena" : "named"} materials plateau after frame 2`, async t => {
  const h = await materialHarness(selena);
  t.after(() => h.renderer.dispose());
  let steady;
  let pending = 0;
  for (let frame = 0; frame < 30; frame++) {
    if (await h.render() === "pending") pending++;
    const snapshot = { ...deviceCallSnapshot(h.fake), buffers: h.fake.state.buffers.length };
    if (frame === 2) steady = snapshot;
    if (frame > 2) {
      assert.equal(snapshot.buffers, steady.buffers, `frame ${frame}: no new buffers`);
      assert.equal(snapshot.bindGroups, steady.bindGroups, `frame ${frame}: no new bind groups`);
      assert.equal(snapshot.renderPipelines, steady.renderPipelines);
    }
  }
  assert.ok(pending <= 2);
  if (!selena) assert.ok(Number(h.mount.getAttribute("data-gosx-scene3d-webgpu-bundle-replays")) > 0);
});

test("replacing a retained resource owner retires its material uniform", async t => {
  const h = await materialHarness(false, 1, false);
  t.after(() => h.renderer.dispose());
  for (let i = 0; i < 3; i++) await h.render();
  const b = h.bundle();
  const materialBuffer = h.fake.state.bindGroups.flatMap(g => g.desc.entries || [])
    .map(e => e.resource && e.resource.buffer).find(b => b && b.size === 288);
  assert.ok(materialBuffer);
  b.meshObjects[0].resourceOwner = {};
  await h.render(b);
  assert.ok(materialBuffer.destroyed, "old owner's uniform is destroyed on replacement");
});

module.exports = { materialHarness };
