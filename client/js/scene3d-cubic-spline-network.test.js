'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');
const { test } = require('node:test');

const producer = fs.readFileSync(path.join(__dirname, 'testdata/scene3d-cubic-spline-browser.cjs'), 'utf8');
const verifier = fs.readFileSync(path.join(__dirname, 'testdata/scene3d-cubic-spline-browser-matrix.cjs'), 'utf8');
const names = ['affine-gl', 'affine-wg', 'gl', 'wg', 'textured-gl', 'textured-wg'];

function eventHarness() {
  // Execute the actual CDP network event branches without starting Chrome or
  // replacing their completion/error policy with a mock implementation.
  const begin = producer.indexOf("    if (m.method === 'Network.requestWillBeSent'");
  const end = producer.indexOf("    if (m.method === 'Log.entryAdded'", begin);
  assert.ok(begin >= 0 && end > begin);
  const context = vm.createContext({ URL, Map });
  vm.runInContext(`
    const BASE = 'http://127.0.0.1:12345';
    const networkRequests = new Map();
    const clientEventCompletions = [];
    const networkFailures = [];
    let activeCaseName = null;
    function networkFail(message) { networkFailures.push(message); }
    function inspectNetworkRequest() {}
    function receive(m, caseName) { activeCaseName = caseName;
      ${producer.slice(begin, end)}
    }
    function snapshot() { return { completions: clientEventCompletions, failures: networkFailures }; }
  `, context);
  return {
    send(method, params, caseName = 'gl') { context.receive({ method, params }, caseName); },
    snapshot() { return JSON.parse(JSON.stringify(context.snapshot())); },
  };
}

function request(x, id, caseName = 'gl', url = 'http://127.0.0.1:12345/_gosx/client-events', method = 'POST') {
  x.send('Network.requestWillBeSent', { requestId: id, request: { method, url } }, caseName);
  return url;
}
function headers(x, id, url, status = 204) {
  x.send('Network.responseReceived', { requestId: id, response: { url, status } });
}
function complete(x, id) { x.send('Network.loadingFinished', { requestId: id }); }

function reportHarness() {
  const begin = verifier.indexOf('function checkClientEventCompletion(');
  const end = verifier.indexOf('function checkTopLevel(', begin);
  assert.ok(begin >= 0 && end > begin);
  const context = vm.createContext({ util });
  vm.runInContext(`const EXPECTED_CASE_NAMES = ${JSON.stringify(names)};`, context);
  const helpers = verifier.slice(verifier.indexOf('function check('), verifier.indexOf('function containsSwiftShader('));
  vm.runInContext(helpers + verifier.slice(begin, end), context);
  return report => {
    context.reportJSON = JSON.stringify(report);
    return JSON.parse(vm.runInContext(`(function () {
      const failures = [];
      checkClientEventCompletion(failures, JSON.parse(reportJSON));
      return JSON.stringify(failures);
    })()`, context));
  };
}
function completedReport() {
  const x = eventHarness();
  for (const name of names) {
    const url = request(x, name, name);
    headers(x, name, url);
    complete(x, name);
  }
  return {
    networkFailures: x.snapshot().failures,
    clientEventCompletions: x.snapshot().completions,
    clientEventResponses: names.map(() => ({ method: 'POST', path: '/_gosx/client-events', status: 204 })),
  };
}

test('204 headers do not count as client-event completion', () => {
  const x = eventHarness();
  const url = request(x, 'one');
  headers(x, 'one', url);
  assert.deepEqual(x.snapshot(), { completions: [], failures: [] });
  complete(x, 'one');
  assert.deepEqual(x.snapshot().completions, [{ caseName: 'gl', method: 'POST', path: '/_gosx/client-events', status: 204, cdpTerminal: 'loadingFinished' }]);
});

test('204 ERR_ABORTED is fatal and never supplies completion evidence', () => {
  const x = eventHarness();
  const url = request(x, 'one');
  headers(x, 'one', url);
  x.send('Network.loadingFailed', { requestId: 'one', errorText: 'net::ERR_ABORTED', canceled: true });
  complete(x, 'one');
  assert.deepEqual(x.snapshot().completions, []);
  assert.equal(x.snapshot().failures.length, 1);
  assert.match(x.snapshot().failures[0], /net::ERR_ABORTED after HTTP 204 \(canceled\)/);
});

test('other failed and unknown requests remain fatal', () => {
  const x = eventHarness();
  x.send('Network.loadingFailed', { requestId: 'unknown', errorText: 'net::ERR_CONNECTION_RESET' });
  assert.equal(x.snapshot().failures.length, 1);
  assert.match(x.snapshot().failures[0], /request unknown.*ERR_CONNECTION_RESET/);
});

test('only the owned POST204 endpoint may produce completion evidence', () => {
  const x = eventHarness();
  for (const [id, url, method, status] of [
    ['foreign', 'http://other.invalid/_gosx/client-events', 'POST', 204],
    ['query', 'http://127.0.0.1:12345/_gosx/client-events?x=1', 'POST', 204],
    ['asset', 'http://127.0.0.1:12345/bootstrap.js', 'GET', 204],
    ['wrong-status', 'http://127.0.0.1:12345/_gosx/client-events', 'POST', 200],
  ]) {
    request(x, id, 'gl', url, method); headers(x, id, url, status); complete(x, id);
  }
  complete(x, 'unknown');
  assert.deepEqual(x.snapshot().completions, []);
});

test('a duplicate loadingFinished cannot count a request twice', () => {
  const x = eventHarness(); const url = request(x, 'one'); headers(x, 'one', url);
  complete(x, 'one'); complete(x, 'one');
  assert.equal(x.snapshot().completions.length, 1);
});

test('matrix accepts actual completions attributed to all six renderer cases', () => {
  assert.deepEqual(reportHarness()(completedReport()), []);
});

test('matrix rejects missing terminal evidence even with six server responses', () => {
  const report = completedReport(); report.clientEventCompletions.pop();
  assert.match(reportHarness()(report).join('\n'), /clientEventCompletions/);
});

test('matrix rejects the former intentional204abort exemption', () => {
  const report = completedReport();
  report.clientEventCompletions[0].cdpTerminal = 'loadingFailed:net::ERR_ABORTED';
  assert.match(reportHarness()(report).join('\n'), /clientEventCompletions/);
});

test('matrix rejects completed probes belonging to the wrong case', () => {
  const report = completedReport(); report.clientEventCompletions[1].caseName = 'affine-gl';
  assert.match(reportHarness()(report).join('\n'), /clientEventCompletions/);
});

test('matrix rejects any abort or network error alongside completed probes', () => {
  const report = completedReport(); report.networkFailures.push('loadingFailed net::ERR_ABORTED');
  assert.match(reportHarness()(report).join('\n'), /networkFailures/);
});
