// 수달 낚시꾼: 저폴리 캐릭터 + 걷기·대기·앉기 포즈 (매 프레임 할당 없음)
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const COL = { fur: 0x8a5a36, cream: 0xf1dfc0, dark: 0x2a1d17, paw: 0x5e3b24, white: 0xffffff, hat: 0x6f7a3a, scarf: 0xf08a2c };
const HIP = 0.32, SEAT_Y = 0.11;      // 서 있을 때 / 앉았을 때 엉덩이 높이
const SEAT_TIME = 0.3;                // 앉기 전환 시간(초)
const lerp = (a, b, t) => a + (b - a) * t;

// 상자 여러 개를 한 지오메트리로 합침 (수염: draw call 1개)
// 각 항목: [가로, 세로, 깊이, x, y, z, z회전, y회전]
function mergeBoxes(parts) {
  const pos = [], nor = [];
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p[0], p[1], p[2]).toNonIndexed();
    g.rotateZ(p[6]); g.rotateY(p[7]); g.translate(p[3], p[4], p[5]);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

export function createOtter({ reduced = false } = {}) {
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
  const M = { fur: mat(COL.fur), cream: mat(COL.cream), dark: mat(COL.dark), paw: mat(COL.paw), hat: mat(COL.hat), scarf: mat(COL.scarf),
    white: new THREE.MeshStandardMaterial({ color: COL.white, roughness: 0.3, emissive: 0x666666 }) };
  M.dark.roughness = 0.4;
  const ball = new THREE.IcosahedronGeometry(1, 1);       // 작은 구 공용 (크기는 scale로)
  const ball2 = new THREE.IcosahedronGeometry(1, 2);      // 큰 면(배·주둥이)용 조금 더 둥근 구
  const add = (parent, geo, m, x, y, z, sx = 1, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = true; parent.add(o); return o;
  };

  const group = new THREE.Group();
  const root = new THREE.Group(); root.position.y = HIP; group.add(root);   // 엉덩이 기준점 (앉으면 내려감)

  // 몸통 + 배 무늬 (숨쉬기는 torso 크기로)
  const torso = new THREE.Group(); root.add(torso);
  add(torso, new THREE.IcosahedronGeometry(0.33, 2), M.fur, 0, 0.25, 0, 1, 1.05, 0.9);
  add(torso, ball2, M.cream, 0, 0.18, 0.205, 0.21, 0.25, 0.09);

  // 목 스카프: 고리 + 앞 삼각 자락
  const ring = add(root, new THREE.TorusGeometry(0.2, 0.055, 5, 12), M.scarf, 0, 0.53, 0.01);
  ring.rotation.x = Math.PI / 2;
  const flap = add(root, new THREE.ConeGeometry(0.13, 0.2, 3), M.scarf, 0, 0.44, 0.25, 1, 1, 0.35);
  flap.rotation.x = Math.PI; // 뒤집으면 평평한 면이 앞으로

  // 머리: neck(회전축) → face(머리 중심)
  const neck = new THREE.Group(); neck.position.set(0, 0.58, 0.02); root.add(neck);
  const face = new THREE.Group(); face.position.set(0, 0.24, 0.02); neck.add(face);
  add(face, new THREE.IcosahedronGeometry(0.32, 2), M.fur, 0, 0, 0, 1.08, 0.95, 1);
  add(face, ball2, M.cream, 0, -0.09, 0.24, 0.21, 0.12, 0.13);           // 넓은 주둥이(볼 수염 패드)
  add(face, ball, M.dark, 0, -0.02, 0.36, 0.07, 0.047, 0.05);            // 코
  const eyes = [], shines = [];
  for (const s of [1, -1]) {
    eyes.push(add(face, ball, M.dark, s * 0.12, 0.05, 0.28, 0.045, 0.045, 0.03));
    shines.push(add(face, ball, M.white, s * 0.12 + 0.015, 0.067, 0.305, 0.014));
    add(face, ball, M.fur, s * 0.3, 0.08, -0.03, 0.075, 0.075, 0.042);  // 작은 둥근 귀
  }
  // 수염: 양쪽 3가닥씩
  const wk = [];
  for (const s of [1, -1]) for (const f of [-0.22, 0, 0.22]) {
    const L = 0.2, dx = s * Math.cos(f) * Math.cos(0.3), dy = Math.sin(f), dz = -Math.cos(f) * Math.sin(0.3);
    wk.push([L, 0.01, 0.01, s * 0.17 + dx * L / 2, -0.07 + f * 0.12 + dy * L / 2, 0.31 + dz * L / 2, s * f, s * 0.3]);
  }
  add(face, mergeBoxes(wk), M.dark, 0, 0, 0);
  // 버킷햇: 아래로 퍼지는 챙 + 둥근 윗부분, 살짝 뒤로 젖힘
  const hat = new THREE.Group(); hat.rotation.x = -0.12; face.add(hat);
  add(hat, new THREE.CylinderGeometry(0.29, 0.42, 0.07, 12), M.hat, 0, 0.2, 0);
  add(hat, new THREE.CylinderGeometry(0.22, 0.27, 0.2, 10), M.hat, 0, 0.32, 0);

  // 팔: 어깨 축 아래로 늘어진 팔 + 발바닥(앞발)
  const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 3, 8);
  const shoulder = [new THREE.Vector3(0.22, 0.45, 0.1), new THREE.Vector3(-0.22, 0.45, 0.1)];
  const arms = [], paws = [];
  for (const sp of shoulder) {
    const a = new THREE.Group(); a.position.copy(sp); root.add(a); arms.push(a);
    add(a, armGeo, M.fur, 0, -0.17, 0);
    paws.push(add(a, ball, M.paw, 0, -0.34, 0, 0.08));
  }
  // 앉았을 때 두 앞발이 가슴 앞에서 만나는 방향 (root 기준)
  const DOWN = new THREE.Vector3(0, -1, 0), tv = new THREE.Vector3();
  const qSeat = shoulder.map(sp => new THREE.Quaternion().setFromUnitVectors(DOWN,
    tv.set(Math.sign(sp.x) * 0.07, 0.32, 0.4).sub(sp).normalize()));

  // 다리: 짧고 진한 원통
  const legGeo = new THREE.CapsuleGeometry(0.085, 0.14, 3, 8);
  const legs = [];
  for (const s of [1, -1]) {
    const l = new THREE.Group(); l.position.set(s * 0.14, 0, 0.05); root.add(l); legs.push(l);
    add(l, legGeo, M.paw, 0, -0.15, 0, 1, 1, 1.15);
  }

  // 굵고 끝이 가는 꼬리: 두 마디 (뿌리 → 끝)
  const tailA = new THREE.Group(); tailA.position.set(0, 0.08, -0.26); tailA.rotation.order = "YXZ"; root.add(tailA);
  const tg1 = new THREE.CylinderGeometry(0.085, 0.12, 0.32, 8); tg1.translate(0, 0.16, 0); tg1.rotateX(-Math.PI / 2);
  add(tailA, tg1, M.fur, 0, 0, 0);
  const tailB = new THREE.Group(); tailB.position.set(0, 0, -0.32); tailA.add(tailB);
  const tg2 = new THREE.CylinderGeometry(0.02, 0.085, 0.3, 8); tg2.translate(0, 0.15, 0); tg2.rotateX(-Math.PI / 2);
  add(tailB, tg2, M.fur, 0, 0, 0);

  // 움직임 배율: reduced면 출렁임·흔들림은 거의 0, 팔다리 스윙만 작게
  const wob = reduced ? 0.04 : 1, swing = reduced ? 0.35 : 1;
  const st = { sp: 0, seat: 0, phase: 0, blinkT: 2 + Math.random() * 2, blink: 0, flickT: 4 + Math.random() * 3, flick: -1 };
  const eul = new THREE.Euler(), qStand = new THREE.Quaternion();

  // e: 앉기 정도(0..1), sp: 걷기 정도, ph: 걸음 위상
  function pose(e, sp, ph, time, flick) {
    const s = Math.sin(ph), c = Math.cos(ph);
    const breath = Math.sin(time * 2.2) * 0.018 * wob;
    root.position.y = lerp(HIP, SEAT_Y, e) + Math.abs(c) * 0.045 * sp * wob;
    root.rotation.x = 0.14 * sp - 0.1 * e;                 // 걸을 땐 앞으로, 앉으면 살짝 뒤로
    root.rotation.z = s * 0.05 * sp * wob;
    torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.6);
    neck.rotation.x = -0.05 * sp + 0.15 * e + breath * 0.5;   // 앉으면 고개를 앞으로
    neck.rotation.z = -s * 0.04 * sp * wob;
    // 다리: 걸음 스윙 ↔ 앞으로 뻗기
    legs[0].rotation.set(lerp(-s * 0.75 * sp * swing, -1.45, e), 0, 0.18 * e);
    legs[1].rotation.set(lerp(s * 0.75 * sp * swing, -1.45, e), 0, -0.18 * e);
    // 팔: 다리와 반대로 스윙 ↔ 가슴 앞 낚싯대 쥐기
    for (let i = 0; i < 2; i++) {
      const k = i ? -1 : 1;
      eul.set(k * s * 0.6 * sp * swing - 0.08, 0, k * 0.42);
      qStand.setFromEuler(eul);
      arms[i].quaternion.slerpQuaternions(qStand, qSeat[i], e);
    }
    // 꼬리: 땅에 늘어짐, 걸으면 좌우로, 앉으면 옆으로 감김
    tailA.rotation.x = lerp(-0.95, -0.2, e) + Math.abs(s) * 0.08 * sp * wob;
    tailA.rotation.y = s * 0.35 * sp * wob + flick + 0.55 * e;
    tailB.rotation.x = lerp(0.75, 0.25, e);
    tailB.rotation.y = s * 0.2 * sp * wob + flick * 0.8;
  }

  // 앉은 포즈에서 두 앞발 중간 = 낚싯대 손잡이 위치
  pose(1, 0, 0, 0, 0);
  group.updateMatrixWorld(true);
  const handLocal = new THREE.Vector3();
  for (const p of paws) handLocal.add(group.worldToLocal(p.getWorldPosition(tv)));
  handLocal.multiplyScalar(0.5);
  pose(0, 0, 0, 0, 0);

  function update(dt, { speed = 0, seated = false, time = 0 } = {}) {
    dt = Math.min(dt, 0.1);
    st.sp += (Math.max(0, Math.min(1, speed)) - st.sp) * Math.min(1, dt * 8);
    st.seat = Math.max(0, Math.min(1, st.seat + (seated ? dt : -dt) / SEAT_TIME));
    const e = st.seat * st.seat * (3 - 2 * st.seat);
    const sp = st.sp * (1 - e);
    st.phase = (st.phase + dt * 15 * st.sp) % (Math.PI * 2);
    // 눈 깜빡임
    st.blinkT -= dt;
    if (st.blinkT < 0) { st.blink = 0.13; st.blinkT = 2 + Math.random() * 3.5; }
    st.blink -= dt;
    const ey = st.blink > 0 ? 0.0045 : 0.045;
    eyes[0].scale.y = eyes[1].scale.y = ey;
    shines[0].visible = shines[1].visible = st.blink <= 0;
    // 가끔 꼬리 툭 (서서 쉴 때만)
    st.flickT -= dt;
    if (st.flickT < 0) { st.flick = 0; st.flickT = 4 + Math.random() * 4; }
    let flick = 0;
    if (st.flick >= 0) {
      st.flick += dt / 0.6;
      if (st.flick >= 1) st.flick = -1;
      else flick = Math.sin(st.flick * Math.PI * 2) * Math.sin(st.flick * Math.PI) * 0.45 * wob * (1 - e) * (1 - st.sp);
    }
    pose(e, sp, st.phase, time, flick);
  }

  return { group, handLocal, update };
}
