// 게임 데이터 (GDD 11장 JSON 구조를 따름). 수치는 프로토타입용 임시값.
(function (G) {
  'use strict';

  // 4.2 직업 + 4.5.3 기본 유닛 스킬 (직업별 공통)
  G.Classes = {
    Warrior: { name: '전사', role: '탱커', damageType: 'Physical', range: 'Melee', glyph: '전',
      skill: { name: '휘두르기', kind: 'damage', coef: [0.45, 1.15, 2.0] } },
    Knight: { name: '기사', role: '딜러', damageType: 'Physical', range: 'Melee', glyph: '기',
      skill: { name: '베기', kind: 'damage', coef: [0.45, 1.15, 2.0] } },
    Archer: { name: '궁수', role: '딜러', damageType: 'Physical', range: 'Ranged', glyph: '궁',
      skill: { name: '활쏘기', kind: 'damage', coef: [0.45, 1.15, 2.0] } },
    Mage: { name: '마법사', role: '딜러', damageType: 'Magic', range: 'Ranged', glyph: '마',
      skill: { name: '에너지볼트', kind: 'damage', coef: [0.45, 1.15, 2.0] } },
    Cleric: { name: '성직자', role: '힐러', damageType: 'Magic', range: 'Ranged', glyph: '성',
      skill: { name: '하급 치유', kind: 'heal', coef: [0.10, 0.20, 0.30] } },
    Hunter: { name: '사냥꾼', role: '서포터', damageType: 'Physical', range: 'Ranged', glyph: '사',
      skill: { name: '덫 깔기', kind: 'damage', coef: [0.45, 1.15, 2.0] } }
  };

  G.RangeValues = { Melee: 120, Ranged: 560 };

  // 11.1 캐릭터 데이터 — 직업별 기본 유닛 1종씩
  G.Characters = {
    BAS_0001: { id: 'BAS_0001', name: '견습 전사', class: 'Warrior', type: 'Basic', grade: 1, element: 'Fire',
      baseStats: { hp: 1500, atk: 70, def: 60, cri: 0.05, crd: 1.5, eva: 0.03, aspd: 0.8, pen: 0 },
      blockColor: '#E0584A' },
    BAS_0002: { id: 'BAS_0002', name: '견습 기사', class: 'Knight', type: 'Basic', grade: 1, element: 'Light',
      baseStats: { hp: 1050, atk: 95, def: 40, cri: 0.08, crd: 1.5, eva: 0.03, aspd: 0.9, pen: 0.1 },
      blockColor: '#F2B134' },
    BAS_0003: { id: 'BAS_0003', name: '견습 궁수', class: 'Archer', type: 'Basic', grade: 1, element: 'Wind',
      baseStats: { hp: 760, atk: 100, def: 25, cri: 0.12, crd: 1.6, eva: 0.08, aspd: 1.0, pen: 0 },
      blockColor: '#4CB050' },
    BAS_0004: { id: 'BAS_0004', name: '견습 마법사', class: 'Mage', type: 'Basic', grade: 1, element: 'Water',
      baseStats: { hp: 700, atk: 115, def: 20, cri: 0.06, crd: 1.5, eva: 0.03, aspd: 0.7, pen: 0.2 },
      blockColor: '#4F7BE8' },
    BAS_0005: { id: 'BAS_0005', name: '견습 성직자', class: 'Cleric', type: 'Basic', grade: 1, element: 'Light',
      baseStats: { hp: 820, atk: 90, def: 30, cri: 0.03, crd: 1.5, eva: 0.03, aspd: 0.7, pen: 0 },
      blockColor: '#B57BE0' },
    BAS_0006: { id: 'BAS_0006', name: '견습 사냥꾼', class: 'Hunter', type: 'Basic', grade: 1, element: 'Wind',
      baseStats: { hp: 860, atk: 90, def: 30, cri: 0.1, crd: 1.5, eva: 0.06, aspd: 0.9, pen: 0 },
      blockColor: '#2BB3A8' }
  };

  // 6.1 / 6.2 적 데이터
  G.Enemies = {
    MON_0001: { id: 'MON_0001', name: '슬라임', type: 'Melee', element: 'Water', range: 110,
      baseStats: { hp: 220, atk: 38, def: 15, aspd: 0.8 }, color: '#5FC79B', size: 70 },
    MON_0002: { id: 'MON_0002', name: '고블린 궁수', type: 'Ranged', element: 'Wind', range: 450,
      baseStats: { hp: 160, atk: 45, def: 10, aspd: 0.7 }, color: '#9A8F3C', size: 64 },
    MON_0003: { id: 'MON_0003', name: '오크 전사', type: 'Melee', element: 'Fire', range: 110,
      baseStats: { hp: 480, atk: 60, def: 35, aspd: 0.6 }, color: '#7A9A5A', size: 96 },
    BOSS_0001: { id: 'BOSS_0001', name: '숲의 군주', type: 'Melee', element: 'Wind', range: 170, isBoss: true,
      baseStats: { hp: 2600, atk: 80, def: 45, aspd: 0.55 }, color: '#5B4A8A', size: 170,
      phases: [{ hpRatio: 0.5, aspdMult: 1.5 }],
      pattern: { name: '대지 강타', interval: 9, castTime: 2, coef: 1.6 } }
  };

  // 11.4 스테이지 데이터 (7.2 구조: 웨이브 3 + 보스)
  G.Stages = {
    STG_01_01: {
      id: 'STG_01_01', chapter: 1, name: '1-1 숲의 입구',
      waves: [
        { monsters: ['MON_0001', 'MON_0001', 'MON_0002'] },
        { monsters: ['MON_0002', 'MON_0003', 'MON_0001'] },
        { monsters: ['MON_0003', 'MON_0003', 'MON_0002'] },
        { monsters: ['BOSS_0001'], isBoss: true }
      ],
      rewards: { gold: 100, exp: 50, drops: [] }
    }
  };

  G.DefaultParty = { members: ['BAS_0001', 'BAS_0004', 'BAS_0005'], leaderIndex: 0 };
})(window.Game = window.Game || {});
