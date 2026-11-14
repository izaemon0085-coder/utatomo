// うたとも の画面：雰囲気と長さ → おまかせで組み立て → パネルをタップ → 再生（Web Audio）→ 書き出し・保存
import * as M from './music.js';

const $ = (s) => document.querySelector(s);
let config = { tomohaneUrl: 'http://localhost:3000', max: 10, titleMax: 20 };
let state = { me: null, songs: [] };
let song = M.buildBgm('bright', 30);
let selected = 0; // いま直している部分
let editingId = null; // 保存ずみの曲を開いているときの id
let length = 30;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'うまくいきませんでした');
  return data;
}
// このパソコンのアドレス（localhost）のとき、スマホから開いても届くように、いま開いているアドレスに合わせる
function tomohaneUrl(path) {
  const u = new URL(path, config.tomohaneUrl);
  if (['localhost', '127.0.0.1'].includes(u.hostname) && !['localhost', '127.0.0.1'].includes(location.hostname)) u.hostname = location.hostname;
  return u.href;
}
const say = (t) => { $('#say').textContent = t; };
const showError = (t = '') => { $('#error').textContent = t; };
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const el = (tag, props = {}, kids = []) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) e.append(k);
  return e;
};

// ── 画面を描く ──
function radioChips(box, items, current, onPick) {
  box.replaceChildren(...items.map(([id, label]) => {
    const b = el('button', { type: 'button', className: 'chip', textContent: label });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(String(id) === String(current)));
    b.onclick = () => onPick(id);
    return b;
  }));
}
function renderChoices() {
  radioChips($('#moods'), M.MOOD_IDS.map((id) => [id, `${M.MOODS[id].emoji} ${M.MOODS[id].label}`]), song.mood, (id) => {
    song.mood = id;
    song.tempo = M.MOODS[id].tempo;
    say(`「${M.MOODS[id].label}」にしたよ。「おまかせ」を押すと、この雰囲気で組み立てなおすよ♪`);
    renderAll();
  });
  radioChips($('#lengths'), Object.entries(M.LENGTHS).map(([id, label]) => [id, `⏱️ ${label}`]), length, (id) => {
    length = id === 'loop' ? 'loop' : Number(id);
    renderChoices();
  });
  $('#quiet').checked = song.quiet;
}
function renderSections() {
  const total = M.songSeconds(song);
  $('#plan-info').textContent = `（${M.totalBars(song)}小節・約${Math.round(total)}秒${song.length === 'loop' ? '・つなぎ目なしのループ' : ''}）`;
  $('#sections').replaceChildren(...song.sections.map((s, i) => {
    const b = el('button', { type: 'button', className: 'sec' }, [M.PARTS[s.part].label, el('small', { textContent: `${s.bars}小節` })]);
    b.style.setProperty('--part', M.PARTS[s.part].color);
    b.style.setProperty('--bars', s.bars);
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === selected));
    b.dataset.index = i;
    b.onclick = () => { selected = i; renderSections(); renderPad(); };
    return b;
  }));
  $('#tempo').value = song.tempo;
  $('#tempo-out').textContent = song.tempo;
}
function renderPad() {
  const sec = song.sections[selected];
  $('#pad-part').textContent = `（いま：${M.PARTS[sec.part].label}）`;
  $('#pad').replaceChildren(...M.INSTS.map((inst) => {
    const p = M.PANELS[inst];
    const row = el('div', { className: 'row' }, [el('div', { className: 'lab' }, [el('span', { textContent: p.emoji }), p.label])]);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', p.label);
    for (const [id, o] of Object.entries(p.options)) {
      const c = el('button', { type: 'button', className: 'cell', textContent: o.label });
      c.style.setProperty('--c', p.color);
      c.setAttribute('aria-pressed', String(sec.panels[inst] === id));
      c.setAttribute('aria-label', `${p.label}：${o.label}`);
      c.onclick = () => {
        sec.panels[inst] = sec.panels[inst] === id ? null : id;
        renderPad();
        if (!player.playing) previewPanel(inst, sec.panels[inst]);
      };
      row.append(c);
    }
    return row;
  }));
}
function renderOut() {
  const t = $('#title').value.trim();
  $('#credit').textContent = M.creditText(t);
  $('#to-plaza').href = tomohaneUrl(`/plaza.html?draft=${encodeURIComponent(M.creditText(t))}`);
  $('#save').textContent = editingId ? '☁️ 上書き保存' : '☁️ 保存';
}
function renderMe() {
  const me = state.me;
  $('#signin-link').hidden = Boolean(me);
  $('#logout').hidden = !me;
  $('#me-line').textContent = me ? `${me.name} さん（${me.ageGroup}）でログイン中` : 'ログインしなくても、作る・聞く・書き出すはできます。保存はログインしてから。';
  $('#my-songs-box').hidden = !me;
  if (!me) return;
  $('#my-count').textContent = `（${state.songs.length} / ${state.max}曲）`;
  $('#my-songs').replaceChildren(...(state.songs.length ? state.songs.map((s) => {
    const open = el('button', { type: 'button', className: 'btn ghost small', textContent: '開く' });
    open.onclick = () => {
      player.stop();
      song = structuredClone(s.song);
      length = song.length;
      editingId = s.id;
      selected = 0;
      $('#title').value = s.title;
      say(`「${s.title}」を開いたよ♪`);
      renderAll();
    };
    const del = el('button', { type: 'button', className: 'btn ghost small', textContent: '消す' });
    del.onclick = async () => {
      if (!confirm(`「${s.title}」を消しますか？（もとにもどせません）`)) return;
      try {
        await api(`/songs/${s.id}/delete`, { method: 'POST' });
        if (editingId === s.id) editingId = null;
        await loadState();
      } catch (e) { showError(e.message); }
    };
    return el('li', {}, [el('span', { className: 'name', textContent: `🎵 ${s.title}` }), el('span', { className: 'muted small', textContent: `${M.MOODS[s.song.mood].label}・約${Math.round(M.songSeconds(s.song))}秒` }), open, del]);
  }) : [el('li', { className: 'muted small', textContent: 'まだ保存した曲はありません' })]));
}
function renderAll() {
  renderChoices();
  renderSections();
  renderPad();
  renderOut();
  updateTime(0);
}

// ── 再生（Web Audio）：1小節ずつ音を作って、少し先まで予約する ──
const player = {
  ctx: null, master: null, playing: false, timer: 0, raf: 0,
  nextTime: 0, pos: 0, queue: [], sources: new Set(), cache: new Map(), endAt: 0,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.value = song.quiet ? 0.5 : 0.8;
    return this.ctx;
  },
  buffer(inst, pattern, n, fill) {
    const key = M.barKey(song, inst, pattern, n, fill);
    let b = this.cache.get(key);
    if (b) return b;
    if (this.cache.size > 240) this.cache.clear();
    const r = M.renderBar({ inst, pattern, mood: song.mood, bar: n, tempo: song.tempo, sampleRate: this.ctx.sampleRate, fill, quiet: song.quiet });
    b = this.ctx.createBuffer(2, r.left.length, this.ctx.sampleRate);
    b.copyToChannel(r.left, 0);
    b.copyToChannel(r.right, 1);
    this.cache.set(key, b);
    return b;
  },
  start(when, buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.master);
    s.onended = () => this.sources.delete(s);
    s.start(when);
    this.sources.add(s);
  },
  // 次に鳴らす小節（「えらんだ部分だけくり返す」のときは、その部分の中をまわる）
  nextBar() {
    const bars = M.flattenBars(song);
    if ($('#repeat-part').checked) {
      const first = bars.findIndex((b) => b.section === selected);
      const count = song.sections[selected].bars;
      if (this.pos < first || this.pos >= first + count) this.pos = first;
    } else if (this.pos >= bars.length) {
      if (song.length !== 'loop') return null;
      this.pos = 0;
    }
    const n = this.pos++;
    return { n, ...bars[n] };
  },
  schedule() {
    const ahead = this.ctx.currentTime + 0.35;
    while (this.playing && !this.endAt && this.nextTime < ahead) {
      const b = this.nextBar();
      if (!b) { this.endAt = this.nextTime + 0.6; break; }
      for (const inst of M.INSTS) {
        const pattern = b.panels[inst];
        if (pattern) this.start(this.nextTime, this.buffer(inst, pattern, b.n, inst === 'rhythm' && b.fill));
      }
      this.queue.push({ t: this.nextTime, n: b.n, section: b.section });
      this.nextTime += M.barSeconds(song.tempo);
    }
  },
  play() {
    this.ensure();
    this.playing = true;
    this.endAt = 0;
    this.queue = [];
    const bars = M.flattenBars(song);
    this.pos = $('#repeat-part').checked ? bars.findIndex((b) => b.section === selected) : 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 60);
    const tick = () => {
      if (!this.playing) return;
      const now = this.ctx.currentTime;
      if (this.endAt && now >= this.endAt) { this.stop(); return; }
      while (this.queue.length > 1 && this.queue[1].t <= now) this.queue.shift();
      const cur = this.queue[0];
      if (cur && cur.t <= now) {
        const into = now - cur.t;
        const barSec = M.barSeconds(song.tempo);
        updateTime(cur.n * barSec + into, cur.section);
        $('#pad').classList.toggle('beat', ((into / barSec) * 4) % 1 < 0.25);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    setPlayButton(true);
  },
  stop() {
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    for (const s of this.sources) { try { s.stop(); } catch { /* もう止まっている */ } }
    this.sources.clear();
    $('#pad').classList.remove('beat');
    setPlayButton(false);
    updateTime(0);
  },
};
// パネルを押したとき、止まっていればその音だけ1小節ためしに鳴らす
function previewPanel(inst, pattern) {
  if (!pattern) return;
  const ctx = player.ensure();
  const first = M.flattenBars(song).findIndex((b) => b.section === selected);
  player.start(ctx.currentTime + 0.02, player.buffer(inst, pattern, Math.max(0, first), false));
}
function setPlayButton(on) {
  $('#play').textContent = on ? '■ とめる' : '▶ 再生';
  $('#play').setAttribute('aria-pressed', String(on));
}
function updateTime(sec, section = -1) {
  const total = M.songSeconds(song);
  $('#time').textContent = `${fmt(sec)} / ${fmt(total)}`;
  $('#bar').style.width = `${Math.min(100, (sec / total) * 100)}%`;
  for (const b of document.querySelectorAll('.sec')) b.classList.toggle('now', Number(b.dataset.index) === section);
}

// ── 書き出し（WAV）・シェア・保存 ──
let lastFile = null;
function fileName() {
  const t = ($('#title').value.trim() || 'うたとも').replace(/[\\/:*?"<>|\s]+/g, '_');
  return `${t}.wav`;
}
async function makeWav() {
  $('#out-msg').textContent = '🎵 音を作っています…（少し待ってね）';
  await new Promise((r) => setTimeout(r, 30));
  const r = M.renderSong(song, { sampleRate: 44100 });
  const wav = M.encodeWav(r.left, r.right, r.sampleRate);
  lastFile = new File([wav], fileName(), { type: 'audio/wav' });
  return lastFile;
}
$('#export').onclick = async () => {
  showError();
  try {
    const f = await makeWav();
    const a = el('a', { href: URL.createObjectURL(f), download: f.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    $('#out-msg').textContent = `💾 「${f.name}」を書き出したよ（約${Math.round(exportSeconds())}秒）。透かしはありません。`;
    say('書き出したよ！SNS にのせるときは、クレジットもいっしょにコピーしてね♪');
  } catch (e) { showError(e.message); }
};
const exportSeconds = () => M.songSeconds(song) + (song.length === 'loop' ? 0 : M.TAIL_SEC);
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'a.wav', { type: 'audio/wav' })] })) $('#share').hidden = false;
$('#share').onclick = async () => {
  showError();
  try {
    const f = await makeWav();
    await navigator.share({ files: [f], text: M.creditText($('#title').value) });
    $('#out-msg').textContent = '📤 シェアの画面を開いたよ';
  } catch (e) { if (e.name !== 'AbortError') showError('シェアできませんでした。「音を書き出す」をつかってね'); }
};
$('#copy-credit').onclick = async () => {
  try {
    await navigator.clipboard.writeText(M.creditText($('#title').value));
    $('#out-msg').textContent = '📋 クレジットをコピーしたよ';
  } catch { showError('コピーできませんでした。上の文字を長押ししてコピーしてね'); }
};
$('#save').onclick = async () => {
  showError();
  if (!state.me) { say('保存するときは「ともはねでログイン」してね♪ 作った曲は、ログインしてもそのまま残るよ。'); stash(); location.href = $('#signin-link').href; return; }
  const title = $('#title').value.trim();
  if (!title) { showError('曲の名前を入れてください'); $('#title').focus(); return; }
  try {
    const r = await api(editingId ? `/songs/${editingId}` : '/songs', { method: 'POST', body: { title, song } });
    editingId = r.song.id;
    await loadState();
    say(r.say);
    renderOut();
  } catch (e) { showError(e.message); }
};
// ログインに行くあいだ、作りかけの曲をこの端末にだけとっておく
function stash() {
  try { sessionStorage.setItem('utatomo-draft', JSON.stringify({ song, title: $('#title').value })); } catch { /* とっておけなくてもよい */ }
}
function unstash() {
  try {
    const d = JSON.parse(sessionStorage.getItem('utatomo-draft') || 'null');
    sessionStorage.removeItem('utatomo-draft');
    const r = d && M.checkSong(d.song);
    if (r?.ok) { song = r.song; length = song.length; $('#title').value = String(d.title || '').slice(0, 20); return true; }
  } catch { /* なし */ }
  return false;
}

// ── 操作 ──
$('#auto').onclick = () => {
  const keep = player.playing;
  if (keep) player.stop();
  song = M.buildBgm(song.mood, length, { rng: Math.random, quiet: $('#quiet').checked, tempo: song.tempo });
  selected = Math.max(0, song.sections.findIndex((s) => s.part === 'sabi' || s.part === 'loop'));
  editingId = null;
  say(`${M.MOODS[song.mood].label}・${M.LENGTHS[length]}の曲を組み立てたよ！▶ で聞いてみてね。気になる部分はパネルで変えられるよ♪`);
  renderAll();
  if (keep) player.play();
};
$('#quiet').onchange = () => {
  song.quiet = $('#quiet').checked;
  if (player.master) player.master.gain.value = song.quiet ? 0.5 : 0.8;
};
$('#tempo').oninput = () => {
  song.tempo = Number($('#tempo').value);
  renderSections();
  updateTime(0);
};
$('#play').onclick = () => (player.playing ? player.stop() : player.play());
$('#title').oninput = renderOut;
$('#logout').onclick = async () => {
  await fetch('/auth/logout', { method: 'POST' });
  editingId = null;
  await loadState();
};

async function loadState() {
  state = await api('/state');
  say(state.say);
  if (state.guide) $('#guide-face').textContent = state.guide.emoji;
  renderMe();
}

(async () => {
  try { config = await api('/config'); } catch { /* ふだんの値のまま */ }
  $('#back-tomohane').href = tomohaneUrl('/');
  $('#signin-link').href = tomohaneUrl('/api/link/utatomo-start');
  const restored = unstash();
  renderAll();
  try { await loadState(); } catch (e) { showError(e.message); }
  if (restored) say('おかえり♪ 作りかけの曲をもどしておいたよ。「保存」を押してね。');
})();
