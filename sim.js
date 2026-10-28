// 릴스 낚시 계산 규칙. @work__zero 릴스 10편 기록(2026-10-21 스냅숏)으로 맞춘 단순화 모델.
// 근거와 수치는 05_스펙_워크시트.md 4·5절. 화면 코드와 테스트가 같이 쓴다.

export const PARAMS = {
  baseReach: 3000,            // 기본 떼 (조회한 사람)
  formatMult: { curation: 16.2, practical: 2.36, intro: 0.63 }, // 2026-10-27 게임에 나오는 릴스 4편의 실제 조회한 사람에 맞춤 (전엔 10편 평균 18·3.2·1.2라 블로그 +35%·101 약 +90%)
  reachLuck: 0.25,            // 조회 운 ±25%
  baseConv: 0.007,            // 기준 전환율 0.7%
  practicalConv: 2.0,         // 결과를 보여주는 주제면 전환 ×2
  convLuck: 0.12,             // 전환 운 ±12%
  convCap: 0.035,             // 전환 상한 3.5% (계정 최고 3.06%)
  dmBase: 0.0034,             // 자료 DM 기본 0.34% (미끼 없이도 오는 몫)
  dmScale: 0.0209,            // 미끼 가치² × 2.09%
  dmPractical: 2.07,          // 결과를 따라 하게 하는 실무형은 ×2.07 (블로그 편 38.4/천 명)
  gapPerDay: 0.15             // 안 던진 날마다 떼가 줄어듦 (2차 완성본에서 사용)
};

// 물고기 종류: 회색 직장인(그냥 지나가는 사람) + 색깔 3종
export const SPECIES = {
  marketer: { color: 0x4f8cff, ko: "마케터", en: "Marketers" },
  creator: { color: 0xff9a3c, ko: "크리에이터", en: "Creators" },
  beginner: { color: 0x8ee05a, ko: "AI 초보", en: "AI beginners" }
};

// 주제 = 형식 + 노리는 물고기 + 맞춤 정도. 훅 세기는 실제 게시 훅(강)과 반려된 훅(약)에서 가져옴
export const TOPICS = [
  {
    id: "mcp", format: "curation", target: "marketer", match: 1.4,
    ko: "마케터라면 연결해야 할 MCP 5개", en: "5 MCPs every marketer should connect",
    hooks: [
      { s: 1.35, ko: "클로드로 마케팅하고 있다면, 이 5개는 무조건 연결해야 돼요.", en: "If you market with Claude, connect these 5. No exceptions." },
      { s: 0.75, ko: "MCP 5개 정리해 봤어요", en: "I put together 5 MCPs" },
      { s: 0.6, ko: "엠씨피가 뭔지 아세요?", en: "Do you know what an MCP is?" }
    ]
  },
  {
    id: "design", format: "curation", target: "creator", match: 1.0,
    ko: "클로드로 디자인할 때 설치할 3개", en: "3 things to install for designing with Claude",
    hooks: [
      { s: 1.4, ko: "클로드로 디자인한다면, 이 세 개는 무조건 설치하세요.", en: "Designing with Claude? Install these three. Seriously." },
      { s: 0.75, ko: "디자인 스킬 3개 소개합니다", en: "Introducing 3 design skills" },
      { s: 0.6, ko: "DESIGN.md 파일 아세요?", en: "Have you heard of a DESIGN.md file?" }
    ]
  },
  {
    id: "blog", format: "practical", target: "marketer", match: 2.0,
    ko: "블로그 키워드를 클로드로 골라 보기 (실제 결과)", en: "Picking blog keywords with Claude (real results)",
    hooks: [
      { s: 1.3, ko: "블로그 키워드, 이제 클로드가 바로 찍어줘요!", en: "Claude now picks your blog keywords for you!" },
      { s: 0.8, ko: "키워드 천이백 개, 클로드가 세 개로 줄였어요", en: "1,200 keywords, cut to 3 by Claude" },
      { s: 0.6, ko: "검색광고 API 키 발급부터 해볼게요", en: "Let's start by issuing a search ads API key" }
    ]
  },
  {
    id: "intro", format: "intro", target: "beginner", match: 1.6,
    ko: "클로드 처음 쓰는 사람을 위한 무료 강의 정리", en: "Claude's free course, summed up for first-timers",
    hooks: [
      { s: 1.3, ko: "클로드가 사용법을 공짜로 풀었어요!!", en: "Claude just gave away its user guide for free!!" },
      { s: 0.7, ko: "2시간 반을 22페이지로 정리했어요", en: "I turned 2.5 hours into 22 pages" },
      { s: 0.8, ko: "클로드 만든 회사가 알려준 사용법, 딱 세 개만 보세요", en: "The makers of Claude shared how to use it. Just watch these three." }
    ]
  }
];

// 미끼 = 리드마그넷
export const MAGNETS = [
  { id: "link", v: 0.1, ko: "링크 하나만 (자료 없음)", en: "Just a link (no resource)" },
  { id: "guide", v: 0.5, ko: "설치 가이드 + 요청문 모음", en: "Setup guide + prompt pack" },
  { id: "practice", v: 0.9, ko: "결과를 그대로 따라 하는 실습 자료", en: "Hands-on kit that reproduces the result" }
];

// 전환율 등급: 계정 10편 분포 기준 (워크시트 5절)
export const GRADES = [
  { id: "low", max: 0.006, ko: "아쉬움", en: "Weak" },
  { id: "ok", max: 0.01, ko: "보통", en: "Average" },
  { id: "good", max: 0.02, ko: "준수", en: "Solid" },
  { id: "great", max: Infinity, ko: "대박", en: "Jackpot" }
];

export function gradeOf(conv) {
  return GRADES.find(g => conv < g.max);
}

// 시드 난수: 같은 시드면 같은 결과
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 바다 구역: 구역마다 사는 물고기가 다르다. 던진 곳 = 노린 사람 (타깃팅)
// 섬 둘레 바다의 세 지형. 섬 가운데 마을에서 걸어서 각 지형 앞 낚시 자리로 간다
export const ZONES = {
  marketer: { x: -27, z: -16.5, r: 3.8 },  // 암초 (북서쪽 갯바위 곶 앞)
  creator: { x: 28, z: -8, r: 3.8 },       // 해초 숲 (동쪽 잔교 앞)
  beginner: { x: 0, z: 28, r: 3.8 }        // 모래톱 (남쪽 해변 앞)
};
// 넓은 바다: 북쪽 방파제 끝 앞의 탁 트인 물. 지형끼리는 서로 4 이상 떨어져 있다
export const OPEN_SPOT = { x: 2, z: -37, r: 2 };
// 추천 세트: 릴스·훅·미끼를 하나로 묶은 실제 조합 (모두 제가 실제로 올린 그대로)
export const SETS = [
  { id: "wide", topic: "design", hook: 0, magnet: "guide" },   // 세트마다 부르는 물고기가 달라 세 지형과 하나씩 짝이 맞게 디자인 릴스를 씀
  { id: "deep", topic: "blog", hook: 0, magnet: "practice" },
  { id: "beginner", topic: "intro", hook: 0, magnet: "practice" }
];
export const AIM = { mismatch: 0.45, open: 0.6 }; // 다른 구역에 던지면 전환 ×0.45, 넓은 바다면 ×0.6

export function zoneAt(x, z) {
  let best = null, bd = Infinity;
  for (const [k, zn] of Object.entries(ZONES)) {
    const d = Math.hypot(x - zn.x, z - zn.z);
    if (d < zn.r && d < bd) { best = k; bd = d; }
  }
  return best; // null = 넓은 바다
}

export function aimMatch(topic, zone) {
  return zone === null ? AIM.open : zone === topic.target ? 1 : AIM.mismatch;
}

// zone을 안 주면 주제가 노리는 구역에 정확히 던진 것으로 본다 (1차 시안과 같은 값)
export function simulate({ topicId, hookIdx, magnetId, seed, gapDays = 0, zone }, p = PARAMS) {
  const topic = TOPICS.find(t => t.id === topicId);
  const hook = topic && topic.hooks[hookIdx];
  const magnet = MAGNETS.find(m => m.id === magnetId);
  if (!topic || !hook || !magnet) throw new Error(`unknown choice: ${topicId}/${hookIdx}/${magnetId}`);
  gapDays = Math.max(0, Number(gapDays) || 0);
  const r = rng(seed);
  const swing = amp => 1 + (r() * 2 - 1) * amp;
  const practical = topic.format === "practical";

  const gap = 1 / (1 + p.gapPerDay * gapDays);
  const reach = Math.max(1, Math.round(p.baseReach * p.formatMult[topic.format] * hook.s * gap * swing(p.reachLuck)));

  if (zone === undefined) zone = topic.target;
  const aim = aimMatch(topic, zone);
  let conv = p.baseConv * topic.match * aim * (practical ? p.practicalConv : 1) * (0.85 + 0.3 * magnet.v) * swing(p.convLuck);
  conv = Math.min(conv, p.convCap);
  const follows = Math.round(reach * conv);

  const dmRate = p.dmBase + p.dmScale * magnet.v * magnet.v * (practical ? p.dmPractical : 1);
  const dm = Math.round(reach * dmRate);

  return { topic, hook, magnet, zone, aim, reach, conv, follows, dm, dmPerK: dm / reach * 1000, grade: gradeOf(conv), seed };
}

// 챔질 결과 반영. 몇 마리가 무는지는 기록이 정하고, 그중 몇 마리를 건지는지만 실력이 정한다 (70~100%)
// 챔질은 실제 데이터에 없는 게임 요소라 범위를 묶어 둔다
export const SKILL_FLOOR = 0.7;
export function settle(res, hitRatio, goldRatio = hitRatio) {
  const clamp01 = v => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  const h = clamp01(hitRatio), g = clamp01(goldRatio);
  const follows = Math.round(res.follows * (SKILL_FLOOR + (1 - SKILL_FLOOR) * h));
  const dm = Math.round(res.dm * (SKILL_FLOOR + (1 - SKILL_FLOOR) * g));
  const conv = follows / res.reach;
  return { follows, dm, conv, grade: gradeOf(conv), hitRatio: h };
}

// 챔질 기회 수: 입질 물고기 수에 비례하되 한 판에 3~4번. 한 마리마다 연타로 끌어올리므로 (한 판 약 20~25초)
export function biteEvents(plan) {
  const n = Math.max(3, Math.min(4, Math.round(plan.biters / 12)));
  const gold = Math.min(n - 1, plan.gold > 0 ? Math.ceil(plan.gold / 2) : 0);
  return { n, gold };
}

// 화면에 그릴 물고기 수. 실제 비율(1%와 3%)은 그대로 그리면 차이가 안 보여서 과장한다 (워크시트 7절)
export function visualPlan(res) {
  const school = Math.round(20 + 240 * Math.sqrt(Math.min(res.reach, 90000) / 90000));
  const frac = Math.min(0.66, 0.06 + (res.conv / 0.035) * 0.6);
  const biters = Math.max(2, Math.round(school * frac));
  // 금색 = DM 신청 비율(천 명당). 입질 물고기 중 일부로 칠한다 (팔로워 수와 따로 세지 않음)
  // 미끼가 링크뿐이면(천 명당 약 4건) 0마리, 실습 자료면 4~5마리
  const gold = Math.max(0, Math.min(biters, 6, Math.round((res.dmPerK - 4) / 6)));
  return { school, biters, gold };
}

// 끌어올리기(연타): 누를 때마다 줄을 감고, 물고기는 계속 당겨 간다. 금색은 힘이 세고 가끔 확 달아난다
// p = 감은 정도(0~1). 1이면 물 밖으로 꺼내고, 0이 되거나 시간이 다 되면 놓친다
// 감기: 잠잠할 땐 연타로 감고, 물고기가 한쪽으로 차고 나가면(run) 화살표 방향으로 버틴다.
// 차고 나가는 동안 버티지 않으면 줄을 뺏기고(감은 것이 줄고) 줄이 팽팽해진다. 반대로 버티거나 그때 감으면 더 팽팽해진다.
// 줄이 끝까지 팽팽해지면 끊어져 놓치고, 시간 안에 다 감으면 건진다.
// 방향: L·R = 그쪽으로 낚싯대를 끈다(물고기는 반대로 달아남), U = 들어 올린다(물고기가 파고듦), D = 숙인다(물고기가 뛰어오름)
export const DIRS = ["L", "R", "U", "D"];
export const REEL = {
  orbit: { start: 0.25, step: 0.09, drain: 0.065, limit: 9, first: 0.6, calm: [1.0, 1.5], runLen: [0.9, 1.2], pull: 0.32, strain: 0.72, crank: 0.045, wrongX: 1.9, relax: 0.75 },
  gold: { start: 0.25, step: 0.085, drain: 0.08, limit: 11, first: 0.6, calm: [1.1, 1.6], runLen: [0.9, 1.3], pull: 0.38, strain: 0.95, crank: 0.06, wrongX: 1.9, relax: 0.6 }
};
const rnd = (seed, k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const span = ([a, b], u) => a + (b - a) * u;
export function reelStart(kind, seed = 1) {
  const R = REEL[kind === "gold" ? "gold" : "orbit"];
  return { p: R.start, t: 0, tension: 0, run: null, runEnd: 0, next: R.first, k: 0, seed, running: false, held: false, out: "fight" };
}
// hold: 지금 누르고(끌고) 있는 방향 (없으면 null)
export function reelStep(st, dt, presses, kind, easy = false, hold = null) {
  const R = REEL[kind === "gold" ? "gold" : "orbit"], ez = easy ? 0.5 : 1;
  const t = st.t + dt;
  let { p, tension, run, runEnd, next, k } = st;
  if (!run && t >= next) { run = DIRS[Math.floor(rnd(st.seed, k) * 4)]; runEnd = t + span(R.runLen, rnd(st.seed, k + 0.5)); }
  else if (run && t >= runEnd) { run = null; k++; next = t + span(R.calm, rnd(st.seed, k + 0.25)); }
  const held = !!run && hold === run;
  if (run) {
    if (held) tension -= R.relax * dt;
    else {
      tension += R.strain * ez * (hold ? R.wrongX : 1) * dt;
      p -= R.pull * ez * dt;
    }
    tension += presses * R.crank * ez;
  } else {
    tension -= R.relax * dt;
    p += presses * R.step - R.drain * ez * dt;
  }
  tension = Math.max(0, tension); p = Math.min(1, p);
  const out = tension >= 1 ? "snapped" : p >= 1 ? "landed" : (p <= 0 || t > R.limit * (easy ? 1.6 : 1)) ? "escaped" : "fight";
  return { p: Math.max(0, p), t, tension: Math.min(1, tension), run, runEnd, next, k, seed: st.seed, running: !!run, held, out };
}

// 실제 기록: 이 릴스를 실제로 올렸을 때 내가 고른 것과 결과
// 조회한 사람·팔로우는 인스타 인사이트, DM은 리틀리 DM 발송 수 (모두 2026-10-21 스냅숏, 누적값)
// 미끼: MCP·디자인 = 설치 가이드 + 요청문, 블로그 = 가이드 + 요청문 + 결과를 재현하는 코드, 101 = 21쪽 실습서
export const REAL = {
  mcp: { date: "2026-09-27", hook: 0, magnet: "guide", reach: 59629, follows: 662, dm: 603 },
  design: { date: "2026-10-04", hook: 0, magnet: "guide", reach: 75216, follows: 540, dm: 543 },
  blog: { date: "2026-10-15", hook: 0, magnet: "practice", reach: 9216, follows: 282, dm: 354 },
  intro: { date: "2026-10-18", hook: 0, magnet: "practice", reach: 2464, follows: 35, dm: 50 }
};

// 카드에 보여 줄 효과를 숫자 대신 1~3단계로. 위 계산식에서 그대로 끌어온다
// 떼 크기 = 형식 배수, 무는 비율 = 주제·물고기 맞춤 × (결과 시연이면 ×2), 금색 = 미끼 가치
export function cardEffects(topic, p = PARAMS) {
  const reachF = p.formatMult[topic.format];
  const convF = topic.match * (topic.format === "practical" ? p.practicalConv : 1);
  return { school: reachF >= 10 ? 3 : reachF >= 2 ? 2 : 1, bite: convF >= 2.5 ? 3 : convF >= 1.2 ? 2 : 1 };
}
export function baitEffect(magnet) { return magnet.v >= 0.8 ? 3 : magnet.v >= 0.4 ? 2 : 1; }
