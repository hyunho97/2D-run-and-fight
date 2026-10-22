// Canvas 렌더링 (논리 해상도 1920x1080, 9.1 전투 화면 레이아웃)
(function (G) {
  'use strict';

  const C = G.Config;
  const W = 1920;
  const H = 1080;
  const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  const CELL = 150;
  const GAP = 12;
  const STRIDE = CELL + GAP;
  const BAR_X = (W - (C.BLOCK_SLOTS * CELL + (C.BLOCK_SLOTS - 1) * GAP)) / 2;
  const HERO_H = 120;

  const Layout = {
    W, H,
    GROUND_Y: 650,
    PANEL_Y: 730,
    BAR_Y: 762,
    PARTY_Y: 948,
    pauseBtn: { x: 24, y: 18, w: 72, h: 64 },
    speedBtn: { x: 1600, y: 18, w: 130, h: 64 },
    autoBtn: { x: 1746, y: 18, w: 150, h: 64 },
    resultBtn: { x: 810, y: 770, w: 300, h: 90 },

    cellX(v) { return BAR_X + v * STRIDE; },
    cellIndexAt(px, py) {
      if (py < this.BAR_Y || py > this.BAR_Y + CELL) return -1;
      const rel = px - BAR_X;
      if (rel < 0) return -1;
      const i = Math.floor(rel / STRIDE);
      if (i >= C.BLOCK_SLOTS || rel - i * STRIDE > CELL) return -1;
      return i;
    },
    hit(r, px, py) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
  };
  G.Layout = Layout;

  // ---- 그리기 헬퍼 ----
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  // amt > 0 밝게, amt < 0 어둡게
  function shade(hex, amt) {
    const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    const [r, g, b] = rgb(hex);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function text(ctx, str, x, y, size, color, align, weight, stroke) {
    ctx.font = `${weight || 'bold'} ${size}px ${FONT}`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function hpBar(ctx, x, y, w, h, ratio, color) {
    rr(ctx, x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();
    if (ratio > 0) {
      rr(ctx, x, y, Math.max(h, w * ratio), h, h / 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function star(ctx, cx, cy, r, filled) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? '#FFD23F' : '#3a4055';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = filled ? '#b8860b' : '#22273a';
    ctx.stroke();
  }

  function fmtTime(t) {
    const s = Math.floor(t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function unitHeight(u) { return u.side === 'hero' ? HERO_H : u.data.size; }
  function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      canvas.width = W;
      canvas.height = H;
      this.t = 0;
    }

    reset(battle) {
      this.battle = battle;
      this.texts = [];
      this.particles = [];
      this.projectiles = [];
      this.bursts = [];
      this.banners = [];
      this.shake = 0;
      this.camX = battle.frontHero().x - 700;
    }

    // ---- 이벤트 → 연출 ----
    consume(events) {
      for (const e of events) this.onEvent(e);
    }

    onEvent(e) {
      const midY = u => Layout.GROUND_Y - unitHeight(u) * 0.55;
      switch (e.type) {
        case 'damage': {
          const t = e.target;
          t.fx.flash = 0.12;
          const color = t.side === 'hero' ? '#ff7070' : e.crit ? '#FFD23F' : '#ffffff';
          const size = e.crit ? 56 : e.chain ? 38 + e.chain * 6 : 34;
          this.addText(t, (e.crit ? '치명! ' : '') + e.amount, color, size);
          this.spark(t.x, midY(t), e.crit || e.chain === 3 ? 16 : 7, e.chain ? '#FFD23F' : '#ffffff');
          break;
        }
        case 'miss':
          this.addText(e.target, 'MISS', '#9fb3c8', 32);
          break;
        case 'heal':
          this.addText(e.target, '+' + e.amount, '#6EE77A', 42);
          this.spark(e.target.x, midY(e.target), 10, '#6EE77A', -1);
          break;
        case 'attack':
          e.attacker.fx.lunge = 0.14;
          if (e.attacker.range > 250) {
            const dir = e.attacker.side === 'hero' ? 1 : -1;
            this.projectiles.push({
              x: e.attacker.x + dir * 30, y: midY(e.attacker), target: e.target,
              t: 0, dur: 0.18, color: e.attacker.color
            });
          }
          break;
        case 'skill': {
          const color = e.caster.color;
          for (const t of e.targets) {
            this.bursts.push({ x: t.x, y: midY(t), r: 50 + e.chain * 55, life: 0.3 + e.chain * 0.1, max: 0.3 + e.chain * 0.1, color, width: 4 + e.chain * 4 });
          }
          if (e.chain === 3) {
            this.shake = 0.45;
            this.banners.push({ kind: 'cutin', text: `${e.caster.name} — ${e.skill.name}`, color, life: 1.1, max: 1.1 });
          }
          break;
        }
        case 'cast':
          this.addText(e.caster, e.name + '!', '#ff9f43', 40, 60);
          break;
        case 'bossSkill':
          this.shake = 0.5;
          for (const t of e.targets) {
            this.bursts.push({ x: t.x, y: midY(t), r: 120, life: 0.4, max: 0.4, color: '#ff4040', width: 10 });
          }
          break;
        case 'interrupt':
          this.addText(e.caster, '시전 차단!', '#7fd3ff', 44, 60);
          break;
        case 'death':
          this.spark(e.unit.x, midY(e.unit), 24, e.unit.color);
          break;
        case 'wave':
          this.banners.push({ kind: 'title', text: e.isBoss ? 'BOSS' : `WAVE ${e.index + 1}`, color: e.isBoss ? '#ff5050' : '#ffffff', life: 1.6, max: 1.6 });
          break;
        case 'berserkWarning':
          this.banners.push({ kind: 'title', text: '광폭화 임박!', color: '#ff6b6b', life: 1.6, max: 1.6 });
          break;
        case 'berserk':
          this.shake = 0.6;
          this.banners.push({ kind: 'title', text: '광폭화!', sub: '적 공격 속도·피해 2배 / CC 면역', color: '#ff3030', life: 2.2, max: 2.2 });
          break;
        case 'phase':
          this.banners.push({ kind: 'title', text: '보스 분노!', sub: '공격 속도 증가', color: '#ff9f43', life: 1.6, max: 1.6 });
          break;
      }
    }

    addText(unit, str, color, size, extraY) {
      this.texts.push({
        x: unit.x + (Math.random() - 0.5) * 40,
        y: Layout.GROUND_Y - unitHeight(unit) - 40 - (extraY || 0),
        vy: -110, text: str, color, size, life: 0.9, max: 0.9
      });
    }

    spark(x, y, n, color, gravity) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 150 + Math.random() * 350;
        this.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150,
          g: gravity === -1 ? -200 : 900, life: 0.5 + Math.random() * 0.3, size: 5 + Math.random() * 6, color
        });
      }
    }

    // dt: 게임 시간(배속 반영, 일시정지 시 0), realDt: 실제 경과 시간
    update(dt, realDt) {
      const b = this.battle;
      this.t += realDt;
      const camTarget = b.frontHero().x - 700;
      this.camX += (camTarget - this.camX) * Math.min(1, realDt * 4);
      this.shake = Math.max(0, this.shake - dt);

      for (const u of b.heroes.concat(b.enemies)) {
        u.fx.flash = Math.max(0, u.fx.flash - dt);
        u.fx.lunge = Math.max(0, u.fx.lunge - dt);
      }
      for (const p of this.texts) { p.y += p.vy * dt; p.vy *= 0.97; p.life -= dt; }
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
      for (const p of this.projectiles) p.t += dt / p.dur;
      for (const p of this.bursts) p.life -= dt;
      for (const p of this.banners) p.life -= realDt;
      this.texts = this.texts.filter(p => p.life > 0);
      this.particles = this.particles.filter(p => p.life > 0);
      this.projectiles = this.projectiles.filter(p => p.t < 1);
      this.bursts = this.bursts.filter(p => p.life > 0);
      this.banners = this.banners.filter(p => p.life > 0);

      // 블록 슬라이드: 새 블록은 오른쪽 끝에서 들어오고, 빈칸이 생기면 왼쪽으로 밀림
      b.blocks.slots.forEach((blk, i) => {
        if (blk.vx == null) blk.vx = C.BLOCK_SLOTS;
        blk.vx += (i - blk.vx) * Math.min(1, realDt * 16);
      });
    }

    // ---- 그리기 ----
    draw(ui) {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake > 0) {
        const m = 28 * Math.min(1, this.shake / 0.5);
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      this.drawBackground();
      this.drawUnits();
      this.drawEffects();
      ctx.restore();

      this.drawBerserkFrame();
      this.drawHud(ui);
      this.drawBossBar();
      this.drawPanel(ui);
      this.drawBanners();
      if (this.battle.isOver) this.drawResult();
      else if (ui.paused) this.drawPause();
    }

    drawBackground() {
      const ctx = this.ctx;
      const gy = Layout.GROUND_Y;
      const berserk = this.battle.berserk;

      const sky = ctx.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, berserk ? '#5a1f2b' : '#6ec3e8');
      sky.addColorStop(1, berserk ? '#c46b5a' : '#d4f1fb');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, gy);

      // 원경 산 (패럴랙스 0.15)
      ctx.fillStyle = berserk ? '#7a4a4a' : '#93c4a0';
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= W; x += 16) {
        const wx = x + this.camX * 0.15;
        ctx.lineTo(x, gy - 190 - Math.sin(wx * 0.004) * 60 - Math.sin(wx * 0.011) * 25);
      }
      ctx.lineTo(W, gy);
      ctx.fill();

      // 나무 (패럴랙스 0.45)
      const p = this.camX * 0.45;
      const spacing = 230;
      const first = Math.floor(p / spacing) - 1;
      for (let k = first; k < first + W / spacing + 3; k++) {
        const x = k * spacing - p + hash(k) * 80;
        const s = 0.7 + hash(k + 99) * 0.6;
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(x - 10 * s, gy - 120 * s, 20 * s, 100 * s);
        ctx.fillStyle = berserk ? '#5c5a2a' : (k % 2 ? '#3f8a4a' : '#4c9a50');
        ctx.beginPath();
        ctx.arc(x, gy - 150 * s, 70 * s, 0, Math.PI * 2);
        ctx.fill();
      }

      // 지면
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(0, gy - 10, W, Layout.PANEL_Y - gy + 10);
      ctx.fillStyle = '#6aa84f';
      ctx.fillRect(0, gy - 16, W, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      const off = ((this.camX % 120) + 120) % 120;
      for (let x = -off; x < W; x += 120) ctx.fillRect(x, gy + 30, 60, 10);
    }

    drawUnits() {
      const b = this.battle;
      for (const e of b.enemies) this.drawEnemy(e);
      for (const h of b.heroes.slice().sort((a, c) => c.slot - a.slot)) this.drawHero(h);
    }

    drawHero(u) {
      const ctx = this.ctx;
      const gy = Layout.GROUND_Y;
      const moving = this.battle.state === 'Moving' && u.alive;
      const x = u.x - this.camX + (u.fx.lunge > 0 ? 16 : 0);
      const bob = moving ? -Math.abs(Math.sin(this.t * 10 + u.slot)) * 8 : 0;
      const color = u.color;
      const cls = G.Classes[u.data.class];

      ctx.save();
      ctx.globalAlpha = u.alive ? 1 : 0.25;

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(u.x - this.camX, gy + 4, 44, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      const top = gy - 100 + bob;
      const grad = ctx.createLinearGradient(0, top, 0, top + 90);
      grad.addColorStop(0, shade(color, 0.25));
      grad.addColorStop(1, shade(color, -0.25));
      rr(ctx, x - 38, top, 76, 90, 18);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = shade(color, -0.55);
      ctx.stroke();
      text(ctx, cls.glyph, x, top + 46, 36, '#ffffff', 'center', 'bold', 5);

      // 머리
      ctx.beginPath();
      ctx.arc(x + 4, top - 22, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#f6d7b0';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#8a6a4a';
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 12, top - 28, 5, 9);
      ctx.fillRect(x + 22, top - 28, 5, 9);

      if (u.fx.flash > 0) {
        ctx.globalAlpha = 0.6;
        rr(ctx, x - 38, top, 76, 90, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = u.alive ? 1 : 0.25;
      }

      if (u.isLeader) text(ctx, '♛', x + 4, top - 64, 30, '#FFD23F', 'center', 'bold', 4);
      if (u.alive) {
        hpBar(ctx, x - 45, top - 84, 90, 10, u.hpRatio, u.hpRatio > 0.3 ? '#5be36b' : '#ff5a5a');
        if (G.StatusEffectSystem.isDisabled(u)) text(ctx, '💫', x, top - 110, 30, '#fff');
      }
      ctx.restore();
    }

    drawEnemy(u) {
      if (!u.alive) return;
      const ctx = this.ctx;
      const gy = Layout.GROUND_Y;
      const s = u.data.size;
      const x = u.x - this.camX - (u.fx.lunge > 0 ? 16 : 0);
      const cy = gy - s * 0.45;

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, gy + 4, s * 0.6, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      if (u.berserk) {
        ctx.shadowColor = '#ff2020';
        ctx.shadowBlur = 30 + Math.sin(this.t * 10) * 12;
      }
      ctx.beginPath();
      ctx.ellipse(x, cy, s * 0.55, s * 0.47, 0, 0, Math.PI * 2);
      const grad = ctx.createLinearGradient(0, cy - s * 0.5, 0, cy + s * 0.5);
      grad.addColorStop(0, shade(u.color, 0.2));
      grad.addColorStop(1, shade(u.color, -0.35));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 4;
      ctx.strokeStyle = shade(u.color, -0.6);
      ctx.stroke();

      if (u.isBoss) {
        ctx.fillStyle = '#e8e0c8';
        for (const dx of [-0.3, 0.2]) {
          ctx.beginPath();
          ctx.moveTo(x + dx * s, cy - s * 0.35);
          ctx.lineTo(x + (dx - 0.12) * s, cy - s * 0.75);
          ctx.lineTo(x + (dx + 0.1) * s, cy - s * 0.4);
          ctx.fill();
        }
      }

      // 눈 (왼쪽 = 파티 방향)
      const eyeR = s * 0.08;
      for (const dx of [-0.25, -0.02]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, cy - s * 0.08, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + dx * s - eyeR * 0.35, cy - s * 0.08, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = u.berserk ? '#ff1010' : '#111';
        ctx.fill();
      }

      if (u.fx.flash > 0) {
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(x, cy, s * 0.55, s * 0.47, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (!u.isBoss) hpBar(ctx, x - s * 0.55, gy - s - 22, s * 1.1, 9, u.hpRatio, '#ff5a5a');
      if (G.StatusEffectSystem.isDisabled(u)) text(ctx, '💫', x, gy - s - 50, 30, '#fff');

      if (u.cast) {
        const w = 220;
        const y = gy - s - 60;
        hpBar(ctx, x - w / 2, y, w, 14, 1 - u.cast.remaining / u.cast.total, '#ff9f43');
        text(ctx, u.cast.name, x, y - 22, 26, '#ffd9a8', 'center', 'bold', 5);
      }
      ctx.restore();
    }

    drawEffects() {
      const ctx = this.ctx;
      const cam = this.camX;

      for (const p of this.projectiles) {
        const tx = p.target.x;
        const ty = Layout.GROUND_Y - unitHeight(p.target) * 0.55;
        const x = p.x + (tx - p.x) * p.t - cam;
        const y = p.y + (ty - p.y) * p.t;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }

      for (const b of this.bursts) {
        const k = 1 - b.life / b.max;
        ctx.globalAlpha = b.life / b.max;
        ctx.beginPath();
        ctx.arc(b.x - cam, b.y, b.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
        ctx.fillStyle = rgba(b.color, 0.25);
        ctx.fill();
        ctx.lineWidth = b.width;
        ctx.strokeStyle = b.color;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const p of this.particles) {
        ctx.globalAlpha = Math.min(1, p.life * 2.5);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - cam - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      for (const p of this.texts) {
        ctx.globalAlpha = Math.min(1, p.life * 3);
        text(ctx, p.text, p.x - cam, p.y, p.size, p.color, 'center', 'bold', 7);
      }
      ctx.globalAlpha = 1;
    }

    drawBerserkFrame() {
      const b = this.battle;
      const ctx = this.ctx;
      if (b.berserkWarning) {
        const a = 0.35 + 0.3 * Math.sin(this.t * 9);
        ctx.lineWidth = 36;
        ctx.strokeStyle = `rgba(255,30,30,${a})`;
        ctx.strokeRect(18, 18, W - 36, Layout.PANEL_Y - 36);
        text(ctx, `⚠ 광폭화까지 ${Math.ceil(b.berserkCountdown)}초`, W / 2, 190, 44, '#ffdddd', 'center', 'bold', 8);
      } else if (b.berserk) {
        ctx.lineWidth = 24;
        ctx.strokeStyle = 'rgba(255,30,30,0.25)';
        ctx.strokeRect(12, 12, W - 24, Layout.PANEL_Y - 24);
      }
    }

    drawButton(r, label, active) {
      const ctx = this.ctx;
      rr(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = active ? 'rgba(80,200,120,0.85)' : 'rgba(10,14,24,0.6)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 30, '#fff');
    }

    drawHud(ui) {
      const b = this.battle;
      const ctx = this.ctx;

      const pb = Layout.pauseBtn;
      this.drawButton(pb, '', false);
      ctx.fillStyle = '#fff';
      ctx.fillRect(pb.x + 24, pb.y + 18, 8, 28);
      ctx.fillRect(pb.x + 40, pb.y + 18, 8, 28);

      const normal = b.stage.waves.filter(w => !w.isBoss).length;
      const label = b.currentWave.isBoss ? '보스' : `웨이브 ${b.waveIndex + 1}/${normal}`;
      text(ctx, b.stage.name, W / 2, 30, 24, '#ffffff', 'center', 'bold', 5);
      text(ctx, label, W / 2, 68, 38, '#ffffff', 'center', 'bold', 6);

      const danger = b.berserkWarning || b.berserk;
      text(ctx, '⏱ ' + fmtTime(b.time), 1470, 50, 38, danger ? '#ff6b6b' : '#ffffff', 'center', 'bold', 6);

      this.drawButton(Layout.speedBtn, 'x' + ui.speed, ui.speed > 1);
      this.drawButton(Layout.autoBtn, 'AUTO', b.auto);
    }

    drawBossBar() {
      const b = this.battle;
      const boss = b.enemies.find(e => e.isBoss && e.alive);
      if (!boss || b.state === 'Moving') return;
      const w = 900;
      const x = (W - w) / 2;
      text(this.ctx, `${boss.name}${boss.phase > 1 ? ' (분노)' : ''}`, W / 2, 118, 28, '#ffd0d0', 'center', 'bold', 6);
      hpBar(this.ctx, x, 140, w, 22, boss.hpRatio, boss.berserk ? '#ff2a2a' : '#c0392b');
    }

    drawPanel(ui) {
      const ctx = this.ctx;
      const b = this.battle;
      const py = Layout.PANEL_Y;

      const bg = ctx.createLinearGradient(0, py, 0, H);
      bg.addColorStop(0, '#232a3d');
      bg.addColorStop(1, '#121622');
      ctx.fillStyle = bg;
      ctx.fillRect(0, py, W, H - py);
      ctx.fillStyle = '#3b4560';
      ctx.fillRect(0, py, W, 4);

      // 빈 칸
      for (let i = 0; i < C.BLOCK_SLOTS; i++) {
        rr(ctx, Layout.cellX(i), Layout.BAR_Y, CELL, CELL, 20);
        ctx.fillStyle = '#1a1f2e';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2e364c';
        ctx.stroke();
      }

      const slots = b.blocks.slots;
      const ownerOf = uid => b.heroes.find(h => h.uid === uid);
      const groups = b.blocks.groups();

      // 체인 묶음 테두리
      for (const g of groups) {
        if (g.length < 2) continue;
        const color = ownerOf(g.owner).color;
        const x0 = Layout.cellX(slots[g.start].vx) - 7;
        const x1 = Layout.cellX(slots[g.start + g.length - 1].vx) + CELL + 7;
        ctx.save();
        if (g.length === 3) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 25 + Math.sin(this.t * 8) * 10;
        }
        rr(ctx, x0, Layout.BAR_Y - 7, x1 - x0, CELL + 14, 26);
        ctx.fillStyle = rgba(color, 0.3);
        ctx.fill();
        ctx.lineWidth = g.length === 3 ? 7 : 4;
        ctx.strokeStyle = shade(color, 0.35);
        ctx.stroke();
        ctx.restore();
      }

      // 블록
      for (const blk of slots) {
        const owner = ownerOf(blk.owner);
        const color = owner.color;
        const x = Layout.cellX(blk.vx);
        const y = Layout.BAR_Y;
        const grad = ctx.createLinearGradient(0, y, 0, y + CELL);
        grad.addColorStop(0, shade(color, 0.3));
        grad.addColorStop(1, shade(color, -0.3));
        rr(ctx, x + 8, y + 8, CELL - 16, CELL - 16, 18);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = shade(color, -0.55);
        ctx.stroke();
        text(ctx, G.Classes[owner.data.class].glyph, x + CELL / 2, y + CELL / 2 + 2, 60, '#ffffff', 'center', 'bold', 7);
      }

      // 체인 수 뱃지
      for (const g of groups) {
        if (g.length < 2) continue;
        const last = slots[g.start + g.length - 1];
        const cx = Layout.cellX(last.vx) + CELL - 10;
        const cy = Layout.BAR_Y + 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.fillStyle = g.length === 3 ? '#FFD23F' : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1a1f2e';
        ctx.stroke();
        text(ctx, String(g.length), cx, cy + 1, 28, '#1a1f2e');
      }

      // 블록 생성 진행도
      const pw = C.BLOCK_SLOTS * STRIDE - GAP;
      const prog = b.isCombat && !b.blocks.isFull ? b.blocks.spawnTimer / C.BLOCK_SPAWN_INTERVAL : 0;
      ctx.fillStyle = '#1a1f2e';
      ctx.fillRect(BAR_X, Layout.BAR_Y + CELL + 10, pw, 6);
      ctx.fillStyle = '#7fd3ff';
      ctx.fillRect(BAR_X, Layout.BAR_Y + CELL + 10, pw * prog, 6);

      if (!b.isCombat && !b.isOver) {
        rr(ctx, BAR_X - 10, Layout.BAR_Y - 10, pw + 20, CELL + 20, 24);
        ctx.fillStyle = 'rgba(10,12,20,0.55)';
        ctx.fill();
        text(ctx, b.state === 'Moving' ? '전진 중…' : '웨이브 클리어!', W / 2, Layout.BAR_Y + CELL / 2, 40, '#c8d0e0', 'center', 'bold', 6);
      }

      this.drawTooltip(ui);
      this.drawParty();
    }

    drawTooltip(ui) {
      const b = this.battle;
      if (ui.holdIndex < 0) return;
      const group = b.blocks.groupAt(ui.holdIndex);
      if (!group) return;
      const owner = b.heroes.find(h => h.uid === group.owner);
      const skill = G.SkillExecutor.skillOf(owner);
      const ctx = this.ctx;
      const w = 620;
      const h = 190;
      const x = G.clamp(Layout.cellX(ui.holdIndex) + CELL / 2 - w / 2, 20, W - w - 20);
      const y = Layout.BAR_Y - h - 24;
      rr(ctx, x, y, w, h, 18);
      ctx.fillStyle = 'rgba(12,16,28,0.95)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = owner.color;
      ctx.stroke();
      text(ctx, `${owner.name} · ${skill.name}`, x + 28, y + 36, 32, '#fff', 'left');
      const unit = skill.kind === 'heal' ? '아군 회복 ATK ' : '피해 ';
      skill.coef.forEach((c, i) => {
        const active = i + 1 === group.length;
        text(ctx, `${i + 1}체인: ${unit}${Math.round(c * 100)}%`, x + 28, y + 84 + i * 36, 28,
          active ? '#FFD23F' : '#8a93a8', 'left', active ? 'bold' : 'normal');
      });
    }

    drawParty() {
      const ctx = this.ctx;
      const cw = 460;
      const gap = 30;
      const x0 = (W - (cw * 3 + gap * 2)) / 2;
      const y = Layout.PARTY_Y;
      this.battle.heroes.forEach((h, i) => {
        const x = x0 + i * (cw + gap);
        const cls = G.Classes[h.data.class];
        ctx.save();
        ctx.globalAlpha = h.alive ? 1 : 0.45;
        rr(ctx, x, y, cw, 112, 16);
        ctx.fillStyle = '#262e44';
        ctx.fill();
        rr(ctx, x + 14, y + 14, 84, 84, 14);
        ctx.fillStyle = h.color;
        ctx.fill();
        text(ctx, cls.glyph, x + 56, y + 58, 44, '#fff', 'center', 'bold', 5);
        text(ctx, (h.isLeader ? '♛ ' : '') + h.name, x + 116, y + 32, 28, h.isLeader ? '#FFD23F' : '#ffffff', 'left');
        text(ctx, `${cls.name} · ${cls.role}`, x + cw - 18, y + 32, 22, '#8a93a8', 'right', 'normal');
        hpBar(ctx, x + 116, y + 62, cw - 136, 22, h.hpRatio, h.hpRatio > 0.3 ? '#5be36b' : '#ff5a5a');
        text(ctx, h.alive ? `${Math.ceil(h.hp)} / ${h.maxHp}` : '전투 불능', x + 116 + (cw - 136) / 2, y + 74, 20, '#ffffff', 'center', 'bold', 4);
        ctx.restore();
      });
    }

    drawBanners() {
      const ctx = this.ctx;
      for (const bn of this.banners) {
        const age = bn.max - bn.life;
        if (bn.kind === 'cutin') {
          const slide = Math.min(1, age / 0.15);
          const fade = Math.min(1, bn.life / 0.25);
          ctx.globalAlpha = fade;
          const x = (1 - slide) * -W;
          ctx.fillStyle = rgba(bn.color, 0.85);
          ctx.beginPath();
          ctx.moveTo(x, 330);
          ctx.lineTo(x + W, 300);
          ctx.lineTo(x + W, 420);
          ctx.lineTo(x, 450);
          ctx.fill();
          text(ctx, bn.text, x + W / 2, 375, 64, '#ffffff', 'center', 'bold', 10);
          text(ctx, '3 CHAIN!', x + W / 2 + 520, 330, 36, '#FFD23F', 'center', 'bold', 7);
        } else {
          const scale = 1 + Math.max(0, 0.3 - age) * 1.5;
          ctx.globalAlpha = Math.min(1, bn.life / 0.4);
          text(ctx, bn.text, W / 2, 300, Math.round(96 * scale), bn.color, 'center', 'bold', 12);
          if (bn.sub) text(ctx, bn.sub, W / 2, 380, 36, '#ffffff', 'center', 'bold', 7);
        }
        ctx.globalAlpha = 1;
      }
    }

    drawPause() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(5,8,15,0.6)';
      ctx.fillRect(0, 0, W, H);
      text(ctx, '일시정지', W / 2, H / 2 - 40, 90, '#ffffff', 'center', 'bold', 10);
      text(ctx, '화면을 탭하거나 Space 키로 계속', W / 2, H / 2 + 50, 32, '#c8d0e0', 'center', 'normal', 6);
    }

    drawResult() {
      const ctx = this.ctx;
      const r = this.battle.result;
      ctx.fillStyle = 'rgba(5,8,15,0.7)';
      ctx.fillRect(0, 0, W, H);

      const pw = 820;
      const ph = 640;
      const px = (W - pw) / 2;
      const py = (H - ph) / 2;
      rr(ctx, px, py, pw, ph, 28);
      ctx.fillStyle = '#1d2333';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = r.victory ? '#FFD23F' : '#ff5a5a';
      ctx.stroke();

      text(ctx, r.victory ? '승리!' : '패배…', W / 2, py + 80, 84, r.victory ? '#FFD23F' : '#ff6b6b', 'center', 'bold', 10);
      for (let i = 0; i < 3; i++) star(ctx, W / 2 + (i - 1) * 130, py + 200, 52, i < r.stars);

      const lines = [
        ['클리어', r.victory],
        ['아군 사망 없음', r.victory && r.deaths === 0],
        [`${C.STAR3_TIME}초 내 클리어`, r.victory && r.time <= C.STAR3_TIME]
      ];
      lines.forEach(([label, ok], i) => {
        text(ctx, (ok ? '★ ' : '☆ ') + label, px + 90, py + 300 + i * 44, 28, ok ? '#FFD23F' : '#6b7390', 'left');
      });
      text(ctx, `시간 ${fmtTime(r.time)}`, px + pw - 90, py + 300, 28, '#ffffff', 'right');
      text(ctx, `사망 ${r.deaths}`, px + pw - 90, py + 344, 28, '#ffffff', 'right');
      if (r.rewards) {
        text(ctx, `골드 +${r.rewards.gold}   EXP +${r.rewards.exp}`, W / 2, py + 470, 34, '#9fe7a8');
      }

      const btn = Layout.resultBtn;
      rr(ctx, btn.x, btn.y, btn.w, btn.h, 20);
      ctx.fillStyle = '#4f7be8';
      ctx.fill();
      text(ctx, '다시 하기', btn.x + btn.w / 2, btn.y + btn.h / 2 + 2, 38, '#ffffff');
    }
  }

  G.Renderer = Renderer;
})(window.Game = window.Game || {});
