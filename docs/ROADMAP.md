# 로드맵 — 한 일, 하는 일, 남은 일

> 이 문서가 진행 상황의 한 페이지 요약이다. 체크리스트로 보는 진행률은 고정 이슈 [로드맵: 플랫폼 작업 전체 진행 상황 (#63)](https://github.com/hjung3113/analytics-platform/issues/63), 트랙별 진행률은 [마일스톤](https://github.com/hjung3113/analytics-platform/milestones). 세부는 각 이슈에 있고, 이슈가 닫히면 이 문서도 같은 PR에서 고친다(AGENTS.md "작업 관리"). 마지막 갱신: 2026-10-01.

## 무엇을 만드나

분석 메뉴가 아니라 **메뉴들이 얹힐 플랫폼**을 만든다. 실제 메뉴는 사내에서 새로 만든다. 여기 있는 메뉴 화면은 플랫폼이 제대로 동작하는지 확인하는 견본이다.

**MVP는 데스크톱 웹만 지원한다(모바일 제외, 2026-09-27 결정).**

플랫폼이 제공하는 것은 다섯 갈래다: Kernel 기능(메뉴 등록·전역 Context·딥링크·권한·감사), 공통 컴포넌트, 차트 계약, 레이아웃 5종, 메뉴 간 연결.

## 지금 어디까지 왔나

| 단계 | 상태 | 내용 |
| --- | --- | --- |
| 1. 계약 문서 | 완료 | 다섯 갈래의 규칙(`docs/00`–`13`, 핵심은 `06_platform_ui_contract.md`) |
| 2. 프로토타입 | 완료 | Kernel 단위 프로토타입(`prototypes/`) → 통합 앱 |
| 3. 코드 정리(모노레포) | 완료 | 패키지 분리, 메뉴 패키지, 경계 lint, 메뉴 생성기 — PR #16–#32 |
| 4. 플랫폼 기능 추가 | 완료 | 공간(워크스페이스), 운영 콘솔, Kernel 잔여, 차트 번들 코드 분할(#48)까지 완료 — 마일스톤 M1 |
| 5. 디자인 시스템 | **보류** | FeedbackOps 디자인 개선 확정 뒤 재개. 그 디자인을 기반으로 삼고 플랫폼 확장 패턴을 더함 — 마일스톤 M2 |
| 6. FeedbackOps 연결(1단계) | 결정 대기 | 딥링크·토큰 공유·읽기 전용 조회 — 마일스톤 M3 |

## 지금 바로 시작할 수 있는 것

선행 이슈가 없는 것들이다. 위에서부터 추천 순서.

1. **틈틈이 목록**: ~~`@types/node` 부채 (#57)~~ 완료, ~~CSS selector 비교 CI (#58)~~ 완료 — `tooling/css-selectors` + CI `css-selectors` Job(라벨 `css-removal-ok`), 적재 워커 상태 스키마 초안 (#37) 작성 완료 — `docs/integration/ingest-status-schema.md`, 파서 담당 합의 대기, ~~FeedbackOps 양방향 딥링크 계약 (#61)~~ 완료 — `docs/integration/feedbackops-deeplink.md`(phase-1, 확장은 #81 결정 대기). 계약 안전망은 `pnpm e2e`(#44), 메뉴 활용률 계측(#43)도 완료 — kernel이 `adapter.recordUsage`(entry/dwell)로 계측하고 콘솔은 `usageSummary` 집계만 읽는다(조회조건 수집 여부는 #75 결정 대기).

디자인 방향 프로토타입(#52)은 보류다(아래 M2).

## 사람의 결정

2026-09-27 인터뷰로 6개 모두 정했다(자세한 내용은 [05 결정 상태](05_roadmap_and_open_questions.md)).

| 결정 | 결과 | 풀린 일 |
| --- | --- | --- |
| 인증/SSO (#35) | FeedbackOps 방식(AuthProvider: Mock + OIDC 계열, 서버 세션). 실제 IdP는 사내 SSO 스펙 확인 뒤 | 권한/역할 관리 (#49), ~~변경 감사 (#50)~~ 완료 |
| 운영 콘솔 권한 (#36) | '운영 콘솔 접근' 한 역할로 시작 | 권한/역할 관리 (#49) |
| 적재 워커 스키마 (#37) | 플랫폼이 초안 작성 → 파서 담당과 협의 | 초안 작성 완료(`docs/integration/ingest-status-schema.md`), 파서 담당 합의 뒤 #37 닫고 모니터링 (#51) |
| `space` 필드명 (#38) | `space`, 그룹 수 상한 없음(권장 7개 이하) | 워크스페이스 층 (#41) 확정 |
| 시각 회귀 범위 (#39) | 지금 빌드 CSS selector 비교만 CI, 픽셀 비교는 디자인 확정 뒤 | 시각 회귀 CI (#58) |
| FeedbackOps 연결 (#40) | 쓰기(VOC 등록·설문 제출)는 원본 화면 딥링크 | VOC·설문 조회 (#60), 양방향 딥링크 (#61). 토큰 공유(#59)는 디자인 보류 때문에 대기 |

남은 외부 입력: 사내 SSO의 실제 사양(IdP 설정값), 파서 담당과의 스키마 합의. 권한 부여·회수(쓰기)의 원천 (#98)은 2026-09-29에 절반만 정했다 — room_name 부여·열람 개별 부여는 플랫폼 메타 DB 소유, 역할 소속 원천은 IdP 그룹 claim 사양이 나올 때까지 보류. 쓰기 포트와 화면은 아직 만들지 않는다(권한/역할 화면은 조회 전용).

## 트랙별 전체 목록

### M1 플랫폼 기능 기반

| 이슈 | 선행 |
| --- | --- |
| ~~워크스페이스(공간) 층 (#41)~~ 완료 — 그룹 `space`, `console:access`, 최소 전환기 | — |
| ~~운영 콘솔: Menu Registry 조회 (#42)~~ 완료 — `admin-registry` 메뉴(`pageType: catalog`, pageKeys `sort`/`page`/`focus`), client registry 조회 화면 | #41 |
| ~~운영 콘솔: 메뉴 활용률 계측 (#43)~~ 완료 — `adapter.recordUsage`/`usageSummary` 포트 + 관리 화면 `admin-usage` | #41 |
| ~~플랫폼 계약 자동 검사(E2E) (#44)~~ 완료 — `apps/platform-e2e`, CI `Platform contracts (E2E)` | — |
| ~~Kernel: 화면 상태 URL 등록 (#45)~~ 완료 — 표 `urlState` + 메뉴 page key | — |
| ~~Kernel: 목적지 단건 조회 포트 (#46)~~ 완료 — `getEntity` + `useEntityQuery` | — |
| ~~mock 서버: 메뉴 권한 재검증 (#47)~~ 완료 — `serve({ permission })` | — |
| ~~차트 번들 코드 분할 (#48)~~ 완료 — EChart 구현을 lazy 청크(`EChartImpl`)로 분리, 메인 청크 1.15MB→513KB, 차트 없는 화면은 echarts 청크 미요청 | — |

마일스톤 밖: ~~권한/역할 관리 (#49)~~ 완료 — `/admin/roles` 조회 전용 화면 + 포트 `accessDirectory`(사용자별 권한·사이트별 부여 room, 메뉴는 Registry 클라이언트 조인), 부여·회수의 원천은 #98(room_name·열람 부여는 플랫폼 메타 DB, 역할 소속은 IdP 사양 대기), ~~변경 감사 (#50)~~ 완료 — 전역 `/admin/audit` + 설비 상세 Audit 탭이 같은 mock 저장소(`auditTrail`·`entityAudit`), 지표 이력 통합은 #90, 전역 조회 room 권한은 #91 결정 대기, 모니터링·트레이스 설계 (#51 — 적재 워커 스키마 합의 #37 대기).

### 플랫폼 보강 (2026-09-29 플랫폼 관점 점검, #63 체크리스트)

| 이슈 | 상태 |
| --- | --- |
| ~~Kernel: 라우트 단위 Error Boundary와 오류 보고 포트 (#101)~~ 완료 — 셸 `RouteErrorBoundary`가 메뉴 화면 렌더 실패를 콘텐츠 슬롯에 가두고, `usePlatform().reportError` → 포트 `reportClientError`(식별 필드만)로 보고, 화면에 Correlation ID를 보인다. mock 시나리오 `malformed`로 E2E 재현(총 36) | 완료 |
| ~~Kernel: `linkTo`가 목적지 권한·사이트 경계 초기화·미지원 Context를 처리 (#102)~~ 완료 — `resolveLink`가 `href`·`allowed`(목적지 권한·공간 진입)·`droppedPageKeys`를 돌려주고 Scope가 바뀌면 site 종속 Context를 비운다. 감사 화면의 자체 SITE_BOUNDARY 로직 제거, 지표 사용처는 권한 없으면 사유 표시. E2E 총 38 | 완료 |
| ~~차트 계약: 주석 Scope 격리·manifest features 준수·E2E 검사 (#103)~~ 완료 — 주석은 서버 소유·`(chartId, scopeId)` 키의 포트(`listAnnotations`·`saveAnnotation`, 모듈 전역 저장소 제거), Chart Frame이 Compare·Annotate·Export를 manifest `features`로 게이트, E2E 3건(Brush→구간 적용 확인, 주석 사이트 격리, features 준수; 총 41) | 완료 |
| ~~레이아웃: pageType을 실제 계약으로 (#104)~~ 생성기 부분 완료 — `--page-type`별 06 §12 슬롯 뼈대, 반복 패턴·슬롯 후보 정리(06 §12.6). 레이아웃 슬롯 컴포넌트는 M2 재개 때 프로토타입 컨펌 후 | 생성기 완료, 슬롯 컴포넌트 M2 대기 |
| [결정+설계] 메뉴 데이터 조회 포트: 서버 경계 계약을 mock 밖 contracts로 (#100) — 방향 결정 완료(범용 요청 + 메뉴 선언 + 전송 하나 주입, 2개 화면 검증 → 게이트 → 생성기 → 나머지 이전 → VOC 이전 → `serve` 제거), 설계 [`menu-query-port.md`](integration/menu-query-port.md)(Candidate). 구현 이슈 1–6단계: #110 contracts, #111 mock 엔진, #112 `useMenuQuery`, #113 lint 경계, #114 productivity-overview, #115 execution-detail, 그 뒤 사람 확인 게이트(#117, 2026-10-01 완료). 게이트 뒤 단계 이슈 #125–#133 | 1–6단계 완료(#110–#115: contracts·mock 엔진·`useMenuQuery`·lint 경계·생산성 개요·실행 상세 이전). 사람 확인 게이트 완료(2026-10-01: Q3 비적용 키 거부, Q4 06 §5에 엔드포인트 선언 추가, Q9 적용 키 누락 거부, Q10 등록 규칙 6, 06 §19 명시적 공집합 예외). 7a 요청 모양 엄격화 완료(#125: 비적용 키·적용 키 누락·지표 쌍 깨짐 거부, 등록 규칙 6). 8 생성기 전환 완료(#126: 새 메뉴가 `endpoints.ts`·`src/mock/`·`./mock` export·`useMenuQuery`로 생성, `main.tsx` mock 등록 마커). 9단계는 화면을 다듬지 않고 계약 검증 + 최소 이전으로 줄였다(2026-10-01 사용자). 9b 완료(#128: 설비 마스터 이전 + Kernel 호출형 조회 `useMenuFetch` — 표 페이지·내보내기도 서버 선언으로 재검증, 페이징 모양 `PageQuery`를 contracts로). 9a·9d 완료(#127·#130: 사이클타임 계산을 서버 쪽으로, 내보내기 엔드포인트, mock→화면 임시 lint 허용 종료, 홈 공지는 `notice:view` 엔드포인트). 9c 완료(#129+#123: 지표 카탈로그와 쌍 판정을 서버로, params 값 검증 훅 — 실행 상세의 계열에 없는 버전은 오류). `serve`를 쓰는 화면 0. 10 완료(#131: VOC 조회를 Kernel 포트에서 메뉴 엔드포인트로 — `PlatformAdapter`에 메뉴 어휘가 남지 않음, 엔진이 비 mart 원천을 표현). 다음: 11 `serve` 제거(#132) → 11 `serve` 제거(#132) → 12 문서 이관(#133). 후속 #122(단건 조회 provisional)·#123(metricVersion 서버 검증, #129와 함께) |

### M2 디자인 시스템 (1차 평가: #33) — 보류

**보류 (2026-09-27 결정):** FeedbackOps도 디자인을 개선하고 있다. 그 디자인이 확정된 뒤 재개하고, FeedbackOps 디자인을 기반으로 삼아 플랫폼 확장 패턴(전역 Context 바, 차트 프레임, 분석 레이아웃, KPI)을 더한다. 스택 차이(FeedbackOps Tailwind 3.4, 플랫폼 v4) 때문에 `@fops/ui`를 직접 쓰지 않고 토큰·패턴을 `@ap/ui`·`@ap/components`로 옮긴다. 재개 시 프로토타입(#52)에 D안(FeedbackOps 기반, 레일=공간 전환)을 추가해 컨펌받는다. 지금까지의 A안(완성)·B안(WIP)은 브랜치 `hjung3113/prototype-design-direction`에 있다(main 병합 안 함). 보류 중인 이슈에는 `on-hold` 라벨.

| 이슈 | 선행 |
| --- | --- |
| 디자인 방향 인터랙티브 프로토타입 → 컨펌 (#52) | — |
| DESIGN.md 개정 (#53) | #52 |
| 공통 필터 바 승격 (#54) | #53 |
| StateView 변형 (#55) | #53 |
| 셸 톤·Context 바·도움말 자리 (#56) | #53 |
| ~~`@types/node` 부채 (#57)~~ 완료 | — |
| ~~시각 회귀 검사 CI (#58)~~ 완료 — CSS selector 비교(`css-selectors` job), 픽셀 비교는 디자인 확정 뒤 | #39 |

### M3 FeedbackOps 1단계

| 이슈 | 선행 |
| --- | --- |
| 디자인 토큰 공유 (#59) | #53, #40 |
| ~~내 VOC·설문 이력 조회 + 원본 딥링크 (#60)~~ 완료 — 조회 `myVocHistory`/`mySurveyHistory`(mock, #131에서 Kernel 포트 → 메뉴 엔드포인트), `/voc` 화면, `VITE_FEEDBACKOPS_ORIGIN` 연결. 설문 원천 API는 #84, 신고자용 상세 링크는 #85, 실제 어댑터는 #86 | #41, #40 |
| ~~양방향 Context 딥링크 계약 (#61)~~ 완료 — 확장은 #81 | #40 |

## 작업 방식 요약

- 모든 작업은 이슈에서 시작하고 PR에 `Closes #n`을 적는다.
- UI는 인터랙티브 프로토타입으로 컨펌받은 뒤 구현한다.
- 확정되면 세 가지를 확인한다: 공통 컴포넌트/계약으로 올릴지, 관련 문서를 고쳤는지, 이 로드맵이 맞는지. PR 템플릿과 CI `PR checklist`가 확인한다.
- 이전 세션 인계는 [`HANDOFF.md`](../HANDOFF.md), 문서 읽기 경로는 [`docs/INDEX.md`](INDEX.md).
