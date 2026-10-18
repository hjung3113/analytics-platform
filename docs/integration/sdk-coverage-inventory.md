# SDK 포괄 목록 — 세 프레임워크의 기능을 플랫폼 SDK가 모두 덮는지

> 상태: **Candidate** — 2026-10-19 작성. [ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)의 "세 제품의 프레임워크가 하는 일을 SDK가 모두 덮는다"를 확인하는 목록이다. [프레임워크 통합 계획](framework-unification-plan.md) §2·§3 지도에서 출발해 세 저장소의 **코드**와 대조했다. 구현 지시가 아니고, 판정(덮음·흡수·신규·제품 유지)은 Candidate다. 저장소·릴리즈 구조는 [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)(Decided)가 정한다.
>
> 관찰 기준(읽기 전용 사본): analytics-platform `main` `058c643`, FeedbackOps `origin/develop` `a8d768b8`, equipment-visualization(EV) `origin/develop` `307df61`. FeedbackOps 사본과 EV 사본에는 `.git`이 없어 커밋은 `git archive`를 뜬 ref 기준이다. 테스트 유무는 파일 존재로만 봤고 커버리지는 재지 않았다. 읽지 않고 이은 판단은 **추정**으로 표시했다.

## 1. 결론

- **덮는 것**: 계약·조회·세션·Context·Registry·감사·활용률·오류 경계·i18n·차트 프레임·공통 표·필터·상세 슬롯·생성기·경계 lint·적합성 묶음. 이미 `packages/*`와 `tooling/*`에 있다(§3 ✅).
- **흡수할 것**: 디자인 시스템 코드(FeedbackOps `@fops/ui` → SDK), 디자인 lint 설정(세 벌 → 한 곳), 쓰기 요청 규약(Idempotency-Key·낙관적 동시성·커서 페이지·rate-limit 헤더), 경계 검사 AST 규칙, 비주얼·토큰 충실도 하니스, 선언 산출물(EV의 JSON Schema 내보내기), 모듈 CSS 소스 규약(EV 패키지별 `styles.css`)(§3 ⬇).
- **SDK가 새로 정해야 하는 것(셋 중 누구도 없음)**: 호스트 포트·화면 manifest·계약 버전, 열린 권한·그룹 어휘, 모듈 경로 접두사, 쓰기 포트, 취소·수명주기 신호, 기계가 읽는 테마 계약, 호스트 쪽 입력 검증 공유 위치(§3 🆕, §5).
- **지도가 틀렸던 것**: 셸 구현이 이제 **세 벌**(FeedbackOps `@fops/ui` 레이아웃·AP `@ap/shell`·EV `@eqv/ui` `AppFrame`)이고, EV에 디자인 lint와 primitive가 있으며, FeedbackOps `AuthProvider`는 서버 전용이다(§4).
- **범위 결정**: 백엔드 구현 프레임워크(FeedbackOps Fastify 규약 등)는 SDK가 덮지 않는다. 서버는 계약만(§6 Q-B).

## 2. 읽는 법

| 표시 | 뜻 |
| --- | --- |
| ✅ 덮음 | analytics-platform 패키지에 이미 있고 SDK 표면 후보다 |
| ⬇ 흡수 | 다른 제품에 더 성숙하거나 SDK에 없는 조각이다. 플랫폼 용어로 맞춰 SDK로 가져오는 후보(06 §24 반복 기준은 Kernel 책임에는 적용하지 않는다) |
| 🆕 신규 | 셋 다 없다. SDK가 정한다 |
| ⬜ 제품 | 업무 의미나 제품 서버에 묶여 제품에 남는다 |
| ⛔ 복제 금지 | 그 제품 안의 불일치·부채라 SDK로 옮기지 않는다 |
| 범위 밖 | 독립 실행 호스트처럼 ADR-0043이 SDK 책임이 아니라고 한 것 |

`AP`=analytics-platform, `FO`=FeedbackOps, `EV`=equipment-visualization.

## 3. 기능별 포괄 목록

### 3.1 앱 계약·등록

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 화면 선언·Registry 검증 | `MenuMeta`·`createRegistry`(중복·route 충돌·공간 규칙) | 없음(파일 기반 라우트 트리) | 없음 | ✅ AP. 모듈 단위 manifest로 넓힘 🆕 |
| 호스트 포트(React 밖) | `usePlatform()` 훅만 | 없음 | props 직접 전달(`TopViewerProps`, 제어형 컴포넌트) | 🆕 `ModuleHost`(탑재 설계 §2.5, Proposed) |
| 계약 버전·필수 기능 검사 | 없음(URL `v`와 딥링크 `contract: 1`만) | 없음 | 없음 | 🆕 |
| 열린 권한·그룹 어휘 | 닫힌 union(`Permission` 8개, `GroupId`) | capability 문자열 | 후보 `equipment:topview:*`(미승인) | 🆕 모듈 접두사 문자열 |
| 모듈 경로 접두사 | 앱 절대 경로 | 루트 절대 경로 | Studio 라우트 | 🆕 |
| 조립 설정 주입 | `#platform-assembly`(`createAssembly`) | 환경 변수·`apiBase` 없음 | 호스트가 패키지별 `styles.css`를 import | ✅ + 🆕 `config` 키 선언 |

### 3.2 라우팅·URL·딥링크

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| URL 계약·codec | `url.ts`(전역 키·`v`·`returnTo`, 보정 없는 거부) | TanStack Router 파일 기반, 라우트별 `.strict()` 스키마지만 `parseRouteSearch`는 잘못된 값·모르는 키를 **버림** | 자체 History 라우터(약 120줄), 상태는 `file`·`entityType`·`anchor`만 URL | ✅ AP. FO·EV의 라우터는 독립 호스트 쪽이라 범위 밖 |
| 위치 어댑터·base path | `PlatformLocation` | `basepath` 없음 | 없음(절대 경로) | ✅ |
| 키별 성공/실패를 돌려주는 search 스키마 | 해당 없음 | 버림 방식 | 해당 없음 | 🆕 모듈 스키마는 키별 결과를 내고 처리는 호스트가 정한다(탑재 설계 §5.3) |
| 교차 메뉴 링크·복귀 | `resolveLink`·`returnTo`·`ReturnLink`·`PageNavigation` | `returnTo` 필드가 여러 라우트에 있고 허용목록 3경로(`/home`·`/integration`·`/integration/coverage`) | 없음 | ✅ AP |
| 외부 제품 딥링크 | `feedbackops-link` codec | 양방향 allowlist | 해당 없음 | ✅ AP |
| 이탈 확인·라우트 포커스 | `PlatformPage` 도착 포커스(ADR-0032). 미저장 이탈 확인은 없음(`packages/*/src` grep) | 라우터 `beforeLoad` 가드 | `setNavigationBlocker`(앱 안 이동 + `beforeunload`), `useRouteFocus` | ⬇ EV의 이탈 차단을 호스트 포트 후보로 비교(AP에는 없다) |

### 3.3 세션·인증·권한

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 세션 스냅샷·세대·구독 | `session()` 동기 + `subscribe` | 프런트는 `useMe`/`ensureMe` + `_authed.beforeLoad`. **`AuthProvider`는 백엔드 전용**(Mock/OIDC) | 없음(로컬 도구) | ✅ AP. 서버 인증은 ⬜ 제품 |
| 세션 전환 때 캐시 폐기 | `usePlatformQuery` identity 규칙 | actor 경계에서 `queryClient.clear()` | 해당 없음 | ✅ AP |
| 표시용 권한 판정 | `can(permission)` | `PermissionGate`(fail-closed), `permission_decisions` 봉투 파서(fail-closed), `RequestAccessButton` | 해당 없음 | ✅ `can`. ⬇ 권한 요청 흐름(`requestable_permission`)은 AP에 대응물이 없다(`packages`·`menus` grep). 필요한 소비자가 생기면 비교 |
| capability 내비 | `GroupDef`·권한 숨김 | **관리자 섹션만** 문자열(`'관리자'`)로 걸러냄. `NAV_TREE`는 정적 | 해당 없음 | ✅ AP. ⛔ FO의 문자열 필터 |
| 브라우저 세션 공유(SSO) | #150 대기 | #150 대기 | 해당 없음 | 범위 밖(사내 IdP 답) |

### 3.4 데이터·조회·쓰기·오류

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 조회 선언·포트 | `EndpointSpec`·`PlatformAdapter.menuQuery`·`useMenuQuery`·`useMenuFetch` | `apiRequest` + Zod 파서 필수, TanStack Query 훅 | `defineEndpoint` 제안(`equipment.topview.*`) | ✅ AP |
| 응답·오류 의미 | `ApiResponse{outcome, assessments, trust}`, 어댑터는 던지지 않음 | `{code, message, detail, requestable_permission}`, code→HTTP 표는 **백엔드 `lib/errors.ts`**, `ERROR_CODES`는 도메인 코드가 섞인 닫힌 enum | Data Quality Issues·Evidence 4단계 | ✅ AP 의미 체계. FO code→outcome 변환은 서버 어댑터(⬜). 합치지 않음(통합 계획 §3 유지) |
| 쓰기 포트 | 주석 저장·삭제(`saveAnnotation`·`deleteAnnotation`)뿐, 일반 쓰기 포트 없음 | `Idempotency-Key` 자동 발급(프런트) + advisory lock·해시·재생(백엔드), 낙관적 동시성 3방식 | Studio는 파일 API(개발 전용), 플랫폼 쓰기는 설계 없음(#334) | ⬇ FO 규약을 근거로 🆕 쓰기 포트를 설계한다 |
| 목록 페이지 계약 | `PageQuery`·`PageResult`·`sortAndPage` | 커서 페이지 계약, rate-limit 헤더 파싱, 304/ETag | 해당 없음 | ✅ + ⬇ 커서·rate-limit 헤더 |
| 파서의 개인정보 방어 | — | `ApiParseError`가 값을 담지 않음, 파서 우회 `fetch(` ratchet allowlist 테스트 | 해당 없음 | ⬇ 비교 후 규칙만 가져옴. ⛔ 우회 `fetch(` 18곳과 레거시 `apiClient` 58곳 |
| 라우트 오류 경계·오류 보고 | `RouteErrorBoundary`·`reportClientError` | `errorComponent`뿐, 클라이언트 오류 보고 없음 | 없음 | ✅ AP (FO·EV에 근거 없음) |
| 요청 취소·화면 해제 신호 | `useMenuQuery` 수명주기 | 없음 | `AbortSignal` 없음(React 이펙트만) | ✅ 조회 / 🆕 React 밖 `signal` |

### 3.5 Context·분석 계약

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 전역 Context·Scope·기간·Selection | `GlobalContext`·`GlobalContextBar`·`ScopeSelector`·`evaluateSelection` | 없음(전부 미지원 선언) | `time` 적용, Selection 참조 | ✅ AP |
| Trust·신뢰 표시 | `Trust`·`DataTrustIndicator`·`OutcomeBanners` | 없음 | `EvidenceBadge`(4단계) | ✅ AP. ⬜ EV Evidence는 제품 어휘 |
| 시간 정밀도 | 원천 정밀도 보존(06 §6.3) | 해당 없음 | 밀리초 3자리 고정, 초과 정밀도는 거부(EV ADR-0009가 EV#44를 정함) | ✅ AP 규칙. EV는 거부(fail-closed)로 맞춤 |

### 3.6 디자인 시스템·셸·UI 기반

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 토큰·primitive | `@ap/ui`는 `@fops/ui` 재수출 + 확장 층 | **현재 원본** `@fops/ui`(Pack 17, Tailwind v4) | `@eqv/ui`가 `@fops/ui`를 서브모듈로 소비(EV ADR-0008) + `--eqv-*` 24개(렌더러 전용) | ⬇ 코드를 SDK로 이전(ADR-0043). EV 서브모듈 경로도 SDK 소비로 바뀐다 |
| 셸·레이아웃 | `@ap/shell`(레일 52·사이드바 240·머리 50), `AnalysisLayout`·`ManagementLayout`·`DrillLayout` | `PageShell`·`ListShell`·`WorkbenchShell`은 **`@fops/ui` 안**. `AppFrame` 계열은 앱 안이며 managed-systems·권한·저장된 뷰를 직접 조회해 도메인 결합이 큼 | `@eqv/ui` `AppFrame`·`Page`(AP를 손으로 복사한 치수) | ⬇ 구현 **세 벌**을 SDK 하나로. FO `AppFrame`은 ⛔ 그대로 옮기지 않음 |
| 상세 패널 슬롯 | `DetailPanelSlot`(ADR-0013) | `DetailPanelSlotContext`(마지막 등록자 승리 + dev 경고) | 쓰지 않음 | ⬇ 슬롯 하나로 통합(G10) |
| 문서 제목 | 없음 | `DocumentTitleProvider`, **모듈 전역 Map 상태**라 인스턴스 간 격리 안 됨 | 없음 | 🆕 호스트 소유(G11). ⛔ 전역 Map |
| 토스트·알림 | `toast`(Platform) | sonner | `useToastQueue`·`ToastRegion` | 🆕 `notify` 포트 하나 |
| 모션·reduced motion | `prefersReducedMotion` 재수출 | 모션 토큰, `useListMotion` | 해당 없음 | ✅ / ⬇ 모션 토큰은 토큰 이전에 포함 |
| 명령 팔레트 | `CommandPalette`(shell) | cmdk + display-id 해석 | 없음 | ✅ AP. ⬇ display-id 해석은 비교 |
| 디자인 lint | `@shadcn/lint` 6규칙 ESLint 프리셋 | Oxlint(`.oxlintrc.json`) | ESLint `RESTYLE_CONTRACTS` 복사본 | ⬇ **세 벌 수동 동기화 → 한 곳**. 규칙 옵션 원본을 SDK로 |
| 다크·반응형 | 없음 | 없음 | 다크 팔레트 없음 | 🆕 해당 없음이면 선언으로 명시 |
| 기계가 읽는 테마 계약 | `tokens.css` | CSS만 | README 표 + Studio CSS 9개 매핑, 나머지 15개는 hex fallback | 🆕 |

### 3.7 공통 컴포넌트

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 표·가상화·내보내기 | `PlatformDataTable`(`@tanstack/react-table`·`react-virtual`·xlsx 내보내기) | 표 래퍼 없음, `ListShell`은 스크롤·가상화를 호출자에게 위임 | `@eqv/ui` `DataTable`(AP 32px 행 복사) | ✅ AP. EV 표는 SDK 소비로 교체 후보 |
| 필터·초안 적용 | `PageFilterBar`·`useFilterDraft` | `useCommittedSearchDraft`(한글 디바운스) | 해당 없음 | ✅ AP. ⬇ 한글 입력 디바운스는 비교 |
| 빈·로딩·오류 상태 | `StateView`·`QueryView`·`OutcomeView` | `ListStateMessage`(empty/filtered/error) | `StateMessage`·`LoadingBlock` | ✅ AP |
| 차트 프레임·상호작용 | `AnalysisChartFrame`·`EChart`(주석·범위·비교) | 없음 | SVG 렌더러(`TopViewer`) | ✅ AP. ⬜ EV 렌더러 |
| 감사 타임라인 | `AuditTimeline` | 백엔드 감사만 | 없음 | ✅ AP |
| 폼(RHF+Zod)·리치 에디터(TipTap) | 폼 래퍼 없음 | 있음(리치 allowlist가 **세 곳에 수동 복사** ⛔) | 없음 | ⬜ 제품 유지. 두 번째 소비자가 생기면 올린다(06 §24) |
| 실행 취소(`useUndoableMutation`·`UndoToast`)·미저장 확인 | 없음 | 있음 | Mapping Board 이력(`undo`/`redo`)은 EV 전용 | ⬜ 제품. 소비 2곳 확인 뒤 비교 |

### 3.8 계측·감사·운영

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 활용률·감사 이벤트 | `recordUsage`·`AuditEvent`·`auditTrail` | 백엔드 감사 서비스(트랜잭션 안, 이벤트별 Zod 레지스트리) | 없음 | ✅ AP. ⬜ FO 백엔드 |
| correlation id | `reportError`가 id 반환 | 프런트는 `x-request-id`를 읽지만 **백엔드가 발행하지 않음** | 없음 | ✅ AP |
| 알림·잡·실시간 | 없음 | pg-boss(백엔드), 트랜잭션 안 enqueue. 실시간 없음(폴링) | 없음 | ⬜ 제품. 실시간은 셋 다 없음 |
| 헬스·분산 rate limit·DB 역할 가드·pino redaction | 해당 없음 | 있음 | 해당 없음 | ⬜ 제품(§6 Q-B) |

### 3.9 서버 계약·적합성

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 선언 원본 | TS `EndpointSpec`(#148 A안 권고) | Zod, codegen 없음 | Zod + JSON Schema 내보내기(9종, vitest 스냅샷이 드리프트 게이트) | ⬇ EV의 내보내기·드리프트 게이트 방식을 #148 A안 산출물에 참고 |
| 적합성 검사 | `@ap/server-conformance` | consumer-contract·token-fidelity 테스트 | 해당 없음 | ✅ AP |
| 전송 형식 | 초안(#149) | JSON, 같은 origin, `fops_session` 쿠키 | 해당 없음 | 범위 밖(사내 입력 대기) |
| 마이그레이션 드리프트·dev 프록시 완전성 | 해당 없음 | 있음 | 해당 없음 | ⬜ 제품(§6 Q-B) |

### 3.10 개발 도구·검증

| 기능 | AP | FO | EV | 판정 |
| --- | --- | --- | --- | --- |
| 메뉴 생성기 | `gen:menu`(+`--remove`, 폴더–공간 검사) | 없음 | 없음 | ✅ AP |
| 경계 lint | ESLint 프리셋(레이어·mock·URL 조립·deep import) | `check-boundaries` AST 10규칙 | ESLint 경계 + `no-restricted-syntax`로 동적 import·import type까지 막고 24건 테스트 | ⬇ 동적 import·import type를 막는 규칙을 AP 프리셋과 비교해 보강 |
| 테스트 지원 | `@ap/kernel/testing`·`@ap/components/testing` | fail-closed mock-api 비주얼 하니스(fixture를 shared Zod로 파싱), 통합 DB 리셋(dev DB 포트 거부) | `seed.ts`·`data.ts` 로더가 패키지마다 복사 | ✅ AP. ⬇ fail-closed mock 방식, ⛔ EV 로더 복사본 |
| 시각·접근성 게이트 | `capture-page.sh` 수동 | 비주얼 하니스(CI 밖이라 `develop`이 red일 수 있다고 문서가 인정) | 없음(구조 SVG 스냅샷뿐) | 🆕 자동 접근성·시각 게이트는 셋 다 없다 |
| 성능 예산 | 없음 | 번들 예산 없음 | 수동 표(컴포넌트 2006개 342ms, 초선형) | 🆕 |
| CI 게이트 | 루트 `lint·typecheck·test·build·e2e` + 계약 보고 | `gate.sh` 3단계(static/unit/integration) | 단일 `Gate` 잡 | ✅ AP |
| 툴체인 | pnpm 11.1.1 / Node 26.7 / TS 5.9 | pnpm 9.15 / Node 22 / TS 5.7 / Biome | AP와 같음 | FO가 한 세대 뒤. 소비 조건으로 peer 범위에 표현 |
| 패키지 배포 상태 | 전부 `private`·`0.0.0`·소스 export | 같음 | `core`·`renderer`는 `dist` 빌드, 나머지 소스 export. `files`·changelog·`publishConfig` 없음 | 🆕 [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md) |

## 4. 통합 계획 지도의 정정

[통합 계획](framework-unification-plan.md) §2.2·§2.3·§3은 2026-10-17 시점이다. 이 목록이 코드로 확인한 차이:

| 지도의 서술 | 코드 |
| --- | --- |
| FO 셸(`PageShell` 등)은 "패키지 아님" | `@fops/ui`의 `layout/`에 있다. 앱 안에 있는 것은 `AppFrame`·`AppRail`·`AppSidebar` |
| FO `AuthProvider` | 백엔드 전용. 프런트에는 대응 추상이 없다 |
| FO `validateSearch` strict | 라우트 스키마는 strict지만 `parseRouteSearch`는 잘못된 값·모르는 키를 **버린다** |
| FO `returnTo`는 Findings만 | 여러 라우트의 공유 필드이고 허용목록 3경로 |
| FO capability 내비 | 관리자 섹션만 문자열 필터 |
| FO code→HTTP 표를 `@fops/shared`로 가정 | 백엔드 `lib/errors.ts`. `ERROR_CODES`는 도메인 코드가 섞인 enum |
| FO#1202 `scrim` variant | 이 사본에는 `palette` variant뿐 |
| EV는 "primitive 없음, 디자인 lint 없음" | `@fops/ui`를 서브모듈로 소비(EV ADR-0008), `@shadcn/lint` 6규칙 적용, `packages/ui`(`@eqv/ui`, 컴포넌트 14개)가 AP 셸·표를 복사 |
| EV 셸은 얇다 | 세 번째 셸 구현(`AppFrame`) |
| EV `packages/replay`는 "계획만" | 존재한다. `platform-adapter`는 아직 없음 |
| EV#44(시간 정밀도) 열림 | EV ADR-0009로 결정(밀리초 3자리 고정, 초과 정밀도 거부) |
| EV 스키마 JSON 3개 | 9개(`packages/core/schema/`), vitest 스냅샷으로 생성 |
| EV 렌더러 고정 560×420 | `TopViewer`는 `width`·`height`를 받는다. 560×420 하드코딩은 `MappingBoard`, 컨테이너를 재는 곳은 `LayoutsPage`의 비공개 훅 하나 |
| EV Studio 파일 API 서술 | `import` API(ADR-0010)까지 구현되어 있다. EV ADR-0010 본문은 "미구현"으로 남아 있다(EV 쪽 정정) |

이 정정은 통합 계획 본문에 옮기지 않고 이 문서가 우선한다고 그 머리말에 표시했다.

## 5. SDK가 새로 정할 것 (🆕 묶음)

세 제품 중 누구도 가지고 있지 않아 SDK가 처음 정한다. 호스트 → 모듈 계약은 [탑재 설계](platform-hosting-design.md) §2를 출발점으로 한다.

1. 호스트 포트(`ModuleHost`)·화면 manifest·`contract` 정수와 필수·선택 기능 검사
2. 열린 권한·그룹 어휘(모듈 접두사)와 모듈 경로 접두사
3. 쓰기 포트(FO의 Idempotency-Key·동시성 규약을 근거로)
4. React 밖 `signal`·모듈 상태(`auth_required` 등)·도착 포커스 대상·문서 제목 소유
5. 기계가 읽는 테마 계약(EV는 24개 중 9개만 매핑, 나머지는 hex fallback)
6. 호스트 쪽 입력 검증 공유 위치(EV의 Binding→Mapping Version→Layout 검증이 `apps/studio`에 있어 `platform-adapter`가 복제하게 된다)
7. 자동 접근성·시각·성능 예산 게이트
8. 패키지 배포 구조([ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md))

## 6. 결정 (사용자 2026-10-19, 권고안 그대로)

| # | 질문 | 결정 |
| --- | --- | --- |
| Q-B | SDK가 **백엔드 구현 프레임워크**(FO의 Fastify 모듈 규약·env 스키마·헬스·rate limit·DB 역할 가드)까지 덮는가 | **아니오 — 서버는 계약만**(전송 형식·오류 변환·헬스 규약·적합성 묶음). 구현 프레임워크는 제품이 고른다. 사내 백엔드는 FastAPI(#155)라 Node 규약을 SDK에 넣어도 사내 앱이 쓰지 못한다. 서버 쪽 SDK = 선언 산출물 + 적합성 묶음 + 전송 형식(통합 계획 단계 3). §3.8·§3.9의 "Q-B" 행은 이 결정으로 ⬜ 제품이다 |
| Q-C | 이전 순서 | **`@ap/contracts` 배포를 먼저, 디자인 시스템 코드 이전은 그다음 이슈**. contracts는 의존·React가 없어 위험이 가장 낮고 EV `platform-adapter`가 먼저 필요로 한다. 이전은 FO 픽셀 게이트를 같이 옮겨야 한다(ADR-0043 결과) |
| 저장소·릴리스 구조 | | [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md) |

## 7. 후속 — 아직 구현하지 않음

| 항목 | 상태 | 이유·다시 열 조건 |
| --- | --- | --- |
| 디자인 시스템 코드 이전 | [ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md) 결정, 구현 #441→#442→#443 | `@ap/contracts` 배포 모양(#430)은 끝났다 |
| FeedbackOps#1231 본문 | 낡음 — "`@fops/ui`를 FeedbackOps가 배포" 서술이 10-17 안 그대로다 | 다른 저장소라 이 슬라이스에서 고치지 않았다. 사용자가 FO 쪽에 알릴 때 같이 갱신한다 |
| EV ADR-0010 본문 | "미구현"으로 남아 있으나 코드는 구현됨 | EV 저장소 일 |
| EV `packages/ui`의 AP 복사 치수 | 셸·표가 AP와 손 복사 | SDK 셸·표가 공개되면 교체. 그전에는 건드리지 않는다 |
| 통합 계획 본문의 §2.2·§2.3·§3 | 정정만 이 문서에 있고 본문은 그대로 | 본문을 다시 쓰는 이슈가 생길 때 |

## 8. 출처

- AP: `packages/*/package.json`, `packages/*/src/index.ts`, `tooling/eslint/src/index.js`, `tooling/gen-menu/src/*`
- FO(`origin/develop` `a8d768b8`): `packages/ui`, `packages/shared`, `apps/frontend`, `apps/backend`, `scripts/ci/gate.sh`, `scripts/generate-routes.mjs`
- EV(`origin/develop` `307df61`): `packages/{core,renderer,editor,replay,ui}`, `apps/studio`, `eslint.config.js`, `tooling/*`, `docs/adr`
- 세 저장소 조사 원문(항목별 파일 경로·API 모양)은 이 슬라이스의 세션 스크래치패드에만 있고 저장소에는 올리지 않았다. 필요하면 위 경로에서 다시 뽑는다.
