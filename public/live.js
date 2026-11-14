// ライブコード：うたとも で作った曲を、ともーるアリーナの「🎤 ライブ」に持っていくための文字列
// 中身は「曲の名前・曲の設計図・キャラの部品のえらび方・コール」だけ（声は入れない。声は端末の外に出さない）
// うたとも（作る）でも、アリーナ（ライブを開く・見る）でも、同じファイルを使う
import { checkSong, allLyrics, CALLS } from './music.js';
import { checkLook } from './parts.js';
import { precheck } from './precheck.js';

export { CALLS }; // コール：観客がいっしょに声を出すところ。決まった言葉だけ（music.js で決める）
export const LIVE_TITLE_MAX = 20;

// 曲（部分ごとの call）から、ライブの中身を作る
export function liveFromSong({ title, song, look = null }) {
  const calls = song.sections.map((s, section) => (s.call ? { section, word: s.call } : null)).filter(Boolean);
  return checkLive({ title, song, look, calls });
}
export const LIVE_CODE_MAX = 16000;

const cleanTitle = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

// ライブの中身が決まった形かどうか。だめなら bad にどこがだめか入れる
export function checkLive(input) {
  const bad = (what, reason) => ({ ok: false, bad: what, ...(reason ? { reason } : {}) });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('live');
  const title = cleanTitle(input.title);
  if (!title || [...title].length > LIVE_TITLE_MAX) return bad('title');
  if (/https?:|www\.|[@＠]|\.(com|jp|net)/i.test(title) || /[0-9０-９]{4,}/.test(title)) return bad('title');
  const s = checkSong(input.song);
  if (!s.ok) return bad(s.bad === 'lyric' ? 'lyric' : 'song');
  const c = precheck([title, allLyrics(s.song)].join('\n'));
  if (c.level === 'block') return bad('lyric', c.reason);
  let look = null;
  if (input.look != null) {
    const l = checkLook(input.look);
    if (!l.ok) return bad('look');
    look = l.look;
  }
  const calls = [];
  for (const x of Array.isArray(input.calls) ? input.calls : []) {
    if (!x || !Number.isInteger(x.section) || x.section < 0 || x.section >= s.song.sections.length) return bad('calls');
    if (!CALLS.includes(x.word)) return bad('calls');
    if (calls.some((y) => y.section === x.section)) return bad('calls');
    calls.push({ section: x.section, word: x.word });
  }
  calls.sort((a, b) => a.section - b.section);
  return { ok: true, live: { v: 1, title, song: s.song, look, calls } };
}

// 文字列にする（URL にのせられる形）・もどす
export function encodeLive(live) {
  const bytes = new TextEncoder().encode(JSON.stringify(live));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeLive(code) {
  const s = String(code ?? '').trim();
  if (!s || s.length > LIVE_CODE_MAX || !/^[\w-]+$/.test(s)) return { ok: false, bad: 'code' };
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    return checkLive(json);
  } catch {
    return { ok: false, bad: 'code' };
  }
}

// 部分 i が始まる1小節前から、その部分のコールを出す（観客が声を合わせやすいように）
export function callAt(live, at) {
  const next = live.calls.find((c) => c.section === at.section + 1);
  const here = live.calls.find((c) => c.section === at.section);
  const bars = live.song.sections[at.section]?.bars || 1;
  if (next && at.progress >= 1 - 1 / bars) return { word: next.word, soon: true };
  if (here && at.progress < 1 / bars) return { word: here.word, soon: false };
  return null;
}
