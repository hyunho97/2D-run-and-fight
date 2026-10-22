// 자동 모드 밸런스 시뮬레이션
// node tools/simulate.js [runs] [partyIds,comma] [leaderIndex] [stage=STG_01_01] [level=1] [grade=1] [CONFIG_KEY=value ...]
// stage=all 이면 챕터 전체를 요약 출력, stage=TWR_0012 이면 무한의 탑 12층
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['core', 'config', 'rules', 'data', 'battle/StatusEffectSystem', 'battle/DamageCalculator', 'battle/Unit',
  'battle/ChainResolver', 'battle/BlockManager', 'battle/SkillExecutor', 'battle/BattleManager'];

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8'), ctx);
const G = ctx.Game;

const opts = { stage: 'STG_01_01', level: 1, grade: 0 };
const positional = [];
for (const a of process.argv.slice(2)) {
  if (!a.includes('=')) { positional.push(a); continue; }
  const [key, value] = a.split('=');
  if (key in opts) opts[key] = key === 'stage' ? value : Number(value);
  else if (key in G.Config) G.Config[key] = Number(value);
  else throw new Error('Unknown option: ' + key);
}

const runs = Number(positional[0]) || 200;
const ids = positional[1] ? positional[1].split(',') : G.DefaultParty.members;
const leaderIndex = Number(positional[2]) || 0;
const party = ids.map(id => ({ charId: id, grade: opts.grade || G.Characters[id].grade, level: opts.level }));

function simulate(stageId, verbose) {
  let wins = 0, totalTime = 0, berserkHits = 0;
  const stars = [0, 0, 0, 0];
  const waveTimes = [];
  for (let seed = 1; seed <= runs; seed++) {
    const b = new G.BattleManager({ stageId, party, leaderIndex, seed, auto: true });
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
  }
  const line = `${stageId}  win ${(wins / runs * 100).toFixed(0).padStart(3)}%  clear ${(totalTime / Math.max(1, wins)).toFixed(0).padStart(3)}s  berserk ${(berserkHits / runs * 100).toFixed(0).padStart(3)}%  stars ${stars.join('/')}`;
  console.log(line);
  if (verbose) console.log('  avg time per wave:', waveTimes.map(t => (t / runs).toFixed(1) + 's').join(' / '));
}

console.log(`party=${ids.join(',')} leader=${leaderIndex} grade=${opts.grade || 'data'} level=${opts.level} runs=${runs}`);
if (opts.stage === 'all') G.StageOrder.forEach(id => simulate(id, false));
else if (/^TWR_\d+$/.test(opts.stage)) simulate(G.Tower.stage(Number(opts.stage.slice(4))), true);
else simulate(opts.stage, true);
