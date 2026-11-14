import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStudio } from '../studio.js';
import { createRooms, ROOM_PARTS, MAX_ROOMS_PER_PERSON, ROOM_DAYS } from '../rooms.js';
import { createApp } from '../server.js';

const setup = () => {
  let t = Date.parse('2026-11-20T10:00:00Z');
  const clock = { now: () => t, go: (ms) => { t += ms; } };
  const studio = createStudio();
  const rooms = createRooms({ studio, now: clock.now });
  const add = (id, name, ageGroup) => studio.upsertPerson({ gameId: id, name, ageGroup }).gameId;
  return { rooms, clock, a: add('u_a', 'あおい', 'teen'), b: add('u_b', 'そら', 'teen'), c: add('u_c', 'ひなた', 'teen'), kid: add('u_k', 'こども', 'child') };
};

test('ルームを作る：コードだけ鳴る曲から。作った人はコードを受けもつ。番号は6文字', () => {
  const { rooms, a } = setup();
  const r = rooms.create(a, { title: 'お誕生日の曲', mood: 'party', length: 30 });
  assert.match(r.code, /^[A-HJ-NP-Z2-9]{6}$/, 'まちがえやすい文字（0・O・1・I）は使わない');
  assert.equal(r.parts.chord, 'あおい');
  assert.equal(r.myPart, 'chord');
  assert.equal(r.mine, true);
  for (const s of r.song.sections) {
    assert.equal(s.panels.rhythm, null);
    assert.equal(s.panels.melody, null);
  }
  assert.deepEqual(ROOM_PARTS, ['rhythm', 'bass', 'chord', 'melody', 'fx', 'lyric']);
  assert.throws(() => rooms.create(a, { title: '', mood: 'party', length: 30 }), { status: 400 });
  assert.throws(() => rooms.create(a, { title: 'x', mood: 'nazo', length: 30 }), { status: 400 });
  assert.throws(() => rooms.create(a, { title: 'https://x', mood: 'party', length: 30 }), { status: 400 });
  for (let n = 1; n < MAX_ROOMS_PER_PERSON; n++) rooms.create(a, { title: `ルーム${n}`, mood: 'calm', length: 15 });
  assert.throws(() => rooms.create(a, { title: 'もう1つ', mood: 'calm', length: 15 }), { status: 409 });
});

test('1人1パート：受けもった人だけが、自分のパートを直せる', () => {
  const { rooms, a, b, c } = setup();
  const { code } = rooms.create(a, { title: 'みんなの曲', mood: 'bright', length: 30 });
  assert.equal(rooms.claim(b, code, 'rhythm').myPart, 'rhythm');
  assert.throws(() => rooms.claim(c, code, 'rhythm'), { status: 409, message: /そら さん/ }, 'ほかの人のパートはとれない');
  rooms.claim(c, code, 'lyric');
  const n = rooms.get(b, code).song.sections.length;
  const drums = Array.from({ length: n }, (_, i) => (i === 0 ? null : 'bounce'));
  const r = rooms.edit(b, code, { part: 'rhythm', values: drums });
  assert.deepEqual(r.song.sections.map((s) => s.panels.rhythm), drums);
  assert.throws(() => rooms.edit(b, code, { part: 'bass', values: drums }), { status: 403 }, '受けもっていないパートは直せない');
  assert.throws(() => rooms.edit(b, code, { part: 'rhythm', values: ['bounce'] }), { status: 400 }, '部分の数が合わない');
  assert.throws(() => rooms.edit(b, code, { part: 'rhythm', values: drums.map(() => '<x>') }), { status: 400 });
  const lyrics = Array.from({ length: n }, (_, i) => (i === 1 ? 'おめでとう\nきょうは きみの ひ' : ''));
  assert.equal(rooms.edit(c, code, { part: 'lyric', values: lyrics }).song.sections[1].lyric, 'おめでとう\nきょうは きみの ひ');
  assert.throws(() => rooms.edit(c, code, { part: 'lyric', values: lyrics.map(() => '闇バイト 募集 DM まってる') }), { status: 400, message: /入れられません/ }, '送る前のチェック');
  assert.equal(rooms.get(a, code).song.sections[1].panels.rhythm, 'bounce', 'ほかの人のパートはそのまま');
  // ほかのパートにうつると、前のパートはあく
  rooms.claim(b, code, 'bass');
  assert.equal(rooms.get(a, code).parts.rhythm, null);
  rooms.release(b, code);
  assert.equal(rooms.get(a, code).parts.bass, null);
  assert.equal(rooms.get(a, code).version > 1, true, '変わるたびに番号が進む（画面が見に行く）');
});

test('子どもは子どもどうし：年齢の区分がちがうルームは見えない・入れない', () => {
  const { rooms, a, kid } = setup();
  const { code } = rooms.create(a, { title: '中高生の曲', mood: 'cool', length: 30 });
  assert.throws(() => rooms.get(kid, code), { status: 404 });
  assert.throws(() => rooms.claim(kid, code, 'bass'), { status: 404 });
  assert.equal(rooms.list(kid).rooms.length, 0);
  assert.equal(rooms.list(a).rooms.length, 1);
  assert.throws(() => rooms.get('u_nobody', code), { status: 401 });
});

test('しまう：作った人だけ。7日たつと自然にしまう', () => {
  const { rooms, a, b, clock } = setup();
  const { code } = rooms.create(a, { title: '一週間の曲', mood: 'calm', length: 15 });
  assert.throws(() => rooms.remove(b, code), { status: 403 });
  clock.go(ROOM_DAYS * 86400e3 + 1);
  assert.throws(() => rooms.get(a, code), { status: 404 });
  const r2 = rooms.create(a, { title: 'つぎの曲', mood: 'calm', length: 15 });
  assert.deepEqual(rooms.remove(a, r2.code), { ok: true });
});

test('サーバー：ルームの API はログインした人だけ', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ gameId: 'u_srv', name: 'テスト', ageGroup: 'adult' }) });
  const server = http.createServer(createApp({ fetchImpl: fakeFetch }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/rooms`)).status, 401);
    const cb = await fetch(`${base}/auth/callback?ticket=${'t'.repeat(20)}`, { redirect: 'manual' });
    const cookie = cb.headers.get('set-cookie').split(';')[0];
    const H = { Cookie: cookie, 'Content-Type': 'application/json' };
    const made = await fetch(`${base}/api/rooms`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'API の曲', mood: 'bright', length: 30 }) });
    assert.equal(made.status, 201);
    const { code } = await made.json();
    const got = await fetch(`${base}/api/rooms/${code}`, { headers: H }).then((r) => r.json());
    assert.equal(got.title, 'API の曲');
    const claim = await fetch(`${base}/api/rooms/${code}/claim`, { method: 'POST', headers: H, body: JSON.stringify({ part: 'melody' }) }).then((r) => r.json());
    assert.equal(claim.myPart, 'melody');
    assert.equal(claim.parts.chord, null, '1人1パートなので、コードはあく');
    assert.equal((await fetch(`${base}/api/rooms`, { headers: H }).then((r) => r.json())).rooms.length, 1);
  } finally {
    server.close();
  }
});
