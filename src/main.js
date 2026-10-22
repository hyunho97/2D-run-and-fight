// 진입점: 게임 루프 & 입력 (9.3 조작)
// URL 파라미터: ?party=BAS_0001,BAS_0004,BAS_0005&leader=0&stage=STG_01_01&seed=123&auto=1&speed=2&warp=60
(function (G) {
  'use strict';

  const STEP = 1 / 60;
  const LONG_PRESS_MS = 400;
  const L = G.Layout;

  const canvas = document.getElementById('game');
  const renderer = new G.Renderer(canvas);
  const params = new URLSearchParams(location.search);

  const ui = { paused: false, speed: Number(params.get('speed')) === 2 ? 2 : 1, auto: params.get('auto') === '1', holdIndex: -1 };
  let battle = null;
  let press = null;

  function partyFromParams() {
    const ids = (params.get('party') || '').split(',').filter(id => G.Characters[id]);
    const leader = Number(params.get('leader'));
    return ids.length === 3
      ? { members: ids, leaderIndex: leader >= 0 && leader < 3 ? leader : 0 }
      : G.DefaultParty;
  }

  function newBattle() {
    const party = partyFromParams();
    const stageId = G.Stages[params.get('stage')] ? params.get('stage') : 'STG_01_01';
    const seed = params.has('seed') ? Number(params.get('seed')) : Date.now();
    battle = new G.BattleManager({ stageId, party: party.members, leaderIndex: party.leaderIndex, seed, auto: ui.auto });
    // 디버그: warp=N 이면 N초를 미리 진행 (보스/광폭화 확인용)
    const warp = Number(params.get('warp')) || 0;
    while (battle.time < warp && !battle.isOver) battle.update(STEP);
    renderer.reset(battle);
    battle.drainEvents();
    ui.paused = false;
    ui.holdIndex = -1;
    press = null;
  }

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
    ui.auto = !ui.auto;
    battle.auto = ui.auto;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const p = toLogical(e);

    if (battle.isOver) {
      if (L.hit(L.resultBtn, p.x, p.y)) newBattle();
      return;
    }
    if (ui.paused) { ui.paused = false; return; }
    if (L.hit(L.pauseBtn, p.x, p.y)) { ui.paused = true; return; }
    if (L.hit(L.speedBtn, p.x, p.y)) { ui.speed = ui.speed === 1 ? 2 : 1; return; }
    if (L.hit(L.autoBtn, p.x, p.y)) { toggleAuto(); return; }

    const idx = L.cellIndexAt(p.x, p.y);
    if (idx >= 0) press = { idx, t: performance.now(), long: false };
  });

  canvas.addEventListener('pointerup', () => {
    if (press && !press.long && !ui.paused) battle.tapBlock(press.idx);
    press = null;
    ui.holdIndex = -1;
  });

  canvas.addEventListener('pointercancel', () => { press = null; ui.holdIndex = -1; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyR') { newBattle(); return; }
    if (battle.isOver) return;
    if (e.code === 'Space') { ui.paused = !ui.paused; e.preventDefault(); return; }
    if (ui.paused) return;
    if (e.code === 'KeyS') ui.speed = ui.speed === 1 ? 2 : 1;
    else if (e.code === 'KeyA') toggleAuto();
    else if (/^Digit[1-9]$/.test(e.code)) battle.tapBlock(Number(e.code.slice(5)) - 1);
  });

  window.addEventListener('resize', fit);
  window.addEventListener('blur', () => { if (battle && !battle.isOver) ui.paused = true; });

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (press && !press.long && now - press.t >= LONG_PRESS_MS) {
      press.long = true;
      ui.holdIndex = press.idx;
    }

    const running = !ui.paused && !battle.isOver;
    if (running) {
      acc += real * ui.speed;
      while (acc >= STEP) {
        battle.update(STEP);
        acc -= STEP;
      }
    }
    renderer.consume(battle.drainEvents());
    renderer.update(ui.paused ? 0 : real * ui.speed, real);
    renderer.draw(ui);
    requestAnimationFrame(frame);
  }

  fit();
  newBattle();
  requestAnimationFrame(frame);
})(window.Game = window.Game || {});
