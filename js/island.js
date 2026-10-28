// 섬: 가운데 마을 광장에서 네 갈래 흙길이 네 낚시 자리(갯바위 곶·해초 숲 잔교·모래톱 해변·방파제 끝)로 이어진다
// 높이·걷기 판정·소품 배치는 Three.js 없이 계산하고(planIsland), buildIsland가 그걸로 메시를 만든다
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
import { ZONES, OPEN_SPOT } from "../sim.js";
import { mulberry, vnoise, segDist, ZCOLOR, REDUCED } from "./util.js";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 축 정렬 상자까지 거리 (안쪽은 음수)
function sdBox(px, pz, hx, hz) {
  const qx = Math.abs(px) - hx, qz = Math.abs(pz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

// ---------- 자리 좌표계: 앉는 자리 기준 u = 오른쪽, v = 앞(과녁 쪽) ----------
// 과녁에서 (ox,oz) 쪽으로 dist만큼 물러난 곳이 자리
function frame(t, dist, ox = 0, oz = 0) {
  let fx = t.x - ox, fz = t.z - oz; const l = Math.hypot(fx, fz); fx /= l; fz /= l;
  return { sx: t.x - fx * dist, sz: t.z - fz * dist, fx, fz, rx: -fz, rz: fx, tx: t.x, tz: t.z };
}
const loc = (F, x, z) => { const dx = x - F.sx, dz = z - F.sz; return { u: dx * F.rx + dz * F.rz, v: dx * F.fx + dz * F.fz }; };
const wpt = (F, u, v) => [F.sx + F.rx * u + F.fx * v, F.sz + F.rz * u + F.fz * v];
const FM = frame(ZONES.marketer, 8), FC = frame(ZONES.creator, 8), FB = frame(ZONES.beginner, 8), FO = frame(OPEN_SPOT, 8, 2, 0);
const FR = { marketer: FM, creator: FC, beginner: FB, open: FO };
// 어항 받침(3.5×2.1): 자리 왼쪽 2.4, 조금 뒤
const TANK_U = -2.4, TANK_V = -0.9, TANK_HU = 1.75, TANK_HV = 1.05;

const PLAZA_Y = 1.45, BEACH_Y = 0.42, DECK_Y = 0.7, BW_Y = 0.6;
// 잔교 끝 판(자리 좌표), 잔교 길 가운데 u
const PL = { u0: -4.7, u1: 1.6, v0: -5.2, v1: 0.55 }, WALK_U = -1.55, WALK_W = 0.9;
// 방파제 끝 판(월드 좌표)과 팔(x 0.7..3.3)
const BW = { x0: -4.8, x1: 4.4, z0: FO.sz - 0.55, z1: -24, ax0: 0.7, ax1: 3.3 };
const LIGHT = [-3.7, -26.3]; // 등대: 자리 왼쪽 뒤 (자리→과녁 줄을 가리지 않게)

// ---------- 지형 ----------
// 바다 밑: 기본 -6, 멀리 갈수록 천천히 깊어짐(-12까지). 모래톱 언덕(-1.0)·암초 둔덕(-3.8)
function seabed(x, z) {
  const n = vnoise(x * 0.12, z * 0.12) + 0.5 * vnoise(x * 0.3, z * 0.3);
  let y = Math.max(-12, Math.max(-11.5, -6 - Math.max(0, Math.hypot(x, z) - 24) * 0.12) + n * 0.35);
  const zb = ZONES.beginner, sb = Math.hypot(x - zb.x, (z - zb.z) * 1.3) / (zb.r * 1.9);
  if (sb < 1) { const t = 1 - sb, k = t * t * (3 - 2 * t); y = Math.max(y, Math.min(-1.0, -6 + 6.2 * k) + n * 0.12); }
  const zm = ZONES.marketer, rb = Math.hypot(x - zm.x, z - zm.z) / (zm.r * 1.4);
  if (rb < 1) y = Math.max(y, -6 + 2.2 * (1 - rb * rb) + n * 0.5);
  return y;
}
// 본섬: 반지름 약 13~15의 울퉁불퉁한 해안선, 동쪽 잔교 자리는 만(灣)으로 파였다
const TC = Math.atan2(FC.fz, FC.fx);
function coastR(a) {
  let da = a - TC; da = Math.atan2(Math.sin(da), Math.cos(da));
  return 14.0 + Math.sin(3 * a + 0.7) + 0.6 * Math.sin(5 * a + 2.1) + 0.4 * Math.sin(8 * a + 4) +
    0.5 * vnoise(Math.cos(a) * 2.2 + 7, Math.sin(a) * 2.2) - 2.8 * Math.exp(-((da / 0.33) ** 2));
}
function mainLand(x, z) {
  const r = Math.hypot(x, z); if (r > 29) return -99;
  const d = coastR(Math.atan2(z, x)) - r; // 양수 = 뭍
  if (d < 0) return 0.35 + d * 1.1;
  return 0.35 + 1.45 * sstep(0, 4.5, d) + 0.4 * vnoise(x * 0.16 + 3, z * 0.16 - 5) * sstep(1.5, 4, d);
}
// 남쪽 모래톱 해변: 넓은 타원, 아주 완만하게 얕은 물로 이어진다
const beachD = (x, z) => (1 - Math.hypot(x / 9.5, (z - 13.8) / 6.7)) * 6.7;
// 물가에서 한 번 내려가(-0.55) 그다음은 아주 완만하게 모래톱까지
function beachLand(x, z) { const d = beachD(x, z); return d >= 0 ? 0.35 + Math.min(d, 4) * 0.1 : d > -0.9 ? 0.35 + d : -0.55 + (d + 0.9) * 0.45; }
// 북서쪽 갯바위 곶: 섬에서 암초 쪽으로 뻗은 바위 등성이 + 끝의 넓은 머리(높이 2), 사방이 절벽
function capeSD(c) {
  const qx = Math.abs(c.u + 1.5) - 2.5, qz = Math.abs(c.v + 2.7) - 2.3; // 둥근 상자 u -5..2, v -6..0.6 (모서리 1)
  const db = -(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 1);
  return Math.max(db, 3.2 - segDist(c.u, c.v, 0, -14.5, 0, -3));
}
function capeLand(x, z) {
  const c = loc(FM, x, z);
  if (c.u < -7.6 || c.u > 6 || c.v > 3.2 || c.v < -20.5) return -99;
  const d = capeSD(c);
  let top = c.v > -6 ? 2.0 : 1.15 + 0.85 * sstep(-14.5, -6, c.v);
  top += 0.14 * vnoise(x * 0.6, z * 0.6) * sstep(-5.5, -7.5, c.v);
  return d >= 0 ? top : top + d * 7;
}
function groundH(x, z) {
  let y = Math.max(seabed(x, z), mainLand(x, z), beachLand(x, z), capeLand(x, z));
  const r = Math.hypot(x, z);
  if (r < 6.5) y += (PLAZA_Y - y) * (1 - sstep(4, 6.5, r)); // 광장은 평평하게
  const b = loc(FB, x, z), bd = sdBox(b.u + 1.7, b.v + 1.05, 3.1, 1.35);
  if (bd < 0.6) y += (BEACH_Y - y) * (1 - sstep(0, 0.6, bd)); // 해변 자리·어항 받침 평평하게
  return y;
}
// 바위 곶·해변이 이 지점의 땅을 만들고 있는지 (색·나무 배치용)
const onCape = (x, z) => { const c = capeLand(x, z); return c > -0.5 && c >= mainLand(x, z) - 0.02; };
const onBeach = (x, z) => { const b = beachLand(x, z); return b > -0.6 && b >= mainLand(x, z) - 0.02; };

// ---------- 길 ----------
function spline(pts, per = 10) { // 캣멀롬 곡선으로 굽은 길
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t, c = j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function pathDistIn(P, x, z, max = 6) {
  let d = max;
  for (const p of P) {
    if (x < p.x0 - d || x > p.x1 + d || z < p.z0 - d || z > p.z1 + d) continue;
    const s = p.s;
    for (let i = 0; i < s.length - 1; i++) { const q = segDist(x, z, s[i][0], s[i][1], s[i + 1][0], s[i + 1][1]); if (q < d) d = q; }
  }
  return d;
}

// ---------- 배치 계획 (Three.js 없이) ----------
let PLAN = null;
function planIsland() {
  if (PLAN) return PLAN;
  // 잔교 길이: 판 뒤에서 뭍 쪽으로 가다 땅이 갑판 높이가 되는 곳까지
  let pierL = 8;
  for (let v = PL.v0; v > -24; v -= 0.1) { const [x, z] = wpt(FC, WALK_U, v); if (groundH(x, z) >= DECK_Y - 0.02) { pierL = -v + 0.5; break; } }
  // 방파제 뿌리: 북쪽 해안에서 땅이 방파제 높이가 되는 곳
  let rootZ = -13;
  for (let z = BW.z1; z < -4; z += 0.1) if (groundH(2, z) >= BW_Y - 0.02) { rootZ = z + 0.5; break; }
  const pierStart = wpt(FC, WALK_U, -pierL);

  // 갑판(잔교·방파제) 윗면 높이, 아니면 null
  const deckAt = (x, z) => {
    const c = loc(FC, x, z);
    if ((c.u >= PL.u0 && c.u <= PL.u1 && c.v >= PL.v0 && c.v <= PL.v1) || (Math.abs(c.u - WALK_U) <= WALK_W && c.v >= -pierL && c.v <= PL.v0)) return DECK_Y;
    if (x >= BW.x0 && x <= BW.x1 && z >= BW.z0 && z <= BW.z1) return BW_Y;
    if (x >= BW.ax0 && x <= BW.ax1 && z >= BW.z1 && z <= rootZ) return BW_Y;
    return null;
  };

  // 길: 광장 → 각 자리
  const ctrl = {
    marketer: [[0, 0], [-3.0, -1.4], [-5.2, -1.9], [-7.0, -4.2], wpt(FM, 0.6, -13), wpt(FM, -0.4, -8.5), wpt(FM, 0, -3.2)],
    creator: [[0, 0], [3.4, 0.6], [6.0, -1.6], [8.4, -1.0], [pierStart[0] - FC.fx * 0.9, pierStart[1] - FC.fz * 0.9]],
    beginner: [[0, 0], [0.8, 3.2], [-1.4, 6.2], [0.9, 9.4], [-0.6, 12.8], [0, 17.0]],
    open: [[0, 0], [-0.6, -3.4], [1.4, -6.4], [0.6, -9.4], [2, rootZ + 0.8]]
  };
  const paths = {};
  for (const [k, pts] of Object.entries(ctrl)) {
    const s = spline(pts);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    paths[k] = { s, x0, x1, z0, z1 };
  }
  const P = Object.values(paths);
  const pathDist = (x, z, max) => pathDistIn(P, x, z, max);

  // 낚시 자리 주변 비워 둘 곳: 자리→과녁 줄, 뒤오른쪽 카메라 자리, 어항
  const clearOf = (F, x, z, pad = 0) => {
    const { u, v } = loc(F, x, z);
    if (u > -1.8 - pad && u < 1.8 + pad && v > -1 && v < 9.5) return false;
    if (Math.hypot(u - 1.7, v + 4) < 3.2 + pad || segDist(u, v, 0, 0, 1.7, -4) < 2 + pad) return false;
    if (u > TANK_U - TANK_HU - 0.6 - pad && u < TANK_U + TANK_HU + 0.6 + pad && v > TANK_V - TANK_HV - 0.6 - pad && v < TANK_V + TANK_HV + 0.6 + pad) return false;
    return true;
  };
  const clearAll = (x, z, pad) => clearOf(FM, x, z, pad) && clearOf(FC, x, z, pad) && clearOf(FB, x, z, pad) && clearOf(FO, x, z, pad);

  // 막힘(나무·바위·소품): 2칸 격자에 원으로
  const grid = new Map(), CELL = 2, key = (i, j) => (i + 500) * 1000 + j + 500;
  const addBlock = (x, z, r) => {
    const b = { x, z, r }, m = r + 1.2;
    for (let i = Math.floor((x - m) / CELL); i <= Math.floor((x + m) / CELL); i++)
      for (let j = Math.floor((z - m) / CELL); j <= Math.floor((z + m) / CELL); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
  };
  const blocked = (x, z, pad = 0) => {
    const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) return false;
    for (const b of l) if (Math.hypot(x - b.x, z - b.z) < b.r + pad) return true;
    return false;
  };

  const R = mulberry(77);
  const rocks = [], trees = [], wood = [], posts = [], lanterns = [], boats = [], shells = [], tetra = [], spray = [];
  const rock = (x, y, z, s, sy, block, moss) => { rocks.push({ x, y, z, s, sy, e: [R() * 6, R() * 6, R() * 6], c: moss ? 0x6f7f5e : [0x8d8882, 0x7a7672, 0x9a948c, 0x847c74][Math.floor(R() * 4)] }); if (block) addBlock(x, z, s * 0.85); };

  // 광장: 모닥불·텐트·통나무 의자·표지판
  const plaza = { fire: [0, -0.4], tent: [-2.53, 2.12], benches: [[-2.29, 0.2, 0.08], [1.7, -1.7, Math.PI / 4]], sign: [1.68, 1.57] };
  addBlock(0, -0.4, 0.75); addBlock(-2.53, 2.12, 1.25); addBlock(1.68, 1.57, 0.22);
  for (const [bx, bz, a] of plaza.benches) for (const t of [-0.5, 0, 0.5]) addBlock(bx + Math.sin(a) * t, bz + Math.cos(a) * t, 0.32);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; rock(Math.cos(a) * 0.62, PLAZA_Y, -0.4 + Math.sin(a) * 0.62, 0.17, 0.6, false); }
  plaza.arrows = ["marketer", "creator", "beginner", "open"].map(k => {
    const s = paths[k].s, p = s.find(q => Math.hypot(q[0], q[1]) > 5.5) || s[s.length - 1];
    return { k, a: Math.atan2(p[1] - plaza.sign[1], p[0] - plaza.sign[0]) };
  });

  // 1) 갯바위 곶: 바위 머리, 흩어진 바위, 바람에 누운 소나무
  for (let n = 0; n < 90 && rocks.length < 24; n++) {
    const u = -5 + R() * 7.2, v = -14 + R() * 14.3, [x, z] = wpt(FM, u, v);
    if (capeSD(loc(FM, x, z)) < 0.6 || pathDist(x, z, 3) < 1.5 || !clearOf(FM, x, z, 0.4) || blocked(x, z, 0.5)) continue;
    const s = 0.35 + R() * 0.5; rock(x, groundH(x, z) - 0.15 * s, z, s, 0.6 + R() * 0.3, true, R() < 0.25);
  }
  for (const [u, v] of [[-2.6, -6.6], [2.5, -9.5], [-2.5, -12.4]]) {
    const [x, z] = wpt(FM, u, v);
    trees.push({ x, y: groundH(x, z) - 0.05, z, s: 0.75 + R() * 0.2, pine: true, yaw: R() * 6, lean: { ax: FM.rx, az: FM.rz, a: 0.32 + R() * 0.12 } });
    addBlock(x, z, 0.5);
  }
  // 절벽 밑 물속 바위와 물보라 자리
  for (let a = 0; a < Math.PI * 2; a += 0.21) {
    const du = Math.cos(a), dv = Math.sin(a); if (dv < -0.45) continue;
    for (let t = 2; t < 12; t += 0.15) {
      const u = -1.5 + du * t, v = -2.7 + dv * t, [x, z] = wpt(FM, u, v);
      if (groundH(x, z) < -0.3) {
        if (clearOf(FM, x, z, 0.3)) { spray.push([x, z]); if (R() < 0.7) { const s = 0.5 + R() * 0.6; rock(x + du * 0.4, -0.55 - R() * 0.4, z + dv * 0.4, s, 0.7, false); } }
        break;
      }
    }
  }
  for (const v of [-8, -10.5, -13]) for (const sd of [-1, 1]) {
    for (let t = 2.5; t < 9; t += 0.15) { const [x, z] = wpt(FM, sd * t, v); if (groundH(x, z) < -0.3) { spray.push([x, z]); break; } }
  }

  // 2) 잔교: 판자 길 + 끝의 넓은 판, 기둥, 등불 둘, 매어 둔 쪽배
  const yawC = Math.atan2(FC.fx, FC.fz);
  const plank = (u, v, su, sv, y = DECK_Y - 0.06, sy = 0.12) => { const [x, z] = wpt(FC, u, v); wood.push({ x, y, z, sx: su, sy, sz: sv, yaw: yawC, c: [0x8a6440, 0x7d5a3a, 0x94704a][Math.floor(R() * 3)] }); };
  for (let v = PL.v0 - 0.17; v > -pierL; v -= 0.34) plank(WALK_U + (R() - 0.5) * 0.05, v, WALK_W * 2, 0.29);
  for (let v = PL.v0 + 0.17; v < PL.v1; v += 0.34) plank((PL.u0 + PL.u1) / 2, v, PL.u1 - PL.u0, 0.29);
  const walkMid = (-pierL + PL.v0) / 2, walkLen = pierL + PL.v0;
  for (const s of [-1, 1]) plank(WALK_U + s * 0.75, walkMid, 0.16, walkLen, DECK_Y - 0.2, 0.18);
  plank(PL.u0 + 0.08, (PL.v0 + PL.v1) / 2, 0.16, PL.v1 - PL.v0, DECK_Y - 0.2, 0.18);
  plank(PL.u1 - 0.08, (PL.v0 + PL.v1) / 2, 0.16, PL.v1 - PL.v0, DECK_Y - 0.2, 0.18);
  const post = (u, v, up = 0) => { const [x, z] = wpt(FC, u, v), b = groundH(x, z) - 0.3; if (b < DECK_Y - 0.4) posts.push({ x, z, y0: b, y1: DECK_Y - 0.02 + up }); };
  for (let v = PL.v0 - 0.2; v > -pierL + 0.5; v -= 2.0) for (const s of [-1, 1]) post(WALK_U + s * 0.85, v);
  for (const [u, v] of [[PL.u0, PL.v0], [PL.u0, PL.v1], [PL.u1, PL.v0], [PL.u1, PL.v1], [PL.u0, -2.3], [PL.u1, -2.3], [-1.55, PL.v1]]) post(u + (u < -1.55 ? 0.12 : u > -1.55 ? -0.12 : 0), v + (v > 0 ? -0.12 : 0.12), 0.22);
  for (const [u, v] of [[PL.u0 + 0.25, -2.9], [WALK_U - 0.8, walkMid], [WALK_U + 0.8, -pierL + 0.9]]) {
    const [x, z] = wpt(FC, u, v);
    if (!clearOf(FC, x, z, 0)) continue;
    lanterns.push({ x, z }); wood.push({ x, y: DECK_Y + 0.75, z, sx: 0.12, sy: 1.5, sz: 0.12, yaw: yawC, c: 0x5e4630 }); addBlock(x, z, 0.25);
  }
  for (const [u, v, a] of [[3.4, -7.2, 0.15], [-6.2, -3.6, 0.1], [-5.2, -8.8, -0.2], [3.7, -9.8, 0.1], [-6.4, -1.0, -0.1], [4.2, -12, 0.3]]) {
    if (boats.length >= 2) break;
    const [x, z] = wpt(FC, u, v);
    let ok = clearOf(FC, x, z, 0.4);
    for (const t of [-1.3, 0, 1.3]) for (const w of [-0.6, 0.6]) { const [px, pz] = wpt(FC, u + w, v + t); if (groundH(px, pz) > -0.9 || deckAt(px, pz) !== null) ok = false; }
    if (ok) boats.push({ x, z, yaw: yawC + a, ph: R() * 6, col: boats.length ? 0x3f78b8 : 0xe8e2d4 });
  }

  // 3) 모래톱 해변: 줄무늬 파라솔, 수건, 물웅덩이 바위, 조개
  const beach = { parasol: wpt(FB, -6.0, -3.4), towel: wpt(FB, -5.35, -2.5) };
  addBlock(beach.parasol[0], beach.parasol[1], 0.25);
  for (const [cx, cz] of [[-6.8, 19.6], [7.6, 19.4]]) for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + R() * 0.4, d = 0.75 + R() * 0.25, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, s = 0.3 + R() * 0.22;
    rock(x, Math.max(groundH(x, z), -0.25) - 0.05, z, s, 0.5, true, R() < 0.4);
  }
  for (let n = 0; n < 200 && shells.length < 26; n++) {
    const x = -9 + R() * 18, z = 14 + R() * 7, g = groundH(x, z);
    if (g < 0.06 || g > 0.7 || !onBeach(x, z) || !clearOf(FB, x, z, 0)) continue;
    shells.push({ x, y: g, z, yaw: R() * 6, c: [0xfff1de, 0xffd6c4, 0xf2e2c8][Math.floor(R() * 3)] });
  }

  // 4) 방파제 끝: 등대, 테트라포드 양옆
  addBlock(LIGHT[0], LIGHT[1], 1.0);
  const tp = (x, z) => { if (groundH(x, z) < -0.6 && deckAt(x, z) === null && clearOf(FO, x, z, 0.3)) tetra.push([x, -0.45 + R() * 0.4, z]); };
  for (let z = BW.z1 - 0.4; z < rootZ - 0.5; z += 1.25) { tp(BW.ax0 - 1.0 + (R() - 0.5) * 0.4, z + R() * 0.3); tp(BW.ax1 + 1.0 + (R() - 0.5) * 0.4, z + R() * 0.3); }
  for (let z = BW.z0 + 0.4; z < BW.z1; z += 1.25) { tp(BW.x0 - 1.0 + (R() - 0.5) * 0.4, z); tp(BW.x1 + 1.0 + (R() - 0.5) * 0.4, z); }
  for (let x = BW.x0 + 0.3; x < BW.ax0 - 0.6; x += 1.3) tp(x, BW.z1 + 1.0);
  for (let x = BW.ax1 + 0.8; x < BW.x1; x += 1.3) tp(x, BW.z1 + 1.0);
  for (let x = BW.x0 - 0.5; x < BW.x1 + 1; x += 1.3) tp(x, BW.z0 - 1.0);

  // 바닷가 바위 몇 개 (자리·해변 가운데·잔교·방파제 피해서)
  for (let n = 0; n < 400 && rocks.length < 96; n++) {
    const a = R() * Math.PI * 2, r = 9 + R() * 9, x = Math.cos(a) * r, z = Math.sin(a) * r, g = groundH(x, z);
    if (g < -0.7 || g > 0.35 || onCape(x, z) || (Math.abs(x) < 7 && z > 12) || !clearAll(x, z, 0.5) || deckAt(x, z) !== null) continue;
    if (Math.hypot(x - pierStart[0], z - pierStart[1]) < 4 || (Math.abs(x - 2) < 4 && z < rootZ + 2) || blocked(x, z, 0.6)) continue;
    const s = 0.35 + R() * 0.55; rock(x, g - 0.2 * s, z, s, 0.55 + R() * 0.3, true, R() < 0.3);
  }

  // 숲: 길·광장·해변 모래·바위 곶을 뺀 뭍을 촘촘히 (나무는 막힘이라 길을 따라 걷게 된다)
  for (let gx = -18; gx <= 18; gx += 1.25) for (let gz = -18; gz <= 18; gz += 1.25) {
    const x = gx + (R() - 0.5) * 0.8, z = gz + (R() - 0.5) * 0.8, pd = pathDist(x, z, 4);
    const pine = R() < (pd < 2.6 ? 0.5 : 0.72), s = pine ? 0.8 + R() * 0.55 : 0.7 + R() * 0.5, yaw = R() * 6;
    if (Math.hypot(x, z) < 5.8 || pd < 1.6 || mainLand(x, z) < 0.62 || groundH(x, z) < 0.62) continue;
    if (onCape(x, z) || onBeach(x, z) || !clearAll(x, z, 0.4) || blocked(x, z, 0.5)) continue;
    const pc = loc(FC, x, z);
    if ((Math.abs(pc.u - WALK_U) < 2.4 && pc.v < -3 && pc.v > -pierL - 2.5) || (Math.abs(x - 2) < 2.6 && z < rootZ + 2.5)) continue;
    trees.push({ x, y: groundH(x, z) - 0.05, z, s, pine, yaw });
    addBlock(x, z, (pine ? 0.6 : 0.55) * s);
  }

  // 걷기 판정: 갑판 위면 그 높이, 물·막힘·가파른 벼랑이면 null
  const surfaceAt = (x, z) => {
    const top = deckAt(x, z), g = groundH(x, z);
    let y;
    if (top !== null) y = Math.max(top, g);
    else {
      if (g < 0.2) return null;
      const e = 0.35, gx = groundH(x + e, z) - groundH(x - e, z), gz = groundH(x, z + e) - groundH(x, z - e);
      if (Math.hypot(gx, gz) / (2 * e) > 1.25) return null;
      y = g;
    }
    return blocked(x, z) ? null : y;
  };

  const NAMES = { marketer: ["갯바위 곶", "cape"], creator: ["해초 숲 잔교", "pier"], beginner: ["모래톱 해변", "beach"], open: ["방파제 끝", "breakwater"] };
  const spots = {};
  for (const [k, F] of Object.entries(FR)) {
    const [tx, tz] = wpt(F, TANK_U, TANK_V);
    spots[k] = { seat: [F.sx, surfaceAt(F.sx, F.sz), F.sz], face: [F.fx, 0, F.fz], target: [F.tx, 0, F.tz], tank: [tx, surfaceAt(tx, tz), tz], name: NAMES[k][0], kind: NAMES[k][1] };
  }
  PLAN = { pierL, rootZ, deckAt, paths, pathDist, clearOf, blocked, surfaceAt, spots, start: [0, groundH(0, 2), 2], plaza, beach, rocks, trees, wood, posts, lanterns, boats, shells, tetra, spray };
  return PLAN;
}

// ---------- 메시 ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _ax = new THREE.Vector3();
// 인스턴스 하나로 여러 개 (그리기 1번). set(i, item) 이 _p/_q/_s/색을 채운다
function inst(geo, mat, list, set) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  list.forEach((o, i) => { _q.identity(); _s.set(1, 1, 1); const col = set(o); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); if (col !== undefined) im.setColorAt(i, _c.set(col)); });
  return im;
}
// 비색인 지오메트리 여러 개를 하나로 합침
function merge(geos) {
  const ps = [], ns = [];
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; ps.push(...g.attributes.position.array); ns.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(ns, 3));
  return g;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o });

export function buildIsland(scene, { burst = () => {} } = {}) {
  const PLN = planIsland(), root = new THREE.Group(); root.name = "island"; scene.add(root);
  const add = (...o) => { root.add(...o); return o[0]; };

  // 지형: 가운데 ±40은 0.5칸, 바깥 바다 밑은 5칸. 경계의 촘촘한 점은 거친 칸 높이를 직선으로 따라가 틈이 없다
  {
    const cDeep = new THREE.Color(0x24506a), cWet = new THREE.Color(0x9c8a64), cSea = new THREE.Color(0xb8a57e);
    const cSand = new THREE.Color(0xd8c38e), cSandW = new THREE.Color(0xb9a173), cDirt = new THREE.Color(0xb08d5e);
    const cG1 = new THREE.Color(0x5b8a3c), cG2 = new THREE.Color(0x46723a), cRock = new THREE.Color(0x8b8681), cRock2 = new THREE.Color(0x6a6662);
    const tmp = new THREE.Color();
    const coarseH = (x, z) => { // 거친 칸 모서리 위 직선 보간
      const fx = (x + 150) / 5, fz = (z + 150) / 5;
      if (Math.abs(fx - Math.round(fx)) < 1e-6) { const z0 = Math.floor(fz) * 5 - 150, t = (z - z0) / 5; return groundH(x, z0) * (1 - t) + groundH(x, z0 + 5) * t; }
      const x0 = Math.floor(fx) * 5 - 150, t = (x - x0) / 5; return groundH(x0, z) * (1 - t) + groundH(x0 + 5, z) * t;
    };
    const colorOf = (x, y, z, ny, pd) => {
      if (ny < 0.6 && y > -3.2) return tmp.copy(cRock2).lerp(cRock, 0.5 + 0.5 * vnoise(x * 0.7, z * 0.7));
      if (y < -0.15) {
        if (y < -3.5) return tmp.copy(cDeep).lerp(cWet, 0.25 + 0.15 * vnoise(x * 0.4, z * 0.4));
        return tmp.copy(cSea).lerp(cDeep, clamp((-y - 0.6) / 3.5, 0, 1));
      }
      const n = vnoise(x * 0.8, z * 0.8), r = Math.hypot(x, z);
      if (r < 4.3 + 0.35 * n) return tmp.copy(cDirt).lerp(cSand, 0.15 + 0.1 * n);
      if (onCape(x, z)) return pd < 0.9 + 0.2 * n ? tmp.copy(cRock).lerp(cDirt, 0.55) : tmp.copy(cRock2).lerp(cRock, 0.55 + 0.45 * n);
      if (y < 0.2) return tmp.copy(cSandW);
      if (y < 0.66 || onBeach(x, z)) return tmp.copy(cSand).lerp(cSandW, 0.2 + 0.2 * n);
      if (pd < 0.95 + 0.2 * n) return tmp.copy(cDirt).lerp(cG1, 0.08 + 0.08 * n);
      if (pd < 1.3 + 0.2 * n) return tmp.copy(cDirt).lerp(cG1, 0.5);
      return tmp.copy(cG2).lerp(cG1, 0.5 + 0.5 * vnoise(x * 0.25 + 9, z * 0.25));
    };
    const build = (x0, n, cell, hAt, skip, pdAt) => {
      const H = new Float32Array((n + 1) * (n + 1)), D = pdAt ? new Float32Array((n + 1) * (n + 1)) : null;
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const x = x0 + i * cell, z = x0 + j * cell; H[j * (n + 1) + i] = hAt(x, z, i, j); if (D) D[j * (n + 1) + i] = pdAt(x, z); }
      const pos = [], col = [];
      const tri = (a, b, c) => {
        const [ax, az, ai] = a, [bx, bz, bi] = b, [cx, cz, ci] = c, ay = H[ai], by = H[bi], cy = H[ci];
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nz = ux * vy - uy * vx, ny = nyy / Math.hypot(nx, nyy, nz);
        const k = colorOf((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, ny, D ? (D[ai] + D[bi] + D[ci]) / 3 : 9);
        for (let q = 0; q < 3; q++) col.push(k.r, k.g, k.b);
      };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = x0 + i * cell, z = x0 + j * cell;
        if (skip && skip(x + cell / 2, z + cell / 2)) continue;
        const i00 = j * (n + 1) + i, i10 = i00 + 1, i01 = i00 + n + 1, i11 = i01 + 1;
        const p00 = [x, z, i00], p10 = [x + cell, z, i10], p01 = [x, z + cell, i01], p11 = [x + cell, z + cell, i11];
        tri(p00, p01, p10); tri(p10, p01, p11);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const fine = build(-40, 160, 0.5, (x, z, i, j) => (i === 0 || j === 0 || i === 160 || j === 160) ? coarseH(x, z) : groundH(x, z),
      null, (x, z) => (Math.abs(x) < 27 && Math.abs(z) < 27) ? PLN.pathDist(x, z, 4) : 9);
    const coarse = build(-150, 60, 5, (x, z) => groundH(x, z), (x, z) => Math.abs(x) < 40 && Math.abs(z) < 40, null);
    add(new THREE.Mesh(fine, mat), new THREE.Mesh(coarse, mat));
  }

  // 바위 (곶·해안·물웅덩이·모닥불 둘레 돌): 한 번에
  const rockMat = std(0xffffff), woodMat = std(0xffffff, { roughness: 0.85 });
  add(inst(new THREE.DodecahedronGeometry(1, 0), rockMat, PLN.rocks, o => { _p.set(o.x, o.y, o.z); _e.set(...o.e); _q.setFromEuler(_e); _s.set(o.s, o.s * o.sy, o.s); return o.c; }));

  // 나무: 소나무(줄기+잎 세 층)와 덤불
  {
    const trunk = new THREE.CylinderGeometry(0.11, 0.17, 1.0, 5); trunk.translate(0, 0.5, 0);
    const cones = [[0.95, 1.3, 1.35], [0.75, 1.1, 1.95], [0.5, 0.9, 2.5]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); return g; });
    const leaves = merge(cones);
    const bush = new THREE.IcosahedronGeometry(0.75, 0); bush.scale(1, 0.72, 1); bush.translate(0, 0.38, 0);
    const pines = PLN.trees.filter(t => t.pine), bushes = PLN.trees.filter(t => !t.pine);
    const pose = o => {
      _p.set(o.x, o.y, o.z); _s.setScalar(o.s); _q.setFromAxisAngle(_ax.set(0, 1, 0), o.yaw);
      if (o.lean) _q.premultiply(_q2.setFromAxisAngle(_ax.set(o.lean.ax, 0, o.lean.az), o.lean.a));
    };
    add(inst(trunk, std(0x6b4a32), pines, o => { pose(o); }));
    add(inst(leaves, std(0xffffff), pines, o => { pose(o); return [0x2f5a3a, 0x3a6b3f, 0x29503a, 0x355f36][Math.floor((o.x * 7.3 + o.z * 3.1) & 3)]; }));
    add(inst(bush, std(0xffffff), bushes, o => { pose(o); return [0x4f7a3a, 0x5d8a44, 0x6b8f3e][Math.floor(Math.abs(o.x * 5.1 + o.z * 2.7)) % 3]; }));
  }

  // 광장: 모닥불(통나무 + 깜빡이는 불꽃), 텐트, 통나무 의자, 네 갈래 표지판
  let flameO, flameI;
  {
    const P = PLN.plaza, logs = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; logs.push({ x: P.fire[0] + Math.cos(a) * 0.2, y: PLAZA_Y + 0.25, z: P.fire[1] + Math.sin(a) * 0.2, tilt: a, l: 0.8, r: 1 }); }
    for (const [x, z, a] of P.benches) logs.push({ x, y: PLAZA_Y + 0.2, z, a, l: 1.5, r: 2.6 });
    const logG = new THREE.CylinderGeometry(0.085, 0.085, 1, 6);
    add(inst(logG, std(0x7a5232), logs, o => {
      _p.set(o.x, o.y, o.z); _s.set(o.r, o.l, o.r);
      // 의자는 눕히고, 모닥불 장작은 가운데로 기울여 원뿔처럼
      if (o.a !== undefined) _q.setFromEuler(_e.set(Math.PI / 2, o.a, 0, "YXZ")); else _q.setFromAxisAngle(_ax.set(-Math.sin(o.tilt), 0, Math.cos(o.tilt)), 0.55);
    }));
    flameO = add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 7), std(0xff7a2a, { emissive: 0xff5a1a, emissiveIntensity: 1.6, transparent: true, opacity: 0.9 })));
    flameI = add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), std(0xffd35a, { emissive: 0xffc23a, emissiveIntensity: 2.2 })));
    flameO.position.set(P.fire[0], PLAZA_Y + 0.5, P.fire[1]); flameI.position.set(P.fire[0], PLAZA_Y + 0.38, P.fire[1]);
    const tent = add(new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.7, 4), std(0xd98c4a)));
    tent.position.set(P.tent[0], PLAZA_Y + 0.85, P.tent[1]); tent.rotation.y = Math.PI / 4 + 0.3;
    const sp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.95, 6), std(0x6e4a2e)));
    sp.position.set(P.sign[0], PLAZA_Y + 0.97, P.sign[1]);
    const sh = new THREE.Shape([[0, -0.11], [0.62, -0.11], [0.62, -0.2], [0.9, 0], [0.62, 0.2], [0.62, 0.11], [0, 0.11]].map(([x, y]) => new THREE.Vector2(x, y)));
    const ag = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); ag.translate(0.06, 0, -0.025);
    add(inst(ag, std(0xffffff, { roughness: 0.7 }), P.arrows, o => {
      const i = P.arrows.indexOf(o); _p.set(P.sign[0], PLAZA_Y + 1.62 - i * 0.26, P.sign[1]); _q.setFromAxisAngle(_ax.set(0, 1, 0), -o.a); return ZCOLOR[o.k];
    }));
  }

  // 잔교: 판자·기둥·등불·쪽배
  const boats = [];
  let lampMat;
  {
    add(inst(new THREE.BoxGeometry(1, 1, 1), woodMat, PLN.wood, o => { _p.set(o.x, o.y, o.z); _s.set(o.sx, o.sy, o.sz); _q.setFromAxisAngle(_ax.set(0, 1, 0), o.yaw); return o.c; }));
    const postG = new THREE.CylinderGeometry(0.13, 0.15, 1, 6); postG.translate(0, 0.5, 0);
    add(inst(postG, std(0x5a4030), PLN.posts, o => { _p.set(o.x, o.y0, o.z); _s.set(1, o.y1 - o.y0, 1); }));
    lampMat = std(0xffe2a0, { emissive: 0xffb54a, emissiveIntensity: 1.6 });
    add(inst(new THREE.BoxGeometry(0.28, 0.34, 0.28), lampMat, PLN.lanterns, o => { _p.set(o.x, DECK_Y + 1.62, o.z); }));
    // 쪽배: 뱃머리를 좁힌 상자 + 안쪽 바닥 + 가로 의자
    const hullG = new THREE.BoxGeometry(1.0, 0.42, 2.4, 1, 1, 2), hp = hullG.attributes.position;
    for (let i = 0; i < hp.count; i++) { let x = hp.getX(i), z = hp.getZ(i); const y = hp.getY(i); if (z > 1) x *= 0.12; if (y < 0) { x *= 0.7; z *= 0.88; } hp.setXYZ(i, x, y, z); }
    hullG.computeVertexNormals();
    const inner = std(0x6e5034);
    for (const b of PLN.boats) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(hullG, std(b.col, { roughness: 0.7 })); hull.position.y = 0.1; g.add(hull);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 1.7), inner); fl.position.set(0, 0.3, -0.15); g.add(fl);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.26), inner); bench.position.set(0, 0.36, 0.05); g.add(bench);
      g.position.set(b.x, 0, b.z); g.rotation.y = b.yaw; add(g); boats.push({ g, ph: b.ph, yaw: b.yaw });
    }
  }

  // 해변: 줄무늬 파라솔, 수건, 조개
  {
    const [px, pz] = PLN.beach.parasol, gy = groundH(px, pz);
    const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.5, 6), std(0xeeeeee)));
    pole.position.set(px, gy + 1.2, pz); pole.rotation.z = 0.08;
    const canG = new THREE.ConeGeometry(1.6, 0.55, 12, 1, true).toNonIndexed(), cp = canG.attributes.position, cc = [];
    for (let i = 0; i < cp.count; i += 3) {
      const a = Math.atan2(cp.getZ(i) + cp.getZ(i + 1) + cp.getZ(i + 2), cp.getX(i) + cp.getX(i + 1) + cp.getX(i + 2));
      const k = _c.set(Math.floor((a + Math.PI) / (Math.PI / 6) + 0.5) % 2 ? 0xe5483a : 0xfaf3e6);
      for (let q = 0; q < 3; q++) cc.push(k.r, k.g, k.b);
    }
    canG.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3)); canG.computeVertexNormals();
    const can = add(new THREE.Mesh(canG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide })));
    can.position.set(px - 0.1, gy + 2.35, pz); can.rotation.z = 0.08;
    const [tx, tz] = PLN.beach.towel;
    const towel = add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 1.8), std(0x3fa7c9)));
    towel.position.set(tx, groundH(tx, tz) + 0.02, tz); towel.rotation.y = 0.15;
    const shellG = new THREE.SphereGeometry(0.13, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); shellG.scale(1, 0.5, 1.2);
    add(inst(shellG, std(0xffffff, { roughness: 0.5 }), PLN.shells, o => { _p.set(o.x, o.y, o.z); _q.setFromAxisAngle(_ax.set(0, 1, 0), o.yaw); return o.c; }));
  }

  // 방파제: 팔 + 끝 판(윗면 0.6), 테트라포드, 빨간 등대
  let lamp;
  {
    const concrete = std(0xaaa59c, { roughness: 0.95 });
    const armLen = PLN.rootZ - BW.z1;
    const arm = add(new THREE.Mesh(new THREE.BoxGeometry(BW.ax1 - BW.ax0, 9.6, armLen), concrete)); arm.position.set((BW.ax0 + BW.ax1) / 2, BW_Y - 4.8, BW.z1 + armLen / 2);
    const pad = add(new THREE.Mesh(new THREE.BoxGeometry(BW.x1 - BW.x0, 9.6, BW.z1 - BW.z0), concrete)); pad.position.set((BW.x0 + BW.x1) / 2, BW_Y - 4.8, (BW.z0 + BW.z1) / 2);
    const edge = add(new THREE.Mesh(new THREE.BoxGeometry(BW.x1 - BW.x0, 0.03, 0.2), std(0xf2c94c, { roughness: 0.8 }))); edge.position.set((BW.x0 + BW.x1) / 2, BW_Y + 0.01, BW.z0 + 0.18);
    // 테트라포드: 다리 넷을 각각 인스턴스로 (그리기 4번)
    const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(d => new THREE.Vector3(...d).normalize());
    for (const d of dirs) {
      const legG = new THREE.CylinderGeometry(0.14, 0.42, 1.25, 7); legG.translate(0, 0.62, 0);
      legG.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      add(inst(legG, concrete, PLN.tetra, o => { const rr = mulberry(Math.round(o[0] * 31 + o[2] * 17) + 999); _p.set(...o); _q.setFromEuler(_e.set(rr() * 6, rr() * 6, rr() * 6)); _s.setScalar(0.85 + rr() * 0.3); }));
    }
    const [lx, lz] = LIGHT, red = std(0xd8473a, { roughness: 0.6 });
    const tower = add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 5.2, 16), red)); tower.position.set(lx, BW_Y + 2.6, lz);
    const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.5, 16), std(0xf4f0e8, { roughness: 0.6 }))); band.position.set(lx, BW_Y + 1.8, lz);
    const gal = add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16), std(0x3a3a40))); gal.position.set(lx, BW_Y + 5.22, lz);
    lamp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd36b, emissiveIntensity: 1 })));
    lamp.position.set(lx, BW_Y + 5.5, lz);
    const roof = add(new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.6, 16), red)); roof.position.set(lx, BW_Y + 6.1, lz);
  }

  const V = a => new THREE.Vector3(...a);
  const spots = {};
  for (const [k, s] of Object.entries(PLN.spots)) spots[k] = { seat: V(s.seat), face: V(s.face), target: V(s.target), tank: V(s.tank), name: s.name, kind: s.kind };

  // 움직임: 불꽃 일렁임, 등대 깜빡임, 등불, 쪽배 출렁임, 곶 절벽 물보라
  let sprayT = 1.5;
  const _sp = new THREE.Vector3();
  function update(dt, time) {
    const f = REDUCED ? 0.3 : 1;
    const fl = 1 + f * (0.16 * Math.sin(time * 13) + 0.1 * Math.sin(time * 7.3 + 1));
    flameO.scale.set(1 + f * 0.06 * Math.sin(time * 9), fl, 1); flameI.scale.set(1, 1 + f * 0.2 * Math.sin(time * 11 + 2), 1);
    flameO.material.emissiveIntensity = 1.5 + f * 0.4 * Math.sin(time * 17);
    lampMat.emissiveIntensity = 1.5 + f * 0.25 * Math.sin(time * 5.1) * Math.sin(time * 3.3);
    lamp.material.emissiveIntensity = REDUCED ? 1.2 : (time % 3.2 < 0.7 ? 2.6 : 0.25); // 3.2초마다 한 번 반짝
    for (const b of boats) {
      b.g.position.y = f * 0.07 * Math.sin(time * 1.3 + b.ph);
      b.g.rotation.set(f * 0.03 * Math.sin(time * 0.9 + b.ph), b.yaw + f * 0.04 * Math.sin(time * 0.4 + b.ph), f * 0.05 * Math.sin(time * 1.1 + b.ph));
    }
    sprayT -= dt;
    if (sprayT <= 0 && PLN.spray.length) {
      const [x, z] = PLN.spray[Math.floor(Math.random() * PLN.spray.length)];
      burst(_sp.set(x, 0.15, z).clone(), 0xffffff, 14 + Math.floor(Math.random() * 12), 0.9 + Math.random() * 0.6);
      sprayT = REDUCED ? 4 + Math.random() * 3 : 1.0 + Math.random() * 1.8;
    }
  }

  return { groundH, surfaceAt: PLN.surfaceAt, spots, start: V(PLN.start), update };
}
