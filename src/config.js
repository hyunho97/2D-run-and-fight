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
    EXP_A: 10,                     // TBD 필요 경험치(Lv) = a × Lv^b
    EXP_B: 1.3,                    // TBD
    MAX_GRADE: 6,

    // 4.6.1 강화
    ENHANCE_MAX: 5,
    ENHANCE_STAT_PER_STEP: 0.05,   // TBD (HP/ATK/DEF +5%/단계)
    ENHANCE_RATES: [1, 0.9, 0.8, 0.7, 0.6],  // TBD (+1 ~ +5 성공 확률)
    ENHANCE_COST_BASE: 200,        // TBD 골드 = 기준 × 등급 × 목표 단계. 실패 시 골드만 소모

    // 4.4.2 합성
    SYNTH_MAIN_CHANCE: 0.05,       // ★4 이상 결과에서 메인 캐릭터(일반) 확률

    // 4.5.2 첫 MAX LEVEL 보상 (TBD)
    FIRST_MAX_GOLD_PER_GRADE: 300,
    FIRST_MAX_GEMS_PER_GRADE: 10,

    // 재화 / 획득 (TBD)
    STARTING_GEMS: 300,
    SUMMON_COST: 100,
    SUMMON_GRADE_RATES: [[1, 0.8], [2, 0.2]],  // [등급, 확률]
    STAGE_DROP_CHANCE: 0.3,        // 클리어 시 ★1 기본 유닛 드롭
    MAX_UNITS: 200,                // 보관함 최대 칸

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
