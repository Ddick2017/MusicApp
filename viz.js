audio.crossOrigin = 'anonymous';
let ac, an, data;
window.latency = () => ac ? (ac.outputLatency || ac.baseLatency || 0) : 0;
audio.addEventListener('play', () => {
  if (!ac) {
    ac = new AudioContext(); const s = ac.createMediaElementSource(audio);
    an = ac.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = .8;
    s.connect(an); an.connect(ac.destination); data = new Uint8Array(an.frequencyBinCount);
  }
  ac.resume();
});

const vc = $('#viz'), vg = vc.getContext('2d'); let lvl = 0;
new ResizeObserver(() => { const r = vc.getBoundingClientRect(), k = devicePixelRatio || 1; vc.width = r.width * k; vc.height = r.height * k; }).observe(vc);
(function draw() {
  const W = vc.width, H = vc.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * .24, on = an && !audio.paused;
  vg.clearRect(0, 0, W, H);
  let bass = 0;
  if (on) { an.getByteFrequencyData(data); for (let i = 0; i < 6; i++) bass += data[i]; bass /= 6 * 255; }
  lvl += (bass - lvl) * .25;
  const r = R * (1 + lvl * .25);
  const glow = vg.createRadialGradient(cx, cy, r * .3, cx, cy, r * 2.2);
  glow.addColorStop(0, `rgba(255,255,255,${.12 + lvl * .35})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
  vg.fillStyle = glow; vg.fillRect(0, 0, W, H);
  const N = 96; vg.lineCap = 'round'; vg.lineWidth = Math.max(2, R * .04);
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 - Math.PI / 2, v = on ? data[Math.floor(Math.abs(i / N * 2 - 1) * 70) + 2] / 255 : 0;
    const r0 = r * 1.14, r1 = r0 + R * .06 + v * R * .6;
    vg.strokeStyle = `rgba(255,255,255,${.2 + v * .75})`;
    vg.beginPath(); vg.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    vg.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); vg.stroke();
  }
  const t = performance.now() / 3500, gx = Math.cos(t) * r, gy = Math.sin(t) * r, mid = 50 + lvl * 190 | 0;
  const body = vg.createLinearGradient(cx + gx, cy + gy, cx - gx, cy - gy);
  body.addColorStop(0, '#fff'); body.addColorStop(.5, `rgb(${mid},${mid},${mid})`); body.addColorStop(1, '#000');
  vg.beginPath(); vg.arc(cx, cy, r, 0, 7); vg.fillStyle = body; vg.fill();
  vg.lineWidth = Math.max(1.5, R * .02); vg.strokeStyle = `rgba(255,255,255,${.35 + lvl * .5})`; vg.stroke();
  vg.beginPath(); vg.arc(cx, cy, r * (.5 + lvl * .12), 0, 7); vg.strokeStyle = `rgba(0,0,0,${.4 + lvl * .4})`; vg.stroke();
  requestAnimationFrame(draw);
})();

const sc = $('#snow'), sg = sc.getContext('2d'); let flakes = [];
function resetSnow() {
  sc.width = innerWidth; sc.height = innerHeight;
  flakes = Array.from({ length: 90 }, () => ({ x: Math.random() * sc.width, y: Math.random() * sc.height, r: Math.random() * 1.8 + .6, v: Math.random() * .5 + .25, p: Math.random() * 6.28 }));
}
addEventListener('resize', resetSnow); resetSnow();
if (!matchMedia('(prefers-reduced-motion:reduce)').matches) (function snow() {
  sg.clearRect(0, 0, sc.width, sc.height); sg.fillStyle = '#fff'; const t = performance.now() / 1500;
  for (const f of flakes) {
    f.y += f.v; f.x += Math.sin(t + f.p) * .35;
    if (f.y > sc.height + 4) { f.y = -4; f.x = Math.random() * sc.width; }
    sg.globalAlpha = .25 + f.r / 3; sg.beginPath(); sg.arc(f.x, f.y, f.r, 0, 7); sg.fill();
  }
  requestAnimationFrame(snow);
})();
