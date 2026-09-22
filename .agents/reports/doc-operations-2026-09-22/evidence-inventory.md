# 문서 운영 증거 인벤토리

작성일: 2026-09-22

이 보고서는 문서 운영 작업에 사용할 수 있는 현재 원본·리서치·리뷰·레퍼런스의 상태와 근거 경계를 기록한다. 문서의 전역 구조나 이동안을 정하지 않는다. 각 항목은 `[사실]`, `[해석]`, `[다음 확인]`으로 구분했다.

## 0. 조사 범위와 현재 기준점

### [사실] 읽은 범위

- 저장소 지침과 진입점: `AGENTS.md`, `docs/INDEX.md`, `PLATFORM_REQUIREMENTS.md`, `DESIGN.md`, `HANDOFF.md`, `.agents/skills/analysis-platform-wireframe/SKILL.md`.
- 설계 원본: `docs/00`~`docs/07`, 특히 `docs/05_roadmap_and_open_questions.md`, `docs/06_platform_ui_contract.md`, `docs/07_app_shell_wireframe.md`.
- 연구 원본: `docs/research/platform-build-2026-09-22/README.md`, `SYNTHESIS.md`, `01-kernel-frontend.md`, `02-data-performance-operations.md`, `03-reuse-security-integration.md`.
- 리뷰 원본: `docs/reviews/2026-09-18-url-time-status-contract-grilling.md`, `docs/reviews/2026-09-22-component-contract-candidates/{astra-r1,glm-r1,grok-r1}.md`.
- 통합·레퍼런스 원본: `docs/integration/repository-ideas.md`, `docs/integration/component-contract-candidates.md`, `docs/references/standard-log-lifecycle/{README.md,source-manifest.json}`, `.agents/references/design-md/`의 메타데이터와 대표 README/DESIGN 파일.
- 대상 문서 운영 토론의 새 참가자 보고서는 읽지 않았다. 웹·서브모듈 작업·설치·빌드·런타임 실행도 하지 않았다.

### [사실] 현재 checkout 기준점

- 문서 운영 스냅샷은 root `HEAD=2d6fe5ad9f9d610e45ba028930f7c2effdad9d4a`, 시작 상태 `clean`으로 기록돼 있다 (`.agents/reports/doc-operations-2026-09-22/source-snapshot.json:1-4`). 이후 이 작업 디렉터리에는 운영 조사 산출물이 추가됐으므로 그 스냅샷은 조사 시작점이다.
- 2026-09-22 연구 묶음은 별도 과거 기준점인 root `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`, FeedbackOps pin `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`를 사용했다 (`docs/research/platform-build-2026-09-22/SYNTHESIS.md:15-20`, `02-data-performance-operations.md:3-7`). 따라서 연구 문서의 “현재 구현” 문장은 이 checkout의 최신 상태를 자동으로 증명하지 않는다.

### [해석]

원본 문서의 상태 표기와 조사 당시 checkout을 분리해야 한다. 특히 `Decided`는 구현 완료가 아니며, 조사 모델 간 합의도 실행 검증이 아니다. 최신 원본의 내용은 현재 checkout에서 다시 대조해야 한다.

## 1. authority·상태·소유권의 현재 근거

### [사실] 현재 authority map

- `docs/INDEX.md:3`는 저장소를 구현 전 개념 설계로 규정하고 `Decided / Candidate / Open / Deferred`를 구분한다. 플랫폼 런타임은 없고 FeedbackOps는 `products/feedbackops/` 독립 서브모듈이다.
- `docs/INDEX.md:9-17,21-28`은 역할별 진입점과 `00`~`07` 문서 목록을 제시한다. 목록에는 root `DESIGN.md`, `PLATFORM_REQUIREMENTS.md`, `HANDOFF.md`가 없다.
- `docs/INDEX.md:32-40`은 `00`~`05`의 설계 세션 provenance, `06`의 통합 계약, `07`의 wireframe 산출물, 리뷰 디렉터리와 tooling 경계를 설명한다. `06`이 전역 계약/navigation IA, `05`가 상태와 미결 질문, `07`이 `06` 소비자라는 경계를 명시한다.
- `docs/INDEX.md:42-50`은 `docs/research`를 Research/Candidate, `integration/repository-ideas.md`를 후보/브레인스토밍, `integration/component-contract-candidates.md`를 Research/Candidate 초안, Standard Log Lifecycle을 고정 커밋 레퍼런스로 분류한다.
- `docs/06_platform_ui_contract.md:7-16`은 06을 전역 UX/Scope/Context/URL/Menu Extension/Shell Slot/navigation IA의 단일 authoritative source로 규정한다. `Decided`는 책임·행동 계약이지 구현 완료가 아니며, `Candidate`·`Open`·`Deferred`는 각각 예시·미결·후속 범위다. 현재 §7/§15의 셸·테이블 기준은 Decided, §23 토큰 스케일과 §25 반응형은 Candidate다.
- `docs/05_roadmap_and_open_questions.md:1-20,38-47,63-73`은 결정 상태·Open Questions·과거 Phase 가설을 관리한다. `Decided` 메커니즘과 숫자/필드명 Candidate를 구분하며 Phase 0~4는 non-authoritative 가설이다.
- `.agents/skills/analysis-platform-wireframe/SKILL.md:23-25,41,45-46,72-77`은 `.agents/references/design-md/`를 외부 시각 참고로만 한정하고, root `DESIGN.md`를 시각 일관성의 source of truth로 규정한다. 이 스킬은 절차 자산이며 제품 계약 authority가 아니다.

### [해석] 현재 map에서 생기는 독해 예외

- INDEX의 문서 목록과 root 안내 사이에 범위 차이가 있다. `DESIGN.md`는 SKILL에 의해 시각 원본으로 취급되고 `PLATFORM_REQUIREMENTS.md`는 세 모델 종합본인데, INDEX의 role/catalog에서 직접 발견되지 않는다. 이는 authority를 바꾼다는 뜻이 아니라 신규 독자가 root 산출물의 지위를 별도로 판단해야 한다는 사실이다.
- `PLATFORM_REQUIREMENTS.md:11`의 정확한 주장은 체크된 항목이 없다는 것이 “결정됐다”는 뜻이 아니라 “구축 시 필요한 작업/결정”이라는 작성 취지라는 것이다. 동시에 `:25-26`의 §0에는 셸 치수와 테이블 밀도 두 항목이 `[x]`로 기록돼 결정 반영을 나타낸다. 따라서 이 파일의 체크박스만으로 전체 결정·구현 상태를 판정할 수 없으며, 각 항목의 출처와 §0 결정을 따로 대조해야 한다.

## 2. `docs/research`의 상태·provenance·미검증 경계

### 2.1 묶음 전체

### [사실]

- `docs/research/platform-build-2026-09-22/README.md:1-11`은 묶음 전체를 2026-09-22 `Research / Candidate`로 표시하고, 기술 채택·구현 착수·기존 Decided 변경을 승인하지 않는다고 한다. Luna Max 3명의 보고서는 `.agents/reports/platform-research-2026-09-22/`에 변경 없이 보존됐고, 공식 출처·로컬 코드 읽기만 수행했으며 실행·부하·실서비스 적합성은 검증하지 않았다.
- `README.md:18-35`는 R1/R2 모델 토론과 Orca Run `run_448c988f856e`를 기록하지만, 모델 동의는 실행 검증·제품 결정과 다르며 각 R2는 상대 보고서 시점에 대한 반론이라고 명시한다.
- `SYNTHESIS.md:1-20`은 종합안도 `Research / Candidate`이고, 문서·코드 존재는 사실, 우선순위·실패 시나리오는 설계 판단, 성능·운영·실통합 적합성은 미검증으로 분리한다. 시작 root/FeedbackOps pin도 당시 기준점으로 기록돼 있다.
- `SYNTHESIS.md:118-130`은 실제 규모, source/master/metric revision, 결과 수명·만료, IdP/Scope, 배포/분석 언어가 미결이며 플랫폼 서버·DB·IdP·부하·접근성 실기기·장애 복구를 실행하지 않았다고 한다. OSS 버전·라이선스·edition은 조사 시점 후보 정보라 채택 시 재검토해야 한다.

### [해석]

이 묶음은 “원본 문서에 어떤 후보와 보정이 있는가”를 찾는 증거로는 쓸 수 있으나, 최신 라이브러리 선택·성능·운영 능력·통합 완료를 증명하는 근거로 쓸 수 없다. 연구 문서의 권고 문장은 원본 계약의 상태 문장과 섞지 않아야 한다.

### 2.2 담당별 연구 원본

### [사실]

- `01-kernel-frontend.md:1-16`은 공개 URL/Context codec, Menu Registry, table/chart/accessibility를 후보로 제안하면서 구현·설치·benchmark·API/DB/권한 연동을 하지 않았다고 한다. `:20-44`는 현재 FeedbackOps의 실제 자산과 미확인 runtime/API/schema/CJK/동시성/성능을 분리한다.
- `01-kernel-frontend.md:49-59`의 버전 정보는 성격이 서로 다르다. FeedbackOps 고정 manifest의 TanStack Router `1.170.1`, TanStack Query `5.62.7`, React `19.0.0`, Zod `3.25.67`, Zustand `5.0.2`, Tailwind `3.4.17`은 독립 제품 관찰값이고, ECharts `6.1.0`은 upstream package JSON 확인값이다. Radix/Base UI/React Aria 등은 후보 비교이며 플랫폼 채택 버전이 아니다.
- `01-kernel-frontend.md:167-181`의 “최소 조합”과 `:183-211`의 vertical verification은 candidate 검증 경로다. 공식 capability를 확인했지만 latency, bundle size, row limit, CJK, screen reader, 사용자 만족도는 측정하지 않았다.
- `01-kernel-frontend.md:213-236`은 공식 문서를 capability/license 근거로만 사용하고 실제 route 실행·성능·권한/API behavior는 확인하지 않았다고 명시한다. 구현·구매 시 upstream 버전·가격·지원 범위를 재확인해야 한다.

- `02-data-performance-operations.md:1-7`은 조사/제안 상태, root/FeedbackOps 기준점, 2026-09-22 공식 자료 확인일을 기록하며 runtime·load·migration·PostgreSQL server 실행을 하지 않았다고 한다. 숫자 latency/throughput/retention/SLO는 측정 전 가정이다.
- `02-data-performance-operations.md:25-40`은 parser read-only/view/mart, 5개 버전 분리, generation·watermark·wall-clock·outcome/assessments, 권한 재검증을 기존 계약으로 요약하고 backend/SSO/tenant/deployment/volume/retention/TZ를 Open으로 둔다.
- `02-data-performance-operations.md:42-68`은 root에 runtime/migration/test가 없고 FeedbackOps 구현은 독립 제품 관찰값이라고 한다. FeedbackOps 의존성은 Fastify `5.2.0`, Drizzle `0.38.2`, pg `8.13.1`, pg-boss `^12.18.2`, Pino `9.5.0`, Zod `3.25.67`로 기록된다.
- `02-data-performance-operations.md:275-296`은 공식 PostgreSQL 자료의 확인일과 범위를 기록한다. 특히 pg-boss upstream package `12.33.3`과 FeedbackOps의 `^12.18.2`를 같은 실행 버전으로 가정하지 않는다. managed-service 지원·실제 운영 버전·benchmark는 별도 확인 대상이다.

- `03-reuse-security-integration.md:1-12`는 설계 제안이며 `[I] 구현 확인`, `[D] 문서 계약`, `[U] 검증 불가/미구현` 표기를 사용한다. 파일이 없다는 검색 결과와 실서비스 동작을 구별한다.
- `03-reuse-security-integration.md:45-64`는 FeedbackOps의 OIDC/Actor/session/Permission/Audit/Entity Link가 고정 커밋에서 확인된 구현이고, notification은 ADR 설계만 있으며 FileGateway/parser/ProjectGraph/Jira/MES adapter는 확인되지 않았다고 분리한다.
- `03-reuse-security-integration.md:81-89`는 외부 로컬 자산을 read-only로 확인했다고 하며 FileGateway `30d89a5210e5b3bd8c9c6a6c1fff8469867d7be8`, ProjectGraph `bd3bda9aeeede6cd6856facb3aa70b64f88eb45a`, parser `d84fab18fa10ead7f59b8169de25848f34a5164b`를 참조한다. FileGateway의 offsetless `Asia/Seoul` 해석과 플랫폼 wall-clock 의미는 동일하다고 단정하지 않고, ProjectGraph static lineage와 platform runtime lineage도 분리한다.
- `03-reuse-security-integration.md:255-260`은 repository-integration 후보 목록, FeedbackOps 실제 코드, FileGateway 시간, ProjectGraph hash를 서로 다른 증거축으로 둔다. `:262-289`는 OIDC/RFC/Keycloak/OpenFGA/OPA 등의 공식 자료를 2026-09-22에 capability/license 확인용으로만 사용했고, SSO issuer, Scope 규칙, 배포, volume, retention, raw log ACL, parser watermark, artifact publication은 미확인이라고 한다.

### [해석]

연구의 가장 강한 사실은 “어디까지 읽었고 무엇을 실행하지 않았는가”이다. FeedbackOps의 버전과 코드 존재는 플랫폼 채택 증거가 아니며, 외부 서비스의 HEAD·문서·ADR 읽기는 runtime/API/권한 검증과 다른 등급이다. 연구 문서에서 후보 이름과 확인된 구현이 같은 표에 있을 때 `[I]/[D]/[U]` 및 조사일·커밋을 함께 보존해야 혼동을 줄일 수 있다.

## 3. `docs/reviews`의 지위와 현재 원본 대조

### 3.1 2026-09-18 URL/시간/상태 review

### [사실]

- `docs/reviews/2026-09-18-url-time-status-contract-grilling.md:1-23`은 4라운드 32문항의 interview/grill 기록이며, 문서 자체는 authoritative source가 아니라고 한다. 06/05/03/01이 계속 권위 원본이다.
- `:9-20`에서 Scope 계층, 실제 TZ 값, backend/SSO/tenant/deployment/scale/retention, 지연완료 숫자는 사용자·운영 도메인 지식이 필요한 범위로 제외했다. URL, 시간 경계, status taxonomy, 실시간성·DB 접근·late-arrival 메커니즘만 대상이었다.
- `:134-148`은 polling+completed generation, same Postgres/read-only/platform schema, `lateArrivalAutoHorizon`·`R`·`H` 메커니즘을 합의했지만 숫자는 Open으로 남겼다.
- `:163-183`은 권한 ID 노출 정책, 필드/enum 이름, 숫자, websocket 조건, DST 세칙, backfill UI/권한, assessment kind를 여전히 미해결 또는 범위 밖으로 남긴다.
- `:184-186`은 반영 가능한 결정이 06/05에 Open→Decided로 반영됐고, review의 구체 숫자·필드명·enum은 Candidate라고 설명한다.

### [해석]

이 review는 06/05에서 현재 문구의 근거를 찾는 provenance link로는 유효하지만, 그 자체를 구현 또는 최신 운영 정책의 증명으로 사용하면 안 된다. 숫자·필드명·enum·실제 TZ 값을 “review에서 합의됐으니 확정”으로 승격할 수 없다.

### 3.2 2026-09-22 component-contract-candidates R1

### [사실]

- `docs/reviews/2026-09-22-component-contract-candidates/{astra-r1,glm-r1,grok-r1}.md`의 머리말은 모두 2026-09-22, 대상은 `docs/integration/component-contract-candidates.md`, 상태는 review/judgment/proposal이며 대상 문서·전역 계약을 수정하지 않았다고 명시한다 (`astra-r1.md:1-7`, `glm-r1.md:1-9`, `grok-r1.md:1-9`).
- Astra는 `astra-r1.md:9-18`에서 §18/§19 혼동, 정적 코드 계보와 런타임 데이터 계보, FileGateway current/history 축, lifetimeworkflow 승인 신호, nexus/vocpage 필드 보류를 판정 제안으로 구분한다.
- GLM은 `glm-r1.md:11-16`에서 4개 사실 오류와 2개 보강 갭을 기록하고, `:110-116`에서 5개 로컬 원본만 스팟검증하고 설치·빌드·테스트·DB·웹 검색을 하지 않았다고 한다.
- Grok은 `grok-r1.md:13-18` 및 `:319-326`에서 후보 초안의 근거·표현을 검토했으나 관련 외부 저장소 전수 확인, 테스트, 웹 검증을 하지 않았다고 한다.
- Astra의 검증 한계(`astra-r1.md:122-126`)도 06 전체 및 관련 원본의 부분 대조임을 명시한다. 특히 parser/nexus/vocpage 및 여러 후보 저장소는 전수 또는 새 직접 검사가 아니다.

### [해석]

R1 3종은 후보 문서의 사실 오류와 누락된 예외를 교정하는 review evidence이지, 후보 채택이나 원본 프로젝트의 현재 유효성을 보증하는 approval record가 아니다. R1의 “정정됨”은 대상 후보 문서가 그 review 이후 실제로 수정됐는지와 별도 확인해야 한다.

## 4. 외부 레퍼런스의 provenance·버전·예외

### 4.1 Standard Log Lifecycle

### [사실]

- `docs/references/standard-log-lifecycle/README.md:1-12`는 상태를 `Reference only`로 고정하고, 원본 GitHub 저장소의 `main` 커밋 `2d2dce25087a6a7b469e60fde448a76b29055041`을 2026-09-18에 보관했다고 한다. `upstream/`에는 Markdown 7개만 원본 구조·내용 변경 없이 보관하며 자동 동기화하지 않는다.
- `README.md:14-22`는 7개 Markdown 각각의 용도와 `UI_RESEARCH.md`가 원본의 외부 UI 조사 기록이지만 이번 작업에서 외부 제품 정보를 재검증하지 않았음을 명시한다.
- `README.md:24-30,48,50-84`는 기존 06/07/02 계약이 우선이고, 독립 제품의 Navigation·치수·토큰·URL·권한 가정을 플랫폼 계약으로 복사하지 않는다고 한다. 화면 4종은 `Concept / Sample data`, 실제 페이지·운영 수치가 아니며 `모델 표준 로그`·`설비 진행 간트` 배치는 Candidate다.
- `source-manifest.json:1-20`은 source repository/branch/commit/import date, 7개 파일의 Git blob SHA, 복사하지 않은 `wireframes/*.dc.html`·`canvas.json`, 고정 commit HTML 링크, `automatic_sync: false`를 기록한다. 따라서 Markdown 사본의 integrity는 확인되지만 HTML/canvas나 현재 upstream 상태의 유효성까지 증명하지 않는다.

### [해석]

이 레퍼런스는 provenance가 가장 구체적으로 고정된 외부 문서다. 다만 commit 고정은 “그때 보관한 사본이 원본과 일치한다”는 뜻이지, 플랫폼 도메인 요구·운영 수치·현재 upstream 제품 상태의 증명이 아니다.

### 4.2 `.agents/references/design-md/`와 root `DESIGN.md`

### [사실]

- `.agents/skills/analysis-platform-wireframe/SKILL.md:23-25`는 `.agents/references/design-md/`를 `awesome-design-md` 외부 시각 참고로만 분류하고, 브랜드 DESIGN을 wholesale copy하지 말고 1–3개 원칙만 root `DESIGN.md`에 추출하라고 한다.
- 각 대표 README는 세부 문서를 외부 `getdesign.md` URL로 안내한다 (`.agents/references/design-md/linear.app/README.md:1-4`, `clickhouse/README.md:1-4`). 대표 `DESIGN.md`에는 `version: alpha`와 source pages가 있으나(`linear.app/DESIGN.md:1-4,277-280`, `clickhouse/DESIGN.md:1-4`), 이 로컬 사본에는 공통 capture date, upstream commit, 원본 페이지 hash가 없다.
- `DESIGN.md:559-595`는 root 파일을 SKILL step 5 산출물로 설명하고, 외부 reference는 marketing/landing-page 원칙의 좁은 추출이며 제품 UI/계약을 그대로 복사하지 않았다고 한다. 소스 표에는 `linear.app`, `clickhouse`, `supabase`, `mongodb`, supplied screenshot, interface-design/ui-ux-pro-max, 06 계약이 구분돼 있다.
- `DESIGN.md:593`의 supplied screenshot 출처는 사용자 홈 디렉터리의 절대 경로와 해상도만 기록한다. `DESIGN.md:609-641`은 visual recipe와 platform contract를 구분하고, pipeline/scheduler/lifecycle은 menu-owned Candidate라고 한다.
- `DESIGN.md:930-946`의 Open Decisions에는 dark mode, chart library, icon set, component binding, date preset 의미, queue/lifecycle semantics, profile/bulk action inventory가 남아 있다. `DESIGN.md:941`은 §23 값과의 시각 정렬을 Resolved라고 표현하지만 현재 `docs/06:16`은 §23 토큰 스케일을 Candidate로 유지한다.

### [해석]

외부 디자인 corpus의 로컬 파일 hash는 현재 스냅샷에 기록돼도(`source-snapshot.json`의 `.agents/references/design-md/*` 항목), 원본 사이트의 현재성·재현성·라이선스·capture provenance를 대신하지 않는다. root `DESIGN.md`의 “원칙 추출”은 시각 근거이고, 06의 URL/Scope/Data Trust/권한 계약이나 제품 runtime evidence가 아니다. screenshot 절대 경로와 source-page capture metadata는 후속 재확인 때 이식성 예외로 취급해야 한다.

### 4.3 연구에서 사용한 OSS·로컬 구현 reference

### [사실]

- `01-kernel-frontend.md:49-59,213-236`은 TanStack/ECharts/Radix/Base UI/React Aria/AG Grid/BI 관련 공식 URL을 capability/license 확인에 사용했으며, 조사 시점은 2026-09-22다. 공식 설명은 local performance, CJK, screen-reader, permission behavior의 통과 증거가 아니다.
- `02-data-performance-operations.md:283-296`은 PostgreSQL 17/18 자료, pg_cron, pg-boss, TimescaleDB, ClickHouse, OpenTelemetry 등의 공식 자료를 확인했다고 한다. pg-boss upstream `12.33.3`과 FeedbackOps local declaration `^12.18.2`는 동일 버전으로 가정하지 않는다.
- `03-reuse-security-integration.md:262-288`은 OIDC Core/PKCE/openid-client/Keycloak/OpenFGA/OPA 등의 URL과 조사일을 기록하지만, 실제 IdP·managed service·법적/지원 조건·운영 deployment를 검증하지 않았다.
- 로컬 reference commit은 FileGateway `30d89a5…`, ProjectGraph `bd3bda9…`, parser `d84fab…`로 고정해 읽었지만, 각 보고서가 명시하듯 build/test/server/외부 호출은 하지 않았다 (`03-reuse-security-integration.md:81-89,284-289`).

### [해석]

버전/edition/license 표는 “조사 시점 후보 목록”이다. 구현·구매·통합 판단 때에는 후보의 정확한 release, 가격/지원, 라이선스 경계, local lockfile와의 일치 여부를 다시 확인해야 한다. 이 보고서에서는 외부 URL의 현재 유효성이나 완전성을 주장하지 않는다.

## 5. 2026-09-21 문서 단일 책임 감사의 현재 유효성

두 감사는 각각 2026-09-21의 다른 checkout에서 작성됐다 (`.agents/reports/docstructure-grok.md:1-9`, `.agents/reports/docstructure-codex-astra.md:1-7`). Codex Astra 감사의 기준 commit은 `36f14fd8e41782f32dfee5e9c7193659fa0247d4`이고, 현재 운영 스냅샷은 `2d6fe5…`다. 감사의 line number와 상태 판정은 당시 snapshot으로 취급한다.

### 5.1 현재 원본으로 재확인되는 주장

### [사실]

- 두 감사가 공통으로 찾은 `06` authority / `05` decision-state 경계는 현재도 `docs/INDEX.md:36-40` 및 `docs/06:7-16`에서 확인된다.
- INDEX에 root `DESIGN.md`·`PLATFORM_REQUIREMENTS.md`·`HANDOFF.md`가 문서 목록으로 직접 등재되지 않았다는 진단은 현재 `docs/INDEX.md:19-28`에 그대로 나타난다.
- `DESIGN.md`가 시각 토큰뿐 아니라 dashboard reference recipe, product open decisions, 리뷰 정정과 업무 의미를 포함한다는 진단은 `DESIGN.md:569-641,930-946`에서 현재도 확인된다. 다만 이 내용은 감사의 이동 제안이 아니라 현재 파일의 구성 사실이다.
- 04/06/DESIGN 사이에 상태·컴포넌트·토큰·화면 패턴이 중첩된다는 진단은 현재 `docs/04:5-19,44-79`, `docs/06:739-815`, `DESIGN.md:599-605`를 대조하면 확인된다. 어느 값을 옮길지는 이 인벤토리에서 정하지 않는다.
- `PLATFORM_REQUIREMENTS.md`가 여러 원본의 요구/제안 backlog와 Open 목록을 합친 작업용 종합본이라는 진단은 `PLATFORM_REQUIREMENTS.md:1-18,160-189`에서 확인된다. 이 파일은 계약 authority가 아니다.

### 5.2 감사 이후 수정되어 현재는 stale인 주장

### [사실]

- 두 감사가 `docs/06:16`의 셸/테이블 상태를 stale Candidate로 취급한 부분은 현재 원본에서 수정됐다. 현재 `docs/06:16`은 2026-09-21에 셸 270px/54px과 최소 행 32px을 `DESIGN.md` canonical로 Decided했다고 명시하고, `docs/06:301-314`에 Baseline과 단일 기준을 적는다.
- 두 감사가 `docs/07`의 URL/time Open 표를 그대로 stale이라고 기록한 부분은 현재 `docs/07:128-140`에서 일부 보정됐다. 현재 `:135`는 URL 메커니즘을 Decided, 필드명은 Candidate로, `:136`은 시간 메커니즘 Decided와 실제 TZ/다중 사업장 날짜 의미 Open으로 나눈다.
- 감사가 `.agents/skills/analysis-platform-wireframe/SKILL.md:76`을 “root DESIGN 없음”으로 기록한 주장은 현재 파일의 `:76`이 root `DESIGN.md` 존재를 명시하므로 더 이상 현재 사실이 아니다.
- 감사가 `PLATFORM_REQUIREMENTS.md:166`을 미해결 셸/밀도 질문으로 기록한 주장은 현재 `:166`에서 취소선으로 해결됨을 표시하므로 stale하다. `:25-26`도 두 항목을 `[x]`로 기록한다.
- 감사가 `docs/00:23`·`docs/03:22`에 “04의 딥링크 절” 같은 오래된 포인터가 남아 있다고 기록한 주장은 현재 원본과 일치하지 않는다. `docs/00:23`은 06 §6.3을, `docs/03:22`는 06 §6.1을 직접 가리킨다. 이 항목은 당시 검색 결과의 역사로 보존할 수 있지만 현재 stale reference로 재보고하면 안 된다.

### 5.3 현재에도 남은 실제 stale/혼합 문장과 놓친 예외

### [사실]

- `DESIGN.md:942`는 “`docs/06`이나 `docs/07`이 exact pixel width를 pin하지 않았다”고 말한다. 현재 `docs/06:301-314`는 sidebar 270px/top header 54px를 `Baseline (Decided)` 및 canonical 단일 기준으로 명시하고 `docs/05:14`, `PLATFORM_REQUIREMENTS.md:25-26`도 같은 결정을 기록한다. 따라서 `DESIGN.md:942`의 역사 설명은 현재 기준으로 stale하다. 같은 문장의 270/54 토큰 값 자체는 현재 값과 일치한다.
- `docs/07:105`는 URL serialization/collision policy를 “§6.4의 Open 결정”이라고 쓴다. 그러나 현재 `docs/07:135`, `docs/05:12`, `docs/06:16`은 §6.4의 메커니즘을 Decided로 두고 필드명·문자열 같은 세부만 Candidate/Open으로 남긴다. 문장 전체가 틀렸다고 보기보다, 메커니즘과 세부 미결을 섞은 stale status pointer다.
- `docs/01:59`, `docs/02:9-10,21,25-26`, `docs/03:26`은 Phase 0~4를 “결정한다/고정한다/이후에만 가능”한 실행 순서처럼 서술한다. 반면 `docs/INDEX.md:40`과 `docs/05:63-65`는 Phase 0~4를 Deferred/non-authoritative 가설로 분명히 규정한다. 이 문장들은 현재 계약을 직접 변경하지 않지만 Phase를 일정·착수 지시로 오독할 수 있는 예외다.
- `DESIGN.md:941`의 “§23과 정확히 match / Resolved”는 시각 값 정렬 사실을 말하지만, 현재 `docs/06:16`의 §23 status는 Candidate다. “값 일치”와 “계약 상태 승격”을 같은 의미로 읽지 않아야 한다. `PLATFORM_REQUIREMENTS.md:32`도 §23 Candidate와 코드 부재를 함께 기록한다.

### [해석]

이전 감사의 migration/분리 제안은 이 인벤토리의 사실 목록이 아니다. 현재 재확인된 stale 문장은 세부 status/역사 설명에 집중돼 있으며, 수정 여부를 결정하기 전에 위 원본과 직접 대조해야 한다. 특히 stale pointer를 정리하면서 원래 남겨 둔 Open 예외(TZ 실제 값, Scope hierarchy, 숫자, field/enum)를 닫으면 안 된다.

## 6. `PLATFORM_REQUIREMENTS.md` Open Question coverage

### [사실] 현재 목록이 덮는 범위

- `PLATFORM_REQUIREMENTS.md:162-180`은 15개 통합 Open을 가진다. 1번 셸/테이블은 해결 표시이고, 2~15번은 Scope, 시간 의미, 운영 수치, 인증·조직·배포, status source, public contract artifact/URL sunset, design binding, 공지·알림, usage metrics, 업무 모델, 운영 완료 기준, 추가 메뉴 조건, Donut/Gauge, 보조기술 사용자다.
- 원본 대응은 대체로 존재한다. Scope/TZ/운영 숫자/인증·배포는 `docs/05:17,38-47`; 공개 계약 산출물의 구현 형식(OpenAPI/JSON Schema/codegen)은 `docs/06:208-216`의 §6.1에서 Candidate로 표시되고, 관련 미결 필드·enum·URL sunset은 `PLATFORM_REQUIREMENTS.md:172` 및 review `:163-175`에 있다; 실시간성·late-arrival 메커니즘은 `docs/05:49-61`; Data Trust/status source는 `docs/06:739-815`; visual binding과 date presets는 `DESIGN.md:930-946`에 있다.
- `PLATFORM_REQUIREMENTS.md:30-42,105-158`의 체크리스트는 토큰·차트·접근성·Data Trust·메뉴/권한/감사·generation·export·operational controls까지 넓게 포함하며, §0의 두 결정 항목을 제외한 구축 항목은 `[ ]`로 남아 있다. `:11`의 작성 취지는 체크된 항목이 없다는 사실을 결정으로 읽지 않는 것이고, `:25-26`의 `[x]`는 별도로 결정 반영을 표시한다. 따라서 backlog와 contract status를 한 칸으로 표현하지 않는다.

### [사실] 현재 목록에서 직접 다루지 않거나 다른 문서에만 있는 항목

- 문서 source provenance와 refresh 정책: 고정 commit/blob SHA, import date, automatic sync 여부는 Standard Log Lifecycle manifest (`docs/references/standard-log-lifecycle/source-manifest.json:1-20`)에 있지만 `PLATFORM_REQUIREMENTS.md:162-180`의 Open 항목으로는 별도 추적되지 않는다. `.agents/references/design-md/`의 capture date/upstream commit/hash 부재도 Open list에 없다.
- 외부 reference/OSS evidence freshness: 연구 문서는 조사일·후보 버전·재확인 필요성을 기록하지만(`01:213-236`, `02:283-296`, `03:274-288`), `PLATFORM_REQUIREMENTS`에는 “어떤 외부 사실을 언제 다시 확인할지” 또는 owner/expiry를 묻는 항목이 없다.
- 결과 revision의 보유·만료·삭제 경쟁과 활성 읽기 보호: `SYNTHESIS.md:120-123`에서 미결이며 `PLATFORM_REQUIREMENTS.md:169,177`의 운영 수치/RTO-RPO가 일부 관련되지만, `generation/revision`의 지원 수명·만료 UX를 명시한 Open 항목은 보이지 않는다. `docs/05` 자체도 결과 수명은 연구 종합의 미결 입력으로 남긴다.
- static code lineage와 runtime value lineage, source artifact hash와 generation/watermark/calculation basis의 구분은 `03-reuse-security-integration.md:85-87,255-260`과 `component-contract-candidates.md`에 있으나 `PLATFORM_REQUIREMENTS`의 Open 목록에는 별도 구분 항목이 없다. 이는 후보 계약을 채택해야 한다는 뜻이 아니라, 같은 “provenance” 단어가 다른 축을 가리킨다는 문서 운영 예외다.
- review/조사 evidence의 품질 등급(spot-check, no web, no test, dirty worktree 보존)은 각 연구·리뷰 문서의 한계에 흩어져 있고 `PLATFORM_REQUIREMENTS`에는 직접 나타나지 않는다.

### [해석]

Open 목록은 제품·운영 의사결정 질문을 넓게 덮지만, “문서를 언제 어떤 원본과 버전으로 갱신할 것인가”와 “외부/조사 증거를 어느 수준까지 신뢰할 것인가”는 별도 메타 질문으로 남아 있다. 이를 제품 계약으로 오인해 새 기능 요구로 확정할 근거는 없으며, 현 단계에서는 문서 운영 evidence gap으로만 기록한다.

## 7. 다음 검증 후보

아래는 전역 구조 제안이 아니라, 현재 사실과 stale pointer를 확정하기 위한 제한된 확인 항목이다.

1. `DESIGN.md:942`, `docs/07:105`, `docs/01:59`, `docs/02:9-10,21,25-26`, `docs/03:26`을 원문 대조표에서 각각 `현재 사실 / 역사 설명 / 상태 pointer`로 판별한다. 270/54/32, URL 메커니즘, TZ·Scope·숫자 Open 예외는 별도 열로 유지한다.
2. 연구 문서의 기준점(`e999…`, FeedbackOps `b5dd…`)과 현재 checkout snapshot(`2d6fe5…`)을 문서별 provenance metadata로 표시할지 확인한다. 연구 내용 자체를 최신 runtime 사실로 승격하지 않는다.
3. `source-manifest.json`의 Standard Log Lifecycle 고정 commit/blob SHA와 local `upstream/` 사본을 다시 비교할 필요가 생기면 그때만 수행한다. 자동 동기화나 HTML/canvas 복사는 현재 문서가 금지한 범위다.
4. `.agents/references/design-md/`를 다시 사용할 때는 각 reference의 source pages, capture date, upstream revision, 라이선스/사용 범위를 확인한다. 현재 조사만으로 원본 사이트의 최신성·완전성을 선언하지 않는다.
5. 라이브러리/OSS 후보를 실제로 선택하는 시점에만 `01`의 제품 고정 버전과 upstream 확인 버전, `02`의 pg-boss drift, `03`의 공식 capability/license snapshot을 lockfile·가격·지원 정책·실행 검증과 대조한다.
6. `PLATFORM_REQUIREMENTS`에서 provenance/refresh, external-evidence freshness, result-revision retention, lineage-axis 구분을 제품 Open으로 승격할 필요가 있는지는 사용자/소유 문서가 결정할 사안이다. 현재는 누락된 문서 운영 coverage로 남긴다.

## 8. 경계와 미주장 사항

- 이 인벤토리는 외부 원격 URL의 현재 유효성·라이선스·가격·최신 release를 전수 검증하지 않았다.
- 연구·리뷰가 인용한 외부 저장소의 모든 코드, 모든 upstream 문서, 모든 모델 토론을 재실행하거나 전수 대조하지 않았다.
- 현재 root에 플랫폼 runtime/API/UI/DB가 없다는 원본의 진술을 기록했지만, 이 작업에서 제품 구현 여부를 새로 테스트하지 않았다.
- 이 보고서는 `.agents/reports/doc-operations-2026-09-22/evidence-inventory.md`만 작성 대상으로 삼으며, 다른 원본·서브모듈·참가자 보고서는 수정하지 않는다.
