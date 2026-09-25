# Unit C — PlatformDataTable + DetailDrawer work order

## 목표와 원본 revision
- **합성 fixture, 실제 메뉴 아님.** 다섯 플랫폼 갈래 중 공통 컴포넌트 두 개만 검증한다.
- 기준 revision: `f8aa5ad17ae0d915820459c0ab01b56608d6715b`의 `docs/06_platform_ui_contract.md` §13, §14, §15 전문, §20, §28–29. 문서 Status Draft; §15 밀도는 Decided.
- 구현 후보 근거: `docs/04_frontend_ui_ux.md` 테이블/그리드(TanStack Table + Virtual; AG Grid Enterprise 범위 주의). `DESIGN.md` table-density: 행/헤더 최소 32px, padding 4px 12px.
- 기존 DESIGN 토큰을 소비하며 원본 계약/기존 프로토타입은 수정하지 않는다. 이번 요청은 프로토타입 구현 승인이고 제품 라이브러리 최종 채택은 아니다.

## USER TASK / IA / SCREEN INVENTORY
플랫폼 개발자가 합성 행 목록에서 필터/정렬, 컬럼 선호, 선택, 상세 조회 후 목록 복귀를 반복 검증한다. Desktop-first, 서버에 2,000행, 응답 최대 250행. 독립 component harness → table → detail drawer; 새 메뉴·navigation·archetype은 만들지 않는다.

## WIREFRAME
```text
합성 fixture, 실제 메뉴 아님 / 전달된 Context
[fixture category filter] [column preferences] [export entry]
[selection count] [server result/page status]
[sticky header / virtual rows / injected row action] | [DetailDrawer]
[previous / next]                                   | [Details | Audit]
                                                   | [Close]
```

## COMPONENT MAP / DATA REQUIREMENTS / 입출력
- PlatformDataTable<T>: columns, getRowId, loadPage(query, signal), domainFilter slot/value, rowAction slot, export callback, ariaLabel, pageSize를 입력받는다. interaction, 요청 loading/error/empty, column preference, selection, toolbar layout만 소유한다.
- fixture: id/numericValue/category/updatedAt 의미, column definition/cell render, category filter, 표의 접근성 이름, 페이지 크기(250), row action, 상세 탭 내용을 주입한다. `filter: string`은 이번 합성 category harness의 제한이며 범용 domain filter 계약은 확정하지 않는다.
- fixture 서버는 Node 전용 2,000행 데이터에서 filter → sort → slice를 수행한다. 응답 `{rows,total}`; query는 page/pageSize/sort/desc/category. 서버 코드가 브라우저 import graph에 들어가지 않는다.
- DetailDrawer: title/context/tabs/onClose 입력, 탭 전환과 닫기 출력. CRUD 없음. Audit 탭은 실제 연동이 없음을 명시한다.
- column preference는 fixture namespace의 localStorage에 저장, selection은 mount 세션의 stable row ID 집합으로 유지한다. 저장 불가 시 세션 내 기능은 유지한다.

## INTERACTION RULES / 실패 조건
- 필터/정렬 변경 시 첫 페이지·스크롤 상단으로 이동. Drawer open/tab/close는 table을 unmount하거나 query/selection/scroll을 변경하지 않는다.
- 서버 오류는 alert와 Retry, 결과 0건은 empty, pending은 loading을 구별한다. stale 요청은 AbortSignal/cleanup으로 무시한다. 현재 요청 identity와 완료 요청을 비교해 query 변경과 같은 렌더에서 loading/aria-busy를 파생하며 effect에서는 loading을 설정하지 않는다. 로딩/오류 동안 마지막 성공 행을 유지하고 이전 결과임을 표시하여 가상 rowgroup 높이가 0으로 무너지지 않게 한다.
- 잘못된 서버 query는 HTTP 400. 서버가 전체 2,000행을 보내거나 가상화가 페이지 전체를 DOM으로 렌더링하면 실패.
- 컬럼 resize/visibility/왼쪽 pin은 reload 후 복원. 이 프로토타입은 왼쪽 pin만 지원하며 저장된 오른쪽 pin 선호는 복원하지 않는다. multi-select는 페이지 이동에도 유지하며 전체 결과 선택이라고 주장하지 않는다.
- export는 승인된 entry stub: 클릭 시 미연동 안내만 표시한다.

## 포함 / 제외 / DESIGN DECISIONS
Decided: 위 범위, 32px baseline, 숫자 우측/tabular-nums, stable ID 선택, 목록을 유지하는 Drawer.
Candidate: TanStack Table/Virtual 및 Vite Node fixture 서버, 250행 페이지.
Deferred: 실제 메뉴/업무 의미, CRUD, 실제 export/Audit, 서버 권한·Scope API, 다른 Platform Component, saved view, cross-menu 통합. §14 반복 수요 없이 특정 filter 조합/summary framework를 승격하지 않는다.

## Platform Done 수용 사례
1. 실제 Chromium computed style로 행·헤더 ≥32px/padding 4px 12px/숫자 정렬을 원본과 대조한다.
2. 서버 sort/filter 결과 순서·범위 및 응답 ≤250행을 검증하고 클라이언트 요청에서도 이를 확인한다.
3. 컬럼 resize/visibility/pin 복원과 다중 선택을 검증한다.
4. 250행 페이지에서 실제 DOM 행 수가 250 미만이고 scroll 후 행 ID가 바뀜을 확인한다.
5. filter/sort/selection/scroll 설정 → Drawer 열기 → 탭 전환 → 닫기 후 모든 목록 상태와 전달 Context가 유지된다.
6. loading/error/retry/empty 및 keyboard close/focus 복귀를 확인한다.
§28–29 적용: 공통 책임 분리는 검증하지만 실제 Menu Registry/권한 Scope/URL·cross-menu/Data Trust 통합 완료를 주장하지 않는다. 이 standalone fixture에는 해당 서비스가 없다.

## 사용자 확인 필요
| # | 항목 | 상태 |
|---|---|---|
| 1 | 실제 서버 페이지네이션·정렬·필터 API 및 권한/Scope 재검증 계약 | Open |
| 2 | TanStack Table + Virtual 제품 실채택과 실제 데이터 성능 기준 | Decided (2026-09-25, [docs/04_frontend_ui_ux.md](../../docs/04_frontend_ui_ux.md) §프론트엔드 기술 스택) — 채택 확정; 정확한 버전 고정과 실제 데이터 성능 기준은 실제 구현 착수 시 재검증 |
| 3 | export 실제 포맷·범위·권한 | Open |
| 4 | DetailDrawer 실제 Audit 데이터 연결 | Open |
| 5 | 필터 변경 후 결과 밖으로 벗어난 행의 선택을 유지할지, 화면에 어떻게 표시할지(예: “N개 숨겨진 선택” 배지) — 실제 메뉴의 일괄 작업 범위와 연결된 결정 | Open |

## UX REVIEW / 검증
목록 옆 상세, 명시적 닫기, 이름 있는 선택/컬럼 조작, 키보드 탭과 Escape, 포커스 복귀를 검증한다. 원본 의미를 합성 fixture로 대체해 제품 구현 완료와 구분한다. 실행 결과는 `prototypes/kernel-platform-table/verification.log`; 상세 실행법은 해당 README에 기록한다.

## 최종 실행 결과
- 최종 수정본: Vitest Node **5/5 통과**, 실제 Chromium Playwright **9개 스위트 15회 연속 전부 통과(15/15, 총 135개 browser 실행)**. 타입 검사 및 Vite production bundle 통과.
- 구현 사용 버전: TanStack Table 8.21.3, TanStack Virtual 3.14.13. 제품 채택은 Candidate 유지.
- B1/M1: loading effect 타이밍을 제거하고 현재 요청/완료 요청 비교로 같은 commit에서 busy를 표시한다. 이전 성공 행을 유지하며, Drawer 테스트는 정렬 응답 → 첫 행 row-1709 → busy=false를 기다린 뒤 1,000px 초과 scroll 보존과 Drawer 동안 목록 요청 0건을 확인한다. 추가 회귀 테스트는 sort/filter/page 응답을 지연해 이전 행·높이 유지와 busy를 확인한다.
- M2: verification.log의 CURRENT REPAIR VERIFICATION에 코드·테스트 SHA256, 15회 개별 stdout/pass/exit 결과를 기록했다. 이전 단일 실행 이력은 historical로 구분해 보존했다.
- M3–M5: ariaLabel/pageSize는 fixture prop으로 주입하고 왼쪽 pin만 지원함을 명시했다. 숨은 선택 정책을 Open으로 추가해 **사용자 확인 필요 총 5항목**이다.
- 변경은 본 work order와 prototypes/kernel-platform-table/에 한정. 원본 계약/기존 prototype 수정과 commit/push 없음.
