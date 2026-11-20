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

// —— 真实录音采样（VSCO-2 CE，CC0）——
const VS_BASE = new URL('../samples/', import.meta.url).href;
let manifestP = null;
const vsBuf = {}; // inst -> Map(sampleMidi -> AudioBuffer)
const vsLoading = {};
function manifest() {
  manifestP ||= fetch(VS_BASE + 'manifest.json').then(r => r.json());
  return manifestP;
}
function nearest(list, p) {
  let best = list[0];
  for (const m of list) if (Math.abs(m - p) < Math.abs(best - p)) best = m;
  return best;
}
async function loadVs(inst, sampleMidis) {
  const store = (vsBuf[inst] ||= new Map());
  await Promise.all(sampleMidis.map(m => {
    const key = inst + ':' + m;
    if (store.has(m)) return null;
    vsLoading[key] ||= fetch(VS_BASE + inst + '/' + Math.round(m) + '.m4a')
      .then(r => { if (!r.ok) throw new Error('采样下载失败 ' + key); return r.arrayBuffer(); })
      .then(b => decodeCtx.decodeAudioData(b))
      .then(buf => { store.set(m, buf); });
    return vsLoading[key];
  }));
}
// 找到某个音高对应的采样及播放速率
function vsSample(part, p, short) {
  const inst = short && part.vs === 'vln' && vsBuf.vlnspic ? 'vlnspic' : part.vs;
  const store = vsBuf[inst];
  if (!store || !store.size) return null;
  const m = nearest([...store.keys()], p);
  return { buf: store.get(m), rate: Math.pow(2, (p - m) / 12) };
}

// —— 音乐厅混响：频率相关衰减 + 早期反射 ——
const irCache = {};
async function hallIR(sr) {
  if (irCache[sr]) return irCache[sr];
  const sec = 3.4, len = Math.floor(sr * sec);
  const oc = new OfflineAudioContext(2, len, sr);
  const nb = oc.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = nb.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = t < 0.022 ? 0 : Math.exp(-6.9 * (t - 0.022) / 2.3) * Math.min(1, (t - 0.022) / 0.03);
      d[i] = (Math.random() * 2 - 1) * env * 0.6;
    }
    // 早期反射
    [[0.011, 0.55], [0.019, 0.42], [0.027, 0.36], [0.041, 0.3], [0.053, 0.24], [0.067, 0.2], [0.083, 0.16]].forEach(([t, g], k) => {
      const i = Math.floor((t + (c ? 0.0017 * (k % 3) : 0.0011 * (k % 2))) * sr);
      d[i] += (k % 2 ? -g : g);
    });
  }
  const src = oc.createBufferSource(); src.buffer = nb;
  const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(9000, 0);
  lp.frequency.exponentialRampToValueAtTime(2500, 0.6);
  lp.frequency.exponentialRampToValueAtTime(700, sec);
  const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
  src.connect(lp).connect(hp).connect(oc.destination); src.start();
  irCache[sr] = await oc.startRendering();
  return irCache[sr];
}

// 加载编配中用到的所有音色与音高
export async function prepare(arr, onProgress, sampleRates = [44100]) {
  decodeCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  await Promise.all([...new Set([...sampleRates, decodeCtx.sampleRate])].map(hallIR));
  const man = await manifest();
  const vsJobs = {};
  for (const part of arr.parts) {
    if (!part.vs || !man[part.vs]) continue;
    for (const n of part.notes) {
      (vsJobs[part.vs] ||= new Set()).add(nearest(man[part.vs], n.p));
      if (part.vs === 'vln' && man.vlnspic) (vsJobs.vlnspic ||= new Set()).add(nearest(man.vlnspic, n.p));
    }
  }
  const vsList = Object.entries(vsJobs);
  let vsDone = 0;
  await Promise.all(vsList.map(async ([inst, set]) => {
    await loadVs(inst, [...set]);
    vsDone++; onProgress && onProgress(vsDone / (vsList.length + 1), inst);
  }));
  const jobs = [];
  for (const part of arr.parts) {
    if (part.drum || part.vs) continue;
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
  const conv = ctx.createConvolver(); conv.buffer = irCache[ctx.sampleRate] || makeImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = (arr.reverb ?? 0.25) * 1.25;
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
  let dur = Math.max(0.05, n.d * spb);
  let buf, rate = 1, real = false;
  if (part.vs) {
    const smp = vsSample(part, n.p, dur < 0.3 && !n.m);
    if (!smp) return;
    buf = smp.buf; rate = smp.rate; real = true;
  } else {
    buf = buffers[part.gm] && buffers[part.gm].get(n.p);
    if (!buf) return;
  }
  // 人性化：非音型声部的起音有轻微前后偏差，力度轻微浮动
  const human = real && !n.f && part.id !== 'piano';
  if (human) t += (Math.random() - 0.5) * 0.018;
  let v = n.v * (1 + (Math.random() - 0.5) * (real ? 0.08 : 0));
  const att = real ? (n.m && part.sus ? 0.12 : 0.012) : (part.att ?? 0.01);
  const rel = real ? (part.sus ? 0.35 : part.rel ?? 0.6) : (part.rel ?? 0.25);
  const vol = Math.pow(v, 1.4) * (real ? 0.9 : 1);
  // 力度越弱音色越暗（真实乐器的弱奏特征）
  let dest = out;
  if (real && part.sus) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
    lp.frequency.value = 1100 + 15000 * v * v;
    lp.connect(out); dest = lp;
  }
  let swell = real && part.sus && n.m && dur > 0.9; // 长音的自然起伏
  const bufDur = buf.duration / rate;
  const seg = (start, offset, len, fadeIn, fadeOut, level) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    if (swell) {
      g.gain.linearRampToValueAtTime(level * 0.78, start + fadeIn);
      g.gain.linearRampToValueAtTime(level, start + Math.max(fadeIn + 0.01, len * 0.45));
      g.gain.linearRampToValueAtTime(level * 0.82, start + Math.max(fadeIn + 0.02, len));
    } else {
      g.gain.linearRampToValueAtTime(level, start + fadeIn);
      g.gain.setValueAtTime(level, start + Math.max(fadeIn, len));
    }
    g.gain.linearRampToValueAtTime(0, start + len + fadeOut);
    s.connect(g).connect(dest);
    s.start(start, offset); s.stop(start + len + fadeOut + 0.05);
    srcs.push(s);
  };
  if (real) {
    // 真实采样已带 0.7s 淡出尾部；长音用交叉淡入的分段延长
    const maxLen = bufDur - 0.9;
    if (!part.sus || dur + rel <= maxLen) {
      const len = Math.min(dur, maxLen);
      seg(t, 0, len, att, part.sus ? rel : Math.max(0.1, Math.min(rel, bufDur - len - 0.05)), vol);
      return;
    }
    swell = false;
    const X = 0.45, off = 1.0, segLen = Math.max(0.8, maxLen - off / rate - X);
    let start = t, first = true, remain = dur;
    while (remain > 0) {
      const len = Math.min(remain, first ? maxLen - X : segLen);
      const last = remain <= len + 1e-6;
      seg(start, first ? 0 : off, len, first ? att : X, last ? rel : X, vol);
      start += len; remain -= len; first = false;
    }
    return;
  }
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
