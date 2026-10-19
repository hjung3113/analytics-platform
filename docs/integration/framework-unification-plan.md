# 프레임워크 통합 계획 — FeedbackOps · equipment-visualization → analytics-platform 프레임워크 (SDK 대비)

> 상태: **Proposed** — 2026-10-17 작성. 세 레포(analytics-platform, FeedbackOps, equipment-visualization)의 프레임워크 조각을 analytics-platform 프레임워크로 어떻게 합치는지의 **지도**다. 나중에 사내 팀용 SDK를 만들 때 다시 조사하지 않도록 현황·중복·목표·단계·지금 지킬 것을 한곳에 둔다. 구현 지시가 아니고, 현행 계약 원본(06·패키지 경계·ADR)을 바꾸지 않는다. 장기 전략은 [#396](https://github.com/hjung3113/analytics-platform/issues/396)(목표는 ADR-0043, 구조 Candidate, 구현 Deferred)이고, 이 문서는 그 §8·§12가 요구하는 "제한된 기능 비교"의 입력이 되는 현황 조사와 단계 제안이다. 둘이 다르면 #396과 사용자 결정을 따른다.
>
> **목표 원본은 [ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)(2026-10-19)이고, 구조·재개 조건은 [#396](https://github.com/hjung3113/analytics-platform/issues/396)이다.** SDK는 플랫폼이 소유하는 하나의 프레임워크이고 플랫폼에 올릴 앱이 지킬 계약이다. 세 제품의 프레임워크가 하는 일을 모두 덮고, 디자인 시스템 결정도 플랫폼 소유이며, 의존은 SDK ← 제품 한 방향이고, 독립 실행은 각 제품 책임이다. 이 문서에서 그와 어긋나는 서술은 ADR-0043이 우선한다: §2.1 "이미 결정된 것"의 디자인 원본 FeedbackOps, §3 판정의 "원본 FO"와 lint 설정 공유 방향, §4.1 그림의 "원본 위치는 패키지별로 다름", §4.3 FO의 "디자인 원본 공급", §5 지킬 것의 "FO primitive를 덮어쓰지 않고 FO 이슈로 제안"(코드 이전 전까지만 유효), §5 피할 것의 배포 단위 보류(Q2는 정해짐), §6 단계 4의 `@fops/ui` peer·Q2 선행, §8 Q4 권고 (b)(사용자가 (a)로 정정).
>
> **코드 대조 정정(2026-10-19):** §2.2·§2.3·§3의 FeedbackOps·EV 서술 중 코드와 어긋난 것은 [SDK 포괄 목록](sdk-coverage-inventory.md) §4가 우선한다.
>
> 사실은 2026-10-17에 읽은 파일·이슈·ADR에서 왔고 끝의 [출처](#9-출처)에 모았다. 읽지 않은 것에서 끌어낸 판단은 **추정**으로 표시했다. 제안 이슈는 **등록하지 않았다**.

## 1. 한 장 요약

- **지금의 통합 모양은 이미 셋이 다르다.** FeedbackOps는 서브모듈 고정 커밋에서 `@fops/ui`·`@fops/shared` 두 패키지만 플랫폼 workspace에 들어오고(디자인 시스템 원본, ADR-0010·0011), 앱은 독립 실행 + 딥링크다(ADR-0027). equipment-visualization(EV)은 반대로 **자기 패키지(`@eqv/*`)가 정본이고 플랫폼이 얇은 소비자**가 되려 하며(EV ADR-0001), 플랫폼 쪽 편입은 #332 게이트에 멈춰 있다. analytics-platform은 Kernel·계약·공통 컴포넌트·셸·생성기·적합성 묶음을 갖지만 모두 `private: true`·`0.0.0`·소스 export라 아직 "설치할 수 있는 SDK"가 아니다(#396 §2).
- **"analytics-platform 프레임워크로 통합"의 뜻**(ADR-0043): 플랫폼이 소유하는 **하나의 프레임워크**가 세 제품의 프레임워크가 하는 일을 모두 덮고, 각 제품은 그 SDK를 소비해 플랫폼에 올라온다. 다른 제품의 성숙한 조각(예: FeedbackOps 토큰·primitive)은 SDK로 흡수하고, SDK는 어떤 제품도 import하지 않는다. 업무 모듈(VOC 흐름, 설비 모델·렌더러, 분석 메뉴)은 각 제품이 소유한다. 다음 산출물은 세 프레임워크 기능을 SDK가 다 덮는지 확인하는 포괄 목록이다(§2·§3 지도에서 출발).
- **SDK 표면 후보**는 `@ap/contracts`(계약·codec·포트), `@ap/kernel`(런타임·Registry·조회 수명주기), `@ap/ui`(토큰·primitive 재수출), `@ap/components`(공통 컴포넌트·차트 프레임), `@ap/shell`(선택), `@ap/server-conformance`(적합성 묶음), `@ap/gen-menu`·`@ap/eslint-config`·`@ap/tsconfig`(개발 도구)다. 제품 고유로 남는 것은 FeedbackOps 앱·백엔드·`@fops/shared`, EV `@eqv/core`·`renderer`·`editor`·Studio, 플랫폼 견본 메뉴와 mock 서버다.
- **단계**는 0(정렬: 이 문서, 중복 정리 #394, 계약 동결 목록) → 1(FeedbackOps 1·2단계 마무리 — #81·#251·#150, 기존 결정대로) → 2(EV 첫 실소비자 — #332·#333·#334·#335, `platform-adapter`를 SDK 호스트 인터페이스의 첫 사례로) → 3(선언·codegen 결정 #148과 실어댑터 #154 — 서버 경계를 SDK에 넣을 모양) → 4(배포 가능한 패키지: 접두사·버전·exports·peer 의존 — #396 §9) → 5(두 번째 호스트 검증: FeedbackOps 모듈의 플랫폼 조립은 ADR-0027 재검토가 선행) 순이다. 각 단계의 선행·결정·위험·이슈는 [§6](#6-단계)에 있다.
- **지금 지킬 것**(SDK가 싸지는 조건): 공개 진입점만 import(이미 lint), `@ap/contracts`의 React·DOM 무의존(이미 규칙), `#platform-assembly`·`PlatformAdapter`·`PlatformLocation` 세 주입 지점을 유일한 호스트 경계로 유지, 테스트 어댑터 스텁을 한 공개 진입점으로(#381), 접두사·런타임 문자열 분리(패키지 경계 §8). **피할 것**: 메뉴 어휘를 포트에 넣기, FeedbackOps primitive 덮어쓰기(ADR-0023), 레포별 conductor 포크 확대(#394), EV 모델을 플랫폼에 복제(EV ADR-0001).

## 2. 레포별 현황

### 2.1 analytics-platform (호스트·Kernel·계약)

| 조각 | 현재 | 원본·결정 |
| --- | --- | --- |
| 패키지 | `@ap/contracts`·`ui`·`kernel`·`components`·`shell`·`mock-server`·`server-conformance`, 메뉴 `@ap/menu-<group>`(`menus/<space>/<group>/`), 앱 `apps/platform-web`·`platform-e2e`, 도구 `@ap/tsconfig`·`eslint-config`·`gen-menu`·`css-selectors`. 의존 방향 `contracts → ui/kernel → components → shell → apps`, 역방향 금지(경계 lint) | [패키지 경계](platform-packages.md) §3·§6·§8, [ADR-0031](../adr/0031-menu-folders-by-space.md) |
| 공개 API 모양 | 모든 패키지 `private: true`·`0.0.0`, TS 소스를 `exports`로 직접 노출(빌드 없음, 앱 Vite가 번들), `workspace:*` 의존. 공개 진입점은 `src/index.ts` 한 곳 + `./styles.css`. 접두사 `@ap/`는 임시 | `packages/*/package.json`, 패키지 경계 §6·§8, [#396](https://github.com/hjung3113/analytics-platform/issues/396) §2 |
| 호스트 경계(주입 지점) | ① 서버: `PlatformAdapter` 포트(`packages/contracts/src/adapter.ts`, 17개 메서드 + `subscribe`) — 메뉴 데이터는 `menuQuery` 하나, 메뉴 어휘 메서드 금지. ② 조립: `#platform-assembly`의 `createAssembly({ registry }) → { adapter, topBarTools }`, 운영 빌드는 `AP_PLATFORM_ASSEMBLY`로 주입하고 CI가 운영 그래프에 mock 없음을 검사. ③ 위치: `PlatformLocation`(`createBrowserLocation`·`createBasePathLocation`) | [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md), [ADR-0009](../adr/0009-production-assembly-injection.md), [ADR-0030](../adr/0030-location-adapter-base-path.md), `apps/platform-web/src/platform-assembly.d.ts` |
| 메뉴(플러그인) 모델 | 코드 내부 선언형 Registry(`MenuEntry = MenuMeta + icon + component`), 그룹 단위 패키지, 공간(`SPACES`)·그룹(`GROUPS`)은 앱 조립 지점이 소유, `createRegistry`가 중복·route 충돌·공간 규칙 검증. 외부 설치형 Plugin SDK는 Deferred | [06 §5](../06_platform_ui_contract.md#5-menu-extension-contract)·[§14](../06_platform_ui_contract.md#14-platform-component-promotion-rule), 패키지 경계 §5 |
| 생성기·경계 도구 | `pnpm gen:menu <group>`이 스켈레톤(`endpoints.ts`·`mock/`·페이지·테스트)과 앱 배선 마커를 쓰고 `--remove`로 되돌림. `repo-invariants`가 폴더–공간 일치 검사. ESLint 프리셋(`contracts`·`kernel`·`menu`·`app`…)이 경계·URL 조립 금지·`@fops/*` 직접 import 금지·`@shadcn/lint` 6규칙 강제 | [tooling/AGENTS.md](../../tooling/AGENTS.md), [ADR-0009](../adr/0009-production-assembly-injection.md) |
| 디자인 시스템 | 토큰·primitive 원본은 플랫폼 `@ap/ui`(Tailwind v4 CSS-first; #441에서 FeedbackOps `@fops/ui`의 토큰·유틸·primitive를 옮겼다, ADR-0046). 플랫폼 확장(차트·카테고리 색, `t-*` 역할, `surface-sunken`)은 `packages/ui/src/styles/`가 소유. 모양·크기 덮어쓰기 금지(접근성 하한 넷과 탭 표식만 예외) | [ADR-0010](../adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md)·[0011](../adr/0011-design-direction-feedbackops-shell.md)·[0023](../adr/0023-feedbackops-primitive-shapes-and-sizes.md), [06 §23](../06_platform_ui_contract.md#23-design-tokens), [DESIGN.md](../../DESIGN.md), [packages/ui/AGENTS.md](../../packages/ui/AGENTS.md) |
| 서버 계약·codegen | `EndpointSpec`(TS)이 유일한 선언 원본이고 클라이언트·mock·적합성 묶음이 같이 읽음. 실서버 선언 사본의 원본(TS→JSON / FastAPI→TS / 각자+비교)은 **Open #148**. HTTP 전송 형식은 Candidate(#149). 공개 스키마 형식(OpenAPI/JSON Schema/codegen)은 Candidate(06 §6.1) | [#148](https://github.com/hjung3113/analytics-platform/issues/148), [전송 형식 초안](http-adapter-contract.md), [실서버 체크리스트](real-server-checklist.md), [사내 적용 가이드](in-house-rollout.md) |
| 인증·SSO | 서버 저장 세션 + httpOnly 쿠키(03), 사내 IdP 사양은 **Open #150**. 클라이언트는 `session()` 동기 스냅샷 + `subscribe`로 세대 전환. FeedbackOps와 IdP 클라이언트 공유 여부는 #150 질문지에 있음 | 사내 적용 가이드 §3.1, [#150](https://github.com/hjung3113/analytics-platform/issues/150), [#98](https://github.com/hjung3113/analytics-platform/issues/98) |
| 딥링크·URL | 06 §6 URL 계약(전역 Context 키, `v`, `returnTo`, 보정 없는 거부). FeedbackOps 양방향 딥링크는 phase-1 allowlist(`contract: 2`, 관찰 커밋 고정), 확장은 #81·#251·#448(복귀 `platformReturn`) | [06 §6.1·§6.4](../06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided), [딥링크 계약](feedbackops-deeplink.md) |
| 멀티 워크스페이스 | 공간 = 업무 시스템, FeedbackOps는 공간별 진입 링크 + 전체 허브 링크, 홈·공지·내 VOC는 전역 유틸리티 | [ADR-0026](../adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)·[0027](../adr/0027-feedbackops-stays-standalone-entry-links.md)·[0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md), [15](../15_multi_workspace_ui.md) |
| 작업 흐름 도구 | conductor 공통 절차는 전역 스킬, 레포 부분은 `.agents/conductor/PROFILE.md`+`scripts/`+`templates/`. 세 레포 포크의 스크립트·템플릿 통합은 **#394 미구현** | [#393](https://github.com/hjung3113/analytics-platform/pull/393), [#394](https://github.com/hjung3113/analytics-platform/issues/394), [.agents/README.md](../../.agents/README.md) |
| 장기 방향 | ① 조립(지금) → ② 선언형 메뉴(PoC 후보, 분석 Capability Registry #291·#292) → ③ 사용자 비정형 분석(결정 대기 #294). 공통 SDK는 #396 | [#291](https://github.com/hjung3113/analytics-platform/issues/291), [#292](https://github.com/hjung3113/analytics-platform/issues/292), [#294](https://github.com/hjung3113/analytics-platform/issues/294) |

이미 결정된 것(바꾸려면 ADR 개정): 패키지 구성·의존 방향·그룹 단위 메뉴·ESLint·접두사(패키지 경계 §8), 조립 주입(ADR-0009), 메뉴 조회 포트(ADR-0019), 디자인 원본 FeedbackOps(ADR-0010·0011·0023), FeedbackOps 독립 앱 + 진입 링크(ADR-0027), 위치 어댑터(ADR-0030), 폴더 = 공간/그룹(ADR-0031). 열린 것: #148 선언 원본, #149 전송 형식, #150 SSO, #151 인프라, #98 권한 쓰기 원천, #81 매핑, #381 테스트 스텁 진입점.

### 2.2 FeedbackOps (디자인 시스템 원본, 독립 협업 서비스)

관찰 기준: 서브모듈 고정 커밋 `dc7638f`(2026-10-13)와 GitHub 이슈. 원본 저장소 기본 브랜치는 `main`, 플랫폼이 따라가는 브랜치는 `develop`([저장소 구조](repository-layout.md)).

| 조각 | 현재 | 원본·결정 |
| --- | --- | --- |
| 구조·스택 | pnpm workspace(`apps/frontend`·`apps/backend`·`packages/shared`·`packages/ui`), pnpm 9.15 / Node 22, Turbo 2.3, Biome(일반 lint·포맷) + Oxlint(`@shadcn/lint` 디자인 lint). 프런트: React, TanStack Router·Query, React Hook Form + Zod, shadcn/Radix, TipTap, cmdk, sonner. 백엔드: Fastify + Drizzle + Postgres 16, `fastify-type-provider-zod`, pg-boss, openid-client | FeedbackOps `package.json`, [ADR-0007](../../products/feedbackops/docs/adr/0007-core-technology-stack.md), [ADR-0062](../../products/feedbackops/docs/adr/0062-design-system-lint-with-shadcn-lint-on-oxlint.md) |
| 디자인 시스템 | `@fops/ui` exports: `.`, `./styles/tokens.css`·`semantic.css`·`theme.css`·`compat.css`(Tailwind v4 `@theme inline`), Pack 17 Samsung-light 토큰, 50px 헤더 리듬·세 셸(`PageShell`·`ListShell`·`WorkbenchShell`), 모션 기반(ADR-0063). 출시된 UI가 권위(ADR-0060). 플랫폼을 위해 Tailwind v4로 올렸고(FO#743) 플랫폼 소비 때 드러난 결함을 고쳤다(FO#746·747·748·749·750) | [ADR-0058](../../products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md), [ADR-0020](../../products/feedbackops/docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md), [ADR-0021](../../products/feedbackops/docs/adr/0021-pack-17-samsung-light-design-system.md), [ADR-0060](../../products/feedbackops/docs/adr/0060-shipped-ui-replaces-prototype-as-ui-authority.md), [FO#743](https://github.com/hjung3113/FeedbackOps/issues/743) |
| 공유 계약 | `@fops/shared`(exports `.`·`./enums`): Zod 스키마·enum·오류 코드(`errors/codes.ts`)·권한·nav 등 프런트·백엔드 공유. **OpenAPI codegen·tRPC 없음** — Zod 스키마를 Fastify Type Provider와 TanStack Query hook이 함께 소비. API 오류 envelope `{ code, message, detail, requestable_permission }`, code 패밀리 → HTTP 상태 표 | ADR-0007 "API type sharing", [ADR-0012](../../products/feedbackops/docs/adr/0012-error-code-contract.md), `packages/shared/src/` |
| 인증·세션 | `AuthProvider` 추상(Mock / OIDC via openid-client, `AUTH_PROVIDER` env), 서버 저장 세션 + httpOnly 쿠키 `fops_session`, capability 기반 내비게이션 | [ADR-0006](../../products/feedbackops/docs/adr/0006-authentication-and-actor-provisioning.md), [ADR-0056](../../products/feedbackops/docs/adr/0056-capability-based-admin-navigation.md) |
| URL·딥링크 | TanStack Router `validateSearch` strict — `/vocs?view=inbox\|my\|triage&managedSystem=…&selected=…`, `/surveys/:id`, `/tasks?view=…`. 플랫폼용 답: 내 설문 응답 API `GET /me/survey-responses`(FO#548 완료), 신고자 `view=my&selected=` 딥링크(FO#549 답변 완료). 플랫폼 복귀 파라미터·VOC prefill·`fo` 버전 키는 미정(AP #81) | [routes-and-layout.md](../../products/feedbackops/docs/frontend/routes-and-layout.md), [FO#548](https://github.com/hjung3113/FeedbackOps/issues/548), [FO#549](https://github.com/hjung3113/FeedbackOps/issues/549), [딥링크 계약](feedbackops-deeplink.md) §5 |
| 메뉴·셸 모델 | Registry 없음. 라우트 트리는 `scripts/generate-routes.mjs`(TanStack Router 파일 기반), 셸은 세 가지로 고정, 내비게이션은 capability로 노출. 플랫폼의 Menu Registry·전역 Context·Audit 계측은 적용되지 않음(ADR-0027 결과) | ADR-0020·0056 |
| 플랫폼과의 연결 상태 | 플랫폼 workspace에 `packages/ui`·`packages/shared`만 포함. 플랫폼 → FO 제안 1건 열림(DialogContent `scrim` variant, FO#1202 = AP #310). 스킬·conductor 정리는 FO#1197(완료)·FO#1199(열림)·FO#1228(페르소나 전역, #393과 짝) | [저장소 구조](repository-layout.md), [FO#1202](https://github.com/hjung3113/FeedbackOps/issues/1202), [FO#1199](https://github.com/hjung3113/FeedbackOps/issues/1199) |
| 버전·릴리스 | 태그 없음(2026-10-17 `gh api …/tags` 빈 목록). 플랫폼은 gitlink로 커밋을 고정하고 올릴 때 lockfile을 같이 갱신, turbo `globalDependencies`에 두 패키지 포함 | 저장소 구조 "원본 변경을 반영하는 절차" |

FeedbackOps가 이미 결정한 것 중 이 계획에 걸리는 것: **플랫폼용 공용 변경은 FeedbackOps 저장소 PR로만**(플랫폼이 서브모듈을 고치지 않음, 딥링크 계약 §3), Zod-first 계약(OpenAPI 아님), 세 셸 고정, 출시 UI 권위. 열린 것: AP #81의 네 항목(매핑·설문 제출 경로·VOC prefill·복귀), FO#1202, FO#1199.

### 2.3 equipment-visualization (EV — 독립 패키지 정본, 플랫폼 첫 실소비자 후보)

관찰 기준: 로컬 클론 `origin/main`(`c8171a0`, slice 1 릴리스 PR #38)과 GitHub 이슈. 읽기만 했다.

| 조각 | 현재 | 원본·결정 |
| --- | --- | --- |
| 구조·스택 | pnpm 11.1.1 / Node 26.7.0 / Turbo 2.11.4 / TS 5.9.3 / ESLint 10 flat — 플랫폼과 같은 툴체인. 패키지 `@eqv/core`(Zod, Layout·OccurrenceBatch·Mapping 스키마 JSON을 subpath export, `dist/` 빌드)·`@eqv/renderer`(SVG Top View)·`@eqv/editor`, 앱 `@eqv/studio`(React). `packages/replay`·`packages/platform-adapter`는 **계획만** | EV `package.json`, `README.md` "Planned packages" |
| 플랫폼 경계 | `core`/`renderer`/`editor`/`replay`는 `@ap/*`·Kernel·셸을 import하지 않음(ESLint 경계 규칙 `tooling/eslint-boundary.test.ts`). 플랫폼 `menus/equipment`에는 페이지 조립·`menuQuery` 선언·`platform-adapter`(테마 매핑, URL/Scope/권한 연결)만. 원천 parser → Occurrence 변환은 플랫폼 서버 책임 | [EV ADR-0001](https://github.com/hjung3113/equipment-visualization/blob/main/docs/adr/0001-standalone-packages-thin-platform-consumer.md), [ADR-0002](https://github.com/hjung3113/equipment-visualization/blob/main/docs/adr/0002-occurrence-input-contract.md), [INTEGRATION.md](https://github.com/hjung3113/equipment-visualization/blob/main/docs/INTEGRATION.md) |
| 디자인 토큰 | renderer가 자체 semantic CSS 변수 `--eqv-*`와 fallback을 소유(#34 완료). 플랫폼 토큰은 `platform-adapter`가 `--eqv-*`에 **주입**(매핑)하며 renderer는 `DESIGN.md`/`@ap/ui`를 직접 참조하지 않음. 앱 primitive(shadcn 등)는 쓰지 않음 | EV ADR-0001, [DESIGN-v0.4.md](https://github.com/hjung3113/equipment-visualization/blob/main/docs/DESIGN-v0.4.md) §"Style tokens" |
| 조회 계약(제안) | `equipment.topview.definition`·`.metrics`·`.inventory`·`.events`를 `defineEndpoint`로 선언, `PlatformAdapter`에 업무 메서드 추가 금지. 쓰기(saveDraft/publish)는 `menuQuery`로 위장하지 않고 **별도 설계 필요**(플랫폼 쓰기 포트 없음) | INTEGRATION.md "API/DTO 제안", AP [#334](https://github.com/hjung3113/analytics-platform/issues/334) |
| 인증·권한·URL | 자체 인증 없음(독립 Studio는 단일 사용자 로컬 도구, 파일 기반 저장). 플랫폼 안에서는 플랫폼이 auth/Scope/time/route/권한/audit을 맡고 EV는 props로 받음. 권한 문자열 후보 `equipment:topview:edit`·`publish`·`replay:view`는 미승인. 재생 커서 `at`은 page-local, `anchor`는 occurrence 식별 | EV `AGENTS.md` "Integration rules", INTEGRATION.md "UI / IA" |
| 시간 정밀도 | `SiteWallClock`이 밀리초 3자리만 받음 — 플랫폼 06 §6.3(원천 정밀도 보존)과의 관계를 ADR로 정해야 함(**EV#44 열림**). INTEGRATION.md의 플랫폼 경로가 `menus/analytics/equipment`로 바뀐 것과 ADR-0009/0030 주입을 반영해야 함(같은 이슈) | [EV#44](https://github.com/hjung3113/equipment-visualization/issues/44) |
| 플랫폼 쪽 편입 상태 | AP #332(서브모듈 편입·접근/CI 정책 게이트) → #333(메뉴·Context·권한·딥링크 설계) → #334(관측 정규화 계약) → #335(standalone↔embedded 회귀). #332는 "EV가 Private"를 전제로 하는데 2026-10-17 `gh api repos/...` 조회에서 `private: false`였다 — 전제 재확인이 필요하다 | [#332](https://github.com/hjung3113/analytics-platform/issues/332)–[#335](https://github.com/hjung3113/analytics-platform/issues/335) |
| 작업 흐름 도구 | FeedbackOps 워크플로를 채택(PR #16) → 전역 스킬로 이동(#46·PR #49), 페르소나 전역(PR #62), 프로필 `.claude/conductor/PROFILE.md`(§Deferrals 추가 PR #66 열림). 미구현 항목은 #60 이연 기록 | [EV#46](https://github.com/hjung3113/equipment-visualization/issues/46), [EV#60](https://github.com/hjung3113/equipment-visualization/issues/60) |
| 버전·릴리스 | 브랜치 `develop` → 릴리스 PR → `main`(merge commit만, 사용자가 병합·태그). 태그는 확인하지 못함 | EV `AGENTS.md` "Git workflow" |

EV가 이미 결정한 것: 독립 패키지가 정본·플랫폼은 얇은 소비자(ADR-0001), Occurrence 입력 계약과 원천 어댑터는 저장소 밖(ADR-0002), Evidence 4단계(ADR-0003), 레이아웃 3 graph(ADR-0004), 매핑 평탄화·Publish 순서(ADR-0005·0007). 열린 것: 시간 정밀도 ADR(#44), 플랫폼 편입 경로(#332), `platform-adapter`·`replay` 패키지의 모양(계획), 쓰기 API.

## 3. 중복·충돌 지도

| 영역 | analytics-platform | FeedbackOps | EV | 판정(제안) |
| --- | --- | --- | --- | --- |
| 디자인 토큰·primitive | `@ap/ui`가 `@fops/ui` 재수출 + 확장 층 | **원본**(`@fops/ui`, Pack 17, Tailwind v4) | 자체 `--eqv-*` 변수, 주입으로 연결 | 중복 아님. 원본 FO, 플랫폼 확장은 `@ap/ui`, EV는 매핑. **충돌 1:** FO 변경이 플랫폼 소비자 요구로 들어가는 경로가 "FO 이슈 제안"뿐이라 느리다(FO#1202 대기 중). **충돌 2:** 라이브러리 버전 이원(lucide 0.469 ↔ 1.48, React 타입 버전은 FO#748로 해소) |
| 셸 | `@ap/shell`이 FO AppFrame 구조를 다시 그림(레일 52/사이드바 240/머리 50) | 앱 안 `PageShell`·`ListShell`·`WorkbenchShell`(패키지 아님) | Studio 자체 셸(얇음) | **구현 두 벌**(치수·토큰은 같음). SDK에서 셸은 "선택적 셸"(#396 §4). FO 셸을 패키지로 뽑을지는 두 번째 소비자가 생길 때 — 지금은 플랫폼 셸만 공개 후보 |
| 디자인 lint | `@shadcn/lint`를 ESLint 프리셋에서, 규칙 옵션은 FO `.oxlintrc.json`을 따라 **수동 동기화** | `@shadcn/lint` on Oxlint(원본) | 없음(primitive 없음) | 규칙 표의 원본이 FO, 사본이 AP `tooling/eslint/src/index.js`(`RESTYLE_CONTRACTS`·`DESIGN_SYSTEM_RULES`). SDK 때 `@ap/eslint-config`가 FO 설정을 읽거나 FO가 공유 설정 패키지를 내야 한다 |
| 어댑터·호스트 계약 | `PlatformAdapter`(서버) + `#platform-assembly`(조립) + `PlatformLocation`(위치) | `AuthProvider`(서버 쪽 인증 추상), 프런트는 `apiClient` + Zod DTO 파서 | `platform-adapter`(계획: theme + context → props) | 세 개의 "adapter"가 **서로 다른 층**이다. SDK 호스트 인터페이스(#396 §5 표: 세션·내비게이션·Context·서버 어댑터·수명주기)로 이름을 정리해야 한다. EV `platform-adapter`가 "플랫폼 → 업무 모듈 방향" 호스트 인터페이스의 첫 사례가 된다 |
| 서버 계약·codegen | TS `EndpointSpec` 원본, 공개 스키마 형식 Candidate, FastAPI 사본 원본 미정(#148) | Zod 스키마 공유(`@fops/shared`), codegen 없음, Fastify Type Provider | Zod 스키마 + JSON Schema export(`@eqv/core/*.schema.json`) | **세 방식이 모두 "TS/Zod가 원본"**이다. #148 A안(TS 원본 → 산출물)이 셋과 정합한다. B안(FastAPI 원본)은 FO·EV 방식과 역방향이 돼 SDK에서 선언 체계가 둘로 갈라진다 |
| 오류·응답 envelope | `ApiResponse { outcome, assessments, trust }`(06 §19), 어댑터는 예외를 던지지 않음 | `{ code, message, detail, requestable_permission }` + code 패밀리 → HTTP 상태 | Data Quality Issues·Evidence level을 응답 안에 | **의미 체계가 다르다**(플랫폼은 outcome·신뢰, FO는 code·요청 가능 권한). 합치지 않는다. SDK 서버 어댑터가 FO code → 플랫폼 outcome 변환을 소유(이미 내 VOC 어댑터가 하는 일, #86) |
| 인증·세션 | 서버 세션 + httpOnly, IdP 미정(#150), 세대 전환 `subscribe` | OIDC provider 구현 완료, 세션 `fops_session`, Mock provider 동봉 | 없음 | 가장 성숙한 구현은 FO(AuthProvider·OIDC). 플랫폼 FastAPI(#155)가 같은 IdP 클라이언트를 공유할지는 #150. **브라우저 세션 공유(쿠키 도메인·SSO)는 셋 중 누구도 결정하지 않음** |
| URL·딥링크 | 06 §6 계약(전역 키·`v`·`returnTo`), codec `@ap/contracts/url.ts` | TanStack Router strict search, 라우트별 스키마, `returnTo`는 Findings만·로그인용 `redirectTo` | `at`(page-local)·`anchor`·layout/mapping 버전 — INTEGRATION 제안 | FO ↔ 플랫폼은 allowlist 계약으로 이미 분리(두 소유자, 보정 없음). EV는 플랫폼 URL 계약 **안**에 들어온다(목적지 ID + page key). **충돌:** 시간 정밀도(EV#44) |
| 메뉴·플러그인 모델 | Registry(선언형, 코드 내부), 그룹 패키지, 생성기 | 파일 기반 라우트 + capability nav | Studio 라우트(얇음) | FO는 Registry 소비자가 아니다(ADR-0027). EV는 Registry 소비자가 된다(#333). SDK의 "기능 선언·호환 규칙"(#396 §4)은 Registry `MenuMeta`에서 출발 |
| 멀티 테넌시 축 | Site/room_name Scope, 공간(`SpaceDef`) | Managed System(uuid) | equipment/layout/mapping 버전 | 1:1 대응 금지가 이미 결정(15 §2, 딥링크 계약). 공간 → Managed System 매핑 표는 **앱 조립 계층**이 공급(#251) — SDK 호스트 인터페이스의 "제품 식별자 대응" 항목 |
| 툴체인 | pnpm 11.1.1 / Node 26.7 / Turbo 2.11 / ESLint 10 / TS 5.9 | pnpm 9.15 / Node 22 / Turbo 2.3 / Biome / TS 5.7 | pnpm 11.1.1 / Node 26.7 / Turbo 2.11 / ESLint 10 / TS 5.9 | AP·EV 동일, FO가 한 세대 뒤. 플랫폼 workspace가 FO 두 패키지를 포함하므로 지금도 pnpm 11로 설치된다(동작함). SDK 배포 때는 peer 범위로 표현 |
| 에이전트 작업 흐름 | `.agents/conductor/{PROFILE,scripts,templates}` | `.claude/conductor` | `.claude/conductor` | **포크 셋**(diff 표는 #394). 제품 코드가 아니지만 SDK 소비자 레포가 늘 때마다 또 복제된다 — #394를 SDK 전에 끝낸다 |
| 테스트 지원 | 어댑터 스텁 17벌 손복사(#381), `test-support` 패키지 내부 3벌 | 자체 fixture | synthetic fixture | SDK는 `@ap/kernel/testing` 같은 공개 테스트 진입점이 있어야 소비자가 스텁을 베끼지 않는다 — #381은 SDK 준비 항목이기도 하다 |

## 4. 목표 — "analytics-platform 프레임워크로 통합"의 뜻

#396 §1·§4·§5를 이 세 레포에 대입한 모양이다. 새 패키지 이름·API는 확정하지 않는다(Candidate).

### 4.1 층과 소유

```text
                 ┌──────────────── SDK 표면(나중에 버전 패키지) ────────────────┐
                 │  @ap/contracts   계약·codec·PlatformAdapter 포트·EndpointSpec  │
                 │  @ap/kernel      Registry·Provider·조회 수명주기·위치·i18n     │
                 │  @ap/ui          토큰·primitive 재수출(원본 @fops/ui) + 확장    │
                 │  @ap/components  공통 컴포넌트·레이아웃 슬롯·차트 프레임        │
                 │  @ap/shell       (선택) 레일·사이드바·팔레트·Context 바        │
                 │  @ap/server-conformance  적합성 묶음(서버 어댑터 검사)          │
                 │  @ap/gen-menu · @ap/eslint-config · @ap/tsconfig  개발 도구     │
                 └───────────────────────────┬────────────────────────────────┘
      원본 위치는 패키지별로 다름 ◀──────────┤
      · 토큰·primitive: FeedbackOps(@fops/ui) │
      · 계약·런타임·도구: analytics-platform  │
                                              ▼
   ┌───────────────── 제품(업무 모듈, 각자 소유) ─────────────────────────────┐
   │ 플랫폼 견본 메뉴 @ap/menu-*    FeedbackOps 앱·백엔드·@fops/shared        │
   │ EV @eqv/core·renderer·editor·(replay)·Studio                             │
   └───────────────────────────┬──────────────────────────────────────────────┘
                               ▼
   ┌───────────────── 호스트(조립 진입점) ────────────────────────────────────┐
   │ apps/platform-web(플랫폼 호스트: #platform-assembly·SPACES·GROUPS·매핑)  │
   │ FeedbackOps 독립 앱(자기 세션·라우터)   EV Studio(독립, 파일 기반)        │
   │ 사내 앱(나중: 같은 SDK + 자기 조립 모듈 + 실어댑터)                      │
   └──────────────────────────────────────────────────────────────────────────┘
```

목표 의존 방향(ADR-0043): 제품은 SDK를 import하고 호스트는 제품을 조립하며, SDK는 어떤 제품도 import하지 않는다. 지금 패키지 경계 §3 규칙 7이 허용하는 `@ap/ui → @fops/ui` 간선은 목표 구조에서 없어진다: 토큰·primitive 코드를 SDK로 옮기고 FeedbackOps가 SDK에서 받아 쓴다(ADR-0043 결과, [§8 Q2](#8-사용자에게-묻는-것과-권고)). 위 그림의 "원본 위치는 패키지별로 다름"은 지금 상태다.

### 4.2 무엇이 SDK 표면이 되고 무엇이 남나

| 구분 | 들어가는 것 | 남는 것(제품·호스트) |
| --- | --- | --- |
| 계약 | `PlatformAdapter`·`MenuQuery`·`EndpointSpec`·`ApiResponse`·URL codec·`feedbackops-link` codec·`Text`·`AuditEvent` | 메뉴별 `endpoints.ts` 선언 값, FO `@fops/shared` 스키마, EV `@eqv/core` 스키마 |
| 런타임 | Registry 검증·`PlatformProvider`·`useMenuQuery`·`useMenuFetch`·`useDrill`·`PlatformLocation`·슬롯 | `SPACES`·`GROUPS`·공간 → Managed System 매핑·실어댑터·`createAssembly` |
| UI | 토큰·primitive·`PlatformDataTable`·`DetailDrawer`·`PageFilterBar`·`StateView`·`AnalysisChartFrame`·레이아웃 슬롯 | 도메인 컴포넌트, FO 세 셸(두 번째 소비자 전까지), EV renderer |
| 도구 | `gen:menu`, 경계·계약 lint 프리셋, tsconfig, 적합성 묶음, 공개 테스트 스텁(#381) | 레포별 conductor PROFILE(절차 자체는 전역 스킬) |
| 개발용 | — | `@ap/mock-server`·메뉴 `src/mock/`·DevTools(운영 그래프에서 제외, ADR-0009). mock 조립은 SDK **예제**로 제공할 수 있지만 SDK 표면은 아니다 |

### 4.3 두 실행 모드

SDK가 맡는 것은 플랫폼 호스트 쪽뿐이다. 제품이 같은 화면을 독립 호스트에서도 돌릴지는 그 제품의 선택이고 SDK는 독립 호스트를 제공하거나 검증하지 않는다(ADR-0043). 지금 세 제품의 실행 모드:

- **플랫폼 견본 메뉴**: 이미 두 조립(`mock` 조립 / `AP_PLATFORM_ASSEMBLY` 운영 조립)이 있다. 사내 앱은 같은 SDK로 플랫폼에 올라오는 앱이다.
- **EV**: 독립 Studio(지금) + 플랫폼 메뉴 페이지(계획, #333). `platform-adapter`가 호스트 → 모듈 방향 인터페이스(테마·Context·권한 → props). 쓰기(publish)는 플랫폼 쓰기 포트가 없어 **독립 모드에서만** 가능한 것이 현실적 1차 범위다.
- **FeedbackOps**: 독립 앱 하나 + 플랫폼은 링크(ADR-0027). 플랫폼 안 조립은 ADR-0027 재검토 없이는 없다(#396 §1). 이 계획에서 FO의 "통합"은 ① 디자인 원본 공급(이미), ② 공유 SSO·딥링크·매핑(1·2단계), ③ 필요하면 FO 셸·AuthProvider 같은 성숙한 조각을 SDK 후보로 **비교**(#396 §3)하는 것까지다.

### 4.4 SDK 저장소·릴리즈 구조 (Candidate, 2026-10-19)

ADR-0043의 목표를 배포 구조로 옮긴 후보다. 이 후보에 대한 결정은 [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)(Decided)다. 사용자가 공유한 참고 문서(2026-10-19)에서 이 계획과 맞는 것을 가져왔다. 결정이 아니고, 단계 4에서 정한다.

- **원본 위치:** SDK 원본은 이 저장소(`packages/`·`tooling/`)에 둔다. 별도 SDK 저장소로 나누지 않는다. 플랫폼 앱(`apps/platform-web`)은 SDK를 배포하지 않으며, SDK 공개 진입점만 쓰는 소비자다. 플랫폼만 쓰는 내부 경로 예외는 두지 않는다(공개 진입점 lint, §5).
- **저장소 하나 ≠ 버전 하나 ≠ 릴리즈 하나:** SDK 패키지의 SemVer와 플랫폼 앱 버전(지금 `v0.x` 태그)은 따로 간다. SDK 안에서 패키지마다 버전을 둘지 묶음 버전으로 갈지는 실제 상호 의존을 보고 고른다. 릴리즈 도구(예: Changesets)도 후보일 뿐이다.
- **첫 배포 대상:** `@ap/contracts`부터 배포하고, 밖에서 실제로 소비가 확인된 패키지만 차례로 연다. 모든 패키지를 한 번에 공개로 바꾸지 않는다.
- **산출물:** ESM, 타입 선언, CSS·자산, 명시적 `exports`, `peerDependencies`(react 등 공유 런타임은 Provider가 두 벌 생기지 않게 peer로 둔다). 다른 저장소는 `workspace:*`가 아니라 고정된 릴리즈 범위와 lockfile로 소비한다.
- **호환표:** SDK 버전, 호스트 계약 버전(`contract`), 플랫폼이 지원하는 기능을 한 표로 둔다. 필수 기능이 맞지 않으면 등록·기동 단계에서 막는다(탑재 설계 §2).
- **업그레이드:** SDK를 릴리즈해도 제품은 자동으로 올라가지 않는다. 각 제품이 자기 일정에 맞춰 올리고, 자기 CI로 검증하고, 되돌린다. 빌드 시 조립하는 구조라서 플랫폼에 탑재된 모듈을 바꾸려면 플랫폼 호스트를 다시 빌드·배포해야 한다.
- **CI 게이트(후보):**
  1. lint·typecheck·test, 공개 API·의존 경계 검사
  2. build + pack
  3. 모노레포 밖 깨끗한 소비자에서 install·typecheck·build
  4. 호스트 계약·등록 적합성 검사
  5. 지원 대상 제품(대표 버전) 통합·E2E
  6. 태그, 변경 이력, 발행

  pack 단계에서 `src/` 경로 노출, 사내 소스·데이터 포함, 해결 안 되는 의존, 빠진 CSS를 검사한다. 계약을 바꿀 때는 호환되는 변경인지 깨지는 변경인지 구분하고, 폐기 예고·이전 안내·되돌리기 방법을 남긴다.

정할 것(Open, 단계 4):

- 원본 위치를 이 저장소로 명문화할지
- 독립 릴리즈 원칙
- 패키지 버전 정책과 첫 배포 대상
- 공개 계약과 내부 전용 API의 경계
- registry 공급자와 사내 망·권한 경로(#151)
- 위 CI 게이트를 수용 기준으로 삼을지
- SDK를 바꿀 때 영향받는 제품의 검증 책임과 업그레이드·되돌리기 정책

## 5. 지금 지킬 것 / 피할 것 (SDK 준비 메모)

지금 바꾸지 않아도 되고, 지키기만 하면 SDK 추출 비용이 줄어드는 것들이다. 대부분 이미 규칙이므로 "유지"가 결정이다.

| 지킬 것 | 왜 | 어디에 있나 |
| --- | --- | --- |
| 공개 진입점(`exports`)만 import, 깊은 경로 금지 | 배포 패키지의 공개 표면 = 지금 `src/index.ts` | 패키지 경계 §3 규칙 4, lint |
| `@ap/contracts`는 React·DOM·Node·외부 런타임 무의존 | 백엔드·다른 호스트와 공유 가능한 유일한 층 | [contracts/AGENTS.md](../../packages/contracts/AGENTS.md) |
| 호스트 경계는 셋뿐: `PlatformAdapter`·`#platform-assembly`·`PlatformLocation` | SDK 호스트 인터페이스(#396 §5 표)의 씨앗. 네 번째 주입 지점을 만들면 SDK 때 합쳐야 한다 | ADR-0009·0019·0030 |
| 포트에 메뉴·제품 어휘 메서드 금지, 데이터는 `menuQuery` | EV·사내 메뉴가 포트를 늘리지 않고 붙는 조건 | ADR-0019 포트 판정 규칙, EV AGENTS "Integration rules" |
| 접두사 `@ap/`는 상수 한 곳, 런타임 문자열에 넣지 않음 | SDK 이름이 정해질 때 일괄 치환으로 끝나게 | 패키지 경계 §8, `tooling/gen-menu/src/prefix.ts` |
| FeedbackOps primitive를 덮어쓰지 않고 FO 이슈로 제안 | 원본이 하나여야 SDK `@ap/ui`가 재수출만 하면 된다 | ADR-0023, FO#1202 절차 |
| 06 계약 어휘(outcome·assessment kind·전역 키)는 Decided, 필드명은 Candidate | SDK 1.0 전에 필드명을 Decided로 올리는 작업이 한 번 필요하다 — 그 전에 새 필드를 늘리지 않는다 | 06 §6.1·§19 |
| 메뉴 패키지 모양은 생성기 출력이 기준 | 사내 메뉴 템플릿 = SDK의 `create-*` 명령. 생성기와 다른 손 구조를 만들지 않는다 | 패키지 경계 §5, tooling/AGENTS.md |
| EV 모델·렌더러를 플랫폼에 복제하지 않음 | EV ADR-0001 | EV ADR-0001, AP #332 "visualization core는 `@ap/kernel`을 import하지 않음" |
| 테스트 어댑터 스텁을 한 공개 진입점으로 | 포트 확장 비용이 소비자 수에 비례하지 않게 | [#381](https://github.com/hjung3113/analytics-platform/issues/381) |

| 피할 것 | 왜 |
| --- | --- |
| 지금 패키지를 npm registry에 올리거나 버전을 매기기 | #396 §8: 두 호스트 증거 전에는 배포 단위를 정하지 않는다. 버전 정책 없이 올린 0.x가 사내 소비자의 lockfile에 박히면 되돌리기 어렵다 |
| 새 패키지 신설(예: `@ap/sdk` 묶음, `@ap/testing`) | #381처럼 **subpath export**(`@ap/kernel/testing`)로 먼저. 패키지 수를 늘리면 SDK 조합표가 커진다 |
| FO 셸·AuthProvider를 지금 플랫폼으로 옮기기 | 두 번째 소비자 없음(06 §14·§24). ADR-0027 범위 밖 |
| 레포별 conductor 스크립트를 더 고쳐 쓰기 | #394가 끝날 때까지 포크 diff가 는다 |
| 플랫폼 Kernel을 FO 라우터(TanStack Router)로 바꾸는 식의 "같은 라이브러리로 통일" | #396 §9: 공유되는 자원의 실제 요구만 맞춘다. 04는 TanStack Router 미채택을 기록 |
| `products/equipment-visualization` gitlink를 #332 게이트 전에 main에 추가 | #332 수용 기준 |

## 6. 단계

각 단계는 독립적으로 끝낼 수 있고, 뒤 단계는 앞 단계의 산출물을 전제로 한다. "결정: 사용자"는 사람이 골라야 하는 것, "결정: 유도"는 계약에서 에이전트가 끌어내 Candidate로 둘 수 있는 것이다. 제안 이슈는 등록하지 않았다.

### 단계 0 — 정렬 (지금, 외부 입력 없음)

| 항목 | 내용 |
| --- | --- |
| 할 일 | ① 이 문서를 Proposed로 두고 #396에 링크. ② #394 conductor 공통본(세 레포 포크 통합). ③ #381 테스트 스텁 공개 진입점. ④ **계약 동결 목록**: 06 §6.1·§19·`EndpointSpec`·`PlatformAdapter`의 Candidate 필드명 중 SDK 1.0 전에 Decided로 올릴 것의 목록(결정은 하지 않고 목록만). ⑤ EV#44 INTEGRATION 경로 정정은 EV 쪽 일 |
| 선행 | 없음 |
| 결정 | 유도: ④ 목록. 사용자: #381 방향(권고 — 진입점 하나) |
| 위험 | 낮음. ④가 "지금 Decided로 바꾸자"로 번지면 06 소유 문서 변경이 되므로 목록까지만 |
| 이슈 | 기존 #394·#381·#396. 제안(미등록): **P0-a** "SDK 1.0 전 Decided로 올릴 Candidate 필드명 목록"(docs, 06 소유자 검토) |

### 단계 1 — FeedbackOps 1·2단계 마무리 (기존 결정 그대로)

| 항목 | 내용 |
| --- | --- |
| 할 일 | #84(설문 응답 이력 — FO API는 있음, 플랫폼 어댑터 연결)·#85(`view=my` 딥링크 — FO 답 있음, 계약·생성기 갱신)·#81(매핑 표 모양·원천, 설문 제출 경로, prefill, 복귀) → #251(공간별 진입 링크 계약·매핑 연결) → #86(실 VOC 어댑터, #150 뒤) |
| 선행 | #81은 사용자 + FO 결정. #86·세션 공유는 #150 |
| 결정 | 사용자: #81 네 항목(권고는 이슈 본문의 보수적 기본값), "FeedbackOps 전체" 링크 노출 권한(#251 권고: 명시적 협업 담당자 권한). 유도: 매핑 표의 공급 위치 = 앱 조립 계층(#251 요구) |
| 위험 | FO strict search가 새 키를 거부하므로 FO PR이 먼저. 세션 공유 전에는 로그인 두 번(ADR-0027 결과) |
| SDK 관점 | 매핑 표·FeedbackOps origin·진입 슬롯은 **호스트가 공급하는 값**의 첫 사례 → SDK 호스트 인터페이스 "제품 식별자 대응" 항목의 모양을 여기서 정한다 |
| 이슈 | 기존 #81·#84·#85·#86·#213·#251, FO#548(완료)·FO#549(완료)·FO#1202 |

### 단계 2 — EV를 첫 실소비자로 (SDK 호스트 인터페이스의 첫 사례)

| 항목 | 내용 |
| --- | --- |
| 할 일 | #332 게이트(접근·CI·버전 고정) → #333(Equipment Detail 탭 vs 새 메뉴, Context 분리, 테마 adapter, 딥링크 키) → #334(관측 정규화 `menuQuery` 엔드포인트 4종, synthetic fixture) → #335(standalone↔embedded 동등성 E2E). EV 쪽은 `packages/platform-adapter`·`packages/replay` 생성(EV 이슈 필요), EV#44 시간 정밀도 ADR |
| 선행 | #332. EV#44는 #334 어댑터 전. 화면은 `?variant=` 프로토타입 컨펌(루트 AGENTS) |
| 결정 | 사용자: #332 정책(권고 아래 Q3), EV#44(권고: 지원 정밀도를 fail-closed로 제한하고 플랫폼 §6.3과의 관계를 EV ADR + 플랫폼 06 주석으로), 권한 문자열(`equipment:topview:*`), 쓰기(publish)를 1차 범위에서 빼는 것. 유도: 엔드포인트 선언 값, 테마 매핑 표(`--eqv-*` ← 플랫폼 토큰) |
| 위험 | 첫 "플랫폼 밖 원본을 플랫폼이 소비"하는 경로라 빌드(`@eqv/*`는 `dist/` 빌드가 있음 — 플랫폼 패키지와 다름)·CSS 소스 등록·turbo 해시가 FO 때처럼 한 번씩 걸린다. private/public 전제 불일치(#332 vs 현재 `private: false`)를 먼저 확인 |
| SDK 관점 | `platform-adapter`가 정의하는 "호스트가 모듈에 주는 것"(테마·Context·권한·수명주기)이 SDK 호스트 인터페이스의 초안이 된다. **EV가 `@ap/*`를 import하지 않는 규칙을 유지**하면 이 인터페이스는 자연히 "타입만 공유"에 가깝다 — SDK 때 그 타입을 `@ap/contracts`에 둘지, EV가 자기 타입을 내고 플랫폼이 맞출지가 결정 항목(Q4) |
| 이슈 | 기존 #332·#333·#334·#335, EV#2·#3·#44·#15. 제안(미등록, EV 레포): **P2-a** `packages/platform-adapter` 뼈대와 테마 매핑 표, **P2-b** `packages/replay`(Studio Focus #15와 겹침 확인). 제안(AP): **P2-c** `products/equipment-visualization` 편입 절차 문서(저장소 구조 문서 확장, #332 뒤) |

### 단계 3 — 서버 경계를 SDK에 넣을 모양 (선언·codegen·실어댑터)

| 항목 | 내용 |
| --- | --- |
| 할 일 | #148 결정 → 선언 내보내기(TS → JSON/JSON Schema) 또는 생성 도구 → #149 전송 형식 Decided → #154 실어댑터(HTTP, `contracts`만 의존하는 모듈) → #155 FastAPI(사내) → #165 세대 재검증 |
| 선행 | #148·#149·#150·#151(사내 입력) |
| 결정 | 사용자 + 사내 백엔드: #148(권고 **A** — TS 원본; §3 "서버 계약·codegen" 행의 근거: FO·EV도 TS/Zod 원본), #149. 유도: 실어댑터 모듈 위치(제안 — `packages/http-adapter` 신설보다 `apps/platform-web/src/assembly/` 또는 사내 저장소에 두고 SDK에는 **적합성 묶음 + 전송 형식 문서**만 넣는 쪽. 어댑터 구현이 SDK에 들어가면 사내 인증·프록시 세부가 SDK에 묻는다) |
| 위험 | #148 B안이면 `gen:menu`·lint·적합성 묶음을 다시 짜야 하고(이슈 본문), FO·EV와 선언 방향이 갈린다 |
| SDK 관점 | 사내 메뉴 개발자가 받을 것 = `EndpointSpec` 타입 + 선언 산출물 + 적합성 묶음 + 전송 형식. 이 넷이 "서버 쪽 SDK"다. A안이면 산출물 생성기가 `@ap/gen-menu` 옆의 도구가 된다 |
| 이슈 | 기존 #148·#149·#150·#151·#154·#155·#157·#165. 제안(미등록): **P3-a** 선언 산출물(JSON Schema) 내보내기와 CI 검사(#148 A안 뒤) |

### 단계 4 — 배포 가능한 패키지 (SDK 1.0 전 작업, #396 §9)

| 항목 | 내용 |
| --- | --- |
| 할 일 | ① 이름: `@ap/` → 사내 이름 일괄 치환(패키지 경계 §8 절차). ② 빌드 산출물: 지금 "TS 소스 export"를 유지할지(소비자가 같은 Vite·TS 설정이어야 함) `dist/` 빌드로 바꿀지(EV `@eqv/core`가 이 방식). ③ `peerDependencies`: react·react-dom·`@fops/ui`(또는 토큰 패키지)·echarts·`@tanstack/*`. ④ CSS: `@ap/ui/styles.css`가 `@fops/ui/styles/*`를 import하는 경로가 모노레포 밖에서 풀리는지. ⑤ 버전·호환표·폐기 정책. ⑥ 모노레포 밖 최소 소비 예제(사내 메뉴 한 개 + 실어댑터 조립)로 설치·빌드·실행 확인. 구조·CI 게이트 후보와 정할 것 목록은 [§4.4](#44-sdk-저장소릴리즈-구조-candidate-2026-10-19) |
| 선행 | 단계 2 또는 3 중 하나의 실제 소비자, 단계 0 ④ 목록을 Decided로 올리는 작업, Q2(primitive 소유) |
| 결정 | 사용자: 이름(Q1), primitive 배포 단위(Q2), 소스 export vs dist(Q5), registry 공급자(사내 npm / tarball / git — #151 망분리 답과 함께). 유도: peer 목록, 호환표 형식 |
| 위험 | `@ap/ui → @fops/ui`가 서브모듈 경로 의존이라 모노레포 밖에서 안 풀린다 — Q2가 선행. React Context 중복 인스턴스(#396 §9) |
| 이슈 | 기존 #396·#151·#232(레포 공개 범위 — 사내 이름·사내 코드가 공개 저장소에 있는 문제와 겹침). 제안(미등록): **P4-a** 접두사 치환 리허설(브랜치에서 치환 → 네 검사), **P4-b** 모노레포 밖 소비 예제 CI |

### 단계 5 — 두 번째 호스트 검증과 FeedbackOps 조각 비교 (#396 §8 "두 번째 소비자")

| 항목 | 내용 |
| --- | --- |
| 할 일 | 사내 앱(실어댑터 + 자기 메뉴)이 SDK를 소비해 플랫폼 호스트와 같은 적합성·E2E를 통과. 그다음에야 FO 조각(세 셸, AuthProvider, 오류 code 카탈로그)을 **기능별로** SDK 후보와 비교(#396 §3) — 채택이 아니라 비교. FO 모듈의 플랫폼 조립은 ADR-0027 개정이 있을 때만 |
| 선행 | 단계 4, 사내 호스트 |
| 결정 | 사용자: ADR-0027 재검토 여부(권고: 하지 않음 — 링크 모델이 비용 대비 충분하고 FO 원본이 계속 발전 중), FO 셸 패키지화 여부(권고: 두 번째 소비자가 생길 때) |
| 위험 | #396 중단 조건(두 업무 원본, 권한·주소 의미 보존 불가, 호스트별 재구현 증가) |
| 이슈 | 기존 #396·#213·#249·#252 |

### 단계와 이슈 한눈에

| 단계 | 기존 이슈 | 제안(미등록) | 사용자 결정 |
| --- | --- | --- | --- |
| 0 정렬 | #394 #381 #396 | P0-a | #381 |
| 1 FO 마무리 | #81 #84 #85 #86 #213 #251 FO#1202 | — | #81, 허브 링크 권한 |
| 2 EV 첫 소비자 | #332 #333 #334 #335 EV#2 #3 #15 #44 | P2-a P2-b P2-c | #332 정책, EV#44, 권한 문자열 |
| 3 서버 경계 | #148 #149 #150 #151 #154 #155 #157 #165 | P3-a | #148 #149 |
| 4 배포 패키지 | #396 #151 #232 | P4-a P4-b | Q1 Q2 Q5, registry |
| 5 두 번째 호스트 | #396 #213 #249 #252 | — | ADR-0027 재검토 |

## 7. 이 계획이 바꾸지 않는 것

- 06·패키지 경계·ADR의 어떤 Decided도 고치지 않는다. 단계 4 ①·②는 소유 문서 변경이 필요하며 그때 ADR로 남긴다. Q2는 ADR-0043이 정했다.
- FeedbackOps·EV 저장소를 이 레포에서 고치지 않는다. 그쪽 일은 그쪽 이슈로(제안 목록의 EV 항목 포함).
- `.planning/README.md`는 이 PR에서 고치지 않는다(다른 세션이 보드를 편집 중). 보드에는 다음 보드 PR에서 "장기: #396 ← 이 문서" 한 줄을 더하면 된다.

## 8. 사용자에게 묻는 것과 권고

| # | 질문 | 권고 | 근거 |
| --- | --- | --- | --- |
| Q1 | SDK 패키지 이름(접두사)을 언제 정하나 | **단계 4 직전**. 지금은 `@ap/` 유지 | 치환은 상수 한 곳 + 일괄 치환으로 설계돼 있어 미뤄도 비용이 늘지 않는다(패키지 경계 §8). #232(공개 범위)와 같이 정하는 편이 낫다 |
| Q2 | 공통 primitive·토큰의 배포 단위 — (a) `@fops/ui`를 FO가 배포하고 `@ap/ui`가 peer로 의존, (b) 토큰·primitive를 플랫폼 저장소로 옮겨 플랫폼이 배포, (c) 서브모듈 유지 | **(b) — ADR-0043이 정함(2026-10-19)** | SDK는 제품을 import하지 않고(의존은 SDK ← 제품), 디자인 시스템 결정도 플랫폼 소유다. (a)·(c)의 기각 이유와 (b)의 비용(픽셀 게이트 이전, SDK 배포 선행)은 ADR-0043 Considered Options |
| Q3 | #332 — EV 편입 방식 | **서브모듈 pin + `@eqv/*` 패키지만 workspace 포함**(FO와 같은 절차). 단, EV가 지금 public이면 #332의 접근 토큰·비밀 노출 절은 간단해지고 "사내 도면 비노출"만 남는다 | FO 선례가 검증됐고(turbo `globalDependencies`, lockfile 절차), EV `@eqv/core`는 `dist/` 빌드라 `allowBuilds`·빌드 순서만 더 보면 된다. 2026-10-17 조회에서 EV `private: false` — 이슈 전제를 먼저 확인 |
| Q4 | EV `platform-adapter`의 호스트 타입을 누가 소유하나 — (a) `@ap/contracts`가 "호스트 → 모듈" 타입을 내고 EV가 그것을 import, (b) EV가 자기 입력 타입을 내고 플랫폼 메뉴가 맞춤 | **(b)로 시작, 두 번째 모듈(사내)이 생기면 (a)로 승격** | (a)는 EV의 "`@ap/*` 미의존" 규칙(EV ADR-0001)을 깬다. 06 §14·§24의 2–3 소비자 기준을 호스트 인터페이스에도 적용 |
| Q5 | SDK 배포 형태 — 소스 export 유지 vs `dist/` 빌드 | **`dist/` 빌드**(ESM + d.ts + CSS), 단계 4에서 | 소스 export는 소비자가 플랫폼과 같은 Vite·TS·Tailwind `@source` 설정을 가져야 한다. 사내 앱 빌드 설정을 통제할 수 없다. EV가 이미 이 방식 |
| Q6 | #148 선언 원본 | **A(TS 원본)** — 기존 권고와 같음 | §3 "서버 계약·codegen": FO(Zod)·EV(Zod + JSON Schema)도 TS 원본. B안은 세 레포 중 플랫폼만 역방향 |
| Q7 | FO 셸·AuthProvider를 SDK 후보로 비교하는 시점 | **단계 5** | 두 번째 소비자 전에는 비교할 근거가 없다(#396 §3·§8). 지금 하면 ADR-0027과 충돌 |
| Q8 | 브라우저 세션 공유(플랫폼 ↔ FO 로그인 한 번) | **#150 질문지에 이미 있음 — 사내 SSO 답을 기다림.** 플랫폼 쪽은 쿠키 도메인·IdP 클라이언트 공유 둘 다 가능하도록 전송 초안 §6을 유지 | 셋 중 누구도 결정하지 않은 유일한 교차 항목(§3 "인증·세션") |

후속(2026-10-17): 단계 5와 Q4·Q7의 호스트 인터페이스·FeedbackOps 탑재 재검토는 [플랫폼 탑재 설계](platform-hosting-design.md)(Proposed, ADR-0038·0039 초안)가 이어받는다.

## 9. 출처

analytics-platform 파일: [AGENTS.md](../../AGENTS.md), [docs/AGENTS.md](../AGENTS.md), [INDEX](../INDEX.md), [06](../06_platform_ui_contract.md) §5·§6.1·§6.4·§14·§19·§23·§24·§29, [15](../15_multi_workspace_ui.md), [DESIGN.md](../../DESIGN.md), [패키지 경계](platform-packages.md), [저장소 구조](repository-layout.md), [사내 적용 가이드](in-house-rollout.md), [실서버 체크리스트](real-server-checklist.md), [전송 형식 초안](http-adapter-contract.md), [딥링크 계약](feedbackops-deeplink.md), [packages/AGENTS.md](../../packages/AGENTS.md), [contracts/AGENTS.md](../../packages/contracts/AGENTS.md), [ui/AGENTS.md](../../packages/ui/AGENTS.md), [menus/AGENTS.md](../../menus/AGENTS.md), [tooling/AGENTS.md](../../tooling/AGENTS.md), [.agents/README.md](../../.agents/README.md), [.agents/conductor/PROFILE.md](../../.agents/conductor/PROFILE.md), `packages/*/package.json`, `packages/contracts/src/{index,adapter}.ts`, `packages/kernel/src/index.ts`, `packages/ui/src/index.ts`, `apps/platform-web/src/platform-assembly.d.ts`, `pnpm-workspace.yaml`, `.planning/{README,backlog,inputs}.md`.

analytics-platform ADR: [0009](../adr/0009-production-assembly-injection.md), [0010](../adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md), [0011](../adr/0011-design-direction-feedbackops-shell.md), [0016](../adr/0016-page-filter-bar.md), [0018](../adr/0018-feedbackops-stage2-screens-into-platform-menus.md)(Superseded), [0019](../adr/0019-menu-query-endpoint-declaration.md), [0023](../adr/0023-feedbackops-primitive-shapes-and-sizes.md), [0026](../adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md), [0027](../adr/0027-feedbackops-stays-standalone-entry-links.md), [0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md), [0030](../adr/0030-location-adapter-base-path.md), [0031](../adr/0031-menu-folders-by-space.md).

analytics-platform 이슈·PR: [#81](https://github.com/hjung3113/analytics-platform/issues/81), [#84](https://github.com/hjung3113/analytics-platform/issues/84), [#85](https://github.com/hjung3113/analytics-platform/issues/85), [#86](https://github.com/hjung3113/analytics-platform/issues/86), [#98](https://github.com/hjung3113/analytics-platform/issues/98), [#148](https://github.com/hjung3113/analytics-platform/issues/148), [#149](https://github.com/hjung3113/analytics-platform/issues/149), [#150](https://github.com/hjung3113/analytics-platform/issues/150), [#151](https://github.com/hjung3113/analytics-platform/issues/151), [#154](https://github.com/hjung3113/analytics-platform/issues/154), [#155](https://github.com/hjung3113/analytics-platform/issues/155), [#157](https://github.com/hjung3113/analytics-platform/issues/157), [#165](https://github.com/hjung3113/analytics-platform/issues/165), [#213](https://github.com/hjung3113/analytics-platform/issues/213), [#232](https://github.com/hjung3113/analytics-platform/issues/232), [#249](https://github.com/hjung3113/analytics-platform/issues/249), [#250](https://github.com/hjung3113/analytics-platform/issues/250), [#251](https://github.com/hjung3113/analytics-platform/issues/251), [#252](https://github.com/hjung3113/analytics-platform/issues/252), [#291](https://github.com/hjung3113/analytics-platform/issues/291), [#292](https://github.com/hjung3113/analytics-platform/issues/292), [#294](https://github.com/hjung3113/analytics-platform/issues/294), [#310](https://github.com/hjung3113/analytics-platform/issues/310), [#332](https://github.com/hjung3113/analytics-platform/issues/332), [#333](https://github.com/hjung3113/analytics-platform/issues/333), [#334](https://github.com/hjung3113/analytics-platform/issues/334), [#335](https://github.com/hjung3113/analytics-platform/issues/335), [#381](https://github.com/hjung3113/analytics-platform/issues/381), [#393](https://github.com/hjung3113/analytics-platform/pull/393), [#394](https://github.com/hjung3113/analytics-platform/issues/394), [#396](https://github.com/hjung3113/analytics-platform/issues/396).

FeedbackOps(서브모듈 `dc7638f`): [AGENTS.md](../../products/feedbackops/AGENTS.md), `package.json`, `pnpm-workspace.yaml`, `packages/ui/package.json`, `packages/shared/package.json`, [routes-and-layout.md](../../products/feedbackops/docs/frontend/routes-and-layout.md), ADR [0006](../../products/feedbackops/docs/adr/0006-authentication-and-actor-provisioning.md)·[0007](../../products/feedbackops/docs/adr/0007-core-technology-stack.md)·[0012](../../products/feedbackops/docs/adr/0012-error-code-contract.md)·[0020](../../products/feedbackops/docs/adr/0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md)·[0021](../../products/feedbackops/docs/adr/0021-pack-17-samsung-light-design-system.md)·[0056](../../products/feedbackops/docs/adr/0056-capability-based-admin-navigation.md)·[0058](../../products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md)·[0060](../../products/feedbackops/docs/adr/0060-shipped-ui-replaces-prototype-as-ui-authority.md)·[0062](../../products/feedbackops/docs/adr/0062-design-system-lint-with-shadcn-lint-on-oxlint.md)·[0063](../../products/feedbackops/docs/adr/0063-motion-foundation.md). 이슈: [FO#548](https://github.com/hjung3113/FeedbackOps/issues/548), [FO#549](https://github.com/hjung3113/FeedbackOps/issues/549), [FO#743](https://github.com/hjung3113/FeedbackOps/issues/743), [FO#746](https://github.com/hjung3113/FeedbackOps/issues/746)–[#750](https://github.com/hjung3113/FeedbackOps/issues/750), [FO#1197](https://github.com/hjung3113/FeedbackOps/issues/1197), [FO#1199](https://github.com/hjung3113/FeedbackOps/issues/1199), [FO#1202](https://github.com/hjung3113/FeedbackOps/issues/1202).

equipment-visualization(`origin/main` `c8171a0`, 읽기만): [AGENTS.md](https://github.com/hjung3113/equipment-visualization/blob/main/AGENTS.md), [README.md](https://github.com/hjung3113/equipment-visualization/blob/main/README.md), [INTEGRATION.md](https://github.com/hjung3113/equipment-visualization/blob/main/docs/INTEGRATION.md), [DESIGN-v0.4.md](https://github.com/hjung3113/equipment-visualization/blob/main/docs/DESIGN-v0.4.md), ADR [0001](https://github.com/hjung3113/equipment-visualization/blob/main/docs/adr/0001-standalone-packages-thin-platform-consumer.md)·[0002](https://github.com/hjung3113/equipment-visualization/blob/main/docs/adr/0002-occurrence-input-contract.md)·0003–0007(제목·상태만), `package.json`, `pnpm-workspace.yaml`, `packages/*/package.json`, `apps/studio/package.json`. 이슈·PR: [EV#2](https://github.com/hjung3113/equipment-visualization/issues/2), [EV#3](https://github.com/hjung3113/equipment-visualization/issues/3), [EV#15](https://github.com/hjung3113/equipment-visualization/issues/15), [EV#44](https://github.com/hjung3113/equipment-visualization/issues/44), [EV#46](https://github.com/hjung3113/equipment-visualization/issues/46), [EV#60](https://github.com/hjung3113/equipment-visualization/issues/60), PR #16·#38·#49·#62·#66.

읽지 않은 것(추정 표시의 근거 한계): FeedbackOps 앱 코드와 `docs/design/*`·`docs/implementation/*` 본문, FeedbackOps 릴리스·태그 이력(API 응답이 빈 목록), EV ADR-0003~0007 본문, EV `.claude/conductor/PROFILE.md`, EV 태그. FeedbackOps 저장소의 최신 `develop`(서브모듈 고정 커밋 이후 변경)은 보지 않았다.
