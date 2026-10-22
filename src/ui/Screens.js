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

      const rec = P().recommendation(state);
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
          <button class="menu-btn" data-action="party">👥<b>파티 편성</b><small>리더·배치 변경</small></button>
          <button class="menu-btn" data-action="units">🎒<b>유닛</b><small>${state.units.length} / ${C().MAX_UNITS} · 합성·강화</small></button>
          <button class="menu-btn" data-action="summon">✨<b>소환</b><small>💎 ${C().SUMMON_COST}</small></button>
          <button class="menu-btn" data-action="help">📖<b>도움말</b><small>조작·성장 방법</small></button>
        </nav>
        <footer class="lobby-foot">
          <span>도감 ${Object.keys(state.collection).length} / ${Object.keys(G.Characters).length}</span>
          <span class="sound-toggles">${soundToggles(state.settings)}</span>
          <button class="link" data-action="reset">데이터 초기화</button>
        </footer>
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
      const synthReady = state.units.filter(u => !P().synthesisSelfError(state, u) && P().synthesisCandidates(state, u.uid).length).length;
      return `<div class="screen">
        ${topbar(state, `<h1>유닛 <small class="muted">${state.units.length}/${C().MAX_UNITS}</small></h1>`, 'lobby')}
        ${synthReady ? `<div class="card">🔮 합성 가능한 유닛이 ${synthReady}명 있습니다. 최대 레벨 유닛을 눌러 합성하세요.</div>` : ''}
        <div class="filters">${filters}</div>
        <div class="unit-grid">${list.map(u => unitTile(state, u, { action: 'unit' })).join('') || '<p class="muted">해당 등급의 유닛이 없습니다.</p>'}</div>
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

    // ---- 모달 ----
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
          <button class="btn" data-action="quit">나가기 <small>보상 없이 스테이지 선택으로</small></button>
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

      let body = '';
      if (summary && result.victory) {
        const rewards = [`🪙 +${fmt(summary.gold)}`, `EXP +${summary.exp}`];
        if (summary.gems) rewards.push(`💎 +${summary.gems} 첫 클리어`);
        const items = [];
        for (const l of summary.levelUps) items.push(`<li>${esc(l.name)} <span class="up">Lv.${l.from} → Lv.${l.to}${l.max ? ' MAX' : ''}</span></li>`);
        for (const f of summary.firstMax) items.push(`<li>🏆 ${esc(f.name)} 첫 MAX 보상 🪙 +${fmt(f.gold)} 💎 +${f.gems}</li>`);
        if (summary.drop) items.push(`<li>🎁 획득: ${esc(P().charOf(summary.drop.unit).name)} ${stars(summary.drop.unit.grade)} ${summary.drop.isNew ? '<span class="badge new">NEW</span>' : ''}</li>`);
        body = `<div class="reward-row">${rewards.map(r => `<span>${r}</span>`).join('')}</div>
          ${items.length ? `<ul class="result-list">${items.join('')}</ul>` : ''}`;
      } else if (!result.victory) {
        body = '<p class="hint" style="text-align:center">레벨을 올리거나, 합성·강화로 파티를 키운 뒤 다시 도전하세요.<br>리더와 배치를 바꾸는 것도 도움이 됩니다.</p>';
      }

      const canNext = summary && result.victory && nextId;
      return `<div class="modal result ${result.victory ? 'win' : 'lose'}">
        <h2>${result.victory ? '승리!' : '패배…'}</h2>
        <div class="result-stars">${[0, 1, 2].map(i => `<span class="${i < result.stars ? 'on' : ''}">★</span>`).join('')}</div>
        <ul class="star-conds">${conds}</ul>
        <p class="muted" style="text-align:center;margin:0 0 12px">시간 ${fmtTime(result.time)} · 아군 사망 ${result.deaths}</p>
        ${body}
        <div class="modal-actions">
          <button class="btn" data-action="quit">${summary ? '스테이지 선택' : '로비'}</button>
          <button class="btn" data-action="retry">다시 하기</button>
          ${canNext ? `<button class="btn primary" data-action="startStage" data-id="${nextId}">다음 스테이지 ›</button>` : ''}
          ${summary && !result.victory ? '<button class="btn primary" data-action="toParty">파티 편성</button>' : ''}
        </div>
      </div>`;
    }
  };

  G.Screens = Screens;
})(window.Game = window.Game || {});
