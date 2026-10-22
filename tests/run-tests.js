// 전투 로직 단위 테스트 (Node, 의존성 없음): node tests/run-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LOGIC_FILES = [
  'src/core.js',
  'src/config.js',
  'src/data.js',
  'src/battle/StatusEffectSystem.js',
  'src/battle/DamageCalculator.js',
  'src/battle/Unit.js',
  'src/battle/ChainResolver.js',
  'src/battle/BlockManager.js',
  'src/battle/SkillExecutor.js',
  'src/battle/BattleManager.js'
];

function loadGame() {
  const ctx = { console };
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

test('리더 블록 생성 확률 50% / 멤버 25%', G => {
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
