// 체인 레벨별 스킬 실행
(function (G) {
  'use strict';

  G.SkillExecutor = {
    skillOf(caster) {
      return caster.data.skills || G.Classes[caster.data.class].skill;
    },

    canExecute(battle, caster) {
      return this.skillOf(caster).kind === 'heal'
        ? battle.aliveHeroes().length > 0
        : !!battle.frontEnemy();
    },

    // 대상 범위(단일/전체)는 GDD TBD — 현재 피해는 최전방 적 단일, 회복은 HP 비율 최저 아군 단일
    execute(battle, caster, chain) {
      const skill = this.skillOf(caster);
      const coef = skill.coef[chain - 1];
      let targets;

      if (skill.kind === 'heal') {
        targets = [battle.aliveHeroes().sort((a, b) => a.hpRatio - b.hpRatio)[0]];
        battle.emit('skill', { caster, chain, skill, targets });
        for (const t of targets) battle.heal(caster, t, G.DamageCalculator.healAmount(caster, coef));
      } else {
        targets = [battle.frontEnemy()];
        battle.emit('skill', { caster, chain, skill, targets });
        for (const t of targets) battle.dealDamage(caster, t, coef, { chain });
      }

      // 메인 캐릭터 스킬용 상태이상 훅: skill.effects[chain-1] = [{ type, duration, value, chance }]
      const effects = skill.effects && skill.effects[chain - 1];
      if (effects) {
        for (const t of targets) {
          for (const eff of effects) {
            if (t.alive && battle.rng() < (eff.chance != null ? eff.chance : 1)) {
              if (G.StatusEffectSystem.apply(t, eff)) battle.emit('status', { target: t, effect: eff });
            }
          }
        }
      }
      return true;
    }
  };
})(window.Game = window.Game || {});
