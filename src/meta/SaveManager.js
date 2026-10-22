// 세이브 저장소: 브라우저 localStorage (서버 없음 — 플레이어 기기별로 저장)
(function (G) {
  'use strict';

  const KEY = 'block-chain-rpg/save/v1';

  G.SaveManager = {
    load() {
      try {
        const state = G.Progression.sanitize(JSON.parse(localStorage.getItem(KEY)));
        if (state) return state;
      } catch (e) {
        // 저장소 접근 불가(사생활 보호 모드 등) 또는 손상 데이터 → 새로 시작
      }
      return G.Progression.newState();
    },

    save(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        return false;
      }
    },

    reset() {
      try {
        localStorage.removeItem(KEY);
      } catch (e) {
        // 무시
      }
      return G.Progression.newState();
    }
  };
})(window.Game = window.Game || {});
