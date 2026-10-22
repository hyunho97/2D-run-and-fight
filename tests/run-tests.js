// 전투 로직 단위 테스트 (Node, 의존성 없음): node tests/run-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LOGIC_FILES = [
  'src/core.js',
  'src/config.js',
  'src/rules.js',
  'src/data.js',
  'src/battle/StatusEffectSystem.js',
  'src/battle/DamageCalculator.js',
  'src/battle/Unit.js',
  'src/battle/ChainResolver.js',
  'src/battle/BlockManager.js',
  'src/battle/SkillExecutor.js',
  'src/battle/BattleManager.js',
  'src/meta/Progression.js',
  'src/meta/SaveManager.js',
  'src/ui/PixelArt.js'
];

function loadGame() {
  const ctx = { console, btoa, atob, TextEncoder, TextDecoder };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of LOGIC_FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.Game;
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn(loadGame());
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + err.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
// vm 컨텍스트 객체는 realm이 달라 JSON으로 비교
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'expected ' + e + ', got ' + a);
}
function near(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) throw new Error((msg || '') + ` expected ${expected}±${tol}, got ${actual}`);
}

function newBattle(G, extra) {
  return new G.BattleManager(Object.assign({
    stageId: 'STG_01_01', party: ['BAS_0001', 'BAS_0004', 'BAS_0005'], leaderIndex: 0, seed: 42
  }, extra));
}
function runUntil(b, pred, maxTime) {
  const dt = 1 / 60;
  while (!pred() && b.time < maxTime && !b.isOver) b.update(dt);
}
const slotsOf = owners => owners.map(owner => ({ owner }));

console.log('ChainResolver / BlockManager');

test('인접한 같은 캐릭터 블록은 최대 3개까지 체인', G => {
  const groups = G.ChainResolver.resolve(slotsOf(['A', 'A', 'B', 'B', 'B', 'B', 'A']));
  eq(groups.map(g => [g.owner, g.length]), [['A', 2], ['B', 3], ['B', 1], ['A', 1]]);
});

test('블록 사용 후 왼쪽으로 밀려 자동 합체', G => {
  const bm = new G.BlockManager([], () => 0);
  bm.slots = slotsOf(['A', 'B', 'A', 'A', 'C']);
  eq(bm.take(1), { owner: 'B', chain: 1 });
  eq(bm.groups().map(g => [g.owner, g.length]), [['A', 3], ['C', 1]]);
});

test('탭한 칸이 속한 체인 전체를 소모', G => {
  const bm = new G.BlockManager([], () => 0);
  bm.slots = slotsOf(['A', 'B', 'B', 'B', 'C']);
  eq(bm.take(2), { owner: 'B', chain: 3 });
  eq(bm.slots.map(s => s.owner), ['A', 'C']);
});

test('블록 바는 최대 9칸', G => {
  const b = newBattle(G);
  for (let i = 0; i < 30; i++) b.blocks.spawn();
  eq(b.blocks.slots.length, 9);
});

test('연속 미생성 방지: 한도만큼 안 나온 캐릭터는 확정 생성', G => {
  const b = newBattle(G);
  b.blocks.rng = () => 0;   // 가중치 랜덤은 항상 첫 캐릭터(리더)
  const seen = [];
  for (let i = 0; i < 30; i++) {
    b.blocks.slots = [];
    seen.push(b.blocks.spawn().owner);
  }
  // 여러 명이 동시에 한도에 걸리면 한 명씩 나오므로 보장 = 한도 + (파티원 수 - 1)
  const limit = G.Config.BLOCK_PITY + b.heroes.length - 1;
  for (const h of b.heroes) {
    let gap = 0;
    for (const o of seen) {
      gap = o === h.uid ? 0 : gap + 1;
      assert(gap <= limit, `hero ${h.slot} drought ${gap} > ${limit}`);
    }
  }
});

test('리더 블록 생성 확률 50% / 멤버 25% (보정 끔)', G => {
  G.Config.BLOCK_PITY = 0;
  const b = newBattle(G, { leaderIndex: 1 });
  const counts = {};
  const N = 40000;
  for (let i = 0; i < N; i++) {
    b.blocks.slots = [];
    const blk = b.blocks.spawn();
    counts[blk.owner] = (counts[blk.owner] || 0) + 1;
  }
  const [h0, h1, h2] = b.heroes;
  near(counts[h1.uid] / N, 0.5, 0.015, 'leader');
  near(counts[h0.uid] / N, 0.25, 0.015, 'member1');
  near(counts[h2.uid] / N, 0.25, 0.015, 'member2');
});

test('사망한 멤버는 블록 생성에서 제외되고 기존 블록도 제거', G => {
  const b = newBattle(G);
  const dead = b.heroes[2];
  for (let i = 0; i < 9; i++) b.blocks.spawn();
  b.kill(dead);
  assert(!b.blocks.slots.some(s => s.owner === dead.uid), 'dead blocks removed');
  eq(b.blocks.weights().map(w => w.weight), [2, 1]);
  for (let i = 0; i < 200; i++) { b.blocks.slots = []; assert(b.blocks.spawn().owner !== dead.uid); }
});

console.log('DamageCalculator');

function dummy(G, stats, extra) {
  return new G.Unit(Object.assign({ name: 'D', range: 100, baseStats: stats }, extra), { side: 'enemy' });
}

test('방어 감소율 = DEF / (DEF + K)', G => {
  const a = dummy(G, { hp: 100, atk: 100, def: 0 });
  const t = dummy(G, { hp: 100, atk: 0, def: 100 });
  eq(G.DamageCalculator.compute(a, t, 1, () => 0.99).amount, 50);
});

test('방어 관통은 대상 DEF를 비율로 무시', G => {
  const a = dummy(G, { hp: 100, atk: 100, def: 0, pen: 0.5 });
  const t = dummy(G, { hp: 100, atk: 0, def: 100 });
  eq(G.DamageCalculator.compute(a, t, 1, () => 0.99).amount, 67);
});

test('치명타 배율 & 광폭 배율 x2', G => {
  const a = dummy(G, { hp: 100, atk: 100, def: 0, cri: 0.5, crd: 1.5 });
  const t = dummy(G, { hp: 100, atk: 0, def: 0 });
  const crit = G.DamageCalculator.compute(a, t, 1, () => 0.1);
  assert(crit.crit);
  eq(crit.amount, 150);
  a.berserk = true;
  eq(G.DamageCalculator.compute(a, t, 1, () => 0.99).amount, 200);
});

test('속성 상성', G => {
  const m = (x, y) => G.DamageCalculator.elementMultiplier(x, y);
  eq([m('Fire', 'Wind'), m('Wind', 'Water'), m('Water', 'Fire')], [1.25, 1.25, 1.25]);
  eq([m('Wind', 'Fire'), m('Fire', 'Water')], [0.8, 0.8]);
  eq([m('Light', 'Dark'), m('Dark', 'Light'), m('Fire', 'Light')], [1.25, 1.25, 1]);
});

console.log('StatusEffect / Berserk');

test('CC는 행동 불가, CC 면역이면 적용 안 됨', G => {
  const u = dummy(G, { hp: 100, atk: 1, def: 0 });
  assert(G.StatusEffectSystem.apply(u, { type: 'Stun', duration: 2 }));
  assert(G.StatusEffectSystem.isDisabled(u));
  u.statuses = [];
  u.ccImmune = true;
  assert(!G.StatusEffectSystem.apply(u, { type: 'Freeze', duration: 2 }));
});

test('120초 광폭화: 공속 x2, 기존 CC 해제, 이후 CC 면역 / 110초 경고', G => {
  const b = newBattle(G);
  const e = b.enemies[0];
  const baseAspd = e.aspd;
  G.StatusEffectSystem.apply(e, { type: 'Stun', duration: 999 });
  b.time = 109.9;
  b.update(0.2);
  assert(b.berserkWarning && !b.berserk, 'warning at 110s');
  assert(b.drainEvents().some(ev => ev.type === 'berserkWarning'));
  b.time = 119.9;
  b.update(0.2);
  assert(b.berserk && e.berserk, 'berserk active');
  assert(!G.StatusEffectSystem.isDisabled(e), 'CC cleansed');
  eq(e.aspd, baseAspd * 2);
  assert(!G.StatusEffectSystem.apply(e, { type: 'Stun', duration: 1 }), 'CC immune');
});

test('광폭화 이후 등장하는 웨이브도 광폭 상태', G => {
  const b = newBattle(G);
  b.time = 121;
  b.update(0.01);
  b.enemies.forEach(e => b.kill(e));
  runUntil(b, () => b.waveIndex === 1, 200);
  assert(b.enemies.every(e => e.berserk && e.ccImmune));
});

test('보스 시전 중 CC를 받으면 시전 차단', G => {
  const b = newBattle(G);
  const boss = new G.Unit(G.Enemies.BOSS_0001, { side: 'enemy', x: 50 });
  b.enemies = [boss];
  b.state = 'BossFight';
  b.startBossPattern(boss);
  G.StatusEffectSystem.apply(boss, { type: 'Stun', duration: 1 });
  b.updateEnemies(0.1);
  assert(boss.cast === null);
  assert(b.drainEvents().some(ev => ev.type === 'interrupt'));
});

console.log('BattleManager');

test('이동 중에는 블록 사용 불가, 조우 후 전투 진입', G => {
  const b = newBattle(G);
  b.blocks.spawn();
  assert(!b.tapBlock(0), 'no tap while moving');
  runUntil(b, () => b.isCombat, 30);
  eq(b.state, 'Fighting');
});

test('블록 탭 → 체인 수만큼 스킬 발동 후 블록 제거', G => {
  const b = newBattle(G);
  runUntil(b, () => b.isCombat, 30);
  const mage = b.heroes[1];
  b.blocks.slots = [{ owner: mage.uid }, { owner: mage.uid }, { owner: mage.uid }];
  b.drainEvents();
  assert(b.tapBlock(1));
  const skill = b.drainEvents().find(ev => ev.type === 'skill');
  eq([skill.caster.uid, skill.chain], [mage.uid, 3]);
  eq(b.blocks.slots.length, 0);
});

test('성직자 회복 = ATK x 10/20/30%, 최대 HP 초과 불가', G => {
  const b = newBattle(G);
  runUntil(b, () => b.isCombat, 30);
  const cleric = b.heroes[2];
  const tank = b.heroes[0];
  tank.hp = 100;
  b.blocks.slots = [{ owner: cleric.uid }, { owner: cleric.uid }];
  b.tapBlock(0);
  eq(tank.hp, 100 + Math.round(cleric.atk * 0.2));
  tank.hp = tank.maxHp - 1;
  b.blocks.slots = [{ owner: cleric.uid }];
  b.tapBlock(0);
  eq(tank.hp, tank.maxHp);
});

test('파티 전멸 시 패배', G => {
  const b = newBattle(G);
  b.heroes.forEach(h => b.kill(h));
  eq(b.state, 'Defeat');
  eq(b.result.stars, 0);
});

test('별 평가: 클리어 / 사망 없음 / 시간', G => {
  const b = newBattle(G);
  b.waveIndex = b.stage.waves.length - 1;
  b.time = 80;
  b.enemies.forEach(e => b.kill(e));
  eq([b.state, b.result.stars], ['Victory', 3]);
});

test('자동 모드로 1-1 스테이지 완주 (헤드리스)', G => {
  const b = newBattle(G, { auto: true });
  runUntil(b, () => false, 600);
  assert(b.isOver, 'battle finished');
  eq(b.state, 'Victory');
});

console.log('Rules / Catalog');

test('최대 레벨 = 등급 × 10, 상위 등급 Lv.1 = 하위 등급 Max Lv 스탯', G => {
  eq([1, 4, 6].map(g => G.Rules.maxLevel(g)), [10, 40, 60]);
  const lowMax = G.Rules.gradeMultiplier(2) * G.Rules.levelMultiplier(20);
  near(G.Rules.gradeMultiplier(3), lowMax, 1e-9);
});

test('기본 유닛 576종 (6직업 × 6등급 × 16색), 같은 직업은 같은 스탯', G => {
  const basics = Object.values(G.Characters).filter(c => c.type === 'Basic');
  eq(basics.length, 576);
  eq(G.Characters.BAS_0001.name, '견습 전사');
  const warriors = basics.filter(c => c.class === 'Warrior');
  assert(warriors.every(c => c.baseStats === warriors[0].baseStats));
  for (let g = 1; g <= 6; g++) eq(basics.filter(c => c.grade === g).length, 96);
});

test('챕터별 10스테이지, 각 웨이브 3 + 보스, 적 강도는 순서대로 증가', G => {
  for (const ch of G.Chapters) eq(ch.stageIds.length, 10, 'chapter ' + ch.chapter);
  eq(G.StageOrder.length, G.Chapters.length * 10);
  G.StageOrder.forEach((id, i) => {
    if (i) assert(G.Stages[id].statMult > G.Stages[G.StageOrder[i - 1]].statMult, id + ' mult');
  });
  for (const id of G.StageOrder) {
    const s = G.Stages[id];
    eq(s.waves.length, 4, id);
    assert(s.waves[3].isBoss && G.Enemies[s.waves[3].monsters[0]].isBoss, id + ' boss');
    s.waves.forEach(w => w.monsters.forEach(m => assert(G.Enemies[m], m)));
  }
});

test('도트 템플릿: 행 길이·팔레트 키 정상, 모든 적에 외형 지정', G => {
  eq(G.PixelArt.validate(), []);
  for (const id of Object.keys(G.Enemies)) assert(G.PixelArt.ENEMY_ART[id], 'art for ' + id);
});

console.log('Progression');

const P = G => G.Progression;
function maxOut(G, unit) { unit.level = G.Rules.maxLevel(unit.grade); unit.exp = 0; }

test('신규 데이터: 직업별 ★1 6명, 파티 3명', G => {
  const s = P(G).newState();
  eq(s.units.length, 6);
  eq(s.party.members.length, 3);
  eq(s.gems, G.Config.STARTING_GEMS);
});

test('경험치로 레벨업, 최대 레벨에서 멈춤', G => {
  const s = P(G).newState();
  const u = s.units[0];
  const need = G.Rules.expToNext(1) + G.Rules.expToNext(2);
  eq(P(G).addExp(s, u, need).to, 3);
  P(G).addExp(s, u, 1e6);
  eq([u.level, u.exp], [10, 0]);
});

test('첫 MAX LEVEL 보상은 유닛 종류별 1회', G => {
  const s = P(G).newState();
  const before = s.gems;
  const a = s.units[0];
  const r1 = P(G).addExp(s, a, 1e6);
  assert(r1.firstMax, 'first reward');
  eq(s.gems, before + G.Config.FIRST_MAX_GEMS_PER_GRADE);
  const dup = P(G).createUnit(s, a.charId);
  assert(!P(G).addExp(s, dup, 1e6).firstMax, 'no second reward');
});

test('스테이지 해금: 이전 스테이지 클리어 필요 (챕터 경계 포함)', G => {
  const s = P(G).newState();
  assert(P(G).isStageUnlocked(s, 'STG_01_01'));
  assert(!P(G).isStageUnlocked(s, 'STG_01_02'));
  P(G).applyBattleResult(s, { stageId: 'STG_01_01', victory: true, stars: 2, time: 80 }, () => 0.99);
  assert(P(G).isStageUnlocked(s, 'STG_01_02'));
  assert(!P(G).isStageUnlocked(s, 'STG_02_01'));
  P(G).applyBattleResult(s, { stageId: 'STG_01_10', victory: true, stars: 1, time: 100 }, () => 0.99);
  assert(P(G).isStageUnlocked(s, 'STG_02_01'));
});

test('승리 보상: 골드·EXP·첫 클리어 보석, 별 최고 기록 유지 / 패배 시 보상 없음', G => {
  const s = P(G).newState();
  const res = (victory, stars) => ({ stageId: 'STG_01_01', victory, stars, time: 80 });
  const first = P(G).applyBattleResult(s, res(true, 3), () => 0.99);
  eq([first.firstClear, first.gems, s.gold], [true, 50, 100]);
  const again = P(G).applyBattleResult(s, res(true, 1), () => 0.99);
  eq([again.firstClear, again.gems, s.stages.STG_01_01.stars], [false, 0, 3]);
  const lose = P(G).applyBattleResult(s, res(false, 0), () => 0.99);
  eq([lose.gold, lose.exp, s.gold], [0, 0, 200]);
});

test('스테이지 드롭: ★1 기본 유닛', G => {
  const s = P(G).newState();
  const r = P(G).applyBattleResult(s, { stageId: 'STG_01_01', victory: true, stars: 1, time: 100 }, () => 0);
  assert(r.drop && r.drop.unit.grade === 1);
  eq(s.units.length, 7);
});

test('합성 조건: 같은 등급, 최대 레벨, 파티 제외', G => {
  const s = P(G).newState();
  const [a, b] = s.units.filter(u => !P(G).isInParty(s, u.uid));
  assert(P(G).synthesisError(s, a.uid, b.uid), 'needs max level');
  maxOut(G, a);
  maxOut(G, b);
  eq(P(G).synthesisError(s, a.uid, b.uid), null);
  const partyUnit = P(G).findUnit(s, s.party.members[0]);
  maxOut(G, partyUnit);
  assert(P(G).synthesisError(s, a.uid, partyUnit.uid), 'party excluded');
  const c = P(G).createUnit(s, 'BAS_0100');
  maxOut(G, c);
  assert(P(G).synthesisError(s, a.uid, c.uid), 'grade mismatch');
});

test('합성: 재료 2개 소모 → 한 단계 위 랜덤 기본 유닛 Lv.1', G => {
  const s = P(G).newState();
  const [a, b] = s.units.filter(u => !P(G).isInParty(s, u.uid));
  maxOut(G, a);
  maxOut(G, b);
  const { unit } = P(G).synthesize(s, a.uid, b.uid, G.createRng(1));
  eq([unit.grade, unit.level, s.units.length], [2, 1, 5]);
  eq(P(G).charOf(unit).type, 'Basic');
});

test('★4 이상 합성 결과 메인 캐릭터 5%, 한정은 제외, 결과 등급 그대로', G => {
  G.Characters.CHR_T1 = { id: 'CHR_T1', name: 'T', class: 'Knight', type: 'Main', grade: 4, baseStats: G.Characters.BAS_0002.baseStats, blockColor: '#fff' };
  G.Characters.CHR_T2 = { id: 'CHR_T2', name: 'L', class: 'Knight', type: 'Limited', grade: 4, baseStats: G.Characters.BAS_0002.baseStats, blockColor: '#fff' };
  const rng = G.createRng(9);
  let mains = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const s = P(G).newState();
    const a = P(G).createUnit(s, 'BAS_0450', 4);
    const b = P(G).createUnit(s, 'BAS_0451', 4);
    maxOut(G, a);
    maxOut(G, b);
    const { unit } = P(G).synthesize(s, a.uid, b.uid, rng);
    eq(unit.grade, 5);
    const type = P(G).charOf(unit).type;
    assert(type !== 'Limited', 'limited excluded');
    if (type === 'Main') mains++;
  }
  near(mains / N, 0.05, 0.012, 'main rate');
});

test('한정 캐릭터가 재료면 경고 필요', G => {
  G.Characters.CHR_T2 = { id: 'CHR_T2', name: 'L', class: 'Knight', type: 'Limited', grade: 4, baseStats: G.Characters.BAS_0002.baseStats, blockColor: '#fff' };
  const s = P(G).newState();
  const lim = P(G).createUnit(s, 'CHR_T2', 4);
  assert(P(G).needsLimitedWarning(s, [s.units[3].uid, lim.uid]));
  assert(!P(G).needsLimitedWarning(s, [s.units[3].uid, s.units[4].uid]));
});

test('강화: 비용 차감, 실패 시 단계 유지, +5 상한', G => {
  const s = P(G).newState();
  s.gold = 1e6;
  const u = s.units[0];
  const cost = P(G).enhanceCost(u);
  eq(P(G).enhance(s, u.uid, () => 0.99).success, true);   // +1 성공률 100%
  eq(u.enhance, 1);
  eq(s.gold, 1e6 - cost);
  const fail = P(G).enhance(s, u.uid, () => 0.95);
  eq([fail.success, u.enhance], [false, 1]);
  while (u.enhance < 5) P(G).enhance(s, u.uid, () => 0);
  assert(P(G).enhanceError(s, u));
  const stats = P(G).unitStats(u);
  eq(stats.atk, Math.round(70 * 1.25));
});

test('진화: 메인 캐릭터만, 최대 레벨 + +5 → 같은 유닛 다음 등급 Lv.1 +0', G => {
  G.Characters.CHR_T1 = { id: 'CHR_T1', name: 'T', class: 'Knight', type: 'Main', grade: 4, baseStats: G.Characters.BAS_0002.baseStats, blockColor: '#fff' };
  const s = P(G).newState();
  const basic = s.units[0];
  maxOut(G, basic);
  basic.enhance = 5;
  assert(P(G).evolveError(basic), 'basic cannot evolve');
  const main = P(G).createUnit(s, 'CHR_T1');
  eq(main.grade, 4);
  maxOut(G, main);
  assert(P(G).evolveError(main), 'needs +5');
  main.enhance = 5;
  P(G).evolve(s, main.uid);
  eq([main.charId, main.grade, main.level, main.enhance], ['CHR_T1', 5, 1, 0]);
});

test('소환: 보석 소모, ★1/★2 기본 유닛', G => {
  const s = P(G).newState();
  const gems = s.gems;
  const { unit } = P(G).summon(s, () => 0.9);
  eq([s.gems, unit.grade], [gems - G.Config.SUMMON_COST, 2]);
  s.gems = 0;
  assert(P(G).summonError(s));
});

test('방출: 파티 제외, 등급별 골드 지급', G => {
  const s = P(G).newState();
  assert(P(G).releaseError(s, P(G).findUnit(s, s.party.members[0])), 'party protected');
  const u = s.units.find(x => !s.party.members.includes(x.uid));
  const gold = P(G).release(s, u.uid);
  eq([gold, s.gold, s.units.length], [G.Config.RELEASE_GOLD[0], G.Config.RELEASE_GOLD[0], 5]);
});

test('도감 보상: 달성 종류 수 도달 시 1회 수령', G => {
  const s = P(G).newState();
  const [need, gems] = G.Config.COLLECTION_MILESTONES[0];
  assert(P(G).collectionMilestones(s).every(m => !m.reached), 'starter 6 < first milestone');
  Object.values(G.Characters).filter(c => c.type === 'Basic').slice(0, need).forEach(c => { s.collection[c.id] = true; });
  const before = s.gems;
  eq(P(G).claimCollection(s, need), gems);
  eq(s.gems, before + gems);
  let threw = false;
  try { P(G).claimCollection(s, need); } catch (e) { threw = true; }
  assert(threw, 'no double claim');
  eq(P(G).sanitize(JSON.parse(JSON.stringify(s))).collectionClaimed, [need]);
});

test('백업 코드/JSON 내보내기·가져오기 왕복, 잘못된 코드는 거부', G => {
  const s = P(G).newState();
  s.gold = 12345;
  s.stages.STG_01_01 = { cleared: true, stars: 3, bestTime: 40 };
  const fromCode = G.SaveManager.importText(G.SaveManager.exportCode(s));
  eq([fromCode.gold, fromCode.units.length, fromCode.stages.STG_01_01.stars], [12345, 6, 3]);
  const fromJson = G.SaveManager.importText(G.SaveManager.exportJson(s));
  eq(fromJson.gold, 12345);
  eq(G.SaveManager.importText('BCRPG1:@@@'), null);
  eq(G.SaveManager.importText('hello'), null);
});

test('파티 배치: 같은 유닛을 다른 칸에 두면 자리 교체', G => {
  const s = P(G).newState();
  const [a, b, c] = s.party.members;
  P(G).setPartyMember(s, 0, c);
  eq(s.party.members, [c, b, a]);
  const extra = s.units.find(u => !s.party.members.includes(u.uid));
  P(G).setPartyMember(s, 1, extra.uid);
  eq(s.party.members, [c, extra.uid, a]);
});

test('저장 데이터 검증: 손상 값 보정, 잘못된 데이터는 거부', G => {
  const s = P(G).newState();
  s.units[0].level = 999;
  s.units[1].charId = 'NOPE';
  s.party.members = [s.units[1].uid, s.units[1].uid];
  const fixed = P(G).sanitize(JSON.parse(JSON.stringify(s)));
  eq(fixed.units.length, 5);
  eq(fixed.units[0].level, 10);
  eq(fixed.party.members.length, 3);
  assert(new Set(fixed.party.members).size === 3);
  eq(P(G).sanitize({ version: 999 }), null);
  eq(P(G).sanitize(null), null);
});

test('파티 엔트리로 전투 생성 (등급·레벨·강화 반영)', G => {
  const s = P(G).newState();
  const u = P(G).findUnit(s, s.party.members[0]);
  u.level = 10;
  u.enhance = 2;
  const b = new G.BattleManager({ stageId: 'STG_01_01', party: P(G).partyEntries(s), leaderIndex: 0, seed: 1 });
  eq(b.heroes[0].maxHp, P(G).unitStats(u).hp);
  assert(b.heroes[0].maxHp > 1500);
});

test('일일 던전: 해금 조건, 승리 시에만 횟수 차감, 날짜가 바뀌면 초기화', G => {
  const s = P(G).newState();
  const id = 'DGN_GOLD_1';
  const win = v => ({ stageId: id, victory: v, stars: 1, time: 100 });
  assert(P(G).dungeonError(s, id, '2026-01-01'));
  s.stages[G.Stages[id].unlock] = { cleared: true, stars: 1, bestTime: 100 };
  eq(P(G).dungeonError(s, id, '2026-01-01'), null);
  const gold = s.gold;
  P(G).applyBattleResult(s, win(false), () => 0.99, '2026-01-01');
  eq(P(G).dailyRunsLeft(s, 'gold', '2026-01-01'), 3);
  for (let i = 0; i < 3; i++) P(G).applyBattleResult(s, win(true), () => 0.99, '2026-01-01');
  eq(s.gold - gold, G.Stages[id].rewards.gold * 3);
  assert(P(G).dungeonError(s, id, '2026-01-01'));
  eq(P(G).dailyRunsLeft(s, 'exp', '2026-01-01'), 3);
  eq(P(G).dailyRunsLeft(s, 'gold', '2026-01-02'), 3);
  eq(s.stages[id], undefined);
  const fixed = P(G).sanitize(JSON.parse(JSON.stringify(s)));
  eq(fixed.daily.runs.gold, 3);
});

test('일일 던전: 골드 던전은 EXP 없음, 경험치 던전은 골드 없음', G => {
  for (const d of G.Dungeons) {
    eq(d.stageIds.length, G.DungeonLevels.length);
    for (const id of d.stageIds) {
      const st = G.Stages[id];
      assert(G.Stages[st.unlock] && !G.StageOrder.includes(id));
      assert(d.reward === 'gold' ? st.rewards.gold > 0 && !st.rewards.exp : st.rewards.exp > 0 && !st.rewards.gold);
      for (const w of st.waves) for (const m of w.monsters) assert(G.Enemies[m], m);
    }
  }
  const s = P(G).newState();
  const r = P(G).applyBattleResult(s, { stageId: 'DGN_GOLD_1', victory: true, stars: 1, time: 100 }, () => 0, '2026-01-01');
  eq(r.levelUps.length, 0);
  eq(r.drop, null);
});

test('일괄 합성: 강화·파티·메인 제외, 둘씩 짝지어 합성', G => {
  const s = P(G).newState();
  const mk = () => { const u = P(G).createUnit(s, 'BAS_0001'); u.level = 10; return u; };
  const free = [mk(), mk(), mk()];
  const enhanced = mk();
  enhanced.enhance = 1;
  P(G).findUnit(s, s.party.members[0]).level = 10;
  eq(P(G).bulkSynthesisPairs(s, 1), [[free[0].uid, free[1].uid]]);
  const before = s.units.length;
  const got = P(G).synthesizeBulk(s, 1, () => 0);
  eq(got.length, 1);
  eq(got[0].unit.grade, 2);
  eq(s.units.length, before - 1);
  assert(P(G).findUnit(s, free[2].uid) && P(G).findUnit(s, enhanced.uid));
});

test('일괄 방출: Lv.1 미강화 비파티 기본 유닛 선택, 파티 포함 시 거부', G => {
  const s = P(G).newState();
  const raised = P(G).createUnit(s, 'BAS_0007');
  raised.level = 2;
  const cands = P(G).bulkReleaseCandidates(s, 0);
  eq(cands.length, 3);
  assert(cands.every(u => !P(G).isInParty(s, u.uid) && u.level === 1));
  eq(P(G).bulkReleaseCandidates(s, 2).length, 0);
  const gold = s.gold;
  eq(P(G).releaseMany(s, cands.map(u => u.uid)), 90);
  eq(s.gold - gold, 90);
  let threw = false;
  try { P(G).releaseMany(s, [raised.uid, s.party.members[0]]); } catch (e) { threw = true; }
  assert(threw && P(G).findUnit(s, raised.uid), '파티 포함 시 아무것도 방출하지 않음');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
