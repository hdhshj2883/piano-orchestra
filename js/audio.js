// 音频：FluidR3 GM 采样（gleitz/midi-js-soundfonts）+ 合成鼓 + 混响；实时播放与离线渲染 WAV

const SF_BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

const raw = {};      // gm -> Promise<Map(name -> base64)>
const buffers = {};  // gm -> Map(midi -> AudioBuffer)
let decodeCtx = null;

function loadRaw(gm) {
  if (!raw[gm]) raw[gm] = fetch(SF_BASE + gm + '-mp3.js').then(r => {
    if (!r.ok) throw new Error('音色下载失败: ' + gm);
    return r.text();
  }).then(t => {
    const m = new Map();
    const re = /"([A-G]b?\d)":\s*"data:audio\/mp3;base64,([^"]+)"/g;
    let x; while ((x = re.exec(t))) m.set(x[1], x[2]);
    return m;
  });
  return raw[gm];
}

function b64ToBuf(b64) {
  const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}

// 加载编配中用到的所有音色与音高
export async function prepare(arr, onProgress) {
  decodeCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  const jobs = [];
  for (const part of arr.parts) {
    if (part.drum) continue;
    const need = [...new Set(part.notes.map(n => n.p))];
    jobs.push({ gm: part.gm, need });
  }
  const byGm = {};
  jobs.forEach(j => { (byGm[j.gm] ||= new Set()); j.need.forEach(p => byGm[j.gm].add(p)); });
  const gms = Object.keys(byGm);
  let done = 0;
  await Promise.all(gms.map(async gm => {
    const m = await loadRaw(gm);
    const store = (buffers[gm] ||= new Map());
    await Promise.all([...byGm[gm]].map(async p => {
      if (store.has(p)) return;
      const q = Math.max(21, Math.min(108, p));
      const b64 = m.get(noteName(q));
      if (!b64) return;
      store.set(p, await decodeCtx.decodeAudioData(b64ToBuf(b64)));
    }));
    done++; onProgress && onProgress(done / gms.length, gm);
  }));
}

function makeImpulse(ctx, sec = 2.8, decay = 3.2) {
  const len = Math.floor(ctx.sampleRate * sec);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
    }
  }
  return ir;
}

let noiseCache = new WeakMap();
function noise(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, b);
  return b;
}

// 构建混音图：每个声部 → 声像 → 母线 → (干 + 混响) → 压缩 → 输出
export function buildGraph(ctx, arr, dests, mutes = {}) {
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  const bus = ctx.createGain();
  const nParts = arr.parts.length;
  bus.gain.value = 1.6 / Math.sqrt(Math.max(1, nParts / 2));
  const dry = ctx.createGain(); dry.gain.value = 1;
  const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = arr.reverb ?? 0.25;
  bus.connect(dry).connect(comp);
  bus.connect(conv).connect(wet).connect(comp);
  comp.connect(master);
  dests.forEach(d => master.connect(d));
  const partNodes = {};
  arr.parts.forEach(p => {
    const g = ctx.createGain(); g.gain.value = mutes[p.id] ? 0 : (p.gain ?? 0.7);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = p.pan || 0; g.connect(pan).connect(bus); } else g.connect(bus);
    partNodes[p.id] = g;
  });
  return { master, partNodes, sources: [] };
}

function playDrum(ctx, out, p, t, v, srcs) {
  const g = ctx.createGain(); g.connect(out);
  if (p === 36) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v * 1.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); o.start(t); o.stop(t + 0.5); srcs.push(o);
  } else if (p === 38) {
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190;
    const og = ctx.createGain(); og.gain.setValueAtTime(v * 0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.gain.setValueAtTime(v * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(hp).connect(g); o.connect(og).connect(out);
    n.start(t); n.stop(t + 0.25); o.start(t); o.stop(t + 0.15); srcs.push(n, o);
  } else {
    const open = p === 46, crash = p === 49;
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = crash ? 4500 : 7500;
    const len = crash ? 1.6 : open ? 0.35 : 0.06;
    g.gain.setValueAtTime(v * (crash ? 0.5 : 0.32), t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(hp).connect(g); n.start(t); n.stop(t + len + 0.02); srcs.push(n);
  }
}

// 调度一个音符；长音用交叉淡入的分段循环来延长采样
function playNote(ctx, part, out, n, t, spb, srcs) {
  if (part.drum) return playDrum(ctx, out, n.p, t, n.v, srcs);
  const buf = buffers[part.gm] && buffers[part.gm].get(n.p);
  if (!buf) return;
  const dur = Math.max(0.05, n.d * spb);
  const att = part.att ?? 0.01, rel = part.rel ?? 0.25;
  const vol = Math.pow(n.v, 1.4);
  const seg = (start, offset, len, fadeIn, fadeOut, level) => {
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(level, start + fadeIn);
    g.gain.setValueAtTime(level, start + Math.max(fadeIn, len));
    g.gain.linearRampToValueAtTime(0, start + len + fadeOut);
    s.connect(g).connect(out);
    s.start(start, offset); s.stop(start + len + fadeOut + 0.05);
    srcs.push(s);
  };
  const maxLen = buf.duration - 0.35;
  if (!part.sus || dur + rel <= maxLen) {
    const len = Math.min(dur, maxLen);
    seg(t, 0, len, att, Math.max(0.05, Math.min(rel, buf.duration - len)), vol);
    return;
  }
  // 分段：第一段从头播放，之后每段从 0.6s 处开始，相互交叉淡化 0.35s
  const X = 0.35, segLen = Math.max(0.8, maxLen - 0.6 - X);
  let start = t, first = true, remain = dur;
  while (remain > 0) {
    const offset = first ? 0 : 0.6;
    const len = Math.min(remain, first ? maxLen - X : segLen);
    const last = remain <= len + 1e-6;
    seg(start, offset, len, first ? att : X, last ? rel : X, vol);
    start += len; remain -= len; first = false;
  }
}

export function scheduleRange(ctx, arr, graph, fromBeat, toBeat, t0, startBeat, spb) {
  for (const part of arr.parts) {
    const out = graph.partNodes[part.id];
    for (const n of part.notes) {
      if (n.s < fromBeat - 1e-9 || n.s >= toBeat - 1e-9) continue;
      const t = t0 + (n.s - startBeat) * spb;
      if (t < ctx.currentTime - 0.01) continue;
      playNote(ctx, part, out, n, Math.max(t, ctx.currentTime), spb, graph.sources);
    }
  }
}

// —— 实时播放器 ——
export class Player {
  constructor() { this.ctx = null; this.playing = false; this.onEnd = null; }
  ensureCtx() {
    this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  play(arr, { bpm, startBeat = 0, endBeat, mutes = {}, extraDest = null }) {
    this.stop();
    const ctx = this.ensureCtx();
    const dests = [ctx.destination]; if (extraDest) dests.push(extraDest);
    const graph = buildGraph(ctx, arr, dests, mutes);
    const spb = 60 / bpm;
    const t0 = ctx.currentTime + 0.12;
    let sched = startBeat;
    const look = 1.2 / spb; // 提前量（拍）
    this.state = { arr, graph, spb, t0, startBeat, endBeat };
    this.playing = true;
    const tick = () => {
      const nowBeat = this.beat();
      const until = Math.min(endBeat + 0.01, nowBeat + look);
      if (until > sched) { scheduleRange(ctx, arr, graph, sched, until, t0, startBeat, spb); sched = until; }
      if (nowBeat > endBeat + 2.5 / spb) { this.stop(); this.onEnd && this.onEnd(); }
    };
    tick();
    this.timer = setInterval(tick, 60);
  }
  beat() {
    if (!this.state) return 0;
    const { t0, startBeat, spb } = this.state;
    return startBeat + (this.ctx.currentTime - t0) / spb;
  }
  setMute(id, muted, gain) {
    if (this.state && this.state.graph.partNodes[id]) this.state.graph.partNodes[id].gain.setTargetAtTime(muted ? 0 : gain, this.ctx.currentTime, 0.03);
  }
  stop() {
    clearInterval(this.timer);
    if (this.state) {
      const { graph } = this.state;
      const now = this.ctx.currentTime;
      graph.master.gain.setTargetAtTime(0, now, 0.03);
      const srcs = graph.sources;
      setTimeout(() => { srcs.forEach(s => { try { s.stop(); } catch (e) {} }); graph.master.disconnect(); }, 200);
    }
    this.state = null; this.playing = false;
  }
}

// —— 离线渲染 WAV ——
export async function renderWav(arr, bpm, endBeat, mutes = {}, onProgress) {
  const spb = 60 / bpm;
  const sr = 44100;
  const len = Math.ceil((endBeat * spb + 3.5) * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const graph = buildGraph(ctx, arr, [ctx.destination], mutes);
  // OfflineAudioContext 的 currentTime 为 0，可一次性调度全部音符
  scheduleRange(ctx, arr, graph, -1, endBeat + 1, 0.05, 0, spb);
  onProgress && onProgress(0.5);
  const buf = await ctx.startRendering();
  onProgress && onProgress(1);
  return encodeWav(buf);
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  // 归一化到 -1 dBFS
  let peak = 0;
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const norm = peak > 0 ? 0.89 / peak : 1;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i] * norm));
    out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}
