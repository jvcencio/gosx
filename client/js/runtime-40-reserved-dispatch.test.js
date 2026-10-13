"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FakeElement, createContext, runScript, patchSource, navigationSource,
  buildNavigatedDocument, flushAsyncWork,
} = require("./runtime-test-harness.js");

const reserved = ["data-gosx-handler", "data-gosx-path", "data-gosx-on-click", "DATA-GOSX-ON-INPUT", "data-gosx-on-"];

test("island attribute patches cannot inject or remove reserved dispatch markers", () => {
  const wrapper = new FakeElement("div", null);
  wrapper.id = "island";
  const button = new FakeElement("button", null);
  wrapper.appendChild(button);
  const env = createContext({ elements: [wrapper] });
  runScript(patchSource, env.context, "patch.ts");
  for (const name of reserved) {
    env.context.__gosx_apply_patches("island", JSON.stringify([{ kind: 1, path: "", attrName: name, text: "evil" }]));
    assert.equal(button.getAttribute(name), null, name);
    button.setAttribute(name, "real");
    env.context.__gosx_apply_patches("island", JSON.stringify([
      { kind: 1, path: "", attrName: name, text: "evil" },
      { kind: 2, path: "", attrName: name },
    ]));
    assert.equal(button.getAttribute(name), "real", name);
  }
  env.context.__gosx_apply_patches("island", JSON.stringify([{ kind: 1, path: "", attrName: "data-gosx-link", text: "true" }]));
  assert.equal(button.getAttribute("data-gosx-link"), "true");
});

test("navigation reconciliation preserves dispatch markers and ignores incoming reserved attributes", async () => {
  const current = new FakeElement("button", null);
  current.id = "stable-button";
  current.setAttribute("data-gosx-on-click", "real");
  const incoming = new FakeElement("button", null);
  incoming.id = current.id;
  for (const name of reserved) incoming.setAttribute(name, "evil");
  incoming.setAttribute("data-gosx-link", "true");
  const next = buildNavigatedDocument({ bodyNodes: [incoming] });
  const env = createContext({
    elements: [current],
    fetchRoutes: { "http://localhost:3000/next": { text: "next", url: "http://localhost:3000/next" } },
    parseHTML: () => next,
  });
  env.context.__gosx_dispose_page = async () => {};
  env.context.__gosx_bootstrap_page = async () => {};
  runScript(navigationSource, env.context, "navigation.ts");
  await env.context.__gosx.navigation.navigate("http://localhost:3000/next");
  await flushAsyncWork();
  assert.strictEqual(env.document.getElementById(current.id), current);
  assert.equal(current.getAttribute("data-gosx-on-click"), "real");
  for (const name of reserved.filter(name => name !== "data-gosx-on-click")) assert.equal(current.getAttribute(name), null, name);
  assert.equal(current.getAttribute("data-gosx-link"), "true");
});

test("framework dispatch patches keep newly created island handlers working", () => {
  const wrapper = new FakeElement("div", null);
  wrapper.id = "island";
  const root = new FakeElement("div", null);
  wrapper.appendChild(root);
  const env = createContext({ elements: [wrapper] });
  runScript(patchSource, env.context, "patch.ts");
  env.context.__gosx_apply_patches("island", JSON.stringify([
    { kind: 3, path: "", tag: "button" },
    { kind: 10, path: "0", attrName: "data-gosx-on-click", text: "real" },
    { kind: 10, path: "0", attrName: "data-gosx-handler", text: "real" },
    { kind: 10, path: "0", attrName: "title", text: "ignored" },
  ]));
  const button = root.firstElementChild;
  assert.equal(button.getAttribute("data-gosx-on-click"), "real");
  assert.equal(button.getAttribute("data-gosx-handler"), "real");
  assert.equal(button.getAttribute("title"), null);
  env.context.__gosx_apply_patches("island", JSON.stringify([{ kind: 11, path: "0", attrName: "data-gosx-on-click" }]));
  assert.equal(button.getAttribute("data-gosx-on-click"), null);
});

test("binary mailbox attribute patches cannot overwrite dispatch markers", () => {
  const wrapper = new FakeElement("div", null);
  wrapper.id = "island";
  const button = new FakeElement("button", null);
  wrapper.appendChild(button);
  const env = createContext({ elements: [wrapper] });
  runScript(patchSource, env.context, "patch.ts");
  env.context.__gosx.runtime.mailbox = { decodePatchMailbox: () => ({
    islandID: "island", patches: reserved.map(attrName => ({ kind: 1, path: "", attrName, text: "evil" })),
  }) };
  env.context.__gosx.host.patch.applyMailbox("island", new Uint8Array());
  for (const name of reserved) assert.equal(button.getAttribute(name), null, name);
});
