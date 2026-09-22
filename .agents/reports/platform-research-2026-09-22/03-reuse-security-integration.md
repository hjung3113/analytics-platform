# 담당 C — 기존 구현 재사용·인증/권한·제품 통합 조사

- 조사일: 2026-09-22 (Asia/Seoul)
- 소유 산출물: 이 파일만 작성했다.
- 범위: FeedbackOps 고정 커밋의 실제 사용자·SSO·권한/Scope·Audit·업무 흐름 구현, 플랫폼 공통 책임으로 추출할 경계, 원본 로그·계보 연계, build-vs-reuse-vs-adapt, 인증/정책 OSS 비교.
- 조사 상태: **설계 제안**이다. 플랫폼 채택, 소스 수정, 의존성 추가, 마이그레이션, 배포 또는 외부 제품 통합을 승인하지 않는다.

이 보고서는 구현 존재와 플랫폼 채택을 의도적으로 분리한다. 다음 표기를 사용한다.

- **[I] 구현 확인:** 고정 커밋의 소스·스키마·ADR에서 실제로 확인한 것.
- **[D] 문서 계약:** 설계 문서나 ADR에만 존재하거나, 현재 제품 구현에 대한 요구로 적힌 것.
- **[U] 검증 불가/미구현:** 이 조사에서 현재 플랫폼 런타임·실서비스·실제 외부 시스템 연동을 확인하지 못한 것. 파일이 없다는 검색 결과와 “실서비스에서 동작한다”는 의미를 구별한다.

## 1. 핵심 권고

1. **FeedbackOps의 인증 흐름과 권한 판단 방식을 `platform-owned adapter contract`의 입력으로 재사용하되, FeedbackOps의 테이블·Workspace 가정·역할 의미를 플랫폼 공용으로 복사하지 않는다.** `AuthProvider`/`openid-client` 기반 OIDC PKCE·state·nonce·서버 세션·자동 Actor provisioning은 실제 자산이다. 플랫폼이 소유해야 할 것은 IdP 신뢰 설정, 조직/Workspace 매핑, per-request Scope 재검증, 세션 취소와 route/deep-link 정책이다.
2. **처음에는 별도 OpenFGA/OPA 도입 없이 플랫폼의 Postgres 권한·Scope·Audit 경계를 작게 만든다.** FeedbackOps의 `CheckService`, `ScopeService`, same-transaction `AuditService`, runtime DB-role guard는 정책과 저장의 좋은 선례다. 플랫폼 문서가 요구하는 메뉴/route/filter/export/drill-through 전 구간의 권한 일관성을 먼저 이 경계로 검증한다.
3. **Entity Link를 제품 간 통합의 유일한 읽기/쓰기 seam으로 삼는다.** VOC·Finding·Task의 상태와 의미는 각 bounded product가 소유하고, 플랫폼은 링크 registry, visibility/permission 평가, Context Link와 감사 추적을 소유한다. 직접 FK, shared domain table, 화면별 URL 조립으로 통합하지 않는다.
4. **FileGateway와 ProjectGraph는 독립 서비스/산출물 adapter로만 취급한다.** FileGateway의 read-only logical file resolver는 원본 증거 drill-through 후보이고, ProjectGraph의 content-hashed static lineage는 Data Trust 후보 artifact다. 둘 다 플랫폼의 인증·Scope·wall-clock·freshness 계약을 대체하지 않는다.
5. **알림은 현재 채택하지 않는다.** FeedbackOps ADR-0014는 설계만 있고 구현·테이블이 없다. 플랫폼의 generic notification/alert engine을 먼저 만들면 Deferred 경계를 깨고 audit, inbox, email, domain event를 섞게 된다. 실제 수신자·중복·보존 요구가 확인된 뒤 최소 in-app adapter부터 결정한다.

### 지금 가장 먼저 피해야 할 실패

고정 커밋의 내부 구현이 있다는 이유로 `products/feedbackops`를 플랫폼 공통 모듈로 포크하거나, OIDC IdP의 role claim·URL의 `scopeId`·제품의 `Workspace` ID를 곧바로 분석 권한으로 믿는 것이다. 그러면 URL/메뉴/조회/내보내기/Entity Link가 서로 다른 권한 판단을 하고, 제품 독립 경계·감사 원자성·Scope 재검증을 잃는다. 특히 **외부 IdP 로그인 성공 또는 static lineage 생성 성공을 플랫폼 분석 권한/Data Trust 완료로 표시하지 않는다.**

## 2. 현행 상태

### 2.1 문서로 확정된 계약과 결정 상태

#### 플랫폼 계약

- `docs/INDEX.md`는 `docs/06_platform_ui_contract.md`를 전역 UI/URL/Scope/Context/메뉴 확장 계약의 authoritative 문서로 지정하고, `docs/05_roadmap_and_open_questions.md`를 결정 상태 문서로 구분한다. 루트에는 현재 실행 가능한 플랫폼 frontend/backend가 없다. 따라서 이 보고서의 `[I]` 구현 근거는 주로 FeedbackOps submodule이며, 플랫폼 채택은 모두 제안이다.
- `docs/00_overview.md`는 플랫폼을 `context_recognized_parser`와 별도 제품으로 둔다. parser는 upstream ingestion/read model의 소유자이고, 플랫폼은 thin view/mart/API/공통 UX·권한·Scope를 소유한다. 외부 BI, 범용 alert/notification engine, 자유 SQL/DSL, generic plugin/widget은 제외 또는 Deferred다.
- `docs/01_architecture_and_data_contract.md` §§1–3은 parser Postgres를 read-only로 읽고 platform-owned view/mart를 거쳐 API로 노출하도록 한다. API가 parser 내부 테이블을 직접 public contract로 노출하면 안 된다. master ownership, ID/grain/unit/time/null/quality/source version, 재집계 trigger는 플랫폼과 source owner 사이에 별도 계약이 필요하다.
- `docs/02_domain_menus.md`는 Platform 공통 기능으로 Menu Registry, global filter/deep link, permission/role, audit, saved view entry를 둔다. VOC는 intake/owner/status/comments가 있는 자체 모델이다. VOC read permission은 analysis permission을 부여하지 않는다. Notice는 menu targeting과 기존 permission을 사용하며 범용 alert engine이 아니다.
- `docs/03_backend_stack.md` §§1–3은 FastAPI/SQL-first를 후보로 두고, OIDC를 day 1 후보로 적는다. 동일 Postgres 및 parser read-only schema 후보는 있으나 SSO provider, 조직/tenant, 배포, 동시 사용자, 규모는 Open이다.
- `docs/06_platform_ui_contract.md`의 핵심 경계는 다음과 같다.
  - §§8, 22, 28 및 §29: Platform Kernel은 App Shell, Menu Registry, route/search-param contract, Global Context, Permission/Scope Context, Breadcrumb, Context Link와 공통 loading/error/Data Trust를 소유한다. domain page는 equipment 계산, metric 의미, VOC 상태, page form을 소유한다.
  - §§4–6, 11: URL은 context 전달 계약이지 권한 증명이 아니다. `scopeId`를 서버가 매 요청 재검증하고, `from/to`는 naive wall-clock half-open `[from,to)`다. malformed/duplicate/불완전한 metric pair는 조용히 보정하지 않는다.
  - §17: menu, route, filter, result, saved view, export, drill-through, Context Link, VOC analysis가 같은 permission/Scope 의미를 사용해야 한다. inaccessible Scope는 fallback하지 않고 명시적 오류를 낸다.
  - §§18–19: `outcome`과 `assessments[]`, freshness/calculation basis/coverage/completeness/provisional/metric version/source/lineage를 구분한다. `statusSource`와 `observedAt` 없이 confirmed/clear를 만들지 않는다.
  - §§21, 22: Saved View는 플랫폼 자산 후보지만 Deferred다. Context Link helper가 대상 route와 permission, transfer 가능/미지원 context를 소유하며 메뉴가 서로의 URL을 문자열 결합하지 않는다.
- `docs/05_roadmap_and_open_questions.md`는 Platform Kernel, occurrence ID, URL 비권한, wall-clock, server-side Scope recheck를 Decided로 둔다. SSO, org/tenant, scope hierarchy/multi-scope, deployment, data volume/concurrency, saved view의 실제 범위와 runtime 선택은 Open/Candidate/Deferred다. 아래 제안은 이 상태를 채택으로 바꾸지 않는다.

#### FeedbackOps 통합 경계

- `products/feedbackops/AGENTS.md`와 `products/feedbackops/docs/implementation/02-domain-module-boundaries.md`는 FeedbackOps를 독립 제품으로 유지한다. Core가 Workspace/Actor/Role/Team/Managed System/Audit를, Permission이 request/decision/deny read model을, Entity Links가 cross-system history를, VOC/Finding/Task/Survey가 각각 자신의 상태와 의미를 소유한다.
- `docs/integration/repository-layout.md` §§1–4는 `products/feedbackops`를 고정 submodule로 두고, FeedbackOps의 `auth/permission/audit/VOC/Finding/Task`를 `packages/shared/ui` 또는 플랫폼 공용으로 자동 승격하지 않는다. `docs/integration/repository-ideas.md`는 후보/브레인스토밍일 뿐 구현 승인서가 아니다.
- 현재 root HEAD는 `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`이고, `products/feedbackops` gitlink는 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` (`develop`)다. 이 보고서는 그 고정 커밋을 읽었다. 테스트는 실행하지 않았다.

### 2.2 고정 커밋에서 실제 확인한 구현

| 영역 | 구현 증거 `[I]` | 플랫폼 채택 판단 |
|---|---|---|
| OIDC/provider seam | `products/feedbackops/apps/backend/src/modules/auth/auth-provider.ts`의 `AuthProvider`, `AuthClaims`, `startLogin/completeLogin`; `oidc-auth-provider.ts`의 discovery, authorization-code + PKCE S256, state/nonce, signed transaction cookie, bounded raw claims; `routes.ts`의 login/callback/logout/me | **부분 재사용:** provider-neutral interface와 보안 흐름을 adapter 선례로 유지한다. 제품 route, env 이름, session/Workspace 저장은 플랫폼 계약 확정 뒤 재매핑한다. |
| Actor/session | `apps/backend/src/modules/auth/session-service.ts`의 12시간 opaque random session, actor auto-provision `(workspaceId, externalId)`, atomic load-and-touch/revoke; `middleware/require-session.ts`, `require-workspace.ts` | **패턴 재사용, 저장소 독립:** URL·IdP claim·제품 role을 Scope 증명으로 승격하지 않는다. 플랫폼은 actor↔organization↔scope membership과 세션 수명/취소를 별도 결정해야 한다. |
| OIDC validation/boot guard | `modules/auth/config-oidc.ts`의 exact redirect URI/HTTPS production/issuer 및 scope 검증; `db/runtime-role.ts`와 `index.ts`의 `fops_app` 제한 및 migration role 분리; `oidc-tx-cookie.ts` signed TTL cookie | **강한 보안 선례:** fail-closed boot, same-origin `returnTo`, query/error redaction, runtime DB role은 추출 가치가 높다. 플랫폼의 deployment/secret manager/IdP topology가 정해지기 전 제품 설정을 복사하지 않는다. |
| Permission/Scope | `apps/backend/src/modules/permissions/check-service.ts`의 explicit deny 우선, direct/role/Managed System grant, requestable decision; `scope-service.ts`의 workspace-wide grant minus scoped deny 및 per-actor scope; findings/voc authorization이 이를 호출 | **핵심 adapter 후보:** 같은 `Decision`/`ScopeSet` semantics를 Menu/route/filter/result/export에 연결한다. FeedbackOps의 role names와 single seeded Workspace는 플랫폼 표준이 아니다. |
| Audit/transaction safety | `apps/backend/src/modules/core/audit/audit-service.ts` 공개 API `record(tx,input)`가 event type/detail을 검증하고 same Tx insert; `db/schema/core.ts` `audit_log`; ADR-0008의 app INSERT/SELECT와 migration/admin update/delete 분리; idempotency/rate-limit ADR | **플랫폼 공통 contract 후보:** mutation owner가 same-Tx audit와 idempotency를 호출하게 한다. 외부 Loki/Elastic/S3 sink, retention, cross-service outbox는 현재 구현으로 주장하지 않는다. |
| Cross-product history | `apps/backend/src/modules/entity-links/service.ts`의 `EntityLinkProvider`, endpoint existence/read/create checks, visibility evaluation, same-Tx `entity_link.created/detached` audit; `docs/implementation/06-entity-linking-contract.md` | **직접 채택보다 protocol 추출:** platform registry/visibility/Context Link seam으로 만든다. VOC/Finding/Task table이나 status transition을 shared table로 합치지 않는다. |
| Product workflow | `docs/implementation/02-domain-module-boundaries.md` 및 실제 `voc`, `findings`, `tasks`, `surveys` 모듈. VOC가 approved command로 Finding을 만들고 Entity Links를 사용한다. `managed-system-service.ts`는 workspace/permission/idempotency/domain mutation/audit를 한 Tx에서 묶는다. | **참고·adapter:** 업무 상태와 command는 FeedbackOps가 소유한다. 플랫폼은 command/read interface, actor/scope/correlation/link contract만 제공한다. |
| Nav/saved view | `modules/nav/service.ts`는 owner list predicate를 사용하고 permission denied/scope required 시 count를 숨긴다. `modules/saved-views/service.ts`는 actor/workspace/private surface와 domain query schema를 재검증한다. | **제품 구현 존재, platform adoption 아님:** nav count와 filter validation 패턴은 재사용 가능하지만 플랫폼 Saved View가 아직 Deferred이고 FeedbackOps view는 제품 private이다. |
| Notification/inbox | `products/feedbackops/docs/adr/0014-notifications-in-app-and-email-channels.md`에 `core.notifications`, channel abstraction, dedupe 설계가 있음. 그러나 고정 커밋의 `apps/backend/src/modules`에 notification/inbox 구현과 schema table을 찾지 못했다. | **문서 전용 `[D]`, 채택 불가:** audit를 inbox로 재사용하지 않고, 실제 event/recipient/privacy 요구가 정해질 때 별도 최소 구현을 결정한다. |
| Source/log/lineage integration | 고정 커밋의 backend/migrations/packages/shared에서 FileGateway, parser, ProjectGraph, Jira/MES source adapter, source watermark/lineage API를 찾지 못했다. | **미구현 `[U]`:** FeedbackOps 업무 통합 코드가 원본 로그나 parser를 읽는다고 주장하지 않는다. 별도 adapter와 platform Data Trust mapping이 필요하다. |

#### 인증 구현의 세부 확인

- `oidc-auth-provider.ts`는 discovery를 HTTP listener 전에 수행하고, HTTPS(로컬 개발 제외), authorization endpoint/token endpoint/JWKS와 `client_secret_basic`을 요구한다. `startLogin`은 random state/nonce/verifier와 S256 challenge를 만들고 signed `fops_oidc_tx` cookie에 transaction을 저장한다.
- `completeLogin`은 transaction signature/expiry/state/nonce, ID Token expected, token grant를 검증하고, `sub`와 email, `email_verified`를 확인한다. raw claims는 `sub/iss/aud/email/email_verified/name/preferred_username` allowlist만 보존한다. `returnTo`는 단일 slash same-origin path만 허용하고 `//`, backslash/control character를 거부한다.
- `session-service.ts`는 첫 로그인에 `workspaceId + externalId`로 Actor를 찾거나 `user/internal_member`로 생성하고, 후속 로그인에서 email/display name을 갱신한다. 세션 ID는 opaque random text이고, `loadAndTouch`는 revoked/expiry predicate가 있는 atomic update를 사용한다. 이는 OIDC 성공을 플랫폼 분석 권한과 동일시하지 않는다는 전제에서 좋은 재사용 패턴이다.
- `docs/adr/0006-authentication-and-actor-provisioning.md`의 amendment는 이 OIDC 흐름을 구현했다고 기록하지만, `oidc-flow.integration.test.ts`와 `auth.integration.test.ts`는 테스트 존재의 증거일 뿐이다. 이 조사에서 IdP, live DB, test suite를 실행하지 않았으므로 “운영 검증”으로 표현하지 않는다.

#### 권한·감사 구현의 세부 확인

- `permissions/check-service.ts`는 workspace mismatch와 explicit deny를 먼저 처리한 뒤 direct grant, role, Managed System grant, requestable 상태를 결정한다. `scope-service.ts`는 Admin all, workspace-wide grant minus scoped denies, Managed System scoped grant를 반환한다. `findings/authorization.ts`와 VOC read/repo 서비스가 이 seam을 호출한다.
- `entity-links/evaluate-visibility.ts`는 source unreadable을 hidden으로 만들고, target read 권한과 summary availability에 따라 summary/internal/hidden을 분리한다. 이 판단이 Entity Link를 통해 다른 제품의 read permission을 몰래 부여하지 않게 하는 핵심이다.
- `audit-service.ts`는 Tx 없는 public write를 제공하지 않는다. ADR-0008은 audit를 mutation과 같은 Postgres transaction에서 append하고, app role의 UPDATE/DELETE를 막는 방향을 정한다. 이는 플랫폼의 Audit contract가 제품별 “나중에 log 남기기”보다 강해야 한다는 근거다.

### 2.3 다른 로컬 자산과 플랫폼 연결 가능성

다른 로컬 저장소는 필요한 경계를 확인하기 위해 읽기만 했다. 수정·build·test·server 실행은 하지 않았다.

| 자산 | 현재 확인 | 플랫폼에 줄 수 있는 것 | 플랫폼이 직접 흡수하면 안 되는 것 |
|---|---|---|---|
| FileGateway `30d89a5210e5b3bd8c9c6a6c1fff8469867d7be8` (`/Users/hyojung/orca/projects/FileGateway`) | read-only HTTPS JSON/streaming gateway, logical `equipmentId`/`logType`, `X-Api-Key`, audit middleware, `[from,to)`. `docs/05-api-interface.md`는 offsetless 값을 `Asia/Seoul`로 해석한다고 한다. | logical file resolver, stream/error vocabulary, server-to-server correlation과 audit adapter | API key를 browser에 내보내기, physical path, gateway의 local time 해석을 platform wall-clock 계약으로 일반화하기, gateway DB/FTP 구현 복사 |
| ProjectGraph `bd3bda9aeeede6cd6856facb3aa70b64f88eb45a` (`/Users/hyojung/Desktop/2026/ProjectGraph`) | canonical JSON evidence/lineage artifact, evidence ID/content hash/contract version 검증, `serve`는 127.0.0.1 static GET/HEAD. 실제 platform ACL/runtime lineage는 없다. | evidence ID/content hash, versioned artifact, static lineage를 Data Trust의 source/lineage input으로 adapter화 | static graph를 live source completeness로 표시, ProjectGraph server를 platform API로 노출, parser/DB 의미를 lineage 도구가 소유 |
| `context_recognized_parser` `d84fab18fa10ead7f59b8169de25848f34a5164b` | upstream parser 프로젝트로 확인했으나 이 조사에서 source schema/API live integration은 검증하지 않았다. | platform-owned compatibility view/mart의 source contract와 watermark 입력 | parser internal logic, direct public table/API, parser 권한을 platform Scope로 간주 |

FileGateway는 현재 작업 트리에 `?? .review/`, ProjectGraph에는 `M CLAUDE.md`가 있었으므로 그 변경을 보존했다. 이 보고서가 그 저장소의 동작을 운영 검증했다는 뜻은 아니다.

## 3. 후보 비교

라이선스·버전은 2026-09-22 공식 페이지/저장소를 확인한 스냅샷이다. 법무·보안 적합성, 지원 기간, 상용 가격을 이 조사로 확정하지 않는다.

| 문제 | 후보/확인 버전·에디션 | 계약 적합성과 공백 | 라이선스·유료 경계 | 운영·통합·이탈 비용 | 권고 | 근거 |
|---|---|---|---|---|---|---|
| 애플리케이션 OIDC login/session | **FeedbackOps `AuthProvider` + `openid-client` 6.8.8** | OIDC discovery, code+PKCE S256, state/nonce, ID Token 검증과 bounded claims가 현재 코드에 있다. 조직/tenant mapping, platform Scope, session topology는 없다. | `openid-client` 공식 저장소는 MIT로 표시된다. FeedbackOps 앱 전체 라이선스·운영 정책은 별도 검토 대상이다. | 기존 flow를 protocol adapter로 가져오면 이탈 비용이 낮다. route/env/cookie/table을 공용화하면 제품 결합도가 급격히 높아진다. | **유지·보강:** 흐름/테스트 벡터를 재사용하고 platform actor/session seam을 새로 둔다. | [openid-client 공식 저장소](https://github.com/panva/openid-client), [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html), [RFC 7636 PKCE](https://datatracker.ietf.org/doc/html/rfc7636) |
| 앱의 권한·Scope·감사 직접 구현 | **Platform-native Postgres contract**: `PermissionDecision`, `ScopeSet`, append-only Audit, per-request server check | 현재 문서의 URL 비권한, 매 요청 Scope, audit same-Tx와 가장 직접적으로 맞는다. 조직 hierarchy/multi-scope, cross-service transaction은 아직 Open이다. | 플랫폼 소스와 선택한 DB/드라이버 정책으로 결정. 외부 서비스 라이선스 경계가 없다. | 초기 구현은 작지만 permission matrix와 product adapter를 직접 유지해야 한다. 대신 DB, API, UI, Entity Link의 의미가 한곳에서 검증되고 OSS 탈출 비용이 낮다. | **1차 권고:** FeedbackOps의 판단 규칙과 audit seam을 참고하되 platform-owned interface/schema로 보강한다. | `docs/06` §§17–19, `docs/05` auth/scope open questions; FeedbackOps `permissions/check-service.ts`, `scope-service.ts`, `audit-service.ts`, ADR-0008 |
| IdP/SSO가 없거나 직접 운영해야 하는 경우 | **Keycloak 26.7.4 페이지 표시 스냅샷** | SSO, OIDC/OAuth2/SAML, LDAP/AD identity brokering과 authorization 기능을 제공하는 IdP다. 앱의 equipment/Managed System Scope와 same-Tx Audit을 대신하지 않는다. | 공식 Keycloak 저장소의 pom은 Apache-2.0을 표시한다. 배포판·호스팅·지원 계약과 운영 비용은 별도 확인 필요. | IdP 운영·upgrade·realm/claim mapping을 추가한다. 기존 corporate IdP가 있으면 이중 계정/이중 policy와 migration 비용이 생긴다. | **조건부 대안/참고:** 조직이 self-hosted IdP를 명시하고 기존 IdP가 없을 때만 평가. 앱 권한 provider로 오인하지 않는다. | [Keycloak 공식 사이트](https://www.keycloak.org/), [Keycloak pom/license](https://github.com/keycloak/keycloak/blob/main/pom.xml) |
| 객체·관계 중심 authorization 서비스 | **OpenFGA** (공식 OSS 저장소; 고정 버전 선택 안 함) | user/object/relation tuple과 authorization model로 fine-grained ReBAC를 검사한다. 현재 FeedbackOps의 explicit deny, time-bound grant, workspace-wide minus scoped deny, same-Tx audit와 직접 일치하지 않는다. | 공식 저장소는 Apache-2.0을 표시한다. Cloud/호스팅 비용과 지원 조건은 edition 계약으로 별도 확인해야 한다. | 별도 store/모델/dual-write와 fail-closed availability 정책이 필요하다. Postgres row permission과 이중 source가 되면 drift/복구 비용이 크다. | **보류/참고:** 다수 제품·깊은 object hierarchy·cross-service 관계가 실제 병목으로 측정될 때만 POC. 첫 kernel 권한 저장소로 대체하지 않는다. | [OpenFGA concepts](https://openfga.dev/docs/concepts), [OpenFGA getting started](https://openfga.dev/docs/modeling/getting-started), [OpenFGA 저장소](https://github.com/openfga/openfga) |
| 선언형 정책 평가 | **OPA** (공식 OSS 저장소; 고정 버전 선택 안 함) | general-purpose policy engine이라 복합 조건을 표현할 수 있으나 user/session/identity/relationship store가 아니다. deny precedence, scope source, audit 원자성을 앱이 별도로 공급해야 한다. | 공식 저장소는 Apache-2.0을 표시한다. 관리형 정책 서비스·운영 지원은 별도 제품/계약 확인 대상이다. | policy bundle 배포, decision latency/fail-closed, input redaction, decision audit, policy drift를 추가한다. 현재 범위에서 외부 정책 언어가 얻는 가치가 입증되지 않았다. | **보류/참고:** 계산된 Scope를 보완하는 복합 정책이 필요할 때 제한적으로 평가. 인증/Scope의 대체로 도입하지 않는다. | [OPA 공식 저장소](https://github.com/open-policy-agent/opa) |

Keycloak, OpenFGA, OPA는 공식 capability/license 페이지를 확인했지만 이 저장소 데이터·동시성·배포에서 성능 또는 보안 적합성을 측정하지 않았다. “Apache-2.0” 또는 “MIT”는 도입 승인이나 법률 검토의 대체가 아니다. Ory Kratos도 API-first identity 후보가 될 수 있으나, 현재 플랫폼의 기존 OIDC/session seam보다 이탈 비용이 낮다는 증거가 없어 표의 주 후보로 올리지 않았다. 필요하면 [Ory Kratos 공식 저장소](https://github.com/ory/kratos)와 [Ory 약관의 OSS/상용 경계](https://www.ory.com/legal/tos)를 별도 검토한다.

## 4. 적용 카드

### C-01. OIDC 신원과 플랫폼 세션 경계

- **ID / 사용자·운영 문제:** 조직 로그인은 필요하지만 IdP claim, session, Actor, Workspace, 분석 Scope를 같은 객체로 취급하면 퇴사/역할 변경/조직 이동이 늦게 반영된다.
- **현재 근거:** `[I]` `products/feedbackops/apps/backend/src/modules/auth/auth-provider.ts`, `oidc-auth-provider.ts`, `routes.ts`, `session-service.ts`, `middleware/require-session.ts`, `middleware/require-workspace.ts`; `[D]` `docs/adr/0006-authentication-and-actor-provisioning.md`, `docs/03_backend_stack.md`의 OIDC day-1 후보. 고정 커밋 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`에서 읽었으며 테스트는 실행하지 않았다.
- **제안:** `AuthProvider`와 OIDC 보안 흐름을 platform adapter의 입력으로 삼는다. 플랫폼은 `externalSubject → Actor → Organization/Workspace → Scope membership` 매핑, session issue/revoke, same-origin return path, IdP config/rotation을 소유한다. 제품은 provider login implementation을 직접 import하지 않고 platform의 authenticated request context를 받는다.
- **플랫폼이 자체 소유할 책임:** IdP issuer/client/redirect trust, claim allowlist, actor deprovision/role change 반영, session TTL/revoke, workspace mismatch, correlation/redaction, login failure vocabulary.
- **재사용 경계:** PKCE/state/nonce/transaction-cookie/opaque session의 흐름과 negative test matrix를 재사용한다. FeedbackOps의 `WORKSPACE_ID`, `roleLevel=admin|developer|user`, cookie 이름, route, schema migration, auto-provision default role을 플랫폼 공용 표준으로 복사하지 않는다.
- **실패 모드:** IdP `role`을 equipment Scope로 신뢰, URL `returnTo` 외부 redirect, bearer/JWT를 장기 session으로 사용, actor email 변경으로 새 계정을 만들기, logout/revoke 뒤 캐시가 계속 접근 허용.
- **최소 검증:** discovery/redirect/PKCE/state/nonce/expired-tampered transaction, first/second login same actor, revoked/expired session, workspace mismatch, email unverified, changed Scope를 재현한다. **합격:** callback은 same-origin만 통과하고, revoke 후 다음 request가 401/403이며, IdP 성공만으로 분석 Scope가 생기지 않는다. **탈락:** forged/tampered transaction 통과, redirect 외부 이동, stale permission 통과.
- **우선순위·선행:** **P0**; SSO provider, organization/multi-tenant boundary, server request context가 선행이다.
- **문서 반영:** `docs/03_backend_stack.md`와 `docs/05_roadmap_and_open_questions.md`에 “OIDC adapter는 인증만, Scope는 platform decision” 문장과 actor deprovision 정책을 추가한다. `docs/06_platform_ui_contract.md` §17에 session/Scope recheck를 연결한다. FeedbackOps integration 문서에는 재사용 가능한 protocol과 복사 금지 자산을 명시한다.
- **확신도:** 높음(코드와 OIDC 표준 흐름 확인), 조직/tenant 매핑은 중간.

### C-02. 권한 결정과 Scope read model

- **ID / 사용자·운영 문제:** 메뉴에서 숨겨진 대상이 direct route/filter/export/entity link로 다시 보이거나, Scope가 변경된 뒤 이전 결과가 남으면 운영자가 권한 경계를 신뢰할 수 없다.
- **현재 근거:** `[I]` FeedbackOps `apps/backend/src/modules/permissions/check-service.ts`의 explicit deny 우선 및 grant attribution; `scope-service.ts`의 workspace-wide/scoped grant와 deny subtraction; `findings/authorization.ts`, VOC read/repo 서비스의 호출. `[D]` `docs/06_platform_ui_contract.md` §§17, 22와 `docs/05`의 per-request check.
- **제안:** platform-owned `PermissionDecision`과 `ScopeSet` adapter를 정의하고 menu visibility, route guard, filter candidate, query, export, drill-through, Context Link에서 동일한 decision을 호출한다. domain module은 capability owner로서 자체 read predicate와 command authorization을 제공한다. 처음에는 Postgres transaction을 기준 source로 두고, OpenFGA/OPA는 관계/정책 복잡도가 측정될 때만 별도 POC한다.
- **플랫폼이 자체 소유할 책임:** subject/capability/scope identity, per-request revalidation, deny precedence, expiry/revocation, decision reason, forbidden-vs-empty distinction, permission-aware URL/Context Link, audit correlation.
- **재사용 경계:** `checkCapability`/`actorScopeForCapability`의 seam과 matrix를 재사용한다. FeedbackOps의 role names, single Workspace, Managed System vocabulary, direct table query, `AllowAllAcl`-style local development shortcut을 public platform contract로 만들지 않는다.
- **실패 모드:** frontend hidden menu만으로 보호, `scopeId` URL을 증명으로 사용, role enum을 route별로 복제, stale cached Scope 사용, no rows를 permission denial 또는 empty로 추정.
- **최소 검증:** allow/explicit deny/role grant/scoped grant/workspace-wide grant-minus-deny/expired grant/unknown Scope/hidden entity를 menu→route→query→export→link에 같은 actor로 넣는다. **합격:** 모든 surface가 같은 decision fingerprint/reason을 사용하고, inaccessible Scope는 fallback 없이 forbidden/explicit unavailable이며, no data는 separate empty다. **탈락:** 한 surface만 허용, cached stale grant, URL 변경으로 권한 상승.
- **우선순위·선행:** **P0**; C-01의 authenticated actor와 domain capability catalog가 선행.
- **문서 반영:** `docs/06` §17에 `PermissionDecision`/`ScopeSet` field와 denial vocabulary, `docs/02`에 product capability owner, `docs/05`에 hierarchy/multi-scope 선택 조건을 추가한다. `docs/03`에는 same DB source와 future external policy engine의 migration/dual-write 조건을 적는다.
- **확신도:** 높음(실제 결정 코드와 authoritative UI contract가 일치), multi-scope 모델은 중간.

### C-03. Audit·idempotency·runtime DB 권한

- **ID / 사용자·운영 문제:** 민감한 권한 변경이나 cross-product link가 “성공했지만 감사가 없음”, “재시도 중 두 번 반영”, “운영자가 app role로 데이터 삭제” 상태가 되면 복구와 책임 추적이 불가능하다.
- **현재 근거:** `[I]` FeedbackOps `modules/core/audit/audit-service.ts`의 Tx-only `record`, `db/schema/core.ts` `audit_log`, `db/runtime-role.ts`의 `fops_app` 제한, migrations grant/deny, idempotency/rate-limit code. `[D]` ADR-0008은 permission/Reporter VOC status/Task approval/Managed System edit를 same Postgres Tx audit 대상으로 지정한다.
- **제안:** platform mutation contract가 `correlationId`, actor/workspace, subject, eventType, detail schema, idempotency key를 받고 domain mutation과 Audit append를 같은 Tx에서 수행하게 한다. 제품이 별도 deploy/database가 되는 경우에만 transactional outbox/event relay를 별도 결정한다. Audit 외부 sink는 downstream projection이지 authoritative write가 아니다.
- **플랫폼이 자체 소유할 책임:** event taxonomy/version, immutable/append-only boundary, same-Tx requirement, idempotency/replay response, runtime/migration role separation, redaction, retention/legal hold decision, operator repair audit.
- **재사용 경계:** `AuditService.record(tx,input)`, strict event detail validation, app-role grants, advisory lock/idempotency shape을 재사용한다. FeedbackOps `core.audit_log` 테이블과 제품 이벤트 이름을 플랫폼 schema에 그대로 합치거나 외부 log aggregator를 source of truth로 삼지 않는다.
- **실패 모드:** commit 뒤 audit insert, audit를 notification/inbox으로 오용, raw token/query/physical path 기록, retry에서 duplicate mutation, app runtime role로 `DELETE audit_log`, 외부 sink 장애가 본 mutation을 막거나 반대로 기록을 잃음.
- **최소 검증:** mutation success/failure rollback, duplicate `Idempotency-Key`, worker retry, runtime-role privilege probe, audit detail redaction, same-Tx link creation/denied link를 재현한다. **합격:** mutation rollback 시 audit도 없고, 한 idempotency key가 한 결과/명시적 terminal failure만 가지며, app role은 update/delete하지 못한다. **탈락:** audit-only success, duplicate state, sensitive payload leakage.
- **우선순위·선행:** **P0**; C-01 actor, C-02 permission, DB/deploy topology가 선행.
- **문서 반영:** `docs/03_backend_stack.md`에 runtime/migration role과 mutation transaction recipe, `docs/06` §18에 correlation/audit link, `docs/05`에 cross-service outbox와 retention을 Open으로 명시한다. ADR-0008은 platform/product event ownership 예시로 보강한다.
- **확신도:** 높음(same-Tx와 role guard 실제 확인), cross-service outbox는 낮음/중간.

### C-04. Entity Link 기반 VOC·Finding·Task 통합

- **ID / 사용자·운영 문제:** 분석 결과에서 VOC/Finding/Task로 이동하고 관계 이력을 보되, 한 제품의 상태 변경이 다른 제품의 권한·상태·감사를 몰래 바꾸지 않아야 한다.
- **현재 근거:** `[I]` `modules/entity-links/service.ts`의 `EntityLinkProvider`, endpoint existence/read/create checks, visibility evaluation, `entity_link.created/detached` same-Tx audit; `docs/implementation/02-domain-module-boundaries.md` 및 `06-entity-linking-contract.md`; VOC가 approved command로 Finding을 만들고 canonical history는 Entity Links에 남긴다.
- **제안:** 플랫폼은 entity type/relation/visibility registry, cross-workspace/Managed System compatibility validation, Context Link descriptor, link list/summary/redaction을 제공한다. 각 제품은 `assertExists`, `canRead`, `canCreateTarget`, summary provider, own status/command를 adapter로 노출한다. 링크 생성은 source/target permission과 same-Tx audit를 거친다.
- **플랫폼이 자체 소유할 책임:** relation allowlist, workspace/visibility policy, source/target permission evaluation, link lifecycle/detach, correlation/audit, transfer 가능한 Context와 unsupported Context 표시.
- **재사용 경계:** provider interface와 pure `evaluate-visibility`를 adapter 설계 근거로 쓴다. VOC/Finding/Task row, status transition, comment/reply, owner semantics, direct convenience FK를 플랫폼 공통 domain table로 옮기지 않는다.
- **실패 모드:** link가 target read permission을 부여, hidden target ID/summary leak, direct FK와 link history가 divergence, task 완료가 VOC를 자동 완료, source/target 다른 Workspace를 허용, UI가 raw URL을 조합.
- **최소 검증:** readable/summary-only/hidden source/target, admin/developer/user, cross-workspace, create vs read-only, detach/replay, Context transfer를 확인한다. **합격:** 권한 없는 entity의 ID/metadata가 노출되지 않고, link mutation과 audit가 atomic하며, 제품 상태는 owning module에서만 바뀐다. **탈락:** link browse로 권한 상승 또는 duplicate canonical history.
- **우선순위·선행:** **P1**; C-02 decision API, C-03 audit, A의 Context Link/URL codec이 선행.
- **문서 반영:** `docs/06` §22에 provider contract와 link summary visibility를, `docs/02` VOC/Finding/Task에 capability owner와 approved command를, `docs/01`에 cross-product link를 source lineage와 구별하는 문안을 추가한다.
- **확신도:** 높음(제품 경계와 구현 seam 확인), 다른 플랫폼 제품의 entity type은 중간.

### C-05. Notification/inbox은 요구 확인 뒤 최소 adapter로

- **ID / 사용자·운영 문제:** 업무 이벤트를 놓치지 않게 하되 audit log를 읽음 상태/수신자 inbox으로 오용하거나 범용 alert engine이 되어 platform kernel이 무거워지지 않아야 한다.
- **현재 근거:** `[D]` FeedbackOps `docs/adr/0014-notifications-in-app-and-email-channels.md`는 `core.notifications`, `NotificationChannel`, MockEmail/SMTP, pg-boss, event catalogue/idempotency를 설계한다. `[U]` 고정 커밋의 `apps/backend/src/modules`와 migrations에 해당 notification/inbox module/table을 찾지 못했고 nav에도 inbox count가 없다.
- **제안:** 현재는 도입하지 않는다. 실제 event catalogue, recipient authority, permission-at-read, dedupe key, read/archive/privacy/retention 요구가 확정된 뒤, domain event를 받아 platform-owned in-app notification projection으로 최소 구현한다. Audit는 history로 남기고 notification은 별도 row/read state를 가진다. Email은 channel adapter로 후순위다.
- **플랫폼이 자체 소유할 책임:** recipient/scope recheck, notification visibility/redaction, dedupe/idempotency, read/archive lifecycle, correlation/event version, channel delivery state와 retry policy.
- **재사용 경계:** ADR의 audit와 notification 분리, event idempotency, channel abstraction은 설계 선례다. ADR만으로 table/module/pg-boss가 구현됐다고 보고하거나 FeedbackOps 제품 notification을 shared engine으로 승격하지 않는다.
- **실패 모드:** permission revoked 뒤 notification body 노출, audit를 unread inbox으로 쿼리, 모든 domain 상태를 generic alert로 발행, email retry가 duplicate external send, zero count를 permission absence로 오해.
- **최소 검증:** event→recipient creation, duplicate event, revoke-after-create, hidden subject, mark read/archive, delivery retry를 재현한다. **합격:** 읽을 권한이 없으면 body/subject가 숨겨지고, duplicate event가 한 notification만 만들며, audit와 unread state가 분리된다. **탈락:** audit row가 inbox로 노출, recipient scope bypass, 무한 retry.
- **우선순위·선행:** **P2/Deferred**; concrete event matrix, user/org directory, retention/privacy, delivery ownership이 선행.
- **문서 반영:** `docs/00_overview.md` exclusion과 `docs/02_domain_menus.md` Notice 경계를 유지한다. `docs/05`에 “ADR-0014는 문서 전용; event/recipient decision 후 POC”를 기록하고, 채택 시 `docs/06`에 permission-at-read와 Data Trust/error state를 추가한다.
- **확신도:** 높음(구현 부재와 문서 설계 확인), 실제 수신 요구는 낮음.

### C-06. FileGateway 원본 로그·설정 증거 adapter

- **ID / 사용자·운영 문제:** 분석 결과에서 원본 로그를 열어 판단을 확인해야 하지만 browser가 물리 경로/API key를 알면 Scope·감사·비밀 경계가 깨진다.
- **현재 근거:** `[I]` `/Users/hyojung/orca/projects/FileGateway` HEAD `30d89a5210e5b3bd8c9c6a6c1fff8469867d7be8`; `AGENTS.md`, `README.md`, `docs/05-api-interface.md`, `src/FileGateway.Api/Auth/ApiKeyMiddleware.cs`, `Audit/AuditMiddleware.cs`, `Endpoints/LogEndpoints.cs`. logical `equipmentId`, `logType`, `[from,to)`, metadata+streaming, API key, physical path 비노출은 확인했다. `[U]` platform adapter/live endpoint/Scope mapping은 없다.
- **제안:** 플랫폼 server가 occurrence/context를 검증하고 FileGateway adapter에 logical query를 전달한다. gateway는 server-to-server credential/API key를 보유하고, platform은 user-facing one-time context/deep link와 stream proxy를 제공한다. 응답에 source/status/correlation/observedAt를 연결하고, gateway failure/empty/no permission을 구별한다.
- **플랫폼이 자체 소유할 책임:** actor/Scope check, `equipmentId`/log type allowlist, canonical naive wall-clock와 source timeDomain assertion, request/audit correlation, redaction, stream size/time budget, stale file/retention status.
- **재사용 경계:** gateway의 logical resolver, metadata/streaming/error vocabulary, audit field shape만 adapter 후보로 삼는다. API key middleware, FTP/FTPS/MSSQL/.NET code, physical file resolver, gateway의 local timezone interpretation을 platform common으로 복사하지 않는다. 현재 gateway 문서의 offsetless `Asia/Seoul` 규칙은 `docs/06` naive wall-clock/timeDomain 계약과 충돌할 수 있으므로 adapter에서 명시적으로 매핑/거부해야 한다.
- **실패 모드:** browser에 API key 전달, `fileId` URL을 권한으로 신뢰, offsetless 시간을 UTC 또는 임의 `Asia/Seoul`로 조용히 변환, revoked Scope로 cached stream 제공, raw physical path/error/secret logging.
- **최소 검증:** authorized/forbidden occurrence, timeDomain mapped/unknown, range boundary, expired file, gateway timeout, large stream/cancel을 stub service로 검증한다. **합격:** forbidden request는 gateway를 호출하지 않고, `[from,to)`와 timeDomain assertion이 보존되며, stream/audit에 user context와 correlation이 연결된다. **탈락:** browser credential, timezone silent conversion, unauthorized upstream call.
- **우선순위·선행:** **P1 조건부**; raw evidence drill-through 요구, equipment identity mapping, service credential/availability, stream budget이 선행.
- **문서 반영:** `docs/01` §2에 raw evidence provider adapter와 logical file ID, `docs/06` §§6/18/22에 source timeDomain/stream permission/context, `docs/05`에 FileGateway API key→platform service identity 결정을 추가한다.
- **확신도:** 중간(로컬 코드 확인), 실제 endpoint/schema/운영 ACL은 낮음.

### C-07. ProjectGraph·parser를 Data Trust/lineage adapter로 연결

- **ID / 사용자·운영 문제:** metric의 source/lineage와 원천 parser 상태를 보여 주되, static 분석 artifact가 현재 수집 완료나 계산 완료인 것처럼 표시되면 잘못된 현장 판단을 만든다.
- **현재 근거:** `[I]` ProjectGraph `bd3bda9aeeede6cd6856facb3aa70b64f88eb45a`의 canonical evidence/lineage JSON, evidence ID/content hash/contract version validation, static `serve`; parser `d84fab18fa10ead7f59b8169de25848f34a5164b`는 upstream 프로젝트로 별도 유지. `[D]` `docs/01`의 parser→platform view/mart contract와 `docs/06` §§18–19의 source/lineage/statusSource/observedAt.
- **제안:** ProjectGraph는 버전·content hash·evidence ID를 가진 read-only lineage artifact provider로, parser는 source/master/watermark provider로 adapter화한다. 플랫폼이 `analysisContextId`, Scope/redaction, generation, source watermark, `statusSource`, `observedAt`, artifact availability를 결합한다. source가 없거나 stale면 `unknown/partial`을 내고 confirmed/complete로 승격하지 않는다.
- **플랫폼이 자체 소유할 책임:** lineage/evidence public schema, artifact version/retention, permission/redaction, source vs calculated generation, data coverage/freshness semantics, correlation and failure state.
- **재사용 경계:** ProjectGraph의 evidence ID/content hash/contract-version validator와 static JSON shape는 참고한다. ProjectGraph static server, parser 내부 변환/DB table, git analysis completeness를 runtime permission/freshness source로 흡수하지 않는다.
- **실패 모드:** static lineage를 live Data Trust로 표시, old artifact를 current generation에 결합, ACL 없이 source path/evidence 내용 노출, parser watermark 없는 상태에서 complete 표시, lineage graph가 metric definition owner가 됨.
- **최소 검증:** artifact version/hash mismatch, source watermark missing, parser late row, generation ready/building, unauthorized lineage, artifact unavailable를 fixture로 확인한다. **합격:** 같은 response가 source watermark와 calculated generation을 분리하고, ACL/Scope가 적용되며, unknown/partial reason에 status source가 있다. **탈락:** git/static success가 source complete로 표시, stale artifact silent fallback.
- **우선순위·선행:** **P2 조건부**; Data Trust field contract, parser watermark owner, lineage access/privacy 요구가 선행.
- **문서 반영:** `docs/01` §§2–3에 source/lineage adapter와 generation ownership, `docs/06` §18에 evidence artifact/hash와 statusSource, `docs/05`에 ProjectGraph는 static/reference only임을 추가한다.
- **확신도:** 중간(artifact code와 문서 계약 확인), 실제 parser watermark·lineage ACL은 낮음.

### C-08. FeedbackOps saved view와 Context Link의 제한적 연결

- **ID / 사용자·운영 문제:** 사용자가 분석 조건을 다시 열고 VOC/Finding 화면으로 이동할 때 saved token이나 제품 route가 Scope/permission을 우회하거나 지원하지 않는 Context가 사라지면 안 된다.
- **현재 근거:** `[I]` FeedbackOps `modules/saved-views/service.ts`는 workspace+actor private view, `voc|tasks|task_requests|findings` surface와 각 domain list schema 재검증을 구현한다. `[D]` `docs/06` §§21–22는 platform Saved View를 Deferred로 두고, Context Link helper가 destination/transfer/unsupported/permission을 소유하도록 한다. FeedbackOps `NAV_TREE`/route-local schemas는 platform registry가 아니다.
- **제안:** platform은 canonical context codec, route/deep-link, saved-view permission recheck와 Context Link descriptor를 먼저 만든다. FeedbackOps saved view는 제품 private adapter로만 노출하고, platform-wide shared saved view/table/token은 실제 사용자 범위·보존·Scope hierarchy가 정해질 때 결정한다.
- **플랫폼이 자체 소유할 책임:** context version/canonicalization, route ownership, destination capability, saved view owner/scope/expiry/revalidation, unsupported Context 표시, forbidden/empty distinction.
- **재사용 경계:** domain filter schema를 저장 시 실제 query schema로 재검증하는 패턴과 actor ownership을 재사용한다. FeedbackOps surface enum, query payload, route strings, private row/table을 platform global schema로 복사하지 않는다.
- **실패 모드:** saved token이 scope 권한을 증명, revoked grant 뒤 token 재사용, unsupported context를 default로 보정, menu가 다른 제품 URL 문자열을 직접 조립, private view가 다른 actor에게 노출.
- **최소 검증:** context encode/decode round trip, product view adapter, revoked Scope, unsupported metric/equipment, deleted entity, duplicate/unknown query, direct deep link를 확인한다. **합격:** restore마다 server Scope를 재확인하고, unsupported 값은 보존+명시, private view는 owner/workspace로 제한된다. **탈락:** token-only auth, silent fallback, cross-product URL drift.
- **우선순위·선행:** **P1**(Context Link) / **P2 Deferred**(platform Saved View); A의 URL codec, C-02 permission이 선행.
- **문서 반영:** `docs/06` §§21–22에 product-private adapter와 platform asset의 차이를 추가하고, `docs/02`에 VOC saved view의 ownership을 명시한다. `docs/05`에는 shared saved view 채택을 바꾸는 규모/보존/Scope 질문을 남긴다.
- **확신도:** 높음(실제 service와 contract 비교), platform token lifecycle은 중간.

## 5. 추천 최소 조합과 대안

### 5.1 지금 가능한 최소 조합

다음 조합은 조직 IdP가 있거나 OIDC issuer를 별도로 결정할 수 있고, 플랫폼이 초기에는 동일 Postgres를 사용할 수 있다는 **가정**의 Candidate다. 수치 성능 목표는 측정 전 가정으로 두지 않으며, 이 조사에서는 POC/실행을 하지 않았다.

1. **OIDC adapter + opaque server session:** FeedbackOps의 `AuthProvider`/`openid-client` flow에서 PKCE·state·nonce·claim allowlist·same-origin returnTo·opaque session 패턴을 가져온다. Platform actor/organization/workspace mapping과 deprovision/revoke는 별도 contract로 만든다.
2. **Platform-native Permission/Scope/Audit:** Postgres를 초기 source of truth로 두고, `PermissionDecision`, `ScopeSet`, same-Tx append-only Audit, idempotency/runtime-role guard를 작은 공용 server seam으로 만든다. Menu/route/filter/query/export/link가 이를 호출하는 것이 Platform Done의 첫 acceptance slice다.
3. **Entity Link + Context Link adapter:** VOC/Finding/Task는 FeedbackOps의 bounded product로 남기고, platform registry/visibility/permission/audit와 product provider interface로 연결한다. 제품 상태를 공용 테이블로 합치지 않는다.
4. **Parser compatibility view/mart + optional evidence adapters:** parser는 upstream, platform은 read-only view/mart와 source/generation contract를 소유한다. raw log 수요가 확인될 때 FileGateway adapter를, lineage drill-through 수요가 확인될 때 ProjectGraph artifact adapter를 추가한다.
5. **Notification은 보류:** concrete event/recipient/privacy/retention 요구가 생길 때만 in-app projection을 설계한다. ADR-0014를 구현 완료로 표시하지 않는다.

이 조합의 작은 수직 검증 흐름은 다음과 같다.

`OIDC login → authenticated Actor/Workspace request → URL의 Context decode → 서버 Scope recheck → parser/platform read-only query → Data Trust/generation response → permission-aware Entity/Context Link → same-Tx Audit → revoke 후 동일 deep link가 forbidden`

합격 조건은 다음 네 가지다.

- OIDC callback/transaction/session negative cases가 통과하고, IdP 로그인 성공만으로 Scope가 생기지 않는다.
- 같은 actor/Scope decision이 menu, direct route, query, export/link에서 일관되며 URL 값은 권한이 아니다.
- chart/table/export 또는 domain mutation과 audit/generation의 source/correlation semantics가 분리·연결된다.
- FeedbackOps entity status는 제품이 계속 소유하고, Link/Context Link는 permission 없는 target의 ID/summary를 노출하지 않는다.

이 흐름은 **설계 검증 계획**이다. 현재 실행한 test/build/DB/IdP/외부 gateway가 없다.

### 5.2 선택이 바뀌는 조건

- **기존 corporate IdP와 조직 directory가 있으면:** Keycloak/Ory를 추가하지 않고 OIDC adapter만 채택한다. 결정 근거는 issuer discovery, group/tenant mapping, deprovision SLA, 운영 ownership이다.
- **IdP가 없고 self-hosted SSO가 명시되면:** Keycloak을 IdP 후보로 POC한다. realm/claim mapping과 backup/upgrade 운영을 측정하되 앱 Scope/권한 저장소로 쓰지 않는다.
- **여러 서비스·다단계 object hierarchy가 생기고 Postgres Scope matrix가 병목임을 측정하면:** OpenFGA를 관계 read model로 검토한다. Postgres audit/identity와 authority 분리, tuple freshness, fail-closed, dual-write/reconciliation 증거가 없으면 도입하지 않는다.
- **관계가 아니라 설명 가능한 복합 조건/정책 번들이 제품 수를 가로질러 필요하면:** OPA를 보조 evaluator로 검토한다. actor/session/Scope source와 audit는 별도로 유지한다.
- **원본 evidence 요구가 없다면:** FileGateway adapter를 만들지 않는다. raw log는 platform kernel의 기본 책임이 아니다.
- **알림/저장 뷰 요구가 확인되지 않으면:** notification engine이나 platform-wide saved view를 만들지 않는다. 현재 문서의 Deferred/제외 경계를 유지한다.

## 6. 충돌·중복·미결 질문

| 질문 | 답이 없을 때의 판단 범위 | 결정을 바꾸는 증거 |
|---|---|---|
| 조직 IdP와 actor deprovision/그룹 mapping의 실제 owner는 누구인가? | OIDC protocol adapter와 platform Actor seam까지만 설계하고 Keycloak/Ory는 보류한다. | issuer/tenant 수, group claim 안정성, disable 반영 SLA, 운영/비밀관리 owner |
| Scope hierarchy와 multi-scope 선택은 어떻게 되는가? Managed System과 조직/사업장/팀의 관계는? | 단일 authenticated request + explicit ScopeSet을 사용하고, FeedbackOps의 single Workspace를 공용 규칙으로 복사하지 않는다. | 실제 hierarchy, actor 수, permission matrix, cross-scope aggregation 요구 |
| 플랫폼과 제품이 별도 DB/배포가 될 가능성은? | 같은 Postgres의 same-Tx Audit/Entity Link를 최소선으로 두고, outbox/event relay는 설계 질문으로 남긴다. | deploy boundary, network failure model, event delivery/duplicate SLA, reconciliation owner |
| 원본 log/evidence와 lineage를 어느 사용자/시간 범위까지 보여야 하는가? | FileGateway/ProjectGraph adapter 없이 Data Trust에 source/lineage availability만 `unknown`으로 표시한다. | raw drill-through 사용자, retention, source timezone/timeDomain, service identity와 ACL |
| notification/inbox 및 shared saved view의 실제 수신자·보존·privacy는? | ADR-0014와 Saved View는 문서/제품-private 선례로만 남기고 platform engine을 만들지 않는다. | event catalogue, recipient directory, revoke-after-create policy, email/legal retention, cross-menu sharing 요구 |

### 중복·충돌을 정리할 결정

- `repository-integration-candidates-luna.md`의 “FeedbackOps baseline/FileGateway adapter/ProjectGraph artifact/vocpage selective/jira-nexus reference” 방향은 유지하되, 이 보고서는 고정 커밋에서 실제 AuthProvider/CheckService/Audit/Entity Link와 알림 부재를 확인해 **어떤 책임을 platform으로 추출할지**를 추가한다. 해당 보고서의 후보 목록을 구현 존재의 증거로 사용하지 않는다.
- FeedbackOps의 Permission/Audit/Core가 이미 공통처럼 보인다는 점과 `docs/integration/repository-layout.md`의 “shared/ui 또는 platform common으로 자동 승격 금지”는 충돌하지 않는다. **공통으로 재사용할 것은 protocol/decision/event shape이고, 제품 table/module/role vocabulary는 독립 유지**한다.
- FileGateway의 offsetless `Asia/Seoul` 해석은 platform의 naive wall-clock 자체와 반드시 같은 뜻이라고 단정할 수 없다. adapter가 source `timeDomain`을 명시하거나 unknown으로 거부해야 하며 silent conversion은 금지한다.
- ProjectGraph의 content hash/evidence ID는 lineage artifact provenance에 쓸 수 있지만, platform `generationId/sourceWatermark/calculationBasisTime`와 동일한 필드가 아니다. 두 세대를 한 “latest” 표시로 합치지 않는다.

## 7. 출처 목록과 검증 한계

### 저장소·문서

- 플랫폼 계약: `docs/INDEX.md`, `docs/00_overview.md`, `docs/01_architecture_and_data_contract.md`, `docs/02_domain_menus.md`, `docs/03_backend_stack.md`, `docs/05_roadmap_and_open_questions.md`, `docs/06_platform_ui_contract.md`, `docs/integration/repository-layout.md`, `docs/integration/repository-ideas.md`, `PLATFORM_REQUIREMENTS.md`.
- FeedbackOps pinned submodule: `products/feedbackops` at `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`.
  - Auth: `apps/backend/src/modules/auth/auth-provider.ts`, `oidc-auth-provider.ts`, `oidc-tx-cookie.ts`, `routes.ts`, `session-service.ts`, `config-oidc.ts`, `middleware/require-session.ts`, `middleware/require-workspace.ts`.
  - Permission/Scope: `apps/backend/src/modules/permissions/check-service.ts`, `scope-service.ts`, `apps/backend/src/modules/findings/authorization.ts`, `apps/backend/src/modules/voc/read-service.ts`, `repo-read.ts`.
  - Core/Audit/links: `apps/backend/src/modules/core/audit/audit-service.ts`, `apps/backend/src/db/schema/core.ts`, `apps/backend/src/db/runtime-role.ts`, `apps/backend/src/modules/entity-links/service.ts`, `evaluate-visibility.ts`, `modules/managed-systems/managed-system-service.ts`.
  - Contracts: `docs/adr/0006-authentication-and-actor-provisioning.md`, `docs/adr/0008-audit-and-retention.md`, `docs/adr/0014-notifications-in-app-and-email-channels.md`, `docs/implementation/02-domain-module-boundaries.md`, `docs/implementation/06-entity-linking-contract.md`.
- Other read-only local evidence: FileGateway at `30d89a5210e5b3bd8c9c6a6c1fff8469867d7be8`; ProjectGraph at `bd3bda9aeeede6cd6856facb3aa70b64f88eb45a`; parser at `d84fab18fa10ead7f59b8169de25848f34a5164b`. Their local dirty/untracked files were not touched.

### 공식 웹 출처 (2026-09-22 확인)

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html): authorization code flow와 ID Token validation의 표준 단계.
- [RFC 7636 PKCE](https://datatracker.ietf.org/doc/html/rfc7636): S256 `code_challenge`와 authorization-code interception 방지.
- [`openid-client` 공식 저장소](https://github.com/panva/openid-client): discovery, authorization code, token/ID Token 관련 client capability와 MIT 표시.
- [Keycloak 공식 사이트](https://www.keycloak.org/) 및 [공식 pom](https://github.com/keycloak/keycloak/blob/main/pom.xml): SSO/identity brokering/LDAP·AD/OIDC·SAML capability와 Apache-2.0 표시. 사이트의 release 표시는 2026-09-22 스냅샷이다.
- [OpenFGA concepts](https://openfga.dev/docs/concepts), [getting started](https://openfga.dev/docs/modeling/getting-started), [공식 저장소](https://github.com/openfga/openfga): relationship tuple/model 기반 authorization과 Apache-2.0 표시.
- [OPA 공식 저장소](https://github.com/open-policy-agent/opa): general-purpose policy engine과 Apache-2.0 표시.
- 대안 참고: [Ory Kratos 공식 저장소](https://github.com/ory/kratos), [Ory OSS/상용 경계 약관](https://www.ory.com/legal/tos).

### 검증 한계

- 플랫폼 root에 runtime API/UI/DB가 없으므로 platform implementation adoption은 검증할 수 없다. FeedbackOps의 integration test 파일은 읽었지만 `pnpm`/DB/IdP를 실행하지 않았고, 어떠한 테스트 pass 수나 실서비스 동작을 주장하지 않는다.
- 실제 SSO issuer/organization directory, multi-tenant/multi-scope rule, deployment boundary, data volume/concurrency, retention/legal policy, raw log service endpoint/ACL, parser watermark, ProjectGraph artifact publication은 확인하지 못했다.
- OSS 공식 문서는 capability와 license 근거로만 사용했다. 제품 데이터에 대한 성능, 보안, 운영 난이도, 유료 지원 범위는 측정·계약 검토 전의 선택 조건이다.
- 보고서 작성 중에는 지정 보고서 파일 외 소스·submodule·dependency를 수정하지 않았고, install/server/migration/commit/push/external publish를 수행하지 않았다.
