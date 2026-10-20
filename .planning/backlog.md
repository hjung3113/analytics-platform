# 백로그 — 이슈로 올리지 않은 것

우선순위가 낮거나 수요가 확인되지 않은 일이다. 착수하려면 먼저 GitHub 이슈로 올리고 이 줄을 지운다.

## 작은 후속 (확인된 것)

- **구현 안 함 — 공개 API 변경 기록의 자동 강제(#520):** 스냅샷에서 줄이 지워지거나 바뀌면 변경 기록 줄이 같은 PR에 있어야 한다는 규칙을 CI가 강제하지 않는다(리뷰가 본다). 이유: base 비교와 문서 파싱이 필요하고 외부 소비자가 아직 적다. 다시 볼 조건: 저장소 밖 소비자가 둘 이상 tarball을 받을 때.
- **구현 안 함 — SDK 배포 도구 정리 후속(#519·#520 품질 리뷰 Q6–Q8):** `@ap/contracts`의 `check:pack` 검사를 release tarball 게이트에 합친다. 네 `tsconfig.build.json`의 형제 `paths`와 의존 쌍을 생성한다. `validateArchive`·`releaseManifest` 실패 경로 테스트를 추가하고 `pnpm test`에서 `sdk:api --self-test`를 실행한다. 이유: 현재 잘못된 release 출력은 없다. 다시 볼 조건: 형제 의존 또는 subpath import를 추가하거나 첫 gate false-positive가 발생할 때.
- **구현 안 함 — `isProductionEnv(import.meta, globalThis)`의 운영 판정(#519 리뷰 C2 관련):** Vite 운영 빌드는 맨 `import.meta`를 바꾸지 않아 `PlatformDataTable`·`tableExport`의 개발용 진단이 운영에서도 켜질 수 있다(경고만, 동작 영향 없음). 이유: 이 이슈 범위 밖이고 경고뿐이다. 다시 볼 조건: 운영 콘솔 경고가 보고되거나 이 helper를 다른 곳에서 새로 쓸 때.
- **구현 안 함 — 테마 계약의 제품 쪽 소비(#512):** EV 매핑 검사를 `theme-tokens.json` 이름 목록 대조로 넓히는 일(EV 저장소, EV 전용 의미 로봇·자재·재생 활성·충돌 강조는 EV 소유)과 FeedbackOps 토큰 fixture 검사를 manifest 대조로 바꾸는 일. 이유: 다른 저장소의 일이고 탑재 전(#332)이다. 다시 볼 조건: EV 탑재(#332) 또는 FeedbackOps가 `@ap/ui/theme`을 받을 때.
- **구현 안 함 — 테마 토큰 `$deprecated` 생성(#512):** 이유: 폐기할 토큰이 아직 없다. 다시 볼 조건: 첫 토큰 폐기.
- **구현 안 함 — 테마 계약 정리 후속(#512 품질 리뷰 Q5·Q6):** lint 하위 경로 허용을 7개 제한 상수에 반복한다(공유 helper 하나로 정리). `token()`은 `readColorToken`의 공개 별칭이고 `strokeAliases` 표를 손으로 복사한다. 이유: 동작 영향이 없다. 다시 볼 조건: 다음 `@ap/ui` 공개 하위 경로를 추가하거나 차트 팔레트가 바뀔 때.
- **구현 안 함 — 색 외 토큰(모션·간격·타이포)과 다크 테마의 기계 계약:** 이유: 소비자 요구 없음. 다시 볼 조건: 제품이 JS로 그 값을 읽어야 할 때 또는 두 번째 테마.
- **구현 안 함 — 모듈 화면 실제 브라우저 확인(#489):** `ModuleScreen`의 도착 포커스·상세 패널(`section.contents` 래퍼 레이아웃)·상태 화면을 실제 브라우저로 보지 않았다. 이유: 고정 모듈은 앱에 올리지 않아(ADR-0053) 브라우저로 열 화면이 없고, 검증은 jsdom 단위 테스트다. 다시 열 조건: 첫 실제 모듈(EV `platform-adapter`, #332 뒤)이 앱에 올라올 때 그 화면으로 확인한다.
- 표 행 복사(#174, 닫힘) 실확인: 실제 엑셀·구글 시트 붙여넣기, Safari 클립보드, HTTP 경로 실브라우저.
- **구현 안 함 — SDK 쪽 픽셀·시각 하니스:** 토큰·primitive의 컴포넌트 단위 시각 검증. 이유: FeedbackOps의 하니스(`apps/frontend/tests/visual`)는 앱 화면에 묶여 FeedbackOps에 남는다(ADR-0046 Open). 지금 검증은 이전된 token-fidelity·대비·소비 계약 테스트와 플랫폼 E2E 계약 보고다. 다시 열 조건: #443 완료 뒤, 또는 FeedbackOps 소비 전환 전.
- 앱 Tailwind 소스 범위: `apps/platform-web/src/style.css`를 `@import "tailwindcss" source(none)` + 명시 `@source`로 좁혀 Markdown 글자가 CSS를 만들지 않게 할지(#220에서 문서 삭제로 selector 5개가 빠졌다). 바꾸면 CSS selector 비교가 한 번 크게 움직인다.
- 셸 치수 리터럴: 페이지 머리 50px·Context 바 48px가 토큰(`--toolbar-height`) 대신 코드 리터럴이다(값은 같다).
- Context 바에는 Lot·PPID·Recipe·지표 쌍을 새로 지정하는 편집기가 없다 — URL로 받은 값을 지우기만 한다(`GlobalContextBar.tsx`). 도메인 선택지가 정해진 뒤 만든다.
- `AnalysisChartFrame` Compare에 이전 기간 x축 정렬 옵션이 없어 생산성 개요가 bucket index 정렬로 우회한다(`ProductivityOverview.tsx`의 우회 주석).
- 차트 더보기 팝오버(`AnalysisChartFrame`)가 `shadow-md`를 쓴다. DESIGN의 그림자 규칙과 맞는지 확인(공유 floating primitive 전체로 넓히지 않는다는 문장만 있다).
- **구현 안 함 — 간헐 실패 1회 기록:** `packages/shell/src/SystemSwitcher.test.tsx` "lets a lazy arrival keep the title when the switcher is reopened before it resolves"가 main 기준 문서만 바뀐 PR(#447)의 CI에서 1회 실패했다(`h1` 대신 전환 버튼이 포커스를 가짐, 1655ms). 로컬에서는 부하 루프(CPU ×20)로 파일 전체 12회·단일 12회·무부하 12회 모두 통과해 재현하지 못했다. 미검증 가설: Escape 뒤 Radix `onCloseAutoFocus`(`setTimeout 0`)와 새 제목의 도착 포커스 effect(React 스케줄러) 순서가 느린 러너에서 뒤집힌다. 다시 열 조건: 두 번째 발생 — 이슈로 올리고 그때 CI 로그 두 건을 대조해 진단한다.
- **구현 안 함 — 관리 화면 필터 초기화 범위 통일(#419 ②):** `useManagementFilters`의 초기화가 화면마다 다르다(설비는 sort 유지, 권한·감사는 sort·focus·tab까지 지움, #411 이전부터). 이유: 동작을 바꾸는 상태 코드이고 사용자 불편 신고가 없다(정비 슬라이스 15 콘덕터 결정, 2026-10-19). 다시 볼 조건: 초기화 동작에 대한 사용자 지적, 또는 `useManagementFilters`를 다시 만질 때.
- **구현 안 함 — `RowAction`의 컨트롤별 `TooltipProvider`(#419 ④):** 컨트롤마다 provider를 만든다. 이유: 측정된 성능 문제가 없다. 다시 볼 조건: 행이 많은 표에서 렌더 비용이 측정될 때.
- **구현 안 함 — `@ap/ui` 팔레트 층 경로 하나로(슬라이스 15 품질 Q5):** 팔레트 층을 만드는 길이 둘이다(`DialogContent scrim="palette"`와 `DialogOverlay`+`DialogContentBare variant="palette"`, 후자는 비공개). `z-60`도 두 곳에 따로 적혀 있다. 팔레트 내용이 z-60이라 앞으로 팔레트 안에 Tooltip·Popover·Select(z-50 portal)를 넣으면 뒤로 숨는다(지금은 그런 자식이 없다). 이유: 지금 소비자 하나, 결함 없음. 다시 볼 조건: 팔레트 안에 portal 자식을 넣을 때, 또는 `DialogContentBare`를 공개할 때.
- **소유자 결정 후보 — FeedbackOps 링크 E2E 겹침(슬라이스 15 품질 Q2 관련):** #451의 공간 수 test 3건이 #251 describe의 admin 블록 test와 engineer·viewer "전체 링크 없음" test를 거의 다 덮는다. 테스트 삭제·합치기는 소유자 결정이라 하지 않았다. 다시 볼 조건: 소유자가 정할 때.
- **구현 안 함 — 차트 주석을 쓰기 동작으로 옮기기(ADR-0054):** `saveAnnotation`·`deleteAnnotation`은 포트 전용 메서드로 남긴다. 이유: 동작으로 바꿔도 화면 동작이 같고 diff만 생긴다. 다시 볼 조건: 주석에 버전 충돌·재시도가 필요해질 때, 또는 포트 메서드를 줄이는 정리 이슈가 생길 때.
- **구현 안 함 — 표(`useMenuFetch`)의 쓰기 뒤 다시 읽기(#502):** 쓰기가 무효화한 조회는 `useMenuQuery`만 다시 읽고(`refreshEpochs`), `useMenuFetch`·`PlatformDataTable` 쪽은 다시 읽지 않는다. 이유: 쓰기 동작을 가진 표가 아직 없다(결과 정체성을 호출자가 쥐어서 한 번에 맞출 소비자가 필요하다). 다시 볼 조건: 쓰기 동작이 있는 첫 표.
- **구현 안 함 — `@ap/kernel` `dropResetKeys` 공개 export 제거(#534 품질 Q5):** Kernel 밖 소비자가 없고 시그니처가 비공개 타입 `ResetRule`을 드러낸다. 이번에는 `@deprecated`와 변경 기록 예고만 했다. 이유: ADR-0044는 공개 API 줄을 지우기 전에 한 SDK 릴리스 예고를 요구한다. 다시 볼 조건: 예고를 실은 다음 SDK 태그가 나간 뒤 — 그다음 SDK 슬라이스에서 `index.ts` export와 `kernel.root.api.txt` 줄을 지운다.
- **구현 안 함 — 주소 `?` 분리 정리(#534 F3 나머지):** `url.indexOf('?')` 분리가 `OpenInBoardAction.tsx`·`BoardScreen.tsx`·`platform.tsx`에 남아 있다(칸 href 규칙은 `paneHref` 하나로 모았다). 이유: 하는 일이 달라 한 도우미로 모을지 정해지지 않았다. 다시 볼 조건: 이 분리를 쓰는 곳이 하나 더 생길 때.
- **구현 안 함 — 분석 보드 서버 저장·공유·여러 보드(#421):** 1차는 브라우저 저장·사용자당 보드 하나다. 이유: 사용자 설정 쓰기 포트와 저장소 소유자가 없다. 다시 볼 조건: 쓰기 포트·저장소 소유자 결정(#155·#157), 또는 다른 기기에서 같은 보드를 쓰자는 요구. 공유 때 권한은 받는 사람 기준으로 칸마다 다시 판정.
- **구현 안 함 — 분석 보드 시트 복제·칸 묶음(#421):** 이유: 1차는 일괄 적용·복사 동작으로 충분하다. 다시 볼 조건: 같은 시트를 반복해 다시 만드는 사용이 확인될 때.
- **구현 안 함 — 분석 보드 서버 동시 실행 상한·캐시(#421):** 이유: mock에서 정한 값은 근거가 없다. 다시 볼 조건: 실서버 연결(#154).
- **구현 안 함 — 분석 보드 자체 사용 계측(보드 열기·시트 수·칸 수, #497a):** 칸 하나가 열릴 때의 메뉴 사용은 이미 `source: 'board'`로 센다. 이유: `UsageEvent`는 `menuId`·`path`가 필수인 메뉴 사용 모양(`entry`/`dwell`)이라 보드 화면 자체를 넣으려면 이벤트 이름이나 필드를 늘리는 계약 변경이 필요하고, 새 포트를 만들지 않기로 했다. 다시 볼 조건: 보드 사용 지표가 필요해질 때 — `UsageEvent` 확장 여부를 사용자에게 올린다(docs/05, docs/16 §7).
- **구현 안 함 — 코드 이름 `usePlatform().global` → 칸 Context(ADR-0049):** 이유: 메뉴 전체에 닿는 이름 바꾸기라 보드 구현과 따로 한다. 다시 볼 조건: 정비 슬라이스.

- **구현 안 함 — 분석 보드 Context 바에 `모든 칸에 적용`도 두기(#421 UX 리뷰 제안):** 바에서 선택 칸 조건을 편집한 뒤 바로 퍼뜨리는 흐름이 짧아진다. 이유: 16 §4가 칸 머리 `⋯`로 정했고 1차에 꼭 필요하지 않다. 다시 볼 조건: 1차 사용에서 바 편집 → 일괄 적용이 잦다고 확인될 때(소유자 OK 필요).

## 설계 원칙 메모

- 대시보드 저장 형식(위젯 배치·설정)은 레이아웃 라이브러리 형식과 분리해 플랫폼이 소유한다 — 대시보드 편집 기능을 만들 때 적용(구 04 "최종 권장안").

## 프로토타입에서 남은 UX 미결

- 필터가 바뀐 뒤 결과 밖으로 나간 선택 행 처리(`PlatformDataTable`).
- 차트 zoom-out / viewport 복귀 어휘.
- Selection Summary와 표 Toolbar의 위치.

## 대표 분석 시나리오 검증 기준 (Candidate)

대표 시나리오(예: 사이클타임 P95 → 느린 실행 목록 → 실행 타임라인)로 지표·필터·식별자·권한·리니지를 한 번에 검증할 때의 기준 후보. 지금 E2E가 일부를 본다.

- 동일 조건의 차트·상세 표·CSV 일치
- 지연 완료 후 일치(재집계 반영)
- 딥링크 왕복(같은 조회조건으로 재방문)
- 권한 변경 후 비노출(캐시가 권한을 무시하지 않음)
- 유효구간 경계 귀속(설비 속성이 바뀐 구간의 데이터가 올바른 속성값에 귀속)

질문: "이 숫자는 어느 데이터까지 반영했고, 어떤 정의로 계산했으며, 무엇을 제외했고, 어떤 설비 실행에서 나왔는가?"

## 검토하지 않은 제안 (2026-09-22 3-모델 요구사항 조사)

채택 결정이 아니다. 필요해지면 이슈로 올린다.

- z-index/오버레이 스택 계약(Dropdown·Popover·Drawer·Modal·Palette·Toast).
- 상태 갤러리 / Storybook(정상·빈값·권한 없음·긴 한글·부분 실패, 토큰·상태 분류 시각 확인).
- 시간역(timeDomain) 매핑 관리 화면 — 복수 설비 병합을 제공하면 필수.
- 지연 완료·정정/backfill 후보 목록 화면.
- 운영 이벤트 뷰어(적재 중단·mart 실패 — 원천이 확인한 사건만).
- 비동기 작업 모니터(내보내기·재집계 상태·취소).
- 마스터 필드 원천 소유권 설정 화면.
- 사용자 온보딩(첫 Scope 선택, Context 개념 안내).
- 메뉴 간 연결 행렬(출발/목적지별 적용·보존·미지원·권한)을 계약 문서에 첨부.
- 공통 키보드 단축키 레지스트리.
- 환경 배너(staging/prod)와 메타데이터 쓰기 경고.
- 레지스트리 필드로 메뉴 점진 노출(feature flag).
- 차트 타입 레시피·허용 목록(시계열·분포·히트맵·구간 타임라인).
- 도식은 도메인 컴포넌트로 유지(반복 확인 전 범용 다이어그램 엔진 금지).
- 접근성 릴리스 게이트(색만으로 상태 구분 금지).
- 브라우저 지원 매트릭스(→ #151).
- 플랫폼 메타 DB 백업/복구 전략(감사·지표 버전 이력).
- 운영 관측/runbook(API 실패·쿼리 지연을 Correlation ID로 연결).
- 쓰기 동시성/중복 실행 정책(마스터 수정, 지표 발행, VOC 전이, backfill 충돌).

## 다른 저장소에서 가져올 수 있는 것 (2026-09-22 조사)

채택 결정이 아니다. 관련 기능 수요가 생길 때 다시 본다.

| 저장소 | 참고할 것 | 확인할 점 |
| --- | --- | --- |
| FileGateway | 설비·기간 기준 원본 로그·설정 파일 조회 | 원문 조회 수요, 권한 전달, wall-clock 매핑. 원문 drill-through는 05에서 defer |
| ProjectGraph | 원본 필드 → 변환 → 출력 컬럼 계보 | 정적 분석과 실행 데이터 구분 |
| standard-log-lifecycle | 모델·검증 회차·결함·재검증 흐름 | 원본 `hjung3113/standard-log-lifecycle` @ `2d2dce25087a6a7b469e60fde448a76b29055041` |
| log-contract-lens | 원본 줄 → 추출 필드 → 진단 근거 | 구현 없음 |
| jira-voc-nexus | 이벤트 재처리 방지, 근거 제한 답변 | 로컬 POC |
| vocpage | 알림 수신자·읽음·반복 억제, 목록/상세 UX | FeedbackOps와 중복 제외 |
| system-survey | 임시저장·첨부·댓글 설문 흐름 | FeedbackOps Survey와 중복 |
