// ※ Vとも（../vtomo/public/parts.js）の写し。直すときは Vとも のほうを直して、ここにコピーする（テストで同じか確かめる）
// Vとも のキャラの部品と描き方。ブラウザでもサーバーでも同じものを使う（外部パッケージなし）
// キャラは「部品のえらび方（look）」だけで表す。色も決まった中からえらぶので、絵（SVG）に変な文字が入らない
// 2D メタバース・やみとも などほかのアプリも、このファイルの renderStand / renderChibi でキャラを描ける

export const SKIN = ['#fde3cf', '#f9d2b4', '#f1bf98', '#d9a07a', '#b77b55', '#8a5a3c'];
export const HAIR = ['#3b2f2a', '#6b4423', '#a0522d', '#e0b04a', '#f3e0a2', '#e8739a', '#9b6bd1', '#4a7fc1', '#3a9d8f', '#f2f2f2', '#c8642a', '#2b2b48'];
export const EYE = ['#3b2f2a', '#4a7fc1', '#3a9d8f', '#9b6bd1', '#c8642a', '#b3262d'];
export const CLOTH = ['#c8642a', '#e8739a', '#6b5b95', '#3a9d8f', '#4a7fc1', '#2e9a5f', '#e9b949', '#f2f2f2', '#3b332d', '#b3262d'];

// えらべる部品。options は [id, 名前]、colors は色の一覧
export const CATALOG = {
  skin: { label: 'はだの色', group: 'かお', colors: SKIN },
  eyes: { label: 'め', group: 'かお', options: [['round', 'まんまる'], ['smile', 'にっこり'], ['sharp', 'きりっ'], ['sleepy', 'ねむそう'], ['sparkle', 'キラキラ']] },
  eyeColor: { label: 'めの色', group: 'かお', colors: EYE },
  mouth: { label: 'くち', group: 'かお', options: [['smile', 'にこっ'], ['open', 'わあ'], ['cat', 'ω'], ['flat', 'むっ']] },
  cheek: { label: 'ほっぺ', group: 'かお', options: [['on', 'ぽっ'], ['off', 'なし']] },
  hairStyle: { label: 'かみがた', group: 'かみ', options: [['short', 'ショート'], ['bob', 'ボブ'], ['long', 'ロング'], ['twin', 'ツインテール'], ['pony', 'ポニーテール'], ['spiky', 'つんつん'], ['bun', 'おだんご']] },
  hairColor: { label: 'かみの色', group: 'かみ', colors: HAIR },
  outfit: { label: 'ふく', group: 'ふく', options: [['tshirt', 'Tシャツ'], ['hoodie', 'パーカー'], ['sailor', 'セーラー'], ['jacket', 'ジャケット'], ['dress', 'ワンピース'], ['happi', 'はっぴ']] },
  outfitColor: { label: 'ふくの色', group: 'ふく', colors: CLOTH },
  accessory: { label: 'こもの', group: 'こもの', options: [['none', 'なし'], ['ribbon', 'リボン'], ['glasses', 'めがね'], ['cap', 'ぼうし'], ['headphones', 'ヘッドホン'], ['star', '星のピン'], ['catears', 'ネコみみ']] },
};
export const KEYS = Object.keys(CATALOG);
const choices = (key) => (CATALOG[key].colors || CATALOG[key].options.map(([id]) => id));

export const DEFAULT_LOOK = {
  skin: SKIN[1], eyes: 'round', eyeColor: EYE[0], mouth: 'smile', cheek: 'on',
  hairStyle: 'bob', hairColor: HAIR[1], outfit: 'hoodie', outfitColor: CLOTH[3], accessory: 'none',
};

// えらび方が決まった中にあるか確かめる。ok でなければ bad にどの部品がだめか入れて返す
export function checkLook(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, bad: 'look' };
  const look = {};
  for (const key of KEYS) {
    const v = input[key];
    if (typeof v !== 'string' || !choices(key).includes(v)) return { ok: false, bad: key };
    look[key] = v;
  }
  return { ok: true, look };
}

// おまかせ（ランダム）。rand は 0〜1 を返す関数
export function randomLook(rand = Math.random) {
  const look = {};
  for (const key of KEYS) {
    const list = choices(key);
    look[key] = list[Math.floor(rand() * list.length) % list.length];
  }
  return look;
}

const OL = '#3b2f2a'; // 線の色
const CHEEK = '#f29bb0';
// 色を明るく（+）・暗く（-）する
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const star = (cx, cy, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="#e9b949" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>`;
};

// ───────── 立ち絵（200×300） ─────────
const S = (fill, w = 3) => `fill="${fill}" stroke="${OL}" stroke-width="${w}" stroke-linejoin="round"`;
const LINE = (w = 3) => `fill="none" stroke="${OL}" stroke-width="${w}" stroke-linecap="round"`;

function standHairBack(style, c) {
  switch (style) {
    case 'long': return `<path d="M46 100 Q40 50 100 42 Q160 50 154 100 L162 236 Q130 250 100 244 Q70 250 38 236 Z" ${S(c)}/>`;
    case 'bob': return `<path d="M44 104 Q40 48 100 42 Q160 48 156 104 L160 168 Q132 178 120 160 L80 160 Q68 178 40 168 Z" ${S(c)}/>`;
    case 'twin': return `<path d="M50 80 Q10 110 22 200 Q30 230 44 206 Q38 150 60 100 Z" ${S(c)}/><path d="M150 80 Q190 110 178 200 Q170 230 156 206 Q162 150 140 100 Z" ${S(c)}/>`;
    case 'pony': return `<path d="M120 50 Q190 60 176 160 Q170 200 150 210 Q166 150 140 80 Z" ${S(c)}/>`;
    case 'bun': return `<circle cx="100" cy="38" r="22" ${S(c)}/>`;
    default: return '';
  }
}
function standHairFront(style, c) {
  let s = '';
  if (style === 'spiky') s += `<path d="M56 70 L50 28 L74 52 L84 18 L100 46 L116 18 L126 52 L150 28 L144 70 Z" ${S(c)}/>`;
  s += `<path d="M46 108 Q42 44 100 40 Q158 44 154 108 Q150 84 140 76 Q132 92 116 90 Q122 78 112 70 Q100 90 82 88 Q88 76 80 72 Q64 84 46 108 Z" ${S(c)}/>`;
  if (style === 'bob' || style === 'long') s += `<path d="M48 98 Q38 140 52 162 L60 118 Z" ${S(c)}/><path d="M152 98 Q162 140 148 162 L140 118 Z" ${S(c)}/>`;
  if (style === 'twin') s += `<circle cx="52" cy="82" r="6" fill="#e8739a" stroke="${OL}" stroke-width="2"/><circle cx="148" cy="82" r="6" fill="#e8739a" stroke="${OL}" stroke-width="2"/>`;
  return s;
}
function standEye(kind, x, color) {
  switch (kind) {
    case 'smile': return `<path d="M${x - 8} 115 Q${x} 103 ${x + 8} 115" ${LINE(3.5)}/>`;
    case 'sharp': {
      const lid = x < 100 ? `M${x - 11} 103 L${x + 10} 107` : `M${x - 10} 107 L${x + 11} 103`;
      return `<ellipse cx="${x}" cy="114" rx="8" ry="8" ${S(color, 2)}/><circle cx="${x + 3}" cy="111" r="2.5" fill="#fff"/><path d="${lid}" ${LINE(3.5)}/>`;
    }
    case 'sleepy': return `<path d="M${x - 9} 112 Q${x} 123 ${x + 9} 112 Z" ${S(color, 2)}/><path d="M${x - 10} 112 L${x + 10} 112" ${LINE(3)}/>`;
    case 'sparkle': return `<ellipse cx="${x}" cy="112" rx="10" ry="12" ${S(color, 2)}/><circle cx="${x + 3}" cy="107" r="4" fill="#fff"/><circle cx="${x - 3}" cy="117" r="2" fill="#fff"/>`;
    default: return `<ellipse cx="${x}" cy="112" rx="8" ry="10" ${S(color, 2)}/><circle cx="${x + 3}" cy="108" r="3" fill="#fff"/>`;
  }
}
function standMouth(kind) {
  switch (kind) {
    case 'open': return `<path d="M92 131 Q100 146 108 131 Z" fill="#b5434e" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>`;
    case 'cat': return `<path d="M90 132 Q95 138 100 132 Q105 138 110 132" ${LINE(2.5)}/>`;
    case 'flat': return `<path d="M93 135 L107 135" ${LINE(3)}/>`;
    default: return `<path d="M92 132 Q100 140 108 132" ${LINE(3)}/>`;
  }
}
function standOutfit(kind, c) {
  const T = 'M50 300 Q50 200 82 170 L118 170 Q150 200 150 300 Z';
  const dark = shade(c, -0.25);
  switch (kind) {
    case 'hoodie': return `<path d="${T}" ${S(c)}/><path d="M62 176 Q100 150 138 176 Q100 198 62 176 Z" ${S(dark, 2.5)}/>`
      + `<path d="M94 184 L92 214 M106 184 L108 214" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M78 250 L122 250 L130 290 L70 290 Z" ${S(dark, 2)}/>`;
    case 'sailor': return `<path d="${T}" ${S('#f7f7f7')}/><path d="M80 170 L100 206 L120 170 L142 188 L100 228 L58 188 Z" ${S(c, 2.5)}/><path d="M90 206 L110 206 L100 232 Z" ${S('#b3262d', 2)}/>`;
    case 'jacket': return `<path d="${T}" ${S(c)}/><path d="M86 170 L100 232 L114 170 Z" ${S('#fff', 2)}/><path d="M86 170 L96 212 M114 170 L104 212" fill="none" stroke="${dark}" stroke-width="3"/>`
      + `<circle cx="100" cy="246" r="3.5" fill="${dark}"/><circle cx="100" cy="266" r="3.5" fill="${dark}"/>`;
    case 'dress': return `<path d="M34 300 Q56 210 82 170 L118 170 Q144 210 166 300 Z" ${S(c)}/><path d="M84 170 Q92 188 100 177 Q108 188 116 170 Z" ${S('#fff', 2)}/><path d="M66 236 L134 236" fill="none" stroke="${dark}" stroke-width="4"/>`;
    case 'happi': return `<path d="${T}" ${S(c)}/><path d="M84 172 L96 300 M116 172 L104 300" fill="none" stroke="${dark}" stroke-width="10"/><path d="M60 262 L140 262" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/>`;
    default: return `<path d="${T}" ${S(c)}/><path d="M86 170 Q100 186 114 170" fill="none" stroke="${dark}" stroke-width="3"/>`;
  }
}
function standAccessory(kind, look) {
  switch (kind) {
    case 'ribbon': return `<g transform="translate(140 60) rotate(20)"><path d="M0 0 L-18 -12 L-18 12 Z M0 0 L18 -12 L18 12 Z" ${S('#e8739a', 2)}/><circle r="5" ${S('#c8507a', 2)}/></g>`;
    case 'glasses': return `<circle cx="80" cy="112" r="15" fill="rgba(255,255,255,.18)" stroke="${OL}" stroke-width="3"/><circle cx="120" cy="112" r="15" fill="rgba(255,255,255,.18)" stroke="${OL}" stroke-width="3"/><path d="M95 110 Q100 105 105 110" ${LINE(3)}/>`;
    case 'cap': {
      const c = look.outfitColor;
      return `<path d="M48 84 Q50 32 100 30 Q150 32 152 84 Z" ${S(c)}/><path d="M44 84 Q100 70 170 88 Q150 98 100 92 Q60 94 44 84 Z" ${S(shade(c, -0.25))}/>`;
    }
    case 'headphones': return `<path d="M44 112 Q44 32 100 30 Q156 32 156 112" fill="none" stroke="#3b332d" stroke-width="7"/><rect x="34" y="96" width="18" height="32" rx="7" ${S('#3b332d', 2)}/><rect x="148" y="96" width="18" height="32" rx="7" ${S('#3b332d', 2)}/>`;
    case 'star': return star(138, 70, 11);
    default: return '';
  }
}
const catEars = (c) => `<path d="M56 74 L58 24 L92 50 Z" ${S(c)}/><path d="M144 74 L142 24 L108 50 Z" ${S(c)}/><path d="M63 62 L64 36 L82 50 Z" fill="${CHEEK}"/><path d="M137 62 L136 36 L118 50 Z" fill="${CHEEK}"/>`;

export function renderStand(input, { size } = {}) {
  const { ok, look } = checkLook(input);
  const L = ok ? look : DEFAULT_LOOK;
  const wh = size ? ` width="${Math.round(size * (2 / 3))}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"${wh} role="img" aria-label="キャラの立ち絵">`
    + standHairBack(L.hairStyle, L.hairColor)
    + `<rect x="89" y="150" width="22" height="26" fill="${L.skin}"/>`
    + standOutfit(L.outfit, L.outfitColor)
    + `<ellipse cx="100" cy="104" rx="52" ry="54" ${S(L.skin)}/>`
    + standEye(L.eyes, 80, L.eyeColor) + standEye(L.eyes, 120, L.eyeColor)
    + (L.cheek === 'on' ? `<ellipse cx="68" cy="128" rx="8" ry="5" fill="${CHEEK}" opacity=".7"/><ellipse cx="132" cy="128" rx="8" ry="5" fill="${CHEEK}" opacity=".7"/>` : '')
    + standMouth(L.mouth)
    + (L.accessory === 'catears' ? catEars(L.hairColor) : '')
    + standHairFront(L.hairStyle, L.hairColor)
    + standAccessory(L.accessory, L)
    + '</svg>';
}

// ───────── ちびキャラ（48×64）：町を歩く用。向き down/up/left/right・歩きのコマ 0〜3 ─────────
export const DIRS = ['down', 'left', 'right', 'up'];
const s = (fill, w = 1.5) => `fill="${fill}" stroke="${OL}" stroke-width="${w}" stroke-linejoin="round"`;

function chibiBody(L, dir, step) {
  const pants = '#3b332d';
  let legs;
  if (dir === 'left') {
    legs = step ? `<rect x="16" y="50" width="5" height="10" rx="2" fill="${pants}"/><rect x="27" y="50" width="5" height="10" rx="2" fill="${pants}"/>`
      : `<rect x="21" y="50" width="6" height="10" rx="2" fill="${pants}"/>`;
  } else {
    legs = `<rect x="18" y="50" width="5" height="${step === 'a' ? 7 : 10}" rx="2" fill="${pants}"/><rect x="25" y="50" width="5" height="${step === 'b' ? 7 : 10}" rx="2" fill="${pants}"/>`;
  }
  const c = L.outfitColor;
  const torso = L.outfit === 'dress' ? `<path d="M13 53 L17 36 L31 36 L35 53 Z" ${s(c)}/>` : `<rect x="15" y="36" width="18" height="16" rx="5" ${s(L.outfit === 'sailor' ? '#f7f7f7' : c)}/>`;
  const trim = L.outfit === 'sailor' ? `<path d="M18 36 L24 43 L30 36" fill="none" stroke="${c}" stroke-width="2.5"/>`
    : L.outfit === 'happi' || L.outfit === 'jacket' ? `<path d="M21 37 L23 51 M27 37 L25 51" stroke="${shade(c, -0.3)}" stroke-width="2"/>` : '';
  const swing = step === 'a' ? 1.5 : step === 'b' ? -1.5 : 0;
  const arms = dir === 'left'
    ? `<rect x="21" y="${38 + swing}" width="5" height="11" rx="2.5" ${s(shade(c, -0.1), 1)}/>`
    : `<rect x="11" y="${38 + swing}" width="5" height="11" rx="2.5" ${s(c, 1)}/><rect x="32" y="${38 - swing}" width="5" height="11" rx="2.5" ${s(c, 1)}/>`;
  return legs + (dir === 'left' ? torso + trim + arms : arms + torso + (dir === 'down' ? trim : ''));
}
function chibiHairBack(L, dir) {
  const c = L.hairColor;
  if (dir === 'up') return '';
  let out = '';
  if (L.hairStyle === 'long') out += `<rect x="9" y="18" width="30" height="${dir === 'down' ? 26 : 24}" rx="7" ${s(c)}/>`;
  if (L.hairStyle === 'bob') out += `<rect x="8" y="16" width="32" height="16" rx="7" ${s(c)}/>`;
  if (L.hairStyle === 'twin') out += dir === 'left' ? `<ellipse cx="36" cy="30" rx="4" ry="9" ${s(c)}/>` : `<ellipse cx="6" cy="30" rx="4" ry="9" ${s(c)}/><ellipse cx="42" cy="30" rx="4" ry="9" ${s(c)}/>`;
  if (L.hairStyle === 'pony' && dir === 'left') out += `<ellipse cx="38" cy="26" rx="5" ry="9" ${s(c)}/>`;
  if (L.hairStyle === 'bun') out += `<circle cx="${dir === 'left' ? 30 : 24}" cy="7" r="6" ${s(c)}/>`;
  return out;
}
function chibiHairFront(L, dir) {
  const c = L.hairColor;
  let out = '';
  if (L.hairStyle === 'spiky') out += `<path d="M12 14 L11 2 L18 9 L22 0 L26 8 L31 0 L33 9 L38 3 L36 14 Z" ${s(c)}/>`;
  if (dir === 'up') {
    out += `<circle cx="24" cy="22" r="15.5" ${s(c)}/>`;
    if (L.hairStyle === 'long') out += `<rect x="10" y="22" width="28" height="22" rx="7" ${s(c)}/>`;
    if (L.hairStyle === 'bob') out += `<rect x="9" y="20" width="30" height="14" rx="7" ${s(c)}/>`;
    if (L.hairStyle === 'twin') out += `<ellipse cx="6" cy="30" rx="4" ry="9" ${s(c)}/><ellipse cx="42" cy="30" rx="4" ry="9" ${s(c)}/>`;
    if (L.hairStyle === 'pony') out += `<ellipse cx="24" cy="36" rx="5" ry="9" ${s(c)}/>`;
    if (L.hairStyle === 'bun') out += `<circle cx="24" cy="8" r="6" ${s(c)}/>`;
    return out;
  }
  if (dir === 'left') return out + `<path d="M24 7 Q40 7 39.5 24 Q39 34 31 34 Q33 22 24 18 Q16 16 9.5 23 Q11 8 24 7 Z" ${s(c)}/>`;
  return out + `<path d="M9 25 Q8 6 24 6 Q40 6 39 25 Q36 16 30 14 Q27 20 21 18 Q23 14 18 14 Q12 18 9 25 Z" ${s(c)}/>`;
}
function chibiFace(L, dir) {
  if (dir === 'up') return '';
  const xs = dir === 'left' ? [14] : [18, 30];
  let eyes = '';
  for (const x of xs) {
    if (L.eyes === 'smile') eyes += `<path d="M${x - 2.5} 25 Q${x} 21.5 ${x + 2.5} 25" fill="none" stroke="${OL}" stroke-width="1.4" stroke-linecap="round"/>`;
    else if (L.eyes === 'sleepy') eyes += `<path d="M${x - 2.5} 24 L${x + 2.5} 24" stroke="${OL}" stroke-width="1.4" stroke-linecap="round"/>`;
    else eyes += `<ellipse cx="${x}" cy="24" rx="${L.eyes === 'sparkle' ? 2.8 : 2.2}" ry="${L.eyes === 'sparkle' ? 3.4 : 2.8}" fill="${L.eyeColor}"/><circle cx="${x + 0.8}" cy="23" r="0.9" fill="#fff"/>`;
  }
  const mx = dir === 'left' ? 12 : 24;
  const mouth = L.mouth === 'open' ? `<ellipse cx="${mx}" cy="30" rx="1.8" ry="1.5" fill="#b5434e"/>`
    : L.mouth === 'flat' ? `<path d="M${mx - 1.8} 30 L${mx + 1.8} 30" stroke="${OL}" stroke-width="1.2" stroke-linecap="round"/>`
      : `<path d="M${mx - 2} 29.5 Q${mx} 31.5 ${mx + 2} 29.5" fill="none" stroke="${OL}" stroke-width="1.2" stroke-linecap="round"/>`;
  const cheek = L.cheek === 'on' ? (dir === 'left' ? `<ellipse cx="17" cy="28.5" rx="2.4" ry="1.4" fill="${CHEEK}" opacity=".8"/>`
    : `<ellipse cx="14.5" cy="28.5" rx="2.4" ry="1.4" fill="${CHEEK}" opacity=".8"/><ellipse cx="33.5" cy="28.5" rx="2.4" ry="1.4" fill="${CHEEK}" opacity=".8"/>`) : '';
  return eyes + cheek + mouth;
}
function chibiAccessory(L, dir) {
  switch (L.accessory) {
    case 'catears': return `<path d="M11 15 L11 3 L19 9 Z" ${s(L.hairColor)}/><path d="M37 15 L37 3 L29 9 Z" ${s(L.hairColor)}/>`;
    case 'ribbon': return `<path d="M34 9 L29 6 L29 12 Z M34 9 L39 6 L39 12 Z" ${s('#e8739a', 1)}/>`;
    case 'cap': return `<path d="M9 17 Q10 4 24 4 Q38 4 39 17 Z" ${s(L.outfitColor)}/>`
      + (dir === 'up' ? '' : `<path d="${dir === 'left' ? 'M2 17 L24 15 L24 19 Z' : 'M8 17 Q24 13 40 17 Q24 20 8 17 Z'}" ${s(shade(L.outfitColor, -0.25), 1)}/>`);
    case 'headphones': return `<path d="M9 22 Q9 5 24 5 Q39 5 39 22" fill="none" stroke="#3b332d" stroke-width="2.5"/>`
      + (dir === 'left' ? `<rect x="22" y="18" width="6" height="9" rx="2.5" fill="#3b332d"/>` : `<rect x="6" y="18" width="6" height="9" rx="2.5" fill="#3b332d"/><rect x="36" y="18" width="6" height="9" rx="2.5" fill="#3b332d"/>`);
    case 'glasses': return dir === 'up' ? '' : dir === 'left' ? `<circle cx="14" cy="24" r="4" fill="none" stroke="${OL}" stroke-width="1.2"/>`
      : `<circle cx="18" cy="24" r="4" fill="none" stroke="${OL}" stroke-width="1.2"/><circle cx="30" cy="24" r="4" fill="none" stroke="${OL}" stroke-width="1.2"/><path d="M22 24 L26 24" stroke="${OL}" stroke-width="1.2"/>`;
    case 'star': return dir === 'up' ? '' : `<circle cx="${dir === 'left' ? 30 : 34}" cy="12" r="2.6" fill="#e9b949" stroke="${OL}" stroke-width="1"/>`;
    default: return '';
  }
}

export function renderChibi(input, { dir = 'down', frame = 0, size } = {}) {
  const { ok, look } = checkLook(input);
  const L = ok ? look : DEFAULT_LOOK;
  const d = DIRS.includes(dir) ? dir : 'down';
  const f = ((Number(frame) || 0) % 4 + 4) % 4;
  const step = f === 1 ? 'a' : f === 3 ? 'b' : null;
  const draw = d === 'right' ? 'left' : d;
  const bob = step ? -1 : 0;
  const body = `<g transform="translate(0 ${bob})">`
    + chibiHairBack(L, draw)
    + chibiBody(L, draw, step)
    + `<circle cx="24" cy="22" r="15" ${s(L.skin)}/>`
    + chibiFace(L, draw)
    + chibiHairFront(L, draw)
    + chibiAccessory(L, draw)
    + '</g>';
  const shadow = '<ellipse cx="24" cy="61" rx="11" ry="2.5" fill="rgba(0,0,0,.15)"/>';
  const inner = d === 'right' ? `<g transform="translate(48 0) scale(-1 1)">${body}</g>` : body;
  const wh = size ? ` width="${Math.round(size * 0.75)}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 64"${wh} role="img" aria-label="町を歩くキャラ">${shadow}${inner}</svg>`;
}
