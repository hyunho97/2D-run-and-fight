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
  G.ClassOrder = ['Warrior', 'Knight', 'Archer', 'Mage', 'Cleric', 'Hunter'];

  G.RangeValues = { Melee: 120, Ranged: 560 };

  G.TypeLabels = { Basic: '기본', Main: '메인', Limited: '한정' };

  // ---- 4.5 기본 유닛 카탈로그 ----
  // 같은 직업은 같은 스탯·스킬, 이름과 의상 색상만 다른 바리에이션.
  // 6직업 × 6등급 × 16색 = 576종. ★1 기본색(variant 0)이 BAS_0001~0006.
  const CLASS_BASE = {
    Warrior: { element: 'Fire', color: '#E0584A',
      stats: { hp: 1500, atk: 70, def: 60, cri: 0.05, crd: 1.5, eva: 0.03, aspd: 0.8, pen: 0 } },
    Knight: { element: 'Light', color: '#F2B134',
      stats: { hp: 1050, atk: 95, def: 40, cri: 0.08, crd: 1.5, eva: 0.03, aspd: 0.9, pen: 0.1 } },
    Archer: { element: 'Wind', color: '#4CB050',
      stats: { hp: 760, atk: 100, def: 25, cri: 0.12, crd: 1.6, eva: 0.08, aspd: 1.0, pen: 0 } },
    Mage: { element: 'Water', color: '#4F7BE8',
      stats: { hp: 700, atk: 115, def: 20, cri: 0.06, crd: 1.5, eva: 0.03, aspd: 0.7, pen: 0.2 } },
    Cleric: { element: 'Light', color: '#B57BE0',
      stats: { hp: 820, atk: 90, def: 30, cri: 0.03, crd: 1.5, eva: 0.03, aspd: 0.7, pen: 0 } },
    Hunter: { element: 'Wind', color: '#2BB3A8',
      stats: { hp: 860, atk: 90, def: 30, cri: 0.1, crd: 1.5, eva: 0.06, aspd: 0.9, pen: 0 } }
  };
  const GRADE_TITLES = ['견습', '숙련', '정예', '베테랑', '영웅', '전설'];
  const VARIANTS = [
    ['', null], ['붉은', '#C0392B'], ['푸른', '#2E86DE'], ['초록', '#27AE60'],
    ['황금', '#D4A017'], ['은빛', '#95A5B5'], ['검은', '#4A4E5A'], ['하얀', '#D9DEE6'],
    ['보랏빛', '#8E44AD'], ['주홍', '#E67E22'], ['청록', '#16A085'], ['갈색', '#8B5A2B'],
    ['분홍', '#E86FA4'], ['남색', '#34495E'], ['연두', '#9BC53D'], ['자주', '#A0306E']
  ];

  G.Characters = {};
  let serial = 0;
  for (let grade = 1; grade <= 6; grade++) {
    VARIANTS.forEach(([prefix, color], variant) => {
      for (const cls of G.ClassOrder) {
        serial++;
        const id = 'BAS_' + String(serial).padStart(4, '0');
        const base = CLASS_BASE[cls];
        G.Characters[id] = {
          id, class: cls, type: 'Basic', grade, variant, element: base.element,
          name: (prefix ? prefix + ' ' : '') + GRADE_TITLES[grade - 1] + ' ' + G.Classes[cls].name,
          baseStats: base.stats,                 // ★1 Lv.1 기준. 등급/레벨/강화 배율은 G.Rules
          blockColor: color || base.color
        };
      }
    });
  }

  // 4.3 메인 캐릭터 — 상세 설계 보류. 형식만 정의 (type: 'Main' | 'Limited', grade: 4, skills 고유)
  // 예) G.Characters.CHR_0001 = { id, name, class, type: 'Main', grade: 4, element, baseStats, blockColor, skills }

  // ---- 6.1 / 6.2 적 데이터 ----
  G.Enemies = {
    MON_0001: { id: 'MON_0001', name: '슬라임', type: 'Melee', element: 'Water', range: 110,
      baseStats: { hp: 220, atk: 38, def: 15, aspd: 0.8 }, color: '#5FC79B', size: 70 },
    MON_0002: { id: 'MON_0002', name: '고블린 궁수', type: 'Ranged', element: 'Wind', range: 450,
      baseStats: { hp: 160, atk: 45, def: 10, aspd: 0.7 }, color: '#9A8F3C', size: 64 },
    MON_0003: { id: 'MON_0003', name: '오크 전사', type: 'Melee', element: 'Fire', range: 110,
      baseStats: { hp: 480, atk: 60, def: 35, aspd: 0.6 }, color: '#7A9A5A', size: 96 },
    MON_0004: { id: 'MON_0004', name: '회색 늑대', type: 'Melee', element: 'Wind', range: 100,
      baseStats: { hp: 260, atk: 32, def: 12, aspd: 1.2 }, color: '#8C8C9E', size: 66 },
    MON_0005: { id: 'MON_0005', name: '버섯 술사', type: 'Ranged', element: 'Water', range: 480,
      baseStats: { hp: 230, atk: 55, def: 8, aspd: 0.55 }, color: '#C75B7A', size: 62 },
    BOSS_0001: { id: 'BOSS_0001', name: '숲의 군주', type: 'Melee', element: 'Wind', range: 170, isBoss: true,
      baseStats: { hp: 2600, atk: 80, def: 45, aspd: 0.55 }, color: '#5B4A8A', size: 170,
      phases: [{ hpRatio: 0.5, aspdMult: 1.5 }],
      pattern: { name: '대지 강타', interval: 9, castTime: 2, coef: 1.6 } },
    BOSS_0002: { id: 'BOSS_0002', name: '거대 슬라임', type: 'Melee', element: 'Water', range: 150, isBoss: true,
      baseStats: { hp: 1300, atk: 50, def: 25, aspd: 0.6 }, color: '#3FAE7E', size: 150,
      phases: [{ hpRatio: 0.5, aspdMult: 1.4 }],
      pattern: { name: '끈적한 덮치기', interval: 10, castTime: 2, coef: 1.2 } },
    BOSS_0003: { id: 'BOSS_0003', name: '오크 족장', type: 'Melee', element: 'Fire', range: 160, isBoss: true,
      baseStats: { hp: 1900, atk: 68, def: 40, aspd: 0.6 }, color: '#6E8B3D', size: 160,
      phases: [{ hpRatio: 0.5, aspdMult: 1.5 }],
      pattern: { name: '분쇄의 일격', interval: 8, castTime: 1.8, coef: 1.4 } },

    // 챕터 2: 사막
    MON_0006: { id: 'MON_0006', name: '사막 전갈', type: 'Melee', element: 'Fire', range: 110,
      baseStats: { hp: 300, atk: 42, def: 40, aspd: 0.8 }, color: '#C2763A', size: 72 },
    MON_0007: { id: 'MON_0007', name: '모래 도적', type: 'Melee', element: 'Wind', range: 100,
      baseStats: { hp: 240, atk: 55, def: 15, aspd: 1.1 }, color: '#B8A07A', size: 68 },
    MON_0008: { id: 'MON_0008', name: '사막 주술사', type: 'Ranged', element: 'Fire', range: 500,
      baseStats: { hp: 220, atk: 60, def: 10, aspd: 0.6 }, color: '#D35C3A', size: 64 },
    MON_0009: { id: 'MON_0009', name: '미라', type: 'Melee', element: 'Dark', range: 110,
      baseStats: { hp: 600, atk: 50, def: 30, aspd: 0.6 }, color: '#D8CFAE', size: 90 },
    BOSS_0004: { id: 'BOSS_0004', name: '거대 전갈', type: 'Melee', element: 'Fire', range: 160, isBoss: true,
      baseStats: { hp: 2200, atk: 75, def: 60, aspd: 0.7 }, color: '#A0522D', size: 160,
      phases: [{ hpRatio: 0.5, aspdMult: 1.4 }],
      pattern: { name: '독침 난타', interval: 9, castTime: 1.8, coef: 1.5 } },
    BOSS_0005: { id: 'BOSS_0005', name: '모래 거인', type: 'Melee', element: 'Wind', range: 180, isBoss: true,
      baseStats: { hp: 3000, atk: 85, def: 50, aspd: 0.5 }, color: '#C9A66B', size: 180,
      phases: [{ hpRatio: 0.5, aspdMult: 1.5 }],
      pattern: { name: '모래 폭풍', interval: 10, castTime: 2.2, coef: 1.7 } },
    BOSS_0006: { id: 'BOSS_0006', name: '사막의 스핑크스', type: 'Melee', element: 'Light', range: 180, isBoss: true,
      baseStats: { hp: 3600, atk: 95, def: 55, aspd: 0.55 }, color: '#D4A64A', size: 185,
      phases: [{ hpRatio: 0.5, aspdMult: 1.6 }],
      pattern: { name: '태양의 심판', interval: 8, castTime: 2, coef: 1.8 } }
  };

  // ---- 7.1 / 11.4 스테이지 (챕터당 10스테이지, 각 웨이브 3 + 보스) ----
  // stages: [이름, [웨이브1, 웨이브2, 웨이브3], 보스]
  G.Chapters = [
    { chapter: 1, name: '숲', theme: 'forest', multStart: 1, multStep: 0.13,
      reward: { gold: [100, 30], exp: [60, 25], gems: 50, finalGems: 150 },
      drops: [{ grade: 1, chance: 0.3 }],
      stages: [
        ['숲의 입구', [['MON_0001', 'MON_0001'], ['MON_0001', 'MON_0002'], ['MON_0001', 'MON_0001', 'MON_0002']], 'BOSS_0002'],
        ['이끼 낀 오솔길', [['MON_0001', 'MON_0002'], ['MON_0004', 'MON_0001'], ['MON_0001', 'MON_0004', 'MON_0002']], 'BOSS_0002'],
        ['버섯 군락', [['MON_0005', 'MON_0001'], ['MON_0001', 'MON_0005', 'MON_0001'], ['MON_0004', 'MON_0005', 'MON_0005']], 'BOSS_0002'],
        ['늑대의 영역', [['MON_0004', 'MON_0004'], ['MON_0004', 'MON_0004', 'MON_0002'], ['MON_0004', 'MON_0004', 'MON_0004']], 'BOSS_0003'],
        ['고블린 야영지', [['MON_0002', 'MON_0002', 'MON_0001'], ['MON_0003', 'MON_0002'], ['MON_0003', 'MON_0002', 'MON_0002']], 'BOSS_0003'],
        ['오래된 다리', [['MON_0003', 'MON_0005'], ['MON_0004', 'MON_0003', 'MON_0005'], ['MON_0003', 'MON_0003', 'MON_0002']], 'BOSS_0003'],
        ['깊은 숲', [['MON_0004', 'MON_0005', 'MON_0001'], ['MON_0003', 'MON_0004', 'MON_0005'], ['MON_0004', 'MON_0004', 'MON_0003']], 'BOSS_0002'],
        ['오크 정찰대', [['MON_0003', 'MON_0003'], ['MON_0003', 'MON_0004', 'MON_0002'], ['MON_0003', 'MON_0003', 'MON_0005']], 'BOSS_0003'],
        ['군주의 정원', [['MON_0005', 'MON_0005', 'MON_0003'], ['MON_0003', 'MON_0003', 'MON_0004'], ['MON_0003', 'MON_0005', 'MON_0002']], 'BOSS_0003'],
        ['숲의 군주', [['MON_0001', 'MON_0002', 'MON_0001'], ['MON_0002', 'MON_0003', 'MON_0001'], ['MON_0003', 'MON_0003', 'MON_0002']], 'BOSS_0001']
      ] },
    { chapter: 2, name: '사막', theme: 'desert', multStart: 2.3, multStep: 0.15,
      reward: { gold: [450, 40], exp: [320, 35], gems: 60, finalGems: 200 },
      drops: [{ grade: 2, chance: 0.1 }, { grade: 1, chance: 0.3 }],
      stages: [
        ['모래 언덕', [['MON_0006', 'MON_0006'], ['MON_0007', 'MON_0006'], ['MON_0006', 'MON_0007', 'MON_0006']], 'BOSS_0004'],
        ['도적의 길', [['MON_0007', 'MON_0007'], ['MON_0007', 'MON_0008'], ['MON_0007', 'MON_0007', 'MON_0008']], 'BOSS_0004'],
        ['오아시스', [['MON_0008', 'MON_0006'], ['MON_0006', 'MON_0008', 'MON_0007'], ['MON_0008', 'MON_0008', 'MON_0006']], 'BOSS_0004'],
        ['버려진 무덤', [['MON_0009', 'MON_0006'], ['MON_0009', 'MON_0008'], ['MON_0009', 'MON_0009', 'MON_0008']], 'BOSS_0005'],
        ['열사의 협곡', [['MON_0007', 'MON_0008', 'MON_0007'], ['MON_0006', 'MON_0006', 'MON_0008'], ['MON_0007', 'MON_0009', 'MON_0008']], 'BOSS_0005'],
        ['신기루 사원', [['MON_0008', 'MON_0008'], ['MON_0009', 'MON_0008', 'MON_0008'], ['MON_0009', 'MON_0006', 'MON_0008']], 'BOSS_0004'],
        ['모래 폭풍', [['MON_0007', 'MON_0007', 'MON_0007'], ['MON_0006', 'MON_0007', 'MON_0009'], ['MON_0009', 'MON_0007', 'MON_0008']], 'BOSS_0005'],
        ['왕가의 계곡', [['MON_0009', 'MON_0009'], ['MON_0009', 'MON_0008', 'MON_0006'], ['MON_0009', 'MON_0009', 'MON_0008']], 'BOSS_0005'],
        ['피라미드 입구', [['MON_0006', 'MON_0009', 'MON_0008'], ['MON_0007', 'MON_0009', 'MON_0008'], ['MON_0009', 'MON_0009', 'MON_0007']], 'BOSS_0004'],
        ['사막의 스핑크스', [['MON_0006', 'MON_0007', 'MON_0008'], ['MON_0009', 'MON_0007', 'MON_0008'], ['MON_0009', 'MON_0009', 'MON_0008']], 'BOSS_0006']
      ] }
  ];

  G.Stages = {};
  G.StageOrder = [];
  for (const ch of G.Chapters) {
    ch.stageIds = [];
    ch.stages.forEach(([title, waves, boss], i) => {
      const n = i + 1;
      const id = 'STG_' + String(ch.chapter).padStart(2, '0') + '_' + String(n).padStart(2, '0');
      ch.stageIds.push(id);
      G.StageOrder.push(id);
      G.Stages[id] = {
        id, chapter: ch.chapter, index: n, theme: ch.theme, name: ch.chapter + '-' + n + ' ' + title,
        statMult: Math.round((ch.multStart + ch.multStep * i) * 100) / 100,   // 적 HP/ATK/DEF 배율
        waves: waves.map(monsters => ({ monsters })).concat([{ monsters: [boss], isBoss: true }]),
        rewards: {
          gold: ch.reward.gold[0] + ch.reward.gold[1] * i,
          exp: ch.reward.exp[0] + ch.reward.exp[1] * i,
          firstClearGems: n === ch.stages.length ? ch.reward.finalGems : ch.reward.gems
        },
        drops: ch.drops.map(d => ({ type: 'BasicUnit', grade: d.grade, chance: d.chance }))
      };
    });
  }

  G.DefaultParty = { members: ['BAS_0001', 'BAS_0003', 'BAS_0004'], leaderIndex: 0 };
  // 신규 플레이어 지급 유닛: 직업별 ★1 기본색 1명씩
  G.StarterUnits = ['BAS_0001', 'BAS_0002', 'BAS_0003', 'BAS_0004', 'BAS_0005', 'BAS_0006'];
})(window.Game = window.Game || {});
