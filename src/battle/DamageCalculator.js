// 13.1 데미지 공식
// 최종 피해 = ATK × 스킬계수 × (1 - 방어감소율) × 속성배율 × 치명타배율 × 광폭배율
(function (G) {
  'use strict';

  // 5.4 속성 상성: 불 → 바람 → 물 → 불, 빛 ↔ 어둠
  const BEATS = { Fire: 'Wind', Wind: 'Water', Water: 'Fire', Light: 'Dark', Dark: 'Light' };

  G.DamageCalculator = {
    elementMultiplier(atkElement, defElement) {
      if (!atkElement || !defElement) return 1;
      if (BEATS[atkElement] === defElement) return G.Config.ELEMENT_ADVANTAGE;
      // 빛/어둠은 서로 강점이므로 약점 판정 없음
      if (BEATS[defElement] === atkElement && atkElement !== 'Light' && atkElement !== 'Dark') {
        return G.Config.ELEMENT_DISADVANTAGE;
      }
      return 1;
    },

    defenseReduction(attacker, target) {
      const effDef = Math.max(0, target.defense * (1 - attacker.stats.pen));
      return effDef / (effDef + G.Config.DEF_K);
    },

    compute(attacker, target, coef, rng) {
      if (rng() < target.stats.eva) return { miss: true, crit: false, amount: 0 };

      const crit = rng() < attacker.stats.cri;
      const raw = attacker.atk * coef
        * (1 - this.defenseReduction(attacker, target))
        * this.elementMultiplier(attacker.element, target.element)
        * (crit ? attacker.stats.crd : 1)
        * (attacker.berserk ? G.Config.BERSERK_DAMAGE_MULT : 1);
      return { miss: false, crit, amount: Math.max(1, Math.round(raw)) };
    },

    // 회복량 = ATK × 회복계수
    healAmount(caster, coef) {
      return Math.max(1, Math.round(caster.atk * coef));
    }
  };
})(window.Game = window.Game || {});
