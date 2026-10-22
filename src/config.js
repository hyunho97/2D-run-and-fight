// 밸런스/규칙 상수. 괄호 안 숫자는 GDD 섹션, TBD는 GDD 미확정값(테스트하며 조정).
(function (G) {
  'use strict';

  G.Config = {
    // 3.1 블록
    BLOCK_SLOTS: 9,
    BLOCK_SPAWN_INTERVAL: 1.2,     // TBD
    LEADER_WEIGHT_MULT: 2,         // 3.1.1 리더 가중치 2배
    MAX_CHAIN: 3,

    // 2.3.1 광폭화
    BERSERK_TIME: 120,
    BERSERK_WARNING: 10,
    BERSERK_DAMAGE_MULT: 2,
    BERSERK_ASPD_MULT: 2,

    // 13.1 데미지
    DEF_K: 100,                    // TBD
    ELEMENT_ADVANTAGE: 1.25,       // TBD
    ELEMENT_DISADVANTAGE: 0.8,     // TBD
    BASIC_ATTACK_COEF: 0.3,        // TBD (아군 기본 공격 계수)
    ENEMY_ATTACK_COEF: 0.6,        // TBD

    // 13.3 성장
    STAT_GROWTH_PER_LEVEL: 0.03,   // TBD

    // 7.4 평가
    STAR3_TIME: 90,                // TBD (★★★ 클리어 시간)

    // 전투 배치/연출
    MOVE_SPEED: 260,
    FORMATION_GAP: 120,
    ALLY_MIN_GAP: 90,
    ENGAGE_DISTANCE: 620,
    WAVE_SPAWN_DISTANCE: 1100,
    ENEMY_GAP: 110,
    ENEMY_RANGE_JITTER: 50,
    WAVE_CLEAR_DELAY: 1.0,

    // 9.3 자동 블록 사용
    AUTO_DECISION_INTERVAL: 0.6,
    AUTO_HEAL_THRESHOLD: 0.5
  };
})(window.Game = window.Game || {});
