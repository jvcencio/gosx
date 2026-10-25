"use strict";
// Proves the committed, minified navigation runtime artifact
// (client/runtime/host/navigation-runtime.min.js) parses and boots the same
// way its readable source does (gosx#221).
//
// Every behavioral navigation test in this suite (runtime-14-navigation.
// test.js and friends) runs against navigationSource — compatibility.ts and
// navigation.ts, unminified — never against this artifact. That is
// deliberate: the source is what a person reads and what a diff shows, and
// cmd/buildbootstrap's --check gate (make test-js) is what proves the
// committed .min.js stays byte-current with it. This file's only job is the
// one thing --check cannot prove: that the minified bytes are still valid,
// executable JavaScript whose top-level IIFE runs to completion and installs
// the same public surface the source installs. The mutation transport case below
// also guards against replaying a write in the emitted production bytes.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  navigationSource,
  navigationRuntimeMinifiedSource,
  bootstrapSource,
  FakeElement,
  createContext,
  runScript,
  flushAsyncWork,
} = require("./runtime-test-harness.js");

test("deferred navigation marks parser-built links before bootstrap starts", async () => {
  const env = createContext({ elements: [] });
  env.document.readyState = "interactive";
  env.context.location.href = "http://localhost:3000/current";
  const link = new FakeElement("a", env.document);
  link.setAttribute("href", "/current");
  link.setAttribute("data-gosx-link", "true");
  env.document.body.appendChild(link);

  runScript(navigationRuntimeMinifiedSource, env.context, "navigation-runtime.min.js");
  const navigation = env.context.__gosx.navigation;
  assert.equal(link.getAttribute("aria-current"), "page");
  assert.equal(link.getAttribute("data-gosx-link-current"), "page");
  assert.equal(link.getAttribute("data-gosx-link-state"), "idle");

  runScript(bootstrapSource, env.context, "bootstrap.js");
  await flushAsyncWork();
  assert.equal(env.context.__gosx.navigation, navigation);
  assert.equal(env.context.__gosx.host.navigation, navigation);
  assert.equal(env.context.__gosx_page_nav, navigation);
});

test("the minified navigation runtime artifact parses and boots", () => {
  const env = createContext({ elements: [] });
  assert.doesNotThrow(() => {
    runScript(navigationRuntimeMinifiedSource, env.context, "navigation-runtime.min.js");
  });

  const navigation = env.context.__gosx && env.context.__gosx.navigation;
  assert.equal(typeof navigation, "object", "the IIFE must publish window.__gosx.navigation");
  assert.equal(typeof navigation.navigate, "function");
  assert.equal(typeof navigation.submitAction, "function");
  assert.equal(typeof navigation.getState, "function");
  assert.equal(typeof navigation.refresh, "function");
  assert.equal(typeof navigation.revalidate, "function");

  // The compatibility adapter's ambient names (compatibility.ts, the first
  // half of this artifact) must resolve too: navigation.ts calls
  // gosxHostCompatibility.install for both at the end of its own IIFE.
  assert.equal(env.context.__gosx_page_nav, navigation, "__gosx_page_nav must be installed and alias the same navigation object");
  assert.equal(typeof env.context.__gosx_submit_action, "function");
});

test("the minified artifact publishes the same navigation API surface as the source", () => {
  const sourceEnv = createContext({ elements: [] });
  runScript(navigationSource, sourceEnv.context, "navigation_runtime_source.js");
  const sourceKeys = Object.keys(sourceEnv.context.__gosx.navigation).sort();

  const minifiedEnv = createContext({ elements: [] });
  runScript(navigationRuntimeMinifiedSource, minifiedEnv.context, "navigation-runtime.min.js");
  const minifiedKeys = Object.keys(minifiedEnv.context.__gosx.navigation).sort();

  // Minification renames local identifiers (function and variable names
  // inside the IIFE), but it must never rename an object literal's own
  // property keys — those are the public command API gosx#221 promises stays
  // identical. A drift here would mean a minifier pass mangled properties
  // (mangleProps), which this build must never enable.
  assert.deepEqual(minifiedKeys, sourceKeys);
});


test("the minified runtime does not replay a write after its response is lost", async () => {
  const main = new FakeElement("main", null);
  main.setAttribute("data-gosx-main", "");
  const actionURL = "http://localhost:3000/__actions/copy";
  let savedCopies = 0;
  const env = createContext({
    elements: [main],
    fetchRoutes: {
      [actionURL]() {
        savedCopies++;
        throw new Error("connection closed after saving the copy");
      },
    },
  });
  const hardNavigations = [];
  env.context.location.assign = url => hardNavigations.push(String(url));
  env.context.location.replace = url => hardNavigations.push(String(url));
  const originalURL = env.context.location.href;
  runScript(navigationRuntimeMinifiedSource, env.context, "navigation-runtime.min.js");
  const form = env.context.__gosx.navigation.submitAction("/__actions/copy", { name: "finale" }, { root: main, keepForm: true });
  const outcome = await form.__gosxSubmitPromise;
  assert.equal(savedCopies, 1);
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(form.requestSubmitCalls.length, 0);
  assert.equal(form.submitCalls.length, 0);
  assert.equal(form.parentNode, main);
  assert.deepEqual(hardNavigations, []);
  assert.equal(env.context.location.href, originalURL);
  assert.equal(form.hasAttribute("data-gosx-pending"), false);
  assert.equal(form.getAttribute("data-gosx-form-state"), "error");
  assert.equal(outcome.response.status, 0);
  assert.equal(outcome.result.ok, false);
  assert.equal(outcome.redirected, false);
  const resultEvent = env.document.dispatchedEvents.find(event => event.type === "gosx:form:result");
  assert.equal(resultEvent.detail.ok, false);
  assert.equal(resultEvent.detail.status, 0);
  assert.match(resultEvent.detail.result.message, /Check the saved state before trying again/);
});
