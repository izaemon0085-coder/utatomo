// うたとも の頭脳：曲の保存（1人10曲まで）・案内役のことば
// 保存するのは「曲の設計図」（雰囲気・テンポ・部分とパネル）だけ。音はブラウザでいつでも作りなおせる
// データはメモリの中だけ（β版。サーバーを止めると消える）
import { randomUUID } from 'node:crypto';
import { checkSong } from './public/music.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MAX_SONGS = 10; // 1人で保存できる曲は10曲まで
export const MAX_TOTAL = 20000; // β版で保存できるのは全部で2万曲まで
export const TITLE_MAX = 20;
const AGE = { child: '子ども', teen: '中高生', adult: '大人' };
const newId = () => `s_${randomUUID().slice(0, 8)}`;

// 曲の名前に、アドレス・メールアドレス・電話番号のような数字を入れない（個人情報を守る）
export function checkTitle(v) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) throw new HttpError(400, '曲の名前を入れてください');
  if ([...s].length > TITLE_MAX) throw new HttpError(400, `曲の名前は${TITLE_MAX}文字までです`);
  if (/https?:|www\.|[@＠]|\.(com|jp|net)/i.test(s)) throw new HttpError(400, '曲の名前に、アドレスやメールアドレスは入れられません');
  if (/[0-9０-９]{4,}/.test(s)) throw new HttpError(400, '曲の名前に、長い数字（電話番号など）は入れられません');
  return s;
}

// 案内役：クロツグミ（日本の野鳥。春から夏、森できれいな声でさえずる）。2026-11-14 ユーザーが決めた
export const GUIDE = { name: 'クロツグミ', img: '/avatars/kurotsugumi.svg' };
const SAY = {
  guest: 'ようこそ、うたとも へ！ぼくはクロツグミ、森の歌い手だよ。パネルをタップするだけで曲ができるよ♪ 保存するときは「ともはねでログイン」してね。',
  empty: 'いらっしゃい♪ 雰囲気と長さをえらんで「おまかせ」を押すと、すぐに1曲できるよ。',
  some: 'おかえり♪ きょうはどんな曲にする？',
  full: '10曲そろったね！新しく保存するときは、どれかを消すか、上書きしてね。',
  saved: 'いい曲！ちゃんと保存したよ♪',
};

export function createStudio({ now = () => Date.now() } = {}) {
  const people = new Map(); // gameId → { gameId, name, ageGroup }
  const songs = new Map(); // id → { id, ownerId, title, song, createdAt, updatedAt }
  const person = (id) => {
    const p = people.get(id);
    if (!p) throw new HttpError(401, 'ともはねでログインしてください');
    return p;
  };
  const mine = (ownerId) => [...songs.values()].filter((s) => s.ownerId === ownerId).sort((a, b) => a.createdAt - b.createdAt);
  const own = (meId, id) => {
    const s = songs.get(id);
    if (!s || s.ownerId !== meId) throw new HttpError(404, '曲が見つかりません');
    return s;
  };
  const pub = (s) => ({ id: s.id, title: s.title, song: structuredClone(s.song), updatedAt: s.updatedAt });
  const song = (input) => {
    const r = checkSong(input);
    if (!r.ok) throw new HttpError(400, `曲の形が正しくありません（${r.bad}）`);
    return r.song;
  };

  return {
    upsertPerson({ gameId, name, ageGroup }) {
      if (!/^[\w-]{3,40}$/.test(String(gameId)) || !AGE[ageGroup]) throw new HttpError(400, 'ともはねの情報が正しくありません');
      const n = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
      if (!n) throw new HttpError(400, 'ともはねの情報が正しくありません');
      const p = { gameId, name: n, ageGroup };
      people.set(gameId, p);
      return p;
    },
    person: (id) => people.get(id) || null,

    view(meId) {
      const me = meId ? people.get(meId) || null : null;
      if (!me) return { me: null, songs: [], max: MAX_SONGS, guide: GUIDE, say: SAY.guest };
      const list = mine(me.gameId);
      return {
        me: { name: me.name, ageGroup: AGE[me.ageGroup] },
        songs: list.map(pub),
        max: MAX_SONGS,
        guide: GUIDE,
        say: list.length === 0 ? SAY.empty : list.length >= MAX_SONGS ? SAY.full : SAY.some,
      };
    },

    // id があれば上書き、なければ新しく保存
    save(meId, { id, title, song: input } = {}) {
      person(meId);
      const t = checkTitle(title);
      const s = song(input);
      const at = now();
      if (id) {
        const x = own(meId, String(id));
        Object.assign(x, { title: t, song: s, updatedAt: at });
        return { song: pub(x), say: SAY.saved };
      }
      if (mine(meId).length >= MAX_SONGS) throw new HttpError(409, `曲は${MAX_SONGS}曲までです。どれかを消すか、上書きしてください`);
      if (songs.size >= MAX_TOTAL) throw new HttpError(503, 'β版の保存場所がいっぱいです。運営に知らせてください');
      const x = { id: newId(), ownerId: meId, title: t, song: s, createdAt: at, updatedAt: at };
      songs.set(x.id, x);
      return { song: pub(x), say: SAY.saved };
    },

    remove(meId, id) {
      person(meId);
      own(meId, id);
      songs.delete(id);
      return { ok: true };
    },
  };
}
