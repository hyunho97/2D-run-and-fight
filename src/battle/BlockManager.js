// 3.1 블록 생성/배치/제거. slots[0]이 가장 왼쪽 칸.
(function (G) {
  'use strict';

  let nextBlockId = 1;

  class BlockManager {
    constructor(heroes, rng) {
      this.heroes = heroes;
      this.rng = rng;
      this.slots = [];
      this.spawnTimer = 0;
      this.drought = {};   // owner → 연속으로 안 나온 횟수
    }

    get isFull() { return this.slots.length >= G.Config.BLOCK_SLOTS; }

    // 3.1.1 리더 ×2, 사망한 멤버는 제외
    weights() {
      return this.heroes
        .filter(h => h.alive)
        .map(h => ({ owner: h.uid, weight: h.isLeader ? G.Config.LEADER_WEIGHT_MULT : 1 }));
    }

    spawn() {
      if (this.isFull) return null;
      const entries = this.weights();
      const pick = this.pityPick(entries) || G.pickWeighted(entries, this.rng);
      if (!pick) return null;
      for (const e of entries) this.drought[e.owner] = e.owner === pick.owner ? 0 : (this.drought[e.owner] || 0) + 1;
      const block = { id: nextBlockId++, owner: pick.owner };
      this.slots.push(block);
      return block;
    }

    // 15장 리스크 대응: 가장 오래 안 나온 캐릭터가 한도에 도달하면 확정 생성
    pityPick(entries) {
      const limit = G.Config.BLOCK_PITY;
      if (!limit) return null;
      let worst = null;
      for (const e of entries) {
        const d = this.drought[e.owner] || 0;
        if (d >= limit && (!worst || d > (this.drought[worst.owner] || 0))) worst = e;
      }
      return worst;
    }

    update(dt) {
      this.spawnTimer += dt;
      while (this.spawnTimer >= G.Config.BLOCK_SPAWN_INTERVAL) {
        this.spawnTimer -= G.Config.BLOCK_SPAWN_INTERVAL;
        this.spawn();
      }
    }

    groups() {
      return G.ChainResolver.resolve(this.slots);
    }

    groupAt(index) {
      return G.ChainResolver.groupAt(this.slots, index);
    }

    // 탭한 칸이 속한 체인 전체를 소모. 제거 후 빈칸은 왼쪽으로 밀리고 재판정 시 자동 합체된다.
    take(index) {
      const group = this.groupAt(index);
      if (!group) return null;
      this.slots.splice(group.start, group.length);
      return { owner: group.owner, chain: group.length };
    }

    removeOwner(owner) {
      this.slots = this.slots.filter(b => b.owner !== owner);
    }
  }

  G.BlockManager = BlockManager;
})(window.Game = window.Game || {});
