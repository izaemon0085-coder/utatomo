// 公認の音：作者が自分で作ったパネルを「使ってOK」に同意して出す → 運営が聞いて公認する → みんなのパネルにならぶ
// 録音した音は受けつけない（パネルと同じ形＝どの拍で・どの音を鳴らすか、だけ）。だから、ほかの人の音源がまぎれこまない
// 作者はいつでも取り下げられる。取り下げたあとは新しく使えない（もう作った曲はそのまま＝同意したときの約束）
// 子どもは使えるが、出せるのは中高生と大人だけ（名前がみんなに出るので）
// データはメモリの中だけ（β版）
import { randomBytes } from 'node:crypto';
import { checkSoundDef, cleanName, SOUND_INSTS, SOUND_LABEL_MAX, PANELS, optionIds } from './public/music.js';
import { precheck } from './public/precheck.js';
import { HttpError } from './studio.js';

export const MAX_SOUNDS_PER_PERSON = 10; // 1人で出せる音は10こまで（取り下げたものはのぞく）
export const MAX_PENDING_PER_PERSON = 3; // 運営が聞く前のものは3こまで
export const MAX_SOUNDS = 2000;
export const NOTE_MAX = 40;
// 出すときの約束（3つとも同意が要る）
export const CONSENTS = {
  own: '自分で考えた音です（ほかの曲のまねではありません）',
  use: 'うたとも のみんなが、自分の曲に使ってOKです（動画・配信・SNS もふくむ）',
  name: '使われた曲のクレジットに、わたしの名前が出ます',
};
const STATUS = { pending: '運営が聞いています', approved: '⭐ 公認', rejected: '見送り', withdrawn: '取り下げ' };
const newId = () => `k_${[...randomBytes(8)].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createSounds({ studio, now = () => Date.now() } = {}) {
  const sounds = new Map(); // id → { id, inst, label, def, by: { gameId, name }, status, note, consentAt, createdAt, decidedAt }
  const person = (id) => {
    const p = id ? studio.person(id) : null;
    if (!p) throw new HttpError(401, 'ともはねでログインしてください');
    return p;
  };
  const admin = (id) => {
    const p = person(id);
    if (!p.admin) throw new HttpError(403, '運営（管理者）だけができます');
    return p;
  };
  // みんなが使うときの形（曲の中に持つ形と同じ）
  const pub = (x) => ({ id: x.id, inst: x.inst, label: x.label, by: x.by.name, def: structuredClone(x.def) });
  const mineView = (x) => ({ ...pub(x), status: x.status, statusLabel: STATUS[x.status], note: x.note || '' });
  const byOwner = (gameId) => [...sounds.values()].filter((x) => x.by.gameId === gameId && x.status !== 'withdrawn');

  return {
    consents: CONSENTS,
    // 公認の音（だれでも見られる）・わたしの出した音・運営なら、聞く前の音
    list(meId) {
      const me = meId ? studio.person(meId) : null;
      const approved = [...sounds.values()].filter((x) => x.status === 'approved').sort((a, b) => a.decidedAt - b.decidedAt).map(pub);
      return {
        approved,
        consents: CONSENTS,
        canSubmit: Boolean(me && me.ageGroup !== 'child'),
        mine: me ? [...sounds.values()].filter((x) => x.by.gameId === me.gameId).sort((a, b) => b.createdAt - a.createdAt).map(mineView) : [],
        ...(me?.admin ? { pending: [...sounds.values()].filter((x) => x.status === 'pending').sort((a, b) => a.createdAt - b.createdAt).map(mineView) } : {}),
      };
    },

    submit(meId, { inst, label, def, consent } = {}) {
      const me = person(meId);
      if (me.ageGroup === 'child') throw new HttpError(403, '音を出せるのは中高生と大人です（子どもは、公認の音を使うことができます）');
      if (!SOUND_INSTS.includes(inst)) throw new HttpError(400, '列（リズム・ベース・コード・メロディ）をえらんでください');
      const name = cleanName(label, SOUND_LABEL_MAX);
      if (!name) throw new HttpError(400, `音の名前は1〜${SOUND_LABEL_MAX}文字です`);
      if (/https?:|www\.|[@＠]|[0-9０-９]{4,}/i.test(name)) throw new HttpError(400, '音の名前に、アドレスや長い数字は入れられません');
      const c = precheck(name);
      if (c.level === 'block') throw new HttpError(400, `この名前は使えません（${c.reason}）`);
      const d = checkSoundDef(inst, def);
      if (!d) throw new HttpError(400, '音の形が正しくありません（どこかを1つ以上鳴らしてね）');
      if (!consent || typeof consent !== 'object' || !Object.keys(CONSENTS).every((k) => consent[k] === true)) {
        throw new HttpError(400, '3つの約束に、ぜんぶ同意してください');
      }
      // もとからあるパネル・公認の音・自分が出した音と同じ形は出せない
      if (optionIds(inst).some((id) => same(checkSoundDef(inst, PANELS[inst].options[id]), d))) throw new HttpError(409, 'もとからあるパネルと同じ音です');
      if ([...sounds.values()].some((x) => x.inst === inst && x.status !== 'withdrawn' && x.status !== 'rejected' && same(x.def, d))) throw new HttpError(409, '同じ形の音が、もう出ています');
      const mine = byOwner(me.gameId);
      if (mine.length >= MAX_SOUNDS_PER_PERSON) throw new HttpError(409, `出せる音は1人${MAX_SOUNDS_PER_PERSON}こまでです（取り下げるとあきます）`);
      if (mine.filter((x) => x.status === 'pending').length >= MAX_PENDING_PER_PERSON) throw new HttpError(409, `運営が聞いている音が${MAX_PENDING_PER_PERSON}こあります。公認か見送りが決まるまで待ってね`);
      if (sounds.size >= MAX_SOUNDS) throw new HttpError(503, 'β版の音の置き場がいっぱいです。運営に知らせてください');
      const x = { id: newId(), inst, label: name, def: d, by: { gameId: me.gameId, name: me.name }, status: 'pending', note: '', consentAt: now(), createdAt: now(), decidedAt: 0 };
      sounds.set(x.id, x);
      return { sound: mineView(x) };
    },

    // 作者だけ：取り下げる（新しく使えなくなる）
    withdraw(meId, id) {
      const me = person(meId);
      const x = sounds.get(id);
      if (!x || x.by.gameId !== me.gameId) throw new HttpError(404, '音が見つかりません');
      x.status = 'withdrawn';
      return { sound: mineView(x) };
    },

    // 運営だけ：聞いて、公認する・見送る（見送るときは、ひとこと理由）
    decide(meId, id, { ok, note } = {}) {
      admin(meId);
      const x = sounds.get(id);
      if (!x || x.status !== 'pending') throw new HttpError(404, '運営が聞く前の音が見つかりません');
      if (typeof ok !== 'boolean') throw new HttpError(400, '公認するか見送るかをえらんでください');
      const n = note == null || note === '' ? '' : cleanName(String(note), NOTE_MAX);
      if (n === null) throw new HttpError(400, `ひとことは${NOTE_MAX}文字までです`);
      if (!ok && !n) throw new HttpError(400, '見送るときは、ひとこと理由を書いてください');
      x.status = ok ? 'approved' : 'rejected';
      x.note = n;
      x.decidedAt = now();
      return { sound: mineView(x) };
    },

    // 保存のとき：曲についている公認の音を、運営が公認したものに置きかえる（形や名前をいじっていても、もとにもどる）
    // 取り下げた音は、もとから入っていた曲（keep）だけそのまま
    resolve(song, keep = {}) {
      if (!song.sounds) return song;
      const out = {};
      for (const id of Object.keys(song.sounds)) {
        const x = sounds.get(id);
        const okNow = x && (x.status === 'approved' || (x.status === 'withdrawn' && Object.hasOwn(keep, id)));
        if (!okNow || x.inst !== song.sounds[id].inst) throw new HttpError(400, '公認されていない音（または取り下げられた音）が入っています。パネルを変えてね');
        out[id] = pub(x);
        delete out[id].id;
      }
      return { ...song, sounds: out };
    },
  };
}
