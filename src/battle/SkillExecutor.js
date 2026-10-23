// 체인 레벨별 스킬 실행
(function (G) {
  'use strict';

  G.SkillExecutor = {
    skillOf(caster) {
      return caster.data.skills || G.Classes[caster.data.class].skill;
    },

    // 체인 레벨의 실제 효과. 기본 유닛 스킬(coef 배열)도 메인 캐릭터 형식(chains)으로 맞춘다
    // → { name, kind: 'damage'|'heal'|'both', damage, heal, buffs, cleanse, effects }
    skillAt(caster, chain) {
      const s = this.skillOf(caster);
      let c;
      if (s.chains) c = Object.assign({}, s.chains[chain - 1]);
      else {
        // 대상 범위(단일/전체)는 GDD TBD — 현재 피해는 최전방 적 단일, 회복은 HP 비율 최저 아군 단일
        const coef = s.coef[chain - 1];
        c = s.kind === 'heal'
          ? { name: s.name, heal: { target: 'lowestAlly', coef } }
          : { name: s.name, damage: { target: 'frontEnemy', coef } };
        // 메인 캐릭터 스킬용 상태이상 훅: skill.effects[chain-1] = [{ type, duration, value, chance }]
        c.effects = s.effects && s.effects[chain - 1];
      }
      c.kind = c.damage && c.heal ? 'both' : c.heal ? 'heal' : 'damage';
      return c;
    },

    canExecute(battle, caster, chain) {
      return this.skillAt(caster, chain || 1).damage
        ? !!battle.frontEnemy()
        : battle.aliveHeroes().length > 0;
    },

    execute(battle, caster, chain) {
      const skill = this.skillAt(caster, chain);
      const SES = G.StatusEffectSystem;
      let foes = [];
      let allies = [];

      if (skill.heal) {
        const heroes = battle.aliveHeroes();
        allies = skill.heal.target === 'allAllies' ? heroes : [heroes.sort((a, b) => a.hpRatio - b.hpRatio)[0]];
      }
      const d = skill.damage;
      if (d && d.target === 'allEnemies') foes = battle.aliveEnemies();
      else if (d && d.target !== 'randomEnemy') foes = [battle.frontEnemy()];
      // randomEnemy 는 맞을 때마다 대상을 고르므로 아래 루프에서 채운다 (이벤트는 프레임 끝에 소비됨)
      const targets = d ? foes : allies;
      battle.emit('skill', { caster, chain, skill, targets, allies });

      if (d && d.target === 'randomEnemy') {
        for (let i = 0; i < (d.hits || 1); i++) {
          const alive = battle.aliveEnemies();
          if (!alive.length) break;
          const t = alive[Math.floor(battle.rng() * alive.length)];
          foes.push(t);
          battle.dealDamage(caster, t, d.coef, { chain });
        }
      } else if (d) {
        for (const t of foes) battle.dealDamage(caster, t, d.coef, { chain });
      }

      if (skill.heal) {
        const amount = G.DamageCalculator.healAmount(caster, skill.heal.coef);
        for (const t of allies) {
          battle.heal(caster, t, amount);
          if (skill.cleanse && t.alive) SES.cleanseDebuffs(t);
          for (const b of skill.buffs || []) {
            const eff = { type: b.type, duration: b.duration, value: b.valueCoef ? Math.max(1, Math.round(caster.atk * b.valueCoef)) : b.value };
            if (SES.apply(t, eff)) battle.emit('status', { target: t, effect: eff });
          }
        }
      }

      if (skill.effects) {
        for (const t of targets) {
          for (const eff of skill.effects) {
            if (t.alive && battle.rng() < (eff.chance != null ? eff.chance : 1)) {
              if (SES.apply(t, eff)) battle.emit('status', { target: t, effect: eff });
            }
          }
        }
      }
      return true;
    }
  };
})(window.Game = window.Game || {});
