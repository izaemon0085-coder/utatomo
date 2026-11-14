// うたとも の画面：雰囲気と長さ → おまかせで組み立て → パネルをタップ → 再生（Web Audio）→ 書き出し・保存
import * as M from './music.js';
import { precheck } from './precheck.js';
import * as V from './video.js';
import { renderStand, checkLook, randomLook } from './parts.js';
import { liveFromSong, encodeLive } from './live.js';

const $ = (s) => document.querySelector(s);
let config = { tomohaneUrl: 'http://localhost:3000', vtomoUrl: 'http://localhost:4200', tomoruUrl: 'http://localhost:4100', max: 10, titleMax: 20 };
let state = { me: null, songs: [] };
let song = M.buildBgm('bright', 30);
let selected = 0; // いま直している部分
let editingId = null; // 保存ずみの曲を開いているときの id
let length = 30;
let streamSet = null; // 配信セット（はじまり・まったり・おわり）
let setKey = null; // 配信セットのどの曲を開いているか
// 録った声：曲ごとに「部分の番号 → 声（AudioBuffer）」。この端末のメモリの中だけ（サーバーには送らない）
const voiceStore = new WeakMap();
const voices = () => {
  if (!voiceStore.has(song)) voiceStore.set(song, new Map());
  return voiceStore.get(song);
};
// 送る前のチェックのキャラ（ともはね と同じ）
const AGENTS = {
  'agent-fukurou': ['🦉', 'フクロウ'], 'agent-yamaneko': ['🐱', 'ヤマネコ'], 'agent-usagi': ['🐰', 'ウサギ'], 'agent-shiba': ['🐕', 'シバ'],
};

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
    if (voices().has(i)) b.classList.add('has-voice');
    b.onclick = () => { selected = i; renderSections(); renderPad(); renderLyric(); };
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
// 歌詞：いまの部分の歌詞を書く。キャラが「送る前のチェック」で声をかける
function renderLyric() {
  const sec = song.sections[selected];
  $('#lyric-part').textContent = `（いま：${M.PARTS[sec.part].label}）`;
  if (document.activeElement !== $('#lyric')) $('#lyric').value = sec.lyric || '';
  lyricInfo();
  renderVoice();
}
function lyricInfo() {
  const v = $('#lyric').value;
  const lines = v.split('\n').filter((l) => l.trim()).length;
  const chars = [...v.replace(/\s+/g, '')].length;
  const over = lines > M.LYRIC_LINES || chars > M.LYRIC_MAX;
  $('#lyric-count').textContent = `${lines} / ${M.LYRIC_LINES}行・${chars} / ${M.LYRIC_MAX}文字${over ? '（多すぎます）' : ''}`;
  $('#lyric-count').classList.toggle('error', over);
  const c = precheck(M.allLyrics(song));
  $('#check-box').replaceChildren(...c.lines.map((l) => {
    const [emoji, name] = AGENTS[l.agentId] || ['💬', ''];
    return el('div', { className: `agent ${c.level}` }, [el('span', { textContent: emoji }), el('span', { textContent: `${name}：${l.text}` })]);
  }));
  if (c.level === 'block') $('#check-box').append(el('p', { className: 'error', textContent: 'この歌詞のままでは保存できません。' }));
  drawPreview();
}
$('#lyric').oninput = () => {
  const sec = song.sections[selected];
  const v = $('#lyric').value;
  if (v.trim()) sec.lyric = v;
  else delete sec.lyric;
  lyricInfo();
};
$('#lyric').onblur = () => {
  const sec = song.sections[selected];
  const clean = M.cleanLyric(sec.lyric);
  if (clean === null) return; // 多すぎるときは、そのまま見せて直してもらう
  if (clean) sec.lyric = clean;
  else delete sec.lyric;
  $('#lyric').value = clean;
};
function renderOut() {
  const t = $('#title').value.trim();
  $('#credit').textContent = M.creditText(t);
  $('#to-plaza').href = tomohaneUrl(`/plaza.html?draft=${encodeURIComponent(M.creditText(t))}`);
  $('#save').textContent = editingId ? '☁️ 上書き保存' : '☁️ 保存';
  drawPreview();
}
function renderMe() {
  const me = state.me;
  $('#signin-link').hidden = Boolean(me);
  $('#logout').hidden = !me;
  $('#me-line').textContent = me ? `${me.name} さん（${me.ageGroup}）でログイン中` : 'ログインしなくても、作る・聞く・書き出すはできます。保存はログインしてから。';
  $('#my-songs-box').hidden = !me;
  renderVoice();
  if (!me && room) leaveRoom();
  renderRoomLobby();
  if (!me) return;
  $('#my-count').textContent = `（${state.songs.length} / ${state.max}曲）`;
  $('#my-songs').replaceChildren(...(state.songs.length ? state.songs.map((s) => {
    const open = el('button', { type: 'button', className: 'btn ghost small', textContent: '開く' });
    open.onclick = () => {
      player.stop();
      song = structuredClone(s.song);
      length = song.length;
      editingId = s.id;
      setKey = null;
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
  renderLyric();
  renderOut();
  renderSet();
  renderCalls();
  $('#live-out').hidden = true;
  updateTime(0);
}

// ── 配信セット ──
function renderSet() {
  $('#set-box').hidden = !streamSet;
  if (!streamSet) return;
  radioChips($('#set-tabs'), M.STREAM_SET.map((x) => [x.id, `${x.emoji} ${x.label}`]), setKey, (id) => openSetSong(id));
}
function openSetSong(id) {
  player.stop();
  song = streamSet[id];
  setKey = id;
  length = song.length;
  selected = 0;
  editingId = null;
  const x = M.STREAM_SET.find((s) => s.id === id);
  say(`配信セットの「${x.label}」を開いたよ。パネルで変えたら、そのままセットに残るよ♪`);
  renderAll();
}
$('#make-set').onclick = () => {
  streamSet = M.buildStreamSet(song.mood, { rng: Math.random });
  say('配信セットができたよ！「はじまり」はループ、「まったり」は声のじゃまをしない音、「おわり」は30秒でしめくくるよ♪');
  openSetSong('start');
};
$('#export-set').onclick = async () => {
  showError();
  const base = ($('#title').value.trim() || '配信セット').replace(/[\\/:*?"<>|\s]+/g, '_');
  for (const x of M.STREAM_SET) {
    const f = await makeWav(streamSet[x.id], `${base}_${x.label}.wav`);
    download(f);
    await new Promise((r) => setTimeout(r, 600)); // つづけて保存するとブラウザが止めることがあるので、少しあける
  }
  $('#out-msg').textContent = '💾 配信セットの3曲を書き出したよ（はじまり・まったり・おわり）';
};

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
      this.voiceGain = this.ctx.createGain(); // 声は音楽の音量（ひかえめ）にしばられない
      this.voiceGain.gain.value = 1;
      this.voiceGain.connect(comp);
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
  start(when, buf, dest = this.master, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(dest);
    s.onended = () => this.sources.delete(s);
    s.start(when, offset);
    this.sources.add(s);
  },
  // 次に鳴らす小節（「えらんだ部分だけくり返す」のときは、その部分の中をまわる）
  nextBar() {
    const bars = M.flattenBars(song);
    if (this.only !== null) { // 声を録るとき：その部分を1回だけ
      const first = bars.findIndex((b) => b.section === this.only);
      if (this.pos < first) this.pos = first;
      if (this.pos >= first + song.sections[this.only].bars) return null;
    } else if ($('#repeat-part').checked) {
      const first = bars.findIndex((b) => b.section === selected);
      const count = song.sections[selected].bars;
      if (this.pos < first || this.pos >= first + count) this.pos = first;
    } else if (this.pos >= bars.length) {
      if (song.length !== 'loop') return null;
      this.pos = 0;
    }
    const n = this.pos++;
    let k = 0; // 部分の中の何小節目か
    while (n - k - 1 >= 0 && bars[n - k - 1].section === bars[n].section) k++;
    return { n, k, ...bars[n] };
  },
  schedule() {
    // おわりは、画面を描く動き（見えていないと止まる）だけにたよらず、ここでもたしかめる
    if (this.endAt && this.ctx.currentTime >= this.endAt) { this.stop(); return; }
    const ahead = this.ctx.currentTime + 0.35;
    while (this.playing && !this.endAt && this.nextTime < ahead) {
      const b = this.nextBar();
      if (!b) { this.endAt = this.nextTime + (this.only !== null ? 0.3 : 0.6); break; }
      for (const inst of M.INSTS) {
        const pattern = b.panels[inst];
        if (pattern) this.start(this.nextTime, this.buffer(inst, pattern, b.n, inst === 'rhythm' && b.fill));
      }
      // 録った声は、部分の頭から鳴らす（録っている部分の声は鳴らさない）
      const v = voices().get(b.section);
      if (v && b.k === 0 && this.only === null) {
        const shift = voiceShift(); // ずれ調整：＋なら声を早める（頭を少し切る）、−ならおそくする
        if (shift >= 0) this.start(this.nextTime, v, this.voiceGain, shift);
        else this.start(this.nextTime - shift, v, this.voiceGain);
      }
      this.queue.push({ t: this.nextTime, n: b.n, k: b.k, section: b.section });
      this.nextTime += M.barSeconds(song.tempo);
    }
  },
  // only：その部分だけ1回（声を録るとき）。countIn：はじめに数える小節の数
  play({ only = null, countIn = 0 } = {}) {
    this.ensure();
    this.playing = true;
    this.only = only;
    this.endAt = 0;
    this.queue = [];
    const bars = M.flattenBars(song);
    this.pos = only !== null ? bars.findIndex((b) => b.section === only) : $('#repeat-part').checked ? bars.findIndex((b) => b.section === selected) : 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    if (countIn) { // 「カッ・カッ・カッ・カッ」
      const barSec = M.barSeconds(song.tempo);
      for (let q = 0; q < 4; q++) this.start(this.nextTime + (q * barSec) / 4, this.click(q === 0));
      this.nextTime += barSec * countIn;
    }
    this.startedAt = this.nextTime;
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
        showKaraoke(cur.section, (cur.k + into / barSec) / song.sections[cur.section].bars);
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
    $('#karaoke').hidden = true;
    setPlayButton(false);
    updateTime(0);
    const done = this.onDone;
    this.onDone = null;
    if (done) done();
  },
  click(high) {
    const sr = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, Math.round(sr * 0.05), sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * (high ? 1600 : 1100) * i) / sr) * Math.exp(-i / (sr * 0.01)) * 0.5;
    return b;
  },
};
player.only = null;
player.onDone = null;

// 歌詞が流れる画面：部分の歌詞を、進み具合に合わせて1行ずつ光らせる
function showKaraoke(section, progress) {
  const lyric = song.sections[section]?.lyric;
  const box = $('#karaoke');
  if (!lyric) { box.hidden = true; return; }
  const lines = lyric.split('\n').filter((l) => l.trim());
  const now = Math.min(lines.length - 1, Math.floor(progress * lines.length));
  if (box.dataset.key !== `${section}:${now}` || box.hidden) {
    box.dataset.key = `${section}:${now}`;
    box.replaceChildren(...lines.map((l, i) => el('div', { className: `line${i === now ? ' now' : ''}`, textContent: l })));
    box.hidden = false;
  }
}

// ── 声を録る（部分ごと）。マイクの音はこの端末の中だけで使う ──
const rec = { on: false, stream: null, proc: null, src: null, chunks: [] };
function renderVoice() {
  const has = voices().has(selected);
  $('#rec-del').hidden = !has;
  if (rec.on) return;
  $('#rec').textContent = has ? '🎙️ この部分を録りなおす' : '🎙️ この部分を録る';
  if (state.me?.child) $('#voice-msg').textContent = '録った声は、うたとも の中で聞くだけです（子どもの声は書き出しに入りません）。イヤホンをつけて録ってね。';
  else if (!state.me) $('#voice-msg').textContent = 'ためしに録って、曲といっしょに聞けます。書き出しに声を入れるのは、ともはねでログインしてから（子どもの声を外に出さないため）。イヤホンをつけてね。';
}
// 声を書き出しに入れてよいか：ログインした中高生・大人だけ
const voiceExportable = () => Boolean(state.me && !state.me.child);
// ずれ調整（ミリ秒）。この端末にだけ覚えておく（マイクのおくれは端末ごとにちがうので）
let voiceOffsetMs = 0;
try { voiceOffsetMs = Math.max(-300, Math.min(300, Number(localStorage.getItem('utatomo-voice-offset')) || 0)); } catch { /* 覚えられなくてもよい */ }
const voiceShift = () => voiceOffsetMs / 1000;
function renderOffset() {
  $('#voice-offset').value = voiceOffsetMs;
  $('#voice-offset-out').textContent = voiceOffsetMs === 0 ? '0' : voiceOffsetMs > 0 ? `声を ${voiceOffsetMs}ミリ秒 早める` : `声を ${-voiceOffsetMs}ミリ秒 おそくする`;
}
$('#voice-offset').oninput = () => {
  voiceOffsetMs = Number($('#voice-offset').value);
  try { localStorage.setItem('utatomo-voice-offset', String(voiceOffsetMs)); } catch { /* なし */ }
  renderOffset();
};
renderOffset();
async function startRecording() {
  showError();
  if (!navigator.mediaDevices?.getUserMedia) { showError('このブラウザでは録音できません'); return; }
  player.stop();
  const ctx = player.ensure();
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    showError('マイクが使えませんでした。ブラウザの「マイクを許可」をたしかめてね');
    return;
  }
  const section = selected;
  rec.on = true;
  rec.chunks = [];
  rec.src = ctx.createMediaStreamSource(rec.stream);
  rec.proc = ctx.createScriptProcessor(4096, 1, 1);
  const size = rec.proc.bufferSize;
  rec.proc.onaudioprocess = (e) => {
    // この入力のかたまりの頭の時刻（出力が鳴る時刻からかたまり1つ分もどす）
    rec.chunks.push({ t: e.playbackTime - size / ctx.sampleRate, data: new Float32Array(e.inputBuffer.getChannelData(0)) });
  };
  const mute = ctx.createGain();
  mute.gain.value = 0;
  rec.src.connect(rec.proc).connect(mute).connect(ctx.destination);
  $('#rec').textContent = '■ 録るのをやめる';
  $('#rec').classList.add('on');
  $('#voice-msg').textContent = '🔴 録っています…「カッ・カッ・カッ・カッ」のあとに歌ってね';
  player.onDone = () => finishRecording(section);
  player.play({ only: section, countIn: 1 });
}
function finishRecording(section) {
  const ctx = player.ctx;
  rec.proc.disconnect();
  rec.src.disconnect();
  for (const t of rec.stream.getTracks()) t.stop();
  rec.on = false;
  $('#rec').classList.remove('on');
  const sr = ctx.sampleRate;
  const from = player.startedAt - (ctx.baseLatency || 0); // 部分の頭（マイクの入りのおくれを少しだけ見こむ）
  const len = Math.round((song.sections[section].bars * M.barSeconds(song.tempo) + 0.5) * sr);
  const out = ctx.createBuffer(1, len, sr);
  const d = out.getChannelData(0);
  for (const c of rec.chunks) {
    const off = Math.round((c.t - from) * sr);
    for (let i = 0; i < c.data.length; i++) {
      const j = off + i;
      if (j >= 0 && j < len) d[j] = c.data[i];
    }
  }
  rec.chunks = [];
  let peak = 0;
  for (const x of d) peak = Math.max(peak, Math.abs(x));
  if (peak < 0.01) {
    $('#voice-msg').textContent = '声が聞こえなかったみたい。マイクをたしかめて、もう一度どうぞ';
    renderVoice();
    return;
  }
  voices().set(section, out);
  renderSections();
  renderVoice();
  $('#voice-msg').textContent = `「${M.PARTS[song.sections[section].part].label}」の声を録ったよ。▶ で曲といっしょに聞けます。ずれていたら「ずれ調整」で合わせてね`;
  say('いい声！ ほかの部分も録ってみてね♪');
}
$('#rec').onclick = () => {
  if (rec.on) { player.stop(); return; }
  startRecording();
};
$('#rec-del').onclick = () => {
  voices().delete(selected);
  $('#voice-msg').textContent = 'この部分の声を消したよ';
  renderSections();
  renderVoice();
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
// 録った声を曲にまぜる（子どもの声・ログインしていない人の声はまぜない）。声のサンプル数のちがいは、間をとってそろえる
function mixVoices(target, r) {
  const vs = voiceStore.get(target);
  if (!vs?.size || !voiceExportable()) return false;
  const barLen = Math.round(M.barSeconds(target.tempo) * r.sampleRate);
  const shift = voiceShift() * r.sampleRate; // ずれ調整（＋なら声を早める）
  let bar = 0;
  target.sections.forEach((s, i) => {
    const v = vs.get(i);
    if (v) {
      const d = v.getChannelData(0);
      const ratio = v.sampleRate / r.sampleRate;
      const off = bar * barLen;
      const n = Math.min(r.left.length - off, Math.floor(d.length / ratio - shift));
      for (let j = Math.max(0, Math.ceil(-shift)); j < n; j++) {
        const x = (j + shift) * ratio;
        const i0 = Math.floor(x);
        const y = d[i0] + (d[Math.min(d.length - 1, i0 + 1)] - d[i0]) * (x - i0);
        r.left[off + j] += y * 0.9;
        r.right[off + j] += y * 0.9;
      }
    }
    bar += s.bars;
  });
  let peak = 0;
  for (let i = 0; i < r.left.length; i++) peak = Math.max(peak, Math.abs(r.left[i]), Math.abs(r.right[i]));
  if (peak > 0.98) { // 割れないように、全体を少し小さく
    const g = 0.98 / peak;
    for (let i = 0; i < r.left.length; i++) { r.left[i] *= g; r.right[i] *= g; }
  }
  return true;
}
async function makeWav(target = song, name = fileName()) {
  $('#out-msg').textContent = '🎵 音を作っています…（少し待ってね）';
  await new Promise((r) => setTimeout(r, 30));
  const r = M.renderSong(target, { sampleRate: 44100 });
  mixVoices(target, r);
  const wav = M.encodeWav(r.left, r.right, r.sampleRate);
  lastFile = new File([wav], name, { type: 'audio/wav' });
  return lastFile;
}
function download(f) {
  const a = el('a', { href: URL.createObjectURL(f), download: f.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
$('#export').onclick = async () => {
  showError();
  try {
    const f = await makeWav();
    download(f);
    const hasVoice = voices().size > 0;
    const voiceNote = !hasVoice ? '' : voiceExportable() ? '（録った声も入っています）'
      : state.me?.child ? '（声は入れていません。子どもの声は外に出しません）' : '（声は入れていません。声を入れるのは、ともはねでログインしてから）';
    $('#out-msg').textContent = `💾 「${f.name}」を書き出したよ（約${Math.round(exportSeconds())}秒）${voiceNote}。透かしはありません。`;
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

// ── 動画（Vとも のキャラと） ──
let format = 'tall';
let look = null; // キャラの部品のえらび方。Vとも から ?look=… で来る
let charaImg = null;
const video = { on: false, rec: null, timer: 0, src: null, file: null };
// Vとも から連れてきたキャラ（?look=…）。このタブの中にとっておく
function takeLookFromUrl() {
  const p = new URLSearchParams(location.search).get('look');
  if (p) {
    try {
      const json = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/')))));
      const r = checkLook(json);
      if (r.ok) sessionStorage.setItem('ut_look', JSON.stringify({ look: r.look, from: 'vtomo' }));
    } catch { /* こわれていたら使わない */ }
    history.replaceState(null, '', location.pathname);
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem('ut_look') || 'null');
    if (saved && checkLook(saved.look).ok) return saved;
  } catch { /* なし */ }
  return null;
}
function setLook(l, from) {
  look = l;
  try { sessionStorage.setItem('ut_look', JSON.stringify(l ? { look: l, from } : null)); } catch { /* なし */ }
  $('#chara-line').textContent = !l ? 'キャラなしで、ステージだけの動画にします。'
    : from === 'vtomo' ? '🦫 Vとも から来たキャラです。' : '🎲 おまかせのキャラです。Vとも で自分のキャラを作って連れてくることもできます。';
  if (!l) { charaImg = null; drawPreview(); return; }
  const img = new Image();
  img.onload = () => { charaImg = img; drawPreview(); };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderStand(l))}`;
}
function renderFormats() {
  radioChips($('#formats'), Object.entries(V.FORMATS).map(([id, f]) => [id, `${id === 'tall' ? '📱' : '🖥️'} ${f.label}`]), format, (id) => {
    format = id;
    renderFormats();
    drawPreview();
  });
}
// 見本：いまえらんでいる部分のまん中あたりを描く
function drawPreview(t) {
  if (video.on) return;
  const c = $('#stage');
  const f = V.FORMATS[format];
  if (c.width !== f.w || c.height !== f.h) { c.width = f.w; c.height = f.h; }
  let at = t;
  if (at == null) {
    const startBar = song.sections.slice(0, selected).reduce((n, s) => n + s.bars, 0);
    at = (startBar + song.sections[selected].bars * 0.3) * M.barSeconds(song.tempo);
  }
  V.drawFrame(c.getContext('2d'), { format, t: at, song, chara: charaImg, title: $('#title').value.trim(), lyrics: $('#video-lyrics').checked, guide: $('#video-guide').checked });
}
async function startVideo() {
  showError();
  const type = window.MediaRecorder ? V.pickVideoType((m) => MediaRecorder.isTypeSupported(m)) : '';
  const c = $('#stage');
  if (!type || !c.captureStream) { showError('このブラウザでは動画を書き出せません（パソコンの Chrome などでためしてね）'); return; }
  player.stop();
  const ctx = player.ensure();
  $('#video-msg').textContent = '🎵 音を作っています…';
  await new Promise((r) => setTimeout(r, 30));
  const r = M.renderSong(song, { sampleRate: ctx.sampleRate });
  const withVoice = mixVoices(song, r);
  const buf = ctx.createBuffer(2, r.left.length, r.sampleRate);
  buf.copyToChannel(r.left, 0);
  buf.copyToChannel(r.right, 1);
  const f = V.FORMATS[format];
  c.width = f.w;
  c.height = f.h;
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  src.connect(ctx.destination); // 書き出しながら、音も聞こえる
  const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const g = c.getContext('2d');
  const title = $('#title').value.trim();
  const lyrics = $('#video-lyrics').checked;
  const total = r.left.length / r.sampleRate;
  const t0 = ctx.currentTime + 0.15;
  Object.assign(video, { on: true, rec, src });
  $('#video-rec').textContent = '■ 書き出しをやめる';
  $('#video-rec').classList.add('on');
  rec.onstop = () => {
    clearInterval(video.timer);
    const done = video.on && !video.cancel;
    Object.assign(video, { on: false, rec: null, src: null, cancel: false });
    $('#video-rec').textContent = '🎬 動画を書き出す';
    $('#video-rec').classList.remove('on');
    if (!done) { $('#video-msg').textContent = '書き出しをやめたよ'; drawPreview(); return; }
    const name = `${(title || 'うたとも').replace(/[\\/:*?"<>|\s]+/g, '_')}_${f.short}.${V.videoExt(type)}`;
    video.file = new File(chunks, name, { type: type.split(';')[0] });
    download(video.file);
    $('#video-share').hidden = !(navigator.canShare && navigator.canShare({ files: [video.file] }));
    const voiceNote = voices().size && !withVoice ? '（声は入れていません）' : '';
    $('#video-msg').textContent = `🎬 「${name}」を書き出したよ${voiceNote}。SNS にのせるときは、クレジットもいっしょにコピーしてね。`;
    say('動画ができたよ！ キャラもステージでノリノリだったね♪');
    drawPreview();
  };
  rec.start(1000);
  src.start(t0);
  // 画面が見えていなくても止まりにくいように、タイマーで1コマずつ描く
  video.timer = setInterval(() => {
    const t = ctx.currentTime - t0;
    V.drawFrame(g, { format, t: Math.max(0, t), song, chara: charaImg, title, lyrics, guide: false });
    $('#video-msg').textContent = `🎬 書き出し中… ${fmt(Math.max(0, t))} / ${fmt(total)}`;
    if (t >= total + 0.2 && rec.state === 'recording') rec.stop();
  }, 1000 / 30);
}
$('#video-rec').onclick = () => {
  if (video.on) {
    video.cancel = true;
    try { video.src.stop(); } catch { /* なし */ }
    video.rec.stop();
    return;
  }
  startVideo();
};
$('#video-share').onclick = async () => {
  try { await navigator.share({ files: [video.file], text: M.creditText($('#title').value) }); } catch (e) { if (e.name !== 'AbortError') showError('シェアできませんでした'); }
};
$('#chara-random').onclick = () => setLook(randomLook(), 'random');
$('#chara-none').onclick = () => setLook(null);
$('#video-lyrics').onchange = () => drawPreview();
$('#video-guide').onchange = () => drawPreview();

// ── アリーナでライブ：部分ごとのコール → ライブコード ──
function renderCalls() {
  $('#calls').replaceChildren(...song.sections.map((s, i) => {
    const sel = el('select', {}, [el('option', { value: '', textContent: 'コールなし' }), ...M.CALLS.map((w) => el('option', { value: w, textContent: `📣 ${w}` }))]);
    sel.value = s.call || '';
    sel.setAttribute('aria-label', `${i + 1}番目「${M.PARTS[s.part].label}」のコール`);
    sel.onchange = () => {
      if (sel.value) s.call = sel.value;
      else delete s.call;
      $('#live-out').hidden = true;
    };
    return el('label', {}, [`${i + 1}. ${M.PARTS[s.part].label}`, sel]);
  }));
}
$('#make-live').onclick = () => {
  showError();
  const title = $('#title').value.trim();
  if (!title) { $('#live-msg').textContent = '⑤ の「曲の名前」を入れてから作ってね'; $('#title').focus(); return; }
  const r = liveFromSong({ title, song, look });
  if (!r.ok) {
    $('#live-msg').textContent = r.bad === 'lyric' ? `この歌詞では、ライブにできません${r.reason ? `（${r.reason}）` : ''}`
      : r.bad === 'title' ? '曲の名前に、アドレスや長い数字は入れられません' : 'ライブコードを作れませんでした（歌詞の行や文字が多すぎないか見てね）';
    return;
  }
  const code = encodeLive(r.live);
  $('#live-code').value = code;
  const u = new URL('/', config.tomoruUrl);
  if (['localhost', '127.0.0.1'].includes(u.hostname) && !['localhost', '127.0.0.1'].includes(location.hostname)) u.hostname = location.hostname;
  u.searchParams.set('live', code);
  $('#to-tomoru').href = u.href;
  $('#live-out').hidden = false;
  $('#live-msg').textContent = `🎤 ライブコードができたよ（コール ${r.live.calls.length} か所${look ? '・キャラつき' : ''}）。運営に送ると、アリーナでライブを開いてくれます。`;
  say('アリーナのステージで歌うの、楽しみだね！ 🦚クジャクさんが司会をしてくれるよ♪');
};
$('#copy-live').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('#live-code').value);
    $('#live-msg').textContent = '📋 ライブコードをコピーしたよ';
  } catch { $('#live-code').select(); $('#live-msg').textContent = 'コピーできなかったので、選んでおいたよ。長押しでコピーしてね'; }
};

// ── みんなで1曲（ルーム） ──
const PART_LABEL = { ...Object.fromEntries(M.INSTS.map((i) => [i, `${M.PANELS[i].emoji} ${M.PANELS[i].label}`])), lyric: '✏️ 歌詞' };
const ROOM_PARTS = [...M.INSTS, 'lyric'];
let room = null; // いま入っているルーム
let roomTimer = 0;
let roomDirty = false; // 自分のパートを書きかえ中（まだとどけていない）
async function renderRoomLobby() {
  const inRoom = Boolean(room);
  $('#room-login').hidden = Boolean(state.me);
  $('#room-lobby').hidden = !state.me || inRoom;
  $('#room-view').hidden = !state.me || !inRoom;
  if (!state.me || inRoom) return;
  try {
    const { rooms } = await api('/rooms');
    $('#room-list').replaceChildren(...(rooms.length ? rooms.map((r) => {
      const b = el('button', { type: 'button', className: 'btn ghost small', textContent: r.joined ? 'もどる' : '入る' });
      b.onclick = () => openRoom(r.code);
      return el('li', {}, [el('span', { className: 'name', textContent: `👥 ${r.title}` }), el('span', { className: 'muted small', textContent: `${r.owner} さん・あき ${r.free} パート` }), b]);
    }) : [el('li', { className: 'muted small', textContent: 'いまはルームがありません。作ってみよう！' })]));
  } catch (e) { showError(e.message); }
}
async function openRoom(code) {
  showError();
  try {
    room = await api(`/rooms/${encodeURIComponent(code.toUpperCase())}`);
    roomDirty = false;
    renderRoom();
    renderRoomLobby();
    clearInterval(roomTimer);
    roomTimer = setInterval(pollRoom, 4000); // みんなの変更を見に行く
  } catch (e) { $('#room-msg').textContent = ''; showError(e.message); }
}
async function pollRoom() {
  if (!room || document.hidden) return;
  try {
    const r = await api(`/rooms/${room.code}`);
    if (r.version !== room.version) {
      room = r;
      renderRoom({ keepMine: roomDirty });
    }
  } catch { leaveRoom(); }
}
function leaveRoom() {
  clearInterval(roomTimer);
  room = null;
  renderRoomLobby();
}
function renderRoom({ keepMine = false } = {}) {
  const r = room;
  $('#room-name').textContent = `👥 ${r.title}`;
  $('#room-code-show').textContent = r.code;
  const free = ROOM_PARTS.filter((p) => !r.parts[p]).length;
  $('#room-info').textContent = `作った人：${r.owner} さん・${M.MOODS[r.song.mood].label}・約${Math.round(M.songSeconds(r.song))}秒・あき ${free} パート`;
  const draft = `🎵 うたとも の「みんなで1曲」で「${r.title}」を作っています！ ルーム番号 ${r.code} で入って、パートを受けもってね♪ #うたとも`;
  $('#room-cafe').href = tomohaneUrl(`/cafe.html?draft=${encodeURIComponent(draft)}`);
  $('#room-delete').hidden = !r.mine;
  $('#room-parts').replaceChildren(...ROOM_PARTS.map((p) => {
    const who = r.parts[p];
    const mine = r.myPart === p;
    const box = el('div', { className: `room-part${mine ? ' mine' : ''}` }, [el('strong', { textContent: PART_LABEL[p] }), el('span', { className: 'who', textContent: who ? `${who} さん${mine ? '（わたし）' : ''}` : 'あいています' })]);
    if (!who) {
      const b = el('button', { type: 'button', className: 'btn small', textContent: '受けもつ' });
      b.onclick = () => roomAction('claim', { part: p }, `「${PART_LABEL[p]}」を受けもったよ！`);
      box.append(b);
    }
    return box;
  }));
  $('#room-edit').hidden = !r.myPart;
  if (r.myPart && !keepMine) renderRoomFields();
}
// 自分のパートの入力：楽器なら部分ごとにパネル、歌詞なら部分ごとに文字
function renderRoomFields() {
  const r = room;
  const p = r.myPart;
  $('#room-edit-title').textContent = `わたしのパート：${PART_LABEL[p]}`;
  $('#room-fields').replaceChildren(...r.song.sections.map((s, i) => {
    const name = `${i + 1}. ${M.PARTS[s.part].label}`;
    let field;
    if (p === 'lyric') {
      field = el('textarea', { rows: 2, maxLength: 120, value: s.lyric || '', placeholder: '歌詞（4行・80文字まで）' });
    } else {
      field = el('select', {}, [el('option', { value: '', textContent: 'なし' }), ...Object.entries(M.PANELS[p].options).map(([id, o]) => el('option', { value: id, textContent: o.label }))]);
      field.value = s.panels[p] || '';
    }
    field.dataset.index = i;
    field.setAttribute('aria-label', `${name}の${PART_LABEL[p]}`);
    field.oninput = () => { roomDirty = true; };
    return el('label', {}, [name, field]);
  }));
}
async function roomAction(action, body, msg) {
  showError();
  try {
    room = await api(`/rooms/${room.code}/${action}`, { method: 'POST', body: body || {} });
    roomDirty = false;
    renderRoom();
    if (msg) $('#room-msg').textContent = msg;
  } catch (e) { showError(e.message); }
}
$('#room-send').onclick = () => {
  const p = room.myPart;
  const values = [...document.querySelectorAll('#room-fields [data-index]')].map((f) => (p === 'lyric' ? f.value : f.value || null));
  if (p === 'lyric') {
    const c = precheck(values.join('\n'));
    if (c.level === 'block') { showError(`この歌詞は入れられません（${c.reason}）`); return; }
    if (c.lines.length) $('#room-msg').textContent = c.lines.map((l) => `${(AGENTS[l.agentId] || ['💬'])[0]} ${l.text}`).join(' ');
  }
  roomAction('edit', { part: p, values, version: room.version }, `💾 「${PART_LABEL[p]}」をとどけたよ。▶ で、みんなの曲を聞いてみてね`);
};
$('#room-release').onclick = () => roomAction('release', null, 'パートをはなしたよ');
$('#room-listen').onclick = () => {
  player.stop();
  song = structuredClone(room.song);
  length = song.length;
  selected = 0;
  editingId = null;
  setKey = null;
  $('#title').value = room.title.slice(0, 20);
  renderAll();
  say(`「${room.title}」をひらいたよ。みんなのパートが入っているよ♪ 書き出しや動画にもできるよ。`);
  player.play();
};
$('#room-back').onclick = leaveRoom;
$('#room-delete').onclick = async () => {
  if (!confirm(`ルーム「${room.title}」をしまいますか？（もとにもどせません）`)) return;
  try { await api(`/rooms/${room.code}/delete`, { method: 'POST' }); leaveRoom(); } catch (e) { showError(e.message); }
};
$('#room-create').onclick = async () => {
  showError();
  try {
    room = await api('/rooms', { method: 'POST', body: { title: $('#room-title').value, mood: song.mood, length } });
    $('#room-title').value = '';
    await openRoom(room.code);
    $('#room-msg').textContent = 'ルームができたよ！ まずはコードを受けもっています。カフェで仲間をさがしてみてね';
  } catch (e) { showError(e.message); }
};
$('#room-join').onclick = () => {
  const code = $('#room-code').value.trim().toUpperCase();
  if (!/^\w{6}$/.test(code)) { showError('ルーム番号は6文字です'); return; }
  openRoom(code);
};

// ── 操作 ──
$('#auto').onclick = () => {
  const keep = player.playing;
  if (keep) player.stop();
  song = M.buildBgm(song.mood, length, { rng: Math.random, quiet: $('#quiet').checked, tempo: song.tempo });
  if (setKey) streamSet[setKey] = song; // 配信セットの曲を開いていたら、その曲を入れかえる
  selected = Math.max(0, song.sections.findIndex((s) => s.part === 'sabi' || s.part === 'loop'));
  editingId = null;
  const live = M.LIVE_LENGTHS.includes(length) ? 'ライブの型だよ。部分ごとに歌詞を書いて、声を録ってみてね。' : '';
  say(`${M.MOODS[song.mood].label}・${M.LENGTHS[length]}の曲を組み立てたよ！▶ で聞いてみてね。${live}気になる部分はパネルで変えられるよ♪`);
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
  renderMe();
}

(async () => {
  try { config = await api('/config'); } catch { /* ふだんの値のまま */ }
  $('#back-tomohane').href = tomohaneUrl('/');
  $('#signin-link').href = tomohaneUrl('/api/link/utatomo-start');
  const vt = new URL('/', config.vtomoUrl);
  if (['localhost', '127.0.0.1'].includes(vt.hostname) && !['localhost', '127.0.0.1'].includes(location.hostname)) vt.hostname = location.hostname;
  $('#to-vtomo').href = vt.href;
  renderFormats();
  const fromVtomo = takeLookFromUrl();
  const restored = unstash();
  renderAll();
  try { await loadState(); } catch (e) { showError(e.message); }
  setLook(fromVtomo ? fromVtomo.look : randomLook(), fromVtomo ? fromVtomo.from : 'random');
  if (fromVtomo?.from === 'vtomo' && !restored) say('Vとも からキャラが来てくれたよ！ 下の「動画にする」で、いっしょにステージに立てるよ♪');
  if (restored) say('おかえり♪ 作りかけの曲をもどしておいたよ。「保存」を押してね。');
})();
