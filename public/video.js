// うたとも の動画：Vとも のキャラがステージに立ち、曲に合わせてゆれる。歌詞は字幕に
// 1コマを「時刻・曲・キャラの絵」から描く。画面（DOM）にはさわらないので、テストでも読みこめる
import { MOODS, PARTS, barSeconds, songSeconds, TAIL_SEC } from './music.js';

// 縦・横の大きさと、SNS のボタンや文字がかぶりやすい所をよけた「セーフゾーン」（割合）
export const FORMATS = {
  tall: { label: '縦 9:16（ショート動画）', short: '縦', w: 720, h: 1280, safe: { top: 0.12, bottom: 0.2, left: 0.06, right: 0.16 } },
  wide: { label: '横 16:9（動画サイト）', short: '横', w: 1280, h: 720, safe: { top: 0.08, bottom: 0.12, left: 0.05, right: 0.05 } },
};
export function safeRect(id) {
  const f = FORMATS[id];
  const x = Math.round(f.w * f.safe.left);
  const y = Math.round(f.h * f.safe.top);
  return { x, y, w: Math.round(f.w * (1 - f.safe.left - f.safe.right)), h: Math.round(f.h * (1 - f.safe.top - f.safe.bottom)) };
}

// 雰囲気ごとのステージの色（上・下・光）
export const THEME = {
  bright: ['#ffb347', '#ff6f91', '#fff3b0'],
  cute: ['#ffc2e2', '#b8a6ff', '#ffffff'],
  cool: ['#1b2a4a', '#3a1f5c', '#5ad1ff'],
  oshare: ['#3e2c23', '#7a5c48', '#ffd9a0'],
  calm: ['#1d2b53', '#4b6aa8', '#c8d8ff'],
  party: ['#ff5f6d', '#ffc371', '#fffbd6'],
};

// 時刻 t（秒）のとき、曲のどこにいるか：部分・部分の中の進み具合・拍・字幕の行
export function timeline(song) {
  const barSec = barSeconds(song.tempo);
  const starts = [];
  let bar = 0;
  for (const s of song.sections) { starts.push(bar); bar += s.bars; }
  const total = songSeconds(song) + (song.length === 'loop' ? 0 : TAIL_SEC);
  return {
    total,
    at(t) {
      const b = Math.max(0, t / barSec);
      let i = song.sections.length - 1;
      while (i > 0 && starts[i] > b) i--;
      const s = song.sections[i];
      const progress = Math.min(1, (b - starts[i]) / s.bars);
      const beat = (b * 4) % 1;
      const lines = (s.lyric || '').split('\n').filter((l) => l.trim());
      const line = lines.length && t < songSeconds(song) ? lines[Math.min(lines.length - 1, Math.floor(progress * lines.length))] : '';
      return { section: i, part: s.part, progress, beat, line, ended: t >= songSeconds(song) };
    },
  };
}

const FONT = '"Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif';
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
// 長い字幕は、はばに合わせて折り返す（日本語は1文字ずつ）
export function wrapText(measure, text, maxW) {
  const out = [];
  let cur = '';
  for (const ch of [...text]) {
    if (cur && measure(cur + ch) > maxW) { out.push(cur); cur = ch.trim() ? ch : ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// 1コマを描く。g は canvas の 2D。chara はキャラの絵（Image。なければ描かない）
export function drawFrame(g, { format = 'tall', t = 0, song, chara = null, title = '', lyrics = true, guide = false }) {
  const f = FORMATS[format];
  const { w, h } = f;
  const safe = safeRect(format);
  const at = timeline(song).at(t);
  const [top, bottom, light] = THEME[song.mood] || THEME.bright;
  const hot = at.part === 'sabi' || at.part === 'kansou'; // サビと間奏は明るく、光がよく動く
  const pulse = 1 - at.beat; // 拍の頭で強く

  // 背景
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // 上からの光（サビで本数がふえる）
  const beams = hot ? 6 : 3;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < beams; k++) {
    const sway = Math.sin(t * (hot ? 1.6 : 0.6) + k * 1.7) * 0.35;
    const x0 = w * ((k + 0.5) / beams);
    g.globalAlpha = (hot ? 0.16 : 0.1) + 0.06 * pulse;
    g.fillStyle = light;
    g.beginPath();
    g.moveTo(x0 - w * 0.02, 0);
    g.lineTo(x0 + w * 0.02, 0);
    g.lineTo(x0 + Math.tan(sway) * h + w * 0.16, h);
    g.lineTo(x0 + Math.tan(sway) * h - w * 0.16, h);
    g.closePath();
    g.fill();
  }
  g.restore();

  // ふわふわ上がる音符
  g.save();
  g.fillStyle = light;
  g.font = `${Math.round(Math.min(w, h) * 0.05)}px ${FONT}`;
  for (let k = 0; k < 10; k++) {
    const speed = 0.04 + (k % 4) * 0.012;
    const y = h - (((t * speed + k * 0.137) % 1) * h * 1.1);
    const x = w * ((k * 0.283 + 0.07) % 1) + Math.sin(t + k) * w * 0.02;
    g.globalAlpha = 0.25 + 0.2 * ((k % 3) / 2);
    g.fillText(k % 2 ? '♪' : '♫', x, y);
  }
  g.restore();

  // ステージのゆか
  const floorY = format === 'tall' ? h * 0.74 : h * 0.84;
  g.save();
  g.globalAlpha = 0.35;
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(w / 2, floorY + h * 0.03, w * 0.42, h * 0.035, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // キャラ（拍に合わせて、ぴょこっとはねる）
  if (chara) {
    const ch = format === 'tall' ? h * 0.42 : h * 0.62;
    const cw = ch * (2 / 3);
    const hop = Math.sin(at.beat * Math.PI) * ch * (hot ? 0.035 : 0.02);
    const tilt = Math.sin(t * 2.2) * (hot ? 0.05 : 0.025);
    g.save();
    g.translate(w / 2, floorY - hop);
    g.rotate(tilt);
    g.drawImage(chara, -cw / 2, -ch, cw, ch);
    g.restore();
  }

  // 曲の名前（上のセーフゾーンの中）
  const small = Math.round(Math.min(w, h) * 0.032);
  g.save();
  g.font = `bold ${small}px ${FONT}`;
  g.textBaseline = 'middle';
  const name = `♪ ${title || 'わたしの1曲'}`;
  const nw = Math.min(safe.w, g.measureText(name).width + small * 1.4);
  g.globalAlpha = 0.85;
  g.fillStyle = 'rgba(0,0,0,.35)';
  roundRect(g, safe.x, safe.y, nw, small * 1.9, small * 0.95);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.fillText(name, safe.x + small * 0.7, safe.y + small * 0.95, safe.w - small * 1.4);
  g.restore();

  // 字幕（下のセーフゾーンの中・すりガラスの板）
  if (lyrics && at.line) {
    const big = Math.round(Math.min(w, h) * (format === 'tall' ? 0.058 : 0.05));
    g.save();
    g.font = `bold ${big}px ${FONT}`;
    const rows = wrapText((s) => g.measureText(s).width, at.line, safe.w - big * 1.2).slice(0, 3);
    const boxH = rows.length * big * 1.35 + big * 0.8;
    const boxY = safe.y + safe.h - boxH - small * 1.8;
    g.fillStyle = 'rgba(255,255,255,.78)';
    roundRect(g, safe.x, boxY, safe.w, boxH, big * 0.5);
    g.fill();
    g.fillStyle = '#2a2233';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    rows.forEach((r, i) => g.fillText(r, safe.x + safe.w / 2, boxY + big * 0.4 + i * big * 1.35));
    g.restore();
  }

  // クレジット（いちばん下・小さく）
  g.save();
  g.font = `${Math.round(small * 0.8)}px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.fillText('うたとも（ともはね）', safe.x + safe.w, safe.y + safe.h);
  g.textAlign = 'left';
  g.fillText(`${MOODS[song.mood]?.label || ''}・${PARTS[at.part]?.label || ''}`, safe.x, safe.y + safe.h);
  g.restore();

  // セーフゾーンの目安（見本のときだけ。書き出しには入れない）
  if (guide) {
    g.save();
    g.setLineDash([12, 10]);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.strokeRect(safe.x, safe.y, safe.w, safe.h);
    g.restore();
  }
  return at;
}

// この端末で書き出せる動画の形（えらべる中から、SNS で使いやすい mp4 を先に）
export function pickVideoType(isSupported) {
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find((m) => isSupported(m)) || '';
}
export const videoExt = (type) => (type.startsWith('video/mp4') ? 'mp4' : 'webm');
