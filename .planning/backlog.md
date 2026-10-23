# 백로그 — 이슈로 올리지 않은 것

우선순위가 낮거나 수요가 확인되지 않은 일이다. 착수하려면 먼저 GitHub 이슈로 올리고 이 줄을 지운다.

## 작은 후속 (확인된 것)

- **구현 안 함 — `defineEntity`(엔티티 타입 → 권한·site 범위 선언, #671 B8):** 이유: 선언을 읽을 곳이 mock 하나뿐이고(실서버는 TS를 못 읽고, ADR-0072 방향상 엔티티 어휘는 앱 것), `server-conformance`는 이미 매핑을 하네스 입력(`entity: { ref, permission }`)으로 받는다. 다시 볼 조건: 메뉴 선언에서 엔티티 게이트를 읽는 곳이 둘 이상 생길 때(사내 실서버가 선언 사본으로 판정, 또는 Kernel이 `getEntity` 전에 권한을 거를 때).
- **구현 안 함 — deprecated 포트 `contextOptions`·`evaluateSelection` 제거(#671 B8):** 이유: 셸 live 바(`GlobalContextBar.tsx` 조건 편집기·"조건 밖 n대")가 아직 쓰고, 새 포트에는 "선택했지만 조건 밖" 판정이 없어 화면·UX 결정(프로토타입 컨펌)이 필요하다. 다시 볼 조건: 사내 실서버가 selection 경로 구현을 시작하기 전, 그리고 live 바 편집기를 QueryBar 편집기로 바꾸는 시안이 컨펌된 뒤.
- **구현 안 함 — 알림 목적지 연결(#651):** 플랫폼의 알림 페이지는 VOC·Task·권한 승인 대상 알림을 링크 없이 그린다(이음매 `canLink`가 항상 `false`; 읽음·보관 동작은 그대로). 이유: 이 대상들의 플랫폼 목적지(내 VOC 상세, 운영 화면)가 아직 없다. 다시 볼 조건: #654 내 VOC(`view=my&selected`) 또는 #595 운영 화면이 목적지를 만들 때. 팝오버(#652)의 행도 같다 — 목적지가 생기면 팝오버 행 링크를 누를 때 팝오버를 닫는다.
- **구현 안 함 — 알림 팝오버 `모두 읽음`(#652):** 이유: FeedbackOps 백엔드에 일괄 읽음 경로가 없고 `POST /notifications/:id/read`만 있다. 보이는 10건만 읽으면 "모두"가 거짓이 된다. 다시 볼 조건: FeedbackOps에 일괄 읽음 경로를 둘 때.
- **구현 안 함 — 설문·권한 요청 배지(#652):** 설문은 화면이 생겼다(#653). 이유: FeedbackOps에 "응답할 설문 수" 읽기가 없다(`/me/answerable-surveys`는 페이지 목록이고 nav counts는 `surveys.all`뿐). `notifications` 슬롯은 메뉴 하나의 수만 싣는다. 다시 볼 조건: 응답할 설문 수를 읽는 FeedbackOps 경로, 그리고 메뉴별 수를 싣는 슬롯. 권한 요청은 #657.
- **구현 안 함 — 알림에서 설문으로 진입(#653):** 이유: FeedbackOps 알림 event type에 설문 요청이 없다(`notificationEventTypeSchema`). 다시 볼 조건: FeedbackOps가 설문 요청 알림을 낼 때 — 그때 이음매 링크에 그 대상을 더한다.
- **구현 안 함 — 설문 응답 머리의 담당 조직·마감·D-day(#653, 시안 m-8):** 이유: FeedbackOps 응답 양식에 그 필드가 없다. 다시 볼 조건: FeedbackOps 설문에 마감·담당 필드가 생길 때.
- **구현 안 함 — 설문 제출 뒤 `원래 화면으로 돌아가기` 머리 링크(#653, 시안 m-8b):** 지금은 Kernel `ReturnLink`(`← <출발 메뉴>`)가 페이지 머리 `더보기` 안에 있다. 이유: 문구와 노출 위치를 바꾸려면 Kernel `ReturnLink`·`PlatformPage`의 모든 메뉴 동작이 바뀐다. 이번 이슈는 기존 복귀 패턴을 따랐다. 다시 볼 조건: 복귀 링크를 머리에 바로 보이게 하자는 요청이 메뉴 두 곳 이상에서 나올 때.
- **구현 안 함 — FeedbackOps raw-fetch API 모듈의 `/api/fo` 기준 경로(#651):** `lib/api/actors.ts`·`analytics-areas.ts`·`auth.ts`·`managed-systems.ts`·`nav.ts`·`permissions.ts`는 `client.ts`의 `sendRequest`를 거치지 않고 `fetch(`를 직접 부른다. 다리 진입점의 그래프에 들어 있지 않아 이번에는 건드리지 않았다. 다시 볼 조건: 그 모듈을 쓰는 첫 옮기는 화면(예: #657의 `permissions.ts`). 그래프 테스트(`menus/_global/my-activity/src/fo-entry-graph.test.ts`)가 `client.ts` 밖의 `fetch(`가 그래프에 들어오면 실패한다.
- **구현 안 함 — FeedbackOps 린터 통일(#642):** FeedbackOps는 Biome·oxlint를 그대로 쓰고 플랫폼은 ESLint다. 루트 `lint`는 `@fops/*`를 빼고, FeedbackOps 린트는 `feedbackops.yml`의 `gate.sh static`이 돈다. 이유: #642는 Node·pnpm·lockfile·`@ap/ui` 통일만 맡았고, 린터를 바꾸면 FeedbackOps 전체 파일과 Biome 허용 목록이 바뀐다. 다시 볼 조건: #595가 FeedbackOps 화면을 플랫폼 메뉴로 옮길 때, 또는 두 린터의 규칙 충돌이 실제로 생길 때.
- **구현 안 함 — FeedbackOps 의존 버전 맞추기(#642):** FeedbackOps는 `lucide-react 0.469.0`(플랫폼 1.48), vite 5·vitest 2·typescript 5.7을 그대로 쓴다. lucide는 FeedbackOps용 한 벌이 따로 있다(아이콘은 상태가 없어 동작 문제 없음, 번들 크기만). Radix와 React는 #642에서 플랫폼 버전으로 하나가 됐다. 이유: 버전을 올리면 아이콘 이름·테스트 러너 동작이 바뀌어 #642 범위를 넘는다. 다시 볼 조건: #595가 FeedbackOps 화면을 플랫폼 빌드로 옮길 때.
- **구현 안 함 — 독립 FeedbackOps conductor 스크립트의 Node 22 고정(#642):** `products/feedbackops/.claude/conductor/`의 `verify-fe.sh`·`verify-be.sh`·`ux-prep.sh`·`app-preview.py`·`release-gate.sh`·`conductor.json`·`addenda/impl-rules.md`·`PROFILE.md`는 아직 `/opt/homebrew/opt/node@22/bin`을 쓴다. 플랫폼 웨이브는 이 스크립트를 쓰지 않고(`.agents/conductor/`의 fo 모드), 쓰는 것(`verify-db.sh`, `visual.sh`)은 #642에서 Node 26으로 맞췄다. 이유: 독립 앱용 흐름(`FOPS_MAIN`, develop 기준)이라 #597에서 은퇴한다. 다시 볼 조건: 이 스크립트 중 하나를 플랫폼 웨이브에서 다시 쓸 때, 또는 #597.
- **구현 안 함 — 차트 주석 저장·검증·작성자 삭제와 삭제 감사(#622):** `listAnnotations`·`saveAnnotation`·`deleteAnnotation`은 게이트만 있고 항상 `forbidden`이다(주석 표·감사 event type·migration 없음). 이유: `analytics:view`는 아무에게도 부여되지 않고 FeedbackOps에는 site가 없어 모든 호출이 `forbidden`이다. 켤 때 정할 것: ADR-0041의 `reason`·`changes`·`target.scopeId`와 #621 투영(`changes`·`reason` 없음, `scopeId: null`)의 차이, uuid id. `packages/server-conformance` 주석 사례 17건 중 약 8건(저장 후 목록, site 격리, `at`·`id`·`user` 키 → `error`, 작성자·타인 삭제, id 없음 → `empty`)은 그때까지 FeedbackOps로 통과할 수 없다. 다시 볼 조건: site/room 부여(#98, O11) 또는 `analytics:view` 부여가 생길 때.
- **구현 안 함 — 클라이언트 오류 보존 기간(#622):** `platform.client_errors`는 지우는 작업이 없다. 이유: 식별 필드만 있고 개인정보가 없으며 양이 적다. 다시 볼 조건: 표가 약 10만 행을 넘거나 운영·개인정보 요청이 기간을 정할 때.
- **구현 안 함 — `server-conformance`의 `getEntity`·`entityAudit` site 사례와 FeedbackOps 표본(#623):** 묶음의 `PortSamples.entity`와 site 사례는 site가 있는 type을 가정한다. FeedbackOps type은 site가 없고(`scopeId: null`, 값이 있으면 `error`) 묶음은 FeedbackOps 표본으로 통과할 수 없다. 이유: 이 가정을 바꾸는 일은 #623 범위 밖이다. 다시 볼 조건: FeedbackOps가 적합성 묶음을 돌릴 때(#154 B) 또는 묶음에 site 없는 표본 모드가 생길 때.
- **구현 안 함 — 감사 읽기의 opaque id·scope 열(#621, O16):** FeedbackOps `core.audit_log.subject_id`를 text로 바꾸는 일과 `scope_id` 열 추가는 하지 않았다. 이유: FeedbackOps 대상은 모두 uuid이고 `scopeId: null`이며(ADR-0069 결정 9), opaque id나 site 범위를 쓰는 감사 쓰기가 아직 없다. 다시 볼 조건: 플랫폼이 opaque id·scope를 쓰는 type(equipment/metric)의 감사 이벤트를 FeedbackOps `core.audit_log`에 쓰기 시작할 때.
- **구현 안 함 — `AnalysisLayout` 차트 2열 정렬 E2E(#575 3b):** 두 차트가 한 행에 서고 그림 영역 윗변이 맞는지, 하나를 접으면 남은 차트가 전체 폭을 쓰는지 보던 E2E를 내렸다. 사이클타임이 `PanelWorkspace`로 옮겨 가서 `AnalysisLayout` 소비자 중 차트가 둘 이상인 화면이 없다(남은 `OperationTime`은 차트 하나). 접기·칩·기억·포커스 검사는 `OperationTime`으로 옮겨 유지했고 jsdom `AnalysisLayout` 테스트는 그대로다. 이유: 검사할 소비자가 없다. 다시 볼 조건: 어떤 메뉴가 차트 둘 이상으로 `AnalysisLayout`을 채택할 때 — 그 메뉴에서 정렬 E2E를 되살린다.
- **구현 안 함 — 보드 저장 탭 간 경합(#575 1단계 리뷰 C2):** 새 버전 확인과 쓰기 사이에 다른 탭(더 새 빌드)이 쓰면 덮어쓸 수 있다. 이유: 둘 다 같은 동기 실행 안이라 창이 매우 좁고, 막으려면 저장을 Web Locks 비동기로 바꿔야 한다. 다시 볼 조건: 서버 저장(#294)이나 여러 빌드가 동시에 도는 배포에서 보드 손실이 보고될 때.
- **구현 안 함 — dock 칸 머리 줄이기의 배경 탭 최소 폭(#575 2c 수정 점검 F1):** 340px 판정에서 배경 탭 최소 폭을 상수 136px로 둔다(측정값 약 132px). 이유: 관찰된 진동이 없고 여유가 약 4px다. 다시 볼 조건: 다른 로캘·글꼴에서 칸 머리가 한 줄과 두 줄 사이를 오갈 때.
- **구현 안 함 — dock 닫기 뒤 칸 추가의 읽기 순서(#575 2c 판정 Noticed):** 칸을 닫은 뒤 `칸 추가`로 2×2가 되면 1 3 / 2 4로 읽힌다(`기본 배치`를 누르면 1 2 / 3 4). 이유: 배치를 바꾼 상태의 추가 규칙(가장 큰 그룹을 긴 쪽으로 나눔)대로이고 `기본 배치`로 바로 정리된다. 다시 볼 조건: 사용자가 칸 번호와 위치가 어긋난다고 보고할 때.
- **구현 안 함 — 빈 칸 탭의 ✕(#575 2c 판정 Noticed, 사용자 질문):** 빈 칸 탭에도 ✕를 두고 `칸 N 닫기`+실행 취소로 쓰자는 제안. 이유: ✕=비우기 결정(사용자 2026-10-21)을 넓히는 일이라 사용자 결정이 필요하다. 다시 볼 조건: 사용자가 요청할 때.
- **구현 안 함 — `balanced`에서 요약 KPI 4개·분포 그림이 한 화면에 안 들어옴(#575 3b UX U1/U2):** 1440×900에서 요약은 KPI 2개, 분포 그림은 패널 접힘 아래다. 이유: 세로 공간을 페이지 머리가 쓰고(#680) 추세 그림 300px 이상(ADR-0067 인수)을 지키면서 요약과 분포를 900px에 모두 넣는 배치가 없다. 다시 볼 조건: #680이 병합되면 다시 재서 `balanced`를 조정한다.
- **구현 안 함 — 점 클릭·히스토그램 동작이 배경 탭의 느린 실행 목록을 걸러도 탭을 앞으로 올리지 않음(#575 3b UX U5):** 지금은 `bucket`/구간 칩이 걸러진 상태를 보인다. 이유: 패널을 보이게 하는 façade API가 필요하고 두 번째 소비자(#586 HW Time, ADR-0067 결정 22 Candidate)와 함께 설계한다. 다시 볼 조건: #586 브리프.
- **구현 안 함 — 느린 실행 표의 이중 스크롤(#575 3b UX U10):** `PlatformDataTable`에 컨테이너를 채우는 높이 모드가 없어 420px 고정 표 스크롤이 패널 본문 스크롤 안에 든다. 이유: 표 높이 계약(ADR-0037)을 바꾸는 일이다. 다시 볼 조건: 표 fill 모드가 생기거나 두 번째 workspace 소비자가 패널에 표를 둘 때.
- **구현 안 함 — 보드 칸 ⋯의 꺼진 프리셋 이유 문구(#575 3b CHECK2 C1):** 좁은 폭에서 작업 영역 도구줄의 프리셋은 꺼지고 이유가 붙지만, 보드 칸 ⋯ 메뉴의 같은 라디오는 꺼지기만 한다. 이유: `WorkspaceCommand`에 이유 필드가 없어 명령 계약을 넓혀야 하고, 보드 칸은 대부분 좁아 늘 꺼진 메뉴가 된다. 다시 볼 조건: 두 번째 소비자(#586)가 명령 계약을 바꿀 때 함께.
- **구현 안 함 — 탭 초점 재시도 함수 하나로(#575 3b CHECK2 C2):** `@ap/components/dock` 내부 `focusTabSoon`과 보드 `BoardDock.tsx`의 `focusSoon`이 같은 재시도 루프다. 이유: 보드 쪽을 바꾸면 이번 범위 밖의 보드 초점 동작을 다시 검증해야 한다. 다시 볼 조건: 둘 중 하나에 초점 재시도 결함이 생기거나 보드 초점 코드를 고칠 때 — 그때 `./dock`에서 공개해 보드가 쓰게 한다.
- **구현 안 함 — 소개 사이트 보드 캡처(#575 2c):** 기본 렌더러가 dock이 되어 `site/scripts/shots.mjs`의 보드 캡처가 지금 사이트 그림과 다르게 나온다. 이유: 사이트는 별도 갱신 주기다. 다시 볼 조건: 다음 사이트 갱신 때.
- **구현 안 함 — 소개 사이트 잔여 관찰(#607 리뷰):** 모바일 목차 summary가 브라우저 기본 ▶ 표식이다. 부록 L74(도식 A 설명)는 본문에서 빠진 도식을 서술하며 "진행 중" 표기가 남아 있다. 이유: #607 범위의 사실·흐름 수정 밖의 표식·부록 정리다. 다시 볼 조건: 다음 사이트 갱신 때.
- **구현 안 함 — 차트 카탈로그 레일 폭·열림 저장:** 메뉴 코드는 웹 저장소를 쓸 수 없고(lint), 공개된 패널 선호 저장 도구가 없어 페이지에 머무는 동안만 유지한다. 다시 볼 조건: #575가 컴포넌트 소유 패널 선호 저장을 제공할 때.
- **구현 안 함 — 차트 카탈로그 드릴 행(#541):** `pointActivation`·`pointActions` 드릴 조각은 있지만 카탈로그의 line/bar는 아직 지점 활성화를 목적지로 연결하지 않는다. 이유: 카탈로그 견본에서 드릴 소비를 미루기로 했다. 다시 볼 조건: 카탈로그나 다른 메뉴가 차트 드릴을 처음 쓸 때.
- **구현 안 함 — 최근 조건 저장 위치(local-only vs server sync, #554 §5):** local-only와 서버 동기화 중 파일럿 저장 위치를 결정 대기로 남긴다. 이유: 파일럿의 공용 PC 잔존·다기기·보존 정책이 확정되지 않았다. 다시 볼 조건: 파일럿 오픈 전 또는 두 번째 호스트가 이력을 공유해야 할 때.
- **구현 안 함 — ContextKey 필드 대응표 통합(A-Q7, #591):** contracts·kernel·shell의 ContextKey→GlobalContext 필드 표가 중복된다. 이유: 일부 표는 membershipBasis까지 포함해 의미가 같지 않다. 다시 볼 조건: 새 ContextKey가 추가되거나 두 번째 소비자가 하나의 공유 대응표를 필요로 할 때.
- **구현 안 함 — 조회 바 문구 모듈화(A-Q8, #591):** QueryBar와 QueryHistoryControl의 인라인 ko/en 문구를 한 모듈로 모으지 않는다. 이유: 현재 소비자는 하나의 Apply 메뉴다. 다시 볼 조건: 두 번째 Apply 메뉴가 추가될 때.
- **구현 안 함 — QueryHistoryStore SDK 승격(A-Q9, #591):** 브라우저 로컬 이력 구현은 현재 앱에 둔다. 이유: local-only와 서버 동기화 중 위치 결정이 열려 있다. 다시 볼 조건: 저장 위치가 local-only로 확정되거나 다른 호스트가 재사용 가능한 저장소를 필요로 할 때.
- **구현 안 함 — LaneTimeline 렌더러 효과 의존성 정리(B-Q8, #591):** props 객체가 바뀔 때마다 렌더러·옵저버·이벤트 리스너를 다시 만든다. 이유: 관찰된 성능/상호작용 결함이 아직 없다. 다시 볼 조건: 대량 구간 화면에서 재생성 비용이나 끊김이 재현될 때.
- **구현 안 함 — 차트 카탈로그 ECharts 테스트 경계(B-Q9, #591):** 메뉴 테스트가 components 패키지 안의 pnpm 설치 경로를 mock한다. 이유: 현재 한 테스트만 쓰는 경로이며 실제 실패는 없다. 다시 볼 조건: 다음 차트 메뉴 테스트를 만들거나 패키지 배치가 바뀔 때.
- **구현 안 함 — AnalysisChart kind 투영(B-Q10, #591):** `topNBar` 전용 분기 여섯 곳을 공통 kind 투영으로 옮기지 않는다. 이유: 현재 kind에서 동작하고 다른 kind가 같은 처리를 요구하지 않는다. 다시 볼 조건: 다음 kind가 접기/전용 높이를 추가하거나 반복 수정이 생길 때.
- **구현 안 함 — Apply idle 안내와 적용 요약(UX-1, #591):** 첫 적용 전 idle 카드와 적용 조건 줄은 현재 상태 모델을 유지한다. 이유: 이를 고치려면 idle·초안·적용 상태 계약을 바꿔야 한다. 다시 볼 조건: 두 번째 Apply 메뉴가 생기거나 idle 모델을 바꾸기로 결정할 때.
- **구현 안 함 — 차트 종류 탭 1280px 넘침(UX-6, #591):** 탭의 가로 넘침과 스크롤바를 그대로 둔다. 이유: 현재 종류 수와 화면 크기에서 재현되는 표시 문제이나 슬라이스 마감 범위를 넘는다. 다시 볼 조건: 종류 수가 늘거나 반응형 탭 UI 범위가 열릴 때.
- **구현 안 함 — TopN 전용 본문 접기(UX-8, #591):** TopN의 텍스트 접기 버튼을 다른 차트 종류와 통합하지 않는다. 이유: 다른 종류에는 같은 접기 동작이 없다. 다시 볼 조건: 다른 종류에도 접기 동작이 생기거나 사용자가 통합을 요청할 때.
- **구현 안 함 — 슬라이스 18 Noticed 관찰(영역 A·B·UX, #591):** A: −24h 기본 기간 규칙 중복, mock selection 기본 축 라벨 차이, 공개 `compareHistoryText`의 kernel-only 사용, `defaults()` 중복 호출, pane draft/extension Provider가 같은 키를 공유한다. B: `Select` import와 native `<select>` 혼용, 응답에 존재하지 않는 legacy `topNBar`/`lane` 필드, `isCatalogKind` 중복 계산, `laneDiagnostic`/`chartDiagnostic` 유사성, wall-clock `replace('T', ' ')` 분산. UX: 펼친 바 652px로 첫 결과가 900px 아래에 놓임, 접힌 요약 중복, 칩 제거 이름 어순, ComboBox 자리표시자 잘림, `aria-pressed` 토글의 시각 구분 부족, dialog 이름 누락(listbox는 이름 있음), Lane 스크롤 div의 무동작 Tab 정지점, 기존 uppercase `전역 CONTEXT`. 이유: 묶음 관찰이며 차단 결함이나 반복 장애로 확인되지 않았다. 다시 볼 조건: 항목이 재현되는 결함이 되거나 관련 리팩터링 범위에 들어올 때.

- **구현 안 함 — 실제 소속 이력 평가(#552, ADR-0059):** mock에는 과거 소속 원천이 없어 이력 가능 축도 현재 소속으로만 대신한다. PRC-only asOf는 새 포트에서 거부한다. 다시 볼 조건: 실제 이력 원천/어댑터 연결 때 [from,to) 중 소속 합집합과 다중축·부모 시간 경계를 검증한다.
- **구현 안 함 — legacy 조건/Selection 포트 제거(#552):** 셸 바가 기존 포트를 소비하므로 contextOptions·evaluateSelection을 deprecated로 유지한다. 다시 볼 조건: #553 조회 바를 포함한 모든 소비자 전환·호환 검증 완료.


- **구현 안 함 — 차트 옵션 캐시의 실행 중 테마 변경 반영(#560 리뷰 C1):** `AnalysisChart`는 옵션을 입력으로 캐시하므로 CSS 토큰 값이 실행 중에 바뀌면 같은 입력의 재렌더에서 캔버스가 이전 색을 유지한다(범례만 새 색). 이유: 지금은 실행 중 테마 전환 경로가 없다(단일 라이트 테마, 다크 테마는 범위 밖). 다시 볼 조건: 다크 테마나 실행 중 테마 전환이 생길 때 — 해석된 색 서명을 캐시 키에 넣는다.
- **구현 안 함 — 차트 종류의 단일 렌더 경로(#560 Q8):** heatmap·donut과 나머지 종류의 투영 경로를 합치지 않는다. 이유: 현재 동작을 유지하는 품질 정리 범위를 넘는다. 다시 볼 조건: 여섯 번째 차트 종류가 생기거나 두 경로에 같은 수정을 해야 하는 결함이 발생할 때.
- **구현 안 함 — brush 테스트를 한 `it.each`로 통합(#560 Q9):** 이유: 기존 시나리오 단언을 유지하며 이번에는 공통 mount만 추출한다. 다시 볼 조건: 다음 brush 가능 종류를 추가할 때.
- **구현 안 함 — 공통 범례 swatch·공개 `chartTheme()` 범주 순서(#560 Q10):** 이유: 현재 외부 소비 수요가 없으며 네 범례 구현의 통합은 별도 범위다. 다시 볼 조건: 컴포넌트 밖 소비자가 범주 순서를 필요로 하거나 네 복사본 중 하나에 범례 결함이 생길 때.
- **구현 안 함 — 클래스 소비자 없는 Tailwind `--color-chart-*` 별칭 정리(#560 Noticed):** 이유: 현재 출력 결함이 없고 토큰 공개 범위 정리가 필요하다. 다시 볼 조건: 차트 토큰 또는 해당 클래스 소비자를 바꿀 때.
- **구현 안 함 — Checkbox 내부 상태를 CSS `data-state`로 대체(#560 Noticed):** 이유: 현재 일부 선택 표시가 동작하며 ui 내부 구현 변경은 이번 범위 밖이다. 다시 볼 조건: 다음 Checkbox 변경 때.
- **구현 안 함 — 차트 행 키 인코딩 통일(#560 Noticed):** 이유: 현재 문자열·JSON 태그 혼용으로 인한 충돌이 확인되지 않았다. 다시 볼 조건: 키 충돌이 발생할 때.

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
- **구현 안 함 — 보드 `defaultQuery`의 `?` 분리 정리(#534 F3 나머지):** `paneActions.defaultQuery`가 최근 화면 URL에서 `?` 뒤의 query를 잘라 Context를 구한다. 이유: 현재는 한 helper의 Context 추출이고 공통 URL 도우미가 필요한 근거가 없다. 다시 볼 조건: 다른 기능에서 같은 Context 추출 규칙을 공유해야 할 때.
- **구현 안 함 — 분석 보드 서버 저장·공유·여러 보드(#421):** 1차는 브라우저 저장·사용자당 보드 하나다. 이유: 사용자 설정 쓰기 포트와 저장소 소유자가 없다. 다시 볼 조건: 쓰기 포트·저장소 소유자 결정(#155·#157), 또는 다른 기기에서 같은 보드를 쓰자는 요구. 공유 때 권한은 받는 사람 기준으로 칸마다 다시 판정.
- **구현 안 함 — 분석 보드 시트 복제·칸 묶음(#421):** 이유: 1차는 일괄 적용·복사 동작으로 충분하다. 다시 볼 조건: 같은 시트를 반복해 다시 만드는 사용이 확인될 때.
- **구현 안 함 — 분석 보드 서버 동시 실행 상한·캐시(#421):** 이유: mock에서 정한 값은 근거가 없다. 다시 볼 조건: 실서버 연결(#154).
- **구현 안 함 — 분석 보드 자체 사용 계측(보드 열기·시트 수·칸 수, #497a):** 칸 하나가 열릴 때의 메뉴 사용은 이미 `source: 'board'`로 센다. 이유: `UsageEvent`는 `menuId`·`path`가 필수인 메뉴 사용 모양(`entry`/`dwell`)이라 보드 화면 자체를 넣으려면 이벤트 이름이나 필드를 늘리는 계약 변경이 필요하고, 새 포트를 만들지 않기로 했다. 다시 볼 조건: 보드 사용 지표가 필요해질 때 — `UsageEvent` 확장 여부를 사용자에게 올린다(docs/05, docs/16 §7).
- **구현 안 함 — 코드 이름 `usePlatform().global` → 칸 Context(ADR-0049):** 이유: 메뉴 전체에 닿는 이름 바꾸기라 보드 구현과 따로 한다. 다시 볼 조건: 정비 슬라이스.

- **구현 안 함 — 분석 보드 Context 바에 `모든 칸에 적용`도 두기(#421 UX 리뷰 제안):** 바에서 선택 칸 조건을 편집한 뒤 바로 퍼뜨리는 흐름이 짧아진다. 이유: 16 §4가 칸 머리 `⋯`로 정했고 1차에 꼭 필요하지 않다. 다시 볼 조건: 1차 사용에서 바 편집 → 일괄 적용이 잦다고 확인될 때(소유자 OK 필요).

- **구현 안 함 — transient overlay 숨김 규칙 단일화와 공개 범위(#568 Q7):** 숨김 시 닫힘이 ui Root·Content·autofocus와 셸 수동 초기화 네 겹으로 구현됐고, 보드 개념이 `@ap/ui` 루트 API에도 공개돼 있다. 이유: Radix 래퍼 여섯 개와 셸 overlay 동작, SDK 경계를 함께 바꾸는 별도 작업이다. 다시 볼 조건: 숨긴 칸에서 overlay가 남는 결함이 생기거나 보드 밖의 scope 재사용 요구가 생길 때.
- **구현 안 함 — 칸 기하 계산을 `layout.ts`로 이동(#568 Q8 나머지):** `BoardScreen`에 `stackedHeights`·`gridHeight`·`panePlacement`과 구분선 위치·값 계산이 남아 있다. 이유: 순수 계산 추출과 jsdom 기하 테스트 교체가 기계적인 `layoutShape` 중복 제거를 넘는다. 다시 볼 조건: 배치·최대화 동작을 바꾸거나 기하 계산에 새 소비자가 생길 때.
- **구현 안 함 — 포커스 가능 대상 판정 통합(#568 Q9):** 셸 네 곳과 `DetailDrawer`에서 연결·`inert`·`hidden`·`aria-hidden` 판정이 조금씩 다르다. 이유: 판정 차이를 먼저 결정하고 컴포넌트에서 셸로 새 공개 API를 연결해야 한다. 다시 볼 조건: 포커스 복귀 결함이 생기거나 공유 판정을 요구하는 두 번째 소비자가 생길 때.
- **구현 안 함 — 보드 영어 `contextMoreName` 단·복수 문구:** 영어 접근성 이름이 count 1에도 항상 `conditions`를 쓰고 문자열을 이어 붙인다. 이유: 동작 결함 없이 영어 문구 정리 범위를 따로 두었다. 다시 볼 조건: 보드 영어 문구를 검토하거나 단수형 관련 신고가 들어올 때.
- **구현 안 함 — components 테스트의 storage stub 세 곳:** `ManagementLayout.test.tsx`·`AnalysisLayout.test.tsx`·`PageFilterBar.test.tsx`가 storage stub을 직접 만든다. 이유: 테스트 fixture 정리는 이번 동작 없는 소스·문서 정리와 별개다. 다시 볼 조건: 세 테스트의 저장 동작을 다시 손보거나 공통 fixture 정리 작업을 할 때.
- **구현 안 함 — ADR-0047 보충의 React DOM 내부 함수 근거:** 보충 문장이 `react-dom-client.development.js`의 내부 함수 이름과 commit 순서에 기대고 있다. 이유: 결정 계약은 유지하고 구현 근거 문구 정리는 별도 문서 변경으로 둔다. 다시 볼 조건: React DOM 업그레이드로 순서 근거를 다시 확인하거나 ADR-0047을 수정할 때.
- **소유자 결정 후보 — 보드 테스트의 px·mount 횟수 단언(#568):** `BoardScreen.test.tsx`의 `narrow stacking`·`pane sizing`에서 `--pane-height`·`--board-height` px 문자열 단언은 `layout.test.ts`·E2E 기하 행렬과 겹치고, `stateful Outlet presentation lifetime`에는 mount 호출 횟수 단언 열두 개가 있다. 테스트 삭제·대체 여부는 정하지 않았다. 다시 볼 조건: 소유자가 중복 단언의 삭제·유지·대체를 결정할 때.

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

- **구현 안 함 — 분석 보드 자유 창 배치**: 떠다니거나 겹치는 창·모서리 자유 resize·별도 OS 창은 #536의 사용자 선택 D에서 제외했다([ADR-0060](../docs/adr/0060-analysis-board-pane-sizing-collapse-maximize.md)). 이유: 고정 비교 공간을 넘어 창별 포커스·z-index·저장 모델을 늘린다. 다시 열 조건: 실제 고정 그리드 사용에서 배치 제약이 반복 보고될 때.

- **구현 안 함 — #553 1024px 미만 모바일 전용 조회 바 재설계:** 기본 줄바꿈·포커스 접근만 유지한다. 이유: 현재 DESIGN.md 데스크톱 범위와 위임된 시안 밖이다. 다시 열 조건: 모바일 배포 범위가 승인될 때 실제 앱 시안으로 좁은 화면 편집·보드 동작을 결정한다.

- **구현 안 함 — #553 idle 안내의 필수 항목 이름 통일:** 조회 바는 `공정`, 본문 idle 사유는 Kernel 공용 라벨(`CONTEXT_LABELS`)의 `room_name`으로 같은 항목을 다르게 부른다(UX 재확인 W-553B-UX2 UX-1, 경미). 이유: 공용 라벨을 바꾸면 Context 바·내보내기·오류 문구 등 모든 화면 표기가 함께 바뀌어 별도 문구 검토가 필요하다. 다시 열 조건: 다음 문구 정리 PR 또는 조회 바를 두 번째 메뉴에 적용할 때.
- **구현 안 함 — 권한 없는 값을 주소에 직접 넣었을 때 조건 표시:** 데이터는 서버가 막지만 조건 칩·요약에는 입력한 값 문자열이 남는다(main과 같은 기존 동작, W-553B-UX2 Noticed). 이유: 새 누출이 아니고 표시 정책(숨김 vs "사용할 수 없음")은 #554 이력 복원의 무효값 표시와 함께 정하는 편이 맞다. #554는 이력 행에만 "현재 사용할 수 없음"을 적용했고 주소 칩 표시는 바꾸지 않았다(2026-10-21). 다시 열 조건: 조회 바를 두 번째 메뉴에 적용할 때.
- **구현 안 함 — 히트맵 날짜 축 라벨 겹침:** 차트 카탈로그 히트맵(main)의 날짜 축 라벨이 1440에서 겹친다(#576 UX 리뷰 Noticed, 기존 동작). 이유: #576 범위 밖의 기존 차트 수정. 다시 열 조건: 히트맵을 다음에 고치거나 레인과 같은 정시 눈금 규칙을 다른 시간축에 넓힐 때.
- **구현 안 함 — #594 사용자 메뉴의 'FeedbackOps 전체' 링크 제거:** ADR-0070이 레일에서 사용자 메뉴로 옮겼다. 이유: 담당자가 셸 안에서 피드백 운영으로 들어갈 길이 아직 없다. 다시 열 조건: #595가 피드백 운영 시스템 진입을 만들 때.
- **구현 안 함 — #594 운영자 상세의 미저장 편집과 VOC 등록 드로어 전환:** ADR-0070은 오른쪽 패널을 하나만 두고 초안을 지키게 했고, #594는 신고자 상세까지만 다룬다. 이유: 운영자 상세 편집 화면은 #595에서 옮긴다. 다시 열 조건: #595 운영자 상세가 들어올 때.
- **구현 안 함 — #594 내 설문 응답 이력 읽기(`mySurveyHistory`):** FO 백엔드에 응답자 이력 읽기가 없다. 이유: 새 백엔드 읽기는 #594 화면 이전 범위 밖이다. 다시 열 조건: FO 백엔드가 응답자 이력 읽기를 더할 때.
- **구현 안 함 — #594 mock 미리보기의 FO 화면 가짜 전송:** mock 조립에서 FO 화면은 "실서버 필요" 상태만 보인다(#594 계획). 이유: FO 흐름은 FO 단위 테스트와 `dev:real` 미리보기가 덮는다. 다시 열 조건: 플랫폼 E2E가 FO 흐름을 검증해야 할 때.
- **구현 안 함 — #650 1024px에서 플랫폼 사이드바를 펼친 `/voc` 표의 가로 스크롤:** 사이드바 240px만큼 본문이 줄어 내 VOC 표의 `마지막 업데이트` 열이 스크롤 밖으로 간다(W-650 UX-1, 1440 미만 기본은 접힘). 이유: 이 화면(MyVocHistory)은 #654가 FO 화면으로 바꾼다. 다시 열 조건: #654의 새 내 VOC 화면을 1024px 펼침 상태로 확인할 때.
- **구현 안 함 — 보드 grid 렌더러·V1 읽기·백업 키 제거:** `dock`이 기본값이 된 뒤 `board.layoutEngine='grid'` 대체 렌더러, V1 저장값 읽기·이행, V1 백업 키를 한 릴리스 동안 남긴다([ADR-0067](../docs/adr/0067-dockview-layout-engine-board-v2.md) 구현 순서 4). 이유: V1 저장값을 되돌릴 길을 한 릴리스 동안 지킨다. 다시 열 조건: `dock` 기본값이 들어간 다음 릴리스가 나가면 셋을 함께 지운다.
- **구현 안 함 — `FO ADR-NNNN` 표기 일괄 정리와 GLOSSARY 옛 항목:** 플랫폼 문서·주석 약 39곳(10파일: docs/06·INDEX·03·15·integration·`site/SOURCES.md`·`prototypes/`, `packages/ui/AGENTS.md`)이 아직 "FeedbackOps ADR-NNNN"으로 적고, GLOSSARY의 전체 협업 허브·시트·칸 항목은 ADR-0066·0067 이전 설명이다. 이유: docs/06·GLOSSARY를 #575·#650·#651이 고치는 중이라 이번 문서 정리(2026-10-22 리뷰 후속)에서 줄 단위로만 고쳤다. 다시 열 조건: #575 3b와 #651이 병합된 뒤 한 PR로.
- **구현 안 함 — Tailwind 기본 팔레트 제거(`--color-*: initial`):** #670 D3(사용자 2026-10-23). 이유: `ap/no-color-var-shorthand`(#659)와 `shadcn/no-raw-colors`가 기본 팔레트 사용을 이미 lint로 막고, 지금 사용은 0건이다. 다시 열 조건: 다크 테마나 토큰 체계 개편을 시작할 때, 또는 기본 팔레트 사용이 lint를 빠져나가 코드에 들어온 것이 보일 때.
