// 总谱：把编配结果写成 MusicXML（移调乐器按记谱音高），供 OSMD 显示、MuseScore 打开

import { LEVEL_NAMES } from './engine.js';

const DIV = 4; // 每个四分音符 4 个单位（十六分音符网格）
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_TONIC = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };
// 相对主音的半音 → (音级, 相对大调音阶的变化)
const DEG = [[0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

export function spell(p, fifths) {
  const tn = MAJOR_TONIC[fifths] || 'C';
  const tl = LETTERS.indexOf(tn[0]);
  const tpc = (LETTER_PC[tl] + (tn[1] === '#' ? 1 : tn[1] === 'b' ? -1 : 0) + 12) % 12;
  const rel = ((p % 12) - tpc + 12) % 12;
  const [deg] = DEG[rel];
  const li = (tl + deg) % 7;
  let alter = (p % 12) - LETTER_PC[li];
  if (alter > 6) alter -= 12; if (alter < -6) alter += 12;
  const octave = Math.round((p - alter - LETTER_PC[li]) / 12) - 1;
  return { step: LETTERS[li], alter, octave };
}

const TYPES = { 16: ['whole', 0], 12: ['half', 1], 8: ['half', 0], 6: ['quarter', 1], 4: ['quarter', 0], 3: ['eighth', 1], 2: ['eighth', 0], 1: ['16th', 0] };
function chunks(len) {
  const out = [];
  while (len > 0) {
    const v = [16, 12, 8, 6, 4, 3, 2, 1].find(x => x <= len);
    out.push(v); len -= v;
  }
  return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const DRUM_MAP = { 36: ['F', 4, null], 38: ['C', 5, null], 42: ['G', 5, 'x'], 46: ['G', 5, 'circle-x'], 49: ['A', 5, 'x'] };

function clefXml(c, num) {
  const n = num ? ` number="${num}"` : '';
  if (c === 'F') return `<clef${n}><sign>F</sign><line>4</line></clef>`;
  if (c === 'C') return `<clef${n}><sign>C</sign><line>3</line></clef>`;
  if (c === 'perc') return `<clef${n}><sign>percussion</sign><line>2</line></clef>`;
  return `<clef${n}><sign>G</sign><line>2</line></clef>`;
}

function transposeXml(part) {
  if (!part.tr) return '';
  if (part.octOnly) return `<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>`;
  return `<transpose><diatonic>${part.diat}</diatonic><chromatic>${-part.tr}</chromatic></transpose>`;
}

export function buildMusicXML(A, arr, meta) {
  const [num, den] = A.piece.timeSig;
  const barU = Math.round(A.barLen * DIV);
  const nBars = A.nBars;
  const concertF = A.key.fifths;

  let partList = '', body = '';
  arr.parts.forEach((part, pi) => {
    const pid = 'P' + (pi + 1);
    partList += `<score-part id="${pid}"><part-name>${esc(part.name)}</part-name><part-abbreviation>${esc(part.en || '')}</part-abbreviation><score-instrument id="${pid}-I1"><instrument-name>${esc(part.en || part.name)}</instrument-name></score-instrument><midi-instrument id="${pid}-I1"><midi-channel>${part.drum ? 10 : (pi % 15) + 1}</midi-channel><midi-program>${(part.prog || 0) + 1}</midi-program></midi-instrument></score-part>`;
    let fifths = part.drum ? 0 : concertF + (part.tf || 0);
    if (fifths > 7) fifths -= 12; if (fifths < -7) fifths += 12;
    const staves = part.staves === 2 ? 2 : 1;

    // 记谱音高 → 16分网格 → 小节线处切分并连线
    const segs = [];
    for (const n of part.notes) {
      const wp = part.drum ? n.p : n.p + (part.tr || 0);
      let s = Math.round(n.s * DIV), e = Math.round((n.s + n.d) * DIV);
      if (e <= s) e = s + 1;
      // 双行谱：低于中央C，或是低音区的长音（钢琴左手持续音）放下行
      const staff = staves === 2 ? ((wp < 60 || (n.d >= 1 && wp < 67)) ? 2 : 1) : 1;
      let first = true;
      while (s < e) {
        const be = (Math.floor(s / barU) + 1) * barU;
        const ce = Math.min(e, be);
        segs.push({ p: wp, s, e: ce, staff, tieStop: !first, tieStart: ce < e });
        first = false; s = ce;
      }
    }
    const byBar = Array.from({ length: nBars }, () => []);
    segs.forEach(g => { const b = Math.floor(g.s / barU); if (b < nBars) byBar[b].push(g); });

    let xml = `<part id="${pid}">`;
    let lastLvl = -1;
    for (let b = 0; b < nBars; b++) {
      xml += `<measure number="${b + 1}">`;
      if (b === 0) {
        xml += `<attributes><divisions>${DIV}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${num}</beats><beat-type>${den}</beat-type></time>`;
        if (staves === 2) xml += `<staves>2</staves>${clefXml('G', 1)}${clefXml('F', 2)}`;
        else xml += clefXml(part.drum ? 'perc' : part.clef);
        xml += transposeXml(part) + `</attributes>`;
        if (pi === 0) xml += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${meta.bpm}</per-minute></metronome></direction-type><sound tempo="${meta.bpm}"/></direction>`;
      }
      const lvl = A.levels[b];
      const active = byBar[b].length > 0;
      if (arr.id !== 'piano' && active && lvl !== lastLvl) {
        xml += `<direction placement="below"><direction-type><dynamics><${LEVEL_NAMES[lvl]}/></dynamics></direction-type><staff>1</staff></direction>`;
        lastLvl = lvl;
      }
      for (let st = 1; st <= staves; st++) {
        if (st === 2) xml += `<backup><duration>${barU}</duration></backup>`;
        xml += measureXml(byBar[b].filter(g => g.staff === st).map(g => ({ ...g, s: g.s - b * barU, e: g.e - b * barU })), barU, fifths, st, staves, part.drum);
      }
      xml += `</measure>`;
    }
    xml += `</part>`;
    body += xml;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${esc(meta.title)}</work-title></work><identification><creator type="composer">${esc(meta.composer || '')}</creator><creator type="arranger">${esc(meta.arranger || '')}</creator><encoding><software>琴转交响</software></encoding></identification><part-list>${partList}</part-list>${body}</score-partwise>`;
}

function measureXml(segs, barU, fifths, staff, staves, drum) {
  const voice = staff;
  const staffTag = staves === 2 ? `<staff>${staff}</staff>` : '';
  if (!segs.length) return `<note><rest measure="yes"/><duration>${barU}</duration><voice>${voice}</voice>${staffTag}</note>`;
  const onsets = [...new Set(segs.map(g => g.s))].sort((a, b) => a - b);
  // 先生成“事件”列表（音符/休止符，含位置与时值），再计算符杠，最后输出
  const items = [];
  let pos = 0;
  const rest = len => chunks(len).forEach(c => { items.push({ pos, dur: c, rest: true }); pos += c; });
  onsets.forEach((on, i) => {
    if (on < pos) return;
    if (on > pos) rest(on - pos);
    const group = segs.filter(g => g.s === on);
    const next = i + 1 < onsets.length ? onsets[i + 1] : barU;
    const end = Math.min(next, Math.min(...group.map(g => g.e)), barU);
    const cs = chunks(end - on);
    const uniq = [...new Map(group.map(g => [g.p, g])).values()].sort((a, b) => a.p - b.p);
    cs.forEach((c, ci) => { items.push({ pos, dur: c, uniq, ci, nChunks: cs.length, end }); pos += c; });
    pos = end;
  });
  if (pos < barU) rest(barU - pos);

  // 符杠：同一拍内相邻的八分/十六分音符连起来
  const beatU = (barU % 6 === 0 && barU % 4 !== 0) ? 6 : 4;
  const beamable = it => !it.rest && it.dur < 4;
  let k = 0;
  while (k < items.length) {
    if (!beamable(items[k])) { k++; continue; }
    const beat = Math.floor(items[k].pos / beatU);
    let j = k;
    while (j + 1 < items.length && beamable(items[j + 1]) && Math.floor(items[j + 1].pos / beatU) === beat &&
           items[j + 1].pos + items[j + 1].dur <= (beat + 1) * beatU) j++;
    if (j > k) {
      for (let x = k; x <= j; x++) {
        const it = items[x];
        it.beams = [x === k ? 'begin' : x === j ? 'end' : 'continue'];
        if (it.dur === 1) {
          const prev16 = x > k && items[x - 1].dur === 1, next16 = x < j && items[x + 1].dur === 1;
          it.beams.push(prev16 && next16 ? 'continue' : prev16 ? 'end' : next16 ? 'begin' : x === k ? 'forward hook' : 'backward hook');
        }
      }
    }
    k = j + 1;
  }

  let xml = '';
  items.forEach(it => {
    const [t, dot] = TYPES[it.dur];
    if (it.rest) {
      xml += `<note><rest/><duration>${it.dur}</duration><voice>${voice}</voice><type>${t}</type>${dot ? '<dot/>' : ''}${staffTag}</note>`;
      return;
    }
    const { uniq, ci, end } = it, c = it.dur, cs = { length: it.nChunks };
    const beamXml = (it.beams || []).map((b, n) => `<beam number="${n + 1}">${b}</beam>`).join('');
    {
      uniq.forEach((g, gi) => {
        const tieStop = ci > 0 || g.tieStop;
        const fullyHeld = g.e === end;
        const tieStart = ci < cs.length - 1 || (g.tieStart && fullyHeld);
        let pitch, head = '';
        if (drum) {
          const [st, oc, nh] = DRUM_MAP[g.p] || ['C', 5, null];
          pitch = `<unpitched><display-step>${st}</display-step><display-octave>${oc}</display-octave></unpitched>`;
          if (nh) head = `<notehead>${nh}</notehead>`;
        } else {
          const sp = spell(g.p, fifths);
          pitch = `<pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ''}<octave>${sp.octave}</octave></pitch>`;
        }
        const ties = (tieStop ? '<tie type="stop"/>' : '') + (tieStart ? '<tie type="start"/>' : '');
        const tied = (tieStop ? '<tied type="stop"/>' : '') + (tieStart ? '<tied type="start"/>' : '');
        xml += `<note>${gi > 0 ? '<chord/>' : ''}${pitch}<duration>${c}</duration>${ties}<voice>${voice}</voice><type>${t}</type>${dot ? '<dot/>' : ''}${head}${staffTag}${gi === 0 ? beamXml : ''}${tied ? `<notations>${tied}</notations>` : ''}</note>`;
      });
    }
  });
  return xml;
}
