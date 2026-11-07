const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const { Readable } = require('stream');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { pathToFileURL } = require('url');
protocol.registerSchemesAsPrivileged([{ scheme: 'music', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
app.commandLine.appendSwitch('no-sandbox');
const EXT = /\.(mp3|flac|ogg|opus|m4a|wav|aac)$/i;
const cfgFile = () => path.join(app.getPath('userData'), 'cfg.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
let mm; const getMM = async () => mm || (mm = await import('music-metadata'));
const toUrl = p => 'music://local' + p.split('/').map(encodeURIComponent).join('/');

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}
async function scan(dir) {
  const m = await getMM(), out = [];
  for (const p of walk(dir).sort()) {
    const t = { path: p, url: toUrl(p), title: path.parse(p).name, artist: '', duration: 0 };
    try {
      const x = await m.parseFile(p, { skipCovers: true });
      t.title = x.common.title || t.title; t.artist = x.common.artist || ''; t.duration = x.format.duration || 0;
    } catch {}
    out.push(t);
  }
  return out;
}

const clean = s => (s || '').replace(/\.(mp3|flac|ogg|opus|m4a|wav|aac)$/i, '').replace(/\s*[(\[][^)\]]*[)\]]/g, '').replace(/@\w+|\bwww\.\S+|\b\d{2,3}\s?kbps\b/gi, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
const tagsOf = s => ((s || '').match(/[(\[][^)\]]*[)\]]/g) || []).join(' ');
const strip = s => clean(s).replace(/\s*\b(feat|ft)\.?\s.*$/i, '').replace(/\s*[-–]\s*(topic|official.*|lyrics?.*|audio|video|клип.*|текст.*)$/i, '').replace(/\s*[-–]\s*(?:\d{4}\s+)?(?:remaster\w*|single version|album version|radio edit|original mix|extended.*|mono|stereo).*$/i, '').replace(/^\d+[\s.)-]+/, '').trim();
const isUnknown = s => !s || /^\s*(<?unknown( artist)?>?|неизвест\S*( исполнитель| артист)?|various artists?|n\/a|-+)\s*$/i.test(s);
const firstArtist = s => isUnknown(s) ? '' : strip(s.split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bx\b|\sи\s)\s*/i)[0]);
const CY = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const norm = s => (s || '').toLowerCase().replace(/[а-яё]/g, c => CY[c]).replace(/[^\p{L}\p{N}]+/gu, '');
const sim = (a, b) => {
  a = norm(a); b = norm(b); if (!a || !b) return 0; if (a === b) return 1;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= .75) return .9;
  const g = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const x = g(a), y = g(b); let hit = 0;
  for (const [k, n] of x) hit += Math.min(n, y.get(k) || 0);
  return 2 * hit / Math.max(1, a.length + b.length - 2);
};
const artSim = (x, a) => !a ? .5 : (norm(a).length >= 3 && norm(x).includes(norm(a)) ? .9 : sim(x, a));
const hasSync = s => /\[\d+:\d+/.test(s);
const REMIX = /re-?work|remix|\bflip\b|bootleg|\bvip\b|\blive\b|acoustic|instrumental|\bcover\b|mashup/i;
const TEMPO = /slow|sped|speed|nightcore|reverb|\b8d\b|\bfast/i;
async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'MusicApp/1.0' }, signal: AbortSignal.timeout(8000) });
  return r.ok ? r.json() : null;
}
const lrclib = (ep, params) => { const u = new URL('https://lrclib.net/api/' + ep); u.search = new URLSearchParams(params); return getJson(u); };

async function findLyrics(t) {
  const loose = !!t.q, rawName = t.q || path.parse(t.path).name, rawTags = tagsOf(rawName) + ' ' + tagsOf(t.title);
  const rm = !loose && rawTags.match(REMIX), remix = rm ? norm(rm[0]) : '', tempo = !loose && !remix && TEMPO.test(rawTags);
  const file = clean(rawName).replace(/^(?:неизвест\S*|unknown(?: artist)?)\s*[-–—]\s*/i, '');
  let parts = file.split(/\s+[-–—]\s+/);
  if (parts.length === 1) { const h = file.split(/[-–—]/).map(x => x.trim()); if (h.length === 2 && h[0] && h[1]) parts = h; }
  const pairs = [];
  const add = (a, n) => { a = firstArtist(a); n = strip(n); if (n && !pairs.some(p => p.a === a && p.t === n)) pairs.push({ a, t: n }); };
  if (!loose) add(t.artist, t.title);
  if (parts.length > 1) { add(parts[0], parts.slice(1).join(' - ')); add(parts[parts.length - 1], parts.slice(0, -1).join(' - ')); }
  add('', file);

  const d = x => t.duration && x.duration ? Math.abs(x.duration - t.duration) : 0;
  const cands = [], seen = new Set(), raw = [];
  const judge = (x, p, viaGet, relaxed) => {
    if (!x || !(x.syncedLyrics || x.plainLyrics)) return;
    if (!relaxed) raw.push([x, p, viaGet]);
    const ts = viaGet ? 1 : sim(strip(x.trackName), p.t), as = viaGet ? 1 : artSim(x.artistName, p.a), dd = d(x);
    if (ts < (relaxed ? .82 : .85)) return;
    if (p.a && as < .6 && !(ts === 1 && dd <= 3) && !(relaxed && ts === 1 && dd <= 10)) return;
    const named = remix && norm(x.trackName).includes(remix);
    if (remix && !named && dd > 4) return;
    if (tempo && t.duration && x.duration) {
      const rt = t.duration / x.duration, slow = /slow|reverb/i.test(rawTags), fast = /sped|speed|nightcore|fast/i.test(rawTags);
      if ((slow && !fast && rt < 1.03) || (fast && !slow && rt > .97)) return;
    }
    const timeOk = loose || named || dd <= Math.max(8, .15 * (t.duration || 0)) || (tempo && !!t.duration);
    const key = x.id || x.trackName + x.artistName + x.duration;
    if (seen.has(key)) return; seen.add(key);
    cands.push({ x, usable: !!x.syncedLyrics && timeOk, score: ts + as * .5 - (tempo ? 0 : Math.min(dd, 60) / 100) });
  };
  const good = () => cands.some(c => c.usable && c.score >= 1.3);
  for (const p of pairs) {
    if (good()) break;
    const jobs = [
      lrclib('search', { q: `${p.a} ${p.t}`.trim() }).then(a => Array.isArray(a) && a.forEach(x => judge(x, p))),
      lrclib('search', { track_name: p.t, ...(p.a ? { artist_name: p.a } : {}) }).then(a => Array.isArray(a) && a.forEach(x => judge(x, p)))];
    if (p.a) for (const dur of [Math.round(t.duration || 0), 0]) {
      jobs.push(lrclib('get', { artist_name: p.a, track_name: p.t, ...(dur ? { duration: dur } : {}) }).then(x => judge(x, p, true)));
    }
    await Promise.all(jobs.map(j => j.catch(() => null)));
  }
  if (!cands.length) raw.forEach(([x, p, g]) => judge(x, p, g, true));
  const by = f => cands.filter(f).sort((a, b) => b.score - a.score)[0];
  const s = by(c => c.usable);
  if (s) return { text: s.x.syncedLyrics, dur: s.x.duration || 0 };
  const pl = by(c => c.x.plainLyrics);
  if (pl) return { text: pl.x.plainLyrics, dur: 0 };
  if (remix) return { text: '', dur: 0 };
  for (const p of pairs) {
    let a = p.a;
    if (!a) {
      const j = await getJson('https://api.lyrics.ovh/suggest/' + encodeURIComponent(p.t)).catch(() => null);
      a = (j?.data || []).find(x => sim(strip(x.title), p.t) >= .9)?.artist?.name;
    }
    if (!a) continue;
    const j = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(p.t)}`).catch(() => null);
    if (j?.lyrics) return { text: j.lyrics, dur: 0 };
  }
  return { text: '', dur: 0 };
}

const MIME = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac' };
function musicResponse(req) {
  const p = decodeURIComponent(new URL(req.url).pathname);
  let size;
  try { size = fs.statSync(p).size; } catch { return new Response('not found', { status: 404 }); }
  const h = { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (!size) return new Response(null, { status: 200, headers: h });
  let start = 0, end = size - 1, status = 200;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], size - 1); }
    else start = Math.max(0, size - +m[2]);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...h, 'Content-Range': `bytes */${size}` } });
    status = 206; h['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  h['Content-Length'] = String(end - start + 1);
  return new Response(Readable.toWeb(fs.createReadStream(p, { start, end })), { status, headers: h });
}

ipcMain.handle('init', async () => { const d = readCfg().dir; return d && fs.existsSync(d) ? scan(d) : []; });
ipcMain.handle('pick', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (r.canceled) return null;
  fs.writeFileSync(cfgFile(), JSON.stringify({ dir: r.filePaths[0] }));
  return scan(r.filePaths[0]);
});
ipcMain.handle('cover', async (_, p) => {
  try {
    const x = await (await getMM()).parseFile(p), pic = x.common.picture?.[0];
    return pic ? `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}` : '';
  } catch { return ''; }
});
ipcMain.handle('lyrics', async (_, t) => {
  const side = t.path.replace(/\.[^.]+$/, '.lrc');
  if (fs.existsSync(side)) return { text: fs.readFileSync(side, 'utf8'), dur: 0 };
  const dir = path.join(app.getPath('userData'), 'lyrics'); fs.mkdirSync(dir, { recursive: true });
  const cache = path.join(dir, crypto.createHash('sha1').update(t.path).digest('hex') + '.v3.json');
  let old = { text: '', dur: 0 };
  try { old = JSON.parse(fs.readFileSync(cache, 'utf8')); } catch {}
  if (!t.q && (old.manual || hasSync(old.text))) return old;
  try {
    const r = await findLyrics(t);
    if (r.text) { const out = { ...r, manual: !!t.q }; fs.writeFileSync(cache, JSON.stringify(out)); return out; }
    console.log('lyrics: не найдено для', t.path, t.q || '');
  } catch (e) { console.log('lyrics error:', e.message); }
  return old;
});

const cacheFile = p => {
  const dir = path.join(app.getPath('userData'), 'lyrics'); fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, crypto.createHash('sha1').update(p).digest('hex') + '.v3.json');
};
ipcMain.handle('lsave', (_, { path: p, res }) => { fs.writeFileSync(cacheFile(p), JSON.stringify({ ...res, manual: true })); });
ipcMain.handle('lreset', (_, p) => { try { fs.unlinkSync(cacheFile(p)); } catch {} });
ipcMain.handle('lsearch', async (_, { q, artist, duration }) => {
  const fa = firstArtist(artist), seen = new Set(), out = [];
  for (const query of [q, ...(fa ? [`${fa} ${q}`] : [])]) {
    const arr = await lrclib('search', { q: query }).catch(() => null);
    for (const x of Array.isArray(arr) ? arr : []) {
      if (seen.has(x.id) || !(x.syncedLyrics || x.plainLyrics)) continue;
      seen.add(x.id);
      out.push({ artist: x.artistName || '', title: x.trackName || '', duration: x.duration || 0, synced: !!x.syncedLyrics, text: x.syncedLyrics || x.plainLyrics });
    }
  }
  const score = it => (it.synced ? 2 : 0) + (fa && artSim(it.artist, fa) >= .6 ? 3 : 0) - (duration && it.duration ? Math.min(Math.abs(it.duration - duration), 120) / 60 : 0);
  return out.sort((a, b) => score(b) - score(a)).slice(0, 8);
});

app.whenReady().then(() => {
  protocol.handle('music', musicResponse);
  const w = new BrowserWindow({
    width: 1280, height: 760, minWidth: 900, minHeight: 600, backgroundColor: '#000',
    autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());
