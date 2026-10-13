"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBoardWebGPUHarness, flushAsyncWork, deviceCallSnapshot } = require("./runtime-test-harness.js");

async function materialHarness(selena = false, count = 50, renderBundles = true) {
  const harness = await createBoardWebGPUHarness({ fresh: true, fakeDeviceOptions: { renderBundles, validateBindings: true } });
  const api = harness.env.context.__gosx_scene3d_api;
  const shader = `struct Uniforms { mvp: mat4x4f, modelMatrix: mat4x4f, baseColor: vec4f, };
    @group(0) @binding(0) var<uniform> u: Uniforms;
    @vertex fn vertexMain(@location(0) position: vec3f) -> @builtin(position) vec4f {
      return u.mvp * u.modelMatrix * vec4f(position, 1.0);
    }
    @fragment fn fragmentMain() -> @location(0) vec4f { return u.baseColor; }`;
  const material = selena ? { id: "m", shaderBackend: "selena", customVertexWGSL: shader,
    customFragmentWGSL: shader, customUniforms: { baseColor: [0.8, 0.8, 0.8, 1] },
    shaderLayout: { material: "MaterialCacheProbe", kind: "mesh", wgsl: { group: 0, binding: 0 },
      attributes: [{ name: "position", type: "vec3", wgsl: { location: 0 } }],
      uniformBlock: { size: 144, fields: [{ name: "mvp", type: "mat4", offset: 0 },
        { name: "modelMatrix", type: "mat4", offset: 64 }, { name: "baseColor", type: "vec4", offset: 128 }] } }
  } : { id: "m", color: "#8de1ff", roughness: 0.4, metalness: 0.1 };
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
  assert.ok(Number(h.mount.getAttribute("data-gosx-scene3d-webgpu-bundle-replays")) > 0);
  if (selena) {
    h.state.materials[0].customUniforms = { baseColor: [0.125, 0.25, 0.5, 1] };
    for (let i = 0; i < 3; i++) await h.render();
    const uniform = h.fake.state.writeBufferCalls.filter(c => c.data && c.data.byteLength === 144).at(-1);
    assert.equal(h.mount.getAttribute("data-gosx-scene3d-webgpu-bundle-state"), "replayed");
    assert.equal(uniform.data[32], 0.125, "replayed Selena bundle receives live uniforms");
  }
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

test("stable Selena owners invalidate groups when the shader layout changes", async t => {
  const h = await materialHarness(true, 1);
  t.after(() => h.renderer.dispose());
  for (let i = 0; i < 3; i++) await h.render();
  const material = h.state.materials[0];
  material.shaderLayout.wgsl.binding = 1;
  material.customVertexWGSL = material.customVertexWGSL.replace(/@binding\(0\)/g, "@binding(1)");
  material.customFragmentWGSL = material.customFragmentWGSL.replace(/@binding\(0\)/g, "@binding(1)");
  for (let i = 0; i < 3; i++) await h.render();
  const pipeline = h.fake.state.renderPipelines.filter(p => /selena/.test(p.label || p.desc.label)).at(-1);
  const layout = pipeline.desc.layout.desc.bindGroupLayouts[0];
  assert.ok(h.fake.state.bindGroups.some(g => g.desc.layout === layout && g.desc.entries[0].binding === 1),
    "the new pipeline binds a group with the current layout");
});
