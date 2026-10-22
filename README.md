# 블록 체인 RPG — 프로토타입

## ▶ 플레이: https://hyunho97.github.io/2D-run-and-fight/

설치 없이 링크만 열면 PC·모바일 브라우저에서 바로 플레이할 수 있습니다.

기획서 14.1 프로토타입 체크리스트 구현본 (기획서는 비공개). HTML5 Canvas + 순수 JavaScript, 빌드/서버 불필요.

## 배포

GitHub Pages(`main` 브랜치 루트)로 정적 배포됩니다. `main`에 push하면 1~2분 후 위 링크에 자동 반영됩니다.

## 로컬 실행

- `index.html`을 브라우저로 열기 (더블클릭)
- 테스트: `npm test`
- 밸런스 시뮬레이션: `npm run sim -- 200 BAS_0001,BAS_0003,BAS_0004 0 ENEMY_ATTACK_COEF=0.6`
  (`[판수] [파티] [리더 인덱스] [Config 덮어쓰기...]`)

### URL 파라미터

| 파라미터 | 예 | 설명 |
|---|---|---|
| `party` | `BAS_0001,BAS_0004,BAS_0005` | 전열→후열 순서 3명 |
| `leader` | `0` | 리더 인덱스 (블록 가중치 2배) |
| `seed` | `123` | 난수 시드 고정 |
| `auto` / `speed` | `1` / `2` | 자동 블록 사용 / 2배속으로 시작 |
| `warp` | `110` | 디버그: N초 미리 진행 (보스·광폭화 확인용) |

## 조작

| 입력 | 동작 |
|---|---|
| 블록 탭 / 숫자키 1~9 | 해당 칸이 속한 체인 스킬 발동 |
| 블록 길게 누르기 | 스킬 정보 툴팁 |
| x1/x2 버튼, `S` | 배속 |
| AUTO 버튼, `A` | 자동 블록 사용 |
| ⏸ 버튼, `Space` | 일시정지 |
| `R` | 다시 시작 |

## 구조 (GDD 12.2 / 12.3 대응)

```
src/
  core.js, config.js, data.js      공용 유틸 / 밸런스 상수(TBD 표시) / 직업·캐릭터·적·스테이지 데이터
  battle/
    BattleManager.js               전투 상태 머신, 웨이브, 광폭화, 승패·별 평가, 자동 모드
    BlockManager.js                블록 생성(리더 가중치 2배, 사망자 제외), 소모
    ChainResolver.js               인접 블록 체인 판정 (최대 3)
    SkillExecutor.js               체인 레벨별 스킬 실행
    DamageCalculator.js            13.1 데미지 공식, 속성 상성
    StatusEffectSystem.js          5.3 상태이상 (CC/화상/방깎/보호막/지속치유)
    Unit.js                        유닛 스탯 (레벨 성장 13.3)
  ui/Renderer.js                   Canvas 렌더링 / 연출
  main.js                          게임 루프, 입력
tests/run-tests.js                 Node 단위 테스트
tools/simulate.js                  헤드리스 밸런스 시뮬레이터
```

전투 로직(`battle/`)은 DOM에 의존하지 않아 Node에서 그대로 실행된다. 엔진을 Unity/Godot으로 옮길 때도 같은 클래스 구조로 이식 가능.

## GDD 미확정(TBD) 항목의 임시값

모두 [src/config.js](src/config.js)에 모여 있음.

| 항목 | 임시값 |
|---|---|
| 블록 생성 주기 | 1.2초 |
| 방어 상수 K | 100 |
| 속성 유리/불리 | x1.25 / x0.8 |
| 아군 기본 공격 계수 | ATK 30% |
| 적 공격 계수 | ATK 60% |
| 레벨당 스탯 성장 | 3% |
| ★★★ 클리어 시간 | 90초 |
| 스킬 대상 | 피해: 최전방 적 단일 / 회복: HP 비율 최저 아군 단일 |
| 사망 멤버의 기존 블록 | 즉시 제거 |
