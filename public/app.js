// うたとも の画面：雰囲気と長さ → おまかせで組み立て → パネルをタップ → 再生（Web Audio）→ 書き出し・保存
import * as M from './music.js';
import { precheck } from './precheck.js';

const $ = (s) => document.querySelector(s);
let config = { tomohaneUrl: 'http://localhost:3000', max: 10, titleMax: 20 };
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
}
function renderMe() {
  const me = state.me;
  $('#signin-link').hidden = Boolean(me);
  $('#logout').hidden = !me;
  $('#me-line').textContent = me ? `${me.name} さん（${me.ageGroup}）でログイン中` : 'ログインしなくても、作る・聞く・書き出すはできます。保存はログインしてから。';
  $('#my-songs-box').hidden = !me;
  renderVoice();
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
  const restored = unstash();
  renderAll();
  try { await loadState(); } catch (e) { showError(e.message); }
  if (restored) say('おかえり♪ 作りかけの曲をもどしておいたよ。「保存」を押してね。');
})();
