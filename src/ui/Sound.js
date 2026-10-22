// 10.3 사운드: Web Audio로 효과음/BGM을 즉석 합성 (음원 파일 없음)
// 브라우저 정책상 첫 사용자 입력 이후에만 소리가 난다 → unlock()
(function (G) {
  'use strict';

  let ctx = null;
  let sfxBus = null;
  let bgmBus = null;
  let noiseBuffer = null;
  const enabled = { sfx: true, bgm: true };
  const lastPlayed = {};
  const THROTTLE = { hit: 0.06, heroHit: 0.08, crit: 0.05, heal: 0.08 };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0.18;
    bgmBus.connect(master);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // o: { freq, to, dur, type, vol, delay, bus }
  function tone(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }

  // o: { dur, vol, filter, delay }
  function noise(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter || 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    src.start(t);
    src.stop(t + o.dur + 0.03);
  }

  const arp = (notes, gap, o) => notes.forEach((freq, i) => tone(Object.assign({ freq, delay: i * gap }, o)));

  const SFX = {
    ui: () => tone({ freq: 880, dur: 0.05, type: 'sine', vol: 0.07 }),
    good: () => arp([660, 990], 0.07, { dur: 0.14, type: 'triangle', vol: 0.1 }),
    bad: () => tone({ freq: 220, to: 150, dur: 0.22, type: 'square', vol: 0.07 }),
    reveal: () => arp([523, 659, 784, 1047, 1319], 0.07, { dur: 0.25, type: 'triangle', vol: 0.1 }),
    chain1: () => { tone({ freq: 520, to: 260, dur: 0.12, vol: 0.09 }); noise({ dur: 0.08, vol: 0.1, filter: 3000 }); },
    chain2: () => { tone({ freq: 440, to: 990, dur: 0.16, type: 'sawtooth', vol: 0.08 }); noise({ dur: 0.16, vol: 0.14, filter: 2500 }); },
    chain3: () => {
      arp([523, 659, 784, 1047], 0.05, { dur: 0.2, type: 'square', vol: 0.07 });
      noise({ dur: 0.4, vol: 0.22, filter: 1600, delay: 0.12 });
      tone({ freq: 120, to: 50, dur: 0.4, type: 'sine', vol: 0.25, delay: 0.12 });
    },
    heal: () => arp([784, 988, 1175], 0.06, { dur: 0.22, type: 'sine', vol: 0.1 }),
    hit: () => noise({ dur: 0.05, vol: 0.07, filter: 1500 }),
    crit: () => { noise({ dur: 0.1, vol: 0.14, filter: 4000 }); tone({ freq: 1400, to: 700, dur: 0.1, vol: 0.06 }); },
    heroHit: () => tone({ freq: 170, to: 90, dur: 0.1, type: 'square', vol: 0.06 }),
    enemyDie: () => { tone({ freq: 320, to: 60, dur: 0.25, type: 'sawtooth', vol: 0.09 }); noise({ dur: 0.2, vol: 0.08, filter: 900 }); },
    heroDie: () => tone({ freq: 420, to: 80, dur: 0.7, type: 'triangle', vol: 0.14 }),
    cast: () => tone({ freq: 180, to: 620, dur: 0.6, type: 'sawtooth', vol: 0.06 }),
    slam: () => { noise({ dur: 0.5, vol: 0.28, filter: 450 }); tone({ freq: 95, to: 38, dur: 0.5, type: 'sine', vol: 0.3 }); },
    interrupt: () => arp([1200, 800], 0.06, { dur: 0.1, type: 'square', vol: 0.07 }),
    wave: () => arp([392, 523], 0.1, { dur: 0.18, type: 'triangle', vol: 0.1 }),
    warning: () => arp([880, 660, 880, 660], 0.16, { dur: 0.14, type: 'square', vol: 0.07 }),
    berserk: () => { tone({ freq: 110, to: 55, dur: 0.9, type: 'sawtooth', vol: 0.16 }); noise({ dur: 0.7, vol: 0.18, filter: 600 }); },
    victory: () => arp([523, 659, 784, 1047, 784, 1047], 0.11, { dur: 0.32, type: 'triangle', vol: 0.13 }),
    defeat: () => arp([392, 330, 262, 196], 0.22, { dur: 0.45, type: 'triangle', vol: 0.12 })
  };

  // ---- BGM: 8분음표 스텝 시퀀서 (MIDI 노트 번호, null = 쉼표) ----
  const SONGS = {
    lobby: { bpm: 92, leadType: 'triangle', leadVol: 0.5,
      bass: [48, null, 55, null, 53, null, 55, null, 45, null, 52, null, 50, null, 52, null],
      lead: [72, 76, 79, 76, 74, 77, 81, 77, 69, 72, 76, 72, 71, 74, 79, 74] },
    battle: { bpm: 138, leadType: 'square', leadVol: 0.28,
      bass: [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 43, 43, 55, 43],
      lead: [69, null, 72, 74, 76, null, 74, 72, 69, null, 72, 74, 71, null, 67, null] },
    boss: { bpm: 152, leadType: 'sawtooth', leadVol: 0.22,
      bass: [40, 40, 52, 40, 41, 41, 53, 41, 40, 40, 52, 40, 39, 39, 51, 39],
      lead: [64, 67, 70, 67, 65, 68, 71, 68, 64, 67, 70, 67, 63, 66, 69, 66] }
  };
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const music = { want: null, playing: null, step: 0, next: 0, timer: 0 };

  function scheduleMusic() {
    const song = SONGS[music.playing];
    if (!song) return;
    const stepDur = 60 / song.bpm / 2;
    while (music.next < ctx.currentTime + 0.25) {
      const i = music.step % 16;
      const t = music.next - ctx.currentTime;
      if (song.bass[i] != null) tone({ freq: midi(song.bass[i]), dur: stepDur * 0.9, type: 'triangle', vol: 0.9, delay: t, bus: bgmBus });
      if (song.lead[i] != null) tone({ freq: midi(song.lead[i]), dur: stepDur * 0.8, type: song.leadType, vol: song.leadVol, delay: t, bus: bgmBus });
      music.step++;
      music.next += stepDur;
    }
  }

  function applyMusic() {
    const target = enabled.bgm && ctx && ctx.state === 'running' ? music.want : null;
    if (target === music.playing) return;
    clearInterval(music.timer);
    music.playing = target;
    if (!target) return;
    music.step = 0;
    music.next = ctx.currentTime + 0.05;
    scheduleMusic();
    music.timer = setInterval(scheduleMusic, 100);
  }

  G.Sound = {
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().then(applyMusic, () => {});
      else applyMusic();
    },

    setEnabled(sfx, bgm) {
      enabled.sfx = sfx;
      enabled.bgm = bgm;
      applyMusic();
    },

    setBgm(mode) {
      music.want = mode;
      applyMusic();
    },

    play(name) {
      if (!enabled.sfx || !ctx || ctx.state !== 'running' || !SFX[name]) return;
      const now = ctx.currentTime;
      if (THROTTLE[name] && now - (lastPlayed[name] || 0) < THROTTLE[name]) return;
      lastPlayed[name] = now;
      SFX[name]();
    },

    // 전투 이벤트 → 효과음
    consume(events) {
      for (const e of events) {
        switch (e.type) {
          case 'skill': this.play(e.skill.kind === 'heal' ? 'heal' : 'chain' + e.chain); break;
          case 'damage':
            if (e.target.side === 'hero') this.play('heroHit');
            else this.play(e.crit ? 'crit' : 'hit');
            break;
          case 'death': this.play(e.unit.side === 'hero' ? 'heroDie' : 'enemyDie'); break;
          case 'cast': this.play('cast'); break;
          case 'bossSkill': this.play('slam'); break;
          case 'interrupt': this.play('interrupt'); break;
          case 'wave':
            this.play('wave');
            if (e.isBoss) this.setBgm('boss');
            break;
          case 'berserkWarning': this.play('warning'); break;
          case 'berserk': this.play('berserk'); break;
          case 'victory': this.setBgm(null); this.play('victory'); break;
          case 'defeat': this.setBgm(null); this.play('defeat'); break;
        }
      }
    },

    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume().then(applyMusic, () => {}); }
  };
})(window.Game = window.Game || {});
