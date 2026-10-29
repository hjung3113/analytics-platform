# FeedbackOps를 기능으로 합치고 역할 이름과 플랫폼 기능 루트로 바꾼다

상태: **Decided (2026-10-28)** — 결정 기록이며 코드·인프라 이행 완료를 뜻하지 않는다.
- 결정자: 사용자 — [#1096 결정 댓글](https://github.com/hjung3113/analytics-platform/issues/1096) 1–3: 이번 릴리스에서 이름·독립 앱·인프라까지 제거, 역할 이름, `platform/<기능>/`, 별칭 없음, 앱 `v0.20.1`·SDK `sdk-v0.21.0`.
- 팀장(사용자 위임, 되돌릴 수 있음): 새 서버 포트는 `@ap/contract-schemas`를 런타임에 직접 import한다. ADR-0098은 이 결정을 참조한다.
- 코디네이터(사용자 위임, 되돌릴 수 있음): 아래 세부 식별자·인프라 대응값, 과거 문서 보관 폴더. 이유는 기능 의미·기존 권한 분리를 유지하면서 제품 이름에 기대던 경계를 명시적으로 바꾸기 위해서다.

플랫폼 셸로 화면을 옮긴 뒤에도 독립 제품의 이름과 폴더·CI·린터 경계가 남아 있다. 사용자는 별도 업무 시스템인 “피드백 운영”을 만들지 않고 VOC·설문·Task·Finding 같은 기능으로 합치기로 했다. 독립 앱의 사내 사용자가 없으므로 병행 운영·리다이렉트 표를 두지 않는다. 코어 Fastify와 내부 분석 FastAPI의 분담은 [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md)를 유지한다.

## 결정

### 이름과 경로

표는 **목표 이름**이다. 폴더 이동, 패키지 이름, 공개 API·권한, 인프라 이름은 각각의 구현 노드가 이행한다. 옛 이름을 호환 export·권한·환경변수 fallback·URL 별칭으로 남기지 않는다.

| 대상 | 이전 | 목표 / 유지 여부 |
| --- | --- | --- |
| 코어 서버 | `apps/fo-backend`, `@fops/backend` | 변경: `apps/platform-api`, `@ap/platform-api` |
| 기능 화면 묶음 | `apps/fo-frontend`, `@fops/frontend` | 변경: `apps/feature-screens`, `@ap/feature-screens`; 독립 실행 호스트는 삭제하고 플랫폼이 소비하는 화면 패키지만 유지 |
| 기능 공유 계약 | `packages/fo-shared`, `@fops/shared` | 변경: `packages/feature-shared`, `@ap/feature-shared` |
| 기능 UI | `packages/fo-ui`, `@fops/ui` | 변경: `packages/feature-ui`, `@ap/feature-ui`; primitive 원본은 계속 `@ap/ui` |
| 화면 다리 | `packages/adapters/fo-bridge`, `@ap/fo-bridge` | 변경: `packages/adapters/feature-bridge`, `@ap/feature-bridge`(SDK 배포 대상 아님) |
| 운영 도구 | `ops/feedbackops`, `@fops/ops` | 변경: `ops/platform-api`, `@ap/platform-api-ops` |
| 기능 메뉴 폴더 | `menus/feedbackops/fo-{dashboard,voc,findings,tasks,integration,surveys,admin}` | 변경: `platform/{dashboard,voc,findings,tasks,integration,surveys,feature-admin}` |
| 기존 전역·운영 메뉴 | `menus/_global/{home,my-activity,notice-voc}`, `menus/operations/admin` | 변경: `platform/{home,my-activity,notice-voc,admin}`; 기능 관리자와 운영 콘솔은 별개 |
| 기능 메뉴 패키지 | `@ap/menu-fo-*` | 변경: `@ap/menu-{dashboard,voc,findings,tasks,integration,surveys,feature-admin}`; 다른 메뉴 패키지 이름은 유지 |
| 제품·공간 표시 | `FeedbackOps`, `피드백 운영`, 공간 id `feedbackops` | 삭제: 제품·업무 시스템을 대신 만들지 않고 기능 이름 사용. 메뉴 배치는 실제 앱 시안 → 아티팩트 → 사용자 선택으로 확정 |
| 그룹 id | `foDashboard`, `foVoc`, `foFindings`, `foTasks`, `foIntegration`, `foSurveys`, `foAdmin` | 변경: `dashboard`, `voc`, `findings`, `tasks`, `integration`, `surveys`, `featureAdmin`; 기존 `admin`과 구별 |
| 메뉴 id | `fo-*` | 변경: `fo-`를 뺀 id. 예: `fo-inbox` → `inbox`, `fo-task-requests` → `task-requests`, `fo-survey-builder` → `survey-builder`, `fo-settings` → `settings`. `parent`·목적지 표·테스트도 같은 대응값 사용 |
| `homeMenuId` | `feedbackops` 공간의 `fo-dashboard` | 공간 행과 함께 삭제. 다른 공간·플랫폼 홈은 유지; 메뉴 배치 선택이 새 진입점을 정함 |
| `carriedPageKeys` | 공간 행의 `managedSystem`, `returnTo` | 삭제: 사라지는 공간 행의 선언. 두 키의 메뉴별 의미·목록 범위·셸 안 복귀는 유지하고 메뉴 선언·링크로 전달; 분석 Context와 합치지 않음 |
| 주소 | `/feedbackops/...`, 독립 앱 주소 | 삭제: 별칭·리다이렉트·옛 공간 재개 키의 호환 이행 없음. 목적 메뉴가 사라진 저장 상태를 임의로 다른 기능에 연결하지 않음 |
| Kernel 권한 | `feedbackops:access` | 변경: `features:access`; `KERNEL_PERMISSIONS`·`vocab.json`·서버 permissions·세션·fixture를 함께 변경. `console:access`와 합치거나 권한을 넓히지 않음 |
| SDK 링크 codec | `FeedbackOpsTarget`, `buildFeedbackOpsLink`, `parseFeedbackOpsLink`, `platformReturnFor`, `PLATFORM_RETURN_MAX`, 외부 앱 복귀 `platformReturn` | 삭제: 독립 앱 전용 계약은 #597에서 제거. 셸 안 이동은 Registry·Context Link 사용. 같은 파일의 플랫폼 inbound 계약(`PlatformHop`, `buildPlatformInboundLink`, `parsePlatformInboundLink`)은 이름·보안 검증을 유지하며 별도 중립 파일로 분리 |
| SDK 슬롯 | `FeedbackOpsEntry`, `FeedbackOpsSlot`, `PlatformSlots.feedbackOps` | 변경: `FeatureEntry`, `FeatureSlot`, `PlatformSlots.features`; #597이 제거한 외부 링크·`overall`·`platformReturn` 분기는 복원하지 않음. `VocCompose*`·`NotificationsSlot` 등 기능 이름은 유지 |
| SDK 인바운드 링크 오류 코드 | `ContractError.code` `feedbackops_origin`, `feedbackops_path` | 변경: `inbound_origin`, `inbound_path`(#1130, 사용자 결정 2026-10-29). 별칭 없음. 거절 조건(origin 모양·userinfo·path/query/hash·loopback 밖 http·끝 점 host·fragment/backslash·expectedOrigin 불일치)과 wire 형식은 그대로. `docs/integration/feedbackops-deeplink.md`는 `docs/integration/platform-inbound-links.md`로 이름 변경 |
| 다리 구현 이름 | `Fo*`, `foQueryClient`, `useFoSession`, `foApi`/`setFoApi`, `createFoMenuHarness` | 변경: `Feature*`, `featureQueryClient`, `useFeatureSession`, `featureApi`/`setFeatureApi`, `createFeatureMenuHarness`; 이전 이름 재export 없음 |
| E2E 파일 | `contract-feedbackops.spec.ts`, `feedbackops-{tasks,surveys,admin,findings,integration}.spec.ts`, `tests-real/feedbackops.admin.real.spec.ts` | 변경: `contract-features.spec.ts`, `features-{tasks,surveys,admin,findings,integration}.spec.ts`, `tests-real/features.admin.real.spec.ts`; 파일명 변경과 assertion 변경을 섞지 않음 |
| 라벨·흐름 | `area:feedbackops`, `lane:fo` | 변경: `area:platform-features`, `lane:features`; 팀장이 관련 배정·필터와 함께 변경 |
| 용어집 | 제품 `FeedbackOps`·업무 시스템 `피드백 운영` | 삭제: 현행 개념에서는 기능 이름으로 설명. 과거 기록의 제품명은 유지 |
| 환경변수 | `FEEDBACKOPS_*` | 변경: `PLATFORM_API_*`로 접두어 치환(`ENV_FILE`, `ORIGIN`, `WEB_ORIGIN`, `REDIRECT_URI`, `CLIENT_SECRET`, `STATE_KEY` 등). 범용 `DATABASE_URL*`, `OIDC_*`, `STORAGE_*` 키는 유지하되 이름이 든 기본값은 아래대로 변경 |
| DB | `feedbackops` | 변경: `platform`; 기존 DB 이름 변경은 연결 밖 관리 단계가 필요한 별도 append-only 운영 마이그레이션으로 수행 |
| DB 롤 | 모든 `fops_*`(앱·migrate·좁은 SECURITY DEFINER 소유 롤 포함) | 변경: `platform_*`; 소유권·GRANT·NOLOGIN·NOINHERIT·앱 DDL 금지·감사 append-only 유지 |
| 스키마 | `core`, `permission`, `pgboss` 등 역할·도메인 이름 | 유지: 제품명이 아님. 제품 접두어가 든 스키마가 발견되면 새 append-only 마이그레이션에서 `platform_*`로 변경; 과거 SQL을 치환하지 않음 |
| 인증 | realm/client `feedbackops`, `feedbackops-release-local` | 변경: `platform`, `platform-release-local`; issuer·audience·callback 설정을 함께 갱신, 옛 realm/client fallback 없음 |
| 인증 런타임 토큰 | OIDC 트랜잭션 쿠키 `fops_oidc_tx`, 서명 키 라벨 `fops-oidc-tx-v1`, 멱등 해시 sentinel `__fops_undefined__` | 변경(#1130, 사용자 결정 2026-10-29): `platform_oidc_tx`, `platform-oidc-tx-v1`, `__platform_undefined__`. 별칭·옛 이름 fallback 없음; 서명 알고리즘·와이어 형식·쿠키 정책(TTL·flag·Path)은 그대로. 이름 전환 한계: 이미 시작된 옛 OIDC 트랜잭션은 거절되고(재로그인), 옛 sentinel로 저장된 `undefined` 포함 요청의 `request_hash`는 새 해시와 일치하지 않음. 운영 DB가 없어(#151) 이행하지 않음. UUID 시드 네임스페이스(`fops-preview-scale*`, `fops-slice3-voc`)는 고정 canonical ID라 유지 |
| 객체 저장소 | bucket `fops-attachments`, 기본 사용자 `fops-minio` | 변경: `platform-attachments`, `platform-minio`; 기존 객체 보존·참조 일치 확인, 제품명이 없는 키·권한 정책은 유지 |
| HTTP 경계 | 프록시 `/api/fo` | 변경: `/api/features`; 내부 기능 API `/api/v1/...`와 플랫폼 포트 `/api/v1/platform/...`는 유지. 옛 프록시 prefix는 받지 않음 |
| Compose | 제품명이 든 project·container 이름 | 변경: 최종 project `platform-api`·container `platform-*`. 폴더만 옮기는 노드에서는 먼저 기존 dev project `feedbackops`를 `name:`으로 고정해 볼륨이 새로 생기지 않게 하고, 인프라 노드가 데이터 보존과 함께 전환 |
| 문서 | `docs/feedbackops/` | 변경: 살아 있는 문서는 플랫폼 소유 문서로 통합, FO ADR은 `docs/adr/history/feedbackops/`로 본문 그대로 이동. 과거 기록을 현행 용어로 다시 쓰지 않음 |

### `platform/`은 소비자 층이다

`platform/<feature>/`는 SDK가 아니라 기능 메뉴 Consumer 패키지다. `menus/<system>/<group>/`에는 업무 시스템 메뉴만 남는다. `platform/`의 패키지 깊이는 한 단계이며 그룹의 공간 소속은 앱 `GROUPS` 선언에서만 읽는다. `platform/admin`처럼 업무 시스템에 배치하는 기능도 폴더 이름에서 공간을 유추하지 않는다.

생성기는 `space: null` 그룹을 `platform/<group>/`에 만들고, 플랫폼 기능은 이 루트에 명시적으로 생성할 수 있어야 한다. 업무 시스템 메뉴는 두 단계 폴더와 `GROUPS` 소속 일치를 계속 검사한다. pnpm glob·생성 metadata·제거 검증·lint·CODEOWNERS는 양쪽 루트를 구별한다. SDK는 `platform/*`·`menus/*`·기능 화면·다리를 import하지 않는다. 정의는 [GLOSSARY](../../GLOSSARY.md), 경계 원본은 [platform-packages §3](../integration/platform-packages.md#3-패키지-구성)이다.

### 서버 경계와 이행 순서

- 코어 서버가 플랫폼 자신의 서버가 되므로 [ADR-0073](0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md)의 규칙 11을 부분 대체한다. `@ap/platform-api` 런타임은 새 서버 포트의 와이어 검증을 위해 `@ap/contract-schemas`를 직접 import할 수 있다([ADR-0096](0096-contract-schemas-zod-source-and-reference-implementations.md)). 규칙 11은 FO의 별도 제품 독립성을 위한 것이었지만 이제 서버는 플랫폼 코어 서버다. [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) §3.4의 계약 원본 한 방향을 유지하며 복제+drift 테스트는 쓰지 않는다. SDK → 서버 역방향 import는 계속 금지한다. 서버의 Kernel·셸·메뉴·브라우저 패키지 import는 계속 금지하고, 적합성·HTTP 어댑터·어휘의 테스트 전용 허용은 유지한다.
- 이름 접두어 `@fops/`로 제품 경계를 판정하던 두 lint와 turbo 가드는 패키지 이름 전환 노드에서 명시적인 기능 패키지 집합 하나로 바꾼다. 서버·화면·공유·UI·다리·운영 도구가 모두 `@ap/*`가 되어도 SDK 역방향 import를 허용하지 않는다.
- 순서는 #1097(결정) → #597(독립 앱 제거) → #1098 b(폴더만, 기존 패키지명 유지) → r(패키지명·경계·루트 필터·CI 통합) → c(`platform/`)다. #1099가 공개 이름·공간·권한을, #1100이 인프라 이름을, #1101이 문서를, #1102가 ESLint 전환을 구현한다.
- DB·롤 이름 변경은 **append-only 마이그레이션**이다. 적용된 migration SQL·파일명·`meta/_journal.json`의 기존 tag·entry·snapshot은 원문 그대로 두고 새 entry만 더한다. 새 설치에서도 과거 이력을 재생한 다음 이름 전환을 적용한다. DB 자체 rename은 transaction 안 SQL과 구별된 관리 연결 절차로 남기며, 소유·접근 권한과 기존 데이터가 같은지 검사한다.
- 옛 이름 `git grep`은 노드별 완료 검사다. 과거 ADR·기록·migration과 아직 전환 전인 후속 노드의 참조를 구별하고, 해당 노드가 소유한 현행 실행 경로에는 옛 이름을 남기지 않는다. 문서만인 이 ADR PR은 코드 이름 변경 완료를 주장하지 않는다.

### 기존 결정의 대체 범위

과거 ADR 본문을 고치지 않고 이 표와 ADR 색인에서 현행 결정을 연결한다.

| 기존 결정 | 이 결정이 대체하는 부분 | 유지하는 부분 |
| --- | --- | --- |
| [ADR-0031](0031-menu-folders-by-space.md) | 모든 메뉴가 두 단계·전역은 `_global`, 폴더가 모든 소속의 원본이라는 규칙 | 업무 시스템 메뉴의 두 단계·공간 일치 검사 |
| [ADR-0045](0045-feedbackops-entry-link-mapping-and-scope.md) | 독립 앱 진입·외부 복귀·전체 진입 권한의 제품명 | Managed System 연결·목적지와 분석 Context 분리·VOC 화면 정보 보호 |
| [ADR-0046](0046-design-system-source-moves-to-platform-whole-package.md), platform-packages §3 규칙 8 | `@fops/*` 접두어로만 역방향 import를 막는 경계 | primitive 원본 `@ap/ui`, SDK ← Consumer 단방향 |
| [ADR-0066](0066-feedbackops-merges-into-platform.md) | 별도 피드백 운영 시스템·독립 앱 전환기·제품 이름 | 한 셸·기능 데이터 원본 하나·서버 출발점, ADR-0095의 코어/분석 서버 분담 |
| [ADR-0071](0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md) | 다리·화면 패키지 이름과 `/api/fo` | 화면 원본 재사용·호스트 포트·서버 권한·네트워크 경계 |
| [ADR-0073](0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md) | 규칙 11의 새 코어 서버 `@ap/contract-schemas` 런타임 금지 | 서버의 브라우저 층 금지·적합성 패키지 테스트 전용 허용 |
| [ADR-0081](0081-feedbackops-operator-screens-platform-frame.md) | FeedbackOps 공간·피드백 운영 표시와 옛 id | 각 기능의 목록 범위·셸 안 이동. 새 시안에서 승인한 배치가 위치를 대체 |
| [ADR-0090](0090-repo-structure-by-branch.md) | `fo-*`·`ops/feedbackops`·`docs/feedbackops` 배치, 모든 메뉴가 `menus/`라는 전제 | SDK/adapters 분리·업무 시스템 폴더·문서 종류별 소유 |
| [ADR-0093](0093-canonical-paths-from-space-and-menu-id.md) | 제거한 `feedbackops` 공간의 옛 주소를 유지한다는 전제 | 다른 업무 시스템의 정규 경로·기존 별칭 계약. 이 릴리스의 명시적 no-alias 예외를 일반화하지 않음 |

## Considered Options

- **(A) 제품 이름·독립 앱·호환 별칭 유지:** 전환 비용을 나눌 수 있지만 사용자가 이번 릴리스에서 완전 제거를 선택했다. 사내 독립 앱 사용자가 없어 호환 표를 유지할 이익이 없다.
- **(B, 채택) 기능으로 합치고 역할 이름·별도 Consumer 루트 사용:** SDK와 기능 메뉴가 섞이지 않고 업무 시스템 메뉴도 분리된다. 공개 API·권한·URL이 바뀌므로 SDK minor 버전을 올리고 이름 전환과 소비자 갱신을 같은 노드에서 끝낸다.
- **(C) migration 이력까지 일괄 치환:** 텍스트는 줄지만 적용 이력과 재생·drift 검사를 깨므로 채택하지 않는다.

## 결과

앱은 `v0.20.1`, SDK는 필수 어댑터 메서드 추가와 공개 이름 변경을 포함해 `sdk-v0.21.0`으로 낸다. 이 ADR은 코드·CI·DB를 변경하지 않는다. 시안의 메뉴 위치는 사용자 선택 전까지 구현하지 않는다. 외부 `hjung3113/FeedbackOps` 보관은 태그 직전 사용자가 다시 확인한 뒤 팀장이 수행한다.
