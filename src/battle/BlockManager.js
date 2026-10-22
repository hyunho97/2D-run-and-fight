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
      const pick = G.pickWeighted(this.weights(), this.rng);
      if (!pick) return null;
      const block = { id: nextBlockId++, owner: pick.owner };
      this.slots.push(block);
      return block;
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
