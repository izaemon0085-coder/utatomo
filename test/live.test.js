import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildBgm, checkSong, CALLS } from '../public/music.js';
import { liveFromSong, encodeLive, decodeLive, checkLive } from '../public/live.js';
import { DEFAULT_LOOK } from '../public/parts.js';

test('コール：部分ごとに1つ、決まった言葉だけ。曲といっしょに保存できる', () => {
  const s = buildBgm('party', 60);
  s.sections[3].call = CALLS[0];
  const r = checkSong(s);
  assert.equal(r.ok, true);
  assert.equal(r.song.sections[3].call, 'ハイ！ハイ！');
  assert.equal('call' in r.song.sections[0], false);
  assert.equal(checkSong({ ...s, sections: [{ ...s.sections[0], call: 'なんでも' }] }).bad, 'call');
});

test('ライブコード：曲の名前・曲・キャラ・コールから作り、アリーナで読める（声は入らない）', () => {
  const s = buildBgm('bright', 120);
  s.sections[1].lyric = 'ひかる ステージ';
  s.sections[3].call = 'フッフー！';
  s.sections[6].call = 'ありがとう！';
  const r = liveFromSong({ title: 'ありがとうのうた', song: s, look: DEFAULT_LOOK });
  assert.equal(r.ok, true);
  assert.deepEqual(r.live.calls, [{ section: 3, word: 'フッフー！' }, { section: 6, word: 'ありがとう！' }]);
  assert.deepEqual(Object.keys(r.live).sort(), ['calls', 'look', 'song', 'title', 'v'], '声やログインの情報は入らない');
  const code = encodeLive(r.live);
  assert.ok(code.length < 4000, `2分の曲でも短い（${code.length}文字）`);
  assert.deepEqual(decodeLive(code).live, r.live);
  assert.equal(liveFromSong({ title: '', song: s }).bad, 'title');
  assert.equal(checkLive({ title: 'x', song: s, calls: [{ section: 1, word: 'ハイ！ハイ！' }, { section: 1, word: 'せーの！' }] }).bad, 'calls', '1つの部分にコールは1つ');
});

test('写し：送る前のチェックは ともはね と同じ', (t) => {
  const orig = fileURLToPath(new URL('../../cursor-project/shared/precheck.js', import.meta.url));
  if (!existsSync(orig)) return t.skip('ともはね のフォルダがとなりにない');
  const strip = (s) => s.replace(/\r\n/g, '\n').split('\n').filter((l) => !l.startsWith('// ※') && !l.startsWith('//   うたとも では')).join('\n');
  assert.equal(strip(readFileSync(fileURLToPath(new URL('../public/precheck.js', import.meta.url)), 'utf8')), strip(readFileSync(orig, 'utf8')));
});
