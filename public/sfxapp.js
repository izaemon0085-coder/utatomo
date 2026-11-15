// 🔔 効果音モード（画面）。音はブラウザの中で計算して作る（サーバーに送らない）
import { encodeWav } from '/music.js';
import { parseSfx, checkSfxText, renderSfx, variants, describe, sfxFileName, FEEL, BASES } from '/sfx.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EXAMPLES = ['ドカーン！！', 'ピロリン', 'シュワシュワ', 'ピューン', 'ポンッ', 'トコトコ', 'キラリーン', 'ゴゴゴ！', 'ひゅー', 'パチパチ'];
const feel = Object.fromEntries(Object.entries(FEEL).map(([k, f]) => [k, f.value]));
let made = []; // 5つのちがい（{ left, right, sampleRate, seconds }）
let ctx = null;

function opts() {
  return { feel, length: $('#sfx-fixlen').checked ? Number($('#sfx-len').value) : undefined };
}
function current() {
  const c = checkSfxText($('#sfx-text').value);
  $('#sfx-error').textContent = c.ok ? '' : c.error;
  if (!c.ok) return null;
  return { text: c.text, recipe: parseSfx(c.text) };
}
function showDesc() {
  const cur = current();
  $('#sfx-desc').textContent = cur ? `🔔 ${cur.text} → ${describe(cur.recipe)}` : '';
}
function play(snd) {
  ctx ??= new AudioContext();
  const buf = ctx.createBuffer(1, snd.left.length, snd.sampleRate);
  buf.copyToChannel(snd.left, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}
function save(snd, name) {
  const wav = encodeWav(snd.left, snd.right, snd.sampleRate);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('#sfx-examples').innerHTML = EXAMPLES.map((w) => `<button type="button" class="chip" data-sfx-ex="${esc(w)}">${esc(w)}</button>`).join('');
$('#sfx-feel').innerHTML = Object.entries(FEEL).map(([k, f]) => `<label><span>${esc(f.left)}</span><input type="range" data-feel="${k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.value}" aria-label="${esc(f.label)}"><span>${esc(f.right)}</span></label>`).join('');

$('#sfx-examples').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sfx-ex]');
  if (!b) return;
  $('#sfx-text').value = b.dataset.sfxEx;
  made = []; $('#sfx-list').innerHTML = '';
  showDesc();
  const cur = current();
  if (cur) play(renderSfx(cur.recipe, opts()));
});
$('#sfx-text').addEventListener('input', () => { made = []; $('#sfx-list').innerHTML = ''; showDesc(); });
$('#sfx-feel').addEventListener('input', (e) => { const k = e.target.dataset.feel; if (k) feel[k] = Number(e.target.value); });
$('#sfx-feel').addEventListener('change', () => { const cur = current(); if (cur) play(renderSfx(cur.recipe, opts())); });
$('#sfx-fixlen').addEventListener('change', (e) => { $('#sfx-len-box').hidden = !e.target.checked; });
$('#sfx-len').addEventListener('input', (e) => { $('#sfx-len-out').textContent = `${Number(e.target.value).toFixed(2)} 秒`; });
$('#sfx-play').addEventListener('click', () => { const cur = current(); if (cur) play(renderSfx(cur.recipe, opts())); });
$('#sfx-variants').addEventListener('click', () => {
  const cur = current();
  if (!cur) return;
  made = variants(cur.recipe, opts());
  $('#sfx-list').innerHTML = made.map((s, k) => `<li><span class="small">${k + 1}つ目（${s.seconds.toFixed(2)}秒）</span>
    <button type="button" class="btn ghost small" data-sfx-play="${k}" aria-label="${k + 1}つ目を鳴らす">▶</button>
    <button type="button" class="btn ghost small" data-sfx-save="${k}" aria-label="${k + 1}つ目を保存">💾</button></li>`).join('');
  play(made[0]);
});
$('#sfx-list').addEventListener('click', (e) => {
  const p = e.target.closest('[data-sfx-play]');
  const s = e.target.closest('[data-sfx-save]');
  const cur = current();
  if (p) play(made[Number(p.dataset.sfxPlay)]);
  if (s && cur) save(made[Number(s.dataset.sfxSave)], sfxFileName(cur.text, Number(s.dataset.sfxSave) + 1));
});
$('#sfx-save').addEventListener('click', () => {
  const cur = current();
  if (cur) save(renderSfx(cur.recipe, opts()), sfxFileName(cur.text));
});
showDesc();
export { BASES };
