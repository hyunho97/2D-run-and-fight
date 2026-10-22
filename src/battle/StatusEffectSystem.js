// 5.3 상태 이상 처리. status: { type, remaining, value, tickTimer }
(function (G) {
  'use strict';

  const CC_TYPES = ['Stun', 'Freeze'];
  const STACKABLE = ['Burn'];
  const TICKING = ['Burn', 'Regen'];

  G.StatusEffectSystem = {
    CC_TYPES,

    // effect: { type, duration, value }. 적용되면 true
    apply(unit, effect) {
      if (!unit.alive) return false;
      if (CC_TYPES.includes(effect.type) && unit.ccImmune) return false;

      if (!STACKABLE.includes(effect.type)) {
        const existing = unit.statuses.find(s => s.type === effect.type);
        if (existing) {
          existing.remaining = Math.max(existing.remaining, effect.duration);
          existing.value = Math.max(existing.value, effect.value || 0);
          return true;
        }
      }
      unit.statuses.push({ type: effect.type, remaining: effect.duration, value: effect.value || 0, tickTimer: 1 });
      return true;
    },

    // onTick(unit, status): 화상/지속 치유의 1초 틱
    update(unit, dt, onTick) {
      for (const s of unit.statuses) {
        s.remaining -= dt;
        if (TICKING.includes(s.type)) {
          s.tickTimer -= dt;
          while (s.tickTimer <= 0 && unit.alive) {
            s.tickTimer += 1;
            onTick(unit, s);
          }
        }
      }
      unit.statuses = unit.statuses.filter(s => s.remaining > 0 && !(s.type === 'Shield' && s.value <= 0));
    },

    isDisabled(unit) {
      return unit.statuses.some(s => CC_TYPES.includes(s.type));
    },

    cleanseCC(unit) {
      unit.statuses = unit.statuses.filter(s => !CC_TYPES.includes(s.type));
    },

    defMultiplier(unit) {
      return unit.statuses
        .filter(s => s.type === 'DefDown')
        .reduce((m, s) => m * (1 - s.value), 1);
    },

    // 보호막으로 피해 흡수 후 남은 피해량 반환
    absorb(unit, amount) {
      for (const s of unit.statuses) {
        if (s.type !== 'Shield' || amount <= 0) continue;
        const used = Math.min(s.value, amount);
        s.value -= used;
        amount -= used;
      }
      return amount;
    }
  };
})(window.Game = window.Game || {});
