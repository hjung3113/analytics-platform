# Unit C — PlatformDataTable + DetailDrawer compliance review

- 대상: `.agents/reports/kernel-work-order-platform-table-drawer-draft.md`, `prototypes/kernel-platform-table/` (둘 다 untracked)
- 기준: `docs/06_platform_ui_contract.md` §13–15, §20, §28–29 (`f8aa5ad`와 현재 파일 diff 없음 확인), `docs/04_frontend_ui_ux.md` 테이블/그리드, `DESIGN.md` `table-density`
- 역할: compliance-only. 코드·work order·계약 문서는 수정하지 않았다. 진단용 테스트는 scratchpad에서만 실행했다.
- 리뷰일: 2026-09-25

## 판정 요약

**전체 판정: FAIL (BLOCKING 1, MINOR 5).**

컴포넌트 동작 자체는 계약을 대체로 만족한다. 막히는 이유는 "13 tests PASS"라는 검증 주장이 재현되지 않는다는 점이다. Drawer 상태 보존 테스트(수용 사례 5)가 이 머신에서 **11번 중 9번 실패**했다. 원인은 컴포넌트가 아니라 테스트 동기화 race다. 동기화를 바로잡은 변형 테스트는 15/15 통과했다.

| # | 항목 | 결과 | 등급 |
|---|---|---|---|
| B1 | Drawer 테스트 flaky, 13 PASS 주장이 재현되지 않음 | FAIL | **BLOCKING** |
| M1 | loading을 effect에서 설정해 한 commit 동안 stale 상태가 노출되고, loading 중 0행 렌더로 스크롤이 무너짐 | FAIL | MINOR |
| M2 | verification.log/work order의 "최종 결과"가 1회 실행만 근거로 함 | FAIL | MINOR |
| M3 | Platform 컴포넌트 안의 fixture 리터럴과 하드코딩 (§15 경계 누수, 경미) | FAIL | MINOR |
| M4 | 오른쪽 pin 선호를 조용히 폐기함 (범위 미명시) | FAIL | MINOR |
| M5 | 필터 변경 뒤 결과 밖 행의 선택이 숨은 채 남음. "사용자 확인 필요" 표에 없음 | FAIL | MINOR |
| — | 인용 정확성, Domain import 경계, 서버 slice, 번들 격리, 가상화, preference 저장, Drawer 보존(결정론적 재검증), 사용자 확인 필요 표 | PASS | — |

## B1 (BLOCKING) — Drawer 테스트 flaky: 원인 분석

### 재현 결과

| 실행 | 결과 |
|---|---|
| `npm ci && playwright install chromium && npm test` (1회) | Vitest 5/5 PASS, Playwright 7/8, **`table.browser.test.ts:63` FAIL** (`scroll` Received 0) |
| `npx playwright test tests/table.browser.test.ts` 10회 연속 | **8/10 실패**. 실패 8건 모두 같은 테스트(`:63`), 같은 assertion(`expect(scroll).toBeGreaterThan(1000)`, Received 0) |
| 합계 | **11번 중 9번 실패 (≈82%)**. 코디네이터 관측은 4번 중 1번 실패. 실패율은 머신 부하와 타이밍에 따라 달라진다 |

나머지 7개 browser 테스트는 11회 모두 통과했다.

### 원인: 테스트 동기화 race (스크롤 복원 문제가 아님)

테스트 흐름(`tests/table.browser.test.ts:64-75`):

1. Category A를 선택하고 numericValue 정렬 버튼을 클릭한다.
2. `aria-sort=descending`을 기다린 뒤 `aria-busy=false`를 기다린다.
3. `topRow`를 읽는다.
4. `scrollTop = 1600`으로 설정한다.
5. "첫 행이 topRow가 아님"을 기다린 뒤 체크하고, `scroll > 1000`을 확인한다.

컴포넌트(`src/platform/PlatformDataTable.tsx`):

- `onSortingChange`는 sorting state를 바꾼다. 그 commit에서 `aria-sort=descending`이 곧바로 반영된다.
- `setState('loading')`은 **그 다음 `useEffect` 안에서** 실행된다(`:38-45`). 그래서 한 commit 동안 `aria-sort=descending`과 `aria-busy=false`가 함께 보인다. 이 `false`는 정렬 이전 로딩에서 남은 stale 값이다.
- loading 중에는 `data: state === 'ready' ? result.rows : []`로 0행을 렌더한다(`:53`). 그러면 가상 rowgroup 높이가 `0px`가 되고, 브라우저는 `scrollTop`을 0으로 clamp한다.

scratchpad 계측 테스트에서 네트워크, `aria-busy` 변경, scroll 이벤트를 기록했다(8회 중 7회 실패).

```text
실패 run (diag 1):
128ms REQ sort=numericValue            ← 정렬 요청 시작
130ms aria-sort ok
130ms busy false ok                    ← 정렬 전의 stale 'false'로 통과
131ms topRow row-0001                  ← 정렬 전 id순 첫 행 (정답은 row-1709)
137ms set 1600                         ← 페이지 측: scroll=0 rgH=0px busy=true (clamp)
155ms RES sort=numericValue
163ms window moved                     ← 스크롤이 아니라 정렬 결과(row-1709) 도착으로 통과
232ms scroll 0                         → FAIL

통과 run (diag 0):
212ms REQ sort=numericValue → 213ms aria-sort ok → 229ms RES → 248ms busy false ok
249ms topRow row-1709 → set 1600 → page: scroll=1600 rgH=9832px → scroll 1565 → PASS
```

결론:

- **`aria-busy=false` 대기가 "정렬 로딩이 끝남"을 보장하지 않는다.** 로딩이 시작되기 전의 false로도 통과한다. 이 경우 `scrollTop=1600`은 0행 상태의 컨테이너에 쓰여 0으로 clamp된다.
- 같은 race 때문에 "window moved" assertion(`:69`)도 스크롤이 아니라 정렬 결과 도착으로 공허하게 통과한다.
- 가상화 settle 대기가 부족한 문제나 Drawer 닫기 후 스크롤 복원 타이밍 문제가 **아니다**. 실패는 모두 Drawer를 열기 전 `:75`에서 났다. 실패 snapshot(`error-context.md`)도 첫 행이 row-1709(정렬 결과 최상단)이고 `1 selected`, 스크롤 0인 상태다.
- 실패는 false negative 방향이다. race에서 지면 테스트가 실패하고, 통과한 run은 실제로 1000px 넘게 스크롤한 뒤 보존을 검증한 것이다. 거짓 통과 위험은 확인하지 못했다.

### 컴포넌트 동작 재검증 (결정론적 변형, scratchpad 전용)

동기화를 바꾼 변형 테스트를 **15회 연속 실행해 15/15 통과**했다. 변경한 점:

- `waitForResponse(sort=numericValue)`를 기다린다.
- 첫 행이 `row-1709`인지 확인한 뒤 `aria-busy=false`를 확인한다.

같은 테스트에서 함께 확인한 것:

- Drawer 열기 → Audit 탭 → Details 탭 → 닫기 동안 `/api/rows` 요청이 0건이다(목록 refetch나 unmount 없음).
- 스크롤이 정확히 같은 값으로 유지된다. 선택 체크, 필터, 정렬도 유지된다.
- 닫은 뒤 포커스가 행의 "Open" 버튼으로 돌아간다.

따라서 §20 "Context를 유지한 조회"와 work order의 "Drawer open/tab/close는 query/selection/scroll을 변경하지 않는다"는 **컴포넌트 수준에서 PASS**다.

### BLOCKING 판단 근거

- work order "최종 실행 결과"와 README, verification.log는 "13개 통과"를 완료 증거로 제시한다. 그런데 그 중 수용 사례 5(§20 핵심)를 증명하는 유일한 테스트가 이 머신에서 대부분 실패한다. 이 스위트는 게이트로 쓸 수 없고, Platform Done 증거로 받아들일 수 없다.
- 컴포넌트 결함이 아니므로 설계 수준의 BLOCKING은 아니다. 차단 사유는 **검증 증거의 재현성**이다.
- 해소 조건(수정은 작성자 몫): 정렬 응답이나 결과 첫 행을 명시적으로 기다리게 하거나, loading 전이를 동기화한다(M1 참조). 그 뒤 최소 10회 연속 실행 결과를 log에 남긴다.

## MINOR

### M1 — loading 전이가 effect에서 일어나고, loading 중 목록이 비워짐

`PlatformDataTable.tsx:38-45, 53`

- sort/filter/page 변경 직후 한 commit 동안 새 정렬 표시(`aria-sort`), 이전 행, `aria-busy=false`가 함께 노출된다. 보조기술과 테스트가 stale 상태를 관측할 수 있다. B1의 근본 조건이다.
- loading 중 0행을 렌더해 스크롤 컨테이너 높이가 0이 된다. 지금은 sort/filter/page 변경이 원래 scroll 상단 리셋 규칙을 따르므로 드러나지 않는다. 하지만 **스크롤을 유지해야 하는 refetch**가 생기면 위치가 사라지고 빈 목록이 깜빡인다. 예: 향후 Drawer 작업 후 재검증, 백그라운드 revalidation.
- §19 로딩 분류와 §20 목록 유지를 장기적으로 지키려면 "이전 결과를 유지하며 loading 표시" 여부를 결정해야 한다.

### M2 — "13 tests PASS"는 단일 실행 근거

- `verification.log` 첫 줄은 "FINAL RESULT: 13 distinct tests PASS"다. 근거는 마지막 1회의 `8 passed` run(log 260–279행)뿐이다.
- 같은 log의 앞선 run에는 같은 테스트의 실패(locator.check timeout)와 pin 테스트 실패가 남아 있다. 이는 테스트 수정 전 버전이다.
- 최종 버전의 반복 실행 기록은 없다. work order "최종 실행 결과"의 "13개 통과"는 "1회 통과"로 한정해야 정확하다.

### M3 — Platform 컴포넌트 안의 fixture 리터럴과 하드코딩 (§15 경계)

`PlatformDataTable.tsx`는 fixture 모듈을 import하지 않는다. React와 TanStack만 import한다(PASS). 다만 아래 셋은 Domain/fixture 쪽이 주입해야 할 값이 Platform 안에 박혀 있다.

- `aria-label="Synthetic values"`(`:78`): 표 이름은 Domain 의미다.
- `pageSize: 250`, `/ 250`(`:41, :62, :83`): 페이지 크기가 하드코딩돼 있다. work order는 Candidate로 분류했지만 prop이 아니다.
- `filter: string`: domain filter 값을 단일 문자열로 제한한다. §15는 "domain filter"를 Domain 소유로 둔다. prototype 범위에서는 허용 가능하나, 계약상 일반화 여부는 미정이다.

### M4 — 오른쪽 pin 선호를 조용히 폐기

`readPreferences`(`:15`)는 `pinning.right`를 항상 `[]`로 되돌린다. UI도 왼쪽 pin만 제공한다. §15는 "Column pin"의 방향을 정하지 않았고, work order도 "pin"만 적었다. 범위를 "왼쪽 pin만"으로 명시해야 한다.

### M5 — 필터 변경 뒤 숨은 선택. "사용자 확인 필요"에서 누락

- 선택은 stable ID로 유지되고 필터 변경 때 초기화되지 않는다. Category를 바꾸면 현재 결과에 없는 행도 `N selected`에 포함된다. 화면에서는 어떤 행인지 알 수 없다.
- work order는 "전체 결과 선택이라고 주장하지 않는다"만 정했다. 필터를 넘는 선택을 유지할지는 정하지 않았고, 표에도 올리지 않았다. 실제 메뉴에서 일괄 작업의 대상 범위와 연결되는 결정이므로 사용자 확인 항목으로 올릴 것을 권한다.
- (참고) wireframe은 목록 옆에 Drawer를 그렸지만, 구현은 `position: fixed` 오버레이다(`aria-modal=false`). 1440px에서는 Action 컬럼을 가리지 않는다. 좁은 폭에서는 목록을 덮는다. 결함은 아니고 기록만 한다.

## PASS 항목

| 검증 | 결과 | 근거 |
|---|---|---|
| work order 인용 정확성 | PASS | §15 기본 기능 9개, baseline 32/32/4px 12px, 숫자 우측·`tabular-nums`, "브라우저에 전체 데이터 전달 금지", Platform/Domain 경계가 원문과 일치한다. `DESIGN.md:486-490` `table-density` 값이 일치한다. §15 밀도가 Decided라는 점은 06 머리말과 일치한다. docs/04의 "TanStack Table + Virtual, AG Grid Enterprise 주의"도 일치한다. 06은 `f8aa5ad`와 diff가 없다. |
| §15 경계: Domain 의미 import 금지 | PASS (M3 제외) | `src/platform/*`는 react와 @tanstack만 import한다. column 정의, cell 렌더(`numeric` 포맷), category filter, row action, 상세 탭 내용은 모두 `src/fixture/App.tsx`에서 주입한다. |
| 서버측 sort/filter, 전체 2,000행 미전송 | PASS | `server.ts`가 filter → sort → slice를 하고 최대 250행을 반환한다. 잘못된 query는 throw되고 vite middleware가 400으로 바꾼다. `dist/assets/*.js`에 `queryFixture`, `Invalid fixture query`, fixture 생성식, 타임스탬프 문자열이 없어 서버 코드가 번들에 들어가지 않았다. build exit 0. |
| 가상화 DOM 행 제한 | PASS | `useVirtualizer` overscan 4, viewport 420px. browser 테스트가 DOM 행 < 50이고 scroll 후 ID가 바뀌는지 확인하며, 11/11 통과했다. |
| column resize/visibility/pin의 localStorage 저장 | PASS | `unit-c:columns:v1`에 저장한다. 읽을 때 범위와 타입을 검증하고, 저장 실패 시 try/catch로 세션 기능을 유지한다. reload 복원 테스트 11/11 통과. |
| 필터/정렬 변경 시 첫 페이지와 상단 이동, stale 요청 무시 | PASS | `effectivePage` 파생, `scrollTop=0`, `AbortController` 사용. |
| loading/error/retry/empty 구분 | PASS | 11/11 통과. |
| Drawer 탭 전환과 닫기 시 목록 상태 보존 (§20) | PASS | 결정론적 변형 15/15 통과, refetch 0건 (B1 참조). |
| Drawer 키보드와 포커스 | PASS | Arrow/Home/End 탭 이동, Escape 닫기, 열었던 요소로 포커스 복귀. 11/11 통과. |
| export는 entry stub, Audit은 미연동 명시 | PASS | 안내 문구만 표시한다. |
| §28–29 과대 주장 없음 | PASS | Menu Registry, 권한·Scope, URL, cross-menu, Data Trust 통합 완료를 주장하지 않는다고 명시돼 있다. |
| "사용자 확인 필요" 표에 임의 결정 없음 | PASS (M5 누락 제외) | 서버 API·권한 재검증, TanStack 채택, export, Audit이 Open 또는 Candidate로 남아 있다. "Decided" 목록의 "stable ID 선택"과 "목록을 유지하는 Drawer"는 원문에 문자 그대로 있지 않다. 각각 §15 Multi-select와 docs/12의 "행 index가 아님", §20 "Context를 유지한 조회"에서 파생한 해석이다. 합리적인 파생이라 FAIL로 보지 않는다. |

## 실행 기록

```sh
cd prototypes/kernel-platform-table
npm ci --no-audit --no-fund && PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium && npm test
#   → exit 1: Vitest 5/5, Playwright 7/8 (:63 FAIL, scroll=0)
for i in 1..10: npx playwright test tests/table.browser.test.ts
#   → 8/10 실패 (모두 :63, Received 0)
npm run build   # → exit 0
# scratchpad 진단: 계측 테스트 7/8 실패 재현 + 원인 로그. 결정론적 변형 15/15 통과
```

부수 효과: `npm ci`, `npm test`, `npm run build`로 `node_modules/`, `.browsers/`, `test-results/`, `dist/`가 다시 생성됐다. 모두 prototype `.gitignore` 대상이다. `dist` 번들 해시는 동일하다. 소스, 테스트, work order, 계약 문서는 변경하지 않았다.
