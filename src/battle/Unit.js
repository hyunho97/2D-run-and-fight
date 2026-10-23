// 전투 유닛 (아군/적 공용)
(function (G) {
  'use strict';

  let nextUid = 1;

  class Unit {
    // opts: { side: 'hero'|'enemy', x, slot, isLeader, grade, level, enhance, statMult, attackDelay, rangeJitter }
    constructor(data, opts) {
      this.uid = nextUid++;
      this.grade = opts.grade || data.grade || 1;
      this.data = opts.side === 'hero' ? G.charForm(data, this.grade) : data;   // 메인 캐릭터는 등급별 외형·스킬
      this.side = opts.side;
      this.name = data.name;
      this.slot = opts.slot || 0;
      this.isLeader = !!opts.isLeader;
      this.isBoss = !!data.isBoss;
      this.level = opts.level || 1;
      this.enhance = opts.enhance || 0;
      this.element = data.element || null;
      this.stats = Unit.computeStats(data, this.side === 'hero'
        ? { grade: this.grade, level: this.level, enhance: this.enhance }
        : { statMult: opts.statMult });
      this.maxHp = this.stats.hp;
      this.hp = this.maxHp;

      const baseRange = data.range != null ? data.range : G.RangeValues[G.Classes[data.class].range];
      this.range = baseRange - (opts.rangeJitter || 0);

      this.x = opts.x || 0;
      this.alive = true;
      this.attackTimer = opts.attackDelay != null ? opts.attackDelay : 0.5;
      this.statuses = [];
      this.berserk = false;
      this.ccImmune = false;
      this.aspdMult = 1;
      this.phase = 1;
      this.cast = null;
      this.castTimer = data.pattern ? data.pattern.interval : 0;
      this.fx = { flash: 0, lunge: 0 };   // 렌더러 전용 연출 타이머
    }

    get atk() { return this.stats.atk; }
    get defense() { return this.stats.def * G.StatusEffectSystem.defMultiplier(this); }
    get aspd() { return this.stats.aspd * this.aspdMult * (this.berserk ? G.Config.BERSERK_ASPD_MULT : 1); }
    get hpRatio() { return this.hp / this.maxHp; }
    get color() { return this.data.blockColor || this.data.color; }

    // HP/ATK/DEF만 등급·레벨·강화(아군) 또는 스테이지 배율(적)로 성장. 나머지는 고유값 (4.4.4)
    static computeStats(data, o) {
      const s = data.baseStats;
      const mult = o.statMult != null
        ? o.statMult
        : G.Rules.gradeMultiplier(o.grade || 1) * G.Rules.levelMultiplier(o.level || 1) * G.Rules.enhanceMultiplier(o.enhance);
      return {
        hp: Math.round(s.hp * mult),
        atk: Math.round(s.atk * mult),
        def: Math.round(s.def * mult),
        cri: s.cri || 0,
        crd: s.crd || 1.5,
        eva: s.eva || 0,
        aspd: s.aspd || 1,
        pen: s.pen || 0
      };
    }
  }

  G.Unit = Unit;
})(window.Game = window.Game || {});
