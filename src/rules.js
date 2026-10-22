// 성장 공식 (4.4 등급, 4.6 강화, 13.3 성장 곡선)
(function (G) {
  'use strict';

  const C = () => G.Config;

  G.Rules = {
    // 최대 레벨 = 등급 × 10
    maxLevel(grade) {
      return grade * 10;
    },

    // 스탯(Lv) = 기본스탯 × (1 + 성장률 × (Lv - 1))
    levelMultiplier(level) {
      return 1 + C().STAT_GROWTH_PER_LEVEL * (level - 1);
    },

    // 상위 등급 Lv.1 = 하위 등급 Max Lv 스탯 (13.3 권장안)
    gradeMultiplier(grade) {
      let m = 1;
      for (let g = 1; g < grade; g++) m *= this.levelMultiplier(this.maxLevel(g));
      return m;
    },

    enhanceMultiplier(enhance) {
      return 1 + C().ENHANCE_STAT_PER_STEP * (enhance || 0);
    },

    // 필요 경험치(Lv) = a × Lv^b
    expToNext(level) {
      return Math.round(C().EXP_A * Math.pow(level, C().EXP_B));
    }
  };
})(window.Game = window.Game || {});
