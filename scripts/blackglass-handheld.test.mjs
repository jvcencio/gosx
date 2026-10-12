import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

test('pocket shell versions its loader and styles so returning players bypass stale cached assets', () => {
  const root = new URL('../examples/gosx-docs/public/demos/blackglass-handheld/', import.meta.url);
  const html = readFileSync(new URL('pocket.html', root), 'utf8');
  for (const name of ['handheld.js', 'handheld.css']) {
    const digest = createHash('sha256').update(readFileSync(new URL(name, root))).digest('hex').slice(0, 16);
    assert.ok(html.includes(`"${name}?v=${digest}"`), `${name} must have a current content version: old cached URLs cannot load the deployment cartridge`);
  }
});

const source = readFileSync(new URL('../examples/gosx-docs/public/demos/blackglass-handheld/handheld.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
async function handheld() {
  const element = () => ({ dataset: {}, value: '3', listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, setAttribute() {}, focus() {} });
  const canvas = element();
  canvas.getContext = () => ({ createImageData: () => ({ data: new Uint8ClampedArray(160 * 144 * 4) }), putImageData() {} });
  const controls = Object.fromEntries(['data-status', 'data-sound', 'data-speed', 'data-rom', 'data-import-save', 'data-save', 'data-screen-prompt', 'data-hint'].map(key => [key, element()]));
  const document = { body: { dataset: {} }, hidden: false, listeners: {}, querySelector: selector => selector === 'canvas' ? canvas : controls[selector.slice(1, -1)], querySelectorAll: () => [], addEventListener(name, fn) { this.listeners[name] = fn; } };
  let rafID = 0;
  const frames = new Map(), sources = [];
  class GameBoy {
    static verify_rom() { return true; }
    constructor() { this.frames = 0; this.keys = new Set(); this.inputs = []; }
    load_unsafe() {} load_rom_wa() { return { free() {} }; } load_boot_state() {} free() {}
    next_frame() { this.frames++; this.inputs.push([...this.keys]); } ppu_frame() { return this.frames; }
    frame_buffer_eager() { return new Uint8Array(160 * 144 * 4); }
    ram_data_eager() { return new Uint8Array(); } key_press(key) { this.keys.add(key); } key_lift(key) { this.keys.delete(key); }
    audio_buffer_eager() { return new Int16Array(960); } audio_channels() { return 2; } audio_sampling_rate() { return 48000; }
  }
  class AudioContext {
    state = 'running'; currentTime = 1; destination = {};
    async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; }
    createBuffer(channels, count, rate) { return { duration: count / rate, getChannelData: () => new Float32Array(count) }; }
    createBufferSource() {
      const s = { playbackRate: { value: 1 }, connect() {}, start(at) { this.at = at; }, stop() { this.stopped = true; } }; sources.push(s); return s;
    }
  }
  const context = vm.createContext({ document, window: element(), parent: {}, location: { origin: 'https://coast.test' }, init: async () => {}, GameBoy, GameBoyMode: { Dmg: 0, Cgb: 1 }, PadKey: { A: 1, Start: 2 }, AudioContext, crypto: webcrypto,
    requestAnimationFrame: fn => { frames.set(++rafID, fn); return rafID; }, cancelAnimationFrame: id => frames.delete(id), AbortSignal,
    fetch: async url => { assert.equal(url, '/api/blackglass-cartridge', 'empty deployments must not fetch a ROM'); return { ok: true, json: async () => ({ available: false }) }; } });
  await vm.runInContext(`(async () => { ${source}\nglobalThis.pocket = { load, play, tick, key, frames: () => gb?.ppu_frame() || 0, inputs: () => gb.inputs }; })()`, context);
  const rom = new Uint8Array(32768); let checksum = 0; for (let i = 0x134; i < 0x14d; i++) checksum = (checksum - 1) & 255; rom[0x14d] = checksum;
  return { context, controls, canvas, document, sources, frames, rom, api: context.pocket };
}

test('empty handheld schedules no emulation and advances the cartridge clock at 3× or 1×', async () => {
  const h = await handheld();
  assert.equal(h.frames.size, 0); assert.equal(h.canvas.dataset.playing, 'false'); assert.equal(h.canvas.dataset.emulationSpeed, '3');
  await h.api.load(h.rom, 'timing-probe.gb');
  for (let i = 0; i <= 60; i++) h.api.tick(100 + i * 1000 / 60);
  const triple = h.api.frames(); assert.ok(triple >= 179 && triple <= 183, `${triple} frames over one second at 3×`);
  h.controls['data-speed'].value = '1'; h.controls['data-speed'].listeners.change();
  for (let i = 0; i <= 60; i++) h.api.tick(2000 + i * 1000 / 60);
  const normal = h.api.frames() - triple; assert.ok(normal >= 59 && normal <= 61, `${normal} frames at 1×`);
  assert.ok(triple / normal > 2.9 && triple / normal < 3.1);
  h.api.play(false); const stopped = h.api.frames(); h.api.tick(50000); assert.equal(h.api.frames(), stopped);
  h.api.play(true); h.api.tick(50000); assert.equal(h.api.frames() - stopped, 1, 'resume must not simulate the time spent paused');
});

test('3× audio consumes its buffers at 3× and changing speed or hiding cancels queued audio', async () => {
  const h = await handheld(); await h.api.load(h.rom, 'audio-probe.gb');
  await h.controls['data-sound'].listeners.click(); h.api.tick(100);
  assert.equal(h.sources.at(-1).playbackRate.value, 3);
  const tripleSource = h.sources.at(-1); h.controls['data-speed'].value = '1'; h.controls['data-speed'].listeners.change();
  assert.equal(tripleSource.stopped, true); h.api.tick(200); assert.equal(h.sources.at(-1).playbackRate.value, 1);
  const normalSource = h.sources.at(-1); h.document.hidden = true; h.document.listeners.visibilitychange();
  assert.equal(normalSource.stopped, true); const stopped = h.api.frames(); h.api.tick(50000); assert.equal(h.api.frames(), stopped);
  h.document.hidden = false; h.document.listeners.visibilitychange(); h.api.tick(50000); assert.equal(h.api.frames() - stopped, 1);
});
test('brief taps reach a cartridge frame and pause clears held or queued inputs', async () => {
  const h = await handheld(); await h.api.load(h.rom, 'input-probe.gb');
  h.api.key('Start', true); h.api.key('Start', false); h.api.tick(100);
  assert.deepEqual(Array.from(h.api.inputs()[0]), [2]);
  assert.deepEqual(Array.from(h.api.inputs()[1]), []);
  h.api.key('A', true); h.api.key('A', false); h.api.play(false); h.api.play(true); h.api.tick(5000);
  assert.deepEqual(Array.from(h.api.inputs().at(-1)), [], 'putting away must release pending taps');
});
