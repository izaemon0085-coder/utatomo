// みんなで1曲：ルームに集まって、1人1パートずつ受けもって1曲を作る
// パートは「リズム・ベース・コード・メロディ・キラキラ」の5つと「歌詞」の、ぜんぶで6つ。自分のパートだけ直せる
// 子どもは子どもどうし（同じ年齢の区分の人だけが入れる）。歌詞は送る前のチェックを通す
// データはメモリの中だけ（β版）
import { randomInt } from 'node:crypto';
import { buildBgm, checkSong, cleanLyric, allLyrics, INSTS, PANELS, MOODS, LENGTHS } from './public/music.js';
import { precheck } from './public/precheck.js';
import { HttpError, checkTitle } from './studio.js';

export const ROOM_PARTS = [...INSTS, 'lyric'];
export const PART_LABEL = { ...Object.fromEntries(INSTS.map((i) => [i, PANELS[i].label])), lyric: '歌詞' };
export const MAX_ROOMS_PER_PERSON = 3;
export const MAX_ROOMS = 500;
export const ROOM_DAYS = 7; // ルームは7日でしまう
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // まちがえやすい 0O1I は使わない
const AGE = { child: '子ども', teen: '中高生', adult: '大人' };

export function createRooms({ studio, now = () => Date.now() } = {}) {
  const rooms = new Map(); // code → room
  const person = (id) => {
    const p = studio.person(id);
    if (!p) throw new HttpError(401, 'ともはねでログインしてください');
    return p;
  };
  const sweep = () => {
    for (const [code, r] of rooms) if (now() - r.createdAt > ROOM_DAYS * 86400e3) rooms.delete(code);
  };
  const newCode = () => {
    for (;;) {
      const c = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
      if (!rooms.has(c)) return c;
    }
  };
  const get = (meId, code) => {
    sweep();
    const me = person(meId);
    const r = rooms.get(String(code ?? '').toUpperCase());
    // 年齢の区分がちがうルームは「ない」ことにする（子どもは子どもどうし）
    if (!r || r.ageGroup !== me.ageGroup) throw new HttpError(404, 'ルームが見つかりません（番号をたしかめてね）');
    return { me, r };
  };
  const partOf = (r, gameId) => ROOM_PARTS.find((p) => r.parts[p]?.gameId === gameId) || null;
  const view = (r, me) => ({
    code: r.code,
    title: r.title,
    owner: r.owner.name,
    mine: r.owner.gameId === me.gameId,
    myPart: partOf(r, me.gameId),
    parts: Object.fromEntries(ROOM_PARTS.map((p) => [p, r.parts[p] ? r.parts[p].name : null])),
    song: structuredClone(r.song),
    version: r.version,
    ageGroup: AGE[r.ageGroup],
    updatedAt: r.updatedAt,
  });
  const touch = (r) => { r.version += 1; r.updatedAt = now(); };

  return {
    // わたしの年齢の区分のルーム（新しい順）
    list(meId) {
      sweep();
      const me = person(meId);
      return {
        rooms: [...rooms.values()].filter((r) => r.ageGroup === me.ageGroup).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)
          .map((r) => ({ code: r.code, title: r.title, owner: r.owner.name, free: ROOM_PARTS.filter((p) => !r.parts[p]).length, joined: Boolean(partOf(r, me.gameId)) || r.owner.gameId === me.gameId })),
      };
    },
    create(meId, { title, mood, length } = {}) {
      sweep();
      const me = person(meId);
      const t = checkTitle(title);
      if (!MOODS[mood]) throw new HttpError(400, '雰囲気をえらんでください');
      const len = length === 'loop' ? 'loop' : Number(length);
      if (!LENGTHS[len]) throw new HttpError(400, '長さをえらんでください');
      if ([...rooms.values()].filter((r) => r.owner.gameId === me.gameId).length >= MAX_ROOMS_PER_PERSON) throw new HttpError(409, `ルームは1人${MAX_ROOMS_PER_PERSON}つまでです`);
      if (rooms.size >= MAX_ROOMS) throw new HttpError(503, 'β版のルームがいっぱいです。運営に知らせてください');
      // はじめは、コードだけ鳴っている曲。ほかのパートは、受けもった人が入れる
      const song = buildBgm(mood, len);
      for (const s of song.sections) for (const inst of INSTS) if (inst !== 'chord') s.panels[inst] = null;
      const r = {
        code: newCode(), title: t, owner: { gameId: me.gameId, name: me.name }, ageGroup: me.ageGroup,
        parts: {}, song, version: 1, createdAt: now(), updatedAt: now(),
      };
      r.parts.chord = { gameId: me.gameId, name: me.name }; // 作った人は、まずコードを受けもつ
      rooms.set(r.code, r);
      return view(r, me);
    },
    get(meId, code) {
      const { me, r } = get(meId, code);
      return view(r, me);
    },
    // パートを受けもつ（1人1パート。ほかのパートを受けもっていたら、そちらははなす）
    claim(meId, code, part) {
      const { me, r } = get(meId, code);
      if (!ROOM_PARTS.includes(part)) throw new HttpError(400, 'パートをえらんでください');
      if (r.parts[part] && r.parts[part].gameId !== me.gameId) throw new HttpError(409, `「${PART_LABEL[part]}」は ${r.parts[part].name} さんが受けもっています`);
      const old = partOf(r, me.gameId);
      if (old && old !== part) delete r.parts[old];
      r.parts[part] = { gameId: me.gameId, name: me.name };
      touch(r);
      return view(r, me);
    },
    release(meId, code) {
      const { me, r } = get(meId, code);
      const old = partOf(r, me.gameId);
      if (old) { delete r.parts[old]; touch(r); }
      return view(r, me);
    },
    // 自分のパートだけを書きかえる。values は部分ごと（楽器ならパネルの名前か null、歌詞なら文字）
    edit(meId, code, { part, values, version } = {}) {
      const { me, r } = get(meId, code);
      if (partOf(r, me.gameId) !== part) throw new HttpError(403, '自分の受けもったパートだけ直せます');
      if (!Array.isArray(values) || values.length !== r.song.sections.length) throw new HttpError(400, '部分の数が合いません');
      const next = structuredClone(r.song);
      next.sections.forEach((s, i) => {
        if (part === 'lyric') {
          const l = cleanLyric(values[i]);
          if (l === null) throw new HttpError(400, `${i + 1}番目の部分の歌詞が多すぎます（4行・80文字まで）`);
          if (l) s.lyric = l; else delete s.lyric;
        } else {
          const v = values[i] ?? null;
          if (v !== null && !Object.hasOwn(PANELS[part].options, v)) throw new HttpError(400, 'パネルの名前が正しくありません');
          s.panels[part] = v;
        }
      });
      const ok = checkSong(next);
      if (!ok.ok) throw new HttpError(400, '曲の形が正しくありません');
      const c = precheck(allLyrics(ok.song));
      if (c.level === 'block') throw new HttpError(400, `この歌詞は入れられません（${c.reason}）`);
      r.song = ok.song;
      touch(r);
      return { ...view(r, me), conflict: Number.isInteger(version) && version !== r.version - 1 };
    },
    // 作った人だけ：ルームをしまう
    remove(meId, code) {
      const { me, r } = get(meId, code);
      if (r.owner.gameId !== me.gameId) throw new HttpError(403, 'ルームをしまえるのは、作った人だけです');
      rooms.delete(r.code);
      return { ok: true };
    },
  };
}
