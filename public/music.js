// うたとも の音のもと：パネル（ループ）・雰囲気・曲の設計図・音づくり・WAV の書き出し
// ブラウザ（再生・書き出し）でもサーバー（保存のチェック・テスト）でも、このファイルをそのまま使う
// 音はすべてここで計算して作る（録音した音源・外のサービス・AI は使わない）ので、著作権の心配がない

export const STEPS = 16; // 1小節を16に分ける
export const TAIL_SEC = 1.5; // 音の余韻（次の小節にはみ出してよい長さ）

// ── 雰囲気：調・テンポ・和音の進み方（4小節でひとめぐり）・はじめのパネル ──
// 和音は [調の主音からの半音の数, 和音の種類]
const CHORD = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], sus: [0, 5, 7], add9: [0, 4, 7, 14] };
export const MOODS = {
  bright: {
    label: '明るい', emoji: '☀️', key: 0, tempo: 120, swing: 0, prog: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']],
    set: { rhythm: 'bounce', bass: 'pon', chord: 'straight', melody: 'hop', fx: 'shine' },
  },
  cute: {
    label: 'かわいい', emoji: '🍬', key: 5, tempo: 128, swing: 0, prog: [[0, 'M7'], [9, 'm7'], [2, 'm7'], [7, '7']],
    set: { rhythm: 'walk', bass: 'pon', chord: 'sparkle', melody: 'hop', fx: 'bell' },
  },
  cool: {
    label: 'かっこいい', emoji: '🕶️', key: 9, tempo: 112, swing: 0, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']],
    set: { rhythm: 'heavy', bass: 'wave', chord: 'straight', melody: 'sabi', fx: 'popper' },
  },
  oshare: {
    label: 'おしゃれ', emoji: '☕', key: 2, tempo: 96, swing: 0.18, prog: [[5, 'M7'], [4, 'm7'], [9, 'm7'], [2, 'm7']],
    set: { rhythm: 'soft', bass: 'walk', chord: 'setsunai', melody: 'hum', fx: 'bell' },
  },
  calm: {
    label: 'しっとり', emoji: '🌙', key: 7, tempo: 80, swing: 0, prog: [[0, 'add9'], [4, 'm'], [5, 'M7'], [7, 'sus']],
    set: { rhythm: 'soft', bass: 'slow', chord: 'fuwa', melody: 'hum', fx: 'shine' },
  },
  party: {
    label: 'お祝い', emoji: '🎉', key: 7, tempo: 132, swing: 0, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']],
    set: { rhythm: 'walk', bass: 'pon', chord: 'straight', melody: 'sabi', fx: 'clap' },
  },
};
export const MOOD_IDS = Object.keys(MOODS);

// ── パネル：5つの列 × 4つのループ。どれも同じテンポ・同じ和音にそろうので、どれを押してもぶつからない ──
export const INSTS = ['rhythm', 'bass', 'chord', 'melody', 'fx'];
export const PANELS = {
  rhythm: {
    label: 'リズム', emoji: '🥁', color: '#e0569a',
    options: {
      bounce: { label: 'はずむ', kick: [0, 7, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
      heavy: { label: 'どっしり', kick: [0, 3, 8, 10], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], clap: [12] },
      walk: { label: 'てくてく', kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], clap: [4, 12] },
      soft: { label: 'そっと', kick: [0, 10], hat: [0, 4, 8, 12], rim: [4, 12] },
    },
  },
  bass: {
    label: 'ベース', emoji: '🎸', color: '#f2a93b',
    // [はじまり, 長さ, どの音]  r＝和音の根っこ・t＝3番目・f＝5番目・o＝1つ上の根っこ
    options: {
      slow: { label: 'ゆったり', notes: [[0, 7, 'r'], [8, 7, 'f']] },
      pon: { label: 'ぽんぽん', notes: [[0, 2, 'r'], [2, 2, 'o'], [4, 2, 'r'], [6, 2, 'o'], [8, 2, 'r'], [10, 2, 'o'], [12, 2, 'r'], [14, 2, 'o']] },
      wave: { label: 'うねる', notes: [[0, 3, 'r'], [3, 1, 'r'], [4, 2, 'f'], [6, 2, 'o'], [8, 3, 'r'], [11, 1, 'f'], [12, 2, 'o'], [14, 2, 'f']] },
      walk: { label: 'おさんぽ', notes: [[0, 4, 'r'], [4, 4, 't'], [8, 4, 'f'], [12, 4, 'o']] },
    },
  },
  chord: {
    label: 'コード', emoji: '🎹', color: '#2f8fd1',
    options: {
      sparkle: { label: 'きらきら', play: 'arp', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
      setsunai: { label: 'せつない', play: 'arp', steps: [0, 2, 4, 6, 8, 10, 12, 14], soft: true },
      straight: { label: 'まっすぐ', play: 'stab', steps: [0, 4, 8, 12] },
      fuwa: { label: 'ふわっと', play: 'pad', steps: [0] },
    },
  },
  melody: {
    label: 'メロディ', emoji: '🎶', color: '#2f9e6b',
    // [はじまり, 長さ, 和音の何番目の音（0〜4）]。和音の音だけを使うので外れない
    options: {
      hum: { label: 'ふんわり', notes: [[0, 4, 2], [4, 4, 1], [8, 6, 0], [14, 2, 1]] },
      hop: { label: 'はずむ', notes: [[0, 2, 0], [2, 2, 1], [4, 2, 2], [6, 2, 1], [8, 3, 3], [12, 2, 2], [14, 2, 1]] },
      sabi: { label: 'サビ', notes: [[0, 3, 3], [3, 1, 4], [4, 4, 3], [8, 2, 2], [10, 2, 3], [12, 4, 4]] },
      owari: { label: 'おわり', notes: [[0, 4, 3], [4, 4, 2], [8, 8, 0]] },
    },
  },
  fx: {
    label: 'キラキラ', emoji: '✨', color: '#8a6ad6',
    options: {
      clap: { label: '拍手' },
      popper: { label: 'クラッカー' },
      bell: { label: 'ベル' },
      shine: { label: 'ほし' },
    },
  },
};
export const optionIds = (inst) => Object.keys(PANELS[inst].options);

// ── 曲の部分と長さ ──
export const PARTS = {
  intro: { label: 'イントロ', color: '#8ab6e8' },
  a: { label: 'Aメロ', color: '#9ad3a8' },
  b: { label: 'Bメロ', color: '#f3d27a' },
  sabi: { label: 'サビ', color: '#f29bc0' },
  outro: { label: 'おわり', color: '#c3b2ea' },
  loop: { label: 'ループ', color: '#a7d8d8' },
};
export const LENGTHS = { 15: '15秒', 30: '30秒', 60: '60秒', loop: 'ループ' };
export const TEMPO_MIN = 70;
export const TEMPO_MAX = 150;
export const MAX_BARS = 64;
export const MAX_SECTIONS = 12;
export const MAX_SECONDS = 120;

export const barSeconds = (tempo) => 240 / tempo;
export const totalBars = (song) => song.sections.reduce((n, s) => n + s.bars, 0);
export const songSeconds = (song) => totalBars(song) * barSeconds(song.tempo);

const evenFloor = (x) => Math.max(2, Math.floor(x / 2) * 2);
// 長さ（秒）から、小節の数と部分の並びを決める
export function planSections(length, tempo) {
  if (length === 'loop') return [['loop', 8]];
  const n = Math.max(4, Math.round((Number(length) * tempo) / 240 / 2) * 2);
  if (n <= 10) return [['intro', 2], ['sabi', n - 4], ['outro', 2]].filter(([, b]) => b > 0);
  if (n <= 20) {
    const a = evenFloor((n - 4) / 2);
    return [['intro', 2], ['a', a], ['sabi', n - 4 - a], ['outro', 2]];
  }
  const m = n - 8;
  const a = evenFloor(m / 3);
  const b = evenFloor(m / 3);
  return [['intro', 4], ['a', a], ['b', b], ['sabi', m - a - b], ['outro', 4]];
}

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
// 部分ごとに、どのパネルを鳴らすか（雰囲気のはじめのパネルを元に。rng があれば少しずつ変える）
function panelsFor(part, set, rng) {
  const vary = (inst, v) => (rng && v && rng() < 0.3 ? pick(rng, optionIds(inst)) : v);
  const p = { rhythm: null, bass: null, chord: null, melody: null, fx: null };
  if (part === 'intro') Object.assign(p, { chord: set.chord, fx: rng && rng() < 0.5 ? 'shine' : null });
  if (part === 'a') Object.assign(p, { rhythm: set.rhythm, bass: set.bass, chord: set.chord, melody: set.melody === 'hum' ? null : 'hum' });
  if (part === 'b') Object.assign(p, { rhythm: set.rhythm === 'soft' ? 'bounce' : 'soft', bass: set.bass, chord: set.chord === 'fuwa' ? 'setsunai' : 'fuwa', melody: 'hum' });
  if (part === 'sabi') Object.assign(p, { rhythm: set.rhythm, bass: set.bass, chord: set.chord, melody: set.melody === 'hum' ? 'sabi' : set.melody, fx: set.fx });
  if (part === 'outro') Object.assign(p, { chord: 'fuwa', bass: 'slow', melody: 'owari' });
  if (part === 'loop') Object.assign(p, { rhythm: set.rhythm, bass: set.bass, chord: set.chord, melody: 'hum' });
  for (const inst of INSTS) if (part !== 'outro' && part !== 'intro') p[inst] = vary(inst, p[inst]);
  return p;
}

// 雰囲気と長さをえらぶと、BGM を自動で組み立てる
export function buildBgm(mood = 'bright', length = 30, { rng = null, quiet = false, tempo } = {}) {
  const m = MOODS[mood] || MOODS.bright;
  const t = clampTempo(tempo ?? m.tempo);
  return {
    v: 1,
    mood: MOODS[mood] ? mood : 'bright',
    length: LENGTHS[length] ? (length === 'loop' ? 'loop' : Number(length)) : 30,
    tempo: t,
    quiet: Boolean(quiet),
    sections: planSections(length, t).map(([part, bars]) => ({ part, bars, panels: panelsFor(part, m.set, rng) })),
  };
}
const clampTempo = (t) => Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(Number(t) || 120)));

// 保存や読みこみの前に、決まった形かどうかを確かめる（知らない項目は捨てる）
export function checkSong(input) {
  const bad = (what) => ({ ok: false, bad: what });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('song');
  if (!MOODS[input.mood]) return bad('mood');
  const length = input.length === 'loop' ? 'loop' : Number(input.length);
  if (!LENGTHS[length]) return bad('length');
  const tempo = Number(input.tempo);
  if (!Number.isInteger(tempo) || tempo < TEMPO_MIN || tempo > TEMPO_MAX) return bad('tempo');
  if (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > MAX_SECTIONS) return bad('sections');
  const sections = [];
  for (const s of input.sections) {
    if (!s || typeof s !== 'object' || !PARTS[s.part]) return bad('part');
    if (!Number.isInteger(s.bars) || s.bars < 1 || s.bars > 32) return bad('bars');
    const panels = {};
    for (const inst of INSTS) {
      const v = s.panels?.[inst] ?? null;
      if (v !== null && !Object.hasOwn(PANELS[inst].options, v)) return bad('panels');
      panels[inst] = v;
    }
    sections.push({ part: s.part, bars: s.bars, panels });
  }
  const song = { v: 1, mood: input.mood, length, tempo, quiet: Boolean(input.quiet), sections };
  if (totalBars(song) > MAX_BARS || songSeconds(song) > MAX_SECONDS) return bad('bars');
  return { ok: true, song };
}

// ── 音づくり（すべて計算で作る） ──
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const TAU = Math.PI * 2;

// 和音の音（ひくい順）。base は音の高さのはば
function chordNotes(mood, bar, base) {
  const m = MOODS[mood];
  const [root, q] = m.prog[((bar % m.prog.length) + m.prog.length) % m.prog.length];
  const r = base + ((m.key + root) % 12);
  return CHORD[q].map((iv) => r + iv);
}

class Buf {
  constructor(len) {
    this.l = new Float32Array(len);
    this.r = new Float32Array(len);
  }
  // pan：-1（左）〜 1（右）
  add(start, len, pan, gain, fn) {
    const a = ((pan + 1) / 4) * Math.PI;
    const gl = Math.cos(a) * gain;
    const gr = Math.sin(a) * gain;
    const end = Math.min(this.l.length, start + len);
    for (let i = Math.max(0, start); i < end; i++) {
      const v = fn(i - start);
      this.l[i] += v * gl;
      this.r[i] += v * gr;
    }
  }
}

// 音の形（sr＝1秒あたりのサンプル数、t＝秒）
const voices = {
  kick: (sr) => {
    let ph = 0;
    return (i) => {
      const t = i / sr;
      ph += (TAU * (48 + 110 * Math.exp(-t * 28))) / sr;
      return Math.sin(ph) * Math.exp(-t * 8);
    };
  },
  noise: (sr, rng, decay, hp = true) => {
    let prev = 0;
    return (i) => {
      const x = rng() * 2 - 1;
      const y = hp ? x - prev : x;
      prev = x;
      return y * 0.5 * Math.exp(-(i / sr) * decay);
    };
  },
  snare: (sr, rng) => {
    const n = voices.noise(sr, rng, 18);
    return (i) => n(i) * 0.9 + Math.sin((TAU * 185 * i) / sr) * Math.exp(-(i / sr) * 30) * 0.5;
  },
  clap: (sr, rng) => {
    const n = voices.noise(sr, rng, 0, true);
    return (i) => {
      const t = i / sr;
      const burst = t < 0.03 ? Math.exp(-((t % 0.01) * 300)) : Math.exp(-(t - 0.03) * 22);
      return n(i) * burst * 1.4;
    };
  },
  bass: (sr, freq, dur) => {
    let lp = 0;
    const k = 1 - Math.exp((-TAU * 900) / sr);
    return (i) => {
      const t = i / sr;
      const ph = (freq * t) % 1;
      const tri = 1 - 4 * Math.abs(ph - 0.5);
      const sq = ph < 0.5 ? 0.6 : -0.6;
      lp += k * (tri * 0.7 + sq * 0.3 - lp);
      return lp * env(t, dur, 0.006, 0.05);
    };
  },
  pluck: (sr, freq, decay) => (i) => {
    const t = i / sr;
    return (Math.sin(TAU * freq * t) + 0.35 * Math.sin(TAU * 2 * freq * t) + 0.1 * Math.sin(TAU * 3 * freq * t)) * Math.exp(-t * decay) * Math.min(1, t * 400);
  },
  pad: (sr, freq, dur) => (i) => {
    const t = i / sr;
    const tri = (f) => 1 - 4 * Math.abs(((f * t) % 1) - 0.5);
    return (tri(freq) + tri(freq * 1.004) * 0.8 + Math.sin(TAU * freq * 2 * t) * 0.2) * env(t, dur, 0.35, 0.6) * 0.5;
  },
  lead: (sr, freq, dur) => (i) => {
    const t = i / sr;
    const f = freq * (1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t * 3));
    const p = TAU * f * t;
    return (Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.12 * Math.sin(3 * p)) * env(t, dur, 0.012, 0.09);
  },
  bell: (sr, freq) => (i) => {
    const t = i / sr;
    return Math.sin(TAU * freq * t + 2.2 * Math.exp(-t * 4) * Math.sin(TAU * freq * 3.5 * t)) * Math.exp(-t * 2.6);
  },
};
// 鳴りはじめ（attack）・鳴りおわり（release）のなめらかさ
function env(t, dur, attack, release) {
  if (t < attack) return t / attack;
  if (t < dur) return 1;
  return Math.max(0, 1 - (t - dur) / release);
}

// 1小節ぶんの音を作る。left / right は小節の長さ＋余韻の長さ
export function renderBar({ inst, pattern, mood = 'bright', bar = 0, tempo, sampleRate = 44100, fill = false, quiet = false }) {
  const m = MOODS[mood] || MOODS.bright;
  const sr = sampleRate;
  const barLen = Math.round(barSeconds(tempo ?? m.tempo) * sr);
  const out = new Buf(barLen + Math.round(TAIL_SEC * sr));
  const def = PANELS[inst]?.options?.[pattern];
  if (!def) return { left: out.l, right: out.r, barLength: barLen };
  const stepLen = barLen / STEPS;
  // スウィング（おしゃれ）：うらの16分音符を少しおそく
  const at = (step) => Math.round((step + (step % 2 ? m.swing : 0)) * stepLen);
  const rng = makeRng(1 + bar * 97 + INSTS.indexOf(inst) * 131 + optionIds(inst).indexOf(pattern) * 17);
  const sec = (s) => Math.round(s * sr);

  if (inst === 'rhythm') {
    const hits = { kick: def.kick || [], snare: def.snare || [], hat: def.hat || [], clap: def.clap || [], rim: def.rim || [] };
    if (fill) { // 部分の切れめ：さいごの1拍を小だいこで「タタタタ」
      hits.snare = [...hits.snare.filter((s) => s < 12), 12, 13, 14, 15];
      hits.hat = hits.hat.filter((s) => s < 12);
    }
    for (const s of hits.kick) out.add(at(s), sec(0.45), 0, 0.95, voices.kick(sr));
    for (const s of hits.snare) out.add(at(s), sec(0.25), 0.05, s >= 12 && fill ? 0.3 + (s - 12) * 0.08 : 0.42, voices.snare(sr, rng));
    for (const s of hits.hat) out.add(at(s), sec(0.06), 0.3, s % 4 === 0 ? 0.22 : 0.14, voices.noise(sr, rng, 70));
    for (const s of hits.clap) out.add(at(s), sec(0.3), -0.15, 0.4, voices.clap(sr, rng));
    for (const s of hits.rim) out.add(at(s), sec(0.08), -0.2, 0.28, voices.pluck(sr, 1700, 60));
  }
  if (inst === 'bass') {
    const [r, t3, f5] = chordNotes(mood, bar, 36);
    const note = { r, t: t3, f: f5, o: r + 12 };
    for (const [s, len, which] of def.notes) {
      const dur = len * stepLen / sr * 0.92;
      out.add(at(s), sec(dur + 0.1), 0, 0.55, voices.bass(sr, mtof(note[which]), dur));
    }
  }
  if (inst === 'chord') {
    // 和音は 55〜67 のあたりにまとめる（となりの和音へなめらかに動く）
    const notes = chordNotes(mood, bar, 55).map((n) => (n > 69 ? n - 12 : n)).sort((a, b) => a - b);
    if (def.play === 'pad') {
      notes.forEach((n, k) => out.add(0, barLen + sec(0.6), k % 2 ? 0.3 : -0.3, 0.16, voices.pad(sr, mtof(n), barLen / sr)));
    } else if (def.play === 'stab') {
      for (const s of def.steps) notes.forEach((n, k) => out.add(at(s), sec(0.6), (k - 1) * 0.3, 0.17, voices.pluck(sr, mtof(n), 7)));
    } else {
      const up = [...notes, ...notes.map((n) => n + 12)];
      def.steps.forEach((s, k) => out.add(at(s), sec(0.7), k % 2 ? 0.4 : -0.4, def.soft ? 0.2 : 0.17, voices.pluck(sr, mtof(up[k % up.length]), def.soft ? 4 : 6)));
    }
  }
  if (inst === 'melody') {
    const tones = chordNotes(mood, bar, 72).map((n) => (n > 81 ? n - 12 : n)).sort((a, b) => a - b).slice(0, 3);
    const five = [tones[0], tones[1], tones[2], tones[0] + 12, tones[1] + 12];
    for (const [s, len, idx] of def.notes) {
      const dur = (len * stepLen) / sr * 0.9;
      out.add(at(s), sec(dur + 0.12), 0.1, quiet ? 0.12 : 0.26, voices.lead(sr, mtof(five[idx]), dur));
    }
  }
  if (inst === 'fx') {
    const top = chordNotes(mood, bar, 84);
    if (pattern === 'clap') { // たくさんの人の拍手
      for (let k = 0; k < 40; k++) out.add(Math.floor(rng() * barLen), sec(0.12), rng() * 1.6 - 0.8, 0.12, voices.noise(sr, rng, 45));
    }
    if (pattern === 'popper' && bar % 4 === 0) {
      out.add(0, sec(0.4), -0.3, 0.5, voices.noise(sr, rng, 14, false));
      out.add(sec(0.05), sec(0.5), 0.3, 0.12, (i) => Math.sin(TAU * (2000 + i / 8) * (i / sr)) * Math.exp(-(i / sr) * 9));
    }
    if (pattern === 'bell') {
      out.add(at(0), sec(1.6), 0.5, 0.16, voices.bell(sr, mtof(top[0])));
      out.add(at(8), sec(1.6), -0.5, 0.12, voices.bell(sr, mtof(top[2] ?? top[1])));
    }
    if (pattern === 'shine') {
      for (let k = 0; k < 6; k++) out.add(at(k * 2 + 4), sec(0.5), rng() * 1.6 - 0.8, 0.08, voices.pluck(sr, mtof(top[k % top.length] + 12), 9));
    }
  }
  return { left: out.l, right: out.r, barLength: barLen };
}

// 曲の小節を、頭から順に並べる（部分の切れめにはドラムのフィルを入れる）
export function flattenBars(song) {
  const list = [];
  song.sections.forEach((s, si) => {
    for (let k = 0; k < s.bars; k++) {
      const next = song.sections[si + 1];
      const lastOfSection = k === s.bars - 1 && s.bars >= 2;
      list.push({ section: si, part: s.part, panels: s.panels, fill: Boolean(lastOfSection && next && s.panels.rhythm) });
    }
  });
  return list;
}

export const barKey = (song, inst, pattern, bar, fill) => [song.mood, song.tempo, inst, pattern, bar % 4, fill && inst === 'rhythm' ? 1 : 0, song.quiet && inst === 'melody' ? 1 : 0].join('|');

// 曲を1本の音にする（書き出し用）。ループは、はみ出した余韻を頭にもどして、つなぎ目をなくす
export function renderSong(song, { sampleRate = 44100 } = {}) {
  const bars = flattenBars(song);
  const sr = sampleRate;
  const barLen = Math.round(barSeconds(song.tempo) * sr);
  const loop = song.length === 'loop';
  const body = bars.length * barLen;
  const total = body + (loop ? 0 : Math.round(TAIL_SEC * sr));
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const cache = new Map();
  bars.forEach((b, n) => {
    for (const inst of INSTS) {
      const pattern = b.panels[inst];
      if (!pattern) continue;
      const fill = inst === 'rhythm' && b.fill;
      const key = barKey(song, inst, pattern, n, fill);
      let r = cache.get(key);
      if (!r) {
        r = renderBar({ inst, pattern, mood: song.mood, bar: n, tempo: song.tempo, sampleRate: sr, fill, quiet: song.quiet });
        cache.set(key, r);
      }
      const off = n * barLen;
      for (let i = 0; i < r.left.length; i++) {
        let j = off + i;
        if (j >= total) {
          if (!loop) break;
          j %= total;
        }
        left[j] += r.left[i];
        right[j] += r.right[i];
      }
    }
  });
  // 音が大きすぎて割れないように、やわらかくおさえる
  const gain = song.quiet ? 0.6 : 0.85;
  for (let i = 0; i < total; i++) {
    left[i] = Math.tanh(left[i] * gain);
    right[i] = Math.tanh(right[i] * gain);
  }
  if (!loop) { // さいごはすっと消える
    const fade = Math.min(total, Math.round(0.4 * sr));
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      left[total - 1 - i] *= g;
      right[total - 1 - i] *= g;
    }
  }
  return { left, right, sampleRate: sr, seconds: total / sr };
}

// WAV（16ビット・ステレオ）にする
export function encodeWav(left, right, sampleRate) {
  const n = left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 4, true);
  const s16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, s16(left[i]), true);
    v.setInt16(46 + i * 4, s16(right[i]), true);
  }
  return new Uint8Array(buf);
}

// SNS にのせるときのクレジット（自分たちのタグ）
export function creditText(title) {
  const t = String(title || '').trim() || 'わたしの1曲';
  return `♪「${t}」うたとも（ともはね）で作りました／音 © ともはね #ともはね #うたとも`;
}
