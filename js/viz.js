// 可视化：按乐器分行的滚动“动态总谱”，用于页面预览和视频录制

import { LEVEL_NAMES } from './engine.js';

export const VW = 1280, VH = 720;

export function createViz(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VW; canvas.height = VH;
  let model = null;

  function setModel(m) {
    // m: { arr, A, title, composer, ensembleName }
    const parts = m.arr.parts.map(p => {
      const ps = p.notes.map(n => n.p);
      const lo = ps.length ? Math.min(...ps) : 60, hi = ps.length ? Math.max(...ps) : 72;
      const notes = [...p.notes].sort((a, b) => a.s - b.s);
      const maxD = notes.reduce((a, n) => Math.max(a, n.d), 0);
      return { ...p, lo, hi, notes, maxD };
    });
    model = { ...m, parts };
  }

  function lowerBound(arr, s) {
    let a = 0, b = arr.length;
    while (a < b) { const mid = (a + b) >> 1; if (arr[mid].s < s) a = mid + 1; else b = mid; }
    return a;
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(beat) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#0d1020'); g.addColorStop(1, '#07080f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    if (!model) return;
    const { A, parts } = model;
    const LEFT = 190, TOP = 92, BOT = VH - 34;
    const PX = 92; // 每拍像素
    const playX = LEFT + 300;
    const laneH = (BOT - TOP) / parts.length;
    const bar = Math.max(0, Math.min(A.nBars - 1, Math.floor(beat / A.barLen)));

    // 小节线
    ctx.font = '12px -apple-system, "PingFang SC", sans-serif';
    const b0 = Math.floor((beat - (playX - LEFT) / PX) / A.barLen) - 1;
    for (let b = Math.max(0, b0); b <= A.nBars; b++) {
      const x = playX + (b * A.barLen - beat) * PX;
      if (x < LEFT || x > VW) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, TOP - 6); ctx.lineTo(x, BOT); ctx.stroke();
      if (b < A.nBars) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillText(String(b + 1), x + 4, TOP - 8); }
    }

    // 各声部
    parts.forEach((p, i) => {
      const y0 = TOP + i * laneH;
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.018)'; ctx.fillRect(LEFT, y0, VW - LEFT, laneH); }
      const span = p.hi - p.lo + 2;
      const nh = Math.max(2, Math.min(laneH * 0.55, (laneH / span) * 1.4));
      const startS = beat - (playX - LEFT) / PX - p.maxD;
      let k = lowerBound(p.notes, startS);
      let active = 0;
      for (; k < p.notes.length; k++) {
        const n = p.notes[k];
        const x = playX + (n.s - beat) * PX;
        if (x > VW) break;
        const w = Math.max(2, n.d * PX - 1.5);
        if (x + w < LEFT) continue;
        const y = y0 + laneH * (1 - (n.p - p.lo + 1) / span) - nh / 2;
        const on = n.s <= beat && n.s + n.d > beat;
        const past = n.s + n.d <= beat;
        if (on) active++;
        ctx.globalAlpha = on ? 1 : past ? 0.28 : 0.6;
        if (on) { ctx.shadowColor = p.color; ctx.shadowBlur = 16; }
        ctx.fillStyle = on ? '#fff' : p.color;
        const cx = Math.max(LEFT, x);
        rr(cx, y, w - (cx - x), nh, 3); ctx.fill();
        if (on) { ctx.fillStyle = p.color; ctx.globalAlpha = 0.85; rr(cx, y, w - (cx - x), nh, 3); ctx.fill(); }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      // 标签
      const lit = active > 0;
      ctx.fillStyle = lit ? p.color : 'rgba(255,255,255,0.12)';
      rr(18, y0 + laneH / 2 - 4, 8, 8, 4); ctx.fill();
      if (lit) { ctx.shadowColor = p.color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; }
      ctx.fillStyle = lit ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.font = `${Math.min(15, Math.max(10, laneH * 0.42))}px -apple-system, "PingFang SC", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(p.name, 34, y0 + laneH / 2);
      ctx.textBaseline = 'alphabetic';
    });

    // 播放线
    const pg = ctx.createLinearGradient(playX - 40, 0, playX, 0);
    pg.addColorStop(0, 'rgba(245,215,140,0)'); pg.addColorStop(1, 'rgba(245,215,140,0.08)');
    ctx.fillStyle = pg; ctx.fillRect(playX - 40, TOP, 40, BOT - TOP);
    ctx.strokeStyle = 'rgba(245,215,140,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(playX, TOP - 4); ctx.lineTo(playX, BOT); ctx.stroke();

    // 顶栏
    ctx.fillStyle = 'rgba(7,8,15,0.85)'; ctx.fillRect(0, 0, VW, 66);
    ctx.fillStyle = '#f5d78c'; ctx.font = '600 22px "Songti SC", "Noto Serif SC", serif';
    ctx.fillText(model.title, 24, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '14px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`${model.composer ? model.composer + ' · ' : ''}${model.ensembleName}`, 24, 56);
    const lvl = A.levels[bar];
    const right = `第 ${bar + 1} / ${A.nBars} 小节`;
    ctx.textAlign = 'right'; ctx.fillText(right, VW - 24, 56);
    if (model.arr.id !== 'piano') {
      ctx.font = 'italic 700 26px "Times New Roman", serif'; ctx.fillStyle = '#f5d78c';
      ctx.fillText(LEVEL_NAMES[lvl], VW - 24, 34);
      for (let l = 0; l < 4; l++) {
        ctx.fillStyle = l <= lvl ? '#f5d78c' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(VW - 120 + l * 14, 22, 10, 12 - 0 + (l - 3) * 0);
      }
    }
    ctx.textAlign = 'left';

    // 进度条
    const prog = Math.max(0, Math.min(1, beat / A.total));
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, VH - 4, VW, 4);
    ctx.fillStyle = '#f5d78c'; ctx.fillRect(0, VH - 4, VW * prog, 4);

    // 片头 / 片尾
    const spb = 60 / model.bpm;
    const fade = beat < 0 ? Math.min(1, -beat * spb / 1.2) : beat > A.total + 0.5 ? Math.min(1, (beat - A.total - 0.5) * spb / 1.5) : 0;
    if (fade > 0) {
      ctx.fillStyle = `rgba(7,8,15,${0.92 * fade})`; ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = fade; ctx.textAlign = 'center';
      ctx.fillStyle = '#f5d78c'; ctx.font = '600 44px "Songti SC", "Noto Serif SC", serif';
      ctx.fillText(model.title, VW / 2, VH / 2 - 10);
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '20px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(`${model.composer ? model.composer + '  ·  ' : ''}${model.ensembleName}版`, VW / 2, VH / 2 + 34);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
  }

  return { setModel, draw };
}
