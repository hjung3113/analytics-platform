# 사내 적용 가이드 (mock → 실어댑터·실서버)

> 상태: **Candidate** — 2026-10-02 작성. 사내 적용의 **순서·확인할 것·사람이 할 일**을 한 곳에 모은 안내서다. 서버·어댑터가 지켜야 할 **규칙**의 원본은 [실서버 연결 체크리스트](real-server-checklist.md)이고, 계약 원본은 [06](../06_platform_ui_contract.md)·[패키지 경계](platform-packages.md)다. 충돌하면 원본을 따른다. 진행 추적은 지도 이슈 [#157](https://github.com/hjung3113/analytics-platform/issues/157)과 마일스톤 `M4 사내 적용`.

## 0. 지금 어디까지 왔나

- 플랫폼 쪽 준비는 끝났다. 메뉴 데이터는 모두 범용 조회 포트(`menuQuery`, #100)로 오고, 서버 경계 적합성 묶음(`@ap/server-conformance`, #145·#152)이 어떤 어댑터든 같은 잣대로 판정한다 — `menuQuery`와 포트 메서드 전부(세션·Scope·조건 편집기 포트·목적지·감사·콘솔 조회·주석·활용률·오류 보고)를 지금 mock으로 23개 엔드포인트·527개 검사 통과(oversize 표본이 없는 3개 검사는 건너뜀 — 통과로 세지 않는다).
- 사내 적용은 `#platform-assembly` 조립 모듈(dev·mock은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `createMockAdapter(...)`)을 **실어댑터를 돌려주는 조립 모듈로 바꿔 꽂는 일**이다(`AP_PLATFORM_ASSEMBLY`, #153·ADR-0009). Kernel·셸·공통 컴포넌트·메뉴 화면은 고치지 않는다(체크리스트 §1).
- 남은 일의 대부분은 **사내 입력**(SSO 사양, 배포 환경, 백엔드 담당과의 합의)에 막혀 있다. 외부 입력 없이 할 수 있는 플랫폼 작업은 §4의 몇 개뿐이다.
- 디자인(M2)은 이 트랙과 별개로 보류 중이다(FeedbackOps 디자인 확정 뒤, [ROADMAP](../ROADMAP.md)).

## 1. 무엇이 바뀌고 무엇이 그대로인가

| 바뀌는 것 | 그대로인 것 |
| --- | --- |
| 운영 조립 모듈(`createAssembly` → 실어댑터, `AP_PLATFORM_ASSEMBLY`, #154) | Kernel(`@ap/kernel`)·셸·공통 컴포넌트·`@ap/contracts` 타입 |
| 운영 빌드에서 mock 핸들러·dev 도구 제외(#153 완료 — CI `check:prod-graph`) | 메뉴 화면(`menus/*/src/pages`)과 엔드포인트 선언(`menus/*/src/endpoints.ts`) |
| 서버: 메뉴 `src/mock/` 계산 → 사내 FastAPI 핸들러(파서 Postgres·mart SQL, #155) | 판정 규칙(체크리스트 §3 순서), 06 §19 응답 envelope, URL·딥링크 계약 |
| 인증: Mock 역할 전환 → 사내 SSO 세션(#150) | 개발·E2E는 계속 mock으로 돈다(`pnpm dev`·`pnpm e2e`) |

## 2. 전체 순서

| 단계 | 할 일 | 이슈 | 선행 | 누가 | 끝났다는 기준 |
| --- | --- | --- | --- | --- | --- |
| 1. 확인 | 사내 SSO 사양·설정값 | [#150](https://github.com/hjung3113/analytics-platform/issues/150) | — | 사용자(사내 SSO 담당 문의) | §3.1 질문에 답이 있고 05 Open이 Decided |
| 1. 확인 | 배포·인프라 환경 | [#151](https://github.com/hjung3113/analytics-platform/issues/151) | — | 사용자(인프라 담당 문의) | §3.2 질문에 답이 있음 |
| 1. 결정 | 엔드포인트 선언의 원본(TS ↔ FastAPI codegen) | [#148](https://github.com/hjung3113/analytics-platform/issues/148) | — | 사용자 + 백엔드 담당 | 결정이 05·06 §6.1·menu-query-port Q2에 반영 |
| 1. 결정 | 전송 형식(HTTP 경계) | [#149](https://github.com/hjung3113/analytics-platform/issues/149) | 초안 작성(Candidate) — 합의 대기. 합의는 #151 답 뒤가 낫다 | 에이전트 초안 → 백엔드 담당 합의 | `http-adapter-contract.md`가 Decided |
| 2. 지금 가능 | ~~적합성 묶음 확장(포트 메서드 전부)~~ 완료 — 주석·활용률·오류 보고까지 포트 메서드 전부 검사 | [#152](https://github.com/hjung3113/analytics-platform/issues/152) | — | 에이전트 | mock이 새 검사 통과, 깬 어댑터에서 실패 |
| 2. 완료 | ~~운영 빌드 조립 분리 + 번들 검사~~ | [#153](https://github.com/hjung3113/analytics-platform/issues/153) | — | 에이전트 | 운영 모드 산출물에 mock·DevTools 없음을 CI가 확인(`check:prod-graph`, ADR-0009) |
| 2. ~~지금 가능~~ 완료 | `validateScope` 실패 시 Scope가 '확인 중'에 멈추는 Kernel 공백 | [#167](https://github.com/hjung3113/analytics-platform/issues/167) | — | 에이전트 | reject 시 오류·재시도, 회귀 테스트 |
| 3. 구현 | 실어댑터(HTTP) + 적합성 묶음을 사내 테스트 서버로 | [#154](https://github.com/hjung3113/analytics-platform/issues/154) | #148·#149·#150 | 에이전트(사내 실행은 사람) | 사내 테스트 서버 대상 적합성 묶음 전부 통과 |
| 3. 구현 | Kernel 5분 폴링·계산 세대 재검증 | [#165](https://github.com/hjung3113/analytics-platform/issues/165) | #149(+#155 세대 신호) | 에이전트 | 세대가 바뀔 때만 다시 읽고 갱신 표시, Kernel 테스트·E2E |
| 3. 구현 | FastAPI 플랫폼 API | [#155](https://github.com/hjung3113/analytics-platform/issues/155) | #148·#149·#150, 신뢰 원천은 #37 | 사내 백엔드 담당 | 체크리스트 §2·§3 전부 + 적합성 묶음 통과 |
| 4. 운영 | §6 완료 기준 확인 → 첫 사내 메뉴 | — | 3단계 | 사내 메뉴 개발자 | §6 체크 전부 |

1단계 네 개는 서로 독립이라 동시에 물어도 된다. 2단계는 1단계를 기다리지 않는다.

## 3. 사내에서 확인할 것 (담당자별 질문 목록)

이슈 본문에 같은 질문이 있다. 답을 받으면 해당 이슈에 남기고, 결정은 05와 그 결정의 원본 문서(03·06·menu-query-port 등)를 Decided로 고친 뒤 여기 체크박스를 고친다. 이 가이드는 Candidate 안내서라 Decided를 붙이지 않는다.

### 3.1 SSO·보안 담당 — [#150](https://github.com/hjung3113/analytics-platform/issues/150)

- [ ] 프로토콜(OIDC / SAML / 헤더 주입형 프록시)
- [ ] issuer·메타데이터 URL, 클라이언트 등록 절차와 소요 기간, 환경별 redirect URI
- [ ] 받을 수 있는 claim — 계정 id, 이름, 부서, **그룹·역할 claim의 유무와 모양**(역할 소속 원천 #98이 여기에 걸림)
- [ ] 세션 만료·재인증 주기·단일 로그아웃 요구
- [ ] FeedbackOps와 IdP 클라이언트 공유 가능 여부(M3 SSO 공유)
- [ ] 망분리에서 서버의 IdP 백채널 접근 가능 여부
- [ ] 테스트 계정: 모든 엔드포인트 권한 계정 + 권한 하나씩 뺀 계정(또는 세션 전환 훅), `console:access` 계정(`asConsole`), 부여 계정의 site 둘 부여·목적지/주석 권한 — 적합성 묶음에 필요(체크리스트 §4)

### 3.2 인프라 담당 — [#151](https://github.com/hjung3113/analytics-platform/issues/151)

- [ ] 정적 산출물(`apps/platform-web/dist`) + `/api` 리버스 프록시 → FastAPI 구조 가능 여부, 컨테이너인지 VM인지
- [ ] 같은 출처 배포 가능 여부(쿠키 세션·CSRF 설계가 달라짐)
- [ ] 망분리 빌드: npm·PyPI 사내 미러, Node 26.7.0·pnpm 11.1.1 설치(폰트는 이미 자체 호스팅)
- [ ] CI: GitHub Actions 사용 가능 여부 / 사내 CI로 이행 여부, 저장소를 사내 Git으로 옮기는지(이슈·PR 흐름이 GitHub 전제)
- [ ] 사내 표준 브라우저와 버전(MVP는 데스크톱 웹만)
- [ ] 사내 주소가 HTTPS인지 — 표 행 복사(#174)는 보안 컨텍스트에서만 여러 페이지 선택을 서버에서 읽어 복사하고, HTTP면 현재 페이지에 보이는 선택 행만 복사한다(버튼·Ctrl/⌘+C 같은 경로; 현재 페이지에 선택 행이 없으면 복사하지 않고 그 페이지로 가라고 안내)
- [ ] 환경 수(개발·스테이징·운영)와 환경별 URL — IdP redirect URI, `VITE_FEEDBACKOPS_ORIGIN`
- [ ] 파서 Postgres 접근: 같은 인스턴스·별도 스키마·read-only 계정 요청 절차(03)
- [ ] 서버 로그 수집처 — 오류 보고·Correlation ID 추적 경로
- [ ] 프록시 read timeout 60초 이상 가능 여부(서버 25초·클라이언트 30초보다 길게 — [전송 형식 초안](http-adapter-contract.md) §5)
- [ ] 프록시·서버 본문 크기 한도(초과 시 413 — 초안 §2)
- [ ] 사내 표준 요청 id 헤더(`X-Request-Id` 등)가 있는지 — 있으면 `X-Correlation-Id` 대신 그것을 쓴다(초안 §7)
- [ ] 프록시 HTTP/2 여부(HTTP/1.1이면 출처당 6연결 큐 대기가 30초 타임아웃에 들어간다 — 초안 §5)와 `/api/**` 캐시 설정(`Cache-Control: no-store` 존중 — 초안 §1)
- [ ] SSO 게이트웨이가 미인증 `/api/**`에 302가 아니라 401을 답하게 설정할 수 있는지(초안 §6, #150과 함께)
- [ ] 사내 표준 브라우저가 `AbortSignal.any`(Chromium 116+)를 지원하는지 — 전송 초안 §5가 Chromium 116+를 가정

### 3.3 사내 백엔드(FastAPI) 담당 — [#148](https://github.com/hjung3113/analytics-platform/issues/148)·[#149](https://github.com/hjung3113/analytics-platform/issues/149)·[#155](https://github.com/hjung3113/analytics-platform/issues/155)

- [ ] 선언 원본 선호(TS 원본 + 서버가 읽기 / FastAPI 원본 + TS 생성 / 각자 + 비교 검사) — #148
- [ ] 전송 형식 초안 검토: HTTP 상태와 `outcome` 관계, 부트스트랩 엔드포인트, 알림 경로(폴링·SSE), 타임아웃 값, CSRF, Correlation ID 헤더 — #149. 초안과 질문 목록: [전송 형식 초안](http-adapter-contract.md) §10
- [ ] 플랫폼 메타 DB(감사·활용률·오류 보고·주석·room 부여) 스키마를 누가 소유하나(Alembic, 03)
- [ ] 체크리스트를 읽고 "이 규칙은 FastAPI에서 어렵다"는 항목 — 있으면 계약 변경 결정으로 올린다(루트 `AGENTS.md`)

### 3.4 파서 담당 — [#37](https://github.com/hjung3113/analytics-platform/issues/37)

- [ ] 적재 워커 상태 스키마 초안([ingest-status-schema.md](ingest-status-schema.md)) 합의 — 데이터 신뢰(`trust`, 미수집·처리 지연·커버리지)의 원천. 합의 전 서버 동작은 체크리스트 §3-10(추측으로 채우지 않음). 합의 뒤 모니터링·트레이스(#51).

### 3.5 FeedbackOps — M3

- [ ] 내 설문 응답 이력 읽기 API(#84 = FeedbackOps#548), 신고자용 `view=my&selected=` 딥링크(#85 = FeedbackOps#549), 딥링크 확장(#81). 실제 VOC 어댑터(#86)는 디자인 토큰 공유(#59, M2 보류) 뒤.

### 3.6 사용자(제품 결정)

- [ ] 활용률 이벤트에 조회조건을 넣을지(#75)
- [ ] 전역 감사 조회에 room 권한을 적용할지(#91)
- [ ] 역할 소속 원천(#98) — §3.1 그룹 claim 답 뒤

## 4. 지금 바로 할 수 있는 일 (외부 입력 없음)

추천 순서.

1. ~~#152 적합성 묶음 확장~~ 완료 — 포트 메서드 전부(주석·활용률·오류 보고 포함)를 어댑터 무관 검사로. 실서버가 붙는 날 판정 범위가 그대로 넓어진다.
2. ~~#153 운영 빌드 조립 분리~~ 완료 — `main.tsx`는 `#platform-assembly`로 조립을 받고, 운영 빌드는 `AP_PLATFORM_ASSEMBLY` 없이는 실패하며, CI `check:prod-graph`가 운영 모듈 그래프에 mock·DevTools가 없음을 확인한다(ADR-0009). 실어댑터(#154)는 `createAssembly`를 구현해 그 env로 꽂는다.
3. ~~#167 Scope 확인 실패 처리~~ 완료 — `validateScope`가 reject되면 Kernel이 Scope를 `error`로 두고 "Scope를 확인하지 못했습니다 + 다시 시도"를 보인다(mock 시나리오 "Scope 확인 실패").
4. ~~#149 전송 형식 초안~~ 초안 작성(Candidate) — 합의 대기([http-adapter-contract.md](http-adapter-contract.md)).
5. 작은 후속: #122(목적지 단건 provisional), #90(지표 이력을 감사 저장소로).

## 5. 사내 메뉴 개발 가이드

실제 메뉴는 사내에서 새로 만든다. 이 저장소의 메뉴 화면은 플랫폼 계약을 검증하는 견본이다. 사내 메뉴 개발자는 아래 순서를 따른다.

### 5.1 시작 전

- [06](../06_platform_ui_contract.md) §5 Menu Extension Contract와 §29 Platform-first Definition of Done을 읽는다. "Domain Done"(요구가 동작하는가)보다 "Platform Done"(공통 계약 위에 있는가, 다른 메뉴와 Context가 연결되는가, 권한·Scope가 일관되는가)을 먼저 본다.
- 어느 Page Archetype(06 §12: Overview / Analysis Workspace / Management / Catalog / Workflow)인지, 어느 공통 컴포넌트를 쓰는지, 다른 어느 메뉴와 연결되는지(06 §22) 먼저 적는다.
- 화면 설계가 필요하면 [설계 스킬](../../.agents/skills/analysis-platform-wireframe/SKILL.md) 절차(Requirements → IA → Screen Spec → Wireframe → Open Decisions).

### 5.2 만들기

1. **그룹**: 기존 7개 그룹(`menus/AGENTS.md` 표)에 넣을 수 있으면 그 패키지에 manifest를 추가한다. 새 그룹이면 `GroupId` 리터럴(`packages/contracts/src/menu.ts`)과 `GROUPS` 행(`apps/platform-web/src/menus.ts`, 공간 `space`)을 사람이 먼저 추가한 뒤 `pnpm gen:menu <group> --label-ko … --label-en … --page-type <type>` → `pnpm install`.
2. **조회 선언**: `menus/<g>/src/endpoints.ts`에 `defineEndpoint`로 권한(데이터 접근 권한 — 메뉴 권한과 다를 수 있음)·적용 Context·params 키·assessment kind·한도를 선언한다.
3. **화면**: [페이지 작성 가이드](../../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙) — `PlatformPage`, `useMenuQuery` + `QueryView`, 표는 `PlatformDataTable` + `useMenuFetch`, 차트는 `AnalysisChartFrame`, 이동은 `linkTo`, page 상태는 등록된 `pageKeys`만.
4. **서버 쪽**: 개발 중에는 `menus/<g>/src/mock/`에 핸들러(앱 `src/dev/mock-assembly.tsx` 마커 영역에 등록 — 생성기가 씀, 운영 빌드에는 실리지 않는다). 실서버에는 같은 엔드포인트 id로 FastAPI 핸들러를 만든다(선언 사본 공유 방식은 #148).
5. **적합성 묶음 등록**: [`apps/platform-web/src/server-conformance.test.ts`](../../apps/platform-web/src/server-conformance.test.ts)는 mock 조립의 `MOCK_ENDPOINTS`(생성기가 등록)를 그대로 쓰므로 mock은 따로 넣지 않는다. 엔드포인트가 params를 선언하면 `PARAMS` 표에 표본 params를 넣는다(빠지면 테스트가 실패한다). 표본 params는 하네스의 권한 있는 역할(`engineer` — `console:access` 없음), site `ICH`, 하네스 기간으로 `ok` 또는 `empty`가 나와야 한다. 엔드포인트가 `console:access`를 요구하면 그 하네스로는 성공 요청을 만들 수 없으니 먼저 묻는다.

### 5.3 하지 말 것

- `packages/*`(Kernel·셸·공통 컴포넌트·contracts)를 메뉴 작업 중에 고치지 않는다. 부족하면 이슈로 올려 플랫폼 작업으로 한다.
- 메뉴는 표 엔진(`@tanstack/react-table`·`react-virtual`·`table-core`·`virtual-core`)을 import하지 않는다 — 열은 `PlatformColumn`으로 선언한다(lint 금지, [README 7번](../../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙)).
- 메뉴끼리 import하지 않는다. 교차 이동은 `linkTo`뿐, URL 문자열을 직접 만들지 않는다.
- 새 메뉴 데이터를 위해 `PlatformAdapter` 포트 메서드를 늘리지 않는다 — 엔드포인트 선언으로.
- 화면이 권한·Scope를 판단하지 않는다(서버가 판정). 0건을 "수집 중단·지연"으로 해석하지 않고, `null`은 0이 아니라 "미확인"이다.
- 설비 wall-clock을 TZ 변환하지 않는다(06 §6.3).
- 메뉴 화면 3개 이상을 연속으로 만들 때는 먼저 범위를 확인한다(루트 `AGENTS.md`).

### 5.4 검증

`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 화면이 바뀌면 `pnpm dev`(역할 전환·응답 시나리오로 empty/forbidden/too_large/timeout/error 확인), Kernel·셸·공통 컴포넌트·mock 서버를 건드렸으면 `pnpm e2e`.

## 6. 사내 적용 완료 기준

- [ ] 사내 테스트 서버 대상 적합성 묶음 전부 통과(#152로 넓힌 범위 포함) — 실행 기록을 #154에 남긴다.
- [ ] 체크리스트 §2 표의 메서드 전부가 실어댑터로 동작, §3 판정 순서·등록 검증이 서버에 있음.
- [ ] 운영 빌드는 빌드 단계에서 mock·dev 모듈 금지 검사(#153); 실어댑터 조립을 넣은 운영 빌드 통과는 #154.
- [ ] 사내 SSO로 로그인 → 세션 부트스트랩 → 권한 다른 두 계정에서 메뉴·데이터 범위가 다르게 보임(서버 판정).
- [ ] 세션 만료·재로그인 때 이전 결과가 한 프레임도 보이지 않음(체크리스트 §2 `subscribe`).
- [ ] 오류 화면의 Correlation ID로 서버 로그를 찾을 수 있음.
- [ ] 데이터 신뢰: #37 합의 전 동작이 체크리스트 §3-10대로다 — 원천 의존 kind(`collection`·`processing_delay`·`coverage`)는 빼지 않고 `unknown`, Trust의 모르는 값은 `null`.
- [ ] `pnpm dev`·`pnpm e2e`는 여전히 mock으로 돈다(개발 경로 유지). 실서버 대상 E2E를 돌릴지는 3단계에서 따로 정한다 — 지금 E2E는 mock 시나리오(`malformed` 등)에 기댄다.

## 7. 흔한 함정

| 함정 | 맞는 것 | 원본 |
| --- | --- | --- |
| 서버가 요청에 실린 권한·kind·한도를 믿는다 | 서버는 자기 선언 사본으로 판정 | 체크리스트 §3 |
| 모든 메서드를 같은 방식으로 실패시킨다 | 반환 모양에 따라 다르다 — envelope 메서드는 실패도 `error` envelope, 나머지는 메서드별 규칙 | 체크리스트 §2 메서드 분류 |
| Scope `null`을 "전체 사이트"로 | `forbidden` | 체크리스트 §3-4 |
| 클라이언트가 사용자 id·actor를 보낸다, 또는 시각을 한 가지 규칙으로 처리한다 | 사용자는 언제나 서버가 세션으로 찍는다. 시각은 메서드마다 다르다(활용률은 서버 수신 시각으로 집계) | 체크리스트 §5 |
| 세션 스냅샷을 매번 새 객체로 | 바뀔 때까지 같은 객체 | 체크리스트 §2 |
| 설비 시각을 UTC로 변환 | naive wall-clock 그대로, `[from, to)` | 06 §6.3 |
| 명시적 공집합(`[]`)에 원천을 읽는다 | 읽지 않고 `empty`, trust `null` | 06 §19 |
| #98 답 전에 권한 부여·회수 화면을 만든다 | 권한/역할 화면은 조회 전용 | 05, #98 |
| mock 계산을 실데이터 로직으로 그대로 옮긴다 | mock은 계약 견본. 실계산은 mart SQL(03 SQL-first) | 03 |

## 8. 관련 문서

- [실서버 연결 체크리스트](real-server-checklist.md) — 서버·어댑터 규칙 원본
- [`@ap/server-conformance`](../../packages/server-conformance/AGENTS.md) — 적합성 묶음과 하네스
- [패키지 경계](platform-packages.md) §3–§5 — 의존 방향, 포트 메서드 기준
- [메뉴 조회 포트 설계 기록](menu-query-port.md) — Q2 배경
- [03 백엔드 스택](../03_backend_stack.md) — FastAPI·SQL-first·인증 구조·Alembic
- [적재 워커 상태 스키마 초안](ingest-status-schema.md) — #37
- [FeedbackOps 딥링크 계약](feedbackops-deeplink.md) — M3
