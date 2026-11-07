const $ = s => document.querySelector(s);
const audio = new Audio();
let played = new Set(), prevStack = [], seeking = false;
let off = 0; const lead = () => .45 + off + (window.latency ? window.latency() : 0);
let tracks = [], cur = -1, lines = [], active = -1, shuffle = false;
const fmt = s => { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };

function renderList() {
  const ul = $('#tracks'); ul.innerHTML = '';
  tracks.forEach((t, i) => {
    const li = document.createElement('li'); li.tabIndex = 0;
    li.innerHTML = `<span></span><small>${t.duration ? fmt(t.duration) : ''}</small>`;
    li.firstChild.textContent = t.artist ? `${t.artist} — ${t.title}` : t.title;
    li.onclick = () => play(i);
    li.onkeydown = e => e.key === 'Enter' && play(i);
    ul.append(li);
  });
  if (!tracks.length) ul.innerHTML = '<li style="color:#888">Папка пуста или не выбрана</li>';
}

function parseLrc(text) {
  const out = [];
  for (const row of text.split('\n')) {
    const stamps = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const txt = row.replace(/\[[^\]]*\]/g, '').trim();
    stamps.forEach(m => txt && out.push({ t: +m[1] * 60 + +m[2], txt }));
  }
  return out.sort((a, b) => a.t - b.t);
}

function showLyrics(res) {
  const text = res.text || '';
  const box = $('#lyrics'); box.innerHTML = ''; lines = parseLrc(text); active = -1;
  const dur = audio.duration || tracks[cur]?.duration, ratio = res.dur && dur ? dur / res.dur : 1;
  if (lines.length && ratio > .5 && ratio < 2 && Math.abs(ratio - 1) > .02) {
    lines.forEach(l => l.t *= ratio); toast(`Текст подогнан под темп трека (×${ratio.toFixed(2)})`);
  }
  const plain = !lines.length && text.trim();
  $('.right').classList.toggle('plain', !!plain); $('.right').scrollTop = 0; $('#finder').hidden = true; $('#picks').innerHTML = '';
  if (plain) { text.split('\n').forEach(l => { const p = document.createElement('p'); p.textContent = l.trim() || '\u00a0'; box.append(p); }); return; }
  if (!lines.length) {
    box.innerHTML = '<p class="empty">Текст не найден. Введите название ниже, нажмите «Найти текст» и выберите нужную версию из списка</p>';
    box.style.transform = ''; $('#finder').hidden = false; $('#q').focus(); return;
  }
  lines.forEach(l => {
    const p = document.createElement('p'); p.textContent = l.txt;
    box.append(p);
  });
  syncLyrics(true);
}

function syncLyrics(force) {
  if (!lines.length) return;
  let i = lines.findIndex(l => l.t > audio.currentTime + lead()) - 1;
  if (i === -2) i = lines.length - 1;
  if (i === active && !force) return;
  active = i;
  const ps = $('#lyrics').children;
  [...ps].forEach((p, k) => {
    p.style.setProperty('--d', Math.min(Math.abs(k - i), 4));
    p.classList.toggle('active', k === i);
  });
  const el = ps[Math.max(i, 0)];
  $('#lyrics').style.transform = `translateY(${-(el.offsetTop + el.offsetHeight / 2)}px)`;
}

async function play(i, back) {
  if (i < 0 || i >= tracks.length) return;
  if (!back && cur >= 0 && cur !== i) { prevStack.push(cur); if (prevStack.length > 500) prevStack.shift(); }
  played.add(i);
  cur = i; const t = tracks[i]; off = +localStorage.getItem('off:' + t.path) || 0;
  audio.src = t.url; audio.play();
  $('#title').textContent = t.title; $('#artist').textContent = t.artist;
  document.title = `${t.title} — Плеер`; $('#q').value = '';
  [...$('#tracks').children].forEach((li, k) => li.classList.toggle('on', k === i));
  $('#lyrics').innerHTML = '<p class="empty">Ищу текст…</p>'; lines = [];
  const [cover, lrc] = await Promise.all([api.cover(t.path), api.lyrics(t)]);
  if (cur !== i) return;
  $('#bg').style.backgroundImage = cover ? `url(${cover})` : '';
  showLyrics(lrc);
}

function pickShuffle() {
  let pool = tracks.map((_, i) => i).filter(i => !played.has(i));
  if (!pool.length) { played = new Set(); pool = tracks.map((_, i) => i).filter(i => i !== cur); }
  return pool.length ? pool[Math.random() * pool.length | 0] : cur;
}
const next = () => { if (tracks.length) play(shuffle ? pickShuffle() : (cur + 1) % tracks.length); };
const prev = () => {
  if (!tracks.length) return;
  if (audio.currentTime > 3 || (shuffle && !prevStack.length)) { audio.currentTime = 0; return; }
  shuffle ? play(prevStack.pop(), true) : play((cur - 1 + tracks.length) % tracks.length);
};
const toggle = () => cur < 0 ? play(0) : audio.paused ? audio.play() : audio.pause();

audio.onended = next;
const ICON = { play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>', pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>' };
audio.onplay = audio.onpause = () => $('#play').innerHTML = audio.paused ? ICON.play : ICON.pause;
(function loop() {
  const d = audio.duration || 0, c = audio.currentTime;
  if (d && !seeking) {
    const p = c / d * 1000; $('#seek').value = p; $('#seek').style.setProperty('--p', p / 10 + '%');
    $('#cur').textContent = fmt(c); $('#left').textContent = '-' + fmt(d - c);
  }
  syncLyrics(); requestAnimationFrame(loop);
})();

$('#seek').addEventListener('pointerdown', () => seeking = true);
$('#seek').oninput = e => {
  const d = audio.duration; if (!d) return; const c = e.target.value / 1000 * d;
  e.target.style.setProperty('--p', e.target.value / 10 + '%'); $('#cur').textContent = fmt(c); $('#left').textContent = '-' + fmt(d - c);
};
$('#seek').onchange = e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; seeking = false; };
$('#play').onclick = toggle; $('#next').onclick = next; $('#prev').onclick = prev;
$('#shuf').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('on', shuffle); played = new Set(cur >= 0 ? [cur] : []); prevStack = []; };
$('#open').onclick = async () => { const r = await api.pick(); if (r) { tracks = r; cur = -1; played = new Set(); prevStack = []; renderList(); } };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.key !== ' ')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.code === 'KeyF' && e.ctrlKey) { e.preventDefault(); toggleFinder(); }
  else if (e.key === 'ArrowRight' && e.ctrlKey) next();
  else if (e.key === 'ArrowLeft' && e.ctrlKey) prev();
  else if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && cur >= 0) {
    off = Math.round((off + (e.code === 'BracketRight' ? .25 : -.25)) * 100) / 100;
    localStorage.setItem('off:' + tracks[cur].path, off); syncLyrics(true);
    const s = $('#sync'); clearTimeout(s.h); s.style.opacity = 1; s.h = setTimeout(() => s.style.opacity = 0, 1800);
    s.textContent = off ? `Текст ${off > 0 ? 'раньше' : 'позже'} на ${Math.abs(off).toFixed(2)} с` : 'Сдвиг текста сброшен';
  }
});
api.init().then(r => { tracks = r; renderList(); });

$('#q').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') $('#finder').hidden = true; });
$('#finder').onsubmit = async e => {
  e.preventDefault();
  const q = $('#q').value.trim(), idx = cur, picks = $('#picks'); if (!q || idx < 0) return;
  const msg = txt => { picks.innerHTML = ''; const d = document.createElement('div'); d.className = 'pickmsg'; d.textContent = txt; picks.append(d); };
  msg('Ищу…');
  const list = await api.lsearch({ q, artist: tracks[idx].artist, duration: tracks[idx].duration });
  if (cur !== idx) return;
  if (!list.length) return msg('Ничего не найдено. Попробуйте другое название.');
  picks.innerHTML = '';
  list.forEach(it => {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = `${it.artist} — ${it.title}`;
    b.lastChild.textContent = `${it.duration ? fmt(it.duration) + ' · ' : ''}${it.synced ? 'с таймкодами' : 'без таймкодов'}`;
    b.onclick = async () => {
      const res = { text: it.text, dur: it.duration };
      await api.lsave({ path: tracks[idx].path, res });
      if (cur === idx) showLyrics(res);
    };
    picks.append(b);
  });
};

function toast(msg) {
  const s = $('#sync'); clearTimeout(s.h); s.textContent = msg; s.style.opacity = 1;
  s.h = setTimeout(() => s.style.opacity = 0, 2800);
}

function toggleFinder() {
  const f = $('#finder'); f.hidden = !f.hidden; if (f.hidden) return;
  const t = tracks[cur];
  if (t && !$('#q').value) $('#q').value = (!t.artist || /неизвест|unknown|various/i.test(t.artist) ? '' : t.artist + ' ') + t.title;
  $('#q').focus(); $('#q').select();
}
$('#chg').onclick = toggleFinder;
$('#auto').onclick = async () => {
  const idx = cur; if (idx < 0) return;
  await api.lreset(tracks[idx].path); $('#picks').innerHTML = '';
  $('#lyrics').innerHTML = '<p class="empty">Ищу текст…</p>'; $('.right').classList.remove('plain'); lines = [];
  const r = await api.lyrics(tracks[idx]); if (cur === idx) showLyrics(r);
};
