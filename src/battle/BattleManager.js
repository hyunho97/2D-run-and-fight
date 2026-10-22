// 전투 상태 관리 & 웨이브 진행 (12.4 상태 머신)
// Moving → Fighting → WaveClear → Moving … → BossFight → Victory / Defeat
// DOM에 의존하지 않으므로 Node에서 헤드리스 시뮬레이션 가능.
(function (G) {
  'use strict';

  const SES = () => G.StatusEffectSystem;

  class BattleManager {
    // opts: { stageId, party: [characterId | { charId, grade, level, enhance }] x3, leaderIndex, level, seed, auto }
    constructor(opts) {
      const C = G.Config;
      this.stage = G.Stages[opts.stageId];
      if (!this.stage) throw new Error('Unknown stage: ' + opts.stageId);

      this.rng = G.createRng(opts.seed != null ? opts.seed : Date.now());
      this.time = 0;
      this.state = 'Moving';
      this.stateTimer = 0;
      this.waveIndex = -1;
      this.events = [];
      this.auto = !!opts.auto;
      this.autoTimer = 0;
      this.berserk = false;
      this.berserkWarned = false;
      this.deaths = 0;
      this.result = null;

      const leaderIndex = opts.leaderIndex || 0;
      this.heroes = opts.party.map((entry, i) => {
        const p = typeof entry === 'string' ? { charId: entry } : entry;
        const data = G.Characters[p.charId];
        if (!data) throw new Error('Unknown character: ' + p.charId);
        return new G.Unit(data, {
          side: 'hero', slot: i, isLeader: i === leaderIndex,
          grade: p.grade, level: p.level || opts.level || 1, enhance: p.enhance,
          x: -i * C.FORMATION_GAP, attackDelay: 0.2 + this.rng() * 0.5
        });
      });
      this.enemies = [];
      this.blocks = new G.BlockManager(this.heroes, this.rng);
      this.spawnNextWave();
    }

    // ---- 조회 ----
    get isCombat() { return this.state === 'Fighting' || this.state === 'BossFight'; }
    get isOver() { return this.state === 'Victory' || this.state === 'Defeat'; }
    get currentWave() { return this.stage.waves[this.waveIndex]; }
    get berserkWarning() { return !this.berserk && this.time >= G.Config.BERSERK_TIME - G.Config.BERSERK_WARNING; }
    get berserkCountdown() { return Math.max(0, G.Config.BERSERK_TIME - this.time); }

    aliveHeroes() { return this.heroes.filter(h => h.alive); }
    aliveEnemies() { return this.enemies.filter(e => e.alive); }

    frontHero() {
      const alive = this.aliveHeroes();
      if (!alive.length) return this.heroes[0];
      return alive.reduce((a, b) => (b.x > a.x ? b : a));
    }

    frontEnemy() {
      const alive = this.aliveEnemies();
      if (!alive.length) return null;
      return alive.reduce((a, b) => (b.x < a.x ? b : a));
    }

    emit(type, data) { this.events.push(Object.assign({ type }, data)); }
    drainEvents() { const e = this.events; this.events = []; return e; }

    // ---- 진행 ----
    spawnNextWave() {
      const C = G.Config;
      this.waveIndex++;
      const wave = this.currentWave;
      const front = this.frontHero().x;
      this.enemies = wave.monsters.map((id, i) => {
        const data = G.Enemies[id];
        if (!data) throw new Error('Unknown enemy: ' + id);
        const e = new G.Unit(data, {
          side: 'enemy',
          statMult: this.stage.statMult || 1,
          x: front + C.WAVE_SPAWN_DISTANCE + i * C.ENEMY_GAP,
          attackDelay: 0.3 + this.rng() * 0.6,
          rangeJitter: data.isBoss ? 0 : this.rng() * C.ENEMY_RANGE_JITTER
        });
        if (this.berserk) this.applyBerserk(e);
        return e;
      });
      this.state = 'Moving';
      this.emit('wave', { index: this.waveIndex, isBoss: !!wave.isBoss });
    }

    update(dt) {
      if (this.isOver) return;
      this.time += dt;
      this.updateBerserk();

      switch (this.state) {
        case 'Moving':
          this.updateMoving(dt);
          break;
        case 'Fighting':
        case 'BossFight':
          this.blocks.update(dt);
          this.updateHeroes(dt);
          this.updateEnemies(dt);
          if (this.auto) this.updateAuto(dt);
          break;
        case 'WaveClear':
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) this.spawnNextWave();
          break;
      }

      for (const u of this.heroes.concat(this.enemies)) {
        if (u.alive) SES().update(u, dt, (unit, s) => this.onStatusTick(unit, s));
      }
    }

    updateMoving(dt) {
      const C = G.Config;
      const alive = this.aliveHeroes().sort((a, b) => a.slot - b.slot);
      if (!alive.length) return;

      const lead = alive[0];
      lead.x += C.MOVE_SPEED * dt;
      alive.forEach((h, rank) => {
        if (rank === 0) return;
        const diff = (lead.x - rank * C.FORMATION_GAP) - h.x;
        h.x += Math.sign(diff) * Math.min(Math.abs(diff), C.MOVE_SPEED * 1.6 * dt);
      });

      const front = this.frontHero();
      if (this.enemies.some(e => e.alive && e.x - front.x <= C.ENGAGE_DISTANCE)) {
        this.state = this.currentWave.isBoss ? 'BossFight' : 'Fighting';
        this.emit('encounter', {});
      }
    }

    updateHeroes(dt) {
      for (const h of this.heroes) {
        if (this.isOver) return;
        if (!h.alive || SES().isDisabled(h)) continue;
        const target = this.frontEnemy();
        if (!target) return;
        const dist = target.x - h.x;
        if (dist > h.range) {
          // 앞 열 아군을 넘어가지 않도록 대열 간격 유지
          const ahead = this.heroes.filter(o => o.alive && o.slot < h.slot);
          const limit = ahead.length
            ? Math.min(...ahead.map(o => o.x)) - G.Config.ALLY_MIN_GAP
            : Infinity;
          h.x = Math.max(h.x, Math.min(h.x + Math.min(G.Config.MOVE_SPEED * dt, dist - h.range), limit));
          continue;
        }
        this.tickAttack(h, target, dt);
      }
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (this.isOver) return;
        if (!e.alive) continue;

        if (SES().isDisabled(e)) {
          if (e.cast) {
            e.cast = null;
            this.emit('interrupt', { caster: e });
          }
          continue;
        }

        if (e.cast) {
          e.cast.remaining -= dt;
          if (e.cast.remaining <= 0) {
            e.cast = null;
            this.resolveBossPattern(e);
          }
          continue;
        }

        const target = this.frontHero();
        if (!target.alive) return;
        const dist = e.x - target.x;
        if (dist > e.range) {
          e.x -= Math.min(G.Config.MOVE_SPEED * 0.8 * dt, dist - e.range);
          continue;
        }

        if (e.data.pattern) {
          e.castTimer -= dt;
          if (e.castTimer <= 0) {
            this.startBossPattern(e);
            continue;
          }
        }
        this.tickAttack(e, target, dt);
      }
    }

    tickAttack(u, target, dt) {
      u.attackTimer -= dt;
      if (u.attackTimer > 0) return;
      u.attackTimer = 1 / u.aspd;
      const coef = u.side === 'hero' ? G.Config.BASIC_ATTACK_COEF : G.Config.ENEMY_ATTACK_COEF;
      this.emit('attack', { attacker: u, target });
      this.dealDamage(u, target, coef);
    }

    // ---- 보스 패턴 ----
    startBossPattern(e) {
      const p = e.data.pattern;
      e.cast = { name: p.name, remaining: p.castTime, total: p.castTime };
      e.castTimer = p.interval;
      this.emit('cast', { caster: e, name: p.name });
    }

    resolveBossPattern(e) {
      const p = e.data.pattern;
      const targets = this.aliveHeroes();
      this.emit('bossSkill', { caster: e, name: p.name, targets });
      for (const t of targets) this.dealDamage(e, t, p.coef);
    }

    checkPhase(u) {
      const phases = u.data.phases;
      if (!phases || u.phase > phases.length || !u.alive) return;
      const next = phases[u.phase - 1];
      if (u.hpRatio <= next.hpRatio) {
        u.phase++;
        u.aspdMult = next.aspdMult;
        this.emit('phase', { unit: u, phase: u.phase });
      }
    }

    // ---- 광폭화 (2.3.1) ----
    updateBerserk() {
      if (this.berserk) return;
      if (!this.berserkWarned && this.berserkWarning) {
        this.berserkWarned = true;
        this.emit('berserkWarning', {});
      }
      if (this.time >= G.Config.BERSERK_TIME) {
        this.berserk = true;
        for (const e of this.enemies) if (e.alive) this.applyBerserk(e);
        this.emit('berserk', {});
      }
    }

    applyBerserk(e) {
      e.berserk = true;
      e.ccImmune = true;
      SES().cleanseCC(e);
    }

    // ---- 피해/회복 ----
    dealDamage(attacker, target, coef, meta) {
      if (!target || !target.alive) return null;
      const res = G.DamageCalculator.compute(attacker, target, coef, this.rng);
      if (res.miss) {
        this.emit('miss', { attacker, target });
        return res;
      }
      const amount = SES().absorb(target, res.amount);
      target.hp = Math.max(0, target.hp - amount);
      this.emit('damage', {
        attacker, target, amount, crit: res.crit,
        absorbed: res.amount - amount, chain: (meta && meta.chain) || 0
      });
      if (target.hp <= 0) this.kill(target);
      else this.checkPhase(target);
      return res;
    }

    heal(caster, target, amount) {
      if (!target || !target.alive) return 0;
      const actual = Math.min(amount, target.maxHp - target.hp);
      target.hp += actual;
      this.emit('heal', { caster, target, amount: actual });
      return actual;
    }

    onStatusTick(unit, s) {
      if (s.type === 'Burn') {
        unit.hp = Math.max(0, unit.hp - s.value);
        this.emit('damage', { attacker: null, target: unit, amount: s.value, crit: false, absorbed: 0, chain: 0 });
        if (unit.hp <= 0) this.kill(unit);
      } else if (s.type === 'Regen') {
        this.heal(null, unit, s.value);
      }
    }

    kill(u) {
      if (!u.alive) return;
      u.alive = false;
      u.hp = 0;
      u.statuses = [];
      u.cast = null;
      this.emit('death', { unit: u });

      if (u.side === 'hero') {
        this.deaths++;
        this.blocks.removeOwner(u.uid);
        if (!this.aliveHeroes().length) this.finish(false);
      } else if (!this.aliveEnemies().length) {
        this.onWaveCleared();
      }
    }

    onWaveCleared() {
      if (this.waveIndex >= this.stage.waves.length - 1) {
        this.finish(true);
        return;
      }
      this.state = 'WaveClear';
      this.stateTimer = G.Config.WAVE_CLEAR_DELAY;
      this.emit('waveClear', { index: this.waveIndex });
    }

    finish(victory) {
      this.state = victory ? 'Victory' : 'Defeat';
      // 7.4 스테이지 평가
      const stars = victory
        ? 1 + (this.deaths === 0 ? 1 : 0) + (this.time <= G.Config.STAR3_TIME ? 1 : 0)
        : 0;
      this.result = {
        stageId: this.stage.id, victory, stars, time: this.time, deaths: this.deaths
      };
      this.emit(victory ? 'victory' : 'defeat', { result: this.result });
    }

    // ---- 입력 ----
    // 탭한 칸이 속한 체인을 발동. 발동되면 true
    tapBlock(index) {
      if (!this.isCombat) return false;
      const group = this.blocks.groupAt(index);
      if (!group) return false;
      const caster = this.heroes.find(h => h.uid === group.owner);
      if (!caster || !caster.alive || SES().isDisabled(caster)) return false;
      if (!G.SkillExecutor.canExecute(this, caster)) return false;

      const taken = this.blocks.take(index);
      G.SkillExecutor.execute(this, caster, taken.chain);
      return true;
    }

    // 9.3 자동 블록 사용: 위급 시 회복 → 3체인 → 바가 가득 차면 가장 긴 체인
    updateAuto(dt) {
      const C = G.Config;
      this.autoTimer -= dt;
      if (this.autoTimer > 0) return;
      this.autoTimer = C.AUTO_DECISION_INTERVAL;

      const groups = this.blocks.groups();
      if (!groups.length) return;
      const kindOf = g => G.SkillExecutor.skillOf(this.heroes.find(h => h.uid === g.owner)).kind;
      const longest = list => list.reduce((a, b) => (b.length > a.length ? b : a), list[0]);

      const heals = groups.filter(g => kindOf(g) === 'heal');
      const attacks = groups.filter(g => kindOf(g) !== 'heal');
      const alive = this.aliveHeroes();
      const critical = alive.some(h => h.hpRatio < C.AUTO_HEAL_THRESHOLD);
      const hurt = alive.some(h => h.hpRatio < 1);

      let pick = null;
      if (critical && heals.length) pick = longest(heals);
      if (!pick) pick = attacks.find(g => g.length === C.MAX_CHAIN) || null;
      if (!pick && hurt) pick = heals.find(g => g.length === C.MAX_CHAIN) || null;
      if (!pick && this.blocks.isFull) pick = longest(groups);
      if (pick) this.tapBlock(pick.start);
    }
  }

  G.BattleManager = BattleManager;
})(window.Game = window.Game || {});
