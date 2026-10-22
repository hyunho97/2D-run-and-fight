// 전투 화면 (Phaser 3). 전투 로직(BattleManager)은 그대로 두고 상태를 읽어서 그린다.
// 논리 해상도 1920x1080 (9.1 레이아웃), 캐릭터는 PixelArt 도트 텍스처.
(function (G) {
  'use strict';

  const C = G.Config;
  const PA = G.PixelArt;
  const W = 1920;
  const H = 1080;
  const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  const CELL = 150;
  const GAP = 12;
  const STRIDE = CELL + GAP;
  const BAR_X = (W - (C.BLOCK_SLOTS * CELL + (C.BLOCK_SLOTS - 1) * GAP)) / 2;
  const HERO_SCALE = 6;
  const GROUND_Y = 650;

  const Layout = {
    W, H, GROUND_Y,
    PANEL_Y: 730,
    BAR_Y: 762,
    PARTY_Y: 948,
    pauseBtn: { x: 24, y: 18, w: 72, h: 64 },
    speedBtn: { x: 1600, y: 18, w: 130, h: 64 },
    autoBtn: { x: 1746, y: 18, w: 150, h: 64 },

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

  // 챕터 테마별 배경
  const THEMES = {
    forest: { sky: ['#6ec3e8', '#d4f1fb'], far: '#93c4a0', prop: 'tree', ground: '#7a5a3a', groundTop: '#6aa84f' },
    desert: { sky: ['#f2a65a', '#fde8c0'], far: '#e0b878', prop: 'cactus', ground: '#c9965a', groundTop: '#e6c27f' }
  };

  const num = hex => parseInt(hex.slice(1), 16);
  const shadeNum = (hex, amt) => num(PA.shade(hex, amt));
  const fmtTime = t => {
    const s = Math.floor(t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  function hash(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  class BattleScene extends Phaser.Scene {
    constructor(view) {
      super({ key: 'battle' });
      this.view = view;
    }

    create() {
      this.t = 0;
      this.textPool = new Map();
      this.textUsed = new Set();
      this.imagePool = new Map();
      this.imageUsed = new Set();
      this.emitters = new Map();
      this.views = new Map();
      this.makeTexture('px', 4, 4, ctx => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4, 4); }, true);

      // 배경 (화면 고정 + 패럴랙스 타일)
      this.sky = this.add.image(0, 0, this.skyTex('forest')).setOrigin(0).setScrollFactor(0).setDepth(0);
      this.far = this.add.tileSprite(0, GROUND_Y - 280, W, 280, this.farTex('forest')).setOrigin(0).setScrollFactor(0).setDepth(1);
      this.props = this.add.tileSprite(0, GROUND_Y - 360, W, 360, this.propsTex('forest')).setOrigin(0).setScrollFactor(0).setDepth(2);
      this.ground = this.add.tileSprite(0, GROUND_Y - 16, W, Layout.PANEL_Y - GROUND_Y + 16, this.groundTex('forest'))
        .setOrigin(0).setScrollFactor(0).setDepth(3);
      this.redOverlay = this.add.rectangle(0, 0, W, Layout.PANEL_Y, 0xff2020, 0).setOrigin(0).setScrollFactor(0).setDepth(4);

      this.shadowG = this.add.graphics().setDepth(50);
      this.barsG = this.add.graphics().setDepth(650);
      this.hudG = this.add.graphics().setScrollFactor(0).setDepth(1000);
      this.hudG2 = this.add.graphics().setScrollFactor(0).setDepth(1120);
      this.overlayG = this.add.graphics().setScrollFactor(0).setDepth(1250);

      this.view.onSceneReady(this);
    }

    update(time, delta) {
      const real = Math.min(0.1, delta / 1000);
      const frame = this.view.tick(real);
      if (!frame || !this.battle) return;
      this.t += real;
      this.consume(frame.events);
      this.renderFrame(frame.dt, real, frame.ui);
    }

    // ---- 텍스처 생성 ----
    makeTexture(key, w, h, draw, pixel) {
      if (this.textures.exists(key)) return key;
      const tex = this.textures.createCanvas(key, w, h);
      draw(tex.getContext(), tex);
      tex.refresh();
      if (pixel) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      return key;
    }

    humanoidTex(head, pal) {
      const key = `hum_${head}_${pal.c}_${pal.s}_${pal.h}`;
      return this.makeTexture(key, 32, 19, (ctx, tex) => {
        PA.paint(ctx, PA.humanoidRows(head, 'stand'), pal, 0, 0);
        PA.paint(ctx, PA.humanoidRows(head, 'step'), pal, 16, 0);
        tex.add('stand', 0, 0, 0, 16, 19);
        tex.add('step', 0, 16, 0, 16, 19);
      }, true);
    }

    rowsTex(prefix, rows, pal) {
      const key = `${prefix}_${pal.c}_${pal.s}`;
      return this.makeTexture(key, rows[0].length, rows.length, ctx => PA.paint(ctx, rows, pal, 0, 0), true);
    }

    headTex(charData) {
      const art = PA.heroArt(charData);
      const pal = PA.heroPalette(charData);
      const rows = PA.HEADS[art.head].concat(PA.humanoidRows(art.head, 'stand').slice(9, 13));
      return this.rowsTex('head_' + art.head, rows, pal);
    }

    skyTex(theme) {
      const t = THEMES[theme];
      return this.makeTexture('sky_' + theme, 4, GROUND_Y, ctx => {
        const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        g.addColorStop(0, t.sky[0]);
        g.addColorStop(1, t.sky[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, GROUND_Y);
      });
    }

    // 2048px 주기로 이어지는 원경 언덕
    farTex(theme) {
      return this.makeTexture('far_' + theme, 2048, 280, ctx => {
        ctx.fillStyle = THEMES[theme].far;
        ctx.beginPath();
        ctx.moveTo(0, 280);
        for (let x = 0; x <= 2048; x += 8) {
          const a = x / 2048 * Math.PI * 2;
          ctx.lineTo(x, 110 - Math.sin(a * 3) * 55 - Math.sin(a * 7 + 1) * 22);
        }
        ctx.lineTo(2048, 280);
        ctx.fill();
      });
    }

    propsTex(theme) {
      return this.makeTexture('props_' + theme, 2048, 360, ctx => {
        const base = 340;
        for (let k = 0; k < 9; k++) {
          const x = 110 + k * 227 + hash(k) * 60;
          const s = 0.7 + hash(k + 99) * 0.6;
          if (THEMES[theme].prop === 'cactus') {
            if (k % 2) continue;
            ctx.fillStyle = '#5f9a4a';
            const r = (cx, cy, w, h) => { ctx.beginPath(); ctx.roundRect(cx, cy, w, h, Math.min(w, h) / 2); ctx.fill(); };
            r(x - 14 * s, base - 150 * s, 28 * s, 150 * s);
            r(x - 50 * s, base - 110 * s, 18 * s, 55 * s);
            ctx.fillRect(x - 50 * s, base - 64 * s, 40 * s, 14 * s);
            r(x + 32 * s, base - 130 * s, 18 * s, 60 * s);
            ctx.fillRect(x + 10 * s, base - 84 * s, 40 * s, 14 * s);
          } else {
            ctx.fillStyle = '#6b4a2e';
            ctx.fillRect(x - 10 * s, base - 100 * s, 20 * s, 100 * s);
            ctx.fillStyle = k % 2 ? '#3f8a4a' : '#4c9a50';
            ctx.beginPath();
            ctx.arc(x, base - 140 * s, 70 * s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    groundTex(theme) {
      const t = THEMES[theme];
      const h = Layout.PANEL_Y - GROUND_Y + 16;
      return this.makeTexture('ground_' + theme, 240, h, ctx => {
        ctx.fillStyle = t.ground;
        ctx.fillRect(0, 0, 240, h);
        ctx.fillStyle = t.groundTop;
        ctx.fillRect(0, 0, 240, 22);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(30, 46, 60, 10);
        ctx.fillRect(150, 46, 60, 10);
      });
    }

    // ---- 전투 시작/종료 ----
    setBattle(battle) {
      this.clearBattle();
      this.battle = battle;
      const theme = THEMES[battle.stage.theme] ? battle.stage.theme : 'forest';
      this.sky.setTexture(this.skyTex(theme)).setDisplaySize(W, GROUND_Y);
      this.far.setTexture(this.farTex(theme));
      this.props.setTexture(this.propsTex(theme));
      this.ground.setTexture(this.groundTex(theme));
      this.camX = battle.frontHero().x - 700;
      this.cameras.main.setScroll(this.camX, 0);
    }

    clearBattle() {
      for (const v of this.views.values()) v.root.destroy();
      this.views.clear();
      this.tweens.killAll();
      this.children.list.filter(o => o.getData && o.getData('fx')).forEach(o => o.destroy());
      this.battle = null;
    }

    // ---- 유닛 ----
    unitView(u) {
      let v = this.views.get(u.uid);
      if (v) return v;
      const isHero = u.side === 'hero';
      const art = isHero ? PA.heroArt(u.data) : PA.enemyArt(u.data);
      const pal = isHero ? PA.heroPalette(u.data) : PA.enemyPalette(u.data);
      const root = this.add.container(u.x, GROUND_Y).setDepth(isHero ? 103 - u.slot : 110);
      let scale;
      let rowsW;
      let rowsH;
      let body;
      let weapon = null;

      if (art.kind === 'humanoid') {
        rowsW = 16;
        rowsH = 19;
        scale = isHero ? HERO_SCALE : Math.max(3, Math.round(u.data.size * 1.25 / 19));
        body = this.add.image(0, 0, this.humanoidTex(art.head, pal), 'stand').setOrigin(0.5, 1).setScale(scale);
        root.add(body);
        if (art.weapon) {
          const w = PA.weapon(art.weapon);
          weapon = this.add.image((PA.HAND.x - 8) * scale, (PA.HAND.y - 19) * scale, this.rowsTex('wpn_' + art.weapon, w.rows, pal))
            .setOrigin((w.grip[0] + 0.5) / w.rows[0].length, (w.grip[1] + 0.5) / w.rows.length)
            .setScale(scale).setAngle(art.idleAngle || 0);
          root.add(weapon);
        }
        if (art.shield) {
          root.add(this.add.image(3 * scale, -7 * scale, this.rowsTex('shield', PA.shieldRows(), pal)).setScale(scale));
        }
      } else {
        const rows = PA.creatureRows(art.kind);
        rowsW = rows[0].length;
        rowsH = rows.length;
        scale = Math.max(3, Math.round(u.data.size * 1.3 / rowsW));
        body = this.add.image(0, 0, this.rowsTex('cre_' + art.kind, rows, pal)).setOrigin(0.5, 1).setScale(scale);
        root.add(body);
      }
      if (art.crown) {
        const crownY = art.kind === 'humanoid' ? -rowsH * scale + scale : -rowsH * scale - 2 * scale;
        root.add(this.add.image(0, crownY, this.rowsTex('crown', PA.crownRows(), pal)).setScale(scale).setOrigin(0.5, 1));
      }
      if (!isHero) root.setScale(-1, 1);

      v = {
        unit: u, root, body, weapon, art, scale, isHero,
        w: rowsW * scale, h: rowsH * scale,
        baseAngle: art.idleAngle || 0,
        lunge: 0, flash: 0, walkT: 0, lastX: u.x, phase: Math.random() * 6, dead: false
      };
      this.views.set(u.uid, v);
      return v;
    }

    syncUnits(dt, real) {
      const b = this.battle;
      const live = new Set();
      for (const u of b.heroes.concat(b.enemies)) {
        live.add(u.uid);
        const v = this.unitView(u);
        if (!u.alive) {
          if (!v.dead) this.killView(v);
          continue;
        }
        const dir = v.isHero ? 1 : -1;
        const speed = real > 0 ? Math.abs(u.x - v.lastX) / real : 0;
        const moving = speed > 30;
        v.lastX = u.x;
        if (moving) v.walkT += real;
        const step = Math.sin(v.walkT * 12);
        const bob = moving ? -Math.abs(step) * 1.5 * v.scale : 0;
        v.root.setPosition(u.x + v.lunge * dir, GROUND_Y + bob);
        if (v.art.kind === 'humanoid') v.body.setFrame(moving && step > 0 ? 'step' : 'stand');
        const breathe = moving ? 1 : 1 + 0.03 * Math.sin(this.t * 3 + v.phase);
        v.body.setScale(v.scale, v.scale * breathe);

        v.flash = Math.max(0, v.flash - real);
        const parts = v.root.list;
        if (v.flash > 0) parts.forEach(p => p.setTintFill && p.setTintFill(0xffffff));
        else if (u.berserk) {
          const k = Math.floor(160 + 60 * Math.sin(this.t * 10));
          parts.forEach(p => p.setTint && p.setTint((255 << 16) | (k << 8) | k));
        } else parts.forEach(p => p.clearTint && p.clearTint());
      }
      // 지나간 웨이브의 적 정리
      for (const [uid, v] of this.views) {
        if (!live.has(uid) && !v.dead) this.killView(v);
        if (!live.has(uid) && v.gone) this.views.delete(uid);
      }
    }

    killView(v) {
      v.dead = true;
      this.spark(v.unit.x, GROUND_Y - v.h * 0.5, 22, v.unit.color);
      if (v.isHero) {
        this.tweens.add({ targets: v.root, angle: -80, alpha: 0.35, y: GROUND_Y - 10, duration: 400, ease: 'Quad.easeIn' });
      } else {
        this.tweens.add({
          targets: v.root, alpha: 0, y: GROUND_Y + 20, duration: 350,
          onComplete: () => { v.root.destroy(); v.gone = true; }
        });
      }
    }

    attackAnim(v, target, strong) {
      if (!v || v.dead) return;
      const art = v.art;
      this.tweens.killTweensOf(v);
      v.lunge = 0;
      this.tweens.add({ targets: v, lunge: art.projectile ? 6 : (strong ? 30 : 18), duration: 70, yoyo: true });
      if (v.weapon) {
        this.tweens.killTweensOf(v.weapon);
        v.weapon.setAngle(v.baseAngle);
        const swing = art.weapon === 'bow' ? 0 : art.projectile || art.weapon === 'holyStaff' ? -35 : 110;
        this.tweens.add({ targets: v.weapon, angle: v.baseAngle + swing, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
      }
      if (art.projectile && target) this.shoot(v, target, art.projectile);
    }

    shoot(v, target, kind, onHit) {
      const tv = this.views.get(target.uid);
      const dir = v.isHero ? 1 : -1;
      const sx = v.unit.x + dir * v.w * 0.4;
      const sy = GROUND_Y - v.h * 0.55;
      const tx = target.x;
      const ty = GROUND_Y - (tv ? tv.h * 0.5 : 60);
      const img = this.add.image(sx, sy, this.rowsTex('proj_' + kind, PA.projectileRows(kind), PA.palette({})))
        .setScale(5).setDepth(520).setData('fx', true);
      img.setRotation(Math.atan2(ty - sy, tx - sx));
      this.tweens.add({
        targets: img, x: tx, y: ty, duration: 180,
        onComplete: () => { img.destroy(); if (onHit) onHit(); }
      });
    }

    // ---- 이벤트 → 연출 ----
    consume(events) {
      for (const e of events) this.onEvent(e);
    }

    midY(u) {
      const v = this.views.get(u.uid);
      return GROUND_Y - (v ? v.h * 0.55 : 60);
    }

    onEvent(e) {
      switch (e.type) {
        case 'attack':
          this.attackAnim(this.views.get(e.attacker.uid), e.target, false);
          break;
        case 'damage': {
          const tv = this.views.get(e.target.uid);
          if (tv) tv.flash = 0.06;
          const color = e.target.side === 'hero' ? '#ff7070' : e.crit ? '#FFD23F' : '#ffffff';
          const size = e.crit ? 56 : e.chain ? 38 + e.chain * 6 : 34;
          this.floatText(e.target, (e.crit ? '치명! ' : '') + e.amount, color, size);
          this.spark(e.target.x, this.midY(e.target), e.crit || e.chain === 3 ? 16 : 6, e.chain ? '#FFD23F' : '#ffffff');
          break;
        }
        case 'miss':
          this.floatText(e.target, 'MISS', '#9fb3c8', 32);
          break;
        case 'heal':
          this.floatText(e.target, '+' + e.amount, '#6EE77A', 42);
          this.spark(e.target.x, this.midY(e.target), 12, '#6EE77A', -300);
          break;
        case 'skill':
          this.skillFx(e);
          break;
        case 'cast':
          this.floatText(e.caster, e.name + '!', '#ff9f43', 40, 70);
          break;
        case 'bossSkill':
          this.cameras.main.shake(350, 0.012);
          this.attackAnim(this.views.get(e.caster.uid), null, true);
          for (const t of e.targets) this.burst(t.x, this.midY(t), 130, '#ff4040', 10, 400);
          break;
        case 'interrupt':
          this.floatText(e.caster, '시전 차단!', '#7fd3ff', 44, 70);
          break;
        case 'wave':
          this.banner(e.isBoss ? 'BOSS' : `WAVE ${e.index + 1}`, e.isBoss ? '#ff5050' : '#ffffff');
          break;
        case 'berserkWarning':
          this.banner('광폭화 임박!', '#ff6b6b');
          break;
        case 'berserk':
          this.cameras.main.shake(500, 0.015);
          this.cameras.main.flash(300, 255, 40, 40);
          this.banner('광폭화!', '#ff3030', '적 공격 속도·피해 2배 / CC 면역');
          break;
        case 'phase':
          this.banner('보스 분노!', '#ff9f43', '공격 속도 증가');
          break;
      }
    }

    skillFx(e) {
      const cv = this.views.get(e.caster.uid);
      const color = e.caster.color;
      this.attackAnim(cv, null, e.chain === 3);
      const proj = cv && cv.art.projectile;
      for (const t of e.targets) {
        const hit = () => {
          if (e.skill.kind === 'heal') {
            this.burst(t.x, this.midY(t), 60 + e.chain * 40, '#6EE77A', 6, 450);
          } else {
            this.burst(t.x, this.midY(t), 50 + e.chain * 55, color, 4 + e.chain * 4, 300 + e.chain * 100);
            this.spark(t.x, this.midY(t), 6 * e.chain, color);
          }
        };
        if (proj && e.skill.kind !== 'heal') this.shoot(cv, t, proj, hit);
        else hit();
      }
      if (e.chain === 3) {
        this.cameras.main.shake(300, 0.01);
        this.cutin(e.caster, e.skill.name);
      }
    }

    floatText(unit, str, color, size, extraY) {
      const t = this.add.text(unit.x + (Math.random() - 0.5) * 40, this.midY(unit) - 60 - (extraY || 0), str, {
        fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: Math.round(size / 6)
      }).setOrigin(0.5).setDepth(700).setData('fx', true);
      this.tweens.add({ targets: t, y: t.y - 80, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
    }

    spark(x, y, n, color, gravity) {
      const key = color + (gravity || 900);
      let em = this.emitters.get(key);
      if (!em) {
        em = this.add.particles(0, 0, 'px', {
          lifespan: { min: 300, max: 700 }, speed: { min: 150, max: 450 }, angle: { min: 0, max: 360 },
          gravityY: gravity || 900, scale: { start: 2.2, end: 0 }, tint: num(color), emitting: false
        }).setDepth(560);
        this.emitters.set(key, em);
      }
      em.explode(n, x, y);
    }

    burst(x, y, r, color, width, ms) {
      const c = this.add.circle(x, y, r, num(color), 0.22).setStrokeStyle(width, num(color), 1)
        .setDepth(540).setScale(0.3).setData('fx', true);
      this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
    }

    banner(str, color, sub) {
      const t = this.add.text(W / 2, 300, str, {
        fontFamily: FONT, fontSize: '96px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 14
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setScale(1.5).setData('fx', true);
      const parts = [t];
      if (sub) {
        parts.push(this.add.text(W / 2, 385, sub, {
          fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 7
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1200).setData('fx', true));
      }
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: parts, alpha: 0, delay: 1300, duration: 400, onComplete: () => parts.forEach(p => p.destroy()) });
    }

    // 3체인 컷인
    cutin(caster, skillName) {
      const color = num(caster.color);
      const box = this.add.container(-W, 0).setScrollFactor(0).setDepth(1190).setData('fx', true);
      const band = this.add.graphics();
      band.fillStyle(color, 0.88);
      band.fillPoints([{ x: 0, y: 330 }, { x: W, y: 300 }, { x: W, y: 430 }, { x: 0, y: 460 }], true);
      band.fillStyle(0x000000, 0.25);
      band.fillRect(0, 452, W, 6);
      const face = this.add.image(380, 395, this.headTex(caster.data)).setScale(9);
      const name = this.add.text(W / 2 + 80, 385, `${caster.name} — ${skillName}`, {
        fontFamily: FONT, fontSize: '62px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 10
      }).setOrigin(0.5);
      const tag = this.add.text(W / 2 + 560, 330, '3 CHAIN!', {
        fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#FFD23F', stroke: '#000000', strokeThickness: 8
      }).setOrigin(0.5);
      box.add([band, face, name, tag]);
      this.tweens.add({ targets: box, x: 0, duration: 150, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: box, alpha: 0, delay: 850, duration: 250, onComplete: () => box.destroy() });
    }

    // ---- 프레임 렌더 ----
    renderFrame(dt, real, ui) {
      const b = this.battle;
      this.camX += (b.frontHero().x - 700 - this.camX) * Math.min(1, real * 4);
      this.cameras.main.setScroll(this.camX, 0);
      this.far.tilePositionX = this.camX * 0.15;
      this.props.tilePositionX = this.camX * 0.45;
      this.ground.tilePositionX = this.camX;
      this.redOverlay.setFillStyle(0xff2020, b.berserk ? 0.22 : 0);

      this.syncUnits(dt, real);

      b.blocks.slots.forEach((blk, i) => {
        if (blk.vx == null) blk.vx = C.BLOCK_SLOTS;
        blk.vx += (i - blk.vx) * Math.min(1, real * 16);
      });

      this.drawWorldOverlay();
      this.hudG.clear();
      this.hudG2.clear();
      this.overlayG.clear();
      this.drawBerserkFrame();
      this.drawHud(ui);
      this.drawBossBar();
      this.drawPanel(ui);
      this.drawParty();
      this.drawTooltip(ui);
      this.drawHint(ui);
      this.endPools();
    }

    // 그림자·HP바·시전바 (월드 좌표)
    drawWorldOverlay() {
      const b = this.battle;
      const sg = this.shadowG;
      const bg = this.barsG;
      sg.clear();
      bg.clear();
      for (const u of b.heroes.concat(b.enemies)) {
        const v = this.views.get(u.uid);
        if (!v || (!u.alive && !v.isHero)) continue;
        sg.fillStyle(0x000000, 0.25);
        sg.fillEllipse(u.x, GROUND_Y + 4, v.w * 0.75, 22);
        if (u.berserk && u.alive) {
          sg.fillStyle(0xff2020, 0.18 + 0.1 * Math.sin(this.t * 10));
          sg.fillEllipse(u.x, GROUND_Y - v.h * 0.5, v.w * 1.3, v.h * 1.25);
        }
        if (!u.alive) continue;
        const top = GROUND_Y - v.h - 18;
        if (!u.isBoss) {
          const bw = Math.max(80, v.w * 0.9);
          this.bar(bg, u.x - bw / 2, top, bw, 10, u.hpRatio, u.side === 'hero' ? (u.hpRatio > 0.3 ? 0x5be36b : 0xff5a5a) : 0xff5a5a);
        }
        if (u.isLeader) this.txt('crown' + u.uid, u.x, top - 26, '♛', 30, '#FFD23F', { world: true });
        if (G.StatusEffectSystem.isDisabled(u)) this.txt('cc' + u.uid, u.x, top - 30, '💫', 30, '#ffffff', { world: true });
        if (u.cast) {
          const cw = 240;
          const cy = top - 40;
          this.bar(bg, u.x - cw / 2, cy, cw, 14, 1 - u.cast.remaining / u.cast.total, 0xff9f43);
          this.txt('cast' + u.uid, u.x, cy - 24, u.cast.name, 28, '#ffd9a8', { world: true });
        }
      }
    }

    bar(g, x, y, w, h, ratio, color) {
      g.fillStyle(0x000000, 0.65);
      g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, (h + 4) / 2);
      if (ratio > 0) {
        g.fillStyle(color, 1);
        g.fillRoundedRect(x, y, Math.max(h, w * ratio), h, h / 2);
      }
    }

    // ---- 텍스트/이미지 풀 (매 프레임 재사용) ----
    txt(key, x, y, str, size, color, o) {
      o = o || {};
      let t = this.textPool.get(key);
      if (!t) {
        t = this.add.text(0, 0, '', { fontFamily: FONT, fontStyle: 'bold', stroke: '#000000' });
        this.textPool.set(key, t);
      }
      if (t.text !== str) t.setText(str);
      if (t._size !== size) { t.setFontSize(size); t.setStroke('#000000', o.stroke != null ? o.stroke : Math.max(3, Math.round(size / 6))); t._size = size; }
      if (t._color !== color) { t.setColor(color); t._color = color; }
      t.setOrigin(o.align === 'left' ? 0 : o.align === 'right' ? 1 : 0.5, 0.5)
        .setPosition(x, y).setScrollFactor(o.world ? 1 : 0).setDepth(o.depth || (o.world ? 660 : 1140))
        .setAlpha(o.alpha != null ? o.alpha : 1).setVisible(true);
      this.textUsed.add(key);
      return t;
    }

    img(key, texture, x, y, scale, depth, alpha) {
      let im = this.imagePool.get(key);
      if (!im) {
        im = this.add.image(0, 0, texture).setScrollFactor(0);
        this.imagePool.set(key, im);
      }
      if (im.texture.key !== texture) im.setTexture(texture);
      im.setPosition(x, y).setScale(scale).setDepth(depth || 1110).setAlpha(alpha != null ? alpha : 1).setVisible(true);
      this.imageUsed.add(key);
      return im;
    }

    endPools() {
      for (const [k, t] of this.textPool) if (!this.textUsed.has(k)) t.setVisible(false);
      for (const [k, im] of this.imagePool) if (!this.imageUsed.has(k)) im.setVisible(false);
      this.textUsed.clear();
      this.imageUsed.clear();
    }

    // ---- HUD ----
    button(r, label, active) {
      const g = this.hudG;
      g.fillStyle(active ? 0x50c878 : 0x0a0e18, active ? 0.85 : 0.6);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 14);
      g.lineStyle(3, 0xffffff, 0.5);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
      if (label) this.txt('btn' + r.x, r.x + r.w / 2, r.y + r.h / 2 + 1, label, 30, '#ffffff');
    }

    drawHud(ui) {
      const b = this.battle;
      const pb = Layout.pauseBtn;
      this.button(pb, '', false);
      this.hudG.fillStyle(0xffffff, 1);
      this.hudG.fillRect(pb.x + 24, pb.y + 18, 8, 28);
      this.hudG.fillRect(pb.x + 40, pb.y + 18, 8, 28);

      const normal = b.stage.waves.filter(w => !w.isBoss).length;
      this.txt('stage', W / 2, 30, b.stage.name, 24, '#ffffff');
      this.txt('wave', W / 2, 68, b.currentWave.isBoss ? '보스' : `웨이브 ${b.waveIndex + 1}/${normal}`, 38, '#ffffff');
      const danger = b.berserkWarning || b.berserk;
      this.txt('timer', 1470, 50, '⏱ ' + fmtTime(b.time), 38, danger ? '#ff6b6b' : '#ffffff');
      this.button(Layout.speedBtn, 'x' + ui.speed, ui.speed > 1);
      this.button(Layout.autoBtn, 'AUTO', b.auto);
    }

    drawBossBar() {
      const b = this.battle;
      const boss = b.enemies.find(e => e.isBoss && e.alive);
      if (!boss || b.state === 'Moving') return;
      const w = 900;
      this.txt('bossName', W / 2, 118, `${boss.name}${boss.phase > 1 ? ' (분노)' : ''}`, 28, '#ffd0d0');
      this.bar(this.hudG, (W - w) / 2, 140, w, 22, boss.hpRatio, boss.berserk ? 0xff2a2a : 0xc0392b);
    }

    drawBerserkFrame() {
      const b = this.battle;
      const g = this.hudG;
      if (b.berserkWarning) {
        g.lineStyle(36, 0xff1e1e, 0.35 + 0.3 * Math.sin(this.t * 9));
        g.strokeRect(18, 18, W - 36, Layout.PANEL_Y - 36);
        this.txt('berserkCount', W / 2, 200, `⚠ 광폭화까지 ${Math.ceil(b.berserkCountdown)}초`, 44, '#ffdddd');
      } else if (b.berserk) {
        g.lineStyle(24, 0xff1e1e, 0.25);
        g.strokeRect(12, 12, W - 24, Layout.PANEL_Y - 24);
      }
    }

    drawPanel(ui) {
      const b = this.battle;
      const g = this.hudG;
      const py = Layout.PANEL_Y;
      g.fillStyle(0x1b2131, 1);
      g.fillRect(0, py, W, H - py);
      g.fillStyle(0x3b4560, 1);
      g.fillRect(0, py, W, 4);

      for (let i = 0; i < C.BLOCK_SLOTS; i++) {
        g.fillStyle(0x141a27, 1);
        g.fillRoundedRect(Layout.cellX(i), Layout.BAR_Y, CELL, CELL, 20);
        g.lineStyle(3, 0x2e364c, 1);
        g.strokeRoundedRect(Layout.cellX(i), Layout.BAR_Y, CELL, CELL, 20);
      }

      const slots = b.blocks.slots;
      const ownerOf = uid => b.heroes.find(h => h.uid === uid);
      const groups = b.blocks.groups();

      for (const grp of groups) {
        if (grp.length < 2) continue;
        const color = ownerOf(grp.owner).color;
        const x0 = Layout.cellX(slots[grp.start].vx) - 7;
        const x1 = Layout.cellX(slots[grp.start + grp.length - 1].vx) + CELL + 7;
        if (grp.length === 3) {
          g.fillStyle(num(color), 0.25 + 0.15 * Math.sin(this.t * 8));
          g.fillRoundedRect(x0 - 8, Layout.BAR_Y - 15, x1 - x0 + 16, CELL + 30, 30);
        }
        g.fillStyle(num(color), 0.3);
        g.fillRoundedRect(x0, Layout.BAR_Y - 7, x1 - x0, CELL + 14, 26);
        g.lineStyle(grp.length === 3 ? 7 : 4, shadeNum(color, 0.35), 1);
        g.strokeRoundedRect(x0, Layout.BAR_Y - 7, x1 - x0, CELL + 14, 26);
      }

      slots.forEach((blk, i) => {
        const owner = ownerOf(blk.owner);
        const x = Layout.cellX(blk.vx);
        const y = Layout.BAR_Y;
        g.fillStyle(shadeNum(owner.color, -0.15), 1);
        g.fillRoundedRect(x + 8, y + 8, CELL - 16, CELL - 16, 18);
        g.fillStyle(shadeNum(owner.color, 0.25), 1);
        g.fillRoundedRect(x + 8, y + 8, CELL - 16, (CELL - 16) / 2, { tl: 18, tr: 18, bl: 0, br: 0 });
        g.lineStyle(4, shadeNum(owner.color, -0.55), 1);
        g.strokeRoundedRect(x + 8, y + 8, CELL - 16, CELL - 16, 18);
        this.img('blk' + i, this.headTex(owner.data), x + CELL / 2, y + CELL / 2 + 4, 6.5, 1110);
      });

      for (const grp of groups) {
        if (grp.length < 2) continue;
        const last = slots[grp.start + grp.length - 1];
        const cx = Layout.cellX(last.vx) + CELL - 10;
        const cy = Layout.BAR_Y + 4;
        this.hudG2.fillStyle(grp.length === 3 ? 0xffd23f : 0xffffff, 1);
        this.hudG2.fillCircle(cx, cy, 24);
        this.hudG2.lineStyle(4, 0x1a1f2e, 1);
        this.hudG2.strokeCircle(cx, cy, 24);
        this.txt('badge' + grp.start, cx, cy + 1, String(grp.length), 28, '#1a1f2e', { stroke: 0, depth: 1130 });
      }

      const pw = C.BLOCK_SLOTS * STRIDE - GAP;
      const prog = b.isCombat && !b.blocks.isFull ? b.blocks.spawnTimer / C.BLOCK_SPAWN_INTERVAL : 0;
      g.fillStyle(0x141a27, 1);
      g.fillRect(BAR_X, Layout.BAR_Y + CELL + 10, pw, 6);
      g.fillStyle(0x7fd3ff, 1);
      g.fillRect(BAR_X, Layout.BAR_Y + CELL + 10, pw * prog, 6);

      if (!b.isCombat && !b.isOver) {
        this.hudG2.fillStyle(0x0a0c14, 0.55);
        this.hudG2.fillRoundedRect(BAR_X - 10, Layout.BAR_Y - 10, pw + 20, CELL + 20, 24);
        this.hudG2.fillStyle(0x121622, 0.92);
        this.hudG2.fillRoundedRect(W / 2 - 170, Layout.BAR_Y + CELL / 2 - 36, 340, 72, 36);
        this.txt('barState', W / 2, Layout.BAR_Y + CELL / 2, b.state === 'Moving' ? '전진 중…' : '웨이브 클리어!', 36, '#c8d0e0', { depth: 1130 });
      }
    }

    drawParty() {
      const g = this.hudG;
      const cw = 460;
      const gap = 30;
      const x0 = (W - (cw * 3 + gap * 2)) / 2;
      const y = Layout.PARTY_Y;
      this.battle.heroes.forEach((h, i) => {
        const x = x0 + i * (cw + gap);
        const a = h.alive ? 1 : 0.45;
        g.fillStyle(0x262e44, a);
        g.fillRoundedRect(x, y, cw, 112, 16);
        g.fillStyle(num(h.color), a);
        g.fillRoundedRect(x + 14, y + 14, 84, 84, 14);
        this.img('party' + i, this.headTex(h.data), x + 56, y + 52, 5, 1110, a);
        this.txt('pgrade' + i, x + 56, y + 88, '★' + h.grade, 18, '#FFD23F', { alpha: a });
        this.txt('pname' + i, x + 116, y + 32, (h.isLeader ? '♛ ' : '') + h.name, 24, h.isLeader ? '#FFD23F' : '#ffffff', { align: 'left', alpha: a });
        this.txt('plv' + i, x + cw - 18, y + 32, 'Lv.' + h.level, 20, '#c8d0e0', { align: 'right', alpha: a });
        this.bar(g, x + 116, y + 62, cw - 136, 22, h.hpRatio, h.hpRatio > 0.3 ? 0x5be36b : 0xff5a5a);
        this.txt('php' + i, x + 116 + (cw - 136) / 2, y + 74, h.alive ? `${Math.ceil(h.hp)} / ${h.maxHp}` : '전투 불능', 20, '#ffffff', { alpha: a });
      });
    }

    drawTooltip(ui) {
      const b = this.battle;
      if (ui.holdIndex < 0) return;
      const group = b.blocks.groupAt(ui.holdIndex);
      if (!group) return;
      const owner = b.heroes.find(h => h.uid === group.owner);
      const skill = G.SkillExecutor.skillOf(owner);
      const g = this.overlayG;
      const w = 620;
      const h = 190;
      const x = G.clamp(Layout.cellX(ui.holdIndex) + CELL / 2 - w / 2, 20, W - w - 20);
      const y = Layout.BAR_Y - h - 24;
      g.fillStyle(0x0c101c, 0.95);
      g.fillRoundedRect(x, y, w, h, 18);
      g.lineStyle(4, num(owner.color), 1);
      g.strokeRoundedRect(x, y, w, h, 18);
      const o = { align: 'left', depth: 1260 };
      this.txt('tipTitle', x + 28, y + 36, `${owner.name} · ${skill.name}`, 32, '#ffffff', o);
      const unit = skill.kind === 'heal' ? '아군 회복 ATK ' : '피해 ';
      skill.coef.forEach((c, i) => {
        const active = i + 1 === group.length;
        this.txt('tip' + i, x + 28, y + 84 + i * 36, `${i + 1}체인: ${unit}${Math.round(c * 100)}%`, 28, active ? '#FFD23F' : '#8a93a8', o);
      });
    }

    drawHint(ui) {
      const h = ui.hint;
      if (!h) return;
      const slots = this.battle.blocks.slots;
      const first = slots[h.group.start];
      const last = slots[h.group.start + h.group.length - 1];
      if (!first || !last) return;
      const g = this.overlayG;
      const by = Layout.BAR_Y;
      const x0 = Layout.cellX(first.vx) - 12;
      const x1 = Layout.cellX(last.vx) + CELL + 12;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
      g.lineStyle(7, 0xffd23f, 0.55 + 0.45 * pulse);
      g.strokeRoundedRect(x0, by - 12, x1 - x0, CELL + 24, 28);
      const cx = (x0 + x1) / 2;
      const ay = by - 22 - pulse * 10;
      g.fillStyle(0xffd23f, 1);
      g.fillTriangle(cx, ay, cx - 22, ay - 30, cx + 22, ay - 30);
      const t = this.txt('hint', 0, by - 100, h.text, 34, '#ffffff', { depth: 1260 });
      const w = t.width + 64;
      const bx = G.clamp(cx - w / 2, 20, W - w - 20);
      t.setX(bx + w / 2);
      g.fillStyle(0x0c101c, 0.95);
      g.fillRoundedRect(bx, by - 140, w, 78, 22);
      g.lineStyle(4, 0xffd23f, 1);
      g.strokeRoundedRect(bx, by - 140, w, 78, 22);
    }
  }

  // main.js와의 연결부: Phaser 게임 1개를 만들고 전투 때만 깨워서 사용
  class BattleView {
    // hooks.tick(realDt) → { events, dt, ui } | null
    constructor(parent, hooks) {
      this.hooks = hooks;
      this.parent = parent;
      this.scene = null;
      this.pending = null;
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: W,
        height: H,
        backgroundColor: '#0b0e15',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        audio: { noAudio: true },
        banner: false,
        scene: [new BattleScene(this)]
      });
    }

    get canvas() { return this.game.canvas; }

    onSceneReady(scene) {
      this.scene = scene;
      if (this.pending) this.start(this.pending);
      else this.game.loop.sleep();
    }

    tick(real) { return this.hooks.tick(real); }

    start(battle) {
      if (!this.scene) {
        this.pending = battle;
        return;
      }
      this.pending = null;
      this.game.loop.wake();
      this.scene.setBattle(battle);
      this.game.scale.refresh();
    }

    stop() {
      this.pending = null;
      if (!this.scene) return;
      this.scene.clearBattle();
      this.game.loop.sleep();
    }
  }

  G.BattleView = BattleView;
})(window.Game = window.Game || {});
