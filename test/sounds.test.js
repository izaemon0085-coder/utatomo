import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStudio } from '../studio.js';
import { createSounds, MAX_PENDING_PER_PERSON } from '../sounds.js';
import { createApp } from '../server.js';
import { buildBgm, checkSong, checkSoundDef, renderBar, renderSong, creditText, optionLabel, PANELS, SOUND_INSTS } from '../public/music.js';
import { encodeLive, decodeLive, liveFromSong } from '../public/live.js';

const OK = { own: true, use: true, name: true };
const BASS = { notes: [[0, 3, 'r'], [4, 2, 'f'], [8, 3, 'o'], [12, 4, 't']] };
const setup = () => {
  const studio = createStudio();
  const sounds = createSounds({ studio });
  const add = (id, name, ageGroup, admin = false) => studio.upsertPerson({ gameId: id, name, ageGroup, admin }).gameId;
  return { studio, sounds, a: add('u_a', 'あおい', 'teen'), kid: add('u_k', 'こども', 'child'), op: add('u_op', '運営', 'adult', true) };
};
const useIn = (song, s) => {
  const x = structuredClone(song);
  x.sounds = { [s.id]: { inst: s.inst, label: s.label, by: s.by, def: s.def } };
  x.sections[0].panels[s.inst] = s.id;
  return x;
};

test('音の形：パネルと同じ形だけ。録音や知らない形は受けつけない', () => {
  assert.deepEqual(SOUND_INSTS, ['rhythm', 'bass', 'chord', 'melody'], 'キラキラは作れない');
  assert.deepEqual(checkSoundDef('rhythm', { kick: [8, 0, 0], hat: [], wav: 'data:audio' }), { kick: [0, 8] }, 'ならべなおし・同じ拍はまとめる・知らない項目は捨てる');
  assert.equal(checkSoundDef('rhythm', { kick: [16] }), null, '16拍より先はない');
  assert.equal(checkSoundDef('rhythm', {}), null, 'どこも鳴らさないのはだめ');
  assert.deepEqual(checkSoundDef('bass', BASS), BASS);
  assert.equal(checkSoundDef('bass', { notes: [[14, 4, 'r']] }), null, '小節からはみ出す');
  assert.equal(checkSoundDef('melody', { notes: [[0, 2, 5]] }), null, '和音の音（0〜4番目）だけ');
  assert.deepEqual(checkSoundDef('chord', { play: 'pad', steps: [3, 4] }), { play: 'pad', steps: [0] });
  assert.equal(checkSoundDef('fx', { x: 1 }), null);
  // もとからあるパネルも、この形にそのまま入る
  for (const inst of SOUND_INSTS) for (const o of Object.values(PANELS[inst].options)) assert.ok(checkSoundDef(inst, o), inst);
});

test('出す → 運営が公認 → みんなのパネルに。同意が3つともないと出せない。子どもは出せない', () => {
  const { sounds, a, kid, op } = setup();
  const base = { inst: 'bass', label: 'ずんずん', def: BASS };
  assert.throws(() => sounds.submit(a, { ...base, consent: { own: true, use: true } }), { status: 400, message: /3つの約束/ });
  assert.throws(() => sounds.submit(kid, { ...base, consent: OK }), { status: 403 });
  assert.throws(() => sounds.submit(a, { ...base, label: 'https://x', consent: OK }), { status: 400 });
  assert.throws(() => sounds.submit(a, { ...base, label: 'とても長い名前の音です', consent: OK }), { status: 400 });
  assert.throws(() => sounds.submit(a, { ...base, def: PANELS.bass.options.pon, consent: OK }), { status: 409 }, 'もとからあるパネルと同じ');
  const { sound } = sounds.submit(a, { ...base, consent: OK });
  assert.match(sound.id, /^k_[a-z0-9]{8}$/);
  assert.equal(sound.status, 'pending');
  assert.throws(() => sounds.submit(a, { ...base, label: 'もう1つ', consent: OK }), { status: 409 }, '同じ形');
  assert.equal(sounds.list(null).approved.length, 0, '公認されるまでは、みんなには出ない');
  assert.equal(sounds.list(a).pending, undefined, '運営でない人には、聞く前の一覧は見えない');
  assert.equal(sounds.list(op).pending.length, 1);
  assert.throws(() => sounds.decide(a, sound.id, { ok: true }), { status: 403 }, '決めるのは運営だけ');
  sounds.decide(op, sound.id, { ok: true });
  const pub = sounds.list(kid).approved;
  assert.deepEqual(pub.map((x) => [x.label, x.by]), [['ずんずん', 'あおい']], '子どもも使える');
  assert.equal(sounds.list(kid).canSubmit, false);
  // 見送りは理由がいる。運営が聞く前のものは3こまで
  for (let i = 0; i < MAX_PENDING_PER_PERSON; i++) sounds.submit(a, { inst: 'rhythm', label: `た${i}`, def: { kick: [i] }, consent: OK });
  assert.throws(() => sounds.submit(a, { inst: 'rhythm', label: 'た9', def: { kick: [9] }, consent: OK }), { status: 409 });
  const p = sounds.list(op).pending[0];
  assert.throws(() => sounds.decide(op, p.id, { ok: false }), { status: 400, message: /理由/ });
  sounds.decide(op, p.id, { ok: false, note: 'もとのパネルとほとんど同じなので' });
  assert.equal(sounds.list(a).mine.find((x) => x.id === p.id).statusLabel, '見送り');
});

test('曲に入れる：音が鳴る・クレジットに作者の名前・保存は公認の音だけ・取り下げたら新しく使えない', () => {
  const { studio, sounds, a, op } = setup();
  const { sound } = sounds.submit(a, { inst: 'bass', label: 'ずんずん', def: BASS, consent: OK });
  const song = useIn(buildBgm('bright', 15), sound);
  assert.equal(checkSong(song).ok, true);
  assert.equal(checkSong({ ...song, sounds: {} }).ok, false, '曲についていない音は使えない');
  const r = checkSong(song).song;
  assert.equal(optionLabel('bass', sound.id, r.sounds), '⭐ずんずん');
  const bar = renderBar({ inst: 'bass', pattern: sound.id, mood: 'bright', sampleRate: 8000, sounds: r.sounds });
  assert.ok(bar.left.some((x) => Math.abs(x) > 0.01), '公認の音が鳴る');
  assert.ok(renderSong(r, { sampleRate: 8000 }).seconds > 10);
  assert.match(creditText('おいわい', r), /音の協力 あおい さん/);
  // 保存：まだ公認されていない → だめ
  assert.throws(() => studio.save(a, { title: 'テスト', song }, sounds), { status: 400, message: /公認されていない/ });
  sounds.decide(op, sound.id, { ok: true });
  // 名前や形をいじっても、公認されたものにもどる
  const tampered = structuredClone(song);
  tampered.sounds[sound.id].by = 'べつの人';
  tampered.sounds[sound.id].def = { notes: [[0, 16, 'r']] };
  const saved = studio.save(a, { title: 'テスト', song: tampered }, sounds).song;
  assert.equal(saved.song.sounds[sound.id].by, 'あおい');
  assert.deepEqual(saved.song.sounds[sound.id].def, BASS);
  // 取り下げ：もう作った曲の上書きはそのまま。新しい曲には使えない
  assert.throws(() => sounds.withdraw(op, sound.id), { status: 404 }, '取り下げは作者だけ');
  sounds.withdraw(a, sound.id);
  assert.equal(sounds.list(null).approved.length, 0);
  assert.ok(studio.save(a, { id: saved.id, title: 'テスト2', song: saved.song }, sounds));
  assert.throws(() => studio.save(a, { title: '新しい曲', song: saved.song }, sounds), { status: 400 });
  // ライブコードにも入る（アリーナで鳴らせる）
  const code = encodeLive(liveFromSong({ title: 'ライブ', song: saved.song }).live);
  assert.equal(decodeLive(code).live.song.sounds[sound.id].label, 'ずんずん');
});

test('サーバー：公認の音の API', async () => {
  const who = { gameId: 'u_srv', name: 'テスト', ageGroup: 'adult', admin: true };
  const fakeFetch = async () => ({ ok: true, json: async () => who });
  const server = http.createServer(createApp({ fetchImpl: fakeFetch }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.deepEqual((await fetch(`${base}/api/sounds`).then((r) => r.json())).approved, [], 'ログインなしでも見られる');
    assert.equal((await fetch(`${base}/api/sounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const cb = await fetch(`${base}/auth/callback?ticket=${'t'.repeat(20)}`, { redirect: 'manual' });
    const H = { Cookie: cb.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    const made = await fetch(`${base}/api/sounds`, { method: 'POST', headers: H, body: JSON.stringify({ inst: 'melody', label: 'ふわり', def: { notes: [[0, 8, 2], [8, 8, 4]] }, consent: OK }) });
    assert.equal(made.status, 201);
    const { sound } = await made.json();
    const st = await fetch(`${base}/api/state`, { headers: H }).then((r) => r.json());
    assert.equal(st.me.admin, true, 'ともはね の運営は、うたとも でも運営');
    const d = await fetch(`${base}/api/admin/sounds/${sound.id}/decide`, { method: 'POST', headers: H, body: JSON.stringify({ ok: true }) });
    assert.equal(d.status, 200);
    assert.equal((await fetch(`${base}/api/sounds`).then((r) => r.json())).approved[0].label, 'ふわり');
  } finally {
    server.close();
  }
});
