// 配器引擎：把钢琴音符拆成 旋律 / 和声 / 低音 / 音型，按段落强度分配给乐器

const FAM_COLOR = {
  ww: '#7fd1b9', br: '#f2b45a', perc: '#e06c75', pl: '#c792ea',
  str: '#6cb6ff', key: '#f5e6a8', band: '#ff8fab', gtr: '#ffb86b', drum: '#e06c75',
};

// tr = 记谱音高 - 实际音高（半音）；tf = 调号五度圈偏移
export const INSTR = {
  flute:    { name: '长笛', en: 'Flute', gm: 'flute', prog: 73, fam: 'ww', range: [60, 96], clef: 'G', gain: 0.75, att: 0.06, rel: 0.25, sus: true, pan: -0.05 },
  oboe:     { name: '双簧管', en: 'Oboe', gm: 'oboe', prog: 68, fam: 'ww', range: [58, 91], clef: 'G', gain: 0.65, att: 0.05, rel: 0.2, sus: true, pan: 0.05 },
  clarinet: { name: '单簧管 (B♭)', en: 'Clarinet in B♭', gm: 'clarinet', prog: 71, fam: 'ww', range: [50, 89], clef: 'G', tr: 2, tf: 2, diat: -1, gain: 0.6, att: 0.06, rel: 0.25, sus: true, pan: -0.1 },
  bassoon:  { name: '大管', en: 'Bassoon', gm: 'bassoon', prog: 70, fam: 'ww', range: [34, 72], clef: 'F', gain: 0.6, att: 0.05, rel: 0.25, sus: true, pan: 0.1 },
  horn1:    { name: '圆号 I (F)', en: 'Horn in F I', gm: 'french_horn', prog: 60, fam: 'br', range: [41, 77], clef: 'G', tr: 7, tf: 1, diat: -4, gain: 0.5, att: 0.1, rel: 0.35, sus: true, pan: -0.35 },
  horn2:    { name: '圆号 II (F)', en: 'Horn in F II', gm: 'french_horn', prog: 60, fam: 'br', range: [41, 74], clef: 'G', tr: 7, tf: 1, diat: -4, gain: 0.45, att: 0.1, rel: 0.35, sus: true, pan: -0.3 },
  trumpet:  { name: '小号 (B♭)', en: 'Trumpet in B♭', gm: 'trumpet', prog: 56, fam: 'br', range: [55, 82], clef: 'G', tr: 2, tf: 2, diat: -1, gain: 0.45, att: 0.03, rel: 0.25, sus: true, pan: 0.25 },
  trombone: { name: '长号', en: 'Trombone', gm: 'trombone', prog: 57, fam: 'br', range: [40, 72], clef: 'F', gain: 0.45, att: 0.05, rel: 0.3, sus: true, pan: 0.35 },
  tuba:     { name: '大号', en: 'Tuba', gm: 'tuba', prog: 58, fam: 'br', range: [28, 58], clef: 'F', gain: 0.5, att: 0.05, rel: 0.3, sus: true, pan: 0.4 },
  timpani:  { name: '定音鼓', en: 'Timpani', gm: 'timpani', prog: 47, fam: 'perc', range: [41, 57], clef: 'F', gain: 0.85, att: 0.002, rel: 1.2, pan: 0 },
  harp:     { name: '竖琴', en: 'Harp', gm: 'orchestral_harp', prog: 46, fam: 'pl', range: [24, 103], staves: 2, gain: 0.7, att: 0.002, rel: 1.0, pan: -0.55 },
  vln1:     { name: '第一小提琴', en: 'Violin I', gm: 'violin', prog: 40, fam: 'str', range: [55, 100], clef: 'G', gain: 0.6, att: 0.08, rel: 0.3, sus: true, pan: -0.5 },
  vln2:     { name: '第二小提琴', en: 'Violin II', gm: 'violin', prog: 40, fam: 'str', range: [55, 96], clef: 'G', gain: 0.5, att: 0.06, rel: 0.25, sus: true, pan: -0.25 },
  viola:    { name: '中提琴', en: 'Viola', gm: 'viola', prog: 41, fam: 'str', range: [48, 86], clef: 'C', gain: 0.55, att: 0.08, rel: 0.3, sus: true, pan: 0.15 },
  cello:    { name: '大提琴', en: 'Violoncello', gm: 'cello', prog: 42, fam: 'str', range: [36, 76], clef: 'F', gain: 0.65, att: 0.08, rel: 0.3, sus: true, pan: 0.35 },
  cbass:    { name: '低音提琴', en: 'Contrabass', gm: 'contrabass', prog: 43, fam: 'str', range: [28, 60], clef: 'F', tr: 12, octOnly: true, gain: 0.6, att: 0.08, rel: 0.3, sus: true, pan: 0.5 },
  piano:    { name: '钢琴', en: 'Piano', gm: 'acoustic_grand_piano', prog: 0, fam: 'key', range: [21, 108], staves: 2, gain: 0.85, att: 0.002, rel: 0.5, pan: 0 },
  epiano:   { name: '电钢琴', en: 'Electric Piano', gm: 'electric_piano_1', prog: 4, fam: 'key', range: [28, 96], staves: 2, gain: 0.7, att: 0.003, rel: 0.4, pan: -0.2 },
  ebass:    { name: '电贝斯', en: 'Bass Guitar', gm: 'electric_bass_finger', prog: 33, fam: 'band', range: [28, 60], clef: 'F', tr: 12, octOnly: true, gain: 0.8, att: 0.005, rel: 0.12, pan: 0 },
  jguitar:  { name: '清音吉他', en: 'Clean Guitar', gm: 'electric_guitar_jazz', prog: 26, fam: 'gtr', range: [52, 84], clef: 'G', tr: 12, octOnly: true, gain: 0.7, att: 0.005, rel: 0.3, pan: 0.3 },
  lguitar:  { name: '主音吉他', en: 'Lead Guitar', gm: 'overdriven_guitar', prog: 29, fam: 'gtr', range: [55, 88], clef: 'G', tr: 12, octOnly: true, gain: 0.45, att: 0.01, rel: 0.25, sus: true, pan: 0.2 },
  pguitar:  { name: '节奏吉他', en: 'Rhythm Guitar', gm: 'distortion_guitar', prog: 30, fam: 'gtr', range: [40, 64], clef: 'G', tr: 12, octOnly: true, gain: 0.35, att: 0.005, rel: 0.08, pan: -0.45 },
  strpad:   { name: '弦乐铺底', en: 'String Pad', gm: 'string_ensemble_1', prog: 48, fam: 'str', range: [43, 88], staves: 2, gain: 0.45, att: 0.25, rel: 0.6, sus: true, pan: 0.1 },
  drums:    { name: '架子鼓', en: 'Drum Kit', drum: true, prog: 0, fam: 'drum', gain: 0.8, pan: 0 },
};
for (const k in INSTR) INSTR[k].color = FAM_COLOR[INSTR[k].fam];

// 每个乐器在 4 个强度等级 (0 pp → 3 ff) 下的角色
export const ENSEMBLES = {
  full: {
    name: '大编制交响乐团', short: '大编制', reverb: 0.32,
    desc: '双管编制木管 + 圆号/小号/长号/大号 + 定音鼓 + 竖琴 + 弦乐五部',
    parts: [
      ['flute',    ['mel', null, 'melUp', 'melUp']],
      ['oboe',     [null, 'mel', 'mel', 'mel']],
      ['clarinet', ['padTop', 'padTop', 'padTop', 'padMid']],
      ['bassoon',  [null, 'bass', 'bass', 'bass']],
      ['horn1',    [null, 'padMid', 'padMid', 'padTop']],
      ['horn2',    [null, null, 'padLow', 'padLow']],
      ['trumpet',  [null, null, null, 'mel']],
      ['trombone', [null, null, null, 'padLow']],
      ['tuba',     [null, null, null, 'bassDown']],
      ['timpani',  [null, null, 'timpHit', 'timpRoll']],
      ['harp',     ['fig', 'fig', 'fig', 'fig']],
      ['vln1',     [null, 'padTop', 'mel', 'mel']],
      ['vln2',     ['padTop', 'figHi', 'figHi', 'figHi']],
      ['viola',    ['padMid', 'padMid', 'padMid', 'padMid']],
      ['cello',    ['bass', 'bass', 'bass', 'bass']],
      ['cbass',    [null, 'bassDown', 'bassDown', 'bassDown']],
    ],
  },
  chamber: {
    name: '小编制室内乐团', short: '小编制', reverb: 0.24,
    desc: '长笛、单簧管、圆号、竖琴 + 弦乐四重奏',
    parts: [
      ['flute',    ['mel', null, 'melUp', 'melUp']],
      ['clarinet', ['padTop', 'mel', 'padTop', 'padTop']],
      ['horn1',    [null, 'padMid', 'padMid', 'padMid']],
      ['harp',     ['fig', 'fig', 'fig', 'fig']],
      ['vln1',     [null, 'padTop', 'mel', 'mel']],
      ['vln2',     ['padMid', 'figHi', 'figHi', 'figHi']],
      ['viola',    ['padLow', 'padMid', 'padLow', 'padLow']],
      ['cello',    ['bass', 'bass', 'bass', 'bass']],
    ],
  },
  band: {
    name: '流行乐队', short: '乐队', reverb: 0.16,
    desc: '架子鼓、电贝斯、电钢琴、清音/主音/节奏吉他 + 弦乐铺底',
    parts: [
      ['lguitar',  [null, null, 'mel', 'melUp']],
      ['jguitar',  ['mel', 'mel', null, null]],
      ['epiano',   ['fig', 'fig', 'fig', 'fig']],
      ['pguitar',  [null, null, 'power', 'power8']],
      ['strpad',   [null, 'pad3', 'pad3', 'pad3']],
      ['ebass',    ['bass', 'bass', 'bass8', 'bass8']],
      ['drums',    [null, 'drums1', 'drums2', 'drums3']],
    ],
  },
};

export const LEVEL_NAMES = ['pp', 'mp', 'mf', 'ff'];
const LEVEL_VEL = [0.45, 0.6, 0.78, 0.95];
const ROLE_W = { mel: 1, melUp: 0.95, fig: 0.85, figHi: 0.75, padTop: 0.72, padMid: 0.72, padLow: 0.72, pad3: 0.65, bass: 0.85, bassDown: 0.85, bass8: 0.85, timpHit: 0.9, timpRoll: 0.8, power: 0.8, power8: 0.85 };

export function fitRange(p, [lo, hi]) {
  while (p < lo) p += 12;
  while (p > hi) p -= 12;
  return p;
}

const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

// —— 调性估计（Krumhansl-Schmuckler）——
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function detectKey(notes) {
  const h = new Array(12).fill(0);
  notes.forEach(n => h[n.p % 12] += n.d);
  let best = { score: -Infinity };
  for (let t = 0; t < 12; t++) for (const [prof, minor] of [[MAJ, false], [MIN, true]]) {
    let sc = 0; for (let i = 0; i < 12; i++) sc += h[(t + i) % 12] * prof[i];
    if (sc > best.score) best = { score: sc, tonic: t, minor };
  }
  const majTonic = best.minor ? (best.tonic + 3) % 12 : best.tonic;
  let fifths = (majTonic * 7) % 12; if (fifths > 6) fifths -= 12;
  return { tonic: best.tonic, minor: best.minor, fifths };
}

// —— 分析：窗口、旋律、低音、和声、强度 ——
export function analyze(piece) {
  const [num, den] = piece.timeSig;
  const barLen = num * 4 / den;
  const W = (num % 2 === 0 && barLen >= 2) ? barLen / 2 : barLen;
  const notes = [...piece.notes].sort((a, b) => a.s - b.s || a.p - b.p);
  const total = Math.max(...notes.map(n => n.s + n.d));
  const nBars = Math.ceil(total / barLen - 1e-6);
  const nWin = Math.round(nBars * barLen / W);
  const key = detectKey(notes);

  // 按起点分组的“天际线”
  const groups = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.s - n.s) < 1e-3) g.ns.push(n); else groups.push({ s: n.s, ns: [n] });
  }
  const skyTop = groups.map(g => g.ns.reduce((a, b) => (b.p > a.p ? b : a)));
  const skyBot = groups.map(g => g.ns.reduce((a, b) => (b.p < a.p ? b : a)));

  const wins = [];
  for (let i = 0; i < nWin; i++) {
    const w0 = i * W, w1 = w0 + W;
    const sounding = notes.filter(n => n.s < w1 - 1e-6 && n.s + n.d > w0 + 1e-6);
    const onsets = notes.filter(n => n.s >= w0 - 1e-6 && n.s < w1 - 1e-6);
    const ps = [...new Set(sounding.map(n => n.p))].sort((a, b) => a - b);
    const win = { i, w0, w1, bar: Math.floor(w0 / barLen + 1e-6), sounding, onsets, ps, empty: ps.length === 0 };
    if (!win.empty) {
      win.bass = ps[0]; win.top = ps[ps.length - 1];
      win.med = median(onsets.length ? onsets.map(n => n.p) : ps);
      let inner = ps.slice(1, -1);
      if (inner.length < 3) {
        const pcs = [...new Set(ps.map(p => p % 12))];
        for (const pc of pcs) for (let p = win.top - 1; p > win.bass; p--) {
          if (p % 12 === pc && !inner.includes(p)) { inner.push(p); break; }
        }
        inner = [...new Set(inner)].sort((a, b) => a - b);
      }
      if (!inner.length) inner = [win.top];
      win.pad = { padLow: inner[0], padMid: inner[Math.floor(inner.length / 2)], padTop: inner[inner.length - 1] };
      const vel = onsets.length ? onsets.reduce((a, n) => a + n.v, 0) / onsets.length : 0.5;
      const pcs = [...new Set(ps.map(p => p % 12))];
      let diss = 0;
      for (let a = 0; a < pcs.length; a++) for (let b = a + 1; b < pcs.length; b++) {
        const ic = Math.min((pcs[a] - pcs[b] + 12) % 12, (pcs[b] - pcs[a] + 12) % 12);
        if (ic === 1 || ic === 2 || ic === 6) diss++;
      }
      win.feat = { dens: onsets.length / W, vel, span: win.top - win.bass, low: -win.bass, diss };
    }
    // 旋律 / 低音线：音型密集时取窗口最高/最低音持续，否则保留原节奏
    for (const [key2, sky, pick] of [['mel', skyTop, 'top'], ['bassLine', skyBot, 'bass']]) {
      const inWin = sky.filter(n => n.s >= w0 - 1e-6 && n.s < w1 - 1e-6);
      if (win.empty) { win[key2] = []; continue; }
      if (inWin.length > W * 2.5) win[key2] = [{ p: win[pick], s: w0, d: W, v: 0.7, m: true }];
      else win[key2] = inWin.map(n => ({ ...n }));
    }
    wins.push(win);
  }
  // 旋律/低音连奏化
  for (const key2 of ['mel', 'bassLine']) {
    const all = wins.flatMap(w => w[key2]);
    for (let k = 0; k < all.length - 1; k++) {
      const gap = all[k + 1].s - all[k].s;
      if (gap > 0 && gap - all[k].d < 0.6) all[k].d = Math.min(gap, Math.max(all[k].d, gap));
    }
  }

  // —— 段落强度 → 每小节等级 ——
  const feats = ['dens', 'vel', 'span', 'low', 'diss'];
  const wts = { dens: 0.22, vel: 0.22, span: 0.12, low: 0.12, diss: 0.12 };
  const rng = {};
  feats.forEach(f => {
    const v = wins.filter(w => !w.empty).map(w => w.feat[f]);
    rng[f] = [Math.min(...v), Math.max(...v)];
  });
  const barScore = new Array(nBars).fill(0), barCnt = new Array(nBars).fill(0);
  wins.forEach(w => {
    if (w.empty) return;
    let s = 0;
    feats.forEach(f => {
      const [a, b] = rng[f];
      s += wts[f] * (b - a < 1e-9 ? 0.5 : (w.feat[f] - a) / (b - a));
    });
    barScore[w.bar] += s; barCnt[w.bar]++;
  });
  let sc = barScore.map((s, i) => (barCnt[i] ? s / barCnt[i] : 0));
  sc = sc.map((s, i) => {
    const x = (i + 0.5) / nBars;
    const arc = x < 0.75 ? Math.pow(x / 0.75, 1.2) : 1 - ((x - 0.75) / 0.25) * 0.55;
    return s + 0.2 * arc;
  });
  // 平滑
  sc = sc.map((s, i) => {
    let t = 0, c = 0;
    for (let k = -2; k <= 2; k++) if (sc[i + k] !== undefined) { const w = 3 - Math.abs(k); t += sc[i + k] * w; c += w; }
    return t / c;
  });
  const sorted = [...sc].sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const th = [q(0.3), q(0.6), q(0.85)];
  let levels = sc.map(s => (s >= th[2] ? 3 : s >= th[1] ? 2 : s >= th[0] ? 1 : 0));
  // 去掉孤立的单小节变化，并保证开头柔和、结尾庄严
  for (let i = 1; i < levels.length - 1; i++)
    if (levels[i - 1] === levels[i + 1] && levels[i] !== levels[i - 1]) levels[i] = levels[i - 1];
  if (nBars > 4) { levels[0] = 0; levels[1] = Math.min(levels[1], 0); }
  if (nBars > 2) levels[nBars - 1] = Math.max(levels[nBars - 1], 2);

  return { piece, notes, barLen, W, total, nBars, wins, key, levels };
}

// —— 生成某个角色在某个窗口里的音符 ——
function roleNotes(role, w, A, lvl) {
  if (w.empty || !role) return [];
  const v0 = LEVEL_VEL[lvl] * (ROLE_W[role] || 0.8);
  const hold = p => [{ p, s: w.w0, d: A.W, v: v0, m: true }];
  const isBarStart = Math.abs(w.w0 / A.barLen - w.bar) < 1e-6;
  switch (role) {
    case 'mel': return w.mel.map(n => ({ ...n, v: v0 }));
    case 'melUp': return w.mel.map(n => ({ ...n, p: n.p + 12, v: v0 }));
    case 'fig': return w.onsets.map(n => ({ p: n.p, s: n.s, d: n.d, v: Math.min(1, n.v * LEVEL_VEL[lvl] * 1.4) }));
    case 'figHi': return w.onsets.filter(n => n.p >= w.med).map(n => ({ p: n.p, s: n.s, d: n.d, v: v0 }));
    case 'padTop': case 'padMid': case 'padLow': return hold(w.pad[role]);
    case 'pad3': return [...new Set([w.pad.padLow, w.pad.padMid, w.pad.padTop])].map(p => hold(p)[0]);
    case 'bass': return w.bassLine.map(n => ({ ...n, v: v0 }));
    case 'bassDown': return w.bassLine.map(n => ({ ...n, p: n.p - 12, v: v0 }));
    case 'bass8': {
      const out = [];
      for (let t = w.w0; t < w.w1 - 1e-6; t += 0.5) out.push({ p: w.bass, s: t, d: 0.45, v: v0 * (t === w.w0 ? 1 : 0.85) });
      return out;
    }
    case 'timpHit': case 'timpRoll': {
      const T = A.key.minor ? A.key.tonic : A.key.tonic, D = (T + 7) % 12;
      const pc = w.bass % 12;
      if (pc !== T && pc !== D) return [];
      if (role === 'timpHit' && !isBarStart) return [];
      const out = [];
      const step = role === 'timpRoll' ? 1 : A.W;
      for (let t = w.w0; t < w.w1 - 1e-6; t += step) out.push({ p: pc + 36, s: t, d: Math.min(step, 1), v: v0 * (t === w.w0 ? 1 : 0.75) });
      return out;
    }
    case 'power': case 'power8': {
      const r = w.bass % 12 + 36;
      const chord = [r, r + 7, r + 12];
      if (role === 'power') return chord.map(p => ({ p, s: w.w0, d: A.W, v: v0, m: true }));
      const out = [];
      for (let t = w.w0; t < w.w1 - 1e-6; t += 0.5) chord.forEach(p => out.push({ p, s: t, d: 0.4, v: v0 * (t === w.w0 ? 1 : 0.8) }));
      return out;
    }
    case 'drums1': case 'drums2': case 'drums3': return drumPattern(role, w, A, v0);
  }
  return [];
}

// 鼓：36 底鼓 38 军鼓 42 闭镲 46 开镲 49 吊镲
function drumPattern(role, w, A, v) {
  const out = [];
  const add = (p, t, vv) => out.push({ p, s: t, d: 0.25, v: vv });
  const barStart = w.bar * A.barLen;
  for (let t = w.w0; t < w.w1 - 1e-6; t += 0.5) {
    const beat = t - barStart; // 小节内第几拍(四分)
    const onBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
    const bi = Math.round(beat);
    if (role === 'drums1') {
      add(42, t, v * (onBeat ? 0.55 : 0.35));
      if (beat < 1e-6) add(36, t, v * 0.8);
    } else {
      add(42, t, v * (onBeat ? 0.6 : 0.4));
      if (role === 'drums3') add(42, t + 0.25, v * 0.3);
      if (onBeat && bi % 2 === 0) add(36, t, v * 0.95);
      if (!onBeat && bi % 2 === 1 && role === 'drums3') add(36, t, v * 0.6);
      if (onBeat && bi % 2 === 1) add(38, t, v * 0.9);
    }
  }
  return out;
}

function mergeHeld(notes, barLen) {
  notes.sort((a, b) => a.s - b.s || a.p - b.p);
  const out = [];
  const open = new Map();
  for (const n of notes) {
    const prev = open.get(n.p);
    if (prev && n.m && prev.m && Math.abs(prev.s + prev.d - n.s) < 1e-6 &&
        Math.floor(prev.s / barLen + 1e-6) === Math.floor(n.s / barLen + 1e-6)) {
      prev.d += n.d;
      continue;
    }
    out.push(n); open.set(n.p, n);
  }
  return out;
}

// —— 主入口 ——
export function arrange(A, ensembleId) {
  if (ensembleId === 'piano') {
    return {
      id: 'piano', name: '钢琴原曲', reverb: 0.18,
      parts: [{ id: 'piano', ...INSTR.piano, roles: null, notes: A.notes.map(n => ({ ...n })) }],
    };
  }
  const E = ENSEMBLES[ensembleId];
  const parts = E.parts.map(([id, roles]) => {
    const ins = INSTR[id];
    let notes = [];
    for (const w of A.wins) {
      const lvl = A.levels[w.bar];
      notes.push(...roleNotes(roles[lvl], w, A, lvl));
    }
    if (!ins.drum) notes.forEach(n => { n.p = fitRange(n.p, ins.range); });
    // 结尾强化：最后一小节的长音
    notes = mergeHeld(notes, A.barLen);
    // 去重（同一时刻同音高）
    const seen = new Set();
    notes = notes.filter(n => { const k = n.p + ':' + n.s.toFixed(3); if (seen.has(k)) return false; seen.add(k); return true; });
    return { id, ...ins, roles, notes };
  });
  return { id: ensembleId, name: E.name, reverb: E.reverb, parts };
}

// —— 配器说明（中文）——
const ROLE_CAT = { mel: '主旋律', melUp: '主旋律', fig: '琶音音型', figHi: '琶音音型', padTop: '持续和声', padMid: '持续和声', padLow: '持续和声', pad3: '持续和声', bass: '低音', bassDown: '低音', bass8: '低音', timpHit: '节奏/打击', timpRoll: '节奏/打击', power: '节奏/打击', power8: '节奏/打击', drums1: '节奏/打击', drums2: '节奏/打击', drums3: '节奏/打击' };
export function describe(A, ensembleId) {
  const E = ENSEMBLES[ensembleId];
  if (!E) return [];
  const runs = [];
  A.levels.forEach((l, i) => {
    const r = runs[runs.length - 1];
    if (r && r.level === l) r.to = i; else runs.push({ level: l, from: i, to: i });
  });
  return runs.map(r => {
    const cats = {};
    E.parts.forEach(([id, roles]) => {
      const role = roles[r.level];
      if (!role) return;
      (cats[ROLE_CAT[role]] ||= []).push(INSTR[id].name);
    });
    return { ...r, dyn: LEVEL_NAMES[r.level], cats };
  });
}
