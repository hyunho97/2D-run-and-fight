// 3.3 인접 블록 체인 판정.
// 같은 캐릭터 블록이 연속되면 왼쪽부터 최대 3개씩 묶어 하나의 체인이 된다.
(function (G) {
  'use strict';

  G.ChainResolver = {
    // slots: [{ owner }] → [{ owner, start, length }]
    resolve(slots, maxChain) {
      maxChain = maxChain || G.Config.MAX_CHAIN;
      const groups = [];
      let i = 0;
      while (i < slots.length) {
        const owner = slots[i].owner;
        let j = i;
        while (j < slots.length && slots[j].owner === owner && j - i < maxChain) j++;
        groups.push({ owner, start: i, length: j - i });
        i = j;
      }
      return groups;
    },

    groupAt(slots, index, maxChain) {
      return this.resolve(slots, maxChain).find(g => index >= g.start && index < g.start + g.length) || null;
    }
  };
})(window.Game = window.Game || {});
