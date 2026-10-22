// DOM 화면 (9.2 화면 목록): 각 함수는 HTML 문자열을 반환하고,
// 버튼은 data-action / data-* 속성으로 main.js의 액션에 연결된다.
(function (G) {
  'use strict';

  const P = () => G.Progression;
  const C = () => G.Config;
  const SLOT_LABELS = ['전열', '중열', '후열'];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.floor(n).toLocaleString('ko-KR');
  const stars = n => `<span class="stars">${'★'.repeat(n)}</span>`;
  const fmtTime = t => {
    const s = Math.floor(t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  function portrait(data, size) {
    return `<div class="portrait ${size || ''}" style="--c:${data.blockColor}"><img src="${G.PixelArt.portraitUrl(data)}" alt="${G.Classes[data.class].name}"></div>`;
  }

  function topbar(state, title, back) {
    return `<header class="topbar">
      ${back ? `<button class="back" data-action="${back}" aria-label="뒤로">‹</button>` : ''}
      ${title}
      <div class="wallet"><span class="gold">🪙 ${fmt(state.gold)}</span><span class="gems">💎 ${fmt(state.gems)}</span></div>
    </header>`;
  }

  function typeBadge(data) {
    return data.type === 'Basic' ? '' : `<span class="badge ${data.type.toLowerCase()}">${G.TypeLabels[data.type]}</span>`;
  }

  function levelText(u) {
    const max = P().isMaxLevel(u);
    return `<span class="${max ? 'max' : ''}">Lv.${u.level}${max ? ' MAX' : ''}</span>${u.enhance ? `<span class="enh">+${u.enhance}</span>` : ''}`;
  }

  // opts: { action, selected, disabled, extra }
  function unitTile(state, u, opts) {
    const data = P().charOf(u);
    const badges = [typeBadge(data)];
    if (P().isInParty(state, u.uid)) badges.push(`<span class="badge party">${SLOT_LABELS[state.party.members.indexOf(u.uid)]}</span>`);
    return `<button class="unit-tile ${opts.selected ? 'selected' : ''}" data-action="${opts.action}" data-uid="${u.uid}"
        ${opts.extra || ''} ${opts.disabled ? 'disabled' : ''}>
      ${portrait(data)}
      <div class="ut-body">
        <div class="ut-name">${esc(data.name)}</div>
        <div class="ut-meta">${stars(u.grade)} ${levelText(u)}</div>
      </div>
      <div class="ut-badges">${badges.join('')}</div>
    </button>`;
  }

  function soundToggles(settings) {
    return `<button class="chip ${settings.sfx ? 'on' : ''}" data-action="toggleSfx">${settings.sfx ? '🔊' : '🔇'} 효과음</button>
      <button class="chip ${settings.bgm ? 'on' : ''}" data-action="toggleBgm">${settings.bgm ? '🎵' : '🔕'} 음악</button>`;
  }

  function basicTotal() {
    return Object.values(G.Characters).filter(c => c.type === 'Basic').length;
  }

  function sortUnits(units) {
    return units.slice().sort((a, b) => b.grade - a.grade || b.level - a.level || b.enhance - a.enhance || a.uid - b.uid);
  }

  function partyPower(state) {
    return P().partyUnits(state).reduce((s, u) => s + P().power(u), 0);
  }

  function nextStage(state) {
    return G.StageOrder.find(id => !(state.stages[id] && state.stages[id].cleared)) || null;
  }

  const Screens = {
    // ---- 로비 ----
    lobby(state) {
      const cleared = G.StageOrder.filter(id => state.stages[id] && state.stages[id].cleared).length;
      const next = nextStage(state);
      const leader = state.party.leaderIndex;
      const chips = P().partyUnits(state).map((u, i) => {
        const data = P().charOf(u);
        return `<div class="party-chip">
          <span class="slot-label">${SLOT_LABELS[i]}</span>
          ${portrait(data)}
          <span class="name">${esc(data.name)}</span>
          <span class="ut-meta">${stars(u.grade)} ${levelText(u)}</span>
          <span class="leader">${i === leader ? '♛ 리더' : ''}</span>
        </div>`;
      }).join('');

      const rec = P().recommendation(state, G.today());
      const dungeonsOpen = G.Dungeons.some(d => P().isStageUnlocked(state, d.stageIds[0]));
      const runsLeft = G.Dungeons.reduce((n, d) => n + P().dailyRunsLeft(state, d.id, G.today()), 0);
      return `<div class="screen">
        ${topbar(state, '<div class="logo">BLOCK CHAIN RPG</div>')}
        <button class="guide" data-action="${rec.action}" ${rec.uid ? `data-uid="${rec.uid}"` : ''}>${esc(rec.text)} <span>›</span></button>
        <section class="card">
          <h2>현재 파티 <small>전투력 ${fmt(partyPower(state))}</small></h2>
          <div class="party-row">${chips}</div>
        </section>
        <nav class="menu-grid">
          <button class="menu-btn primary" data-action="stages">⚔️<b>모험</b>
            <small>${cleared}/${G.StageOrder.length} 클리어${next ? ` · 다음: ${esc(G.Stages[next].name)}` : ' · 전부 클리어!'}</small></button>
          <button class="menu-btn" data-action="tower">🗼<b>무한의 탑</b>
            <small>${P().isTowerOpen(state) ? `최고 ${state.tower.best}층 / ${C().TOWER_MAX_FLOOR}층` : `🔒 ${esc(G.Stages[G.Tower.unlock].name)} 클리어 시 개방`}</small></button>
          <button class="menu-btn" data-action="dungeons">🏰<b>일일 던전</b>
            <small>${dungeonsOpen ? `오늘 남은 보상 ${runsLeft}회` : `🔒 ${esc(G.Stages[G.DungeonLevels[0].unlock].name)} 클리어 시 개방`}</small></button>
          <button class="menu-btn" data-action="party">👥<b>파티 편성</b><small>리더·배치 변경</small></button>
          <button class="menu-btn" data-action="units">🎒<b>유닛</b><small>${state.units.length} / ${C().MAX_UNITS} · 합성·강화</small></button>
          <button class="menu-btn" data-action="summon">✨<b>소환</b><small>💎 ${C().SUMMON_COST}</small></button>
          <button class="menu-btn" data-action="collection">📚<b>도감</b><small>${P().collectionCount(state)} / ${basicTotal()} · 달성 보상</small></button>
          <button class="menu-btn" data-action="help">📖<b>도움말</b><small>조작·성장 방법</small></button>
          <button class="menu-btn" data-action="settings">⚙️<b>설정</b><small>사운드·데이터 백업</small></button>
        </nav>
      </div>`;
    },

    // ---- 스테이지 선택 ----
    stages(state, view) {
      const next = nextStage(state);
      const chapter = G.Chapters.find(c => c.chapter === view.chapter)
        || G.Chapters.find(c => c.stageIds.includes(next)) || G.Chapters[0];
      const tabs = G.Chapters.map(c => {
        const locked = !P().isStageUnlocked(state, c.stageIds[0]);
        const done = c.stageIds.filter(id => state.stages[id] && state.stages[id].cleared).length;
        return `<button class="chip ${c === chapter ? 'on' : ''}" data-action="chapter" data-chapter="${c.chapter}" ${locked ? 'disabled' : ''}>
          ${locked ? '🔒 ' : ''}챕터 ${c.chapter} · ${c.name} <small>${done}/${c.stageIds.length}</small></button>`;
      }).join('');
      const cards = chapter.stageIds.map(id => {
        const s = G.Stages[id];
        const rec = state.stages[id] || { cleared: false, stars: 0 };
        const locked = !P().isStageUnlocked(state, id);
        const boss = G.Enemies[s.waves[s.waves.length - 1].monsters[0]];
        const starHtml = [0, 1, 2].map(i => `<span class="${i < rec.stars ? '' : 'off'}">★</span>`).join('');
        return `<button class="stage-card ${id === next ? 'next' : ''}" data-action="startStage" data-id="${id}" ${locked ? 'disabled' : ''}>
          <div class="stage-no">${locked ? '🔒' : `${s.chapter}-${s.index}`}</div>
          <div class="stage-name">${esc(s.name.replace(/^\S+\s/, ''))}</div>
          <div class="stage-stars">${starHtml}</div>
          <div class="stage-meta"><span>적 강도 ×${s.statMult.toFixed(2)}</span><span>보스 ${esc(boss.name)}</span></div>
          <div class="stage-reward"><span>🪙 ${s.rewards.gold}</span><span>EXP ${s.rewards.exp}</span>${rec.cleared ? '' : `<span class="gem">첫 클리어 💎${s.rewards.firstClearGems}</span>`}${rec.bestTime != null ? `<span>최고 ${fmtTime(rec.bestTime)}</span>` : ''}</div>
        </button>`;
      }).join('');
      return `<div class="screen">
        ${topbar(state, `<h1>챕터 ${chapter.chapter} · ${chapter.name}</h1>`, 'lobby')}
        <div class="filters">${tabs}</div>
        <div class="card"><span class="muted">현재 파티 전투력 <b>${fmt(partyPower(state))}</b> · ★ 클리어 / ★★ 아군 사망 없음 / ★★★ ${C().STAR3_TIME}초 내 클리어</span></div>
        <div class="stage-list">${cards}</div>
      </div>`;
    },

    // ---- 7.3 일일 던전 ----
    dungeons(state, view) {
      const today = G.today();
      const dungeon = G.Dungeons.find(d => d.id === view.dungeon) || G.Dungeons[0];
      const tabs = G.Dungeons.map(d => `<button class="chip ${d === dungeon ? 'on' : ''}" data-action="dungeon" data-id="${d.id}">
          ${d.icon} ${esc(d.name)} <small>${P().dailyRunsLeft(state, d.id, today)}/${C().DAILY_DUNGEON_RUNS}</small></button>`).join('');
      const left = P().dailyRunsLeft(state, dungeon.id, today);
      const cards = dungeon.stageIds.map(id => {
        const s = G.Stages[id];
        const locked = !P().isStageUnlocked(state, id);
        const boss = G.Enemies[s.waves[s.waves.length - 1].monsters[0]];
        const reward = s.rewards.gold ? `🪙 ${fmt(s.rewards.gold)}` : `EXP ${fmt(s.rewards.exp)}`;
        return `<button class="stage-card" data-action="startStage" data-id="${id}" ${locked || !left ? 'disabled' : ''}>
          <div class="stage-no">${locked ? '🔒' : dungeon.icon}</div>
          <div class="stage-name">${esc(s.name)}</div>
          <div class="stage-stars"></div>
          <div class="stage-meta"><span>적 강도 ×${s.statMult.toFixed(2)}</span><span>보스 ${esc(boss.name)}</span></div>
          <div class="stage-reward">${locked ? `<span>${esc(G.Stages[s.unlock].name)} 클리어 시 개방</span>` : `<span class="gem">${reward}</span>`}</div>
        </button>`;
      }).join('');
      return `<div class="screen">
        ${topbar(state, '<h1>일일 던전</h1>', 'lobby')}
        <div class="filters">${tabs}</div>
        <div class="card"><span class="muted">${esc(dungeon.desc)} 승리할 때만 횟수가 줄고, 매일 자정(기기 시간)에 ${C().DAILY_DUNGEON_RUNS}회로 초기화됩니다.
          · 오늘 남은 보상 <b>${left}/${C().DAILY_DUNGEON_RUNS}</b> · 파티 전투력 <b>${fmt(partyPower(state))}</b></span></div>
        <div class="stage-list">${cards}</div>
      </div>`;
    },

    // ---- 7.3 무한의 탑 ----
    tower(state) {
      const best = state.tower.best;
      const open = P().isTowerOpen(state);
      const floor = P().towerNextFloor(state);
      const s = G.Stages[G.Tower.stage(floor)];
      const done = best >= C().TOWER_MAX_FLOOR;
      const names = ids => [...new Set(ids)].map(id => esc(G.Enemies[id].name)).join(', ');
      const enemies = s.waves.filter(w => !w.isBoss).flatMap(w => w.monsters);
      const boss = s.isBossFloor ? G.Enemies[s.waves[s.waves.length - 1].monsters[0]] : null;
      // 다가오는 보스 층 3개 미리보기
      const upcoming = [];
      for (let f = floor + 1; upcoming.length < 3 && f <= C().TOWER_MAX_FLOOR; f++) {
        if (f % C().TOWER_BOSS_EVERY === 0) upcoming.push(G.Stages[G.Tower.stage(f)]);
      }
      const next = open ? `<button class="stage-card next tower-card" data-action="startStage" data-id="${s.id}">
          <div class="stage-no">${floor}F</div>
          <div class="stage-name">${esc(s.name)}${boss ? ' <span class="badge boss">BOSS</span>' : ''}</div>
          <div class="stage-stars"></div>
          <div class="stage-meta"><span>적 강도 ×${s.statMult.toFixed(2)}</span><span>${names(enemies)}</span>${boss ? `<span>보스 ${esc(boss.name)}</span>` : ''}</div>
          <div class="stage-reward">${done ? '<span>모든 층 돌파! 보상 없이 반복 도전</span>'
            : `<span>첫 돌파</span><span>🪙 ${fmt(s.rewards.gold)}</span><span>EXP ${fmt(s.rewards.exp)}</span><span class="gem">💎${s.rewards.firstClearGems}</span>`}</div>
        </button>`
        : `<div class="card">🔒 ${esc(G.Stages[G.Tower.unlock].name)}을(를) 클리어하면 열립니다.</div>`;
      const ahead = upcoming.map(u => {
        const b = G.Enemies[u.waves[u.waves.length - 1].monsters[0]];
        return `<li><b>${u.floor}층</b> 보스 ${esc(b.name)} · 적 강도 ×${u.statMult.toFixed(2)} · 💎${u.rewards.firstClearGems}</li>`;
      }).join('');
      return `<div class="screen">
        ${topbar(state, '<h1>무한의 탑</h1>', 'lobby')}
        <div class="card"><span class="muted">한 층씩 올라가는 도전 모드입니다. 층마다 적이 강해지고 ${C().TOWER_BOSS_EVERY}층마다 보스가 나옵니다.
          보상은 처음 돌파할 때만 받고, 실패해도 잃는 것은 없습니다.</span>
          <div class="tower-best">최고 기록 <b>${best}층</b> / ${C().TOWER_MAX_FLOOR}층 · 파티 전투력 <b>${fmt(partyPower(state))}</b></div></div>
        <div class="stage-list">${next}</div>
        ${open && ahead ? `<section class="card"><h3>다가오는 보스 층</h3><ul class="result-list">${ahead}</ul></section>` : ''}
      </div>`;
    },

    // ---- 파티 편성 ----
    party(state, view) {
      const slots = P().partyUnits(state).map((u, i) => {
        const data = P().charOf(u);
        const leader = state.party.leaderIndex === i;
        return `<div class="party-slot ${view.partySlot === i ? 'selected' : ''}">
          <span class="slot-label">${SLOT_LABELS[i]}</span>
          <button data-action="partySlot" data-slot="${i}" aria-label="${SLOT_LABELS[i]} 선택">${portrait(data, 'lg')}</button>
          <span class="name">${esc(data.name)}</span>
          <span class="ut-meta">${stars(u.grade)} ${levelText(u)}</span>
          <button class="leader-btn ${leader ? 'on' : ''}" data-action="leader" data-slot="${i}">${leader ? '♛ 리더' : '리더 지정'}</button>
        </div>`;
      }).join('');
      const list = sortUnits(state.units).map(u => unitTile(state, u, {
        action: 'partyPick', selected: state.party.members[view.partySlot] === u.uid
      })).join('');
      return `<div class="screen">
        ${topbar(state, '<h1>파티 편성</h1>', 'lobby')}
        <section class="card">
          <h2>출전 파티 <small>전투력 ${fmt(partyPower(state))}</small></h2>
          <div class="party-slots">${slots}</div>
          <p class="hint">칸을 고른 뒤 아래에서 유닛을 누르면 배치됩니다. 이미 파티에 있는 유닛을 고르면 자리가 바뀝니다.<br>
          리더는 블록이 2배로 자주 나옵니다(생성 확률 50%). 전열은 적의 공격을 먼저 받습니다.</p>
        </section>
        <h3>${SLOT_LABELS[view.partySlot]}에 배치할 유닛</h3>
        <div class="unit-grid">${list}</div>
      </div>`;
    },

    // ---- 보관함 ----
    units(state, view) {
      const filters = [0, 1, 2, 3, 4, 5, 6].map(g =>
        `<button class="chip ${view.unitFilter === g ? 'on' : ''}" data-action="filter" data-grade="${g}">${g ? '★' + g : '전체'}</button>`).join('');
      const list = sortUnits(state.units.filter(u => !view.unitFilter || u.grade === view.unitFilter));
      const empty = '<p class="muted">해당 등급의 유닛이 없습니다.</p>';

      // 선택 방출 모드
      if (view.selecting) {
        const sel = view.selected;
        const gold = sel.reduce((g, uid) => g + P().releaseGold(P().findUnit(state, uid)), 0);
        const tiles = list.map(u => unitTile(state, u, {
          action: 'selToggle', selected: sel.includes(u.uid), disabled: !!P().releaseError(state, u)
        })).join('');
        return `<div class="screen">
          ${topbar(state, '<h1>방출할 유닛 선택</h1>', 'selCancel')}
          <div class="filters">${filters}</div>
          <div class="card bulk-bar">
            <span>${sel.length}명 선택 · 🪙 ${fmt(gold)}</span>
            <button class="btn" data-action="selQuick">${view.unitFilter ? '★' + view.unitFilter + ' ' : ''}Lv.1 전체 선택</button>
            <button class="btn" data-action="selClear" ${sel.length ? '' : 'disabled'}>선택 해제</button>
            <button class="btn danger" data-action="releaseMany" ${sel.length ? '' : 'disabled'}>방출</button>
          </div>
          <p class="muted">파티 유닛은 방출할 수 없습니다. "Lv.1 전체 선택"은 키우지 않은 기본 유닛만 고릅니다.</p>
          <div class="unit-grid">${tiles || empty}</div>
        </div>`;
      }

      const synthReady = state.units.filter(u => !P().synthesisSelfError(state, u) && P().synthesisCandidates(state, u.uid).length).length;
      const bulk = [1, 2, 3, 4, 5].map(g => [g, P().bulkSynthesisPairs(state, g).length]).filter(([, n]) => n)
        .map(([g, n]) => `<button class="btn primary" data-action="synthBulk" data-grade="${g}">★${g} 일괄 합성<small>${n}쌍 → ★${g + 1} ${n}명</small></button>`).join('');
      return `<div class="screen">
        ${topbar(state, `<h1>유닛 <small class="muted">${state.units.length}/${C().MAX_UNITS}</small></h1>`, 'lobby')}
        ${synthReady ? `<div class="card">🔮 합성 가능한 유닛이 ${synthReady}명 있습니다. 최대 레벨 유닛을 눌러 합성하거나 일괄 합성하세요.
          ${bulk ? `<div class="bulk-bar">${bulk}</div>` : ''}</div>` : ''}
        <div class="filters">${filters}<button class="chip right" data-action="selStart">🗑️ 선택 방출</button></div>
        <div class="unit-grid">${list.map(u => unitTile(state, u, { action: 'unit' })).join('') || empty}</div>
      </div>`;
    },

    // ---- 유닛 상세 (강화 / 합성 / 진화) ----
    unit(state, view) {
      const u = P().findUnit(state, view.unitUid);
      if (!u) return Screens.units(state, view);
      const data = P().charOf(u);
      const cls = G.Classes[data.class];
      const st = P().unitStats(u);
      const maxLv = G.Rules.maxLevel(u.grade);
      const isMax = P().isMaxLevel(u);
      const expPct = isMax ? 100 : Math.floor(u.exp / G.Rules.expToNext(u.level) * 100);
      const skill = data.skills || cls.skill;
      const unitWord = skill.kind === 'heal' ? '아군 회복 ATK ' : '피해 ATK ';

      const statCells = [
        ['HP', fmt(st.hp)], ['ATK', fmt(st.atk)], ['DEF', fmt(st.def)], ['전투력', fmt(P().power(u))],
        ['치명타', Math.round(st.cri * 100) + '%'], ['치명 피해', Math.round(st.crd * 100) + '%'],
        ['회피', Math.round(st.eva * 100) + '%'], ['공격 속도', st.aspd.toFixed(2)]
      ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');

      // 강화
      const enhErr = P().enhanceError(state, u);
      const enhance = u.enhance >= C().ENHANCE_MAX
        ? `<p>최대 강화(+${C().ENHANCE_MAX}) 달성</p>`
        : `<p>+${u.enhance} → +${u.enhance + 1} · 성공 확률 ${Math.round(P().enhanceRate(u) * 100)}% · HP/ATK/DEF +${Math.round(C().ENHANCE_STAT_PER_STEP * 100)}%<br>실패 시 골드만 소모되고 단계는 유지됩니다.</p>
           <button class="btn primary" data-action="enhance" data-uid="${u.uid}" ${enhErr ? 'disabled' : ''}>강화<small>🪙 ${fmt(P().enhanceCost(u))}</small></button>`;

      // 합성
      const synErr = P().synthesisSelfError(state, u);
      const candidates = synErr ? [] : P().synthesisCandidates(state, u.uid);
      const synth = synErr
        ? `<p>${synErr}</p>`
        : candidates.length
          ? `<p>같은 등급 최대 레벨 유닛 1명을 더 골라 합성합니다. 두 유닛은 사라지고 랜덤 ★${u.grade + 1} 유닛(Lv.1)을 얻습니다.</p>
             <button class="btn primary" data-action="synthPick" data-uid="${u.uid}">재료 선택 (${candidates.length})</button>`
          : `<p>재료로 쓸 다른 ★${u.grade} 최대 레벨 유닛(파티 제외)이 없습니다.</p>`;

      // 진화
      const evoErr = P().evolveError(u);
      const evolve = evoErr
        ? `<p>${evoErr}</p>`
        : `<p>같은 유닛이 ★${u.grade + 1} Lv.1(+0)이 됩니다.</p><button class="btn primary" data-action="evolve" data-uid="${u.uid}">진화</button>`;

      return `<div class="screen">
        ${topbar(state, '<h1>유닛 정보</h1>', 'units')}
        <section class="card">
          <div class="detail-head">
            ${portrait(data, 'lg')}
            <div style="flex:1;min-width:0">
              <h2>${esc(data.name)}</h2>
              <div class="sub">${stars(u.grade)} ${typeBadge(data)} <span>${cls.name} · ${cls.role} · ${cls.range === 'Melee' ? '근거리' : '원거리'}</span>
                ${P().isInParty(state, u.uid) ? `<span class="badge party">파티 ${SLOT_LABELS[state.party.members.indexOf(u.uid)]}</span>` : ''}</div>
              <div class="sub" style="margin-top:6px">Lv.${u.level} / ${maxLv} ${u.enhance ? `· <b style="color:var(--gem)">+${u.enhance}</b>` : ''}
                ${isMax ? '· <b style="color:var(--good)">MAX</b>' : `· EXP ${u.exp} / ${G.Rules.expToNext(u.level)}`}</div>
              <div class="exp-bar"><i style="width:${expPct}%"></i></div>
            </div>
          </div>
        </section>
        <section class="card"><h3>능력치</h3><div class="stat-grid">${statCells}</div></section>
        <section class="card"><h3>스킬 · ${esc(skill.name)} <small>같은 직업 기본 유닛 공통</small></h3>
          <table class="skill-table">${skill.coef.map((c, i) => `<tr><td>${i + 1}체인</td><td>${unitWord}${Math.round(c * 100)}%</td></tr>`).join('')}</table>
        </section>
        <section class="card"><h3>강화 <small>+1 ~ +${C().ENHANCE_MAX}</small></h3><div class="action-row">${enhance}</div></section>
        <section class="card"><h3>합성 <small>★N 최대 레벨 × 2 → 랜덤 ★N+1</small></h3><div class="action-row">${synth}</div></section>
        <section class="card"><h3>진화 <small>메인 캐릭터 전용 · 최대 레벨 + +5</small></h3><div class="action-row">${evolve}</div></section>
        <section class="card"><h3>방출 <small>보관함 정리</small></h3><div class="action-row">
          ${P().releaseError(state, u)
            ? `<p>${P().releaseError(state, u)}</p>`
            : `<p>이 유닛을 내보내고 골드를 받습니다. 되돌릴 수 없습니다.</p>
               <button class="btn" data-action="release" data-uid="${u.uid}">방출<small>🪙 +${fmt(P().releaseGold(u))}</small></button>`}
        </div></section>
      </div>`;
    },

    // ---- 도감 (4.5.2) ----
    collection(state, view) {
      const grade = view.colGrade || 1;
      const count = P().collectionCount(state);
      const total = basicTotal();
      const milestones = P().collectionMilestones(state).map(m => `
        <div class="milestone ${m.claimed ? 'done' : m.reached ? 'ready' : ''}">
          <b>${m.need}종</b><span>💎 ${fmt(m.gems)}</span>
          ${m.claimed ? '<em>받음</em>'
            : `<button class="btn ${m.reached ? 'primary' : ''}" data-action="claimCollection" data-need="${m.need}" ${m.reached ? '' : 'disabled'}>받기</button>`}
        </div>`).join('');
      const tabs = [1, 2, 3, 4, 5, 6].map(g => {
        const own = Object.values(G.Characters).filter(c => c.type === 'Basic' && c.grade === g && state.collection[c.id]).length;
        return `<button class="chip ${g === grade ? 'on' : ''}" data-action="colGrade" data-grade="${g}">★${g} <small>${own}/96</small></button>`;
      }).join('');
      const rows = G.ClassOrder.map(cls => {
        const cells = Object.values(G.Characters)
          .filter(c => c.type === 'Basic' && c.grade === grade && c.class === cls)
          .map(c => {
            const owned = !!state.collection[c.id];
            const trophy = state.firstMaxRewarded[c.id] ? '<i title="첫 MAX 달성">🏆</i>' : '';
            return `<div class="col-cell ${owned ? 'owned' : ''}" title="${owned ? esc(c.name) : '???'}" style="--c:${owned ? c.blockColor : '#2a3042'}">
              <img src="${G.PixelArt.portraitUrl(c)}" alt="">${trophy}</div>`;
          }).join('');
        return `<div class="col-row"><h4>${G.Classes[cls].name}</h4><div class="col-grid">${cells}</div></div>`;
      }).join('');
      return `<div class="screen">
        ${topbar(state, '<h1>도감</h1>', 'lobby')}
        <section class="card">
          <h2>수집 ${count} / ${total} <small>유닛을 처음 얻으면 등록 · 🏆 첫 MAX 레벨 달성</small></h2>
          <div class="exp-bar"><i style="width:${Math.floor(count / total * 100)}%"></i></div>
          <div class="milestones">${milestones}</div>
        </section>
        <div class="filters">${tabs}</div>
        <section class="card">${rows}</section>
      </div>`;
    },

    // ---- 모달 ----
    settings(state, backupCode) {
      return `<div class="modal settings">
        <h2>⚙️ 설정</h2>
        <h3>사운드</h3>
        <div class="sound-toggles">${soundToggles(state.settings)}</div>
        <h3>데이터 백업</h3>
        <p class="hint">진행 상황은 이 브라우저에만 저장됩니다. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에 백업하세요.</p>
        <div class="modal-actions">
          <button class="btn" data-action="exportSave">📋 백업 코드 복사</button>
          <button class="btn" data-action="downloadSave">💾 파일로 저장</button>
        </div>
        <textarea id="backup-code" placeholder="백업 코드를 여기에 붙여넣고 [코드로 불러오기]를 누르세요" spellcheck="false">${backupCode ? esc(backupCode) : ''}</textarea>
        <div class="modal-actions">
          <button class="btn" data-action="importSave">코드로 불러오기</button>
          <label class="btn file-btn">파일 불러오기<input type="file" id="import-file" accept=".json,.txt,application/json,text/plain"></label>
        </div>
        <h3>초기화</h3>
        <div class="modal-actions">
          <button class="btn danger" data-action="reset">데이터 초기화</button>
        </div>
        <div class="modal-actions"><button class="btn primary" data-action="closeModal">닫기</button></div>
      </div>`;
    },

    importConfirm(state) {
      const cleared = G.StageOrder.filter(id => state.stages[id] && state.stages[id].cleared).length;
      return `<div class="modal warn">
        <h2>백업 불러오기</h2>
        <p>현재 진행 상황을 아래 백업으로 <b>덮어씁니다</b>. 되돌릴 수 없습니다.</p>
        <ul>
          <li>유닛 ${state.units.length}명 · 스테이지 ${cleared}/${G.StageOrder.length} 클리어</li>
          <li>🪙 ${fmt(state.gold)} · 💎 ${fmt(state.gems)}</li>
        </ul>
        <div class="modal-actions">
          <button class="btn" data-action="closeModal">취소</button>
          <button class="btn danger" data-action="importDo">불러오기</button>
        </div>
      </div>`;
    },
    synthPicker(state, uid) {
      const list = sortUnits(P().synthesisCandidates(state, uid))
        .map(u => unitTile(state, u, { action: 'synthChoose', extra: `data-a="${uid}"` })).join('');
      return `<div class="modal">
        <h2>합성 재료 선택</h2>
        <div class="unit-grid">${list}</div>
        <div class="modal-actions"><button class="btn" data-action="closeModal">취소</button></div>
      </div>`;
    },

    // 4.4.3 한정 캐릭터 경고 포함
    synthConfirm(state, a, b) {
      const ua = P().findUnit(state, a);
      const ub = P().findUnit(state, b);
      const limited = P().needsLimitedWarning(state, [a, b]);
      const names = [ua, ub].map(u => `<li>${esc(P().charOf(u).name)} ${stars(u.grade)}</li>`).join('');
      return `<div class="modal ${limited ? 'warn' : ''}">
        <h2>${limited ? '⚠️ 경고' : '합성 확인'}</h2>
        ${limited ? '<p><b>합성 재료에 한정 캐릭터가 포함되어 있습니다.</b><br>한정 캐릭터는 합성으로 다시 얻을 수 없습니다.<br>정말 합성하시겠습니까?</p>' : '<p>아래 두 유닛이 사라지고 랜덤 상위 등급 유닛을 얻습니다.</p>'}
        <ul>${names}</ul>
        <div class="modal-actions">
          <button class="btn" data-action="closeModal">취소</button>
          <button class="btn ${limited ? 'danger' : 'primary'}" data-action="synthDo" data-a="${a}" data-b="${b}">합성</button>
        </div>
      </div>`;
    },

    synthBulkConfirm(state, grade) {
      const n = P().bulkSynthesisPairs(state, grade).length;
      return Screens.confirm('일괄 합성', `최대 레벨 ★${grade} 기본 유닛 ${n * 2}명을 둘씩 합성해 ★${grade + 1} 유닛 ${n}명을 얻습니다.<br>
        <span class="muted">파티 유닛, 강화한 유닛, 메인/한정 캐릭터는 제외됩니다.</span>`, 'synthBulkDo', false, { grade });
    },

    // 여러 유닛 획득 결과 (일괄 합성)
    revealMany(state, title, results) {
      const tiles = results.map(r => unitTile(state, r.unit, { action: 'unit', extra: '' })
        .replace('<div class="ut-badges">', `<div class="ut-badges">${r.isNew ? '<span class="badge new">NEW</span>' : ''}`)).join('');
      return `<div class="modal">
        <h2>${title}</h2>
        <div class="unit-grid">${tiles}</div>
        <div class="modal-actions"><button class="btn primary" data-action="closeModal">확인</button></div>
      </div>`;
    },

    releaseManyConfirm(state, uids) {
      const units = uids.map(uid => P().findUnit(state, uid));
      const gold = units.reduce((g, u) => g + P().releaseGold(u), 0);
      const byGrade = [1, 2, 3, 4, 5, 6].map(g => [g, units.filter(u => u.grade === g).length]).filter(([, n]) => n)
        .map(([g, n]) => `★${g} ${n}명`).join(' · ');
      const raised = units.filter(u => u.level > 1 || u.enhance).length;
      const special = units.filter(u => P().charOf(u).type !== 'Basic').length;
      const warns = [];
      if (raised) warns.push(`레벨을 올렸거나 강화한 유닛 ${raised}명`);
      if (special) warns.push(`메인/한정 캐릭터 ${special}명`);
      return Screens.confirm('유닛 일괄 방출', `${byGrade} (총 ${units.length}명)을 방출하고 🪙 ${fmt(gold)}을 받습니다. 되돌릴 수 없습니다.
        ${warns.length ? `<br><b>포함: ${warns.join(', ')}</b>` : ''}`, 'releaseManyDo', warns.length > 0);
    },

    reveal(state, title, got, again) {
      const u = got.unit;
      const data = P().charOf(u);
      return `<div class="modal">
        <h2>${title}</h2>
        <div class="reveal">
          ${portrait(data, 'lg')}
          <div class="name">${esc(data.name)} ${got.isNew ? '<span class="badge new">NEW</span>' : ''} ${typeBadge(data)}</div>
          <div class="stars">${'★'.repeat(u.grade)}</div>
          <div class="muted">${G.Classes[data.class].name} · ${G.Classes[data.class].role} · Lv.1</div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="closeModal">확인</button>
          <button class="btn" data-action="unit" data-uid="${u.uid}">유닛 보기</button>
          ${again ? `<button class="btn primary" data-action="${again}" ${P().summonError(state) ? 'disabled' : ''}>한 번 더<small>💎 ${C().SUMMON_COST} (보유 ${fmt(state.gems)})</small></button>` : ''}
        </div>
      </div>`;
    },

    summon(state) {
      const err = P().summonError(state);
      const rates = C().SUMMON_GRADE_RATES.map(([g, p]) => `★${g} ${Math.round(p * 100)}%`).join(' · ');
      return `<div class="modal">
        <h2>✨ 기본 유닛 소환</h2>
        <p style="text-align:center">💎 ${C().SUMMON_COST}로 기본 유닛 1명을 소환합니다.<br><span class="muted">${rates} · 보유 💎 ${fmt(state.gems)}</span></p>
        ${err ? `<p class="hint" style="text-align:center">${err} 보석은 스테이지 첫 클리어와 유닛 첫 MAX 레벨 보상으로 얻을 수 있습니다.</p>` : ''}
        <div class="modal-actions">
          <button class="btn" data-action="closeModal">닫기</button>
          <button class="btn primary" data-action="summonDo" ${err ? 'disabled' : ''}>소환</button>
        </div>
      </div>`;
    },

    // data: 확인 버튼에 붙일 data-* 값 ({ uid: 3 } → data-uid="3")
    confirm(title, body, action, danger, data) {
      const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
      return `<div class="modal ${danger ? 'warn' : ''}">
        <h2>${title}</h2><p>${body}</p>
        <div class="modal-actions">
          <button class="btn" data-action="closeModal">취소</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-action="${action}" ${attrs}>확인</button>
        </div>
      </div>`;
    },

    help() {
      return `<div class="modal">
        <h2>📖 도움말</h2>
        <p><b>전투</b> — 파티는 자동으로 전진하고 싸웁니다. 아래 블록을 누르면 그 캐릭터의 스킬이 나갑니다.
        같은 캐릭터 블록이 붙어 있으면 최대 3개까지 묶여 <b>2·3체인</b>이 되고, 체인이 길수록 블록당 효율이 높습니다.
        블록을 길게 누르면 스킬 정보를 볼 수 있습니다. 2분이 지나면 적이 <b>광폭화</b>합니다.</p>
        <p><b>성장</b> — 승리하면 출전한 유닛이 경험치를 얻습니다. 최대 레벨(등급×10)이 된 같은 등급 유닛 2명을
        <b>합성</b>하면 한 단계 위 등급 유닛을 얻습니다. 골드로 <b>강화</b>(+1~+5)할 수 있습니다.
        유닛 종류별로 처음 최대 레벨을 달성하면 보상을 받습니다.</p>
        <p><b>일일 던전</b> — 1-3 클리어 후 열립니다. 황금 광산은 골드, 수련의 탑은 경험치를 많이 줍니다.
        던전마다 하루 ${C().DAILY_DUNGEON_RUNS}번까지 보상을 받을 수 있고, 진 판은 횟수에 포함되지 않습니다.</p>
        <p><b>단축키</b> — 1~9 블록 · Space/Esc 일시정지 · A 자동 · S 배속</p>
        <p class="muted">진행 상황은 이 브라우저에 저장됩니다.</p>
        <div class="modal-actions"><button class="btn primary" data-action="closeModal">닫기</button></div>
      </div>`;
    },

    pause(stageName, settings) {
      return `<div class="modal">
        <h2>일시정지</h2>
        <p style="text-align:center" class="muted">${esc(stageName)}</p>
        <div class="sound-toggles">${soundToggles(settings)}</div>
        <div class="modal-actions" style="flex-direction:column">
          <button class="btn primary" data-action="resume">계속하기</button>
          <button class="btn" data-action="retry">처음부터 다시</button>
          <button class="btn" data-action="quit">나가기 <small>보상 없이 선택 화면으로</small></button>
        </div>
      </div>`;
    },

    // summary가 null이면 디버그 전투 (진행 미반영)
    battleResult(state, result, summary, nextId) {
      const conds = [
        ['클리어', result.victory],
        ['아군 사망 없음', result.victory && result.deaths === 0],
        [`${C().STAR3_TIME}초 내 클리어`, result.victory && result.time <= C().STAR3_TIME]
      ].map(([label, ok]) => `<li class="${ok ? 'on' : ''}">${label}</li>`).join('');

      const mode = G.Stages[result.stageId].mode;
      const daily = mode === 'daily';
      const tower = mode === 'tower';
      let body = '';
      if (summary && result.victory) {
        const rewards = [];
        if (summary.gold) rewards.push(`🪙 +${fmt(summary.gold)}`);
        if (summary.exp) rewards.push(`EXP +${fmt(summary.exp)}`);
        if (summary.gems) rewards.push(`💎 +${summary.gems} ${tower ? '첫 돌파' : '첫 클리어'}`);
        const items = [];
        for (const l of summary.levelUps) items.push(`<li>${esc(l.name)} <span class="up">Lv.${l.from} → Lv.${l.to}${l.max ? ' MAX' : ''}</span></li>`);
        for (const f of summary.firstMax) items.push(`<li>🏆 ${esc(f.name)} 첫 MAX 보상 🪙 +${fmt(f.gold)} 💎 +${f.gems}</li>`);
        if (summary.drop) items.push(`<li>🎁 획득: ${esc(P().charOf(summary.drop.unit).name)} ${stars(summary.drop.unit.grade)} ${summary.drop.isNew ? '<span class="badge new">NEW</span>' : ''}</li>`);
        if (tower) items.push(summary.firstClear ? `<li>🗼 ${G.Stages[result.stageId].floor}층 돌파! 최고 기록 갱신</li>` : '<li>이미 돌파한 층이라 보상이 없습니다.</li>');
        if (daily) items.push(`<li>오늘 남은 보상 ${summary.runsLeft}/${C().DAILY_DUNGEON_RUNS}회</li>`);
        body = `<div class="reward-row">${rewards.map(r => `<span>${r}</span>`).join('')}</div>
          ${items.length ? `<ul class="result-list">${items.join('')}</ul>` : ''}`;
      } else if (!result.victory) {
        body = '<p class="hint" style="text-align:center">레벨을 올리거나, 합성·강화로 파티를 키운 뒤 다시 도전하세요.<br>리더와 배치를 바꾸는 것도 도움이 됩니다.</p>';
      }

      const canNext = summary && result.victory && nextId;
      return `<div class="modal result ${result.victory ? 'win' : 'lose'}">
        <h2>${result.victory ? '승리!' : '패배…'}</h2>
        ${mode ? '' : `<div class="result-stars">${[0, 1, 2].map(i => `<span class="${i < result.stars ? 'on' : ''}">★</span>`).join('')}</div>
        <ul class="star-conds">${conds}</ul>`}
        <p class="muted" style="text-align:center;margin:0 0 12px">시간 ${fmtTime(result.time)} · 아군 사망 ${result.deaths}</p>
        ${body}
        <div class="modal-actions">
          <button class="btn" data-action="quit">${!summary ? '로비' : daily ? '던전 선택' : tower ? '탑으로' : '스테이지 선택'}</button>
          <button class="btn" data-action="retry" ${daily && summary && !summary.runsLeft ? 'disabled' : ''}>다시 하기</button>
          ${canNext ? `<button class="btn primary" data-action="startStage" data-id="${nextId}">${tower ? '다음 층' : '다음 스테이지'} ›</button>` : ''}
          ${summary && !result.victory ? '<button class="btn primary" data-action="toParty">파티 편성</button>' : ''}
        </div>
      </div>`;
    }
  };

  G.Screens = Screens;
})(window.Game = window.Game || {});
