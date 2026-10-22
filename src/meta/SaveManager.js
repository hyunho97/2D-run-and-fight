// 세이브 저장소: 브라우저 localStorage (서버 없음 — 플레이어 기기별로 저장)
// 기기 이동/백업은 백업 코드(문자열) 또는 JSON 파일로 내보내고 가져온다.
(function (G) {
  'use strict';

  const KEY = 'block-chain-rpg/save/v1';
  const CODE_PREFIX = 'BCRPG1:';

  function toBase64(str) {
    let bin = '';
    new TextEncoder().encode(str).forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function fromBase64(b64) {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

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
    },

    exportCode(state) {
      return CODE_PREFIX + toBase64(JSON.stringify(state));
    },

    exportJson(state) {
      return JSON.stringify(state, null, 1);
    },

    // 백업 코드 또는 JSON 텍스트 → 검증된 state. 잘못된 데이터면 null
    importText(text) {
      try {
        const t = String(text || '').trim();
        const json = t.startsWith(CODE_PREFIX) ? fromBase64(t.slice(CODE_PREFIX.length)) : t;
        return G.Progression.sanitize(JSON.parse(json));
      } catch (e) {
        return null;
      }
    }
  };
})(window.Game = window.Game || {});
