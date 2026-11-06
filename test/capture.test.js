const test = require('node:test');
const assert = require('node:assert/strict');
const { createTabCapture } = require('../src/capture.js');
const audioUtils = require('../src/audio-utils.js');
class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.stopped = false; }
  stop() { this.stopped = true; }
  getSettings() { return { displaySurface: this.surface || 'browser' }; }
}
const stream = (tracks) => ({ getTracks: () => tracks, getAudioTracks: () => tracks.filter(t => t.kind === 'audio'), getVideoTracks: () => tracks.filter(t => t.kind === 'video') });
globalThis.MediaStream = class { constructor(tracks) { this.tracks = tracks; } };
function harness(getDisplayMedia) {
  const nodes = [];
  class Context {
    constructor() { this.sampleRate = 48000; this.state = 'running'; this.destination = {}; }
    node() { const n = { gain: {}, connect() { return this; }, disconnect() {} }; nodes.push(n); return n; }
    createMediaStreamSource() { return this.node(); }
    createScriptProcessor() { return this.node(); }
    createGain() { return this.node(); }
    async resume() {}
    async close() { this.state = 'closed'; }
  }
  const frames = [], states = [], errors = [], timers = [];
  const capture = createTabCapture({ mediaDevices: { getDisplayMedia }, AudioContextImpl: Context,
    audioUtils, onAudio: (...a) => frames.push(a), onState: s => states.push(s), onError: e => errors.push(e),
    schedule: f => { timers.push(f); return f; }, cancel: f => timers.splice(timers.indexOf(f),1) });
  return { capture, nodes, frames, states, errors, timers };
}
test('captura áudio PCM, mostra pico atual e libera todas as faixas', async () => {
  const a = new Track('audio'), v = new Track('video'); let options;
  const h = harness(async o => { options = o; return stream([a,v]); });
  assert.equal(await h.capture.start(), true);
  assert.equal(options.audio.suppressLocalAudioPlayback, false);
  const processor = h.nodes[1];
  for (let i=0;i<8;i++) processor.onaudioprocess({ inputBuffer: {getChannelData: () => new Float32Array(4096).fill(0.2)} });
  h.timers[0]();
  assert.ok(h.frames.length > 0);
  assert.ok(h.states.at(-1).peak > 0);
  assert.equal(h.states.at(-1).captureMode, 'tab');
  h.timers[0](); assert.equal(h.states.at(-1).peak, 0);
  h.capture.stop();
  assert.ok(a.stopped && v.stopped);
  assert.equal(processor.onaudioprocess, null);
  assert.equal(h.timers.length, 0);
});
test('seleção sem áudio falha e libera o vídeo', async () => {
  const v = new Track('video'); const h = harness(async () => stream([v]));
  await assert.rejects(h.capture.start(), /Compartilhar áudio/); assert.ok(v.stopped);
});
test('tela inteira não é aceita como captura da reunião', async () => {
  const a = new Track('audio'), v = new Track('video'); v.surface='monitor';
  const h = harness(async () => stream([a,v]));
  await assert.rejects(h.capture.start(), /Escolha uma aba/); assert.ok(a.stopped && v.stopped);
});
test('cancelamento do seletor informa como tentar novamente', async () => {
  const h = harness(async () => { throw new DOMException('cancel', 'NotAllowedError'); });
  await assert.rejects(h.capture.start(), /Captura cancelada/);
});
test('desligar enquanto o seletor está aberto impede início atrasado', async () => {
  let resolve; const h = harness(() => new Promise(r => resolve=r));
  const pending=h.capture.start(); h.capture.stop();
  const a = new Track('audio'), v = new Track('video'); resolve(stream([a,v]));
  assert.equal(await pending, false); assert.ok(a.stopped && v.stopped); assert.equal(h.nodes.length,0);
});
test('encerrar compartilhamento interrompe captura e avisa o painel', async () => {
  const a = new Track('audio'), v = new Track('video'); const h = harness(async () => stream([a,v]));
  await h.capture.start(); v.dispatchEvent(new Event('ended'));
  assert.equal(h.errors.length,1); assert.ok(a.stopped); assert.equal(h.timers.length,0);
});

test('áudio muito baixo é enviado sem ser descartado pelo detector de fala',async()=>{
 const a=new Track('audio'),v=new Track('video');v.label='Chamada Teams';const h=harness(async()=>stream([a,v]));await h.capture.start();
 const input=Float32Array.from({length:4096},(_,i)=>Math.sin(i*.15)*.0003);
 for(let i=0;i<5;i++)h.nodes[1].onaudioprocess({inputBuffer:{getChannelData:()=>input}});
 h.timers[0]();assert.ok(h.frames.length>0);assert.ok(h.frames.every(([,speech])=>speech===false));
 const decoded=audioUtils.base64ToFloat32(h.frames[0][0]);assert.ok(decoded.some(v=>v!==0));assert.ok(h.states.at(-1).signalDb < -60);assert.equal(h.states.at(-1).sourceLabel,'Chamada Teams');h.capture.stop();
});
test('silêncio também produz PCM, mas não é classificado como fala',async()=>{
 const h=harness(async()=>stream([new Track('audio'),new Track('video')]));await h.capture.start();
 for(let i=0;i<3;i++)h.nodes[1].onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(4096)}});
 assert.ok(h.frames.length>0);assert.ok(h.frames.every(([,speech])=>speech===false));h.capture.stop();
});
test('modo computador solicita áudio do sistema e exige tela inteira com áudio',async()=>{
 const a=new Track('audio'),v=new Track('video');v.surface='monitor';let options;const h=harness(async o=>{options=o;return stream([a,v]);});
 assert.equal(await h.capture.start({mode:'system'}),true);assert.equal(options.systemAudio,'include');assert.equal(options.preferCurrentTab,false);assert.equal(h.states[0].captureMode,'system');h.capture.stop();
 const missing=harness(async()=>stream([v]));await assert.rejects(missing.capture.start({mode:'system'}),/áudio do sistema/);
});

const { inspectPageAudio } = require('../src/capture.js');
test('resume a mídia da página e as saídas de áudio próprias', () => {
  const doc = { querySelectorAll: () => [
    { paused: false, srcObject: {}, sinkId: '' },
    { paused: false, srcObject: {}, sinkId: 'alto-falante-2' },
    { paused: true, srcObject: null, currentSrc: '', sinkId: 'default' },
  ] };
  assert.deepEqual(inspectPageAudio(doc), { pageMedia: 3, pagePlaying: 2, pageOtherOutput: 1 });
  assert.equal(inspectPageAudio(undefined), null);
});
