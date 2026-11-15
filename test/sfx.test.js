import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSfx, checkSfxText, renderSfx, variants, describe, sfxFileName, morae, PEAK, LEN_MIN, LEN_MAX, VARIANTS, BASES, SFX_WORDS } from '../public/sfx.js';
import { encodeWav } from '../public/music.js';

const SR = 8000; // テストは軽く
const peakOf = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('オノマトペ → レシピ：表のことば・「！」で強く・「ー」で長く・ひらがなはやわらか・くり返し', () => {
  assert.equal(parseSfx('ドカーン！').base, 'boom');
  assert.equal(parseSfx('ピロリン').base, 'beep');
  assert.equal(parseSfx('シュワシュワ').base, 'fizz');
  assert.equal(parseSfx('ピューン').base, 'laser');
  assert.equal(parseSfx('トコトコ').base, 'step');
  assert.equal(parseSfx('キラリーン').base, 'bell');
  for (const [, b] of SFX_WORDS) assert.ok(BASES[b], b);
  // 強さ：！が多いほど強い（3つまで）
  assert.ok(parseSfx('ドカーン！！！').intensity > parseSfx('ドカーン！').intensity);
  assert.equal(parseSfx('ドカーン！！！').intensity, parseSfx('ドカーン！！！！！').intensity);
  // 長さ：ーが多いほど長い
  assert.ok(parseSfx('ヒューーー').length > parseSfx('ヒュー').length);
  // ひらがなはやわらか・カタカナはかため
  assert.ok(parseSfx('どかーん').soft > parseSfx('ドカーン').soft);
  assert.equal(parseSfx('どかーん').base, 'boom', 'ひらがなでも同じ音');
  // くり返し・小さい「ッ」で短く・にごる音は重く
  assert.equal(parseSfx('シュワシュワ').repeats, 2);
  assert.equal(parseSfx('シュワ').repeats, 1);
  assert.equal(parseSfx('ポンッ').short, true);
  assert.equal(parseSfx('ゴゴゴ').heavyWord, true);
  assert.equal(parseSfx('ポン').heavyWord, false);
  assert.equal(morae('ピロリン'), 4);
  assert.equal(parseSfx('ピロリン').notes, 4);
  // 表にないことばは、ピコッの音にして伝える
  const u = parseSfx('モフモフ');
  assert.equal(u.known, false);
  assert.equal(u.base, 'beep');
  assert.match(describe(u), /表にないことば/);
  assert.match(describe(parseSfx('ドカーン！！')), /爆発/);
});

test('音を作る：長さぴったり・大きすぎない・5つのちがい・感覚スライダー', () => {
  const r = parseSfx('ドカーン！！');
  const a = renderSfx(r, { sampleRate: SR });
  assert.equal(a.left.length, Math.round(r.length * SR));
  assert.ok(peakOf(a.left) <= PEAK + 1e-6, '耳を守る：PEAK より大きくしない');
  assert.ok(peakOf(a.left) > 0.2, 'ちゃんと鳴る');
  assert.ok(a.left.every(Number.isFinite));
  // 長さぴったり（高さはそのまま）
  const b = renderSfx(r, { sampleRate: SR, length: 2.3 });
  assert.equal(b.left.length, Math.round(2.3 * SR));
  assert.equal(renderSfx(r, { sampleRate: SR, length: 99 }).seconds, LEN_MAX);
  assert.equal(renderSfx(r, { sampleRate: SR, length: 0.01 }).seconds, LEN_MIN);
  // 5つのちがい：同じ材料で少しずつちがう。同じ番号ならいつも同じ
  const vs = variants(parseSfx('トコトコ'), { sampleRate: SR });
  assert.equal(vs.length, VARIANTS);
  assert.notDeepEqual(vs[0].left, vs[1].left);
  assert.deepEqual(renderSfx(parseSfx('トコトコ'), { sampleRate: SR, seed: 3 }).left, vs[2].left);
  // 全部の音のもとが、どの感覚でも鳴る
  for (const word of ['ドカーン', 'ドン', 'ポン', 'ピロリン', 'キラリーン', 'ヒュー', 'ピューン', 'シュワシュワ', 'トコトコ', 'パチパチ']) {
    for (const feel of [{}, { cute: 1 }, { cute: -1 }, { heavy: 1 }, { heavy: -1 }, { retro: 1 }]) {
      const s = renderSfx(parseSfx(word), { sampleRate: SR, feel });
      assert.ok(s.left.every(Number.isFinite), `${word} ${JSON.stringify(feel)}`);
      assert.ok(peakOf(s.left) <= PEAK + 1e-6);
    }
  }
  // レトロ（8bit）：音の段階が少なくなる
  const levels = (arr) => new Set(Array.from(arr, (v) => v.toFixed(4))).size;
  const now = renderSfx(parseSfx('ピロリン'), { sampleRate: SR });
  const old = renderSfx(parseSfx('ピロリン'), { sampleRate: SR, feel: { retro: 1 } });
  assert.ok(levels(old.left) < levels(now.left));
  // WAV にできる
  const wav = encodeWav(a.left, a.right, SR);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
});

test('オノマトペのチェック：12文字まで・犯罪につながることばは使えない・ファイル名', () => {
  assert.equal(checkSfxText('ドカーン！').ok, true);
  assert.equal(checkSfxText('').ok, false);
  assert.equal(checkSfxText('ア'.repeat(13)).ok, false);
  assert.equal(checkSfxText('ころしてやる').ok, false, '人をおびやかす言葉は使えない');
  assert.equal(sfxFileName('ドカーン！'), 'ドカーン！.wav');
  assert.equal(sfxFileName('a/b:c', 2), 'abc_2.wav');
});
