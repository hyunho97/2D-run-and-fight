// 자동 모드 밸런스 시뮬레이션: node tools/simulate.js [runs] [partyIds,comma] [leaderIndex] [CONFIG_KEY=value ...]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['core', 'config', 'data', 'battle/StatusEffectSystem', 'battle/DamageCalculator', 'battle/Unit',
  'battle/ChainResolver', 'battle/BlockManager', 'battle/SkillExecutor', 'battle/BattleManager'];

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8'), ctx);
const G = ctx.Game;

const overrides = process.argv.slice(2).filter(a => a.includes('='));
const positional = process.argv.slice(2).filter(a => !a.includes('='));
for (const o of overrides) {
  const [key, value] = o.split('=');
  if (!(key in G.Config)) throw new Error('Unknown config key: ' + key);
  G.Config[key] = Number(value);
}

const runs = Number(positional[0]) || 200;
const party = positional[1] ? positional[1].split(',') : G.DefaultParty.members;
const leaderIndex = Number(positional[2]) || 0;

let wins = 0, totalTime = 0, berserkHits = 0;
const stars = [0, 0, 0, 0];
const reachedWave = {};
const waveTimes = [];
for (let seed = 1; seed <= runs; seed++) {
  const b = new G.BattleManager({ stageId: 'STG_01_01', party, leaderIndex, seed, auto: true });
  let lastWave = 0, waveStart = 0;
  while (!b.isOver && b.time < 600) {
    b.update(1 / 60);
    if (b.waveIndex !== lastWave || b.isOver) {
      waveTimes[lastWave] = (waveTimes[lastWave] || 0) + (b.time - waveStart);
      lastWave = b.waveIndex;
      waveStart = b.time;
    }
  }
  if (b.state === 'Victory') { wins++; totalTime += b.time; }
  if (b.berserk) berserkHits++;
  stars[b.result ? b.result.stars : 0]++;
  reachedWave[b.waveIndex] = (reachedWave[b.waveIndex] || 0) + 1;
}
console.log(`party=${party.join(',')} leader=${leaderIndex} runs=${runs} ${overrides.join(' ')}`);
console.log(`win ${(wins / runs * 100).toFixed(1)}%  avg clear ${(totalTime / Math.max(1, wins)).toFixed(1)}s  berserk ${(berserkHits / runs * 100).toFixed(1)}%`);
console.log(`stars 0:${stars[0]} 1:${stars[1]} 2:${stars[2]} 3:${stars[3]}  final wave index:`, JSON.stringify(reachedWave));
console.log('avg time per wave:', waveTimes.map(t => (t / runs).toFixed(1) + 's').join(' / '));
