// 진입점: 화면 전환, 전투 ↔ 메타 진행 연결, 게임 루프 & 입력 (9.3 조작)
// 디버그 URL: ?party=BAS_0001,BAS_0004,BAS_0005&leader=0&stage=STG_01_01&seed=123&auto=1&speed=2&warp=60
//   → 세이브와 무관한 단독 전투로 바로 시작 (진행 미반영)
(function (G) {
  'use strict';

  const STEP = 1 / 60;
  const LONG_PRESS_MS = 400;
  const RESULT_DELAY = 1.2;
  const L = G.Layout;
  const P = G.Progression;
  const S = G.Screens;

  const canvas = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const modalRoot = document.getElementById('modal');
  const toastEl = document.getElementById('toast');
  const renderer = new G.Renderer(canvas);
  const params = new URLSearchParams(location.search);
  const debugBattle = ['party', 'stage', 'warp', 'seed'].some(k => params.has(k));

  const app = {
    state: G.SaveManager.load(),
    rng: G.createRng(Date.now()),
    view: { screen: 'lobby', partySlot: 0, unitFilter: 0, unitUid: null },
    battle: null,
    stageId: null,
    ui: { paused: false, speed: 1, auto: false, holdIndex: -1, hint: null },
    endTimer: 0,
    resultShown: false,
    press: null
  };
  app.ui.speed = app.state.settings.speed;
  app.ui.auto = app.state.settings.auto;
  G.Sound.setEnabled(app.state.settings.sfx, app.state.settings.bgm);

  function save() {
    app.state.settings.speed = app.ui.speed;
    app.state.settings.auto = app.ui.auto;
    if (!G.SaveManager.save(app.state)) toast('저장할 수 없습니다 (브라우저 저장소 차단). 진행이 유지되지 않을 수 있습니다.', 'bad');
  }

  // ---- 화면 ----
  let lastScreen = null;
  function render() {
    const inBattle = !!app.battle;
    document.body.classList.toggle('in-battle', inBattle);
    canvas.style.display = inBattle ? 'block' : 'none';
    uiRoot.style.display = inBattle ? 'none' : 'block';
    if (inBattle) return;
    G.Sound.setBgm('lobby');
    const scroll = uiRoot.scrollTop;
    uiRoot.innerHTML = S[app.view.screen](app.state, app.view);
    uiRoot.scrollTop = lastScreen === app.view.screen ? scroll : 0;
    lastScreen = app.view.screen;
  }

  function go(screen, extra) {
    Object.assign(app.view, { screen }, extra);
    modal('');
    render();
  }

  function modal(html) {
    modalRoot.innerHTML = html ? `<div class="modal-backdrop" data-action="backdrop">${html}</div>` : '';
  }

  function applySound() {
    G.Sound.setEnabled(app.state.settings.sfx, app.state.settings.bgm);
    save();
    if (app.battle) modal(S.pause(app.battle.stage.name, app.state.settings));
    else render();
  }

  let toastTimer = 0;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'show ' + (kind || '');
    if (kind) G.Sound.play(kind);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = ''; }, 2200);
  }

  // ---- 첫 전투 튜토리얼 (1-1 최초 1회) ----
  // 0: 블록 탭 (첫 블록이 나오면 전투를 멈추고 기다림) → 1: 2체인 이상 사용 → 2: 3체인 사용
  const tutorial = {
    step: -1,
    timer: 0,

    start(b) {
      this.step = !debugBattle && !app.state.tutorialDone && b.stage.id === G.StageOrder[0] ? 0 : -1;
      this.timer = 0;
      app.ui.hint = null;
    },

    get blocking() { return this.step === 0 && !!app.ui.hint; },

    update(b, dt) {
      if (this.step < 0) return;
      const groups = b.isCombat ? b.blocks.groups() : [];
      let hint = null;
      if (this.step === 0 && groups.length) {
        hint = { text: '블록을 눌러 스킬을 쓰세요!', group: groups[0] };
      } else if (this.step === 1) {
        const g = groups.find(x => x.length >= 2);
        if (g) hint = { text: '같은 캐릭터 블록이 붙으면 체인! 길수록 강력해요', group: g };
      } else if (this.step === 2) {
        const g = groups.find(x => x.length === 3);
        if (g) hint = { text: '3체인은 가장 강력한 스킬! 모아서 써 보세요', group: g };
      }
      this.timer = hint && app.ui.hint ? this.timer + dt : 0;
      app.ui.hint = hint;
      if (this.step > 0 && this.timer > 8) this.advance();   // 안내 후 8초 지나면 넘어감
    },

    onTap(chain) {
      if (this.step === 0 || (this.step === 1 && chain >= 2) || (this.step === 2 && chain === 3)) this.advance();
    },

    advance() {
      this.step++;
      this.timer = 0;
      app.ui.hint = null;
      if (this.step > 2) {
        this.step = -1;
        app.state.tutorialDone = true;
        save();
      }
    }
  };

  function playerTap(idx) {
    const b = app.battle;
    const group = b.blocks.groupAt(idx);
    if (group && b.tapBlock(idx)) tutorial.onTap(group.length);
  }

  // ---- 전투 ----
  // 터치 기기: 전체화면 + 가로 고정 시도 (미지원 브라우저는 무시 → 회전 안내 표시)
  function enterLandscape() {
    if (!window.matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
    const el = document.documentElement;
    if (!el.requestFullscreen) return;
    el.requestFullscreen()
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }

  function startBattle(stageId) {
    const opts = debugBattle ? debugBattleOptions() : {
      stageId,
      party: P.partyEntries(app.state),
      leaderIndex: app.state.party.leaderIndex,
      seed: Date.now()
    };
    if (!debugBattle && !P.isStageUnlocked(app.state, stageId)) return;
    if (!debugBattle) app.view.chapter = G.Stages[stageId].chapter;
    app.stageId = opts.stageId;
    app.battle = new G.BattleManager(Object.assign(opts, { auto: app.ui.auto }));
    const warp = debugBattle ? Number(params.get('warp')) || 0 : 0;
    while (app.battle.time < warp && !app.battle.isOver) app.battle.update(STEP);
    app.battle.drainEvents();
    renderer.reset(app.battle);
    Object.assign(app.ui, { paused: false, holdIndex: -1 });
    tutorial.start(app.battle);
    if (tutorial.step === 0) app.battle.auto = false;   // 튜토리얼은 직접 조작
    G.Sound.setBgm('battle');
    app.endTimer = 0;
    app.resultShown = false;
    app.press = null;
    modal('');
    render();
    fit();
  }

  function debugBattleOptions() {
    const ids = (params.get('party') || '').split(',').filter(id => G.Characters[id]);
    const leader = Number(params.get('leader'));
    return {
      stageId: G.Stages[params.get('stage')] ? params.get('stage') : 'STG_01_01',
      party: ids.length === 3 ? ids : G.DefaultParty.members,
      leaderIndex: leader >= 0 && leader < 3 ? leader : 0,
      seed: params.has('seed') ? Number(params.get('seed')) : Date.now()
    };
  }

  function onBattleEnd() {
    const result = app.battle.result;
    if (tutorial.step >= 0 && result.victory) {
      tutorial.step = -1;
      app.state.tutorialDone = true;
    }
    const summary = debugBattle ? null : P.applyBattleResult(app.state, result, app.rng);
    if (summary) save();
    const nextId = P.nextStageId(result.stageId);
    modal(S.battleResult(app.state, result, summary, nextId && P.isStageUnlocked(app.state, nextId) ? nextId : null));
  }

  function leaveBattle(screen) {
    app.battle = null;
    go(screen);
  }

  function pause() {
    if (!app.battle || app.battle.isOver || app.ui.paused) return;
    app.ui.paused = true;
    app.press = null;
    app.ui.holdIndex = -1;
    modal(S.pause(app.battle.stage.name, app.state.settings));
  }

  function resume() {
    app.ui.paused = false;
    modal('');
  }

  // ---- 액션 (data-action) ----
  const actions = {
    lobby: () => go('lobby'),
    stages: () => go('stages', { chapter: null }),
    party: () => go('party'),
    units: () => go('units'),
    unit: d => go('unit', { unitUid: Number(d.uid) }),
    help: () => modal(S.help()),
    closeModal: () => modal(''),
    backdrop: (d, e, el) => { if (e.target === el && !app.battle) modal(''); },

    filter: d => { app.view.unitFilter = Number(d.grade); render(); },
    chapter: d => { app.view.chapter = Number(d.chapter); render(); },
    partySlot: d => { app.view.partySlot = Number(d.slot); render(); },
    partyPick: d => {
      if (P.setPartyMember(app.state, app.view.partySlot, Number(d.uid))) {
        save();
        app.view.partySlot = (app.view.partySlot + 1) % 3;
      }
      render();
    },
    leader: d => { P.setLeader(app.state, Number(d.slot)); save(); render(); },

    enhance: d => {
      const r = P.enhance(app.state, Number(d.uid), app.rng);
      save();
      render();
      toast(r.success ? `강화 성공! +${r.enhance}` : '강화 실패… 골드만 소모되었습니다.', r.success ? 'good' : 'bad');
    },
    evolve: d => {
      const u = P.evolve(app.state, Number(d.uid));
      save();
      render();
      toast(`진화 완료! ★${u.grade}`, 'good');
    },
    synthPick: d => modal(S.synthPicker(app.state, Number(d.uid))),
    synthChoose: d => modal(S.synthConfirm(app.state, Number(d.a), Number(d.uid))),
    synthDo: d => {
      const got = P.synthesize(app.state, Number(d.a), Number(d.b), app.rng);
      save();
      app.view.unitUid = got.unit.uid;
      render();
      modal(S.reveal(app.state, '🔮 합성 결과', got));
      G.Sound.play('reveal');
    },

    release: d => {
      const u = P.findUnit(app.state, Number(d.uid));
      const data = P.charOf(u);
      const warn = data.type !== 'Basic' ? '<br><b>메인/한정 캐릭터입니다. 다시 얻기 어렵습니다.</b>' : '';
      modal(S.confirm('유닛 방출', `${data.name} (★${u.grade} Lv.${u.level}${u.enhance ? ' +' + u.enhance : ''})을(를) 방출하고 🪙 ${P.releaseGold(u)}을 받습니다.${warn}`,
        'releaseDo', data.type !== 'Basic', { uid: u.uid }));
    },
    releaseDo: d => {
      const gold = P.release(app.state, Number(d.uid));
      save();
      go('units');
      toast(`방출 완료 · 🪙 +${gold}`, 'good');
    },
    summon: () => modal(S.summon(app.state)),
    summonDo: () => {
      const err = P.summonError(app.state);
      if (err) { toast(err, 'bad'); return; }
      const got = P.summon(app.state, app.rng);
      save();
      render();
      modal(S.reveal(app.state, '✨ 소환 결과', got, 'summonDo'));
      G.Sound.play('reveal');
    },

    toggleSfx: () => {
      app.state.settings.sfx = !app.state.settings.sfx;
      applySound();
    },
    toggleBgm: () => {
      app.state.settings.bgm = !app.state.settings.bgm;
      applySound();
    },

    reset: () => modal(S.confirm('데이터 초기화', '모든 유닛과 진행 상황이 삭제되고 처음부터 시작합니다. 되돌릴 수 없습니다.', 'resetDo', true)),
    resetDo: () => {
      app.state = G.SaveManager.reset();
      G.Sound.setEnabled(app.state.settings.sfx, app.state.settings.bgm);
      save();
      go('lobby');
      toast('초기화되었습니다.');
    },

    startStage: d => { enterLandscape(); startBattle(d.id); },
    resume,
    retry: () => startBattle(app.stageId),
    quit: () => leaveBattle(debugBattle ? 'lobby' : 'stages'),
    toParty: () => leaveBattle('party')
  };

  function dispatch(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    try {
      if (el.dataset.action !== 'backdrop') G.Sound.play('ui');
      fn(el.dataset, e, el);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }
  uiRoot.addEventListener('click', dispatch);
  modalRoot.addEventListener('click', dispatch);

  // ---- 전투 입력 ----
  function fit() {
    const scale = Math.min(window.innerWidth / L.W, window.innerHeight / L.H);
    canvas.style.width = Math.floor(L.W * scale) + 'px';
    canvas.style.height = Math.floor(L.H * scale) + 'px';
  }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * L.W / r.width, y: (e.clientY - r.top) * L.H / r.height };
  }

  function toggleAuto() {
    app.ui.auto = !app.ui.auto;
    app.battle.auto = app.ui.auto;
    save();
  }

  function toggleSpeed() {
    app.ui.speed = app.ui.speed === 1 ? 2 : 1;
    save();
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const b = app.battle;
    if (!b || b.isOver || app.ui.paused) return;
    const p = toLogical(e);
    if (L.hit(L.pauseBtn, p.x, p.y)) { pause(); return; }
    if (L.hit(L.speedBtn, p.x, p.y)) { toggleSpeed(); return; }
    if (L.hit(L.autoBtn, p.x, p.y)) { toggleAuto(); return; }
    const idx = L.cellIndexAt(p.x, p.y);
    if (idx >= 0) app.press = { idx, t: performance.now(), long: false };
  });

  canvas.addEventListener('pointerup', () => {
    if (app.press && !app.press.long && app.battle && !app.ui.paused) playerTap(app.press.idx);
    app.press = null;
    app.ui.holdIndex = -1;
  });
  canvas.addEventListener('pointercancel', () => { app.press = null; app.ui.holdIndex = -1; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    const b = app.battle;
    if (!b) return;
    if (e.code === 'Space' || e.code === 'Escape') {
      e.preventDefault();
      if (b.isOver) return;
      if (app.ui.paused) resume();
      else pause();
      return;
    }
    if (b.isOver || app.ui.paused) return;
    if (e.code === 'KeyS') toggleSpeed();
    else if (e.code === 'KeyA') toggleAuto();
    else if (/^Digit[1-9]$/.test(e.code)) playerTap(Number(e.code.slice(5)) - 1);
  });

  window.addEventListener('resize', fit);
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      G.Sound.suspend();
    } else {
      G.Sound.resume();
    }
  });
  // 브라우저 자동재생 정책: 첫 입력 때 오디오 시작
  window.addEventListener('pointerdown', () => G.Sound.unlock(), true);
  window.addEventListener('keydown', () => G.Sound.unlock(), true);

  // ---- 루프 ----
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    const b = app.battle;
    if (b) {
      if (app.press && !app.press.long && now - app.press.t >= LONG_PRESS_MS) {
        app.press.long = true;
        app.ui.holdIndex = app.press.idx;
      }
      if (!app.ui.paused && !b.isOver) tutorial.update(b, real);
      if (!app.ui.paused && !b.isOver && !tutorial.blocking) {
        acc += real * app.ui.speed;
        while (acc >= STEP) {
          b.update(STEP);
          acc -= STEP;
        }
      } else {
        acc = 0;
      }
      if (b.isOver && !app.resultShown) {
        app.endTimer += real;
        if (app.endTimer >= RESULT_DELAY) {
          app.resultShown = true;
          onBattleEnd();
        }
      }
      const events = b.drainEvents();
      renderer.consume(events);
      G.Sound.consume(events);
      renderer.update(app.ui.paused ? 0 : real * app.ui.speed, real);
      renderer.draw(app.ui);
    }
    requestAnimationFrame(frame);
  }

  fit();
  if (debugBattle) startBattle();
  else render();
  requestAnimationFrame(frame);
})(window.Game = window.Game || {});
