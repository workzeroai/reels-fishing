// 바다 환경: 물·하늘·먼 섬·갈매기. 섬과 낚시는 다른 모듈
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
import { ZONES } from "../sim.js";
import { REDUCED, mulberry } from "./util.js";

export function buildEnv(scene, { FOG, SUN_DIR }) {
// 물 표면: 파도·프레넬·햇빛 반사. 먼 바다는 너울이 크고 안개(수평선 빛)로 스며든다
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uDeep: { value: new THREE.Color(0x0b3a5a) }, uShallow: { value: new THREE.Color(0x4cc4b4) }, uSky: { value: new THREE.Color(0x9fa3c2) }, uFog: { value: FOG }, uSand: { value: new THREE.Vector3(ZONES.beginner.x, ZONES.beginner.z, ZONES.beginner.r) }, uReef: { value: new THREE.Vector3(ZONES.marketer.x, ZONES.marketer.z, ZONES.marketer.r) }, uKelp: { value: new THREE.Vector3(ZONES.creator.x, ZONES.creator.z, ZONES.creator.r) }, uAmp: { value: REDUCED ? 0.25 : 1 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `uniform float uTime; uniform float uAmp; varying vec3 vW; varying vec3 vN;
    float wv(vec2 p){ float swell = sin(p.y * .13 + p.x * .05 + uTime * .7) * .3 * smoothstep(18., 36., length(p));
      return (sin(p.x * .32 + uTime * 1.05) * .08 + cos(p.y * .41 + uTime * .8) * .07 + sin((p.x + p.y) * .9 + uTime * 1.6) * .025 + swell) * uAmp; }
    void main(){ vec3 p = position; p.y += wv(p.xz); float e = .15;
      vec3 n = normalize(vec3(-(wv(p.xz + vec2(e, 0.)) - wv(p.xz - vec2(e, 0.))) / (2. * e), 1., -(wv(p.xz + vec2(0., e)) - wv(p.xz - vec2(0., e))) / (2. * e)));
      vec4 w = modelMatrix * vec4(p, 1.); vW = w.xyz; vN = n; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uFog; uniform vec3 uSand; uniform vec3 uReef; uniform vec3 uKelp; uniform float uTime; varying vec3 vW; varying vec3 vN;
    void main(){ vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);
      float d = length(cameraPosition - vW);
      float fres = pow(1. - max(dot(N, V), 0.), 2.5);
      float sb = 1. - smoothstep(uSand.z * .55, uSand.z * 1.6, length((vW.xz - uSand.xy) * vec2(1., 1.3)));
      float rf = 1. - smoothstep(uReef.z * .6, uReef.z * 1.3, length(vW.xz - uReef.xy));
      float kf = 1. - smoothstep(uKelp.z * .6, uKelp.z * 1.2, length(vW.xz - uKelp.xy));
      vec3 base = mix(uDeep, uShallow, max(sb * .65, rf * .2));
      base = mix(base, vec3(.05, .09, .03), kf * .45);
      vec3 col = mix(base, uSky, fres * .32);
      vec3 H = normalize(uSun + V); float spec = pow(max(dot(N, H), 0.), 220.) * 1.1 + pow(max(dot(N, H), 0.), 60.) * .012;
      spec *= smoothstep(20., 34., d) * (1. - smoothstep(.28, .55, V.y)); // 반짝임은 먼 물에, 낮은 눈높이에서만 (위에서 내려다볼 땐 흰 덩어리가 생기지 않게)
      col += vec3(1., .72, .45) * spec; // 노을빛 윤슬
      float clear = max(sb * .8, rf * .6);
      float a = mix(mix(.8, .5, clear), .92, fres) + spec * .5; // 깊은 바다는 바닥이 거의 안 비치고, 암초·모래톱은 맑다
      a = mix(a, 1., smoothstep(30., 70., d));
      col = mix(col, uFog, smoothstep(55., 180., d));
      gl_FragColor = vec4(col, clamp(a, 0., 1.));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, 200, 200).rotateX(-Math.PI / 2), waterMat);
water.renderOrder = 2; scene.add(water);

// 하늘: 위는 저녁 남색, 수평선은 노을빛. 해가 있는 쪽이 조금 더 밝다
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR }, uTop: { value: new THREE.Color(0x3b4f86) }, uMid: { value: new THREE.Color(0xb59ab4) }, uHor: { value: FOG } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; varying vec3 vD;
      void main(){ float h = max(vD.y, 0.);
        vec3 c = mix(uHor, uMid, smoothstep(0., .2, h)); c = mix(c, uTop, smoothstep(.2, .65, h));
        float az = max(dot(normalize(vD.xz + 1e-4), normalize(uSun.xz)), 0.);
        c += vec3(1., .55, .3) * pow(az, 10.) * (1. - smoothstep(0., .3, h)) * .25;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  // 먼 섬과 곶: 안개에 거의 묻혀 실루엣만
  const isle = new THREE.MeshStandardMaterial({ color: 0x4a4566, roughness: 1, flatShading: true });
  for (const [x, z, sx, sy, sz] of [[-72, -55, 40, 15, 24], [32, -125, 30, 11, 12], [-22, -138, 18, 7, 9], [78, -92, 22, 12, 14]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), isle);
    m.position.set(x, -0.5, z); m.scale.set(sx, sy, sz); scene.add(m);
  }
}
// 갈매기: 바다 위를 천천히 돌며 가끔 날갯짓
const gulls = [];
{
  const r = mulberry(55);
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8, flatShading: true });
  const bodyG = new THREE.CapsuleGeometry(0.16, 0.6, 3, 6); bodyG.rotateX(Math.PI / 2);
  const wingL = new THREE.BoxGeometry(1.3, 0.04, 0.42); wingL.translate(0.65, 0, 0);
  const wingR = new THREE.BoxGeometry(1.3, 0.04, 0.42); wingR.translate(-0.65, 0, 0);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(), wl = new THREE.Mesh(wingL, white), wr = new THREE.Mesh(wingR, white);
    g.add(new THREE.Mesh(bodyG, white), wl, wr); scene.add(g);
    gulls.push({ g, wl, wr, cx: -20 + r() * 40, cz: -32 + r() * 20, R: 6 + r() * 8, y: 7 + r() * 6, w: (0.15 + r() * 0.15) * (r() < 0.5 ? 1 : -1), ph: r() * 6 });
  }
}
function updateGulls(time, show = true) { // 걸을 땐 낮은 카메라 앞을 가리므로 숨김
  for (const b of gulls) {
    b.g.visible = show;
    const th = b.ph + time * b.w;
    b.g.position.set(b.cx + Math.cos(th) * b.R, b.y + Math.sin(time * 0.6 + b.ph) * 0.4, b.cz + Math.sin(th) * b.R);
    b.g.rotation.set(0, Math.atan2(-Math.sin(th) * b.w, Math.cos(th) * b.w), -Math.sign(b.w) * 0.25);
    const flap = Math.sin(time * 7 + b.ph * 3) * 0.55 * Math.max(0, Math.sin(time * 0.5 + b.ph));
    b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
  }
}

  return { waterMat, updateGulls };
}
