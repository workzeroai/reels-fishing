// ---------- 소리 (파일 없이 Web Audio로 합성) ----------
// 효과음 + 장면별 배경음악(메뉴·걷기·기다리기·톡톡·감기·결과) + 줄 긴장 소리 + 발소리 + 파도·갈매기
// 효과음과 음악은 따로 묶어(sfxBus·musicBus) 음악을 낮게 깐다. 끄면 전체(out)를 0으로
export const SFX = (() => {
  let ac = null, out = null, sfxBus = null, musicBus = null, on = true, noiseBuf = null;
  // 아이폰은 무음 스위치가 켜져 있으면 Web Audio를 막는다 → 재생 세션으로 지정 (Safari 17+)
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  function init() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        out = ac.createGain(); out.gain.value = on ? 0.85 : 0; out.connect(ac.destination);
        sfxBus = ac.createGain(); sfxBus.gain.value = 1; sfxBus.connect(out);
        musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(out);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch { ac = null; return; }
    }
    // 멈춰 있으면(처음·앱 전환 뒤) 사용자 입력 안에서 다시 깨우고, 무음 한 조각을 재생해 아이폰 오디오를 연다
    if (ac.state !== "running") {
      ac.resume().catch(() => {});
      try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch {}
    }
  }
  const ok = () => ac && on;
  function env(g, t, a, dur, vol) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  // 음 하나: f0 → f1로 미끄러지며 사라짐
  function tone(f0, f1, dur, type = "sine", vol = 0.3, delay = 0, bus = sfxBus, at = null) {
    if (!ok()) return;
    const t = at ?? ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.006, dur, vol); o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  // 잡음 한 조각: 물 튀김·바람·찰칵 (필터 종류와 주파수로 성격을 바꾼다)
  function noise(dur, vol, freq, delay = 0, { type = "bandpass", q = 0.8, to = 0.4, bus = sfxBus, at = null } = {}) {
    if (!ok()) return;
    const t = at ?? ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = dur > 0.45; f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * to), t + dur); f.Q.value = q;
    env(g, t, 0.006, dur, vol); s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // ---- 바다 환경음: 밀려왔다 빠지는 파도 + 가끔 갈매기 ----
  let amb = null;
  function startAmbience() {
    if (!ac || amb) return;
    amb = {};
    const water = ac.createBufferSource(); water.buffer = noiseBuf; water.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    const wg = ac.createGain(); wg.gain.value = 0.05;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.035;
    lfo.connect(lg).connect(wg.gain); // 밀려왔다 빠지는 파도
    water.connect(lp).connect(wg).connect(out); water.start(); lfo.start();
    amb.water = wg;
    startMusic();
  }

  // ---- 장면별 배경음악 ----
  // 음악은 0.4초 앞을 내다보며 박자를 예약한다. 장면을 바꾸면 다음 박자부터 새 패턴
  const SCENES = {
    menu: { dt: 0.36, vol: 0.5 },    // 고르기·결과 뒤: 잔잔한 오음계 아르페지오
    walk: { dt: 0.28, vol: 0.55 },   // 섬 걷기: 통통 튀는 줄 튕김 + 셰이커 + 베이스
    wait: { dt: 0.36, vol: 0.35 },   // 찌 기다리기: 음악은 거의 빼고 길게 깔리는 화음만
    tease: { dt: 0.36, vol: 0.35 },  // 톡톡: 기다리기 + 낮은 긴장음
    fight: { dt: 0.15, vol: 0.6 },   // 챔질~감기: 빠른 박자(킥·하이햇·베이스)
    result: { dt: 0.36, vol: 0.45 }  // 결과: 마무리 음악 한 번 뒤 잔잔하게
  };
  let scene = "menu", step = 0, next = 0, drone = null, tens = null, delayNode = null;
  const C4 = 262;
  const st = (root, semi) => root * 2 ** (semi / 12);
  function startMusic() {
    delayNode = ac.createDelay(1); const fb = ac.createGain(), mg = ac.createGain();
    delayNode.delayTime.value = 0.33; fb.gain.value = 0.28; mg.gain.value = 0.55;
    delayNode.connect(fb).connect(delayNode); delayNode.connect(mg).connect(musicBus);
    // 낮은 긴장음(톡톡·감기 때): 두 사인파를 계속 켜 두고 크기만 바꾼다
    drone = ac.createGain(); drone.gain.value = 0.0001; drone.connect(musicBus);
    for (const f of [55, 82.4]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(drone); o.start(); }
    // 줄 긴장 소리: 톱니파를 좁은 대역으로 걸러 삐걱이게, 긴장이 오를수록 크고 높게
    tens = { g: ac.createGain(), o: ac.createOscillator(), f: ac.createBiquadFilter(), w: ac.createOscillator(), wg: ac.createGain() };
    tens.o.type = "sawtooth"; tens.o.frequency.value = 90; tens.f.type = "bandpass"; tens.f.Q.value = 7; tens.f.frequency.value = 600;
    tens.w.frequency.value = 7; tens.wg.gain.value = 6; tens.w.connect(tens.wg).connect(tens.o.frequency); // 떨림
    tens.g.gain.value = 0.0001; tens.o.connect(tens.f).connect(tens.g).connect(sfxBus); tens.o.start(); tens.w.start();
    next = ac.currentTime + 0.2;
    setInterval(() => {
      if (!on || ac.state !== "running") { next = ac.currentTime + 0.1; return; }
      while (next < ac.currentTime + 0.4) { playStep(next); next += SCENES[scene].dt; step++; }
    }, 100);
  }
  const pluck = (f, t, v, dur = 0.9, echo = true) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "triangle"; o.frequency.value = f; env(g, t, 0.008, dur, v); o.connect(g); g.connect(musicBus); if (echo) g.connect(delayNode); o.start(t); o.stop(t + dur + 0.05); };
  function playStep(t) {
    const s = scene;
    if (s === "menu" || s === "result") {
      const SCALE = [0, 2, 4, 7, 9, 12, 14, 16], CHORDS = [0, -3, 5, 2];
      const bar = Math.floor(step / 8) % 4, root = st(C4, CHORDS[bar]);
      pluck(st(root, SCALE[[0, 2, 4, 5, 4, 2, 3, 1][step % 8]]), t, 0.045);
      if (step % 8 === 0) pluck(root / 2, t, 0.05);
    } else if (s === "walk") {
      // C - Am - F - G, 한 마디 8박. 줄 튕김은 화음을 살짝 흩어 긁듯이
      const ROOTS = [0, -3, 5, 7], bar = Math.floor(step / 8) % 4, b = step % 8, root = st(C4, ROOTS[bar]);
      const triad = ROOTS[bar] === -3 ? [0, 3, 7] : [0, 4, 7];
      if (b === 0 || b === 3 || b === 4 || b === 6) triad.forEach((iv, k) => pluck(st(root, iv + 12), t + k * 0.014, b === 0 ? 0.03 : 0.022, 0.32, false));
      if (b === 0 || b === 4) pluck(root / 2, t, 0.06, 0.4, false);
      if (b === 7 && bar === 3) pluck(st(root, 14), t, 0.025, 0.3);
      noise(0.04, b % 2 ? 0.022 : 0.012, 7000, 0, { type: "highpass", q: 0.7, to: 1, bus: musicBus, at: t }); // 셰이커
    } else if (s === "wait" || s === "tease") {
      // 열여섯 박마다 길게 깔리는 화음 하나 (기다리는 동안 조용하게)
      if (step % 16 === 0) { const root = st(C4 / 2, [0, -3, 5, 2][Math.floor(step / 16) % 4]); for (const iv of [0, 7, 16]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = st(root, iv); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 5); o.connect(g).connect(musicBus); o.start(t); o.stop(t + 5.1); } }
    } else if (s === "fight") {
      // 한 마디 16칸: 킥 4번, 스네어 2번, 하이햇 엇박, 베이스 리프 (A - A - F - G)
      const b = step % 16, bar = Math.floor(step / 16) % 4, root = 110 * 2 ** ([0, 0, -4, -2][bar] / 12);
      if (b % 4 === 0) tone(150, 45, 0.18, "sine", 0.24, 0, musicBus, t);
      if (b === 4 || b === 12) noise(0.12, 0.09, 1800, 0, { bus: musicBus, at: t });
      if (b % 2 === 1) noise(0.03, 0.022, 8000, 0, { type: "highpass", to: 1, bus: musicBus, at: t });
      const BASS = { 0: 0, 2: 0, 3: 12, 6: 0, 8: 0, 10: 7, 11: 12, 14: 10 };
      if (BASS[b] !== undefined) { const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = "sawtooth"; o.frequency.value = st(root / 2, BASS[b]); f.type = "lowpass"; f.frequency.value = 420; env(g, t, 0.005, 0.14, 0.07); o.connect(f).connect(g).connect(musicBus); o.start(t); o.stop(t + 0.16); }
    }
  }
  function setScene(name) {
    if (!SCENES[name] || name === scene) return;
    const prev = scene; scene = name; step = 0;
    if (!ac) return;
    const t = ac.currentTime;
    musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(SCENES[name].vol, t, 0.25);
    if (drone) drone.gain.setTargetAtTime(name === "tease" ? 0.05 : name === "fight" ? 0.025 : 0.0001, t, 0.4);
    if (amb && amb.water) amb.water.gain.setTargetAtTime(name === "wait" || name === "tease" ? 0.075 : 0.05, t, 0.6);
    if (name === "fight" && prev !== "fight") next = Math.max(next, t + 0.05);
    if (name === "result") jingle();
  }
  function setTension(k) {
    if (!tens || !ok()) return;
    const t = ac.currentTime, v = k > 0.15 ? 0.012 + 0.07 * k * k : 0.0001;
    tens.g.gain.setTargetAtTime(v, t, 0.08); tens.o.frequency.setTargetAtTime(85 + 240 * k, t, 0.1); tens.f.frequency.setTargetAtTime(500 + 900 * k, t, 0.1);
  }
  // 결과 마무리 음악: 올라가는 네 음 + 화음 + 심벌
  function jingle() {
    [0, 4, 7, 12].forEach((s, i) => tone(st(C4 * 2, s), st(C4 * 2, s), 0.22, "triangle", 0.12, i * 0.11, musicBus));
    [0, 4, 7].forEach(s => tone(st(C4, s), st(C4, s), 1.1, "triangle", 0.07, 0.46, musicBus));
    noise(1.0, 0.04, 7000, 0.46, { type: "highpass", to: 1, bus: musicBus });
  }

  return {
    startAmbience, setScene, setTension, jingle,
    init, get state() { return ac ? ac.state : "none"; }, get scene() { return scene; },
    get on() { return on; }, set on(v) { on = v; if (out) out.gain.setValueAtTime(v ? 0.85 : 0, ac.currentTime); }, // 끄면 예약된 소리도 바로 무음
    // 찌가 물에 떨어짐: 퐁당 + 작은 거품
    plop() { tone(560, 150, 0.16, "sine", 0.35); noise(0.2, 0.12, 1400); bubbles(3, 0.1); },
    tick() { tone(1100, 800, 0.05, "triangle", 0.14); },
    // 톡톡 (가짜 입질): 찌를 건드리는 작은 소리
    nibble() { tone(950, 700, 0.04, "sine", 0.14); noise(0.035, 0.05, 2600); },
    // 쑥 잠김 (진짜 입질)
    dunk() { tone(240, 55, 0.36, "sine", 0.6); noise(0.4, 0.35, 900); },
    // 챔질: 휙(바람) + 쿵(저음) + 물 튀김, 세 겹
    hook() { noise(0.22, 0.28, 700, 0, { to: 4.5, q: 1.2 }); tone(115, 38, 0.28, "sine", 0.55, 0.05); noise(0.35, 0.32, 1500, 0.06); tone(320, 1100, 0.08, "square", 0.06, 0.02); },
    // 릴 감기: 톱니가 드르륵 (감을수록 음이 올라감)
    reel(p) { noise(0.012, 0.09, 4500, 0, { type: "highpass", to: 1 }); noise(0.012, 0.07, 4000, 0.028, { type: "highpass", to: 1 }); tone(900 + 700 * p, 820 + 700 * p, 0.02, "square", 0.03); },
    // 물고기가 차고 나감: 경고 (떨리는 낮은 현 + 솟는 바람)
    runStart() {
      if (!ok()) return;
      const t = ac.currentTime, g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      lfo.frequency.value = 16; lg.gain.value = 0.04; lfo.connect(lg).connect(g.gain); g.connect(sfxBus);
      for (const f of [110, 164.8, 220]) { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.72); }
      lfo.start(t); lfo.stop(t + 0.72);
      noise(0.5, 0.12, 400, 0, { to: 5 });
    },
    strain() { this.runStart(); },
    // 맞는 방향으로 버팀: 올라가는 두 음
    holdOk() { tone(660, 660, 0.06, "triangle", 0.09); tone(990, 990, 0.09, "triangle", 0.08, 0.06); },
    splash() { noise(0.55, 0.5, 1500); tone(200, 60, 0.28, "sine", 0.32); },
    // 물고기가 물 위로 뛰어오름
    jump() { noise(0.4, 0.4, 2000); tone(260, 90, 0.2, "sine", 0.2); },
    // 건져 올림: 팡파르 + 심벌 (금색은 반짝이는 소리가 더 길게)
    fanfare(gold) {
      const n = gold ? [0, 4, 7, 12, 16, 19] : [0, 4, 7, 12];
      n.forEach((s, i) => tone(523 * 2 ** (s / 12), 523 * 2 ** (s / 12) * 1.003, 0.22, "triangle", 0.18, i * 0.075));
      noise(0.9, 0.07, 7500, 0.05, { type: "highpass", to: 1 });
      if (gold) [24, 28, 31, 36, 31, 36].forEach((s, i) => tone(523 * 2 ** (s / 12), 523 * 2 ** (s / 12), 0.12, "sine", 0.06, 0.45 + i * 0.06));
    },
    miss() { tone(420, 330, 0.14, "triangle", 0.2); tone(310, 170, 0.28, "triangle", 0.2, 0.14); },
    // 줄 끊김: 팅 + 떨어지는 음
    snap() { tone(2400, 2300, 0.28, "sine", 0.16); tone(1800, 300, 0.12, "square", 0.1); noise(0.25, 0.3, 2600); tone(400, 90, 0.55, "triangle", 0.16, 0.1); },
    // 어항에 넣음: 퐁 + 뽀글뽀글
    drop() { tone(760, 280, 0.12, "sine", 0.25); noise(0.16, 0.12, 2200, 0.02); bubbles(6, 0.08); },
    // 발소리: 모래·풀·나무·바위·콘크리트마다 다르게
    step(kind = "grass") {
      if (kind === "sand") noise(0.09, 0.07, 600, 0, { to: 0.6 });
      else if (kind === "wood") { tone(190, 130, 0.08, "triangle", 0.12); noise(0.03, 0.04, 2500); }
      else if (kind === "rock") { noise(0.04, 0.07, 3200, 0, { q: 2 }); tone(620, 430, 0.03, "square", 0.02); }
      else if (kind === "concrete") noise(0.05, 0.07, 1500, 0, { q: 1.5 });
      else noise(0.07, 0.05, 900, 0, { to: 0.5 });
    }
  };
  // 거품: 작은 사인음이 올라가며 여러 번
  function bubbles(n, gap) { for (let i = 0; i < n; i++) { const f = 500 + Math.random() * 500; tone(f, f * 1.8, 0.05, "sine", 0.06, 0.05 + i * gap + Math.random() * 0.03); } }
})();
