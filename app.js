// UI, audio, pixel graphics. Logic and word data live in game.js.
(function () {
  const G = window.Game;
  const $ = s => document.querySelector(s);
  const KEY = 'tonequest.v1';

  // ---------- persistence ----------
  let S = { streak: {}, best: {}, xp: 0, voice: 'studio', sound: true };
  try { S = { ...S, ...JSON.parse(localStorage.getItem(KEY)) }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  if (S.voice === 'device' && !S._vs) { S.voice = 'studio'; save(); } // one-time: prefer clips unless user explicitly chose

  // ---------- pixel sprites ----------
  const PAL = { k: '#1a1020', w: '#fff4dc', r: '#d62e2e', R: '#8e1b1b', y: '#ffcc33', o: '#ff8a1e', p: '#ff9ecb', s: '#4a3a5c', b: '#5aa9ff' };
  const PANDA = [
    '.kkk........kkk.', 'kkkkk......kkkkk', 'kkkkwwwwwwwwkkkk', '.kwwwwwwwwwwwwk.',
    'kwwwwwwwwwwwwwwk', 'kwkkkwwwwwwkkkwk', 'kkkwkkwwwwkkwkkk', 'kkkkkkwwwwkkkkkk',
    'kwkkkwwkkwwkkkwk', 'kwwwwwwkkwwwwwwk', 'kwpwwwwwwwwwwpwk', 'kwwwwkwwwwkwwwwk',
    'kwwwwwkkkkwwwwwk', '.kwwwwwwwwwwwwk.', '..kkwwwwwwwwkk..', '....kkkkkkkk....'];
  const SPR = {
    panda: PANDA,
    pandaSad: PANDA.map((r, i) => (i === 11 ? PANDA[12] : i === 12 ? PANDA[11] : i === 9 ? 'kwwbwwwkkwwwwwwk' : r)),
    heart: ['.kk.kk.', 'kwrkrrk', 'krrrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
    flame: ['...o...', '..oo...', '..oyo..', '.oyyo..', '.oyyoo.', 'oyywyo.', 'oywwyyo', 'oyywyyo', '.ooooo.'],
    coin: ['..kkkk..', '.kyyyyk.', 'kyykkyyk', 'kyk..kyk', 'kyk..kyk', 'kyykkyyk', '.kyyyyk.', '..kkkk..'],
    star: ['....k....', '...kyk...', 'kkkyyykkk', 'kyyyyyyyk', '.kyyyyyk.', '..kyyyk..', '.kyykyyk.', '.kyk.kyk.', '.kk...kk.'],
    trophy: ['kkkkkkkkk', 'kyywyyyyk', '.kywyyyk.', '.kyyyyyk.', '..kyyyk..', '...kyk...', '...kyk...', '..kyyyk..', '.kkkkkkk.'],
    speaker: ['....kk.....', '...kwk..w..', 'kkkwwk...w.', 'kwwwwk.w.w.', 'kwwwwk.w..w', 'kwwwwk.w..w', 'kwwwwk.w.w.', 'kkkwwk...w.', '...kwk..w..', '....kk.....'],
    lantern: ['....kk....', '....yy....', '..kkkkkk..', '.kRrrrrRk.', 'kRrryyrrRk', 'kRrrrrrrRk', 'kRryyyyrRk', 'kRrrrrrrRk', 'kRrryyrrRk', '.kRrrrrRk.', '..kkkkkk..', '....yy....', '...y..y...', '....yy....'],
  };
  const swap = (rows, map) => rows.map(r => r.replace(/./g, c => map[c] || c));
  SPR.heartEmpty = swap(SPR.heart, { r: 's', w: 's' });
  SPR.starEmpty = swap(SPR.star, { y: 's' });

  const canvases = {}, urls = {};
  function sprCanvas(name) {
    if (canvases[name]) return canvases[name];
    const rows = SPR[name], c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, y, 1, 1); } }));
    return (canvases[name] = c);
  }
  const sprUrl = name => urls[name] || (urls[name] = sprCanvas(name).toDataURL());
  function setSpr(img, name, scale = +img.dataset.scale || 4) {
    const c = sprCanvas(name);
    img.src = sprUrl(name); img.width = c.width * scale; img.height = c.height * scale;
  }
  const sprImg = (name, scale) => { const c = sprCanvas(name); return `<img class="spr" src="${sprUrl(name)}" width="${c.width * scale}" height="${c.height * scale}" alt="">`; };
  document.querySelectorAll('img[data-spr]').forEach(i => setSpr(i, i.dataset.spr));

  // Chao tone letters: 5 = high, 1 = low.
  const CONTOUR = { 1: [5, 5], 2: [3, 5], 3: [2, 1, 4], 4: [5, 1] };
  const TONE_COLOR = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)' };
  function contourSvg(t, grid) {
    const p = CONTOUR[t], step = 16 / (p.length - 1);
    const pts = p.map((l, i) => `${2 + i * step},${2 + (5 - l) * 4}`).join(' ');
    const lines = grid ? [2, 6, 10, 14, 18].map(y => `<line x1="0" x2="20" y1="${y}" y2="${y}" stroke="#4a3a5c" stroke-width=".5"/>`).join('') : '';
    return `<svg viewBox="0 0 20 20" shape-rendering="crispEdges">${lines}<polyline points="${pts}" fill="none" stroke="${TONE_COLOR[t]}" stroke-width="3" stroke-linecap="square"/></svg>`;
  }

  // ---------- audio ----------
  let AC;
  const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
  if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: play even with the silent switch on
  document.addEventListener('pointerdown', () => { if (ac().state === 'suspended') ac().resume(); });

  function beep(f, t, d, type = 'square', v = 0.08, f2) {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  }
  // Pentatonic chiptune bits.
  const SFX = {
    tap: t => beep(660, t, 0.05),
    good: t => [523, 587, 659, 784, 1047].forEach((f, i) => beep(f, t + i * 0.055, 0.12)),
    bad: t => beep(220, t, 0.3, 'sawtooth', 0.08, 90),
    coin: t => { beep(988, t, 0.08); beep(1319, t + 0.08, 0.25); },
    win: t => [659, 784, 880, 1047, 880, 1175, 1319].forEach((f, i) => beep(f, t + i * 0.12, i === 6 ? 0.5 : 0.14, 'square', 0.07)),
    lose: t => [440, 392, 330, 294].forEach((f, i) => beep(f, t + i * 0.18, 0.2, 'triangle', 0.12)),
    gong: t => { beep(98, t, 2.2, 'sine', 0.35, 90); beep(147, t, 1.6, 'triangle', 0.12, 141); beep(311, t, 0.9, 'sine', 0.05, 300); },
  };
  const sfx = name => { if (S.sound) try { SFX[name](ac().currentTime + 0.01); } catch (e) {} };

  // Pixel hum: sawtooth voice with "ah" formant, pitch drawn along the tone contour. Works with zero network or TTS.
  const level = l => 165 * Math.pow(2, (l - 1) / 4);
  function hum(tones, slow) {
    const c = ac(), k = slow ? 1.7 : 1;
    let t = c.currentTime + 0.05;
    tones.forEach((tone, i) => {
      const last = i === tones.length - 1;
      const shape = tone === 3 && !last ? [2, 1, 1] : CONTOUR[tone]; // half-third mid-word
      const d = { 1: 0.42, 2: 0.42, 3: last ? 0.6 : 0.34, 4: 0.34 }[tone] * k;
      const o = c.createOscillator(), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueCurveAtTime(new Float32Array(shape.map(level)), t, d);
      lp.type = 'lowpass'; lp.frequency.value = 1600;
      bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 4;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.03);
      g.gain.setValueAtTime(0.3, t + d - 0.06); g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(lp).connect(g); o.connect(bp).connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d + 0.07 * k;
    });
    return (t - c.currentTime) * 1000;
  }

  // ---------- pregenerated audio (works on file:// via <script> tag, http via fetch fallback) ----------
  let manifest = window.AUDIO_MANIFEST ? { files: window.AUDIO_MANIFEST } : null, audioCache = {}, playing = null;
  if (!manifest) fetch('audio/manifest.json').then(r => (r.ok ? r.json() : null)).then(m => { manifest = m; renderVoice(); }).catch(() => {});
  const clipFile = key => manifest && manifest.files && manifest.files.find(f => f === key + '.mp3' || f === key + '.m4a');
  const hasClip = key => !!clipFile(key);
  function clip(key) {
    const name = clipFile(key);
    if (!audioCache[name]) { const a = new Audio('audio/' + name); a.preload = 'auto'; audioCache[name] = a; }
    return audioCache[name];
  }
  const stopAudio = () => { if (playing) { playing.pause(); playing = null; } };

  let zhVoice = null;
  function pickVoice() {
    const zh = speechSynthesis.getVoices().filter(v => /^(zh|cmn)/i.test(v.lang) && !/HK|yue|canton/i.test(v.lang + v.name));
    zhVoice = zh.find(v => /CN|Hans/i.test(v.lang) && v.localService) || zh.find(v => /CN|Hans/i.test(v.lang)) || zh[0] || null;
    if (S.voice === 'auto') { S.voice = 'studio'; save(); } // migrate legacy setting to studio
    renderVoice();
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

  // studio = pregenerated clips (human recordings + Piper) with device TTS as fallback; device = speechSynthesis; hum = pixel synth.
  const useTts = () => S.voice === 'device' && zhVoice;
  // key = tone-number pinyin of the answer (audio/<key>.mp3 or .m4a); text = hanzi for the TTS path.
  function speak(text, tones, slow, key) {
    const btn = $('#play');
    const busy = ms => { btn.classList.add('pulse'); clearTimeout(speak.t); speak.t = setTimeout(() => btn.classList.remove('pulse'), ms); };
    const fallback = () => busy(hum(tones, slow));
    stopAudio();
    if (S.voice !== 'device') speechSynthesis?.cancel();
    key = key || text.replace(/\s+/g, ''); // learn-screen demos pass a bare syllable
    const useClip = S.voice === 'studio' && hasClip(key);
    if (useClip) {
      const a = clip(key);
      a.currentTime = 0;
      a.playbackRate = slow ? 0.7 : 1; // human recordings stretch well; no separate slow files needed
      playing = a;
      a.onended = () => { if (playing === a) btn.classList.remove('pulse'); };
      a.onerror = () => { playing = null; fallback(); };
      a.play().then(() => busy(Math.max(a.duration / a.playbackRate, 0.5) * 1000)).catch(() => { playing = null; fallback(); });
      return;
    }
    if (S.voice === 'studio' && !hasClip(key)) { /* clip missing: try device TTS, fall to hum */
      if (!zhVoice) return fallback();
    } else if (S.voice !== 'device') return fallback(); // synth mode: straight to the hum
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = zhVoice; u.lang = zhVoice.lang; u.rate = slow ? 0.5 : 0.8;
    let started = false;
    u.onstart = () => { started = true; };
    u.onend = () => btn.classList.remove('pulse');
    u.onerror = () => { if (!started) fallback(); };
    busy(slow ? 2500 : 1500);
    speechSynthesis.speak(u);
    // Some Android voices need the network; if nothing starts, hum instead.
    setTimeout(() => { if (!started && !speechSynthesis.speaking) { speechSynthesis.cancel(); fallback(); } }, 1500);
  }

  // ---------- pixel background + fx ----------
  const PX = 3; // one art pixel = 3 CSS px
  const bg = $('#bg'), bx = bg.getContext('2d'), fx = $('#fx'), fxx = fx.getContext('2d');
  let W, H, scene, stars, clouds, petals, parts = [], flash = 0;
  const rand = (a, b) => a + Math.random() * (b - a);

  function buildScene() {
    W = Math.ceil(innerWidth / PX); H = Math.ceil(innerHeight / PX);
    for (const c of [bg, fx]) { c.width = W; c.height = H; }
    scene = document.createElement('canvas'); scene.width = W; scene.height = H;
    const x = scene.getContext('2d');
    const bands = ['#1a0f2e', '#20113a', '#291444', '#35184c', '#461c52', '#5c2153', '#772750', '#93304a'];
    bands.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, Math.floor(i * H * 0.72 / bands.length), W, H); });
    // moon
    const mx = Math.floor(W * 0.78), my = Math.floor(H * 0.13), mr = 13;
    for (let yy = -mr; yy <= mr; yy++) for (let xx = -mr; xx <= mr; xx++) if (xx * xx + yy * yy <= mr * mr) {
      x.fillStyle = (xx + 4) ** 2 + (yy - 3) ** 2 < 10 || (xx - 5) ** 2 + (yy + 5) ** 2 < 5 ? '#f2d48a' : '#ffe9b0';
      x.fillRect(mx + xx, my + yy, 1, 1);
    }
    const ridge = (col, base, a, b, ph) => {
      x.fillStyle = col;
      for (let i = 0; i < W; i++) { const y = Math.floor(base + Math.sin(i * a + ph) * 8 + Math.sin(i * b) * 4); x.fillRect(i, y, 1, H - y); }
    };
    ridge('#3a1740', H * 0.64, 0.05, 0.13, 0);
    ridge('#26102f', H * 0.74, 0.03, 0.11, 1);
    // pagoda
    const px = Math.floor(W * 0.2), base = Math.floor(H * 0.74 + Math.sin(px * 0.03 + 1) * 8 + Math.sin(px * 0.11) * 4) + 2;
    x.fillStyle = '#16081f';
    let y = base;
    for (let tier = 0; tier < 5; tier++) {
      const w = 18 - tier * 3;
      x.fillRect(px - w / 2, y - 6, w, 6);
      x.fillRect(px - w / 2 - 4, y - 8, w + 8, 2);
      x.fillRect(px - w / 2 - 5, y - 9, 1, 1); x.fillRect(px + w / 2 + 4, y - 9, 1, 1);
      x.fillStyle = '#ffcc33'; x.fillRect(px - 1, y - 4, 2, 2); x.fillStyle = '#16081f';
      y -= 8;
    }
    x.fillRect(px, y - 5, 1, 5);
    x.fillStyle = '#150a1f'; x.fillRect(0, Math.floor(H * 0.86), W, H);
    stars = Array.from({ length: 45 }, () => [rand(0, W) | 0, rand(0, H * 0.5) | 0, rand(0, 6)]);
    clouds = Array.from({ length: 4 }, (_, i) => ({ x: rand(0, W), y: 10 + i * H * 0.12, s: rand(0.03, 0.08), w: rand(14, 26) | 0 }));
    petals = Array.from({ length: 16 }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(0.15, 0.35), ph: rand(0, 6) }));
  }

  function firework(cx, cy, n = 40) {
    const cols = ['#ffcc33', '#ff8a1e', '#d62e2e', '#fff4dc', '#ff9ecb', '#3fbf7f'];
    const c1 = cols[(Math.random() * cols.length) | 0];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(0.4, 1.8);
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(30, 60) | 0, c: Math.random() < 0.7 ? c1 : '#fff4dc' });
    }
  }
  const fireworkAt = el => { const r = el.getBoundingClientRect(); firework((r.left + r.width / 2) / PX, (r.top + r.height / 2) / PX); };
  function celebrate(times) {
    for (let i = 0; i < times; i++) setTimeout(() => firework(rand(W * 0.15, W * 0.85), rand(H * 0.1, H * 0.45), 50), i * 280);
  }

  let tick = 0;
  function frame() {
    tick++;
    bx.drawImage(scene, 0, 0);
    for (const [x, y, p] of stars) { bx.fillStyle = Math.sin(tick * 0.05 + p) > 0.6 ? '#fff4dc' : '#6b5a80'; bx.fillRect(x, y, 1, 1); }
    bx.fillStyle = 'rgba(90,50,110,.55)';
    for (const c of clouds) {
      c.x += c.s; if (c.x > W + 30) c.x = -30;
      const x = c.x | 0, y = c.y | 0;
      bx.fillRect(x, y, c.w, 3); bx.fillRect(x + 3, y - 2, c.w - 8, 2); bx.fillRect(x + 6, y - 4, c.w - 14, 2);
    }
    bx.fillStyle = '#ff9ecb';
    for (const p of petals) {
      p.y += p.v; p.x += Math.sin(tick * 0.03 + p.ph) * 0.2 + 0.1;
      if (p.y > H) { p.y = -2; p.x = rand(0, W); }
      bx.fillRect(p.x | 0, p.y | 0, (tick >> 4) % 2 + 1, 1);
    }
    const lan = sprCanvas('lantern');
    [[0.06, 0], [W - 16, 2]].forEach(([lx, ph], i) => {
      const x = (i ? lx : W * lx) + Math.round(Math.sin(tick * 0.03 + ph) * 1.5), len = 10 + i * 6;
      bx.fillStyle = '#c98a12'; bx.fillRect(x + 4, 0, 1, len);
      bx.fillStyle = 'rgba(255,120,60,.12)'; bx.fillRect(x - 4, len - 2, 18, 18);
      bx.drawImage(lan, x | 0, len);
    });
    fxx.clearRect(0, 0, W, H);
    if (flash > 0) { fxx.fillStyle = `rgba(214,46,46,${flash * 0.3})`; fxx.fillRect(0, 0, W, H); flash -= 0.05; }
    parts = parts.filter(p => p.life-- > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.vx *= 0.98;
      if (p.life > 8 || tick % 2) { fxx.fillStyle = p.c; fxx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', buildScene);
  buildScene();
  requestAnimationFrame(frame);

  // ---------- screens ----------
  const show = id => { for (const s of ['menu', 'game', 'end', 'learn', 'credits']) $('#' + s).classList.toggle('hidden', s !== id); };

  function renderVoice() {
    const lbl = $('#voicelbl'); if (!lbl) return;
    lbl.textContent = S.voice === 'synth' ? 'Pixel hum' : S.voice === 'device' ? (zhVoice ? 'Device voice' : 'Hum (no zh)') : manifest ? 'Studio' : 'Studio (missing)';
  }
  function renderSound() { $('#soundlbl').textContent = S.sound ? 'On' : 'Off'; }

  function renderMenu() {
    const today = G.dayKey(), st = S.streak, live = G.liveStreak(st, today);
    $('#streak').textContent = live;
    $('#beststreak').textContent = st.best || 0;
    $('#xp').textContent = S.xp;
    const note = $('#streaknote');
    note.classList.toggle('done', st.day === today);
    note.textContent = st.day === today ? '✓ 今天完成 Streak secured today!' : live ? 'Play a round today to keep your streak!' : 'Finish a round to start a streak!';
    let html = '', delay = 0;
    for (const tier of [1, 2, 3]) {
      html += `<div class="tier"><h2><span class="zh">${G.TIERS[tier][0]}</span>${G.TIERS[tier][1]}</h2>`;
      for (const m of G.MODES.filter(m => m.tier === tier)) {
        const b = S.best[m.id];
        const starRow = [0, 1, 2].map(i => sprImg(b && b.stars > i ? 'star' : 'starEmpty', 2)).join('');
        html += `<button class="mode" data-mode="${m.id}" style="animation-delay:${(delay++) * 70}ms">
          <span class="glyph">${m.zh}</span>
          <span class="info"><b>${m.name}</b><small>${m.desc}</small></span>
          <span class="best">${starRow}<b>${b ? b.score : '—'}</b>best</span></button>`;
      }
      html += '</div>';
    }
    $('#modes').innerHTML = html;
    renderVoice(); renderSound();
  }

  $('#modes').addEventListener('click', e => { const b = e.target.closest('.mode'); if (b) start(b.dataset.mode); });
  $('#voicebtn').onclick = () => {
    S.voice = { studio: 'device', device: 'synth', synth: 'studio' }[S.voice] || 'studio'; S._vs = true; save(); renderVoice();
    speak('妈', [1]);
  };
  $('#soundbtn').onclick = () => { S.sound = !S.sound; save(); renderSound(); sfx('tap'); };
  $('#learnbtn').onclick = () => { sfx('tap'); renderLearn(); show('learn'); };
  $('#creditsbtn').onclick = () => { sfx('tap'); show('credits'); };
  $('#creditsback').onclick = () => { show('menu'); renderMenu(); };

  // ---------- game ----------
  let R = null;
  const q = () => R.qs[R.i];

  function start(modeId) {
    const mode = G.MODES.find(m => m.id === modeId);
    R = { mode, qs: G.makeRound(modeId), i: 0, hearts: G.HEARTS, score: 0, combo: 0, maxCombo: 0, correct: 0, marks: [] };
    sfx('gong');
    show('game');
    renderQ(900);
  }

  function renderQ(delay = 350) {
    const cur = q(), mode = R.mode;
    R.locked = false;
    $('#progress').innerHTML = R.qs.map((_, i) => `<i class="${i === R.i ? 'cur' : R.marks[i] === true ? 'ok' : R.marks[i] === false ? 'bad' : ''}"></i>`).join('');
    $('#hearts').innerHTML = Array.from({ length: G.HEARTS }, (_, i) => sprImg(i < R.hearts ? 'heart' : 'heartEmpty', 3)).join('');
    $('#asktext').textContent = mode.n === 1 ? 'Which tone do you hear?' : `Which ${mode.n} tones do you hear?`;
    $('#combo').textContent = R.combo >= 2 ? `连击 COMBO ×${R.combo}` : '';
    $('#slots').innerHTML = cur.syls.map(() => '?').join(' ');
    $('#tip').textContent = '';
    setSpr($('#gmascot'), 'panda');
    $('#options').innerHTML = cur.options.map((o, i) => {
      const hint = mode.hints ? `<span class="hint">${contourSvg(o[0])}<span>Tone ${o[0]}</span></span>` : '';
      return `<button class="opt${mode.n > 2 ? ' long' : ''}" data-i="${i}">${G.pinyin(cur.syls, o)}${hint}</button>`;
    }).join('');
    setTimeout(() => R && q() === cur && !R.locked && say(), delay);
  }

  const say = slow => speak(q().chars, q().tones, slow, G.keyOf(q().syls, q().tones));

  function pick(i) {
    const cur = q(), btns = [...$('#options').children];
    if (R.locked) { // after answering: tap to compare single-syllable tones
      if (cur.alts) speak(cur.alts[i], cur.options[i], false, G.keyOf(cur.syls, cur.options[i]));
      return;
    }
    R.locked = true;
    $('#game').classList.add('answered');
    const ok = G.same(cur.options[i], cur.tones);
    btns.forEach((b, j) => b.classList.add(G.same(cur.options[j], cur.tones) ? 'right' : j === i ? 'wrong' : 'dim'));
    R.marks[R.i] = ok;
    const mascot = $('#gmascot');
    mascot.classList.remove('hop', 'sad'); void mascot.offsetWidth;
    if (ok) {
      const pts = G.points(R.combo);
      R.combo++; R.maxCombo = Math.max(R.maxCombo, R.combo); R.correct++; R.score += pts;
      sfx('good'); fireworkAt(btns[i]); floater(btns[i], `+${pts}`);
      mascot.classList.add('hop');
      if (R.combo >= 3) setTimeout(() => celebrate(1), 150);
    } else {
      R.combo = 0; R.hearts--;
      sfx('bad'); flash = 1;
      $('#game').classList.remove('shake'); void $('#game').offsetWidth; $('#game').classList.add('shake');
      setSpr(mascot, 'pandaSad'); mascot.classList.add('sad');
      setTimeout(() => say(), 700);
    }
    $('#hearts').innerHTML = Array.from({ length: G.HEARTS }, (_, k) => sprImg(k < R.hearts ? 'heart' : 'heartEmpty', 3)).join('');
    $('#combo').textContent = R.combo >= 2 ? `连击 COMBO ×${R.combo}` : '';
    $('#slots').innerHTML = `<span class="zh">${cur.chars}</span>`;
    if (cur.alts) $('#tip').textContent = 'Tap the options to compare tones';
    const sheet = $('#sheet');
    sheet.className = `sheet show ${ok ? 'good' : 'bad'}`;
    const praise = ['对! Correct!', '很好! Great!', '太棒了! Awesome!', '好耶! Nice!'];
    $('#verdict').textContent = ok ? praise[(Math.random() * praise.length) | 0] : '错 Not quite — answer:';
    $('#fzh').textContent = cur.chars;
    $('#fpy').textContent = G.pinyin(cur.syls, cur.tones);
    $('#fgl').textContent = cur.gloss;
    $('#next').className = ok ? 'btn jade' : 'btn';
    $('#next').focus({ preventScroll: true });
  }

  function floater(el, text) {
    const r = el.getBoundingClientRect(), d = document.createElement('div');
    d.className = 'floater'; d.textContent = text;
    d.style.left = r.left + r.width / 2 - 24 + 'px'; d.style.top = r.top + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 950);
  }

  function next() {
    if (!R || !R.locked) return;
    $('#sheet').classList.remove('show');
    $('#game').classList.remove('answered');
    sfx('tap');
    if (R.hearts <= 0 || R.i + 1 >= R.qs.length) return end();
    R.i++;
    renderQ();
  }

  $('#options').addEventListener('click', e => { const b = e.target.closest('.opt'); if (b) pick(+b.dataset.i); });
  $('#play').onclick = () => say();
  $('#slow').onclick = () => say(true);
  $('#next').onclick = next;
  $('#quit').onclick = () => { R = null; $('#sheet').classList.remove('show'); $('#game').classList.remove('answered'); stopAudio(); window.speechSynthesis?.cancel(); show('menu'); renderMenu(); };

  function end() {
    const today = G.dayKey(), mode = R.mode.id, stars = G.stars(R.correct);
    const already = S.streak.day === today;
    S.streak = G.bumpStreak(S.streak, today);
    S.xp += R.score;
    const prev = S.best[mode] || { score: 0, stars: 0 };
    const isBest = R.score > prev.score;
    S.best[mode] = { score: Math.max(prev.score, R.score), stars: Math.max(prev.stars, stars) };
    save();

    const out = R.hearts <= 0;
    $('#endtitle').innerHTML = out ? '<span class="zh">加油</span>Keep going!' : stars === 3 ? '<span class="zh">完美</span>Perfect!' : '<span class="zh">完成</span>Complete!';
    $('#stars').innerHTML = [0, 1, 2].map(i => sprImg(i < stars ? 'star' : 'starEmpty', 6)).join('');
    $('#endacc').textContent = Math.round((R.correct / R.qs.length) * 100) + '%';
    $('#endcombo').textContent = '×' + R.maxCombo;
    $('#newbest').innerHTML = isBest ? '<span class="badge">NEW BEST 新纪录</span>' : `Best: ${S.best[mode].score}`;
    $('#streakup').innerHTML = already
      ? `${sprImg('flame', 3)} ${S.streak.streak}-day streak · already secured today`
      : `${sprImg('flame', 4)} <b>Day ${S.streak.streak}</b> streak! ${S.streak.streak > 1 ? '连续学习' : 'See you tomorrow!'}`;
    show('end');
    sfx(out ? 'lose' : 'win');
    [...$('#stars').children].forEach((img, i) => setTimeout(() => { img.classList.add('in'); if (i < stars) sfx('coin'); }, 400 + i * 350));
    const target = R.score, el = $('#endscore'), t0 = performance.now();
    (function count(t) { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(target * k); if (k < 1) requestAnimationFrame(count); })(t0);
    if (!out && stars >= 2) setTimeout(() => celebrate(stars * 2), 500);
  }
  $('#again').onclick = () => start(R.mode.id);
  $('#tomenu').onclick = () => { show('menu'); renderMenu(); };

  // ---------- learn ----------
  const TONE_INFO = [
    ['阴平', '1st · High & flat', 'Hold one high note, like singing.'],
    ['阳平', '2nd · Rising', 'Goes up, like asking "huh?"'],
    ['上声', '3rd · Dip & rise', 'Drop low, then come back up.'],
    ['去声', '4th · Falling', 'Sharp drop, like a firm "No!"'],
  ];
  const MA = G.singles.find(s => s.syl === 'ma');
  function renderLearn() {
    $('#tones').innerHTML = TONE_INFO.map(([zh, name, desc], i) => `<button class="tone" data-t="${i + 1}">${contourSvg(i + 1, true)}
      <span><b><span class="py">${G.mark('ma', i + 1)}</span> · ${name}</b><small>${zh} — ${desc}</small><small>${MA.gloss[i]}</small></span><span class="zh">${MA.chars[i]}</span></button>`).join('');
  }
  $('#tones').addEventListener('click', e => { const b = e.target.closest('.tone'); if (b) { const t = +b.dataset.t; speak(MA.chars[t - 1], [t], false, 'ma' + t); } });
  $('#learnback').onclick = () => { show('menu'); renderMenu(); };
  $('#learnplay').onclick = () => start('easy');

  // ---------- keyboard (desktop) ----------
  addEventListener('keydown', e => {
    if ($('#game').classList.contains('hidden') || !R) return;
    if (e.key >= '1' && e.key <= '4') pick(+e.key - 1);
    else if (e.key === ' ') { e.preventDefault(); say(); }
    else if (e.key === 'Enter' && R.locked) { e.preventDefault(); next(); }
  });

  renderMenu();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
})();
