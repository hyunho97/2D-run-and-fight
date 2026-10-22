// 전투 유닛 (아군/적 공용)
(function (G) {
  'use strict';

  let nextUid = 1;

  class Unit {
    // opts: { side: 'hero'|'enemy', x, slot, isLeader, level, attackDelay, rangeJitter }
    constructor(data, opts) {
      this.uid = nextUid++;
      this.data = data;
      this.side = opts.side;
      this.name = data.name;
      this.slot = opts.slot || 0;
      this.isLeader = !!opts.isLeader;
      this.isBoss = !!data.isBoss;
      this.level = opts.level || 1;
      this.element = data.element || null;

      // 13.3 스탯(Lv) = 기본스탯 × (1 + 성장률 × (Lv - 1)), HP/ATK/DEF만 성장
      const s = data.baseStats;
      const growth = 1 + G.Config.STAT_GROWTH_PER_LEVEL * (this.level - 1);
      this.stats = {
        hp: Math.round(s.hp * growth),
        atk: Math.round(s.atk * growth),
        def: Math.round(s.def * growth),
        cri: s.cri || 0,
        crd: s.crd || 1.5,
        eva: s.eva || 0,
        aspd: s.aspd || 1,
        pen: s.pen || 0
      };
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
  }

  G.Unit = Unit;
})(window.Game = window.Game || {});
