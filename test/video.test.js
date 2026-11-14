import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, safeRect, timeline, drawFrame, wrapText, pickVideoType, videoExt, THEME } from '../public/video.js';
import { buildBgm, barSeconds, MOOD_IDS, songSeconds } from '../public/music.js';
import { DEFAULT_LOOK, renderStand, checkLook } from '../public/parts.js';

// canvas の 2D のかわり：描いたものを記録するだけ
function fakeCanvas() {
  const calls = [];
  const grad = { addColorStop() {} };
  const g = new Proxy({ calls }, {
    get(target, k) {
      if (k in target) return target[k];
      if (k === 'createLinearGradient') return () => grad;
      if (k === 'measureText') return (s) => ({ width: [...s].length * 20 });
      return (...args) => { calls.push([k, ...args]); };
    },
    set(target, k, v) { calls.push([`set:${String(k)}`, v]); return true; },
  });
  return g;
}

test('動画の形：縦 9:16・横 16:9。セーフゾーンは画面の中', () => {
  assert.equal(FORMATS.tall.w / FORMATS.tall.h, 9 / 16);
  assert.equal(FORMATS.wide.w / FORMATS.wide.h, 16 / 9);
  for (const id of Object.keys(FORMATS)) {
    const r = safeRect(id);
    const f = FORMATS[id];
    assert.ok(r.x > 0 && r.y > 0 && r.x + r.w < f.w && r.y + r.h < f.h, id);
  }
  assert.ok(safeRect('tall').y + safeRect('tall').h <= FORMATS.tall.h * 0.8, '縦は下の20%をあける（SNS のボタンや説明文）');
  for (const m of MOOD_IDS) assert.equal(THEME[m].length, 3, `${m} の色`);
});

test('時間の流れ：部分・拍・字幕の行が、時刻に合わせて進む', () => {
  const s = buildBgm('bright', 30); // intro2 a6 sabi6 outro2、1小節2秒
  s.sections[1].lyric = 'いちぎょうめ\nにぎょうめ';
  const tl = timeline(s);
  const bar = barSeconds(s.tempo);
  assert.equal(tl.at(0).part, 'intro');
  assert.equal(tl.at(bar * 2 + 0.1).part, 'a');
  assert.equal(tl.at(bar * 2 + 0.1).line, 'いちぎょうめ');
  assert.equal(tl.at(bar * 6).line, 'にぎょうめ', '部分の後半は2行目');
  assert.equal(tl.at(bar * 9).part, 'sabi');
  assert.equal(tl.at(bar * 9).line, '', '歌詞のない部分は字幕なし');
  assert.ok(Math.abs(tl.at(bar / 4 + 0.01).beat - 0.02) < 0.01, '拍の頭');
  assert.equal(tl.at(songSeconds(s) + 1).ended, true);
  assert.ok(tl.total > songSeconds(s), '余韻のぶん少し長い');
  assert.equal(timeline(buildBgm('calm', 'loop')).total, songSeconds(buildBgm('calm', 'loop')), 'ループは余韻なし');
});

test('1コマを描く：キャラ・字幕・曲の名前。字幕と文字はセーフゾーンの中', () => {
  for (const format of Object.keys(FORMATS)) {
    const s = buildBgm('party', 30);
    s.sections[1].lyric = 'とても ながい かしで はばを こえる ときは おりかえして ひょうじする';
    const g = fakeCanvas();
    const at = drawFrame(g, { format, t: barSeconds(s.tempo) * 3, song: s, chara: { fake: true }, title: 'おめでとう', guide: false });
    assert.equal(at.part, 'a');
    const texts = g.calls.filter(([k]) => k === 'fillText');
    const safe = safeRect(format);
    const lyricRows = texts.filter(([, t]) => /かし|おりかえ|はばを|ひょうじ|ながい|こえる|ときは/.test(t));
    assert.ok(lyricRows.length >= (format === 'tall' ? 2 : 1), '縦は細いので、長い字幕は折り返す');
    for (const [, , x, y] of [...lyricRows, ...texts.filter(([, t]) => /おめでとう|うたとも/.test(t))]) {
      assert.ok(x >= safe.x && x <= safe.x + safe.w && y >= safe.y && y <= safe.y + safe.h, `${format}：(${x}, ${y}) がセーフゾーンの中`);
    }
    assert.ok(g.calls.some(([k, img]) => k === 'drawImage' && img.fake), 'キャラを描く');
    assert.ok(!g.calls.some(([k]) => k === 'strokeRect'), 'セーフゾーンの線は書き出しに入れない');
    const g2 = fakeCanvas();
    drawFrame(g2, { format, t: 1, song: s, chara: null, guide: true, lyrics: false });
    assert.ok(g2.calls.some(([k]) => k === 'strokeRect'), '見本ではセーフゾーンの線を見せる');
    assert.ok(!g2.calls.some(([k]) => k === 'drawImage'), 'キャラなし');
  }
});

test('字幕の折り返し・動画の形のえらび方', () => {
  assert.deepEqual(wrapText((s) => [...s].length * 10, 'あいうえおかき', 30), ['あいう', 'えおか', 'き']);
  assert.deepEqual(wrapText((s) => s.length, '', 10), []);
  assert.equal(pickVideoType((m) => m.startsWith('video/webm')), 'video/webm;codecs=vp9,opus');
  assert.equal(pickVideoType((m) => m === 'video/mp4'), 'video/mp4', 'mp4 が使えれば mp4');
  assert.equal(pickVideoType(() => false), '');
  assert.equal(videoExt('video/mp4;codecs=x'), 'mp4');
  assert.equal(videoExt('video/webm'), 'webm');
});

test('キャラの部品：Vとも の部品ファイルと同じ（写しがずれていない）', (t) => {
  const mine = fileURLToPath(new URL('../public/parts.js', import.meta.url));
  const orig = fileURLToPath(new URL('../../vtomo/public/parts.js', import.meta.url));
  if (!existsSync(orig)) return t.skip('Vとも のフォルダがとなりにない');
  const strip = (s) => s.replace(/\r\n/g, '\n').split('\n').filter((l) => !l.startsWith('// ※')).join('\n');
  assert.equal(strip(readFileSync(mine, 'utf8')), strip(readFileSync(orig, 'utf8')));
  assert.match(renderStand(DEFAULT_LOOK), /^<svg [^>]*viewBox="0 0 200 300"/);
  assert.equal(checkLook({ ...DEFAULT_LOOK, hairColor: '"><script>' }).ok, false, '変な部品は使わない');
});
