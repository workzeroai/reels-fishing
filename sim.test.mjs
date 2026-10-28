// 계산 규칙이 실제 기록(REEL_METRICS 2026-10-21)을 재현하는지 확인. 실행: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, visualPlan, gradeOf, PARAMS, zoneAt, ZONES, OPEN_SPOT, SETS, settle, biteEvents, REEL, DIRS, reelStart, reelStep, REAL, TOPICS, MAGNETS, cardEffects, baitEffect } from "./sim.js";

const seeds = Array.from({ length: 200 }, (_, i) => 1000 + i);
const run = (topicId, hookIdx, magnetId) => seeds.map(seed => simulate({ topicId, hookIdx, magnetId, seed }));
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("같은 시드면 같은 결과", () => {
  const a = simulate({ topicId: "blog", hookIdx: 0, magnetId: "practice", seed: 42 });
  const b = simulate({ topicId: "blog", hookIdx: 0, magnetId: "practice", seed: 42 });
  assert.deepEqual([a.reach, a.follows, a.dm], [b.reach, b.follows, b.dm]);
});

test("MCP 5선형: 조회 수만 단위, 전환 약 1% (실측 59,629명 · 1.11%)", () => {
  const rs = run("mcp", 0, "guide");
  const reach = median(rs.map(r => r.reach)), conv = median(rs.map(r => r.conv));
  assert.ok(reach > 50000 && reach < 95000, `reach ${reach}`);
  assert.ok(conv > 0.008 && conv < 0.013, `conv ${conv}`);
});

test("디자인 3개형: 조회 최다권인데 전환은 보통 (실측 75,216명 · 0.72%)", () => {
  const rs = run("design", 0, "guide");
  const reach = median(rs.map(r => r.reach)), conv = median(rs.map(r => r.conv));
  assert.ok(reach > 55000 && reach < 100000, `reach ${reach}`);
  assert.ok(conv > 0.006 && conv < 0.009, `conv ${conv}`);
  assert.equal(gradeOf(conv).id, "ok");
});

test("블로그 키워드형: 조회는 만 명 안팎인데 전환 약 3% (실측 9,216명 · 3.06%)", () => {
  const rs = run("blog", 0, "practice");
  const reach = median(rs.map(r => r.reach)), conv = median(rs.map(r => r.conv));
  assert.ok(reach > 8000 && reach < 17000, `reach ${reach}`);
  assert.ok(conv > 0.026 && conv <= PARAMS.convCap, `conv ${conv}`);
  assert.equal(gradeOf(conv).id, "great");
});

test("핵심 고민 재현: 큐레이션형은 떼가 크고 실무형은 건지는 비율이 높다", () => {
  const cur = run("mcp", 0, "guide"), prac = run("blog", 0, "practice");
  assert.ok(median(cur.map(r => r.reach)) > 4 * median(prac.map(r => r.reach)));
  assert.ok(median(prac.map(r => r.conv)) > 2.5 * median(cur.map(r => r.conv)));
  // 팔로우 절대수는 큐레이션형이 더 많다 (MCP 5선 662 > 블로그 282)
  assert.ok(median(cur.map(r => r.follows)) > median(prac.map(r => r.follows)));
});

test("DM 신청은 실측 범위 안 (천 명당 7.2~38.4)", () => {
  for (const [t, h, m] of [["mcp", 0, "guide"], ["design", 0, "guide"], ["blog", 0, "practice"]]) {
    const dm = median(run(t, h, m).map(r => r.dmPerK));
    assert.ok(dm > 5 && dm < 40, `${t} dm/k ${dm}`);
  }
});

test("약한 훅은 떼를 줄인다", () => {
  assert.ok(median(run("mcp", 2, "guide").map(r => r.reach)) < 0.6 * median(run("mcp", 0, "guide").map(r => r.reach)));
});

test("전환율은 상한을 넘지 않는다", () => {
  for (const r of run("blog", 0, "practice")) assert.ok(r.conv <= PARAMS.convCap);
});

test("화면 계획: 큰 떼는 회색이 많고, 작은 실무형 떼는 색깔 물고기 비율이 높다", () => {
  const big = visualPlan(simulate({ topicId: "mcp", hookIdx: 0, magnetId: "guide", seed: 7 }));
  const small = visualPlan(simulate({ topicId: "blog", hookIdx: 0, magnetId: "practice", seed: 7 }));
  assert.ok(big.school > small.school);
  assert.ok(small.biters / small.school > 2 * (big.biters / big.school));
  assert.ok(small.gold > big.gold);
});

test("미끼가 링크뿐이면 금색 물고기 0마리, 실습 자료면 여러 마리", () => {
  const none = visualPlan(simulate({ topicId: "mcp", hookIdx: 0, magnetId: "link", seed: 3 }));
  const rich = visualPlan(simulate({ topicId: "blog", hookIdx: 0, magnetId: "practice", seed: 3 }));
  assert.equal(none.gold, 0);
  assert.ok(rich.gold >= 3);
  assert.ok(rich.gold <= rich.biters, "금색은 입질 물고기의 일부");
});

test("잘못된 입력은 조용히 NaN이 되지 않는다", () => {
  assert.throws(() => simulate({ topicId: "nope", hookIdx: 0, magnetId: "guide", seed: 1 }));
  const r = simulate({ topicId: "mcp", hookIdx: 0, magnetId: "guide", seed: 1, gapDays: -5 });
  assert.ok(r.reach > 0 && Number.isFinite(r.dmPerK));
});

test("구역: 좌표로 구역을 찾고, 구역 밖은 넓은 물(null)", () => {
  for (const [k, z] of Object.entries(ZONES)) assert.equal(zoneAt(z.x, z.z), k);
  assert.equal(zoneAt(0, 2), null);
  // 지형끼리 붙어 있지 않게: 테두리 사이 간격 4 이상, 넓은 바다 자리는 어느 지형에도 걸리지 않음
  const zs = Object.values(ZONES);
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) assert.ok(Math.hypot(zs[i].x - zs[j].x, zs[i].z - zs[j].z) - zs[i].r - zs[j].r >= 4);
  assert.equal(zoneAt(OPEN_SPOT.x, OPEN_SPOT.z), null);
  for (const z of zs) assert.ok(Math.hypot(z.x - OPEN_SPOT.x, z.z - OPEN_SPOT.z) - z.r - OPEN_SPOT.r >= 1);
});

test("조준: 노린 물고기 구역에 던져야 많이 건진다 (다른 구역 < 넓은 물 < 맞는 구역)", () => {
  const conv = zone => median(seeds.map(seed => simulate({ topicId: "blog", hookIdx: 0, magnetId: "practice", seed, zone }).conv));
  const right = conv("marketer"), open = conv(null), wrong = conv("beginner");
  assert.ok(wrong < open && open < right, `${wrong} ${open} ${right}`);
  assert.ok(wrong < 0.5 * right);
});

test("조준은 떼 크기(조회)를 바꾸지 않는다", () => {
  const a = simulate({ topicId: "mcp", hookIdx: 0, magnetId: "guide", seed: 9, zone: "marketer" });
  const b = simulate({ topicId: "mcp", hookIdx: 0, magnetId: "guide", seed: 9, zone: "creator" });
  assert.equal(a.reach, b.reach);
});

test("챔질: 다 건지면 기록 그대로, 하나도 못 건져도 70%는 남는다", () => {
  const r = simulate({ topicId: "mcp", hookIdx: 0, magnetId: "guide", seed: 5 });
  assert.equal(settle(r, 1).follows, r.follows);
  assert.equal(settle(r, 0).follows, Math.round(r.follows * 0.7));
  assert.ok(settle(r, 0.5).follows < r.follows);
});

test("챔질 기회는 한 판에 3~4번, 금색 기회는 미끼가 좋을 때만", () => {
  const big = biteEvents(visualPlan(simulate({ topicId: "blog", hookIdx: 0, magnetId: "practice", seed: 2 })));
  const none = biteEvents(visualPlan(simulate({ topicId: "mcp", hookIdx: 0, magnetId: "link", seed: 2 })));
  assert.ok(big.n >= 3 && big.n <= 4 && big.gold >= 1 && big.gold < big.n);
  assert.equal(none.gold, 0);
});

test("챔질 비율에 NaN이 와도 결과가 NaN이 되지 않는다 (0으로 봄)", () => {
  const r = simulate({ topicId: "mcp", hookIdx: 0, magnetId: "guide", seed: 5 });
  const s = settle(r, NaN, undefined);
  assert.equal(s.follows, Math.round(r.follows * 0.7));
  assert.ok(Number.isFinite(s.conv) && s.grade);
});

// 감기 한 번을 흉내 낸다 (60fps). 잠잠할 땐 초당 perSec번 연타, 차고 나가면 react초 뒤에 방향을 누른다
// hold: "right" = 화살표대로, "wrong" = 반대로, "none" = 방향은 안 누름. mashRun: 차고 나가는 동안에도 연타
const OPP = { L: "R", R: "L", U: "D", D: "U" };
function play(kind, seed, { perSec = 6, react = 0.35, hold = "right", mashRun = false } = {}) {
  let st = reelStart(kind, seed), acc = 0, seen = 0;
  for (let i = 0; i < 60 * 20; i++) {
    seen = st.run ? seen + 1 / 60 : 0;
    const h = st.run && seen > react ? (hold === "right" ? st.run : hold === "wrong" ? OPP[st.run] : null) : null;
    acc += !st.run || mashRun ? perSec / 60 : 0; const n = Math.floor(acc); acc -= n;
    st = reelStep(st, 1 / 60, n, kind, false, h);
    if (st.out !== "fight") return st;
  }
  return st;
}
const tally = (kind, pol) => { const c = { landed: 0, escaped: 0, snapped: 0 }, ts = []; for (let s = 1; s <= 100; s++) { const r = play(kind, s, pol); c[r.out]++; if (r.out === "landed") ts.push(r.t); } ts.sort((a, b) => a - b); return { ...c, med: ts[ts.length >> 1] }; };
test("감기: 연타하고 화살표대로 버티면 건진다 (일반 5초 안, 금색 6초 안)", () => {
  const o = tally("orbit"), g = tally("gold");
  assert.equal(o.landed, 100); assert.ok(o.med < 5, `orbit ${o.med}`);
  assert.equal(g.landed, 100); assert.ok(g.med < 6, `gold ${g.med}`);
  assert.ok(tally("gold", { perSec: 5, react: 0.6 }).landed >= 90); // 반응이 조금 느려도 대부분 건짐
});
test("감기: 차고 나갈 때 계속 감거나 반대로 버티면 줄이 끊어진다", () => {
  assert.ok(tally("orbit", { hold: "none", mashRun: true }).snapped >= 80);
  assert.equal(tally("gold", { hold: "none", mashRun: true }).snapped, 100);
  assert.equal(tally("orbit", { hold: "wrong" }).snapped, 100);
});
test("감기: 버티지 않고 기다리기만 하면 일반은 겨우, 금색은 거의 놓친다. 안 감으면 놓친다", () => {
  const o = tally("orbit", { hold: "none" });
  assert.ok(o.landed >= 80 && o.med > tally("orbit").med + 1.5, JSON.stringify(o));
  assert.ok(tally("gold", { hold: "none" }).landed <= 5);
  assert.equal(tally("orbit", { perSec: 0 }).landed, 0);
});
test("감기: 같은 시드면 같은 방향 순서, 네 방향이 다 나온다", () => {
  const seq = seed => { let st = reelStart("gold", seed), out = []; for (let i = 0; i < 600; i++) { st = reelStep(st, 1 / 60, 0, "gold", false, st.run); if (st.run && out[out.length - 1] !== st.run + st.k) out.push(st.run + st.k); } return out.join(","); };
  assert.equal(seq(7), seq(7));
  const seen = new Set(); for (let s = 1; s <= 30; s++) seq(s).split(",").forEach(x => seen.add(x[0]));
  for (const d of DIRS) assert.ok(seen.has(d), d);
});

test("실제 기록: 실제로 고른 조합이면 조회한 사람·팔로우·자료 DM 개수가 실제의 ±25% 안", () => {
  for (const t of TOPICS) {
    const R = REAL[t.id];
    const runs = Array.from({ length: 201 }, (_, i) => simulate({ topicId: t.id, hookIdx: R.hook, magnetId: R.magnet, seed: i + 1 }));
    for (const k of ["reach", "follows", "dm"]) {
      const m = median(runs.map(r => r[k]));
      assert.ok(Math.abs(m - R[k]) / R[k] < 0.25, `${t.id} ${k}: 모델 ${m} 실제 ${R[k]}`);
    }
  }
});
test("자료 DM: 실제로 고른 조합이면 천 명당 DM이 실제(리틀리 DM 발송 수)의 ±25% 안", () => {
  for (const t of TOPICS) {
    const R = REAL[t.id];
    const perK = median(Array.from({ length: 201 }, (_, i) => { const r = simulate({ topicId: t.id, hookIdx: R.hook, magnetId: R.magnet, seed: i + 1 }); return r.dm / r.reach * 1000; }));
    const real = R.dm / R.reach * 1000;
    assert.ok(Math.abs(perK - real) / real < 0.25, `${t.id}: 모델 ${perK.toFixed(1)} 실제 ${real.toFixed(1)}/천 명`);
  }
});
test("추천 세트: 셋 다 실제로 올린 조합이고, 세트마다 부르는 물고기(지형)가 다르다", () => {
  assert.equal(SETS.length, 3);
  for (const st of SETS) { const R = REAL[st.topic]; assert.ok(R && R.hook === st.hook && R.magnet === st.magnet, st.id); }
  const targets = SETS.map(st => TOPICS.find(t => t.id === st.topic).target);
  assert.deepEqual(targets, ["creator", "marketer", "beginner"]); // 세 세트가 세 지형과 하나씩 짝
  const conv = st => median(Array.from({ length: 101 }, (_, i) => simulate({ topicId: st.topic, hookIdx: st.hook, magnetId: st.magnet, seed: i + 1 }).conv));
  const reach = st => median(Array.from({ length: 101 }, (_, i) => simulate({ topicId: st.topic, hookIdx: st.hook, magnetId: st.magnet, seed: i + 1 }).reach));
  assert.ok(reach(SETS[0]) > reach(SETS[1]) && conv(SETS[1]) > conv(SETS[0]), "넓게는 떼가 크고 깊게는 잘 문다");
});
test("실제 기록: 네 릴스 모두 있고, 실제 선택으로 돌리면 전환율이 실제의 ±25% 안", () => {
  for (const t of TOPICS) {
    const R = REAL[t.id];
    assert.ok(R && t.hooks[R.hook] && MAGNETS.some(m => m.id === R.magnet), t.id);
    const convs = Array.from({ length: 201 }, (_, i) => simulate({ topicId: t.id, hookIdx: R.hook, magnetId: R.magnet, seed: i + 1 }).conv).sort((a, b) => a - b);
    const real = R.follows / R.reach, med = convs[100];
    assert.ok(Math.abs(med - real) / real < 0.25, `${t.id}: 모델 ${med} 실제 ${real}`);
  }
});
test("카드 효과 표시: 큐레이션은 떼가 크고, 블로그(실무)는 무는 비율이 가장 높다", () => {
  const fx = Object.fromEntries(TOPICS.map(t => [t.id, cardEffects(t)]));
  assert.equal(fx.mcp.school, 3); assert.equal(fx.design.school, 3);
  assert.equal(fx.blog.bite, 3); assert.ok(fx.blog.school < fx.mcp.school);
  assert.deepEqual(MAGNETS.map(baitEffect), [1, 2, 3]);
});
