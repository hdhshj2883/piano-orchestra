import { BUILTIN } from './pieces.js';
import { analyze, arrange, describe, ENSEMBLES } from './engine.js';
import { prepare, Player, renderWav } from './audio.js';
import { buildMusicXML } from './score.js';
import { fromMidi, fromMusicXmlFile, fromAudio, toMidi } from './input.js';
import { createViz } from './viz.js';

const $ = id => document.getElementById(id);
const S = { piece: null, A: null, ens: 'full', arr: null, view: null, ab: false, mutes: {}, bpm: 66, cursor: -1, busy: false };
const player = new Player();
const viz = createViz($('viz'));

function toast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
const status = s => { $('status').textContent = s; };
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const safeName = () => `${(S.piece?.title || 'piece').replace(/[\\/:*?"<>|]/g, '')}-${S.ab ? '钢琴' : ENSEMBLES[S.ens].short}`;

// —— 标签页 ——
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === b.dataset.tab));
});

// —— 输入 ——
BUILTIN.forEach(b => $('builtinSel').add(new Option(b.label, b.id)));
$('loadBuiltin').onclick = () => setPiece(BUILTIN.find(b => b.id === $('builtinSel').value).make());
async function handleFile(fn, file, ...args) {
  if (!file) return;
  try { status('解析中…'); setPiece(await fn(file, ...args)); }
  catch (e) { console.error(e); toast('读取失败：' + e.message, 5000); status(''); }
}
$('midiFile').onchange = e => handleFile(fromMidi, e.target.files[0]);
$('xmlFile').onchange = e => handleFile(fromMusicXmlFile, e.target.files[0]);
$('audioFile').onchange = e => handleFile(fromAudio, e.target.files[0], +$('audioBpm').value || 90,
  (p, msg) => status(`${msg} ${Math.round(p * 100)}%`));

// —— 编制 ——
Object.entries(ENSEMBLES).forEach(([id, E]) => {
  const b = document.createElement('button');
  b.dataset.id = id; b.innerHTML = `<b>${E.name}</b><span>${E.desc}</span>`;
  b.onclick = () => { S.ens = id; S.ab = false; rebuild(); };
  $('ensList').appendChild(b);
});
$('tempo').oninput = e => { S.bpm = +e.target.value; $('tempoVal').textContent = S.bpm; };
$('tempo').onchange = () => { if (player.playing) startPlay(player.beat()); };

function setPiece(piece) {
  player.stop();
  S.piece = piece;
  S.A = analyze(piece);
  S.bpm = piece.bpm; $('tempo').value = S.bpm; $('tempoVal').textContent = S.bpm;
  S.cursor = -1;
  $('pieceInfo').textContent = `已载入：${piece.title}${piece.composer ? ' — ' + piece.composer : ''} · ${S.A.nBars} 小节 · ${piece.notes.length} 个音符 · ${piece.timeSig.join('/')} · 推测调性 ${keyName(S.A.key)}`;
  $('seek').max = S.A.total;
  rebuild();
}
function keyName(k) {
  const N = ['C', '♯C', 'D', '♭E', 'E', 'F', '♯F', 'G', '♭A', 'A', '♭B', 'B'];
  return N[k.tonic] + (k.minor ? ' 小调' : ' 大调');
}

function rebuild() {
  if (!S.A) return;
  const wasPlaying = player.playing, at = player.beat();
  player.stop();
  document.querySelectorAll('#ensList button').forEach(b => b.classList.toggle('active', b.dataset.id === S.ens && !S.ab));
  $('abBtn').classList.toggle('on', S.ab);
  S.arr = arrange(S.A, S.ens);
  S.view = S.ab ? arrange(S.A, 'piano') : S.arr;
  S.mutes = {};
  viz.setModel({ arr: S.view, A: S.A, title: S.piece.title, composer: S.piece.composer, ensembleName: S.ab ? '钢琴原曲' : ENSEMBLES[S.ens].name, bpm: S.bpm });
  renderPlan(); renderMixer();
  renderScore();
  if (wasPlaying) startPlay(at);
}

function renderPlan() {
  const segs = describe(S.A, S.ens);
  $('plan').innerHTML = segs.map(s => `<div class="seg"><div><div class="dyn">${s.dyn}</div><div class="bars">第 ${s.from + 1}–${s.to + 1} 小节</div></div><div>${
    Object.entries(s.cats).map(([k, v]) => `<div><em>${k}：</em>${v.join('、')}</div>`).join('')}</div></div>`).join('');
}

function renderMixer() {
  $('mixer').innerHTML = '';
  S.view.parts.forEach(p => {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" checked><i style="background:${p.color}"></i>${p.name}`;
    l.querySelector('input').onchange = e => { S.mutes[p.id] = !e.target.checked; player.setMute(p.id, S.mutes[p.id], p.gain ?? 0.7); };
    $('mixer').appendChild(l);
  });
}

// —— 总谱 ——
let osmd = null, scoreJob = 0;
async function renderScore() {
  const job = ++scoreJob;
  const el = $('score');
  el.innerHTML = '<p class="hint" style="color:#666">正在排版总谱…</p>';
  await new Promise(r => setTimeout(r, 50));
  if (job !== scoreJob) return;
  try {
    const xml = buildMusicXML(S.A, S.view, meta());
    el.innerHTML = '';
    osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(el, { autoResize: true, backend: 'svg', drawTitle: true, drawPartNames: true, drawPartAbbreviations: true, drawingParameters: 'compacttight' });
    osmd.zoom = +$('zoom').value;
    await osmd.load(xml);
    if (job !== scoreJob) return;
    osmd.render();
  } catch (e) { console.error(e); el.innerHTML = `<p class="hint" style="color:#a33">总谱排版失败：${e.message}（仍可导出 MusicXML）</p>`; }
}
$('zoom').oninput = e => { if (osmd) { osmd.zoom = +e.target.value; osmd.render(); } };
const meta = () => ({ title: S.piece.title, composer: S.piece.composer, arranger: S.ab ? '' : `琴转交响 · ${ENSEMBLES[S.ens].name}`, bpm: S.bpm });

// —— 播放 ——
async function ensureLoaded() {
  status('加载音色…');
  await prepare(S.view, (p) => status(`加载音色 ${Math.round(p * 100)}%`), [44100, player.ensureCtx().sampleRate]);
  status('');
}
async function startPlay(from = 0, extraDest = null) {
  if (!S.A) return;
  player.ensureCtx();
  await ensureLoaded();
  player.onEnd = () => { $('playBtn').textContent = '▶ 播放'; S.cursor = -1; };
  player.play(S.view, { bpm: S.bpm, startBeat: from, endBeat: S.A.total, mutes: S.mutes, extraDest });
  $('playBtn').textContent = '❚❚ 暂停';
}
$('playBtn').onclick = async () => {
  if (player.playing) { S.cursor = player.beat(); player.stop(); $('playBtn').textContent = '▶ 播放'; return; }
  try { await startPlay(S.cursor > 0 && S.cursor < S.A.total ? S.cursor : 0); }
  catch (e) { console.error(e); toast('播放失败：' + e.message, 5000); status(''); }
};
$('stopBtn').onclick = () => { player.stop(); S.cursor = -1; $('playBtn').textContent = '▶ 播放'; };
$('abBtn').onclick = () => { S.ab = !S.ab; rebuild(); };
$('seek').oninput = e => { S.cursor = +e.target.value; if (player.playing) startPlay(S.cursor); };

function frame() {
  const b = player.playing ? player.beat() : S.cursor;
  viz.draw(b);
  if (player.playing && document.activeElement !== $('seek')) $('seek').value = Math.max(0, b);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// —— 导出 ——
function busy(btn, on, label) {
  if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.l; btn.disabled = false; }
}
$('wavBtn').onclick = async () => {
  if (!S.A) return;
  const b = $('wavBtn'); busy(b, true, '渲染中…'); toast('正在用真实采样渲染整首乐曲，约需 1–2 分钟…', 6000);
  try {
    await ensureLoaded();
    const blob = await renderWav(S.view, S.bpm, S.A.total, S.mutes);
    download(blob, safeName() + '.wav'); toast('WAV 已生成');
  } catch (e) { console.error(e); toast('渲染失败：' + e.message, 5000); }
  busy(b, false);
};
$('xmlBtn').onclick = () => S.A && download(new Blob([buildMusicXML(S.A, S.view, meta())], { type: 'application/vnd.recordare.musicxml+xml' }), safeName() + '.musicxml');
$('midiBtn').onclick = () => S.A && download(toMidi(S.view, S.bpm, S.piece.title), safeName() + '.mid');
$('pdfBtn').onclick = () => { toast('在打印对话框中选择「存储为 PDF」'); setTimeout(() => window.print(), 400); };

$('videoBtn').onclick = async () => {
  if (!S.A || S.recording) return;
  const b = $('videoBtn');
  try {
    player.stop();
    const ctx = player.ensureCtx();
    await ensureLoaded();
    const dest = ctx.createMediaStreamDestination();
    const stream = $('viz').captureStream(30);
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6, audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      S.recording = false; busy(b, false); status('');
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type: mime.split(';')[0] }), safeName() + '.' + ext);
      toast('视频已导出（.' + ext + '）');
    };
    S.recording = true; busy(b, true, '⏺ 录制中…');
    rec.start(1000);
    const intro = 2.5 * S.bpm / 60;
    player.onEnd = () => { $('playBtn').textContent = '▶ 播放'; setTimeout(() => rec.stop(), 300); };
    player.play(S.view, { bpm: S.bpm, startBeat: -intro, endBeat: S.A.total, mutes: S.mutes, extraDest: dest });
    const t0 = performance.now(), totalSec = (S.A.total + intro) * 60 / S.bpm + 2.5;
    const iv = setInterval(() => {
      if (!S.recording) return clearInterval(iv);
      status(`录制中 ${Math.min(100, Math.round((performance.now() - t0) / 10 / totalSec))}%`);
    }, 500);
  } catch (e) { console.error(e); S.recording = false; busy(b, false); toast('录制失败：' + e.message, 5000); }
};

// 启动
setPiece(BUILTIN[0].make());
window.__S = S;
