// 도트 그래픽: 문자열 템플릿 + 팔레트로 캐릭터/적을 그린다 (외부 이미지 없음).
// 같은 템플릿에 의상 색(c/d/l)만 바꿔 576종 바리에이션을 만든다 (4.5.1).
// 템플릿은 오른쪽을 바라보도록 그리고, 적은 렌더링 시 좌우 반전한다.
(function (G) {
  'use strict';

  // 팔레트 키 → 색. c/d/l(의상), s(피부), h(머리카락)는 대상별로 덮어쓴다
  const BASE_PALETTE = {
    k: '#1b1b2a', s: '#f2c9a0', h: '#6b4a2e', m: '#d5dbe5', n: '#8a93a3', w: '#8b5a2b',
    g: '#f2c14e', b: '#4a3426', f: '#f4f4f4', r: '#e0453b', p: '#9b6bff', x: '#2e5cb8',
    c: '#888888', d: '#555555', l: '#bbbbbb'
  };

  // ---- 인간형 (16 x 19) ----
  const FACE = [
    '....kkkkkkk.....',
    '...khhhhhhhk....',
    '..khhhhhhhhhk...',
    '..khhhssssshk...',
    '..khhsssskssk...',
    '..khssssssssk...',
    '...kssssssk.....',
    '....kkkkkk......'
  ];
  const HEADS = {
    plain: ['................'].concat(FACE),
    warrior: [
      '......rrr.......',
      '....kkkrkkk.....',
      '...kmmmmmmmk....',
      '..kmmmmmmmmmk...',
      '..knnnnnnnnnk...',
      '..knnssskssnk...',
      '..knssssssssk...',
      '...kssssssk.....',
      '....kkkkkk......'
    ],
    knight: [
      '................',
      '....kkkkkkk.....',
      '...kmmmmmmmk....',
      '..kmmmmmmmmmk...',
      '..kmmmmmmmmmk...',
      '..kmmmkkkkkmk...',
      '..knnnnnnnnnk...',
      '...kggggggk.....',
      '....kkkkkk......'
    ],
    hood: [
      '................',
      '....kkkkkkk.....',
      '...kcccccccdk...',
      '..kccccccccddk..',
      '..kccssssscdk...',
      '..kcsssskssdk...',
      '..kcssssssssk...',
      '...kssssssk.....',
      '....kkkkkk......'
    ],
    wizard: [
      '.......kk.......',
      '......kcck......',
      '.....kcccck.....',
      '...kkcccccckk...',
      '..kggggggggggk..',
      '..khsssskssk....',
      '..khssssssssk...',
      '...kssssssk.....',
      '....kkkkkk......'
    ],
    holy: [
      '................',
      '....kkkkkkk.....',
      '...kfffffffk....',
      '..kffffgffffk...',
      '..kffssssssfk...',
      '..kfsssskssfk...',
      '..kfssssssssk...',
      '...kssssssk.....',
      '....kkkkkk......'
    ],
    cap: [
      '..........ff....',
      '....kkkkkkkf....',
      '...kwwwwwwwk....',
      '..kwwwwwwwwwwk..',
      '..khhhssssshk...',
      '..khhsssskssk...',
      '..khssssssssk...',
      '...kssssssk.....',
      '....kkkkkk......'
    ],
    orc: [
      '................',
      '....kkkkkkk.....',
      '...khhhhhhhk....',
      '..khhssssshhk...',
      '..ksssssssssk...',
      '..kssssskssk....',
      '..ksssssssfsk...',
      '...ksssssfk.....',
      '....kkkkkk......'
    ],
    scarf: [
      '................',
      '....kkkkkkk.....',
      '...kcccccccdk...',
      '..kcccccccccdk..',
      '..kccssssksk....',
      '..kddddddddk....',
      '..kdddddddddk...',
      '...kddddddk.....',
      '....kkkkkk......'
    ],
    mummy: [
      '................',
      '....kkkkkkk.....',
      '...kfffffffk....',
      '..kfnnfffnnfk...',
      '..kffffffffk....',
      '..kfffrffrfk....',
      '..knnffffnnfk...',
      '...kffffffk.....',
      '....kkkkkk......'
    ]
  };
  const BODY = [
    '....kccccck.....',
    '...kccllccck....',
    '..kscclllccsk...',
    '..kscccccccsk...',
    '...kbbbbbbbk....',
    '...kdddddddk....',
    '...kdddkdddk....'
  ];
  const LEGS = {
    stand: ['...kddk.kddk....', '...kbbk.kbbk....', '...kkkk.kkkk....'],
    step: ['..kddk...kddk...', '..kbbk...kbbk...', '..kkkk...kkkk...']
  };
  const HAND = { x: 12, y: 12 };   // 무기를 쥐는 손 위치 (템플릿 좌표)

  // ---- 무기 (grip: 손에 쥐는 픽셀) ----
  const WEAPONS = {
    sword: { grip: [2, 13], rows: [
      '..k..', '.kmk.', '.kmk.', '.kmk.', '.kmk.', '.kmk.', '.kmk.', '.kmk.',
      '.kmk.', '.kmk.', '.kmk.', 'kgggk', '.kwk.', '.kwk.', '.kgk.', '..k..'] },
    bow: { grip: [5, 8], rows: [
      '.k.....', '.fkk...', '.f.wk..', '.f..wk.', '.f..wk.', '.f...wk', '.f...wk', '.f...wk',
      '.f...wk', '.f...wk', '.f...wk', '.f..wk.', '.f..wk.', '.f.wk..', '.fkk...', '.k.....'] },
    staff: { grip: [2, 12], rows: [
      '.kkk.', 'kpppk', 'kpfpk', 'kpppk', '.kkk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.',
      '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '..k..'] },
    holyStaff: { grip: [2, 12], rows: [
      '..g..', '.ggg.', '..g..', '.kgk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.',
      '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '.kwk.', '..k..'] },
    dagger: { grip: [1, 5], rows: ['.k.', 'kmk', 'kmk', 'kmk', 'ggg', '.w.', '.w.', '.k.'] },
    axe: { grip: [5, 11], rows: [
      '..kkkk.', '.kmmmwk', 'kmmmmwk', 'kmmmmwk', '.kmmmwk', '..kkkwk', '....kwk', '....kwk',
      '....kwk', '....kwk', '....kwk', '....kwk', '....kwk', '....kkk'] }
  };
  const SHIELD = { rows: ['.kkkkk.', 'kgggggk', 'kgcccgk', 'kgcgcgk', 'kgcccgk', 'kgcccgk', '.kgggk.', '..kgk..', '...k...'] };
  const ARROW = { rows: ['......k.', 'wwwwwwmk', '......k.'] };
  const ORB = { rows: ['.kk.', 'kpfk', 'kppk', '.kk.'] };
  const TRAP = { rows: ['k.k.k.k.', 'mkmkmkmk', 'kmmmmmmk', '.kkkkkk.'] };

  // ---- 적 전용 템플릿 ----
  const CREATURES = {
    slime: [
      '......kkkk......',
      '....kkllllkk....',
      '...kllccccclk...',
      '..klcccccccccck.',
      '.kcccccckcckccck',
      '.kcccccckcckccck',
      '.kccccccccccccck',
      '.kdcccccccccccdk',
      '..kdddddddddddk.',
      '...kkkkkkkkkkk..'
    ],
    wolf: [
      '.............k.k..',
      '............kckck.',
      '...........kccccck',
      'k..........kccckck',
      'kk.kkkkkkkkcccccck',
      'kckccccccccccckkk.',
      '.kcccccccccccck...',
      '..kcccccccccck....',
      '..kcdk.....kcdk...',
      '..kcdk.....kcdk...',
      '..kkkk.....kkkk...'
    ],
    mushroom: [
      '....kkkkkk....',
      '..kccfccccck..',
      '.kcccccffccck.',
      'kcfccccccccfck',
      'kccccfccccccck',
      'kkkkkkkkkkkkkk',
      '...kssssssk...',
      '...ksssksksk..',
      '...kssssssk...',
      '...kssssssk...',
      '..kssssssssk..',
      '..kkkkkkkkkk..'
    ],
    scorpion: [
      '...kkk..............',
      '..kcrck.............',
      '..kck...............',
      '..kck...............',
      '..kcckkkkkkkkk...kk.',
      '...kccccccccccck.kck',
      '...kcccccccccckkkcck',
      '....kddddddddddk.kk.',
      '....kdkdkdkdkdk.....',
      '....k.k.k.k.k.k.....'
    ],
    treant: [
      '....kkkkkkkkkk....',
      '..kkllllllllllkk..',
      '.kllccllllcclllk..',
      'kllcccclllccccllk.',
      'kcccccccccccccccck',
      'kccclccccccclccck.',
      '.kccccccccccccck..',
      '..kkkwwwwwwwkkk...',
      '....kwwwwwwwwk....',
      '....kwwrwwwrwk....',
      '....kwwwwwwwwk....',
      '....kwwkkkkwwk....',
      '..kkkwwwwwwwwkkk..',
      '.kwwkwwwwwwwwkwwk.',
      'kwwk.kwwwwwwk.kwwk',
      'kk...kwwwwwwk...kk',
      '.....kwwwwwwk.....',
      '....kwwwkkwwwk....',
      '...kwwwk..kwwwk...',
      '..kwwwk....kwwwk..',
      '..kkkkk....kkkkk..'
    ],
    golem: [
      '.....kkkkkkk......',
      '....kccccccck.....',
      '....kcckcckck.....',
      '....kccccccck.....',
      '..kkkdddddddkkk...',
      '.kcccccccccccccck.',
      'kccccllccccllcccck',
      'kcccckccccckcccck.',
      'kcck.kcccccck.kcck',
      'kcck.kcccccck.kcck',
      'kddk.kddddddk.kddk',
      'kkkk.kcccccck.kkkk',
      '.....kcccccck.....',
      '....kccck.kccck...',
      '....kccck.kccck...',
      '....kdddk.kdddk...',
      '....kkkkk.kkkkk...'
    ],
    sphinx: [
      '..............kkkk....',
      '.............kgxgxk...',
      '............kgxgxgxk..',
      '............kgssksgk..',
      '............kgsssssgk.',
      '............kxgsssgxk.',
      '.kk.........kxgkkkgxk.',
      'kcckkkkkkkkkkkcccccck.',
      '.kcccccccccccccccccck.',
      '.kcccccccccccccccccck.',
      '.kccllcccccccccllccck.',
      '.kdcccccccccccccccdk..',
      '.kcck..........kcck...',
      '.kcck..........kcck...',
      'kccck.........kccck...',
      'kkkkk.........kkkkk...'
    ]
  };
  const CROWN = ['.k.kk.k.', 'kgkggkgk', 'kggggggk', 'kkkkkkkk'];

  // 직업별 외형
  const CLASS_ART = {
    Warrior: { head: 'warrior', weapon: 'sword', idleAngle: -35 },
    Knight: { head: 'knight', weapon: 'sword', shield: true, idleAngle: -20 },
    Archer: { head: 'hood', weapon: 'bow', idleAngle: 0, projectile: 'arrow' },
    Mage: { head: 'wizard', weapon: 'staff', idleAngle: -10, projectile: 'orb' },
    Cleric: { head: 'holy', weapon: 'holyStaff', idleAngle: -10 },
    Hunter: { head: 'cap', weapon: 'dagger', idleAngle: -40, projectile: 'trap' }
  };

  // 적 외형 (id → 템플릿/색). humanoid는 인간형 몸 + head/weapon
  const ENEMY_ART = {
    MON_0001: { kind: 'slime' },
    MON_0002: { kind: 'humanoid', head: 'hood', skin: '#7bbf5a', hair: '#3d5a2a', costume: '#7a5a3a', weapon: 'bow', projectile: 'arrow' },
    MON_0003: { kind: 'humanoid', head: 'orc', skin: '#6f9a4a', hair: '#2b2b2b', costume: '#6b4a3a', weapon: 'axe' },
    MON_0004: { kind: 'wolf' },
    MON_0005: { kind: 'mushroom', projectile: 'orb' },
    MON_0006: { kind: 'scorpion' },
    MON_0007: { kind: 'humanoid', head: 'scarf', costume: '#b8a07a', weapon: 'dagger' },
    MON_0008: { kind: 'humanoid', head: 'wizard', costume: '#d35c3a', weapon: 'staff', projectile: 'orb' },
    MON_0009: { kind: 'humanoid', head: 'mummy', costume: '#d8cfae' },
    BOSS_0001: { kind: 'treant' },
    BOSS_0002: { kind: 'slime', crown: true },
    BOSS_0003: { kind: 'humanoid', head: 'orc', skin: '#5f8a3a', hair: '#2b2b2b', costume: '#6e8b3d', weapon: 'axe', crown: true },
    BOSS_0004: { kind: 'scorpion', crown: true },
    BOSS_0005: { kind: 'golem' },
    BOSS_0006: { kind: 'sphinx' }
  };

  // ---- 색 ----
  function rgbOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    const [r, g, b] = rgbOf(hex);
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function palette(o) {
    const p = Object.assign({}, BASE_PALETTE);
    if (o.costume) Object.assign(p, { c: o.costume, d: shade(o.costume, -0.35), l: shade(o.costume, 0.35) });
    if (o.skin) p.s = o.skin;
    if (o.hair) p.h = o.hair;
    return p;
  }

  function paint(ctx, rows, pal, ox, oy) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const key = row[x];
        if (key === '.') continue;
        ctx.fillStyle = pal[key];
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    });
  }

  function humanoidRows(headKey, legs) {
    return HEADS[headKey].concat(BODY, LEGS[legs]);
  }

  // 의상 색이 너무 어두운 바리에이션은 머리카락과 구분되도록 기본 머리색 유지
  function heroPalette(charData) {
    return palette({ costume: charData.blockColor });
  }

  const urlCache = {};

  const PixelArt = {
    HAND, CLASS_ART, ENEMY_ART, WEAPONS, HEADS, CREATURES,
    BODY_W: 16,
    BODY_H: 19,

    shade,
    palette,
    paint,
    humanoidRows,

    heroArt(charData) {
      return Object.assign({ kind: 'humanoid' }, CLASS_ART[charData.class]);
    },

    enemyArt(enemyData) {
      return ENEMY_ART[enemyData.id] || { kind: 'slime' };
    },

    enemyPalette(enemyData) {
      const art = PixelArt.enemyArt(enemyData);
      return palette({ costume: art.costume || enemyData.color, skin: art.skin, hair: art.hair });
    },

    creatureRows(kind) { return CREATURES[kind]; },
    weapon(name) { return WEAPONS[name]; },
    shieldRows() { return SHIELD.rows; },
    crownRows() { return CROWN; },
    projectileRows(name) { return { arrow: ARROW, orb: ORB, trap: TRAP }[name].rows; },

    // 메뉴용 초상화 (머리 + 상반신) data URL
    portraitUrl(charData) {
      if (urlCache[charData.id]) return urlCache[charData.id];
      const art = CLASS_ART[charData.class];
      const rows = HEADS[art.head].concat(BODY.slice(0, 4));
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = rows.length;
      paint(canvas.getContext('2d'), rows, heroPalette(charData), 0, 0);
      urlCache[charData.id] = canvas.toDataURL();
      return urlCache[charData.id];
    },

    heroPalette,

    // 테스트용: 모든 템플릿의 행 길이·팔레트 키 검증. 문제 목록 반환
    validate() {
      const problems = [];
      const check = (name, rows) => {
        const w = rows[0].length;
        rows.forEach((r, i) => {
          if (r.length !== w) problems.push(`${name} row ${i}: width ${r.length} != ${w}`);
          for (const ch of r) if (ch !== '.' && !(ch in BASE_PALETTE)) problems.push(`${name} row ${i}: unknown key '${ch}'`);
        });
      };
      for (const [k, rows] of Object.entries(HEADS)) {
        if (rows.length !== 9) problems.push(`head ${k}: ${rows.length} rows != 9`);
        check('head ' + k, rows.concat(BODY, LEGS.stand));
      }
      check('legs step', LEGS.step);
      for (const [k, wpn] of Object.entries(WEAPONS)) check('weapon ' + k, wpn.rows);
      for (const [k, rows] of Object.entries(CREATURES)) check('creature ' + k, rows);
      check('shield', SHIELD.rows);
      check('crown', CROWN);
      check('arrow', ARROW.rows);
      check('orb', ORB.rows);
      check('trap', TRAP.rows);
      for (const art of Object.values(CLASS_ART)) {
        if (!HEADS[art.head]) problems.push('class head missing ' + art.head);
        if (!WEAPONS[art.weapon]) problems.push('class weapon missing ' + art.weapon);
      }
      for (const [id, art] of Object.entries(ENEMY_ART)) {
        if (art.kind === 'humanoid' ? !HEADS[art.head] : !CREATURES[art.kind]) problems.push('enemy art invalid ' + id);
        if (art.weapon && !WEAPONS[art.weapon]) problems.push('enemy weapon missing ' + id);
      }
      return problems;
    }
  };

  G.PixelArt = PixelArt;
})(window.Game = window.Game || {});
