// 공용 네임스페이스 & 유틸. 모든 스크립트는 window.Game(G)에 등록된다.
(function (G) {
  'use strict';

  // 시드 고정 난수 (mulberry32) — 테스트/리플레이 재현용
  G.createRng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  G.clamp = function (v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  };

  // 일일 초기화 기준: 기기 로컬 날짜 YYYY-MM-DD
  G.today = function (date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // entries: [{ weight, ... }] → 가중치 비례로 하나 선택
  G.pickWeighted = function (entries, rng) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) return null;
    let r = rng() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r < 0) return e;
    }
    return entries[entries.length - 1];
  };
})(window.Game = window.Game || {});
