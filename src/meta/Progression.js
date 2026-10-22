// 메타 진행 규칙 (8장 성장, 4.4 합성, 4.5.2 첫 MAX 보상, 4.6 강화/진화, 보상/소환).
// 세이브 상태(state)를 직접 변경하는 순수 로직 — DOM/저장소에 의존하지 않음.
(function (G) {
  'use strict';

  const C = () => G.Config;
  const SAVE_VERSION = 1;
  const poolCache = {};

  function randomOf(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  const P = {
    SAVE_VERSION,

    // ---- 상태 생성 / 조회 ----
    emptyState() {
      return {
        version: SAVE_VERSION, nextUid: 1, gold: 0, gems: C().STARTING_GEMS,
        units: [], party: { members: [], leaderIndex: 0 },
        stages: {}, firstMaxRewarded: {}, collection: {},
        settings: { speed: 1, auto: false, sfx: true, bgm: true },
        tutorialDone: false,
        collectionClaimed: [],
        daily: { date: '', runs: {} },
        tower: { best: 0 },              // 7.3 무한의 탑 최고 돌파 층   // 7.3 일일 던전: 로컬 날짜(YYYY-MM-DD)별 보상 횟수
        stats: { battles: 0, summons: 0, synths: 0 }
      };
    },

    newState() {
      const state = P.emptyState();
      const starters = G.StarterUnits.map(id => P.createUnit(state, id));
      const pick = cls => starters.find(u => P.charOf(u).class === cls).uid;
      state.party.members = [pick('Warrior'), pick('Archer'), pick('Mage')];
      return state;
    },

    createUnit(state, charId, grade) {
      const data = G.Characters[charId];
      if (!data) throw new Error('Unknown character: ' + charId);
      const unit = { uid: state.nextUid++, charId, grade: grade || data.grade, level: 1, exp: 0, enhance: 0 };
      state.units.push(unit);
      state.collection[charId] = true;
      return unit;
    },

    findUnit(state, uid) { return state.units.find(u => u.uid === uid) || null; },
    charOf(unit) { return G.Characters[unit.charId]; },
    isMaxLevel(unit) { return unit.level >= G.Rules.maxLevel(unit.grade); },
    isInParty(state, uid) { return state.party.members.includes(uid); },
    unitStats(unit) { return G.Unit.computeStats(P.charOf(unit), unit); },

    // UI 표시용 전투력 (밸런스 공식 아님)
    power(unit) {
      const s = P.unitStats(unit);
      return Math.round(s.hp * 0.2 + s.atk * 3 + s.def * 2);
    },

    partyUnits(state) { return state.party.members.map(uid => P.findUnit(state, uid)); },

    partyEntries(state) {
      return P.partyUnits(state).map(u => ({ charId: u.charId, grade: u.grade, level: u.level, enhance: u.enhance }));
    },

    // slot 자리에 uid 배치. 이미 다른 칸에 있으면 자리 교체
    setPartyMember(state, slot, uid) {
      if (!P.findUnit(state, uid)) return false;
      const members = state.party.members;
      const from = members.indexOf(uid);
      if (from === slot) return false;
      if (from >= 0) members[from] = members[slot];
      members[slot] = uid;
      return true;
    },

    setLeader(state, slot) { state.party.leaderIndex = slot; },

    // ---- 스테이지 ----
    isStageUnlocked(state, stageId) {
      const stage = G.Stages[stageId];
      if (stage && stage.mode === 'daily') return P.isCleared(state, stage.unlock);
      if (stage && stage.mode === 'tower') return P.isTowerOpen(state) && stage.floor <= state.tower.best + 1;
      const i = G.StageOrder.indexOf(stageId);
      if (i < 0) return false;
      if (i === 0) return true;
      const prev = state.stages[G.StageOrder[i - 1]];
      return !!(prev && prev.cleared);
    },

    isCleared(state, stageId) { return !!(state.stages[stageId] && state.stages[stageId].cleared); },

    // ---- 7.3 일일 던전 ----
    dailyRunsUsed(state, dungeonId, today) {
      return state.daily.date === today ? state.daily.runs[dungeonId] || 0 : 0;
    },

    dailyRunsLeft(state, dungeonId, today) {
      return Math.max(0, C().DAILY_DUNGEON_RUNS - P.dailyRunsUsed(state, dungeonId, today));
    },

    dungeonError(state, stageId, today) {
      const stage = G.Stages[stageId];
      if (!P.isStageUnlocked(state, stageId)) return `${G.Stages[stage.unlock].name} 클리어 후 열립니다.`;
      if (!P.dailyRunsLeft(state, stage.dungeon, today)) return '오늘 보상 횟수를 모두 사용했습니다. 내일 다시 도전하세요.';
      return null;
    },

    // ---- 7.3 무한의 탑 ----
    isTowerOpen(state) { return P.isCleared(state, G.Tower.unlock); },

    // 다음 도전 층 (최고층 달성 후에는 최고층 반복)
    towerNextFloor(state) { return Math.min(state.tower.best + 1, C().TOWER_MAX_FLOOR); },

    nextStageId(stageId) {
      const i = G.StageOrder.indexOf(stageId);
      return i >= 0 && i < G.StageOrder.length - 1 ? G.StageOrder[i + 1] : null;
    },

    // 로비 추천 행동: { text, action }
    // today가 주어지면 남은 일일 던전 보상도 안내
    recommendation(state, today) {
      const first = G.StageOrder[0];
      if (!(state.stages[first] && state.stages[first].cleared)) {
        return { text: '⚔️ 모험에서 1-1을 시작해 보세요. 블록을 눌러 스킬을 쓰는 게임입니다!', action: 'stages' };
      }
      const milestone = P.collectionMilestones(state).find(m => m.reached && !m.claimed);
      if (milestone) return { text: `📚 도감 ${milestone.need}종 달성! 보상 💎 ${milestone.gems}을 받으세요.`, action: 'collection' };
      const synth = state.units.find(u => !P.synthesisSelfError(state, u) && P.synthesisCandidates(state, u.uid).length);
      if (synth) return { text: `🔮 합성할 수 있는 ★${synth.grade} 유닛이 있어요. 합성하면 ★${synth.grade + 1}을 얻습니다.`, action: 'unit', uid: synth.uid };
      if (!P.summonError(state)) return { text: '✨ 보석이 충분해요. 소환으로 동료를 늘리면 합성 재료가 됩니다.', action: 'summon' };
      const dungeon = today && G.Dungeons.find(d => P.isStageUnlocked(state, d.stageIds[0]) && P.dailyRunsLeft(state, d.id, today));
      if (dungeon) return { text: `${dungeon.icon} 오늘의 ${dungeon.name} 보상이 남아 있어요. 일일 던전에서 ${dungeon.reward === 'gold' ? '골드' : '경험치'}를 모으세요.`, action: 'dungeons' };
      const next = G.StageOrder.find(id => !(state.stages[id] && state.stages[id].cleared));
      if (next) return { text: `⚔️ 다음 목표: ${G.Stages[next].name}. 막히면 파티에 없는 유닛도 키워서 합성하세요.`, action: 'stages' };
      return { text: '🏆 모든 스테이지를 클리어했습니다! 별 3개에 도전해 보세요.', action: 'stages' };
    },

    // ---- 경험치 / 레벨 ----
    addExp(state, unit, amount) {
      const from = unit.level;
      const max = G.Rules.maxLevel(unit.grade);
      if (unit.level >= max) return { from, to: from, firstMax: null };
      unit.exp += amount;
      while (unit.level < max && unit.exp >= G.Rules.expToNext(unit.level)) {
        unit.exp -= G.Rules.expToNext(unit.level);
        unit.level++;
      }
      if (unit.level >= max) unit.exp = 0;
      const firstMax = unit.level >= max ? P.grantFirstMax(state, unit) : null;
      return { from, to: unit.level, firstMax };
    },

    // 4.5.2 유닛 종류별 최초 1회
    grantFirstMax(state, unit) {
      if (state.firstMaxRewarded[unit.charId]) return null;
      state.firstMaxRewarded[unit.charId] = true;
      const reward = {
        gold: C().FIRST_MAX_GOLD_PER_GRADE * unit.grade,
        gems: C().FIRST_MAX_GEMS_PER_GRADE * unit.grade
      };
      state.gold += reward.gold;
      state.gems += reward.gems;
      return reward;
    },

    // 전투 결과 반영. 패배 시 보상 없음
    // 일일 던전은 승리 시 보상 횟수 1회 차감 (today: 로컬 날짜 문자열)
    applyBattleResult(state, result, rng, today) {
      const stage = G.Stages[result.stageId];
      const daily = stage.mode === 'daily';
      const summary = {
        victory: result.victory, stars: result.stars, gold: 0, gems: 0, exp: 0,
        firstClear: false, levelUps: [], firstMax: [], drop: null, daily, runsLeft: null
      };
      state.stats.battles++;
      if (!result.victory) {
        if (daily) summary.runsLeft = P.dailyRunsLeft(state, stage.dungeon, today);
        return summary;
      }

      if (daily) {
        if (state.daily.date !== today) state.daily = { date: today, runs: {} };
        state.daily.runs[stage.dungeon] = (state.daily.runs[stage.dungeon] || 0) + 1;
        summary.runsLeft = P.dailyRunsLeft(state, stage.dungeon, today);
      } else if (stage.mode === 'tower') {
        summary.firstClear = stage.floor > state.tower.best;
        if (summary.firstClear) state.tower.best = stage.floor;
      } else {
        const rec = state.stages[stage.id] || (state.stages[stage.id] = { cleared: false, stars: 0, bestTime: null });
        summary.firstClear = !rec.cleared;
        rec.cleared = true;
        rec.stars = Math.max(rec.stars, result.stars);
        rec.bestTime = rec.bestTime == null ? result.time : Math.min(rec.bestTime, result.time);
      }

      // 탑은 첫 돌파 때만 보상
      const paid = stage.mode !== 'tower' || summary.firstClear;
      summary.gold = paid ? stage.rewards.gold : 0;
      state.gold += summary.gold;
      if (summary.firstClear) {
        summary.gems = stage.rewards.firstClearGems || 0;
        state.gems += summary.gems;
      }

      // 경험치 획득: 전투 참여 (4.4.1)
      summary.exp = paid ? stage.rewards.exp : 0;
      for (const unit of summary.exp ? P.partyUnits(state) : []) {
        const r = P.addExp(state, unit, summary.exp);
        const name = P.charOf(unit).name;
        if (r.to > r.from) summary.levelUps.push({ uid: unit.uid, name, from: r.from, to: r.to, max: P.isMaxLevel(unit) });
        if (r.firstMax) summary.firstMax.push(Object.assign({ uid: unit.uid, name }, r.firstMax));
      }

      for (const d of stage.drops || []) {
        if (state.units.length >= C().MAX_UNITS) break;
        if (rng() < d.chance) {
          const charId = randomOf(P.basicPool(d.grade), rng).id;
          const isNew = !state.collection[charId];
          summary.drop = { unit: P.createUnit(state, charId), isNew };
          break;
        }
      }
      return summary;
    },

    // ---- 유닛 풀 ----
    basicPool(grade) {
      const key = 'basic' + grade;
      if (!poolCache[key]) {
        poolCache[key] = Object.values(G.Characters).filter(c => c.type === 'Basic' && c.grade === grade);
      }
      return poolCache[key];
    },

    // 합성 결과에 나올 수 있는 메인 캐릭터 (한정 제외, 4.4.2)
    mainPool() {
      return Object.values(G.Characters).filter(c => c.type === 'Main');
    },

    // ---- 4.4 합성 ----
    synthesisSelfError(state, unit) {
      if (unit.grade >= C().MAX_GRADE) return '★6은 최고 등급이라 합성할 수 없습니다.';
      if (!P.isMaxLevel(unit)) return `최대 레벨(Lv.${G.Rules.maxLevel(unit.grade)})이 되어야 합성할 수 있습니다.`;
      if (P.isInParty(state, unit.uid)) return '파티에 편성된 유닛은 재료로 쓸 수 없습니다.';
      return null;
    },

    synthesisError(state, uidA, uidB) {
      const a = P.findUnit(state, uidA);
      const b = P.findUnit(state, uidB);
      if (!a || !b || uidA === uidB) return '재료 유닛 2개를 선택하세요.';
      if (a.grade !== b.grade) return '같은 등급끼리만 합성할 수 있습니다.';
      return P.synthesisSelfError(state, a) || P.synthesisSelfError(state, b);
    },

    synthesisCandidates(state, uid) {
      return state.units.filter(u => u.uid !== uid && !P.synthesisError(state, uid, u.uid));
    },

    // 4.4.3 한정 캐릭터 포함 시 경고 필요
    needsLimitedWarning(state, uids) {
      return uids.some(uid => {
        const u = P.findUnit(state, uid);
        return u && P.charOf(u).type === 'Limited';
      });
    },

    synthesize(state, uidA, uidB, rng) {
      const err = P.synthesisError(state, uidA, uidB);
      if (err) throw new Error(err);
      const grade = P.findUnit(state, uidA).grade + 1;
      const mains = P.mainPool();
      const charId = grade >= 4 && mains.length && rng() < C().SYNTH_MAIN_CHANCE
        ? randomOf(mains, rng).id
        : randomOf(P.basicPool(grade), rng).id;
      const isNew = !state.collection[charId];
      state.units = state.units.filter(u => u.uid !== uidA && u.uid !== uidB);
      state.stats.synths++;
      // 메인 캐릭터도 합성 결과 등급 그대로 지급 (4.4.2)
      return { unit: P.createUnit(state, charId, grade), isNew };
    },

    // 일괄 합성: 강화하지 않은 기본 유닛만 둘씩 묶음 (강화/메인/한정은 수동 합성)
    bulkSynthesisPairs(state, grade) {
      const pool = state.units
        .filter(u => u.grade === grade && !u.enhance && P.charOf(u).type === 'Basic' && !P.synthesisSelfError(state, u))
        .sort((a, b) => a.uid - b.uid);
      const pairs = [];
      for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i].uid, pool[i + 1].uid]);
      return pairs;
    },

    synthesizeBulk(state, grade, rng) {
      return P.bulkSynthesisPairs(state, grade).map(([a, b]) => P.synthesize(state, a, b, rng));
    },

    // ---- 4.6.1 강화 ----
    enhanceCost(unit) { return C().ENHANCE_COST_BASE * unit.grade * (unit.enhance + 1); },
    enhanceRate(unit) { return C().ENHANCE_RATES[unit.enhance]; },

    enhanceError(state, unit) {
      if (unit.enhance >= C().ENHANCE_MAX) return `이미 최대 강화(+${C().ENHANCE_MAX})입니다.`;
      if (state.gold < P.enhanceCost(unit)) return '골드가 부족합니다.';
      return null;
    },

    // 실패 시 골드만 소모 (단계 유지)
    enhance(state, uid, rng) {
      const unit = P.findUnit(state, uid);
      const err = P.enhanceError(state, unit);
      if (err) throw new Error(err);
      const cost = P.enhanceCost(unit);
      state.gold -= cost;
      const success = rng() < P.enhanceRate(unit);
      if (success) unit.enhance++;
      return { success, cost, enhance: unit.enhance };
    },

    // ---- 4.6.2 진화 (메인 캐릭터 전용) ----
    evolveError(unit) {
      if (P.charOf(unit).type === 'Basic') return '기본 유닛은 진화할 수 없습니다. 합성으로 상위 등급을 얻으세요.';
      if (unit.grade >= C().MAX_GRADE) return '★6은 최고 등급입니다.';
      if (!P.isMaxLevel(unit)) return '최대 레벨이 필요합니다.';
      if (unit.enhance < C().ENHANCE_MAX) return `+${C().ENHANCE_MAX} 강화가 필요합니다.`;
      return null;
    },

    evolve(state, uid) {
      const unit = P.findUnit(state, uid);
      const err = P.evolveError(unit);
      if (err) throw new Error(err);
      unit.grade++;
      unit.level = 1;
      unit.exp = 0;
      unit.enhance = 0;
      return unit;
    },

    // ---- 소환 (보석) ----
    summonError(state) {
      if (state.gems < C().SUMMON_COST) return '보석이 부족합니다.';
      if (state.units.length >= C().MAX_UNITS) return '보관함이 가득 찼습니다. 합성으로 공간을 확보하세요.';
      return null;
    },

    summon(state, rng) {
      const err = P.summonError(state);
      if (err) throw new Error(err);
      state.gems -= C().SUMMON_COST;
      const rates = C().SUMMON_GRADE_RATES;
      let r = rng();
      let grade = rates[rates.length - 1][0];
      for (const [g, p] of rates) {
        if (r < p) { grade = g; break; }
        r -= p;
      }
      const charId = randomOf(P.basicPool(grade), rng).id;
      const isNew = !state.collection[charId];
      state.stats.summons++;
      return { unit: P.createUnit(state, charId), isNew };
    },

    // ---- 4.5.2 도감 ----
    collectionCount(state) {
      return Object.keys(state.collection).filter(id => G.Characters[id] && G.Characters[id].type === 'Basic').length;
    },

    collectionMilestones(state) {
      const count = P.collectionCount(state);
      return C().COLLECTION_MILESTONES.map(([need, gems]) => ({
        need, gems, reached: count >= need, claimed: state.collectionClaimed.includes(need)
      }));
    },

    claimCollection(state, need) {
      const m = P.collectionMilestones(state).find(x => x.need === need);
      if (!m) throw new Error('알 수 없는 보상입니다.');
      if (m.claimed) throw new Error('이미 받은 보상입니다.');
      if (!m.reached) throw new Error(`도감 ${need}종을 모아야 받을 수 있습니다.`);
      state.collectionClaimed.push(need);
      state.gems += m.gems;
      return m.gems;
    },

    // ---- 방출 (보관함 정리) ----
    releaseGold(unit) { return C().RELEASE_GOLD[unit.grade - 1]; },

    releaseError(state, unit) {
      if (P.isInParty(state, unit.uid)) return '파티에 편성된 유닛은 방출할 수 없습니다.';
      return null;
    },

    // 일괄 선택 대상: 파티 제외, 육성하지 않은(Lv.1 +0) 기본 유닛
    bulkReleaseCandidates(state, grade) {
      return state.units.filter(u => (!grade || u.grade === grade) && u.level === 1 && !u.enhance
        && P.charOf(u).type === 'Basic' && !P.isInParty(state, u.uid));
    },

    releaseMany(state, uids) {
      const units = uids.map(uid => P.findUnit(state, uid));
      if (units.some(u => !u)) throw new Error('없는 유닛이 포함되어 있습니다.');
      const err = units.map(u => P.releaseError(state, u)).find(Boolean);
      if (err) throw new Error(err);
      return uids.reduce((gold, uid) => gold + P.release(state, uid), 0);
    },

    release(state, uid) {
      const unit = P.findUnit(state, uid);
      const err = P.releaseError(state, unit);
      if (err) throw new Error(err);
      const gold = P.releaseGold(unit);
      state.units = state.units.filter(u => u.uid !== uid);
      state.gold += gold;
      return gold;
    },

    // ---- 저장 데이터 검증 (손상/구버전 데이터 방어) ----
    sanitize(raw) {
      if (!raw || raw.version !== SAVE_VERSION || !Array.isArray(raw.units)) return null;
      const state = P.emptyState();
      const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);

      const seen = new Set();
      for (const u of raw.units) {
        if (!u || !G.Characters[u.charId] || seen.has(u.uid) || !Number.isFinite(u.uid)) continue;
        seen.add(u.uid);
        const grade = num(u.grade, 1, C().MAX_GRADE, G.Characters[u.charId].grade);
        state.units.push({
          uid: u.uid, charId: u.charId, grade,
          level: num(u.level, 1, G.Rules.maxLevel(grade), 1),
          exp: num(u.exp, 0, 1e9, 0),
          enhance: num(u.enhance, 0, C().ENHANCE_MAX, 0)
        });
      }
      if (state.units.length < 3) return null;

      state.nextUid = Math.max(num(raw.nextUid, 1, 1e9, 1), ...state.units.map(u => u.uid + 1));
      state.gold = num(raw.gold, 0, 1e12, 0);
      state.gems = num(raw.gems, 0, 1e12, 0);

      const members = ((raw.party && raw.party.members) || []).filter((uid, i, arr) => seen.has(uid) && arr.indexOf(uid) === i);
      for (const u of state.units) {
        if (members.length >= 3) break;
        if (!members.includes(u.uid)) members.push(u.uid);
      }
      state.party = { members: members.slice(0, 3), leaderIndex: num(raw.party && raw.party.leaderIndex, 0, 2, 0) };

      for (const [id, rec] of Object.entries(raw.stages || {})) {
        if (!G.Stages[id] || G.Stages[id].mode || !rec) continue;
        state.stages[id] = { cleared: !!rec.cleared, stars: num(rec.stars, 0, 3, 0), bestTime: Number.isFinite(rec.bestTime) ? rec.bestTime : null };
      }
      for (const key of ['firstMaxRewarded', 'collection']) {
        for (const id of Object.keys(raw[key] || {})) if (G.Characters[id]) state[key][id] = true;
      }
      for (const u of state.units) state.collection[u.charId] = true;
      if (raw.settings) {
        state.settings.speed = raw.settings.speed === 2 ? 2 : 1;
        state.settings.auto = !!raw.settings.auto;
        state.settings.sfx = raw.settings.sfx !== false;
        state.settings.bgm = raw.settings.bgm !== false;
      }
      const milestones = C().COLLECTION_MILESTONES.map(m => m[0]);
      state.collectionClaimed = (raw.collectionClaimed || []).filter((n, i, arr) => milestones.includes(n) && arr.indexOf(n) === i);
      if (raw.daily && typeof raw.daily.date === 'string') {
        state.daily.date = raw.daily.date;
        for (const d of G.Dungeons) {
          const n = raw.daily.runs && raw.daily.runs[d.id];
          if (n) state.daily.runs[d.id] = num(n, 0, C().DAILY_DUNGEON_RUNS, 0);
        }
      }
      if (raw.tower) state.tower.best = num(raw.tower.best, 0, C().TOWER_MAX_FLOOR, 0);
      state.tutorialDone = !!raw.tutorialDone || !!(state.stages.STG_01_01 && state.stages.STG_01_01.cleared);
      Object.assign(state.stats, raw.stats);
      return state;
    }
  };

  G.Progression = P;
})(window.Game = window.Game || {});
