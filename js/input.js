// 输入：MIDI / MusicXML(.xml .musicxml .mxl) / 录音(AI 转写，Spotify basic-pitch)；以及 MIDI 导出

export async function fromMidi(file) {
  const midi = new window.Midi(await file.arrayBuffer());
  const ppq = midi.header.ppq;
  const bpm = Math.round(midi.header.tempos[0]?.bpm || 100);
  const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
  const notes = [];
  midi.tracks.forEach(tr => {
    if (tr.channel === 9 || tr.instrument?.percussion) return;
    tr.notes.forEach(n => notes.push({ p: n.midi, s: n.ticks / ppq, d: Math.max(0.0625, n.durationTicks / ppq), v: n.velocity }));
  });
  if (!notes.length) throw new Error('MIDI 文件里没有找到音符');
  return { title: midi.name || file.name.replace(/\.[^.]+$/, ''), composer: '', bpm, timeSig: ts, notes: trimStart(notes) };
}

function trimStart(notes) {
  // 若开头空了整小节以上则不处理（保持小节对齐），这里只保证非负
  return notes.filter(n => n.s >= 0);
}

export async function fromMusicXmlFile(file) {
  let text;
  if (/\.mxl$/i.test(file.name)) {
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const container = await zip.file('META-INF/container.xml')?.async('string');
    let path = container && /full-path="([^"]+)"/.exec(container)?.[1];
    if (!path) path = Object.keys(zip.files).find(f => /\.(xml|musicxml)$/i.test(f) && !f.startsWith('META-INF'));
    text = await zip.file(path).async('string');
  } else text = await file.text();
  return fromMusicXml(text, file.name);
}

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function fromMusicXml(text, fname = '') {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML 解析失败');
  const title = doc.querySelector('work-title')?.textContent || doc.querySelector('movement-title')?.textContent || fname.replace(/\.[^.]+$/, '');
  const composer = doc.querySelector('creator[type="composer"]')?.textContent || '';
  let bpm = null, timeSig = null;
  const notes = [];
  doc.querySelectorAll('part').forEach(part => {
    let div = 1, measureStart = 0, pos = 0, lastStart = 0, measureLen = 4;
    const openTies = new Map();
    part.querySelectorAll(':scope > measure').forEach(m => {
      let maxPos = 0;
      for (const el of m.children) {
        const tag = el.tagName;
        if (tag === 'attributes') {
          const d = el.querySelector('divisions'); if (d) div = +d.textContent;
          const t = el.querySelector('time');
          if (t) {
            const ts = [+t.querySelector('beats').textContent, +t.querySelector('beat-type').textContent];
            timeSig ||= ts; measureLen = ts[0] * 4 / ts[1];
          }
        } else if (tag === 'direction' || tag === 'sound') {
          const snd = tag === 'sound' ? el : el.querySelector('sound');
          if (snd && snd.getAttribute('tempo') && !bpm) bpm = Math.round(+snd.getAttribute('tempo'));
          const pm = el.querySelector('per-minute'); if (pm && !bpm) bpm = Math.round(+pm.textContent);
        } else if (tag === 'backup') { pos -= +el.querySelector('duration').textContent / div; }
        else if (tag === 'forward') { pos += +el.querySelector('duration').textContent / div; maxPos = Math.max(maxPos, pos); }
        else if (tag === 'note') {
          if (el.querySelector('grace')) continue;
          const dur = +(el.querySelector(':scope > duration')?.textContent || 0) / div;
          const isChord = !!el.querySelector(':scope > chord');
          const start = isChord ? lastStart : pos;
          if (!isChord) { lastStart = pos; pos += dur; maxPos = Math.max(maxPos, pos); }
          const pitch = el.querySelector(':scope > pitch');
          if (!pitch || el.querySelector(':scope > rest')) continue;
          const p = (+pitch.querySelector('octave').textContent + 1) * 12 + STEP_PC[pitch.querySelector('step').textContent] + +(pitch.querySelector('alter')?.textContent || 0);
          const ties = [...el.querySelectorAll(':scope > tie')].map(t => t.getAttribute('type'));
          const abs = measureStart + start;
          if (ties.includes('stop') && openTies.has(p)) {
            const n = openTies.get(p); n.d = abs + dur - n.s;
            if (!ties.includes('start')) openTies.delete(p);
            continue;
          }
          const n = { p, s: abs, d: Math.max(dur, 0.0625), v: 0.6 };
          notes.push(n);
          if (ties.includes('start')) openTies.set(p, n);
        }
      }
      const len = Math.max(maxPos, m.getAttribute('implicit') === 'yes' ? maxPos : measureLen);
      measureStart += len || measureLen; pos = 0;
    });
  });
  if (!notes.length) throw new Error('MusicXML 里没有找到音符');
  return { title, composer, bpm: bpm || 90, timeSig: timeSig || [4, 4], notes };
}

// —— 录音转写（实验）——
export async function fromAudio(file, bpm, onProgress) {
  onProgress && onProgress(0.02, '加载 AI 转写模型…');
  const bp = await import('https://esm.sh/@spotify/basic-pitch@1.0.1');
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(await file.arrayBuffer());
  const maxSec = 300;
  const len = Math.min(decoded.duration, maxSec);
  const off = new OfflineAudioContext(1, Math.ceil(len * 22050), 22050);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const mono = await off.startRendering();
  const model = new bp.BasicPitch('https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json');
  const frames = [], onsets = [], contours = [];
  await model.evaluateModel(mono, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
    p => onProgress && onProgress(0.05 + p * 0.9, '正在识别音符…'));
  const ev = bp.noteFramesToTime(bp.addPitchBendsToNoteEvents(contours, bp.outputToNotesPoly(frames, onsets, 0.5, 0.3, 6)));
  const spb = 60 / bpm;
  const notes = ev.filter(e => e.durationSeconds > 0.05).map(e => ({
    p: e.pitchMidi, s: Math.round(e.startTimeSeconds / spb * 4) / 4,
    d: Math.max(0.25, Math.round(e.durationSeconds / spb * 4) / 4), v: Math.min(1, 0.3 + e.amplitude),
  }));
  if (!notes.length) throw new Error('没有识别出音符');
  const first = Math.floor(Math.min(...notes.map(n => n.s)));
  notes.forEach(n => n.s -= first);
  return { title: file.name.replace(/\.[^.]+$/, ''), composer: '（录音转写）', bpm, timeSig: [4, 4], notes };
}

// —— 导出多轨 MIDI ——
export function toMidi(arr, bpm, title) {
  const midi = new window.Midi();
  midi.header.setTempo(bpm);
  midi.header.name = title;
  const spb = 60 / bpm;
  let ch = 0;
  arr.parts.forEach(part => {
    const tr = midi.addTrack();
    tr.name = part.en || part.name;
    if (part.drum) tr.channel = 9;
    else { tr.channel = ch; ch = (ch + 1) % 16; if (ch === 9) ch = 10; tr.instrument.number = part.prog || 0; }
    part.notes.forEach(n => tr.addNote({ midi: n.p, time: n.s * spb, duration: n.d * spb, velocity: Math.min(1, n.v) }));
  });
  return new Blob([midi.toArray()], { type: 'audio/midi' });
}
