import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  MOODS, MOOD_IDS, INSTS, PANELS, PARTS, LENGTHS, optionIds, buildBgm, checkSong, planSections,
  renderBar, renderSong, encodeWav, songSeconds, totalBars, flattenBars, creditText, barSeconds, MAX_BARS,
  cleanLyric, allLyrics, buildStreamSet, STREAM_SET, LIVE_LENGTHS,
} from '../public/music.js';
import { precheck } from '../public/precheck.js';
import { createStudio, checkTitle, MAX_SONGS } from '../studio.js';
import { createApp } from '../server.js';

const SR = 8000; // テストは軽くするため、音のこまかさを下げる

test('パネル：5つの列 × 4つ。どの雰囲気のはじめのパネルも、ちゃんとある', () => {
  assert.deepEqual(INSTS, ['rhythm', 'bass', 'chord', 'melody', 'fx']);
  for (const inst of INSTS) assert.equal(optionIds(inst).length, 4, inst);
  for (const id of MOOD_IDS) {
    const m = MOODS[id];
    assert.equal(m.prog.length, 4, '和音は4小節でひとめぐり');
    for (const inst of INSTS) assert.ok(PANELS[inst].options[m.set[inst]], `${id} の ${inst}`);
  }
  assert.ok(MOOD_IDS.includes('bright') && MOOD_IDS.includes('oshare') && MOOD_IDS.includes('calm'), '明るい・おしゃれ・しっとり がある');
});

test('おまかせ：雰囲気と長さから、15秒・30秒・60秒・ループの曲を組み立てる', () => {
  for (const mood of MOOD_IDS) {
    for (const len of [15, 30, 60]) {
      const s = buildBgm(mood, len);
      const sec = songSeconds(s);
      assert.ok(Math.abs(sec - len) <= Math.max(3, barSeconds(s.tempo) * 1.1), `${mood} ${len}秒 → ${sec.toFixed(1)}秒`);
      assert.equal(s.sections[0].part, 'intro');
      assert.equal(s.sections.at(-1).part, 'outro');
      assert.ok(s.sections.some((x) => x.part === 'sabi'), 'サビがある');
      assert.equal(checkSong(s).ok, true);
    }
    const loop = buildBgm(mood, 'loop');
    assert.deepEqual(loop.sections.map((x) => x.part), ['loop']);
    assert.equal(loop.length, 'loop');
  }
  assert.deepEqual(planSections(60, 120).map(([p]) => p), ['intro', 'a', 'b', 'sabi', 'outro'], '1分はイントロ→A→B→サビ→おわり');
  let i = 0;
  const rng = () => ((i++ * 0.618) % 1);
  for (let n = 0; n < 20; n++) assert.equal(checkSong(buildBgm('cute', 30, { rng })).ok, true, 'おまかせで変えても形はくずれない');
  const q = buildBgm('bright', 30, { quiet: true, tempo: 999 });
  assert.equal(q.quiet, true);
  assert.equal(q.tempo, 150, 'テンポははばの中におさめる');
  assert.equal(buildBgm('nope', 99).mood, 'bright', '知らない雰囲気・長さは、ふつうの形にする');
});

test('曲の形のチェック：決まった中からだけ（保存や読みこみの前）', () => {
  const s = buildBgm('bright', 30);
  assert.equal(checkSong(null).ok, false);
  assert.equal(checkSong({ ...s, mood: 'scary' }).bad, 'mood');
  assert.equal(checkSong({ ...s, tempo: 20 }).bad, 'tempo');
  assert.equal(checkSong({ ...s, tempo: 120.5 }).bad, 'tempo');
  assert.equal(checkSong({ ...s, length: 45 }).bad, 'length');
  assert.equal(checkSong({ ...s, sections: [] }).bad, 'sections');
  assert.equal(checkSong({ ...s, sections: [{ part: 'x', bars: 4, panels: {} }] }).bad, 'part');
  assert.equal(checkSong({ ...s, sections: [{ part: 'a', bars: 4, panels: { rhythm: '<script>' } }] }).bad, 'panels');
  assert.equal(checkSong({ ...s, sections: Array.from({ length: 4 }, () => ({ part: 'a', bars: 32, panels: {} })) }).bad, 'bars', `長すぎる曲（${MAX_BARS}小節より多い）はだめ`);
  const r = checkSong({ ...s, evil: 1, sections: [{ part: 'a', bars: 4, panels: { bass: 'pon', extra: 'x' } }] });
  assert.equal(r.ok, true);
  assert.equal('evil' in r.song, false, '知らない項目は捨てる');
  assert.deepEqual(r.song.sections[0].panels, { rhythm: null, bass: 'pon', chord: null, melody: null, fx: null });
  assert.equal(totalBars(r.song), 4);
});

test('音づくり：すべてのパネル・すべての雰囲気で、音が出て、割れない', () => {
  for (const mood of MOOD_IDS) {
    for (const inst of INSTS) {
      for (const pattern of optionIds(inst)) {
        const r = renderBar({ inst, pattern, mood, bar: 0, sampleRate: SR });
        let peak = 0;
        for (const x of r.left) {
          assert.ok(Number.isFinite(x), `${mood} ${inst} ${pattern}`);
          peak = Math.max(peak, Math.abs(x));
        }
        assert.ok(peak > 0.01, `${mood} ${inst} ${pattern} は音が出る`);
        assert.ok(peak < 2.5, `${mood} ${inst} ${pattern} は大きすぎない`);
        assert.equal(r.barLength, Math.round(barSeconds(MOODS[mood].tempo) * SR));
      }
    }
  }
  const empty = renderBar({ inst: 'bass', pattern: 'nothing', sampleRate: SR });
  assert.ok(empty.left.every((x) => x === 0), '知らないパネルは音なし');
  const a = renderBar({ inst: 'rhythm', pattern: 'bounce', sampleRate: SR });
  const b = renderBar({ inst: 'rhythm', pattern: 'bounce', sampleRate: SR });
  assert.deepEqual(a.left, b.left, '同じパネルはいつも同じ音（あとで作りなおしても同じ曲になる）');
  const fill = renderBar({ inst: 'rhythm', pattern: 'bounce', sampleRate: SR, fill: true });
  assert.notDeepEqual(fill.left, a.left, '部分の切れめにはフィルが入る');
  const bar1 = renderBar({ inst: 'bass', pattern: 'pon', bar: 1, sampleRate: SR });
  const bar0 = renderBar({ inst: 'bass', pattern: 'pon', bar: 0, sampleRate: SR });
  assert.notDeepEqual(bar1.left, bar0.left, '和音が小節ごとに進む');
});

test('1曲にする：30秒の曲・ループ・WAV の書き出し', () => {
  const s = buildBgm('bright', 30);
  const r = renderSong(s, { sampleRate: SR });
  assert.equal(r.left.length, Math.round(barSeconds(s.tempo) * SR) * totalBars(s) + 1.5 * SR, '曲の長さ＋余韻');
  let peak = 0;
  let energy = 0;
  for (const x of r.left) { peak = Math.max(peak, Math.abs(x)); energy += x * x; }
  assert.ok(peak <= 1, '割れない');
  assert.ok(Math.sqrt(energy / r.left.length) > 0.05, 'ちゃんと音が鳴っている');
  assert.ok(Math.abs(r.left.at(-1)) < 1e-3, 'さいごはすっと消える');
  assert.equal(flattenBars(s).filter((b) => b.fill).length, s.sections.filter((x, k) => k < s.sections.length - 1 && x.panels.rhythm).length, 'ドラムがある部分の切れめごとにフィル');

  const loop = renderSong(buildBgm('calm', 'loop'), { sampleRate: SR });
  const barLen = Math.round(barSeconds(MOODS.calm.tempo) * SR);
  assert.equal(loop.left.length, barLen * 8, 'ループは余韻を頭にもどすので、ちょうど8小節');

  const wav = encodeWav(new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 2]), SR);
  const v = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(v.getUint16(22, true), 2, 'ステレオ');
  assert.equal(v.getUint32(24, true), SR);
  assert.equal(v.getUint32(40, true), 12);
  assert.equal(wav.length, 44 + 12);
  assert.equal(v.getInt16(46, true), Math.round(0.5 * 32767));
  assert.equal(v.getInt16(48, true), 32767);
  assert.equal(v.getInt16(50, true), Math.round(-0.5 * 32767));
  assert.equal(v.getInt16(54, true), 32767, '大きすぎる音は端でおさえる');
});

test('クレジット：自分たちのタグ（#ともはね）', () => {
  assert.match(creditText('おめでとう'), /「おめでとう」.*音 © ともはね.*#ともはね #うたとも/);
  assert.match(creditText('  '), /わたしの1曲/);
  assert.deepEqual(Object.keys(LENGTHS), ['15', '30', '60', '120', '180', 'loop']);
  assert.ok(PARTS.sabi && PARTS.loop);
});

test('曲の名前：アドレス・メールアドレス・長い数字は入れられない', () => {
  assert.equal(checkTitle('  おめでとうの  うた '), 'おめでとうの うた');
  assert.throws(() => checkTitle(''), { status: 400 });
  assert.throws(() => checkTitle('あ'.repeat(21)), { status: 400 });
  assert.throws(() => checkTitle('https://x'), { status: 400 });
  assert.throws(() => checkTitle('me@mail'), { status: 400 });
  assert.throws(() => checkTitle('09012345678'), { status: 400 });
  assert.equal(checkTitle('2周年のうた'), '2周年のうた');
});

test('保存：1人10曲まで・自分の曲だけ直せる・消せる', () => {
  const s = createStudio();
  const a = s.upsertPerson({ gameId: 'u_alice', name: 'アリス', ageGroup: 'adult' }).gameId;
  const b = s.upsertPerson({ gameId: 'u_bob', name: 'ボブ', ageGroup: 'child' }).gameId;
  const song = buildBgm('party', 30);
  assert.equal(s.view(null).me, null);
  assert.match(s.view(null).say, /ログイン/);
  const ids = [];
  for (let n = 0; n < MAX_SONGS; n++) ids.push(s.save(a, { title: `うた${n}`, song }).song.id);
  assert.throws(() => s.save(a, { title: 'じゅういち', song }), { status: 409 });
  assert.match(s.view(a).say, /10曲そろった/);
  assert.equal(s.view(b).songs.length, 0, 'ほかの人の曲は見えない');
  assert.throws(() => s.save(b, { id: ids[0], title: 'のっとり', song }), { status: 404 });
  assert.throws(() => s.remove(b, ids[0]), { status: 404 });
  assert.throws(() => s.save(a, { title: 'x', song: { ...song, mood: 'evil' } }), { status: 400 });
  const r = s.save(a, { id: ids[0], title: 'なおした', song: buildBgm('calm', 'loop') });
  assert.equal(r.song.song.mood, 'calm');
  r.song.song.mood = 'cool';
  assert.equal(s.view(a).songs[0].song.mood, 'calm', '返したものを変えても、保存した曲は変わらない');
  s.remove(a, ids[1]);
  assert.equal(s.view(a).songs.length, MAX_SONGS - 1);
  assert.throws(() => s.save('u_nobody', { title: 'x', song }), { status: 401 });
  assert.throws(() => s.upsertPerson({ gameId: 'u_x', name: 'x', ageGroup: 'baby' }), { status: 400 });
});

test('サーバー：ともはねの通行証でログインし、曲を保存する', async () => {
  const fakeFetch = async (url, opt) => {
    assert.match(String(url), /\/api\/link\/utatomo-ticket\//);
    assert.ok(opt.headers['X-Link-Secret'], '合言葉をつけて確かめる');
    return { ok: true, json: async () => ({ gameId: 'u_abcdef', name: 'テスト', ageGroup: 'teen' }) };
  };
  const server = http.createServer(createApp({ fetchImpl: fakeFetch }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/state`).then((r) => r.json())).me, null);
    const music = await fetch(`${base}/music.js`);
    assert.match(music.headers.get('content-type'), /javascript/, '音のファイルはブラウザでも読める');
    assert.equal((await fetch(`${base}/..%2Fstudio.js`)).status, 403, 'public の外は見せない');
    const song = buildBgm('bright', 30);
    const noLogin = await fetch(`${base}/api/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x', song }) });
    assert.equal(noLogin.status, 401, 'ログインしていないと保存できない');
    assert.equal((await fetch(`${base}/auth/callback?ticket=bad`, { redirect: 'manual' })).status, 400);
    const cb = await fetch(`${base}/auth/callback?ticket=${'t'.repeat(20)}`, { redirect: 'manual' });
    assert.equal(cb.status, 302);
    const cookie = cb.headers.get('set-cookie').split(';')[0];
    assert.match(cb.headers.get('set-cookie'), /HttpOnly/);
    const send = (path, body, headers = {}) => fetch(`${base}/api${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const r = await send('/songs', { title: 'はじめての曲', song });
    assert.equal(r.status, 201);
    const saved = (await r.json()).song;
    assert.equal(saved.song.mood, 'bright');
    const other = await send('/songs', { title: 'x', song }, { Origin: 'https://evil.example' });
    assert.equal(other.status, 403, 'ほかのページからは操作できない');
    const st = await fetch(`${base}/api/state`, { headers: { Cookie: cookie } }).then((x) => x.json());
    assert.equal(st.me.ageGroup, '中高生');
    assert.equal(st.songs[0].title, 'はじめての曲');
    assert.equal(st.guide.name, 'クロツグミ', '案内役はクロツグミ');
    assert.match((await fetch(`${base}${st.guide.img}`)).headers.get('content-type'), /image\/svg\+xml/, 'クロツグミの絵が出る');
    assert.equal((await send(`/songs/${saved.id}`, { title: '上書き', song: buildBgm('cool', 15) })).status, 200);
    assert.equal((await send(`/songs/${saved.id}/delete`, {})).status, 200);
    const big = await send('/songs', { title: 'x', song: { ...song, pad: 'x'.repeat(20000) } });
    assert.equal(big.status, 413, '大きすぎるものは受けとらない');
    const cfg = await fetch(`${base}/api/config`).then((x) => x.json());
    assert.equal(cfg.max, MAX_SONGS);
  } finally {
    server.close();
  }
});

test('ライブの型：2分・3分は、間奏やCメロのある長い曲になる', () => {
  assert.deepEqual(LIVE_LENGTHS, [120, 180]);
  for (const mood of MOOD_IDS) {
    for (const len of LIVE_LENGTHS) {
      const s = buildBgm(mood, len);
      const sec = songSeconds(s);
      assert.ok(Math.abs(sec - len) <= len * 0.15, `${mood} ${len}秒 → ${sec.toFixed(0)}秒`);
      assert.equal(checkSong(s).ok, true, `${mood} ${len}`);
      assert.ok(s.sections.some((x) => x.part === 'kansou'), '間奏がある');
      if (len === 180) assert.ok(s.sections.some((x) => x.part === 'c'), '3分はCメロがある');
    }
  }
  assert.deepEqual(buildBgm('bright', 120).sections.map((x) => x.part), ['intro', 'a', 'b', 'sabi', 'kansou', 'a', 'sabi', 'outro'], '計画書の2分の型');
  const r = renderSong(buildBgm('calm', 180), { sampleRate: 4000 });
  assert.ok(r.left.every(Number.isFinite), '3分の曲も音にできる');
});

test('歌詞：部分ごとに4行・80文字まで。見えない文字はのぞく', () => {
  assert.equal(cleanLyric(undefined), '');
  assert.equal(cleanLyric('  きょうは  きみの\r\n\n たんじょうび\u200b '), 'きょうは きみの\nたんじょうび');
  assert.equal(cleanLyric('1\n2\n3\n4\n5'), null, '5行はだめ');
  assert.equal(cleanLyric('あ'.repeat(81)), null, '81文字はだめ');
  assert.equal(cleanLyric(123), null);
  const s = buildBgm('bright', 30);
  s.sections[1].lyric = 'ひかる ステージ\nみててね';
  s.sections[2].lyric = '';
  const r = checkSong(s);
  assert.equal(r.ok, true);
  assert.equal(r.song.sections[1].lyric, 'ひかる ステージ\nみててね');
  assert.equal('lyric' in r.song.sections[2], false, '空の歌詞はのこさない');
  assert.equal(allLyrics(r.song), 'ひかる ステージ\nみててね');
  assert.equal(checkSong({ ...s, sections: [{ ...s.sections[0], lyric: 'x\n'.repeat(6) }] }).bad, 'lyric');
  assert.equal(precheck('殺してやる').level, 'block', '送る前のチェックは ともはね と同じ');
});

test('配信セット：はじまり（ループ）・まったり（ひかえめのループ）・おわり（30秒）', () => {
  assert.deepEqual(STREAM_SET.map((x) => x.id), ['start', 'chill', 'end']);
  for (const mood of MOOD_IDS) {
    const set = buildStreamSet(mood);
    assert.equal(set.start.length, 'loop');
    assert.equal(set.chill.length, 'loop');
    assert.equal(set.chill.quiet, true, 'まったりは声のじゃまをしない');
    assert.equal(set.end.length, 30);
    for (const x of Object.values(set)) assert.equal(checkSong(x).ok, true);
  }
});

test('保存：送る前のチェックで止まる歌詞は保存できない・声をかけるだけの歌詞は保存できる・子どもかどうかを画面に渡す', () => {
  const s = createStudio();
  const kid = s.upsertPerson({ gameId: 'u_kid', name: 'こども', ageGroup: 'child' }).gameId;
  const song = buildBgm('bright', 30);
  song.sections[1].lyric = '闇バイト 募集 DM まってる';
  assert.throws(() => s.save(kid, { title: 'だめ', song }), { status: 400, message: /保存できません（闇バイトの募集）/ });
  song.sections[1].lyric = 'くやしい でも また がんばる';
  assert.equal(precheck(allLyrics(song)).level, 'notice');
  assert.equal(s.save(kid, { title: 'がんばるうた', song }).song.song.sections[1].lyric, 'くやしい でも また がんばる');
  song.sections[1].lyric = 'あ'.repeat(90);
  assert.throws(() => s.save(kid, { title: 'ながい', song }), { status: 400, message: /4行・80文字/ });
  assert.equal(s.view(kid).me.child, true, '子どもの声は書き出さない（画面で使う）');
  const adult = s.upsertPerson({ gameId: 'u_ad', name: 'おとな', ageGroup: 'adult' }).gameId;
  assert.equal(s.view(adult).me.child, false);
});
