import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/dist/lil-gui.esm.min.js";
import { PARAMS, AIM, SPECIES, TOPICS, MAGNETS, SETS, REEL, REAL, gradeOf as gradeOfConv, simulate, visualPlan, zoneAt, settle, biteEvents, reelStart, reelStep, cardEffects, baitEffect } from "../sim.js";
import { $, REDUCED, ZCOLOR, mulberry } from "./util.js";
import { I18N, T, L, fmt, pct } from "./i18n.js";
import { SFX } from "./audio.js";
import { buildEnv } from "./env.js";
import { buildIsland } from "./island.js";
import { buildZones } from "./zones.js";
import { createOtter } from "./otter.js";

// 게임 상태. stage: start → reel(세트 고르기) → walk(섬 걷기) → cast(낚시) → result
const S = { get lang() { return I18N.lang; }, set lang(v) { I18N.lang = v; }, stage: "start", pick: {}, set: null, near: null, casts: [], total: 0, shownTotal: 0, seedBase: 20261026, fixedSeed: false, seed: 20261026, aim: { x: 0, z: -5 } };

// 릴스 커버 그림 (코드로 그린 아이콘)
const ART = {
  mcp: `<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><circle cx="50" cy="50" r="10" fill="#fff"/>${[0,72,144,216,288].map(a => { const r = a * Math.PI / 180, x = 50 + Math.cos(r) * 34, y = 50 + Math.sin(r) * 34; return `<line x1="50" y1="50" x2="${x}" y2="${y}"/><circle cx="${x}" cy="${y}" r="9" fill="rgba(255,255,255,.25)"/>`; }).join("")}</svg>`,
  design: `<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M50 12c-21 0-38 16-38 36 0 14 11 18 20 15 6-2 9 2 8 8-1 7 4 13 12 13 20 0 36-17 36-37S71 12 50 12z" fill="rgba(255,255,255,.18)"/><circle cx="34" cy="38" r="5" fill="#fff"/><circle cx="52" cy="28" r="5" fill="#fff"/><circle cx="69" cy="40" r="5" fill="#fff"/></svg>`,
  blog: `<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><rect x="16" y="56" width="12" height="26" rx="2" fill="rgba(255,255,255,.3)"/><rect x="34" y="40" width="12" height="42" rx="2" fill="rgba(255,255,255,.3)"/><rect x="52" y="26" width="12" height="56" rx="2" fill="#fff"/><circle cx="70" cy="32" r="14"/><line x1="80" y1="42" x2="90" y2="52"/></svg>`,
  intro: `<svg viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"><path d="M50 26c-10-7-24-8-36-5v56c12-3 26-2 36 5 10-7 24-8 36-5V21c-12-3-26-2-36 5z" fill="rgba(255,255,255,.18)"/><line x1="50" y1="26" x2="50" y2="82"/><path d="M60 46l12 7-12 7z" fill="#fff" stroke="none"/></svg>`
};
const CARD_BG = {
  mcp: "linear-gradient(160deg, #7b5cff 0%, #3b2a8f 100%)",
  design: "linear-gradient(160deg, #ff6fa4 0%, #8f2a5a 100%)",
  blog: "linear-gradient(160deg, #22b8a6 0%, #0f5a62 100%)",
  intro: "linear-gradient(160deg, #f0a93a 0%, #8a4b12 100%)"
};

function applyText() {
  document.documentElement.lang = S.lang;
  document.title = S.lang === "ko" ? "릴스 낚시" : "Reels Fishing";
  document.querySelectorAll("[data-t]").forEach(el => { const v = T(el.dataset.t); if (typeof v === "string") el.textContent = v; });
  $("btnLang").textContent = T("lang");
  $("btnSound").textContent = SFX.on ? "🔊" : "🔇"; $("btnSound").setAttribute("aria-label", SFX.on ? T("sound") : T("soundOff"));
  $("reelWord").textContent = T("reelWord"); $("reelKeys").textContent = T("reelKeys"); $("lineWord").textContent = T("lineWord"); $("pullKeys").textContent = T("pullKeys");
  canvas.setAttribute("aria-label", T("canvasLabel"));
  $("castNo").textContent = T("castNo")(S.casts.length);
  $("legend").innerHTML = `<span><i class="dot" style="background:var(--gray-fish)"></i>${T("legendGray")}</span>` +
    Object.entries(SPECIES).map(([k, s]) => `<span><i class="dot" style="background:var(--${k})"></i>${L(s)}</span>`).join("") +
    `<span><i class="dot" style="background:var(--gold)"></i>DM</span>`;
  spotLabelEls.forEach(({ el, k }) => { el.innerHTML = `${T("spotName")[k]}<small>${k === "open" ? T("spotOpenWho") : L(SPECIES[k])}</small>`; });
  labelW = null;
}

// ---------- 3D 장면 ----------
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
const DPR_CAP = matchMedia("(pointer: coarse)").matches ? 1.5 : 2; // 휴대폰은 1.5로 제한
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xe7a48c); // 수평선 노을빛: 먼 바다·섬이 이 색으로 스며든다
scene.background = FOG.clone();
scene.fog = new THREE.Fog(FOG, 55, 180);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
const SUN_DIR = new THREE.Vector3(-10, 24, -34).normalize(); // 해는 뒤쪽 위: 반사는 먼 물에만 반짝이게
scene.add(new THREE.HemisphereLight(0xe6ecff, 0x3d4a5c, 1.0));
const sun = new THREE.DirectionalLight(0xffcfa0, 2.6); sun.position.copy(SUN_DIR).multiplyScalar(40); scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fd3ff, 0.45); fill.position.set(8, 10, 16); scene.add(fill);

// 바다(물·하늘·갈매기) → 섬(지형·길·네 낚시 자리) → 앞바다 세 지형 장식. 섬이 바닥 높이(groundH)를 정한다
const { waterMat, updateGulls } = buildEnv(scene, { FOG, SUN_DIR });
const island = buildIsland(scene, { burst: (p, c, n, pw) => burst(p, c, n, pw) });
const { updateReeds, zoneRings } = buildZones(scene, island.groundH);
const SPOT_ORDER = ["marketer", "creator", "beginner", "open"];
const spotLabelEls = SPOT_ORDER.map(k => { const el = document.createElement("div"); el.className = "zlabel"; el.style.color = ZCOLOR[k]; el.style.opacity = 0; $("zlabels").appendChild(el); return { el, k }; });

// 어항: 앉은 자리 왼쪽에 놓인다 (낚시하는 동안만 보임). TANK는 유리 한가운데
const TANK = new THREE.Vector3(0, -50, 0);
const tankGroup = new THREE.Group(); tankGroup.visible = false; scene.add(tankGroup);
{
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x6e4a2e, roughness: 0.9 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 2.3), woodDark); stand.position.y = -1.04;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.9, 2.1), new THREE.MeshStandardMaterial({ color: 0xd8f7ff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.2, depthWrite: false })); glass.renderOrder = 4;
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.5, 1.9, 2.1)), new THREE.LineBasicMaterial({ color: 0xe6fbff, transparent: true, opacity: 0.7 }));
  const tw = new THREE.Mesh(new THREE.BoxGeometry(3.42, 1.5, 2.02), new THREE.MeshStandardMaterial({ color: 0x46c6d6, transparent: true, opacity: 0.22, depthWrite: false })); tw.position.y = -0.18; tw.renderOrder = 4;
  const gravel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 2.0), new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 1 })); gravel.position.y = -0.86;
  tankGroup.add(stand, glass, rim, tw, gravel);
}

// 낚싯대, 찌, 낚싯줄
// 낚싯대는 마디 8개를 곡선에 맞춰 놓는다. 들어 올림(lift)·좌우(yaw)·휨(bend)·떨림(jit)을 매 프레임 계산하고 끝(ROD_TIP)을 갱신
const ROD_BASE = new THREE.Vector3(-3.4, 1.0, 14.2), ROD_REST = new THREE.Vector3(-3.0, 4.0, 9.6);
let ROD_LEN = ROD_BASE.distanceTo(ROD_REST); const ROD_TIP = ROD_REST.clone();
const rod = { lift: 0, yaw: 0, bend: 0.08, jit: 0, kick: 0, segs: [], cur: { lift: 0, yaw: 0, bend: 0.08 } };
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.35, metalness: 0.5 });
  const NS = 8;
  for (let i = 0; i < NS; i++) {
    const g = new THREE.CylinderGeometry(0.085 - 0.06 * (i + 1) / NS, 0.085 - 0.06 * i / NS, 1, 7); g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, i === NS - 1 ? new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: 0.4 }) : mat); scene.add(m); rod.segs.push(m);
  }
  rod.grip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 1.0, 10), new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.9 })); scene.add(rod.grip);
  rod.reel = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 18), new THREE.MeshStandardMaterial({ color: 0xc8ced6, metalness: 0.75, roughness: 0.3 }));
  drum.rotation.z = Math.PI / 2; rod.reel.add(drum);
  rod.handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), new THREE.MeshStandardMaterial({ color: 0x333333 })); rod.handle.position.x = 0.13; rod.reel.add(rod.handle);
  scene.add(rod.reel);
}
const _rd = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _ra = new THREE.Vector3(), _re0 = new THREE.Vector3(), _re1 = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
// 손잡이에서 어떤 점을 향하려면 몇 도 돌려야 하는지 (쉬는 방향 기준)
let REST_AZ = Math.atan2(ROD_REST.x - ROD_BASE.x, ROD_REST.z - ROD_BASE.z);
function yawToward(p) { let a = Math.atan2(p.x - ROD_BASE.x, p.z - ROD_BASE.z) - REST_AZ; a = Math.atan2(Math.sin(a), Math.cos(a)); return THREE.MathUtils.clamp(a, -1.0, 1.0); }
function bez(t, out) { const u = 1 - t; return out.copy(ROD_BASE).multiplyScalar(u * u).addScaledVector(_rc, 2 * u * t).addScaledVector(_rb, t * t); }
function poseRod(dt, time, pull) {
  const c = rod.cur, k = REDUCED ? 1 : Math.min(1, dt * 9);
  c.lift += (rod.lift - c.lift) * k; c.yaw += (rod.yaw - c.yaw) * k; c.bend += (rod.bend - c.bend) * (REDUCED ? 1 : Math.min(1, dt * 14));
  rod.kick *= Math.exp(-dt * 8);
  _rd.subVectors(ROD_REST, ROD_BASE).normalize();
  _ra.crossVectors(_rd, _UP).normalize();
  _rd.applyAxisAngle(_ra, c.lift + rod.kick).applyAxisAngle(_UP, c.yaw);
  _rb.copy(ROD_BASE).addScaledVector(_rd, ROD_LEN);
  if (pull && c.bend > 0.001) { _ra.subVectors(pull, _rb).normalize(); _rb.addScaledVector(_ra, ROD_LEN * 0.3 * c.bend); }
  if (rod.jit && !REDUCED) _rb.y += Math.sin(time * 47) * rod.jit;
  _rc.copy(ROD_BASE).addScaledVector(_rd, ROD_LEN * 0.55);
  ROD_TIP.copy(_rb);
  const NS = rod.segs.length;
  for (let i = 0; i < NS; i++) {
    bez(i / NS, _re0); bez((i + 1) / NS, _re1);
    const m = rod.segs[i]; m.position.copy(_re0);
    _re1.sub(_re0); const len = _re1.length();
    m.quaternion.setFromUnitVectors(_UP, _re1.normalize()); m.scale.set(1, len, 1);
  }
  rod.grip.position.copy(ROD_BASE).addScaledVector(_rd, 0.5); rod.grip.quaternion.setFromUnitVectors(_UP, _rd);
  rod.reel.position.copy(ROD_BASE).addScaledVector(_rd, 1.15).addScaledVector(_UP, -0.3); rod.reel.quaternion.copy(rod.grip.quaternion);
}
const BOBBER_Y = 0.12;
const bobber = new THREE.Group();
{
  const red = new THREE.MeshPhysicalMaterial({ color: 0xff3d3d, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf8f8f2, roughness: 0.3, clearcoat: 1 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), red);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6), red); stick.position.y = 0.5;
  bobber.add(top, bot, stick);
}
bobber.visible = false; scene.add(bobber);
const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 20 }, () => new THREE.Vector3()));
const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.6 }));
line.visible = false; scene.add(line);
const _lp = new THREE.Vector3();
function updateLine(sag, end = bobber.position, lift = 0.5) {
  const pos = lineGeo.attributes.position;
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    _lp.lerpVectors(ROD_TIP, end, t); _lp.y -= Math.sin(Math.PI * t) * sag;
    if (i === 19) _lp.y += lift;
    pos.setXYZ(i, _lp.x, _lp.y, _lp.z);
  }
  pos.needsUpdate = true;
}

// 던질 때 찌가 날아가는 곡선
function arcPoint(t, to, out) { out.lerpVectors(ROD_TIP, to, t); out.y += Math.sin(Math.PI * t) * (2.4 + ROD_TIP.distanceTo(to) * 0.12); return out; }

// ---------- 수달 (낚시꾼) ----------
const otter = createOtter({ reduced: REDUCED }); scene.add(otter.group);
const OT = { pos: island.start.clone(), face: Math.PI, speed: 0, seated: false };
otter.group.position.copy(OT.pos); otter.group.rotation.y = OT.face;
// 앉은 자리에 맞춰 낚싯대·어항·카메라 기준을 옮긴다 (fwd: 던지는 쪽, right: 그 오른쪽)
const RIG = { fwd: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
function setRig(sp) {
  RIG.fwd.copy(sp.face).setY(0).normalize(); RIG.right.set(-RIG.fwd.z, 0, RIG.fwd.x);
  otter.group.updateMatrixWorld(true);
  ROD_BASE.copy(otter.handLocal).applyMatrix4(otter.group.matrixWorld);
  ROD_REST.copy(ROD_BASE).addScaledVector(RIG.fwd, 4.6).addScaledVector(RIG.right, 0.4); ROD_REST.y += 3;
  ROD_LEN = ROD_BASE.distanceTo(ROD_REST); REST_AZ = Math.atan2(ROD_REST.x - ROD_BASE.x, ROD_REST.z - ROD_BASE.z);
  Object.assign(rod.cur, { lift: 0, yaw: 0, bend: 0.08 });
  TANK.copy(sp.tank); TANK.y += 1.05; tankGroup.position.copy(TANK);
}
function showGear(v) { rod.segs.forEach(m => { m.visible = v; }); rod.grip.visible = rod.reel.visible = v; tankGroup.visible = tankBodies.visible = tankTails.visible = v; } // 어항 속 물고기도 어항과 함께

// 물결 고리
const rings = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xf0ffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.renderOrder = 3; scene.add(m);
  return { m, t: -1, delay: 0, max: 1 };
});
function splash(maxR) { rings.forEach((r, i) => { r.t = 0; r.delay = i * 0.26; r.max = maxR * (1 - i * 0.13); }); }

// 물보라 입자
// 둥근 점 텍스처 (네모 점 대신)
const dotTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,0.85)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const SPRAY = 160;
const sprayGeo = new THREE.BufferGeometry();
sprayGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(SPRAY * 3), 3));
sprayGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(SPRAY * 3), 3));
const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ size: 0.24, map: dotTex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
spray.frustumCulled = false; scene.add(spray);
const drops = Array.from({ length: SPRAY }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() }));
let dropNext = 0;
function burst(at, color, n = 18, power = 1) {
  for (let k = 0; k < n; k++) {
    const d = drops[dropNext]; dropNext = (dropNext + 1) % SPRAY;
    d.life = 0.7 + Math.random() * 0.5; d.p.copy(at); d.c.set(color);
    const a = Math.random() * Math.PI * 2, sp = (1 + Math.random() * 2) * power;
    d.v.set(Math.cos(a) * sp, (2.5 + Math.random() * 3) * power, Math.sin(a) * sp);
  }
}
// ---------- 물고기 ----------
// 몸통: 구를 늘이고 꼬리 쪽을 가늘게, 위는 어둡고 배는 밝게. 등지느러미·눈을 합쳐 한 덩어리로
function mergeGeos(list) {
  const pos = [], nor = [], col = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function paint(g, fn) { const p = g.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c.push(v, v, v); } g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); return g; }
function makeFishGeo() {
  const body = new THREE.SphereGeometry(0.5, 20, 14);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 1.8, y = p.getY(i), z = p.getZ(i);
    const t = x / 0.9, taper = t < 0 ? 1 - Math.pow(-t, 1.5) * 0.66 : 1 - t * t * 0.2;
    p.setXYZ(i, x, y * 0.92 * taper, z * 0.55 * taper);
  }
  body.computeVertexNormals();
  paint(body, (x, y) => 0.5 + 0.5 * THREE.MathUtils.clamp(0.5 - y / 0.9, 0, 1));
  const fin = new THREE.BufferGeometry();
  fin.setAttribute("position", new THREE.Float32BufferAttribute([-0.25, 0.3, 0, 0.3, 0.32, 0, -0.1, 0.62, 0, 0.3, 0.32, 0, -0.25, 0.3, 0, -0.1, 0.62, 0], 3));
  fin.computeVertexNormals(); paint(fin, () => 0.62);
  const eyeL = new THREE.SphereGeometry(0.055, 8, 6); eyeL.translate(0.6, 0.08, 0.17); paint(eyeL, () => 0.06);
  const eyeR = new THREE.SphereGeometry(0.055, 8, 6); eyeR.translate(0.6, 0.08, -0.17); paint(eyeR, () => 0.06);
  return mergeGeos([body, fin, eyeL, eyeR]);
}
const bodyGeo = makeFishGeo();
const tailGeo = new THREE.ConeGeometry(0.36, 0.7, 3); tailGeo.rotateZ(-Math.PI / 2); tailGeo.translate(-0.35, 0, 0); tailGeo.scale(1, 1, 0.28); tailGeo.computeVertexNormals(); paint(tailGeo, () => 0.82);
const fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide });
const MAX = 330, TANK_MAX = 110;
const bodies = new THREE.InstancedMesh(bodyGeo, fishMat, MAX);
const tails = new THREE.InstancedMesh(tailGeo, fishMat, MAX);
const tankBodies = new THREE.InstancedMesh(bodyGeo, fishMat, TANK_MAX);
const tankTails = new THREE.InstancedMesh(tailGeo, fishMat, TANK_MAX);
for (const im of [bodies, tails, tankBodies, tankTails]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
const C_GRAY = new THREE.Color(0x93a3b6), C_GOLD = new THREE.Color(0xffc531);
const fish = Array.from({ length: MAX }, () => ({ on: false, state: "off", pos: new THREE.Vector3(), vel: new THREE.Vector3(), role: "gray", wp: [], wpi: 0, delay: 0, phase: 0, speed: 4, scale: 1, jumpT: 0, jumpDur: 1, jumpH: 3, from: new THREE.Vector3(), to: new THREE.Vector3(), color: new THREE.Color(), orbitR: 2, orbitY: -1, orbitW: 1.3 }));
const tankFish = [];
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0), _d = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _p4 = new THREE.Vector3(), _p5 = new THREE.Vector3(), target = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function hideFish(i) { fish[i].on = false; fish[i].state = "off"; bodies.setMatrixAt(i, ZERO); tails.setMatrixAt(i, ZERO); }
function hideAll() { for (let i = 0; i < MAX; i++) hideFish(i); bodies.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true; }
for (let i = 0; i < TANK_MAX; i++) { tankBodies.setMatrixAt(i, ZERO); tankTails.setMatrixAt(i, ZERO); tankBodies.setColorAt(i, C_GRAY); tankTails.setColorAt(i, C_GRAY); }
showGear(false); // 처음엔 걷기 전이라 낚싯대·어항을 숨김
for (let i = 0; i < MAX; i++) { bodies.setColorAt(i, C_GRAY); tails.setColorAt(i, C_GRAY); }
hideAll();
function writeFish(im, it, i, pos, dir, scale, wag) {
  _q.setFromUnitVectors(_x, _d.copy(dir).normalize());
  _s.setScalar(scale); _m.compose(pos, _q, _s); im.setMatrixAt(i, _m);
  _t.makeTranslation(-0.8, 0, 0).multiply(_r.makeRotationY(wag)); it.setMatrixAt(i, _m2.multiplyMatrices(_m, _t));
}

const SF = new THREE.Vector3(), SR = new THREE.Vector3();
// 떼 구성: 던진 자리(L)로 몰려오고, 노린 물고기만 찌 주변에 머문다
function spawnSchool(c) {
  hideAll();
  const { res, plan, seed, L: Lp } = c;
  SF.copy(c.dir); SR.set(-SF.z, 0, SF.x);
  const r = mulberry(seed * 7 + 3);
  const zone = res.zone;
  const others = Object.keys(SPECIES).filter(k => k !== zone);
  const strength = res.hook.s;
  const orbit = Math.min(plan.biters, 80);
  let n = 0;
  const make = (role, color, kind) => {
    const f = fish[n]; f.kind = kind;
    // 바다 쪽(던진 방향 너머)에서 몰려온다. side: 옆으로, ahead: 바다 쪽으로
    const a = Math.PI * (1.02 + r() * 0.96), d = 22 + r() * 10, side = Math.cos(a) * d, ahead = -Math.sin(a) * d * 0.7 + 2;
    f.on = true; f.role = role; f.state = role === "gray" ? "pass" : "approach"; f.color.copy(color);
    f.pos.copy(Lp).addScaledVector(SR, side).addScaledVector(SF, ahead); f.pos.y = -1.2 - r() * 3.4;
    f.vel.set(0, 0, 0).addScaledVector(SR, -Math.cos(a) * 2).addScaledVector(SF, Math.sin(a) * 2);
    f.phase = r() * 10; f.scale = role === "gold" ? 1.2 : 0.8 + r() * 0.45;
    // 도는 반지름·깊이·속도·방향을 제각각 (굳은 고리처럼 보이지 않게)
    f.orbitR = 1.5 + r() * 3; f.orbitY = -0.6 - r() * 1.8; f.orbitW = (0.7 + r() * 1.2) * (r() < 0.3 ? -1 : 1);
    if (role === "gray") {
      const out = side > 0 ? -1 : 1;
      f.wp = [Lp.clone().addScaledVector(SR, (r() - 0.5) * 9).addScaledVector(SF, (r() - 0.5) * 7).setY(f.pos.y), Lp.clone().addScaledVector(SR, out * (30 + r() * 8)).addScaledVector(SF, 6 + r() * 16).setY(f.pos.y)];
      f.speed = 3.4 + r() * 2.2 + strength; f.delay = r() * 2.4;
    } else {
      f.wp = [new THREE.Vector3(Lp.x, -1, Lp.z)];
      f.speed = 5 + r() * 2.5 + strength * 1.5; f.delay = 0.2 + r() * 1.6 / strength;
    }
    f.wpi = 0;
    bodies.setColorAt(n, f.color); tails.setColorAt(n, f.color);
    n++;
  };
  // 색깔 물고기: 던진 구역의 물고기. 넓은 바다면 세 종류가 섞임
  const kinds = zone ? [zone] : Object.keys(SPECIES);
  for (let i = 0; i < orbit; i++) { const kd = i < plan.gold ? "gold" : kinds[i % kinds.length]; make(i < plan.gold ? "gold" : "orbit", kd === "gold" ? C_GOLD : new THREE.Color(SPECIES[kd].color), kd); }
  const grays = Math.max(0, Math.min(MAX - orbit, plan.school - plan.biters));
  for (let i = 0; i < grays; i++) make("gray", r() < 0.12 && others.length ? new THREE.Color(SPECIES[others[i % others.length]].color) : C_GRAY);
  bodies.instanceColor.needsUpdate = tails.instanceColor.needsUpdate = true;
}
function addToTank(color, count = 1) {
  for (let k = 0; k < count; k++) {
    let i;
    if (tankFish.length < TANK_MAX) { i = tankFish.length; tankFish.push({}); } else i = Math.floor(Math.random() * TANK_MAX);
    const f = tankFish[i];
    f.c = color.clone(); f.a = Math.random() * 6; f.r = 0.25 + Math.random() * 1.15; f.y = -0.6 + Math.random() * 0.85; f.sp = (0.6 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1); f.ph = Math.random() * 6;
    tankBodies.setColorAt(i, f.c); tankTails.setColorAt(i, f.c);
  }
  tankBodies.instanceColor.needsUpdate = tankTails.instanceColor.needsUpdate = true;
}

// ---------- 카메라 ----------
let camDist = 1.1, camTarget = 1.1, viewShift = 0, sheetH = 0, sheetTop = 0, labelW = null;
// 시트 높이는 바뀔 때만 잰다 (매 프레임 레이아웃 측정을 피함)
function measureSheet() { const r = $("sheet").getBoundingClientRect(); sheetH = $("sheet").hidden ? 0 : r.height; sheetTop = r.top; }
new ResizeObserver(measureSheet).observe($("sheet"));
const camPos = new THREE.Vector3(0, 13, 19), camLook = new THREE.Vector3(0, -1.2, 1.6), desPos = new THREE.Vector3(), desLook = new THREE.Vector3(), _ct = new THREE.Vector3();
function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
  renderer.setSize(innerWidth, innerHeight, false);
  labelW = null;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 64 : 48;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();
function placeCamera(dt, time) {
  camDist += (camTarget - camDist) * (REDUCED ? 1 : Math.min(1, dt * 1.2));
  const portrait = camera.aspect < 0.8;
  // 단계마다 카메라: 고르기는 섬 전체, 걷기는 수달을 따라, 낚시는 낚싯대 뒤 어깨너머. 어항·매달기 카메라는 앉은 방향(RIG) 기준
  if (S.stage === "walk") {
    const p = OT.pos;
    if (portrait) desPos.set(p.x, p.y + 15, p.z + 12); else desPos.set(p.x, p.y + 10.5, p.z + 11);
    desLook.set(p.x, p.y + 0.4, p.z - 1.5);
  } else if (cast && S.stage === "result") {
    // 결과: 어항이 시트 위에 보이게 어항 쪽을 비춘다
    // 시트가 장면을 위로 밀어 올리므로, 어항을 화면 가운데보다 조금 아래에 둔다
    desPos.copy(TANK).addScaledVector(RIG.right, -0.4).addScaledVector(RIG.fwd, portrait ? -10 : -13); desPos.y += portrait ? 6.5 : 7;
    desLook.copy(TANK); desLook.y -= 0.3;
  } else if (cast && S.stage === "cast" && cast.cam === "catch") {
    // 건져 올린 순간: 매달린 물고기를 가까이
    // 옆에서: 낚싯대는 물고기 앞쪽(손잡이 쪽)으로 비켜 보이고, 물고기는 하늘을 배경으로
    desPos.copy(HANG).addScaledVector(RIG.right, portrait ? 5.8 : 5).addScaledVector(RIG.fwd, portrait ? -1.4 : -1.2); desPos.y += portrait ? 0.6 : 0.5;
    desLook.copy(HANG).addScaledVector(RIG.right, -0.2); desLook.y -= 0.5;
  } else if (cast && S.stage === "cast" && cast.cam === "stow") {
    // 어항에 넣는 순간: 어항 쪽으로
    desPos.copy(TANK).addScaledVector(RIG.right, 1.2).addScaledVector(RIG.fwd, -6.2); desPos.y += 4.2;
    desLook.copy(TANK).addScaledVector(RIG.right, -0.4).addScaledVector(RIG.fwd, 1);
  } else if (cast && (S.stage === "cast" || S.stage === "between")) {
    // 낚시 중: 낚싯대 뒤 어깨너머에서 찌를 본다. 연타 중엔 끌려오는 물고기를 따라온다
    const b = cast.bite, reeling = b && b.phase === "reel", h = cast.dir;
    _ct.copy(ROD_BASE).lerp(reeling ? fish[b.i].pos : cast.L, reeling ? 0.6 : 0.62).setY(0);
    const back = portrait ? 4.6 : 3.6, up = portrait ? 8.6 : 6.4;
    desPos.copy(ROD_BASE).addScaledVector(h, -back).add(_p4.set(-h.z * 1.7, up, h.x * 1.7));
    desLook.set(_ct.x, -1, _ct.z);
  } else {
    // 세트 고르기: 섬 전체를 남쪽 위에서
    if (portrait) desPos.set(0, 52, 46); else desPos.set(0, 36, 40);
    desLook.set(0, 0, -3);
  }
  const ease = REDUCED ? 1 : Math.min(1, dt * (S.stage === "walk" ? 5 : cast && cast.cam ? 4 : 2.2));
  camPos.lerp(desPos, ease); camLook.lerp(desLook, ease);
  const sway = REDUCED ? 0 : Math.sin(time * 0.25) * 0.25;
  camera.position.set(camPos.x + sway, camPos.y, camPos.z);
  camera.lookAt(camLook);
  // 가운데 팝업 결과 화면에선 어항이 팝업 위 빈 곳에 오게 장면을 올린다
  const sh = $("sheet");
  const want = sh.hidden ? 0 : S.stage === "result" ? Math.max(0, innerHeight / 2 - (document.querySelector(".hud-row").getBoundingClientRect().bottom + sheetTop) / 2) : 0;
  viewShift += (want - viewShift) * Math.min(1, dt * 4);
  if (viewShift > 0.5) camera.setViewOffset(innerWidth, innerHeight, 0, viewShift, innerWidth, innerHeight); else camera.clearViewOffset();
}
const _sp = new THREE.Vector3();
function toScreen(v) { _sp.copy(v).project(camera); return { x: (_sp.x + 1) / 2 * innerWidth, y: (1 - _sp.y) / 2 * innerHeight }; }

// ---------- 한 판 진행 ----------
let cast = null;
const toastEl = $("toast"); let toastTimer;
function say(msg, ms = 1200) { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("on"), ms); }
function coach(main, sub) { const el = $("coach"); if (!main) { el.hidden = true; return; } el.innerHTML = `${main}<small>${sub || ""}</small>`; el.hidden = false; }

// 한 판 = 같은 세트로 찌 3번. 사이마다 같은 자리에서 다시 던지거나 일어나 옮긴다
const OUTING_N = 3;
// ---------- 걷기: 섬을 걸어 낚시 자리로 ----------
function goWalk() {
  S.stage = "walk"; S.near = null; SFX.setScene("walk");
  $("sheet").hidden = true; $("aimtag").hidden = true;
  bobber.visible = false; line.visible = false;
  OT.seated = false; showGear(false);
  showWalkCoach(); showArrive();
  canvas.focus({ preventScroll: true });
}
function showWalkCoach() {
  const topic = TOPICS.find(t => t.id === S.pick.topic);
  coach(T("walkCoach"), T("walkKeys")(topic ? L(SPECIES[topic.target]) : ""));
  $("sr").textContent = T("walkCoach");
}
const keysDown = new Set(); let stick = null; // stick: 화면 끌기 방향 (-1..1)
const _mv = new THREE.Vector3();
function walkStep(dt) {
  _mv.set(0, 0, 0);
  if (keysDown.has("L")) _mv.x -= 1; if (keysDown.has("R")) _mv.x += 1;
  if (keysDown.has("U")) _mv.z -= 1; if (keysDown.has("D")) _mv.z += 1;
  if (stick) { _mv.x += stick.x; _mv.z += stick.y; }
  const m = Math.min(1, _mv.length()), p = OT.pos;
  if (m > 0.08) {
    _mv.normalize();
    const step = 6.5 * m * dt;
    // 못 가는 곳이면 한 축씩 미끄러지듯 (나무·바위·물가)
    const go = (x, z) => { const h = island.surfaceAt(x, z); if (h === null || Math.abs(h - p.y) > 0.9) return false; p.set(x, h, z); return true; };
    const px = p.x, pz = p.z;
    go(p.x + _mv.x * step, p.z + _mv.z * step) || go(p.x + _mv.x * step, p.z) || go(p.x, p.z + _mv.z * step);
    OT.stepDist = (OT.stepDist || 0) + Math.hypot(p.x - px, p.z - pz);
    if (OT.stepDist > 0.9) { OT.stepDist = 0; SFX.step(groundKind(p)); } // 한 걸음마다 발소리
    let d = Math.atan2(_mv.x, _mv.z) - OT.face; d = Math.atan2(Math.sin(d), Math.cos(d));
    OT.face += d * Math.min(1, dt * 12);
  }
  OT.speed += ((m > 0.08 ? m : 0) - OT.speed) * Math.min(1, dt * 10);
  // 낚시 자리 가까이 오면 앉기 안내
  let near = null;
  for (const k of SPOT_ORDER) { const sp = island.spots[k]; if (Math.hypot(p.x - sp.seat.x, p.z - sp.seat.z) < 2.4) near = k; }
  if (near !== S.near) { S.near = near; showArrive(); if (near) SFX.tick(); }
}
// 발밑이 무엇인지: 잔교(나무)·방파제(콘크리트)·곶(바위)·해변과 물가(모래)·그 밖(풀)
function groundKind(p) {
  const sp = island.spots;
  if (p.x > 14 && Math.abs(p.y - sp.creator.seat.y) < 0.06) return "wood";
  if (p.z < -14 && Math.abs(p.x - sp.open.seat.x) < 3) return "concrete";
  if (p.y > 1.2 && Math.hypot(p.x - sp.marketer.seat.x, p.z - sp.marketer.seat.z) < 9) return "rock";
  if (p.z > 12 || p.y < 0.75) return "sand";
  return "grass";
}
function showArrive() {
  const el = $("arrive"), k = S.stage === "walk" ? S.near : null;
  el.hidden = !k;
  if (!k) return;
  $("arriveName").textContent = T("spotName")[k]; $("arriveName").style.color = ZCOLOR[k];
  $("arriveWho").textContent = T("spotWho")[k];
  $("sitBtn").textContent = T("sitBtn"); $("sitKeys").textContent = T("sitKeys");
  $("sr").textContent = `${T("spotName")[k]}. ${T("spotWho")[k]}. ${T("sitBtn")}`;
}
// 자리에 앉아 바로 던진다
function sitAt(k) {
  if (S.stage !== "walk" || !k) return;
  const sp = island.spots[k];
  OT.pos.copy(sp.seat); OT.face = Math.atan2(sp.face.x, sp.face.z); OT.seated = true; OT.spot = k; OT.speed = 0; keysDown.clear(); stick = null;
  otter.group.position.copy(OT.pos); otter.group.rotation.y = OT.face;
  S.near = null; $("arrive").hidden = true;
  dragStart = null; $("stick").hidden = true; // 끌던 손가락이 남아 있어도 조이스틱은 끝
  setRig(sp); showGear(true);
  castTo(sp.target.x, sp.target.z);
}

function castTo(x, z) {
  if (S.stage !== "walk" && S.stage !== "between") return;
  $("between").hidden = true;
  S.aim.x = x; S.aim.z = z;
  $("sheet").hidden = true; canvas.focus({ preventScroll: true }); // 던지기 버튼에 포커스가 남으면 방향키·스페이스가 안 먹으므로
  const zone = zoneAt(S.aim.x, S.aim.z);
  const seed = S.fixedSeed ? S.seed : S.seedBase + S.casts.length + 1;
  const res = simulate({ topicId: S.pick.topic, hookIdx: S.pick.hook, magnetId: S.pick.magnet, seed, zone }, PARAMS);
  const plan = visualPlan(res);
  const ev = biteEvents(plan);
  const order = Array.from({ length: ev.n }, (_, i) => i < ev.gold ? "gold" : "orbit");
  const rr = mulberry(seed + 11); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  cast = { res, plan, seed, L: new THREE.Vector3(S.aim.x, 0, S.aim.z), t: 0, phase: "throw", n: ev.n, goldN: ev.gold, order, ev: 0, hits: 0, goldHits: 0, bite: null, nextBiteAt: Infinity, skipped: 0, endWait: 0, presses: 0, spool: 0, rethrow: null, cam: null, prev: S.casts[S.casts.length - 1] || null };
  rod.yaw = yawToward(cast.L); rod.kick = -0.35; rod.lift = 0; rod.bend = 0.08;
  // 연타로 끌어올 자리: 부두 바로 앞 물
  cast.dir = new THREE.Vector3(cast.L.x - ROD_BASE.x, 0, cast.L.z - ROD_BASE.z).normalize();
  cast.landing = ROD_BASE.clone().addScaledVector(cast.dir, 4.6).setY(0);
  SFX.hook(); SFX.setScene("wait");
  S.stage = "cast";
  $("aimtag").hidden = true;
  coach(null);
  $("btnSkip").hidden = false;
  bobber.visible = true; line.visible = true; bobber.position.copy(ROD_TIP);
  hideAll();
  camTarget = 1 + 0.3 * Math.sqrt(plan.school / 260);
}

function land() {
  cast.phase = "fish"; cast.t = 0;
  bobber.position.set(cast.L.x, BOBBER_Y, cast.L.z);
  splash(2.5 + cast.res.hook.s * 7);
  burst(bobber.position, 0xe8ffff, 26, 1);
  SFX.plop();
  spawnSchool(cast);
  cast.nextBiteAt = 2.0;
  say(T("toastSchool"));
  coach(T("fishCoach"), `${T("castOf")((S.outing || []).length + 1, OUTING_N)} · ${T("fishKeys")}`);
  showLiveTotal();
}

// ---------- 손맛: 멈춤·흔들림·번쩍임·효과 글자·진동 ----------
const FX = { stop: 0, shake: 0 };
// 효과 글자는 정해진 시간 뒤 확실히 지운다 (동작 줄이기 설정에선 애니메이션 없이 켜져만 있으므로)
const offTimers = new Map();
function retrigger(el, cls, ms = 0) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  if (ms) { clearTimeout(offTimers.get(el)); offTimers.set(el, setTimeout(() => el.classList.remove(cls), ms)); }
}
function impact(at, { stop = 0, shake = 0, flash = false, buzz = 0 } = {}) {
  if (buzz && navigator.vibrate) navigator.vibrate(buzz);
  if (REDUCED) return;
  FX.stop = Math.max(FX.stop, stop); FX.shake = Math.max(FX.shake, shake);
  if (flash && at) { const p = toScreen(at), el = $("flash"); el.style.setProperty("--x", p.x + "px"); el.style.setProperty("--y", p.y + "px"); retrigger(el, "on"); }
}
function pow(text, at, gold = false, dy = -70) {
  const el = $("pow"), p = toScreen(at);
  el.textContent = text; el.classList.toggle("gold", gold);
  el.style.left = Math.min(innerWidth - 90, Math.max(90, p.x)) + "px"; el.style.top = Math.max(120, p.y + dy) + "px";
  retrigger(el, "on", 800);
}

// 입질 시작: 찌 주변을 돌던 물고기 하나가 찌로 다가온다
function startNibble() {
  const want = cast.order[cast.ev];
  let pick = -1, fallback = -1;
  for (let i = 0; i < MAX; i++) {
    const f = fish[i];
    if (!f.on || f.state !== "orbit") continue;
    if (f.role === want) { pick = i; break; }
    if (fallback < 0) fallback = i;
  }
  // 차례인 물고기(특히 금색)가 아직 오는 중이면 다른 물고기로 바꾸지 않고 기다린다
  if (pick < 0 && cast.t < 8 && fish.some(f => f.on && f.state === "approach" && f.role === want)) { cast.nextBiteAt = cast.t + 0.3; return; }
  if (pick < 0) pick = fallback;
  if (pick >= 0 && want === "gold" && fish[pick].role !== "gold") cast.goldN = Math.max(0, cast.goldN - 1); // 금색 기회가 실제로 오지 않았으면 DM 정산 분모에서 뺀다
  if (pick < 0) {
    // 아직 다가오는 물고기가 있으면 잠깐 기다리고, 없으면 이번 기회는 놓친 것으로 센다
    const coming = fish.some(f => f.on && f.state === "approach");
    if (coming && cast.t < 8) { cast.nextBiteAt = cast.t + 0.3; return; }
    cast.ev++; cast.nextBiteAt = cast.t + 0.2;
    return;
  }
  const f = fish[pick], gold = f.role === "gold";
  f.state = "nibble";
  // 톡톡(가짜 입질) 0~2번, 금색은 1~3번. 그다음 쑥 잠긴다
  cast.bite = { i: pick, gold, kind: f.kind, phase: "approach", t0: 0, teases: Math.floor(Math.random() * 3) + (gold ? 1 : 0), nextTwitch: 0, win: (gold ? 0.6 : 0.75) + (REDUCED ? 0.6 : 0) + (usedKeys ? 0.5 : 0) }; // 키보드(화면 읽기 포함)로 하면 판정 시간을 늘림
}

// 찌가 쑥 잠기는 순간 (진짜 입질)
function dunk() {
  const b = cast.bite;
  b.phase = "window"; b.t0 = cast.t;
  const el = $("bite"); el.hidden = false; el.classList.toggle("gold", b.gold); el.style.setProperty("--c", b.gold ? "#ffc531" : "#ffffff"); el.style.setProperty("--p", "1");
  retrigger(el, "hit");
  splash(2.2); burst(_p4.copy(bobber.position).setY(0.1), 0xe8ffff, 22, 0.9);
  SFX.dunk(); impact(bobber.position, { stop: 0.06, shake: 0.12, buzz: 25 });
  rod.bend = 0.45; rod.lift = -0.08;
  $("srAlert").textContent = ""; $("srAlert").textContent = T("srBite"); // 입질은 바로 읽히게 assertive로
}

// 탭(또는 스페이스): 상황에 따라 챔질이거나 연타
function gameTap() {
  if (!cast || cast.phase !== "fish") return;
  const b = cast.bite;
  if (b && b.phase === "reel") { cast.presses++; return; }
  if (!b || b.phase === "approach") { say(T("early"), 700); return; }
  if (b.phase === "tease") return tooEarly();
  if (b.phase === "window") return hook();
}
function tooEarly() {
  const f = fish[cast.bite.i];
  flee(f, 12); burst(_p4.copy(bobber.position).setY(0.1), 0x9fdcff, 10, 0.6);
  SFX.miss(); say(T("tooEarly"), 1000);
  endBite();
}

// 챔질: 낚싯대를 확 채고, 연타 단계로
function hook() {
  const b = cast.bite, f = fish[b.i];
  b.phase = "reel"; b.st = reelStart(b.gold ? "gold" : "orbit", cast.seed * 7 + cast.ev); b.splashAt = 0; b.off = new THREE.Vector3(); holdDir = null;
  f.state = "hooked"; f.hookFrom = f.pos.clone();
  $("bite").hidden = true; toastEl.classList.remove("on");
  rod.kick = 0.45; rod.bend = 0.6;
  burst(_p4.copy(bobber.position).setY(0.1), b.gold ? 0xffd45a : 0xe8ffff, b.gold ? 34 : 24, 1.3);
  splash(3);
  SFX.hook(); SFX.setScene("fight"); impact(bobber.position, { stop: 0.09, shake: 0.3, flash: true, buzz: 40 });
  pow(b.gold ? T("powGold") : T("pow"), bobber.position, b.gold);
  const r = $("reel"); r.hidden = false; r.style.setProperty("--c", b.gold ? "#ffc531" : "#" + new THREE.Color(SPECIES[b.kind] ? SPECIES[b.kind].color : 0xffffff).getHexString());
  $("reelWarn").textContent = ""; cast.presses = 0; cast.spool = 0;
  coach(null);
  $("sr").textContent = T("srHooked");
}

// 끌어올린 물고기를 물 밖으로 (잡았다!)
function landFish() {
  const b = cast.bite, f = fish[b.i];
  b.phase = "lift"; b.t0 = cast.t;
  f.state = "lift"; f.from.copy(f.pos);
  $("reel").hidden = true; $("pull").hidden = true; holdDir = null;
  const before = S.shownTotal;
  cast.hits++; if (b.gold) cast.goldHits++;
  showLiveTotal(); retrigger($("total"), "bump");
  b.gain = S.shownTotal - before;
  bobber.visible = false;
  burst(_p4.copy(f.pos).setY(0.1), b.gold ? 0xffd45a : 0xe8ffff, 40, 1.6); splash(3.4);
  SFX.setTension(0); SFX.splash(); SFX.fanfare(b.gold);
  impact(f.pos, { stop: 0.12, shake: 0.35, flash: true, buzz: [30, 40, 60] });
  rod.lift = 0.7; rod.bend = 0.35; rod.jit = 0; rod.yaw = 0;
  cast.cam = "catch";
  $("sr").textContent = T("srLanded");
}
function showCatch(b) {
  const el = $("catch"), c = b.gold ? "#ffc531" : "#" + new THREE.Color(SPECIES[b.kind].color).getHexString();
  el.style.setProperty("--c", c);
  $("catchName").textContent = T("catchName")(b.gold ? "gold" : b.kind);
  $("catchSub").textContent = T("catchSub")(Math.max(0, b.gain));
  retrigger(el, "on", 1350);
}

// 진행 중 점수: 결과와 같은 식(기록 × (70% + 30% × 건진 비율)). 떼가 들어오면 기본 70%, 건질 때마다 보너스
function showLiveTotal() {
  const s = settle(cast.res, cast.hits / cast.n, cast.goldN ? cast.goldHits / cast.goldN : cast.hits / cast.n);
  S.shownTotal = S.total + s.follows; $("total").textContent = fmt(S.shownTotal);
}
function flee(f, speed) { f.state = "flee"; f.wp = [new THREE.Vector3(f.pos.x + (Math.random() - 0.5) * 50, -2.5, f.pos.z - 30)]; f.wpi = 0; f.speed = speed; }
function missBite() {
  flee(fish[cast.bite.i], 11);
  burst(_p4.copy(bobber.position).setY(0.1), 0x9fdcff, 8, 0.6);
  SFX.miss(); say(T("missed"), 700);
  endBite();
}
function escapeFish() {
  const f = fish[cast.bite.i];
  flee(f, 13);
  $("reel").hidden = true; $("pull").hidden = true;
  burst(_p4.copy(f.pos).setY(0.1), 0x9fdcff, 14, 0.8);
  SFX.miss(); say(T("escaped"), 1100);
  rod.kick = -0.2;
  endBite(true);
}
// 줄이 끊어짐: 낚싯대가 튕기고 물고기는 달아남
function snapFish() {
  const f = fish[cast.bite.i];
  flee(f, 14);
  $("reel").hidden = true; $("pull").hidden = true;
  burst(_p4.copy(f.pos).setY(0.2), 0xffffff, 18, 1.1);
  SFX.snap(); say(T("snapped"), 1300);
  impact(null, { shake: 0.25, flash: true, buzz: 60 });
  rod.kick = -0.5;
  endBite(true);
}
// 한 마리가 끝나면 다음 입질. 찌가 끌려왔으면 다시 던진다
function endBite(rethrow = false) {
  cast.bite = null; cast.ev++;
  $("bite").hidden = true; $("reel").hidden = true; $("pull").hidden = true; holdDir = null;
  SFX.setTension(0); SFX.setScene("wait"); // 한 마리가 끝나면 다시 조용히 기다리기
  rod.lift = 0; rod.bend = 0.08; rod.jit = 0; rod.yaw = yawToward(cast.L);
  cast.cam = null;
  if (rethrow) { cast.rethrow = { t: 0, from: bobber.position.clone() }; bobber.visible = true; }
  cast.nextBiteAt = cast.t + (rethrow ? 0.55 : 0.3) + Math.random() * 0.3;
  if (cast.ev < cast.n) coach(T("fishCoach"), `${T("castOf")((S.outing || []).length + 1, OUTING_N)} · ${T("fishKeys")}`);
}

// 물 밖에서 들어 올린 물고기가 매달리는 자리
const HANG = new THREE.Vector3();
function hangPoint(time, out) { return out.copy(ROD_TIP).add(_p3.set(Math.sin(time * 2.4) * 0.25, -1.55, Math.cos(time * 1.9) * 0.12)); }

function finishCast() {
  if (!cast || cast.phase === "done") return;
  if (cast.phase === "throw") land();
  if (cast.bite) {
    const b = cast.bite, f = fish[b.i];
    // 이미 물 밖으로 꺼낸 물고기는 건진 것으로, 아직 물속이면 놓친 것으로
    if (b.phase === "lift") { hideFish(b.i); addToTank(f.color); cast.ev++; } // 건진 한 마리 = 어항에 한 마리 (종류는 색으로)
    else flee(f, 9);
    cast.bite = null;
  }
  cast.rethrow = null; cast.cam = null;
  $("reel").hidden = true; bobber.visible = true; bobber.position.set(cast.L.x, BOBBER_Y, cast.L.z);
  rod.lift = 0; rod.bend = 0.08; rod.jit = 0; rod.kick = 0;
  cast.skipped = Math.max(0, cast.n - cast.ev);
  cast.ev = cast.n;
  cast.phase = "done";
  $("btnSkip").hidden = true; $("bite").hidden = true; coach(null);
  $("pow").classList.remove("on"); $("catch").classList.remove("on");
  const { res } = cast;
  const s = settle(res, cast.hits / cast.n, cast.goldN ? cast.goldHits / cast.goldN : cast.hits / cast.n);
  const rec = { ...res, follows: s.follows, dm: s.dm, conv: s.conv, grade: s.grade, hits: cast.hits, n: cast.n, skipped: cast.skipped, rawFollows: res.follows };
  // 남은 색깔 물고기는 흩어진다
  for (let i = 0; i < MAX; i++) { const f = fish[i]; if (f.on && (f.state === "orbit" || f.state === "approach" || f.state === "nibble" || f.state === "hooked")) flee(f, 7); }
  S.casts.push(rec);
  S.total += rec.follows; S.shownTotal = S.total;
  $("total").textContent = fmt(S.total);
  $("castNo").textContent = T("castNo")(S.casts.length);
  // 세 번째 찌가 끝나야 결과. 그 전엔 머리 위 안내: 다시 던지기 / 일어나서 옮기기
  if (!S.outing) S.outing = [];
  S.outing.push(rec);
  SFX.setTension(0);
  if (S.outing.length < OUTING_N) { S.stage = "between"; SFX.setScene("wait"); showBetween(rec); return; }
  S.stage = "result"; SFX.setScene("result");
  const sum = outingSummary(S.outing);
  showResult(sum, S.prevOuting);
  S.prevOuting = sum;
}
function showBetween(rec) {
  const left = OUTING_N - S.outing.length;
  $("betweenTitle").textContent = T("betweenTitle")(rec.follows);
  $("betweenSub").textContent = T("betweenSub")(rec.hits, rec.n, left);
  $("recastBtn").textContent = T("recastBtn")(S.outing.length + 1, OUTING_N); $("moveBtn").textContent = T("moveBtn"); $("betweenKeys").textContent = T("betweenKeys");
  $("between").hidden = false;
  $("sr").textContent = `${T("betweenTitle")(rec.follows)}. ${T("betweenSub")(rec.hits, rec.n, left)}`;
  $("recastBtn").focus({ preventScroll: true });
}
function recast() { if (S.stage !== "between" || !OT.spot) return; const sp = island.spots[OT.spot]; castTo(sp.target.x, sp.target.z); canvas.focus({ preventScroll: true }); }
function standUp() { if (S.stage !== "between") return; $("between").hidden = true; goWalk(); }
// 세 번을 하나로: 건진 팔로워는 합계, 떼·DM·전환율은 한 번 던질 때 평균 (실제 기록 한 편과 비교하려고)
function outingSummary(list) {
  const n = list.length, last = list[n - 1], sum = k => list.reduce((a, r) => a + r[k], 0);
  const conv = sum("follows") / Math.max(1, sum("reach"));
  const zones = list.map(r => r.zone), zone = zones.sort((a, b) => zones.filter(z => z === b).length - zones.filter(z => z === a).length)[0];
  return { ...last, casts: list, zone, follows: sum("follows"), avgFollows: sum("follows") / n, reach: sum("reach") / n, dm: sum("dm") / n, conv, grade: gradeOfConv(conv), hits: sum("hits"), n: sum("n"), skipped: sum("skipped"), right: list.filter(r => r.aim === 1).length };
}

// ---------- 시트: 릴스 → 커버·미끼 → 조준 ----------
const meter = n => "●".repeat(n) + "○".repeat(3 - n);
const coverImg = id => `<img class="cover" src="covers/${id}.jpg" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
// 추천 세트 카드: 실제 커버 + 전략 이름·설명 + 부르는 물고기·떼 크기·무는 비율·금색 + 묶인 릴스·훅·미끼
function setCardHTML(st, i) {
  const topic = TOPICS.find(t => t.id === st.topic), fx = cardEffects(topic), sp = SPECIES[topic.target], m = MAGNETS.find(x => x.id === st.magnet), tx = T("sets")[st.id];
  return `<button class="setc" data-i="${i}" style="--bg:${CARD_BG[topic.id]}" aria-label="${tx.name}. ${tx.desc}">
    <span class="thumb"><span class="art">${ART[topic.id]}</span>${coverImg(topic.id)}</span>
    <span class="body">
      <b>${tx.name}</b><span class="desc">${tx.desc}</span>
      <span class="fx">
        <span class="who"><i class="dot" style="background:var(--${topic.target})"></i>${L(sp)}</span>
        <span>${T("fxSchool")} <b>${meter(fx.school)}</b></span>
        <span>${T("fxBite")} <b>${meter(fx.bite)}</b></span>
        <span>${T("fxGold")} <b>${meter(baitEffect(m))}</b></span>
      </span>
      <small class="mix">${T("setMix")(L(topic), L(topic.hooks[st.hook]), T("baits")[st.magnet])}</small>
    </span>
  </button>`;
}
function renderReel() {
  S.stage = "reel"; SFX.setScene("menu");
  coach(null); $("aimtag").hidden = true; $("arrive").hidden = true;
  $("sheet").hidden = false; $("sheet").className = "sheet"; $("sheet").scrollTop = 0; // 이전 화면에서 내려 둔 스크롤이 남지 않게
  $("sheetInner").innerHTML = `
    <h2 tabindex="-1" id="stepTitle">${T("setTitle")}</h2><p class="hint">${T("setHint")}</p>
    <div class="sets">${SETS.map(setCardHTML).join("")}</div>`;
  document.querySelectorAll(".setc").forEach(b => b.addEventListener("click", () => {
    const st = SETS[Number(b.dataset.i)];
    S.set = st.id; S.pick = { topic: st.topic, hook: st.hook, magnet: st.magnet }; S.outing = [];
    goWalk();
  }));
  $("stepTitle").focus({ preventScroll: true });
}

function showResult(r, prev) {
  toastEl.classList.remove("on"); $("pull").hidden = true;
  $("sheet").hidden = false; $("sheet").className = "sheet result"; $("sheet").scrollTop = 0;
  const notes = [];
  const plan = visualPlan(r);
  const many = r.casts && r.casts.length > 1;
  if (many && r.right > 0 && r.right < r.casts.length) notes.push(T("nZoneMix")(r.right, r.casts.length));
  else notes.push(r.zone === null ? T("nZoneOpen") : (many ? r.right === r.casts.length : r.aim === 1) ? T("nZoneRight") : T("nZoneWrong"));
  notes.push(T("nHits")(r.hits, r.n));
  if (r.skipped) notes.push(T("nSkip")(r.skipped));
  if (r.reach > 30000 && r.conv < 0.012) notes.push(T("nBigGray")); else if (r.conv >= 0.02) notes.push(T("nSmallRich")); else notes.push(T("nMid"));
  if (r.hook.s >= 1.2) notes.push(T("nStrongHook")); else if (r.hook.s <= 0.8) notes.push(T("nWeakHook"));
  notes.push(plan.gold >= 3 ? T("nGoldMany") : plan.gold <= 0 ? T("nGoldNone") : "");
  if (prev) {
    const a = r.reach > prev.reach * 1.15 ? T("bigger") : r.reach < prev.reach * 0.85 ? T("smaller") : T("same");
    const b = r.conv > prev.conv * 1.15 ? T("higher") : r.conv < prev.conv * 0.85 ? T("lower") : T("same");
    const d = r.follows - prev.follows;
    notes.push(T("nCompare")(a, b, Math.abs(d) < prev.follows * 0.1 ? T("sameN") : d > 0 ? T("more")(d) : T("fewer")(-d)));
  } else notes.push(T("nTryOther"));
  const g = r.grade;
  // 실제 기록과 비교: 내가 실제로 고른 훅·미끼·노린 곳, 실제 결과
  const R = REAL[r.topic.id], same = ok => `<span class="${ok ? "same" : "diff"}">${ok ? T("same") : T("diff")}</span>`;
  const realHTML = `<div class="real-box">
      <h3>${T("realTitle")} <small>${T("realDate")(R.date)}</small></h3>
      <div class="lbl" style="font-size:12px;color:var(--muted)">${T("realMine")}</div>
      <ul class="real-choices">
        <li><span class="k">${T("realHook")}</span><span>“${L(r.topic.hooks[R.hook])}” ${same(r.hook === r.topic.hooks[R.hook])}</span></li>
        <li><span class="k">${T("realBait")}</span><span>${T("baits")[R.magnet]} ${same(r.magnet.id === R.magnet)}</span></li>
        <li><span class="k">${T("realZone")}</span><span>${T("zone")[r.topic.target]} ${same(r.zone === r.topic.target)}</span></li>
      </ul>
      ${many ? `<div class="lbl" style="font-size:12px;color:var(--muted)">${T("perCastAvg")}</div>` : ""}
      <div class="vs">
        <div><div class="lbl">${T("vsReach")}</div><div class="me">${fmt(r.reach)}</div><div class="real">${T("vsReal")} ${fmt(R.reach)}</div></div>
        <div><div class="lbl">${T("vsFollow")}</div><div class="me">${fmt(many ? r.avgFollows : r.follows)}</div><div class="real">${T("vsReal")} ${fmt(R.follows)}</div></div>
        <div><div class="lbl">${T("vsDm")}</div><div class="me">${fmt(r.dm)}</div><div class="real">${T("vsReal")} ${fmt(R.dm)}</div></div>
      </div>
      <div class="lbl" style="font-size:12.5px">${T("resConv")}: ${pct(r.conv)} <span class="grade ${g.id}">${L(g)}</span> · ${T("vsReal")} ${pct(R.follows / R.reach)} <span class="grade ${gradeOfConv(R.follows / R.reach).id}">${L(gradeOfConv(R.follows / R.reach))}</span></div>
      <p class="disclaimer">${T("realNote")}</p>
    </div>`;
  $("sheetInner").innerHTML = `
    <div class="result-big" tabindex="-1" id="resultTop"><span class="num">+${fmt(r.follows)}</span><span class="lbl">${many ? T("resOuting")(r.casts.length) : T("resFollow")}</span></div>
    ${many ? `<ul class="cast-lines">${r.casts.map((c, i) => `<li>${T("castLine")(i + 1, T("spotName")[c.zone || "open"], c.follows, c.hits, c.n)}</li>`).join("")}</ul>` : ""}
    ${realHTML}
    <ul class="notes">${notes.filter(Boolean).map(n => `<li>${n}</li>`).join("")}</ul>
    <div class="row-btns"><button class="ghost" id="toJournal">${T("seeJournal")}</button><button class="primary" id="again">${T("again")}</button></div>
    <div class="logline">${T("logline")(S.casts.length, r.seed)} · ${L(r.topic)} · “${L(r.hook)}” · ${T("baits")[r.magnet.id]} · ${r.zone ? T("zone")[r.zone] : T("open")}</div>
    <p class="disclaimer">${T("disclaimer")}</p>`;
  $("again").addEventListener("click", () => { S.pick = {}; renderReel(); });
  $("toJournal").addEventListener("click", openJournal);
  $("resultTop").focus({ preventScroll: true });
  $("sr").textContent = T("srResult")(r);
  measureSheet(); // ResizeObserver가 늦게 와도 어항이 팝업에 가리지 않게
}

// 조황 일지
let journalOpener = null;
function openJournal() {
  journalOpener = document.activeElement;
  $("jList").innerHTML = S.casts.length ? S.casts.map((r, i) => `
    <div class="entry"><div class="t">${T("logline")(i + 1, r.seed)} · ${L(r.topic)}</div>
    <div class="m">“${L(r.hook)}” · ${T("baits")[r.magnet.id]} · ${r.zone ? T("zone")[r.zone] : T("open")}</div>
    <div class="m">${T("entry")(r)}</div></div>`).reverse().join("") : `<p class="disclaimer">${T("empty")}</p>`;
  $("journal").hidden = false; $("jClose").focus();
}
function closeJournal() { $("journal").hidden = true; if (journalOpener) journalOpener.focus(); }
$("btnJournal").addEventListener("click", openJournal);
$("jClose").addEventListener("click", closeJournal);
$("journal").addEventListener("click", e => { if (e.target.id === "journal") closeJournal(); });
$("journal").addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); closeJournal(); } if (e.key === "Tab") { e.preventDefault(); $("jClose").focus(); } });
$("btnSkip").addEventListener("click", finishCast);
$("recastBtn").addEventListener("click", recast); $("moveBtn").addEventListener("click", standUp);
$("sitBtn").addEventListener("click", () => sitAt(S.near));

function begin(lang) { SFX.init(); SFX.startAmbience(); S.lang = lang; applyText(); $("start").hidden = true; renderReel(); }
// 누르거나 키를 칠 때마다 오디오가 잠들어 있으면 깨운다
addEventListener("pointerdown", () => SFX.init(), { capture: true, passive: true });
addEventListener("keydown", () => SFX.init(), { capture: true });
$("btnSound").addEventListener("click", () => { SFX.init(); SFX.on = !SFX.on; $("btnSound").setAttribute("aria-pressed", String(SFX.on)); applyText(); });
$("startKo").addEventListener("click", () => begin("ko"));
$("startEn").addEventListener("click", () => begin("en"));
$("btnLang").addEventListener("click", () => {
  S.lang = S.lang === "ko" ? "en" : "ko"; applyText();
  if (S.stage === "reel") renderReel();
  else if (S.stage === "walk") { showWalkCoach(); showArrive(); }
  else if (S.stage === "between") showBetween(S.outing[S.outing.length - 1]);
  else if (S.stage === "cast" && !(cast && cast.bite && (cast.bite.phase === "reel" || cast.bite.phase === "lift"))) coach(T("fishCoach"), T("fishKeys"));
  else if (S.stage === "result") showResult(S.casts[S.casts.length - 1], S.casts[S.casts.length - 2]);
});

// ---------- 입력: 걷기(방향키·화면 끌기) · 챔질(탭) · 버티기(방향) ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let lastTap = 0, usedKeys = false;
// 버티는 방향: 화살표 키를 누르고 있거나, 화면을 그쪽으로 끌고 있는 동안
let holdDir = null, dragStart = null;
const KEY_DIR = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "U", ArrowDown: "D" };
const ARROW = { L: "←", R: "→", U: "↑", D: "↓" }, ARROW_NAME = { L: "←", R: "→", U: "↑", D: "↓" };
const NUDGE = { L: [-10, 0], R: [10, 0], U: [0, -10], D: [0, 10] };
canvas.addEventListener("pointerdown", e => {
  if (S.stage === "between" && e.button === 0) standUp(); // 휴대폰: 사이 안내 중 화면을 끌면 일어나서 걷기
  if (S.stage === "walk") { if (e.button !== 0 || dragStart) return; e.preventDefault(); dragStart = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch {} showStick(e.clientX, e.clientY, 0, 0); } // 이미 뗀 손가락이면 고정은 건너뜀
  else if (S.stage === "cast") {
    e.preventDefault();
    if (e.button !== 0) return; // 오른쪽·가운데 버튼은 무시
    // 여러 손가락을 동시에 대도 한 번만 (번갈아 두 손가락 연타는 허용)
    const now = performance.now(); if (now - lastTap < 45) return; lastTap = now;
    usedKeys = false; dragStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    gameTap();
  }
});
canvas.addEventListener("pointermove", e => {
  if (!dragStart || e.pointerId !== dragStart.id) return;
  if (S.stage === "walk") { // 화면 끌기 = 조이스틱 (60px 끌면 최고 속도)
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y, n = Math.hypot(dx, dy);
    stick = n < 10 ? null : { x: dx / Math.max(60, n), y: dy / Math.max(60, n) };
    showStick(dragStart.x, dragStart.y, dx / Math.max(1, n) * Math.min(n, 44), dy / Math.max(1, n) * Math.min(n, 44));
    return;
  }
  if (S.stage !== "cast") return;
  const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
  if (Math.hypot(dx, dy) < 22) return;
  holdDir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "L" : "R") : (dy < 0 ? "U" : "D");
});
const endDrag = e => { if (dragStart && e.pointerId === dragStart.id) { dragStart = null; holdDir = null; stick = null; $("stick").hidden = true; } };
function showStick(x, y, kx, ky) { const el = $("stick"); el.hidden = false; el.style.left = x + "px"; el.style.top = y + "px"; el.style.setProperty("--kx", kx + "px"); el.style.setProperty("--ky", ky + "px"); }
const WALK_KEY = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "U", ArrowDown: "D", a: "L", d: "R", w: "U", s: "D", A: "L", D: "R", W: "U", S: "D" };
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
addEventListener("keyup", e => { if (KEY_DIR[e.key] && holdDir === KEY_DIR[e.key]) holdDir = null; if (WALK_KEY[e.key]) keysDown.delete(WALK_KEY[e.key]); });
addEventListener("blur", () => keysDown.clear());
addEventListener("keydown", e => {
  if (!$("journal").hidden) return;
  if (e.target.closest && e.target.closest("button, input, select, textarea, .lil-gui")) return; // 버튼을 Enter로 누를 때 게임 입력이 겹치지 않게
  if (S.stage === "between") {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); usedKeys = true; recast(); return; }
    if (WALK_KEY[e.key]) { e.preventDefault(); standUp(); keysDown.add(WALK_KEY[e.key]); return; }
  }
  if (S.stage === "walk") {
    if (WALK_KEY[e.key]) { e.preventDefault(); keysDown.add(WALK_KEY[e.key]); }
    if ((e.key === "Enter" || e.key === " ") && S.near) { e.preventDefault(); usedKeys = true; sitAt(S.near); }
  } else if (S.stage === "cast" && KEY_DIR[e.key]) { e.preventDefault(); holdDir = KEY_DIR[e.key]; usedKeys = true; }
  else if (S.stage === "cast" && (e.key === " " || e.key === "Enter")) { e.preventDefault(); if (!e.repeat) { usedKeys = true; gameTap(); } } // 꾹 누르기는 연타로 치지 않음
});

// 조정 패널 (숨김 기본)
const gui = new GUI({ title: "PARAMS · next cast" }); gui.hide();
gui.add(PARAMS, "baseReach", 500, 8000, 100);
const fm = gui.addFolder("formatMult"); for (const k of Object.keys(PARAMS.formatMult)) fm.add(PARAMS.formatMult, k, 0.5, 30, 0.1);
gui.add(PARAMS, "baseConv", 0.001, 0.02, 0.0005);
gui.add(PARAMS, "practicalConv", 1, 4, 0.1);
gui.add(PARAMS, "convCap", 0.01, 0.06, 0.001);
gui.add(AIM, "mismatch", 0.1, 1, 0.05).name("aim · wrong zone");
gui.add(AIM, "open", 0.1, 1, 0.05).name("aim · open water");
gui.add(PARAMS, "reachLuck", 0, 0.6, 0.01);
gui.add(PARAMS, "convLuck", 0, 0.4, 0.01);
gui.add(PARAMS, "dmBase", 0, 0.02, 0.0005);
gui.add(PARAMS, "dmScale", 0, 0.08, 0.001);
gui.add(S, "fixedSeed").name("fixed seed");
gui.add(S, "seed", 1, 99999999, 1).name("seed");
$("btnTune").addEventListener("click", () => gui._hidden ? gui.show() : gui.hide());

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let simTime = 0, paused = false;
function update(dt) {
  simTime += dt;
  const time = simTime;
  waterMat.uniforms.uTime.value = time;
  island.update(dt, time);
  if (S.stage === "walk") walkStep(dt);
  otter.group.position.copy(OT.pos); otter.group.rotation.y = OT.face;
  otter.update(dt, { speed: OT.speed, seated: OT.seated, time });
  if (!REDUCED) updateReeds(time);

  updateGulls(REDUCED ? 0 : time, S.stage !== "walk");
  const sp = sprayGeo.attributes.position, sc = sprayGeo.attributes.color;
  for (let i = 0; i < SPRAY; i++) {
    const d = drops[i];
    if (d.life > 0) { d.life -= dt; d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < 0) d.life = 0; sp.setXYZ(i, d.p.x, d.p.y, d.p.z); sc.setXYZ(i, d.c.r, d.c.g, d.c.b); }
    else sp.setXYZ(i, 0, -50, 0);
  }
  sp.needsUpdate = sc.needsUpdate = true;
  for (const r of rings) {
    if (r.t < 0) continue;
    r.t += dt; const u = (r.t - r.delay) / 1.6;
    if (u < 0) { r.m.material.opacity = 0; continue; }
    if (u > 1) { r.t = -1; r.m.material.opacity = 0; continue; }
    r.m.scale.setScalar(0.3 + r.max * (1 - Math.pow(1 - u, 3))); r.m.material.opacity = 0.75 * (1 - u);
    r.m.position.set(bobber.position.x, 0.06, bobber.position.z);
  }
  // 걷는 동안 앞바다 구역을 은은히, 가까운 자리의 구역은 또렷하게
  for (const [k, m] of Object.entries(zoneRings)) {
    const want = S.stage !== "walk" ? 0 : k === S.near ? 0.9 : 0.3 + 0.12 * Math.sin(time * 3);
    m.material.opacity += (want - m.material.opacity) * Math.min(1, dt * 6);
  }

  let pull = null; // 낚싯대를 휘게 하는 점
  if (cast) {
    cast.t += dt;
    const b = cast.bite;
    if (cast.phase === "throw") {
      const u = REDUCED ? 1 : Math.min(1, cast.t / 0.95);
      arcPoint(u, cast.L, bobber.position);
      if (u >= 1) land();
    } else {
      if (cast.phase === "fish") {
        if (cast.rethrow) {
          // 끌려온 찌를 다시 던진다
          const rt = cast.rethrow; rt.t += dt;
          const u = REDUCED ? 1 : Math.min(1, rt.t / 0.45);
          bobber.position.lerpVectors(rt.from, cast.L, u); bobber.position.y = BOBBER_Y + Math.sin(Math.PI * u) * 3;
          if (u >= 1) { cast.rethrow = null; bobber.position.set(cast.L.x, BOBBER_Y, cast.L.z); splash(1.6); SFX.plop(); }
        } else if (!b && cast.ev < cast.n && cast.t >= cast.nextBiteAt) startNibble();
        if (b && b.phase === "tease" && cast.t >= b.nextTwitch) {
          if (b.teases > 0) { b.teases--; b.nextTwitch = cast.t + 0.35 + Math.random() * 0.4; cast.twitch = 1; SFX.nibble(); burst(_p4.copy(bobber.position).setY(0.1), 0xe8ffff, 4, 0.35); }
          else dunk();
        }
        if (b && b.phase === "window") {
          const p = 1 - (cast.t - b.t0) / b.win;
          $("bite").style.setProperty("--p", Math.max(0, p).toFixed(3));
          if (p <= 0) missBite();
        }
        if (b && b.phase === "reel") {
          const n = cast.presses; cast.presses = 0;
          if (n) { SFX.reel(b.st.p); cast.spool += n * 70; retrigger($("reelCue"), "tap"); rod.handle.rotation.x += n * 1.2; }
          b.st = reelStep(b.st, dt, n, b.gold ? "gold" : "orbit", REDUCED, holdDir);
          const R = REEL[b.gold ? "gold" : "orbit"], el = $("reel"), st = b.st;
          el.style.setProperty("--p", st.p.toFixed(3));
          $("reelFill").style.setProperty("--p", st.p.toFixed(3));
          $("tension").style.setProperty("--k", st.tension.toFixed(3));
          $("reelTime").style.setProperty("--t", Math.max(0, 1 - st.t / (R.limit * (REDUCED ? 1.6 : 1))).toFixed(3));
          $("spool").style.setProperty("--rot", cast.spool + "deg");
          el.classList.toggle("run", st.running); el.classList.toggle("danger", st.tension > 0.7);
          $("reelWarn").textContent = st.tension > 0.7 ? T("lineTense") : st.running && !st.held ? T("reelRun") : "";
          // 버티기 신호: 차고 나가면 화살표, 맞게 버티면 초록
          const pl = $("pull");
          pl.hidden = !st.running;
          if (st.running) {
            $("pullArrow").textContent = ARROW[st.run]; $("pullWord").textContent = st.held ? T("pullOk") : T("pullWord")[st.run];
            pl.classList.toggle("ok", st.held);
            const nv = NUDGE[st.run]; pl.style.setProperty("--nx", nv[0] + "px"); pl.style.setProperty("--ny", nv[1] + "px");
          }
          if (st.running && !b.wasRun) { SFX.runStart(); impact(null, { shake: 0.14, buzz: 30 }); $("sr").textContent = `${T("pullWord")[st.run]} ${ARROW_NAME[st.run]}`; }
          if (st.held && !b.wasHeld) SFX.holdOk();
          SFX.setTension(st.tension); // 줄이 팽팽할수록 삐걱 소리가 크고 높게
          b.wasRun = st.running; b.wasHeld = st.held;
          // 낚싯대: 누른 방향으로 기울이고, 팽팽할수록 휘고 떨린다
          rod.yaw = yawToward(cast.L) + (holdDir === "L" ? 0.32 : holdDir === "R" ? -0.32 : 0);
          rod.lift = 0.1 + 0.25 * st.p + (holdDir === "U" ? 0.3 : holdDir === "D" ? -0.22 : 0);
          rod.bend = 0.45 + 0.5 * st.tension; rod.jit = 0.02 + 0.08 * st.tension;
          if (st.out === "landed") landFish(); else if (st.out === "snapped") snapFish(); else if (st.out === "escaped") escapeFish();
        }
        if (cast.ev >= cast.n && !cast.bite && !cast.rethrow) { cast.endWait += dt; if (cast.endWait > 0.5) finishCast(); }
      }
      // 찌: 기다릴 땐 살랑, 톡톡엔 살짝, 진짜 입질엔 물속으로 쑥
      cast.twitch = (cast.twitch || 0) * Math.exp(-dt * 7);
      const bb = cast.bite;
      if (!cast.rethrow && (!bb || bb.phase === "approach" || bb.phase === "tease" || bb.phase === "window")) {
        const sunk = bb && bb.phase === "window";
        bobber.position.set(cast.L.x, BOBBER_Y + Math.sin(time * 2.2) * 0.05 - cast.twitch * (0.12 + 0.1 * Math.sin(time * 40)) - (sunk ? 0.55 + Math.sin(time * 30) * 0.06 : 0), cast.L.z);
      }
      const L0 = cast.L;
      let anyOn = false;
      for (let i = 0; i < MAX; i++) {
        const f = fish[i];
        if (!f.on) continue;
        anyOn = true;
        if (f.state === "hooked" && bb && bb.i === i) {
          // 연타 중: 감은 만큼 물가로 끌려오면서 좌우로 몸부림
          const u = bb.st.p, e = u * u * (3 - 2 * u);
          const LANDING = cast.landing;
          const pt = _p1.lerpVectors(L0, LANDING, e);
          const side = _p3.set(-(LANDING.z - L0.z), 0, LANDING.x - L0.x).normalize();
          const amp = 1.0 * (1 - 0.55 * u);
          pt.addScaledVector(side, Math.sin(time * 6.5) * amp);
          pt.y = -0.16 + Math.sin(time * 13) * 0.14; // 가끔 수면을 깨고 보이게
          // 차고 나가는 중: ←를 누르라면 물고기는 오른쪽으로, ↑는 깊이 파고들고, ↓는 물 위로 뛰어오른다 (잘 버티면 덜 간다)
          const run = bb.st.run, k = bb.st.held ? 0.45 : 1;
          const want = _p5.set(0, 0, 0);
          if (run === "L") want.addScaledVector(side, -2.6 * k); else if (run === "R") want.addScaledVector(side, 2.6 * k);
          else if (run === "U") want.y = -1.4 * k; else if (run === "D") want.y = (0.5 + 1.1 * Math.abs(Math.sin(time * 4.2))) * k;
          bb.off.lerp(want, Math.min(1, dt * 5));
          pt.add(bb.off);
          if (run === "D" && !REDUCED && Math.sin(time * 4.2) * Math.sin((time - dt) * 4.2) < 0) { burst(_p4.copy(pt).setY(0.1), 0xe8ffff, 12, 0.8); SFX.jump(); }
          f.pos.lerp(pt, Math.min(1, dt * 10));
          const dir = _p2.subVectors(L0, LANDING).normalize().addScaledVector(side, Math.cos(time * 6.5) * 1.2);
          writeFish(bodies, tails, i, f.pos, dir, f.scale, Math.sin(time * 34) * 0.7);
          bobber.position.set(f.pos.x, BOBBER_Y - 0.05 + Math.sin(time * 17) * 0.06, f.pos.z);
          if (cast.t > bb.splashAt) { bb.splashAt = cast.t + (bb.st.running ? 0.18 : 0.34); burst(_p4.set(f.pos.x, 0.1, f.pos.z), bb.gold ? 0xffe9a0 : 0xe8ffff, bb.st.running ? 9 : 5, 0.7); }
          continue;
        }
        if (f.state === "lift" && bb && bb.i === i) {
          // 물 밖으로 휙 → 매달려 파닥 → 낚싯대를 돌려 어항에 쏙
          const k = cast.t - bb.t0;
          hangPoint(time, HANG);
          if (k < 0.35) {
            const u = 1 - Math.pow(1 - k / 0.35, 3);
            f.pos.lerpVectors(f.from, HANG, u); f.pos.y += Math.sin(Math.PI * u) * 1.5;
            writeFish(bodies, tails, i, f.pos, _p2.set(0.2, 1, 0.1), f.scale * 1.15, Math.sin(time * 40) * 0.8);
          } else if (k < 1.25) {
            if (!bb.shown) { bb.shown = true; showCatch(bb); pow(bb.gold ? T("powGold") : T("powLand"), HANG, bb.gold, 60); }
            f.pos.copy(HANG);
            writeFish(bodies, tails, i, f.pos, _p2.set(Math.sin(time * 9) * 0.5, 1, Math.cos(time * 7) * 0.3), f.scale * 1.15, Math.sin(time * 22) * 0.75);
          } else if (k < 1.8) {
            if (!bb.stow) { bb.stow = true; bb.from2 = f.pos.clone(); rod.yaw = yawToward(TANK); rod.lift = 0.35; rod.bend = 0; cast.cam = "stow"; }
            const u = Math.min(1, (k - 1.25) / 0.55);
            _p4.set(TANK.x, TANK.y - 0.1, TANK.z);
            f.pos.lerpVectors(bb.from2, _p4, u); f.pos.y += Math.sin(Math.PI * u) * 1.6;
            writeFish(bodies, tails, i, f.pos, _p2.subVectors(_p4, bb.from2).setY(Math.cos(Math.PI * u) * 3), f.scale, Math.sin(time * 26) * 0.6);
          } else {
            hideFish(i);
            addToTank(f.color); // 건진 한 마리 = 어항에 한 마리 (종류는 색으로)
            burst(_p4.copy(TANK).setY(TANK.y + 0.6), 0xd8fbff, 14, 0.6); SFX.drop();
            bobber.position.copy(ROD_TIP).y -= 1.2;
            endBite(true);
          }
          continue;
        }
        if (cast.t < f.delay) { bodies.setMatrixAt(i, ZERO); tails.setMatrixAt(i, ZERO); continue; }
        if (f.state === "orbit") target.set(L0.x + Math.cos(time * f.orbitW + f.phase) * f.orbitR, f.orbitY + Math.sin(time * 0.9 + f.phase) * 0.3, L0.z + Math.sin(time * f.orbitW + f.phase) * f.orbitR);
        else if (f.state === "nibble") target.set(L0.x + 0.15, -0.45, L0.z + 0.1);
        else target.copy(f.wp[f.wpi]);
        const toT = _d.subVectors(target, f.pos), dist = toT.length();
        if (f.state === "pass") {
          if (dist < 2 && f.wpi < f.wp.length - 1) f.wpi++;
          else if (dist < 2) { hideFish(i); continue; }
        } else if (f.state === "approach" && Math.hypot(f.pos.x - L0.x, f.pos.z - L0.z) < 3.4) f.state = "orbit";
        else if (f.state === "flee" && dist < 3) { hideFish(i); continue; }
        else if (f.state === "nibble" && dist < 0.55 && bb && bb.i === i && bb.phase === "approach") {
          SFX.setScene("tease"); bb.phase = "tease"; bb.nextTwitch = cast.t + 0.2 + Math.random() * 0.25;
        }
        const spd = f.state === "orbit" ? 2.6 + Math.abs(f.orbitW) * 1.2 : f.state === "nibble" ? 6 : f.speed;
        const desired = toT.normalize().multiplyScalar(spd);
        f.vel.lerp(desired, Math.min(1, dt * (f.state === "orbit" ? 3 : 1.7)));
        const side = _p3.set(-f.vel.z, 0, f.vel.x).normalize().multiplyScalar(Math.sin(time * 5 + f.phase) * 0.45);
        f.pos.addScaledVector(f.vel, dt).addScaledVector(side, dt);
        writeFish(bodies, tails, i, f.pos, f.vel, f.scale, Math.sin(time * (f.state === "flee" ? 22 : 12) + f.phase) * 0.45);
      }
      if (anyOn) bodies.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true; // 다 흩어진 뒤엔 올리지 않음
    }
    const bl = cast.bite;
    if (bl && bl.phase === "lift") {
      const f = fish[bl.i];
      if (!bl.stow) { pull = f.pos; updateLine(0, f.pos, 0.55 * f.scale); } else updateLine(0.05, _p4.copy(ROD_TIP).setY(ROD_TIP.y - 1.2), 0);
    } else {
      pull = bobber.position;
      const taut = bl && (bl.phase === "reel" || bl.phase === "window");
      updateLine(cast.phase === "throw" || cast.rethrow ? 0.2 : taut ? 0.01 : bl && bl.phase === "tease" ? 0.4 : 0.8);
    }
  }
  poseRod(dt, time, pull);

  for (let i = 0; i < tankFish.length; i++) {
    const f = tankFish[i]; f.a += dt * f.sp;
    const pos = _p1.set(TANK.x + Math.cos(f.a) * f.r, TANK.y + f.y + Math.sin(time * 1.5 + f.ph) * 0.05, TANK.z + Math.sin(f.a) * f.r * 0.6);
    const dir = _p2.set(-Math.sin(f.a) * Math.sign(f.sp), 0, Math.cos(f.a) * 0.6 * Math.sign(f.sp));
    writeFish(tankBodies, tankTails, i, pos, dir, 0.34, Math.sin(time * 10 + f.ph) * 0.4);
  }
  if (tankFish.length) tankBodies.instanceMatrix.needsUpdate = tankTails.instanceMatrix.needsUpdate = true;

  placeCamera(dt, time);
}
// 수달 머리 위 말풍선: 화면 가장자리 밖으로 잘리지 않게 안쪽으로 붙인다 (휴대폰 세로 화면)
function placeBubble(el, x, y) { const hw = el.offsetWidth / 2 + 10; el.style.left = Math.min(innerWidth - hw, Math.max(hw, x)) + "px"; el.style.top = y + "px"; }
// 3D 위에 붙는 HTML 표시 위치 갱신
function placeOverlays() {
  const showLegend = S.stage === "walk" || S.stage === "cast" || S.stage === "between"; // 물고기 색 안내는 걷기·낚시 때만
  if ($("legend").hidden === showLegend) $("legend").hidden = !showLegend;
  // 자리 이름표: 화면 밖이면 가장자리에 붙이고 그쪽을 가리키는 화살표 (길 찾기 나침반)
  const showSpots = S.stage === "walk";
  if (showSpots && !labelW) labelW = {};
  for (const { el, k } of spotLabelEls) {
    if (!showSpots || k === S.near) { if (el.style.opacity !== "0") el.style.opacity = 0; continue; } // 도착한 자리는 머리 위 안내가 대신
    const sp = island.spots[k]; _sp.copy(sp.seat); _sp.y += 2.8; _sp.project(camera);
    let x = (_sp.x + 1) / 2 * innerWidth, y = (1 - _sp.y) / 2 * innerHeight;
    if (_sp.z > 1) { x = innerWidth - x; y = innerHeight; } // 카메라 뒤쪽이면 화면 아래로
    if (!labelW[k]) labelW[k] = el.offsetWidth || 120;
    const hx = labelW[k] / 2 + 10, top = 200, bottom = ($("coach").hidden ? innerHeight : $("coach").getBoundingClientRect().top) - 8; // 아래 안내 문구와 겹치지 않게
    const cx = Math.min(innerWidth - hx, Math.max(hx, x)), cy = Math.min(bottom, Math.max(top, y));
    const edge = Math.abs(cx - x) > 1 || Math.abs(cy - y) > 1;
    el.classList.toggle("edge", edge);
    if (edge) el.style.setProperty("--ang", Math.atan2(y - cy, x - cx) + "rad");
    el.style.left = cx + "px"; el.style.top = cy + "px"; el.style.opacity = 0.92;
  }
  if (S.stage === "between") { const s = toScreen(_p4.copy(OT.pos).setY(OT.pos.y + 2.4)); placeBubble($("between"), s.x, Math.max(230, s.y)); }
  if (S.stage === "walk" && S.near) { const s = toScreen(_p4.copy(OT.pos).setY(OT.pos.y + 2.3)); placeBubble($("arrive"), s.x, Math.max(230, s.y)); }
  if (cast && cast.bite && cast.bite.phase === "window") { const s = toScreen(bobber.position); const el = $("bite"); el.style.left = s.x + "px"; el.style.top = s.y + "px"; }
}
function tick() {
  const d = Math.min(clock.getDelta(), 0.1); // 느린 기기(10fps)까지는 제한 시간이 실제 시간과 같게. 탭을 떠났다 오면 큰 값은 잘라냄
  if (!paused && $("journal").hidden) { // 일지를 연 동안은 멈춤 (입질 시간도 그대로)
    if (FX.stop > 0) FX.stop -= d; else update(d); // 손맛: 맞는 순간 아주 잠깐 멈춤
  }
  let sx = 0, sy = 0;
  if (FX.shake > 0.004) { sx = (Math.random() - 0.5) * FX.shake; sy = (Math.random() - 0.5) * FX.shake; camera.position.x += sx; camera.position.y += sy; FX.shake *= Math.exp(-d * 9); }
  renderer.render(scene, camera);
  camera.position.x -= sx; camera.position.y -= sy;
  placeOverlays();
  requestAnimationFrame(tick);
}
applyText();
updateReeds(0); updateGulls(0, true);
requestAnimationFrame(tick);

// 테스트용 훅 (화면 확인 자동화에서 사용)
window.__game = {
  S, OT, island, get cast() { return cast; }, finishCast, castTo, hook, gameTap, goWalk, sitAt, recast, standUp, FX, scene, camera, SFX,
  pause(v) { paused = v; },
  advance(sec) { for (let i = 0; i < Math.round(sec * 60); i++) update(1 / 60); renderer.render(scene, camera); placeOverlays(); }
};
