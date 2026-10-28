// 여러 모듈이 같이 쓰는 작은 도구들 (Three.js에 기대지 않음)
export const $ = id => document.getElementById(id);
// 움직임 줄이기 설정: 켜져 있으면 흔들림·반복 애니메이션을 최소로
export const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// 구역(물고기 종류)별 색. 화면 표시와 3D 표지판이 같은 색을 쓴다
export const ZCOLOR = { marketer: "#4f8cff", creator: "#ff9a3c", beginner: "#8ee05a", open: "#ffffff" };
// 시드로 같은 결과가 나오는 난수
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
// 부드러운 값 잡음 (-1..1)
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
// 점에서 선분까지 거리 (xz 평면)
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
