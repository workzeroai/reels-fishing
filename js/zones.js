// 섬 앞바다의 세 지형 장식과 구역 고리: 암초(마케터), 해초 숲(크리에이터), 모래톱(AI 초보), 넓은 바다
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
import { ZONES, OPEN_SPOT } from "../sim.js";
import { REDUCED, ZCOLOR, mulberry } from "./util.js";

export function buildZones(scene, groundH) {
// 구역 장식: 암초(마케터), 해초 숲(크리에이터), 모래톱(AI 초보)
const reedSway = [];
let reeds, reedHeads;
{
  const r = mulberry(33);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6c6a6e, roughness: 0.9, flatShading: true });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x5e7a5a, roughness: 1, flatShading: true });
  const zm = ZONES.marketer;
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 0.8 + r() * (zm.r - 1), sc = 0.6 + r() * 1.3;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sc, 0), i % 3 === 0 ? mossMat : rockMat);
    // 바위는 대부분 물속에, 몇 개만 수면 위로 (물고기를 가리지 않게)
    rock.position.set(zm.x + Math.cos(a) * d, (i < 3 ? -0.9 : -2.2) - sc * 0.3 + r() * 0.5, zm.z + Math.sin(a) * d);
    rock.rotation.set(r() * 3, r() * 3, r() * 3); rock.scale.y = 0.7 + r() * 0.5; scene.add(rock);
  }
  // 산호: 가지 산호(원뿔)와 둥근 산호, 바위 사이 얕은 곳에
  const CORAL = [0xff7a6b, 0xffb35c, 0xc98bff, 0xff6fa8, 0xffe08a];
  const branchG = new THREE.ConeGeometry(0.16, 0.9, 5); branchG.translate(0, 0.45, 0);
  const headG0 = new THREE.IcosahedronGeometry(0.45, 0);
  const branches = new THREE.InstancedMesh(branchG, new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), 60);
  const heads = new THREE.InstancedMesh(headG0, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 14);
  const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = new THREE.Vector3(), cv = new THREE.Vector3(), ce = new THREE.Euler(), cc = new THREE.Color();
  for (let i = 0; i < 20; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zm.r * 0.9, x = zm.x + Math.cos(a) * d, z = zm.z + Math.sin(a) * d, y = -1.3 - r() * 1.1;
    cc.set(CORAL[i % CORAL.length]);
    for (let k = 0; k < 3; k++) { ce.set((r() - 0.5) * 0.9, r() * 6, (r() - 0.5) * 0.9); cq.setFromEuler(ce); cs.setScalar(0.7 + r() * 0.6); cv.set(x + (r() - 0.5) * 0.4, y, z + (r() - 0.5) * 0.4); cm.compose(cv, cq, cs); branches.setMatrixAt(i * 3 + k, cm); branches.setColorAt(i * 3 + k, cc); }
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zm.r * 0.95;
    ce.set(r() * 3, r() * 3, r() * 3); cq.setFromEuler(ce); cs.set(1 + r() * 0.5, 0.6 + r() * 0.3, 1 + r() * 0.5);
    cv.set(zm.x + Math.cos(a) * d, -1.7 - r() * 0.9, zm.z + Math.sin(a) * d); cm.compose(cv, cq, cs); heads.setMatrixAt(i, cm); heads.setColorAt(i, cc.set(CORAL[(i + 2) % CORAL.length]));
  }
  scene.add(branches, heads);
  // 해초 숲: 바닥(-6)에서 수면까지 올라온 줄기, 끝의 잎은 수면에 눕는다
  const zc = ZONES.creator, NR = 90;
  const reedG = new THREE.CylinderGeometry(0.06, 0.09, 1, 5); reedG.translate(0, 0.5, 0);
  const headG = new THREE.CapsuleGeometry(0.1, 0.7, 3, 6); headG.scale(1.8, 1, 0.25); headG.translate(0, 0.4, 0);
  reeds = new THREE.InstancedMesh(reedG, new THREE.MeshStandardMaterial({ color: 0x2c4430, roughness: 0.8 }), NR); // 줄기는 물빛에 묻히게, 잎이 주인공
  reedHeads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: 0x6f7a32, roughness: 0.7, side: THREE.DoubleSide }), NR * 2); // 포기마다 잎 둘
  for (let i = 0; i < NR; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zc.r * 0.92;
    const blade = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.45 + r() * 0.15, r() * 6, 0, "YXZ"));
    const blade2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2 + r() * 0.3, r() * 6, 0, "YXZ"));
    reedSway.push({ x: zc.x + Math.cos(a) * d, z: zc.z + Math.sin(a) * d, h: 5.8 + r() * 0.25, ph: r() * 6, head: r() < 0.85, blade, blade2 });
  }
  scene.add(reeds, reedHeads);
  // 모래톱: 바닥은 groundH가 올려 두었다. 불가사리와 조개껍데기를 몇 개
  const zb = ZONES.beginner;
  const starMat = new THREE.MeshStandardMaterial({ color: 0xff8a4c, roughness: 0.7 });
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xfff1de, roughness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zb.r * 0.7, g = new THREE.Group();
    for (let k = 0; k < 5; k++) { const arm = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 4), starMat); arm.rotation.z = -Math.PI / 2; arm.position.x = 0.22; const pv = new THREE.Group(); pv.add(arm); pv.rotation.y = k / 5 * Math.PI * 2; g.add(pv); }
    g.scale.y = 0.4; g.rotation.y = r() * 6;
    const x = zb.x + Math.cos(a) * d, z = zb.z + Math.sin(a) * d; g.position.set(x, groundH(x, z) + 0.05, z); scene.add(g);
  }
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zb.r * 0.85, x = zb.x + Math.cos(a) * d, z = zb.z + Math.sin(a) * d;
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); sh.scale.set(1, 0.5, 1.2); sh.position.set(x, groundH(x, z), z); scene.add(sh);
  }
}
const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rs = new THREE.Vector3(), _rv = new THREE.Vector3(), _re = new THREE.Euler(), _rt = new THREE.Vector3(), _rq2 = new THREE.Quaternion();
function updateReeds(time) {
  for (let i = 0; i < reedSway.length; i++) {
    const rd = reedSway[i];
    const sw = Math.sin(time * 0.8 + rd.ph) * (REDUCED ? 0.01 : 0.045);
    _re.set(sw, 0, sw * 0.7); _rq.setFromEuler(_re);
    _rs.set(1, rd.h, 1); _rv.set(rd.x, -6, rd.z);
    _rm.compose(_rv, _rq, _rs); reeds.setMatrixAt(i, _rm);
    if (rd.head) {
      _rt.set(0, rd.h - 0.1, 0).applyQuaternion(_rq).add(_rv);
      _rq2.copy(_rq).multiply(rd.blade);
      _rs.set(1, 1, 1); _rm.compose(_rt, _rq2, _rs); reedHeads.setMatrixAt(i, _rm);
      _rt.set(0, rd.h - 0.7, 0).applyQuaternion(_rq).add(_rv); _rq2.copy(_rq).multiply(rd.blade2);
      _rs.set(0.85, 0.85, 0.85); _rm.compose(_rt, _rq2, _rs); reedHeads.setMatrixAt(i + reedSway.length, _rm);
    } else { _rm.makeScale(0, 0, 0); reedHeads.setMatrixAt(i, _rm); reedHeads.setMatrixAt(i + reedSway.length, _rm); }
  }
  reeds.instanceMatrix.needsUpdate = reedHeads.instanceMatrix.needsUpdate = true;
}

// 구역 표시 고리
const zoneRings = {};
for (const [k, zn] of Object.entries(ZONES)) {
  const m = new THREE.Mesh(new THREE.RingGeometry(zn.r - 0.35, zn.r, 72), new THREE.MeshBasicMaterial({ color: ZCOLOR[k], transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(zn.x, 0.08, zn.z); m.renderOrder = 3; scene.add(m); zoneRings[k] = m;
}
  {
    const m = new THREE.Mesh(new THREE.RingGeometry(OPEN_SPOT.r - 0.25, OPEN_SPOT.r, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(OPEN_SPOT.x, 0.08, OPEN_SPOT.z); m.renderOrder = 3; scene.add(m); zoneRings.open = m;
  }
  return { updateReeds, zoneRings };
}
