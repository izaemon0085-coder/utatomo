// うたとも の 🔔 効果音モード：オノマトペ（「ドカーン！！」）から、計算だけで効果音を作る（AI なし・ほかの音源を取りこまない）
// ブラウザでもテストでも同じものを使う。外部パッケージなし
// ・ことばと音の組み合わせ表は運営が作る（SFX_WORDS）。表にないことばは「ピコッ」の音にして、そう伝える
// ・「！」の数で強さ、「ー」で長さ、ひらがなはやわらかく、「ッ」で短く、くり返し（シュワシュワ）で回数
// ・耳を守る：いちばん大きなところを PEAK にそろえる（大きすぎる音にしない）
import { precheck } from './precheck.js';

export const SFX_TEXT_MAX = 12;
export const PEAK = 0.7;
export const LEN_MIN = 0.1;
export const LEN_MAX = 4;
export const VARIANTS = 5;

// 音のもと（label は画面に出す名前）
export const BASES = {
  boom: '爆発・ドーン', hit: 'たたく・ドン', pop: 'はじける・ポン', beep: '電子音・ピロリン', bell: 'キラキラ・ベル',
  swoosh: '風・ヒュー', laser: 'ビーム・ピューン', fizz: 'あわ・シュワ', step: '足音・トコトコ', clap: '拍手・パチパチ',
};
// ことばと音の組み合わせ表（カタカナで書く。ことばのはじめに近く、長く合うものを使う）
export const SFX_WORDS = [
  ['ドカ', 'boom'], ['ドッカ', 'boom'], ['バーン', 'boom'], ['ドーン', 'boom'], ['ボカ', 'boom'], ['ゴゴゴ', 'boom'],
  ['ドン', 'hit'], ['ガン', 'hit'], ['ゴン', 'hit'], ['バン', 'hit'], ['ドスン', 'hit'], ['ズシン', 'hit'],
  ['ポン', 'pop'], ['パン', 'pop'], ['ポコ', 'pop'], ['ポッ', 'pop'], ['プチ', 'pop'],
  ['ピロ', 'beep'], ['ピコ', 'beep'], ['ピッ', 'beep'], ['ピポ', 'beep'], ['ポロ', 'beep'], ['ピン', 'beep'],
  ['キラ', 'bell'], ['リーン', 'bell'], ['チリン', 'bell'], ['シャラ', 'bell'], ['キーン', 'bell'], ['カーン', 'bell'],
  ['ヒュー', 'swoosh'], ['シュッ', 'swoosh'], ['ビュン', 'swoosh'], ['ブン', 'swoosh'], ['ザッ', 'swoosh'], ['サッ', 'swoosh'],
  ['ピュー', 'laser'], ['ビー', 'laser'], ['ビビ', 'laser'], ['ギュイ', 'laser'],
  ['シュワ', 'fizz'], ['パチ', 'clap'], ['トコ', 'step'], ['コツ', 'step'], ['タッ', 'step'], ['テク', 'step'], ['ペタ', 'step'],
];

const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const SMALL = new Set([...'ァィゥェォャュョッヮ']);
const DAKU = /[ガギグゲゴザジズゼゾダヂヅデドバビブベボヴ]/; // にごる音（パ行はかるいので入れない）
// 音のかずを数える（「ー」「ッ」小さい字は数えない）
export const morae = (k) => [...k].filter((c) => /[ァ-ヺ]/.test(c) && !SMALL.has(c)).length;

// オノマトペ → 音のレシピ
export function parseSfx(raw) {
  const text = String(raw ?? '').trim().slice(0, SFX_TEXT_MAX * 2);
  const marks = (text.match(/[!！]/g) || []).length;
  const body = text.replace(/[!！♪〜~、。\s]/g, '');
  const kata = toKata(body);
  const hira = /[ぁ-ゖ]/.test(body) && !/[ァ-ヺ]/.test(body);
  // ことばのはじめに近いものを先に、同じ場所なら長いものを（「ドカーン」は「ドカ」＝爆発。「カーン」ではない）
  const hit = SFX_WORDS.filter(([w]) => kata.includes(w)).sort((a, b) => kata.indexOf(a[0]) - kata.indexOf(b[0]) || b[0].length - a[0].length)[0];
  const base = hit ? hit[1] : 'beep';
  // くり返し：「シュワシュワ」「トコトコ」のように前半と後半が同じ
  const half = kata.length / 2;
  const repeats = kata.length >= 4 && Number.isInteger(half) && kata.slice(0, half) === kata.slice(half) ? 2 : 1;
  const longs = (kata.match(/ー/g) || []).length;
  const recipe = {
    base,
    known: Boolean(hit),
    intensity: Math.min(1, 0.45 + 0.18 * Math.min(3, marks)),
    length: Math.min(LEN_MAX, (base === 'step' || base === 'clap' ? 0.5 : base === 'boom' ? 0.9 : base === 'bell' ? 0.8 : 0.35) + 0.25 * Math.min(4, longs)),
    soft: hira ? 0.65 : 0.2,
    short: /ッ$/.test(kata) || /ッ[!！]*$/.test(body),
    heavyWord: DAKU.test(kata),
    notes: Math.max(1, Math.min(5, morae(kata.replace(/ー/g, '')))),
    repeats,
  };
  if (recipe.short) recipe.length = Math.max(LEN_MIN, recipe.length * 0.5);
  return recipe;
}

// オノマトペを確かめる（長さ・送る前のチェック。block は書き出せない）
export function checkSfxText(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return { ok: false, error: 'オノマトペを書いてください（例：ドカーン！）' };
  if ([...t].length > SFX_TEXT_MAX) return { ok: false, error: `オノマトペは${SFX_TEXT_MAX}文字までにしてください` };
  const c = precheck(t);
  if (c.level === 'block') return { ok: false, error: `このことばは使えません（${c.reason}）` };
  return { ok: true, text: t };
}

// 感覚スライダー：cute（-1 不気味 … +1 かわいい）・heavy（-1 軽い … +1 重い）・retro（0 いまの音 … 1 8bit）
export const FEEL = {
  cute: { label: 'かわいい ⇔ 不気味', min: -1, max: 1, step: 0.1, value: 0, left: '不気味', right: 'かわいい' },
  heavy: { label: '軽い ⇔ 重い', min: -1, max: 1, step: 0.1, value: 0, left: '軽い', right: '重い' },
  retro: { label: 'いまの音 ⇔ レトロ（8bit）', min: 0, max: 1, step: 0.1, value: 0, left: 'いまの音', right: '8bit' },
};

function rngOf(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 1つの効果音を作る。opts：feel（cute/heavy/retro）・length（秒、なければレシピの長さ）・seed（ちがいを作る）
export function renderSfx(recipe, { sampleRate = 44100, feel = {}, length, seed = 1 } = {}) {
  const sr = sampleRate;
  const rng = rngOf(seed * 7919 + 13);
  const vary = seed > 1 ? (rng() - 0.5) : 0; // 2つ目からは少しずつちがう
  const cute = clamp(Number(feel.cute) || 0, -1, 1);
  const heavy = clamp(Number(feel.heavy) || 0, -1, 1) + (recipe.heavyWord ? 0.25 : 0);
  const retro = clamp(Number(feel.retro) || 0, 0, 1);
  const D = clamp(Number(length) || recipe.length * (1 + vary * 0.16), LEN_MIN, LEN_MAX);
  const n = Math.round(D * sr);
  const out = new Float32Array(n);
  // 高さ：重いほど低く、かわいいほど高く、ちがいは ±1半音
  const pitch = 2 ** ((-7 * heavy + 5 * Math.max(0, cute) - 4 * Math.max(0, -cute) + vary * 2) / 12);
  const wobble = Math.max(0, -cute); // 不気味：ゆらぎ
  const hard = 1 - recipe.soft;
  const osc = (ph) => {
    const s = Math.sin(ph);
    return retro > 0 ? (1 - retro) * s + retro * Math.sign(s) * 0.7 : s; // レトロ：四角い波に近づける
  };
  let noiseLp = 0;
  const noise = (cut) => { noiseLp += cut * ((rng() * 2 - 1) - noiseLp); return noiseLp; };
  const reps = recipe.repeats * (recipe.base === 'step' || recipe.base === 'clap' ? 2 : 1);
  const seg = n / reps;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const local = (i % seg) / sr; // くり返しの中の時間
    const segD = seg / sr;
    const x = t / D; // 0〜1
    const wob = 1 + wobble * 0.03 * Math.sin(TAU * 6 * t);
    let v = 0;
    switch (recipe.base) {
      case 'boom': {
        const f = (40 + 120 * Math.exp(-t * 9)) * pitch * wob;
        ph += (TAU * f) / sr;
        v = osc(ph) * Math.exp(-t * (3.5 / D)) * 0.8 + noise(0.08 + 0.2 * hard) * Math.exp(-t * (5 / D)) * 2.2;
        break;
      }
      case 'hit': {
        const f = (60 + 140 * Math.exp(-local * 30)) * pitch;
        ph += (TAU * f) / sr;
        v = osc(ph) * Math.exp(-local * (8 / segD)) + noise(0.5) * Math.exp(-local * 60) * 0.6 * hard;
        break;
      }
      case 'pop': {
        const f = (500 + 500 * (1 - Math.exp(-local * 40))) * pitch;
        ph += (TAU * f) / sr;
        v = osc(ph) * Math.exp(-local * (14 / segD)) * Math.min(1, local * 800);
        break;
      }
      case 'beep': case 'bell': {
        // 音のかずだけ、上がっていく音（ピ・ロ・リ・ン）
        const k = Math.min(recipe.notes - 1, Math.floor(x * recipe.notes));
        const nt = (x * recipe.notes) - k;
        const steps = [0, 4, 7, 12, 16];
        const f = (recipe.base === 'bell' ? 1046 : 880) * pitch * 2 ** (steps[k] / 12) * wob;
        const tt = nt * (D / recipe.notes);
        if (recipe.base === 'bell') v = Math.sin(TAU * f * tt + 2.2 * Math.exp(-tt * 4) * Math.sin(TAU * f * 3.5 * tt)) * Math.exp(-tt * 3.5);
        else { ph += (TAU * f) / sr; v = osc(ph) * Math.min(1, tt * 300) * (nt < 0.85 ? 1 : (1 - nt) / 0.15) * 0.6; }
        break;
      }
      case 'swoosh': {
        const c = clamp(0.02 + 0.25 * Math.sin(Math.PI * x) * pitch, 0.01, 0.6);
        v = noise(c) * Math.sin(Math.PI * x) * 3.2;
        break;
      }
      case 'laser': {
        const f = (1600 * Math.exp(-x * 2.6) + 160) * pitch * wob;
        ph += (TAU * f) / sr;
        v = osc(ph) * (1 - x) * 0.8;
        break;
      }
      case 'fizz': {
        v = noise(0.7) * 0.25 * (1 - x * 0.5);
        if (rng() < 0.0012) ph = 1; // あわがはじける
        if (ph > 0) { v += Math.sin(TAU * (1800 + rng() * 1500) * pitch * t) * ph * 0.5; ph *= 0.996; }
        break;
      }
      case 'step': {
        v = noise(0.12) * Math.exp(-local * (22 / segD)) * 3 + Math.sin(TAU * 140 * pitch * local) * Math.exp(-local * 50) * 0.5;
        break;
      }
      case 'clap': {
        const b = local < 0.03 ? Math.exp(-((local % 0.01) * 300)) : Math.exp(-(local - 0.03) * 25);
        v = noise(0.9) * b * 1.6;
        break;
      }
      default: break;
    }
    // やわらかい（ひらがな）：はじまりをなめらかに。おわりは少しずつ消す
    const attack = Math.min(1, t / (0.002 + 0.03 * recipe.soft));
    const release = x > 0.92 ? (1 - x) / 0.08 : 1;
    out[i] = v * attack * release * (0.5 + 0.5 * recipe.intensity);
  }
  // レトロ：音の細かさをへらす（8bit 風）
  if (retro > 0) {
    const hold = Math.max(1, Math.round(1 + retro * 6));
    const levels = Math.round(2 ** (8 - 5 * retro));
    for (let i = 0; i < n; i++) {
      const s = out[i - (i % hold)];
      out[i] = Math.round(s * levels) / levels;
    }
  }
  // 耳を守る：いちばん大きなところを PEAK にそろえる
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) { const g = (PEAK * (0.7 + 0.3 * recipe.intensity)) / peak; for (let i = 0; i < n; i++) out[i] *= g; }
  return { left: out, right: out, seconds: D, sampleRate: sr };
}

// 5つのちがい（同じレシピ・少しずつちがう高さと長さ）
export const variants = (recipe, opts = {}) => Array.from({ length: VARIANTS }, (_, k) => renderSfx(recipe, { ...opts, seed: k + 1 }));

// 画面に出す説明（「ドカーン！！ → 爆発・ドーン／強さ★★★／長さ1.15秒」）
export function describe(recipe) {
  const stars = '★'.repeat(Math.round(1 + recipe.intensity * 2));
  return `${BASES[recipe.base]}／強さ${stars}／長さ${recipe.length.toFixed(2)}秒${recipe.soft > 0.5 ? '／やわらか' : ''}${recipe.repeats > 1 ? '／くり返し' : ''}${recipe.known ? '' : '（表にないことばなので、ピコッの音にしたよ）'}`;
}

// ファイル名（オノマトペから。使えない文字はのぞく）
export const sfxFileName = (text, k = 0) => `${String(text).replace(/[\\/:*?"<>|\s]/g, '').slice(0, 12) || 'sfx'}${k ? `_${k}` : ''}.wav`;
