# FeedbackOps 합류 설계 — 전역 기능 + 피드백 운영 업무 시스템, 서버는 FeedbackOps 백엔드에서 출발

> 상태: 방향은 **Decided**([ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), 사용자 2026-10-21). 이 문서의 배치표·단계·서버 대응표는 **Candidate**, §7은 **Open**이다. 지도 [#598](https://github.com/hjung3113/analytics-platform/issues/598), 마일스톤 `M6 FeedbackOps 합류`.
>
> 이 문서는 [플랫폼 탑재 설계](platform-hosting-design.md)의 FeedbackOps 부분(한 원본·두 호스트)을 대체한다. 그 문서의 호스트 → 모듈 계약은 equipment-visualization과 사내 새 앱을 위해 유효하다([ADR-0053](../adr/0053-host-module-contract-v1.md)).

## 1. 목표와 범위

FeedbackOps를 플랫폼 앱 하나·서버 하나·저장소 하나로 합친다. 사용자는 플랫폼 셸 안에서 VOC를 남기고 설문에 답하고, 관리자·개발자는 같은 셸의 업무 시스템에서 Triage → Finding → Task 흐름을 다룬다. 독립 FeedbackOps 앱은 합류가 끝나면 은퇴한다.

범위 밖: FeedbackOps 도메인 규칙 변경, 화면 재설계. 옮긴 뒤 화면 모양이 바뀌는 부분(셸 배치, 전역 진입)만 시안 컨펌을 받는다.

## 2. 원칙

1. **화면은 보는 사람 기준으로 나누고, 데이터 주인은 나누지 않는다.** 전역 기능 화면도 FeedbackOps 도메인 API를 쓴다. 플랫폼이 VOC·설문 응답을 따로 저장하지 않는다.
2. **화면은 옮기고 다시 쓰지 않는다.** FeedbackOps 화면 코드를 Kernel 라우팅·Registry에 맞춰 옮긴다. 화면 단위 동작·문구·권한 표시는 FeedbackOps 기준을 유지한다.
3. **FeedbackOps 도메인 불변식은 그대로 간다**(원본: `docs/feedbackops/GLOSSARY.md`, 합류 뒤에는 옮긴 위치):
   - VOC는 인증된 사내 사용자가 남긴 목소리다. 설문 응답에서 VOC를 만들지 않는다.
   - Triage·신고자 표시·Task 상태 기계 셋은 서로 자동 매핑하지 않는다(FO ADR-0005).
   - 시스템 간 이력의 원본은 `entity_links`다.
   - Task Request가 검토 전 실행 후보로부터 Task 백로그를 지킨다.
   - 대시보드는 차트 보고가 아니라 액션 큐다.
4. **서버 계약은 SDK, 구현은 FeedbackOps 백엔드에서 출발**([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)의 "서버는 계약만"을 유지).

## 3. 기능 배치 (Candidate)

### 3.1 플랫폼 전역 기능 — 모든 사용자

공간 밖 전역 유틸리티 자리([ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md))에 둔다. 이슈 [#594](https://github.com/hjung3113/analytics-platform/issues/594). 화면 배치는 Decided([ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)): 전역 화면은 플랫폼 사이드바(`홈` / `내 활동` / `공지`), 업무 시스템 안은 전환기 팝오버의 `플랫폼 메뉴` 구역.

| 기능 | 지금 FeedbackOps | 플랫폼에서 |
| --- | --- | --- |
| VOC 등록 | `/vocs` 생성 폼 | 레일 `VOC 등록` → 오른쪽 도킹 드로어(본문을 밀어냄). 열 때 지금 메뉴·Context를 지울 수 있는 칩으로 고정하고, 제출하면 남은 칩이 설명 끝 `화면 정보` 블록(항목 목록 + `화면 열기` 링크)이 된다([ADR-0045](../adr/0045-feedbackops-entry-link-mapping-and-scope.md) 개정). Managed System은 앱 표(`managedSystemFor`)의 값이 FeedbackOps 목록에 있을 때만 미리 고르고, Analytics Area는 연결이 없어 비워 직접 고른다. 본문은 신고자 관점 작성 화면 `VocComposeScreen`(유사 VOC·신고자 카드 없음, #656). 오른쪽 패널은 하나(ADR-0070) |
| 내 VOC·신고자 VOC 상세 | `/vocs` 내 VOC 탭·상세 | 전역 `내 VOC`(1단계 읽기 화면 대체, M3 #84–#86). 플랫폼 경로 `/voc`(목록 + 셸 상세 패널)·`/voc/:vocId`(전체 화면), 읽기 전용(#654) |
| 설문 참여·응답 | `/surveys/participate`, `/surveys/$id/respond` | 전역 `설문` 전체 페이지(플랫폼 경로 `/surveys`·`/surveys/:surveyId/respond`, #653). 알림·홈·플랫폼 메뉴에서 진입, 제출 뒤 출발 화면으로 복귀, VOC를 만들지 않음(ADR-0070) |
| 알림함 | 알림 모듈(신고자 알림, Slice 65) | 레일 알림 종(읽지 않은 수 배지) → 팝오버 → `모두 보기` 알림 페이지. VOC 상태 변경·권한 결정(설문 요청 알림은 FeedbackOps에 아직 없다 — 백로그). 읽음은 설문 완료와 별개(ADR-0070) |
| 권한 요청 | 요청 대화상자·`requestable_permission` 오류 | 전역 요청·철회·내 요청 상태(구현, #657 — `/permission-requests`, 보완·수정·만료일은 백로그). 공간 0개 홈의 `권한 요청` 버튼(ADR-0070, 구현). 승인은 계속 FeedbackOps 관리자 화면(§3.3) |
| 내 활동 | (없음) | 별도 페이지가 아니다. 사이드바 묶음 `내 활동`과 홈의 `내 할 일`(응답할 설문·바뀐 내 VOC·권한 요청)(ADR-0070, 구현 #657) |
| 공지 | (없음) | 이미 플랫폼 전역 |

### 3.2 `피드백 운영` 업무 시스템 — 관리자·개발자

시스템 전환기의 업무 시스템 하나([ADR-0042](../adr/0042-system-switcher-and-system-owned-rail.md)). 틀은 **Decided: [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md)**(이름 `FeedbackOps`·부제 `피드백 운영`, 레일 순서 `대시보드` · `VOC` · `Findings` · `Tasks` · `연동` · `Surveys` · `관리자`, 사이드바 `목록 범위`, 한 줄 머리). **구현됨(#759, #760, #761, #762, #763, #764):** 공간·`대시보드` 섹션·`목록 범위`·`VOC`의 `수신함`/`Triage`/`Clusters`(`/feedbackops/vocs`·`/feedbackops/triage`·`/feedbackops/clusters`, 선택은 `focus`)와 사이드바 보기·개수·저장된 보기, 다른 시스템 바닥 블록의 셸 안 이동·`Tasks` 그룹의 `Task Requests`·`Tasks`(보드)·`내 Task`·`Milestones`·숨은 `Task 목록`(`/feedbackops/task-requests`·`/feedbackops/tasks`·`/feedbackops/my-tasks`·`/feedbackops/milestones`·`/feedbackops/tasks/list`, 선택은 `focus`); `Findings` 그룹의 `전체 Finding`(`/feedbackops/findings`, 선택은 `focus`); `연동` 그룹의 `연동 액션 대시보드`·`Evidence`·`엔티티 링크`·`커버리지`(`/feedbackops/integration`·`/feedbackops/evidence`·`/feedbackops/entity-links`·`/feedbackops/coverage`, 선택은 `focus`); `Surveys` 그룹의 `Survey 관리`(`/feedbackops/surveys`, 선택은 `focus`)와 숨은 `Survey 빌더`·`Survey 결과`·`Survey 후속 조치`(`/feedbackops/surveys/:surveyId/builder|results|follow-up`); `관리자` 그룹의 `Managed System`·`Analytics Area`·`권한 요청 검토`·`부여 목록`·`FeedbackOps 설정`(`/feedbackops/managed-systems`·`/feedbackops/analytics-areas`·`/feedbackops/permission-requests`·`/feedbackops/permission-grants`·`/feedbackops/settings`, 권한 `console:access`, `목록 범위` 끔)와 사용자 메뉴 `FeedbackOps 전체` 링크 제거(#764 p2). 아래 표의 메뉴 열은 원본 기준이고, 신고자 항목과 `연동 › Findings` 중복은 뺀다. 레일 섹션과 메뉴는 지금 FeedbackOps 레일·사이드바(`NAV_TREE`)를 출발점으로 한다. 이슈 [#595](https://github.com/hjung3113/analytics-platform/issues/595). (위 `/feedbackops/…` 주소는 manifest `path`에 등록한 별칭이고 정규 URL은 `/feedbackops/<메뉴 id>`다 — 표는 `menus/AGENTS.md`).

| 레일 섹션(Decided, ADR-0081) | 메뉴 | 지금 FeedbackOps 경로 |
| --- | --- | --- |
| 대시보드 | 대시보드(액션 큐) | `/home` |
| VOC | 수신함·Triage(구현됨, #761 1부)·저장된 보기·VOC Cluster | `/vocs`, `/voc-clusters` |
| Findings | Finding 목록·상세 | `/findings` (목록·상세 구현됨 #762 p1) |
| Tasks | Task Request·Task·내 Task·Milestone | `/tasks` (Task Request·보드·내 Task·Milestone·Task 목록 구현됨 #763) |
| 연동 | 연동 액션 대시보드·Evidence·Links·Coverage | `/integration`, `/integration/*` (구현됨 #762) |
| Surveys | Survey 관리(빌더·결과·후속 조치) | `/surveys`, `/surveys/$id/results`, `/follow-up` |
| 관리자 | Managed System·Analytics Area·권한 요청 검토·부여 목록·FeedbackOps 설정 | `/admin/*` |

다른 업무 공간 사이드바의 FeedbackOps 블록([ADR-0045](../adr/0045-feedbackops-entry-link-mapping-and-scope.md))은 새 탭 링크에서 셸 안 이동 + 업무 시스템 미리 채움 + 복귀로 바뀐다(구현 안 함 — #595). `VOC 등록` 항목은 블록에서 빠지고 레일로 간다([ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)).

### 3.3 권한·레지스트리 관리 — Decided ([ADR-0068](../adr/0068-permission-scope-and-business-system-link.md))

- **최종 위치:**
  - 운영 콘솔: 권한 요청 승인, 부여·거부 목록
  - `피드백 운영` 설정: Managed System Registry와 기본값, 공간 연결, Analytics Area. Analytics Area는 메뉴 Registry에서 자동 생성하지 않고 메뉴 id를 선택해 연결한다.
- **합류 단계 1–4:** FeedbackOps `/admin/*`를 `피드백 운영` 안에 그대로 옮긴다. 승인 화면을 콘솔로 옮기는 것은 ADR-0068 결정 2의 스키마가 들어간 뒤에 따로 한다.
- **누출 조건:** `console:access`로 승인 권한이나 FeedbackOps 감사 상세를 열지 않는다.

## 4. 서버 출발점 (Candidate)

플랫폼 앱은 서버를 `PlatformAdapter` 하나로 만난다([실서버 체크리스트](real-server-checklist.md) §1). 실어댑터 조립(#154)이 FeedbackOps 백엔드를 가리키게 하고, 백엔드가 [HTTP 어댑터 계약](http-adapter-contract.md)의 공통 부분을 구현한다. 이슈 [#593](https://github.com/hjung3113/analytics-platform/issues/593).

아래 차이표는 FeedbackOps `develop` `c73c55c5`와 플랫폼 `main` `5b92ab8`를 읽고 만들었다(2026-10-21, 코드는 실행하지 않음). FeedbackOps 경로는 `apps/backend/src/` 기준이다. 지금은 `apps/fo-backend/src/`처럼 `apps/fo-*`·`packages/fo-*` 아래에 있다. 줄 번호는 그 커밋 기준이다.

**요약**

- 그대로 쓴다: 인증(mock + OIDC), 서버 세션 쿠키, 미인증 401, rate limit, `Idempotency-Key`, 감사 저장(쓰기).
- 모양만 맞춘다: 세션 부트스트랩, `getEntity`, `accessDirectory`, 경로 접두사, 필드 이름(snake_case → camelCase), 오류 전달.
- 새로 만든다:
  - 전송 규칙: 판정 결과를 200 + envelope로 돌려주기, CSRF 토큰, Correlation ID, `sessionVersion`
  - 메서드: 감사 읽기(`auditTrail`·`entityAudit`), 활용률(`recordUsage`·`usageSummary`), `reportClientError`, 차트 주석
- 전송 계약 문서는 서버를 FastAPI로 가정한다. 실제 FeedbackOps 백엔드는 Fastify 5 + zod다(`apps/backend/package.json:29`). 고치는 일은 O12.

운영 안전 규칙(Postgres 기반 rate limit, CSP, `Idempotency-Key`, SQL 마이그레이션 — FO ADR-0015)과 배경 작업(pg-boss, FO ADR-0009)은 그대로 쓴다. 배포 모양(사내 k8s의 Docker, FO ADR-0013)은 #151 답으로 확인한다.

### 4.1 공통 처리

| 항목 | 분류 | FeedbackOps 근거 | 차이·할 일 |
| --- | --- | --- | --- |
| 경로 접두사 `/api/v1/platform/...` | 모양만 다름 | 모든 route가 접두사 없이 루트에 붙는다(`server.ts:389-926`). dev proxy는 화면 경로와 겹치는 `/vocs` 등을 Accept 헤더로 구분한다(`apps/frontend/vite.config.ts:28-60`) | 플랫폼 포트는 `/api/v1/platform`에 새로 등록한다. 기존 경로는 옮기지 않는다 — 플랫폼 앞단이 `/api/fo`를 떼어 보낸다([ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md), O13) |
| JSON 필드 이름 | 모양만 다름 | snake_case(`modules/auth/routes.ts:221-231`) | 플랫폼 포트는 `@ap/contracts`의 camelCase로 답한다 |
| 요청 검증 | 모양만 다름 | zod `.strict()`. 실패하면 422 `validation.failed`(`lib/http-error-handler.ts:50-58`) | 계약 §2는 envelope 메서드면 200 + `error`, fire-and-forget이면 200 + `accepted: 0/false`다. 플랫폼 경로에는 별도 처리기가 필요하다 |
| 오류 envelope·코드 | 모양만 다름 | ADR-0012 상태 코드 + `{code, message, detail}`(`lib/errors.ts:9-27`). 오류 처리기는 루트에 하나다(`server.ts:345`) | 플랫폼은 권한 거부도 200 + `outcome`이다. 한 서버에 두 규약이 생긴다(O12) |
| 프레임워크 4xx | 모양만 다름 | 413·415·깨진 JSON을 모두 422 `validation.malformed_request`로 바꾼다(`lib/http-error-handler.ts:59-74`) | 계약 §2 표는 413을 `http_413`으로 따로 둔다. 계약을 고칠지 서버를 고칠지는 O12 |
| 세션 쿠키 | 있음 | `fops_session`: httpOnly·SameSite=Lax·운영 Secure(`modules/auth/routes.ts:102-108`, `middleware/require-session.ts:13`). 서버 저장 세션(FO ADR-0006) | 계약 §6과 같다 |
| 인증·OIDC | 있음 | AuthProvider mock/OIDC 전환(`server.ts:367-388`). 운영에서 mock이면 기동을 거부한다(`server.ts:182-186`) | IdP 값은 #150, 첫 사용은 #603(Keycloak) |
| 미인증 `/api/**` → 401 | 있음 | `requireSession`이 401 `auth.session_invalid`를 낸다(`middleware/require-session.ts:20-29`). 302는 `/auth/login`·`/auth/callback`만 쓴다 | 같다 |
| 로그인 `return_to` | 있음 | `GET /auth/login?return_to=`(`modules/auth/routes.ts:35-67`). `/` 하나로 시작하는 값만 받는다 | 계약 §6 후보 (a)와 같다. Context를 싣는 규칙은 #150 |
| 폴링이 세션을 늘리지 않음 | 있음 | 만료는 발급 뒤 12시간 고정이다(`modules/auth/session-service.ts:46-47`). 요청은 `last_seen_at`만 바꾼다 | 유휴 만료가 없다(O21) |
| 세션 부트스트랩 | 모양만 다름 | `GET /me` → `{actor, workspace_id, platform_return_origins}`(`modules/auth/routes.ts:206-233`) | `bootstrap`과 `session-state`를 새로 만든다(4.2) |
| CSRF | 새로 만듦 | 토큰이 없다. JSON Content-Type 강제는 Fastify 기본값(415 → 422)으로 된다 | 세션에 묶인 `csrfToken`과 `X-CSRF-Token` 검사(계약 §6). 적용 범위는 O14 |
| Correlation ID | 새로 만듦 | `requestIdHeader`·`genReqId` 설정이 없다(`server.ts:189-224`). 로그 필드는 `request_id`(FO ADR-0013) | `X-Correlation-Id`를 받아 검사 → 로그 → 응답 헤더 → envelope로 잇는다. Fastify `reqId`와 하나로 맞춘다(O20) |
| `Cache-Control` | 모양만 다름 | 경로마다 `private, no-cache`를 붙이고 `/me`에는 없다 | 플랫폼 경로 전부 `no-store`(onSend 훅) |
| rate limit·429·`Retry-After` | 있음 | Postgres 저장소, Actor 100/분·IP 50/분(`server.ts:309-333`). 묶음 read 300·mutation 10·sensitive 5(`lib/rate-limit-tiers.ts:25-58`) | 플랫폼 경로를 어느 묶음에 넣을지는 O15 |
| `Idempotency-Key` | 있음 | UUIDv4, (actor, key, hash)로 재생하고 24시간 보관한다(`modules/core/idempotency/idempotency-service.ts:120-140`) | `saveAnnotation`·`menuAction`에 그대로 쓴다 |
| 크기 제한 | 모양만 다름 | `bodyLimit` 설정이 없다(Fastify 기본값, 확인 못 함). multipart 25 MiB(`server.ts:259-264`) | `recordUsage` keepalive 64 KB는 그 안에 든다 |
| 보안 헤더 | 있음 | helmet CSP `default-src 'self'`, `frame-ancestors 'none'`(`server.ts:236-251`) | 플랫폼 정적 산출물을 같은 서버로 낼 때 맞는지는 확인 못 함(#151) |
| 사용자·시각은 서버가 찍음 | 있음 | 감사 `actor_id`는 세션 값을 쓴다(`modules/core/audit/audit-service.ts:27-53`). 역할은 요청마다 다시 읽는다(`middleware/require-session.ts:30-35`) | 체크리스트 §5와 같다 |
| 페이지 나누기 | 모양만 다름 | keyset 커서(`lib/list-cursor.ts`). 권한 목록은 페이지 없이 통째로 준다 | `auditTrail`·`accessDirectory`는 offset `page`·`pageSize` + `total`로 답한다 |
| DB 권한 경계 | 새로 만듦 | 앱 role에 `core.audit_log` SELECT가 없다. 읽기는 열을 제한한 SECURITY DEFINER 함수로만 한다(`migrations/0064_canonical_read_boundary.sql:137-218`) | 감사 읽기용 definer 함수와 migration이 필요하다 |

### 4.2 포트 메서드별

| 계약 메서드 | 분류 | FeedbackOps 근거 | 차이·할 일 |
| --- | --- | --- | --- |
| `session()` — `GET .../bootstrap` | 모양만 다름 | `GET /me`. 능력은 하나씩 `/me/permissions/check`로 묻는다(`modules/permissions/routes.ts:81-137`) | `Session.user.permissions` 목록과 `scopes`(site·room)가 없다. 권한 이름 매핑은 O9, `scopes` 원천은 O11 |
| `sessionVersion`·`csrfToken` | 새로 만듦 | 없음 | `Session` 해시. 부여·거부·역할이 바뀌면 해시도 바뀌어야 한다 |
| `publishedMetrics`·`defaultRangeTo`(부트스트랩) | 범위 밖 | 없음 | O4. 부트스트랩 필수 필드라 임시 값이 필요하다(O10) |
| `subscribe` — `GET .../session-state` | 새로 만듦 | 재료 있음: `lookupActorIdByToken`은 세션을 늘리지 않고 조회한다(`modules/auth/session-service.ts:302-318`) | `{sessionVersion, generation?}` 경로 |
| `getEntity` | 모양만 다름 | type별 GET `/vocs/:id`·`/findings/:id`·`/tasks/:id`. 서버가 type → provider 표와 `canRead`를 갖고 있다(`entity-link-providers.ts:9-18`, `modules/entity-links/provider-types.ts:22-48`) | 본문은 `EntityRef`, 응답은 200 envelope다(404·403 대신). 판정 순서 차이는 4.3. 설비·지표 type은 O4 |
| `accessDirectory` | 모양만 다름 | `GET /actors`(게이트 없음, `modules/auth/list-actors-routes.ts:61-95`). `GET /permissions/grants`·`/denies`(admin만, `modules/permissions/grant-admin-service.ts:79-88`) | 행은 사람 × (역할, 유효 권한[], site별 room)이다. filter·sort·page·`total`이 없다. 게이트 차이는 4.3 |
| `auditTrail` | 새로 만듦(저장소는 있음) | 쓰기만 있다(`modules/core/audit/audit-service.ts:37-57`). 스키마는 `db/schema/core.ts:207-226` | `subject_id`가 uuid라 opaque id(설비)를 못 담고 `scope_id` 열도 없다. `event_type`을 `AuditAction` 다섯 값에 매핑해야 한다. 노출 범위는 O16. **구현됨(#621):** SECURITY DEFINER 투영 `core.platform_audit_events`(migration 0074)로 읽고 매핑은 `platform-port/audit-actions.ts`. `subject_id` text 전환·`scope_id`는 구현 안 함(`.planning/backlog.md` 작은 후속) |
| `entityAudit` | 새로 만듦 | 위와 같다. 볼 수 있는지 판정은 provider `canRead`를 다시 쓴다 | type별 조회 게이트 + 대상 감사 행. **구현됨(#621), 쪽 나누기 구현됨(#857, ADR-0085 — 한 쪽 50건, 대상에 묶인 keyset `cursor`, 응답 `nextCursor`, 틀린 커서 `error` `Invalid cursor`, 게이트가 커서보다 먼저):** 허용 type 3종(voc·finding·task) |
| `recordUsage`·`usageSummary` | 새로 만듦 | 없음 | 표, 수신 시각, 거부는 200 + `accepted: 0`, keepalive를 받는 CSRF. `console:access` 원천은 O9. **구현됨(#622):** 자체 스키마 `platform`(migration 0075, `usage_events`)·검증은 mock과 같다 |
| `reportClientError` | 새로 만듦 | 없음 | 식별 필드만 받는 엄격 검증, 200 + `accepted: false`. **구현됨(#622):** `platform.client_errors`(삽입 전용) |
| `listAnnotations`·`saveAnnotation`·`deleteAnnotation` | 새로 만듦 | 없음 | 표, 작성자 판정, site 부여 검사(O11), 삭제 감사 event(ADR-0041). **게이트만 구현(#622):** 항상 `forbidden`, 저장·검증·삭제 감사는 구현 안 함(`.planning/backlog.md` 작은 후속) |
| `validateScope`·`contextOptions`·`evaluateSelection`·`listAxisOptions`·`searchEquipment`·`resolveSelection`·`menuQuery`·`menuAction` | 범위 밖 | 없음. `/me/permissions/scope`는 Managed System 목록이지 site 판정이 아니다 | O4. `menuAction`의 재생 전 권한 확인 순서는 FO ADR-0066과 같다 |
| 체크리스트 §3 기동 시 엔드포인트 등록 검증 | 범위 밖 | 없음 | `menuQuery`와 함께 간다(O4) |
| 체크리스트 §4 적합성 계정 | 모양만 다름 | mock 로그인으로 세션을 바꿀 수 있다(`modules/auth/routes.ts:146-182`). 시드는 Admin·MS별 Developer·User | 권한 하나씩 뺀 계정, site 두 곳 계정, 다른 주석 작성자 계정이 필요하다(O17) |
| 체크리스트 §5 부여·회수 쓰기 없음 | 충돌 | FeedbackOps에는 부여·회수·거부·요청 승인 쓰기가 이미 있다(`modules/permissions/routes.ts:491-660`, FO ADR-0066) | O18 |

### 4.3 권한 판정 차이

| | 플랫폼 계약 | FeedbackOps |
| --- | --- | --- |
| 권한 어휘 | Kernel 고유 권한 `KERNEL_PERMISSIONS` + 앱이 선언한 메뉴 권한, 콜론 표기(`packages/sdk/contracts/src/menu/menu.ts`, ADR-0072) | capability 11개, 점 표기(`packages/shared/src/enums/capabilities.ts:13-25`) |
| 역할 | 서버 데이터, 계약이 고정하지 않음 | `admin`·`developer`·`user`(FO ADR-0048) |
| 데이터 범위 | Scope = site, 그 안의 room_name 부여(ADR-0004·0005) | Managed System(FO ADR-0001). site·room이 없다 |
| 판정 순서 | 권한 → site → 행 조회 → room | workspace → 명시적 거부 → workspace 부여 → 역할 → Managed System 범위 부여 → 요청 가능 여부(`modules/permissions/check-service.ts:119-246`) |
| 결과 전달 | 200 + `forbidden` | 403 `permission.denied` 또는 404 + `requestable_permission` |
| 부여 만료 | 없음 | 만료·철회가 있고 사유를 구분한다 |

- **`accessDirectory`**
  - 플랫폼: `console:access`가 있으면 모든 site를 보고, room 게이트가 없다(`adapter.ts:226-235`).
  - FeedbackOps: `/actors`는 workspace 전원에게 이메일·역할을 준다(FO ADR-0044가 의도로 기록). 부여·거부 목록은 `workspace.admin`만 본다.
  - 차이 1: 플랫폼 행의 유효 권한 목록을 FeedbackOps에서는 계산해야 한다(역할에서 오는 권한 + admin 예외 + 부여 − 거부, `check-service.ts:357-391`).
  - 차이 2: Managed System 범위 부여는 평평한 목록으로도, `sites[].grantedRooms` 자리로도 펼 수 없다.
- **`getEntity`**
  - 플랫폼: type 미등록 → `error`, 권한·site·room이 없으면 `forbidden`, 없으면 `empty`. `scopeId`는 클라이언트가 보내고 서버가 id에서 추론하지 않는다(`adapter.ts:43-47`).
  - FeedbackOps는 type마다 판정이 다르다:
    - VOC: 읽을 수 없으면 있는지조차 숨긴다(`modules/voc/read-service.ts:8-11`).
    - Finding: 행을 먼저 찾고 그 행의 Managed System으로 판정한다. 404와 403의 차이로 행이 있는지 드러난다(`modules/findings/record.ts:65-72`).
    - Task: 행을 찾기 전에 역할부터 요구한다(`modules/tasks/service.ts:376-393`).
  - FeedbackOps 엔티티를 `scopeId: null` type으로 보고 Managed System 판정을 서버 안에서 할지는 O19.
- **감사 게이트**
  - 플랫폼: 전역 조회는 `console:access` + 모든 site(`adapter.ts:209-215`). 단건 조회는 대상 type의 조회 권한 + `getEntity`와 같은 게이트.
  - FeedbackOps: 감사 원본을 일반 읽기로 열지 않는다. DB role에 SELECT가 없고, 목적별 투영 함수만 있다. 개인 설문 응답은 admin도 우회하지 못한다(FO ADR-0033·0066).
  - 차이: `console:access` 하나로 FeedbackOps 감사 행 전체를 보여 주면 FeedbackOps의 개인정보 경계가 넓어진다(O16).
- **`console:access`와 room**
  - FeedbackOps에 `console:access`는 없다. 가장 가까운 것은 `workspace.admin`이다.
  - room 부여에 해당하는 것도 없다. site·room 부여 저장소는 새로 만들어야 하고, 그 소유는 #98이다.
- **역할 원천**
  - FeedbackOps는 역할을 손으로 올리고, IdP 그룹 매핑은 하지 않는다고 정했다(FO ADR-0006).
  - 플랫폼은 IdP 그룹 claim 사양을 기다린다(#98, O2).
  - 두 결정이 부딪힌다. 결정은 #596 질문 2에서 한다.

## 5. 권한·업무 시스템 통합 (Decided, [ADR-0068](../adr/0068-permission-scope-and-business-system-link.md))

- **부여 체계는 FeedbackOps 것 하나다.**
  - Role Level은 유지하고, 플랫폼 권한은 FeedbackOps Capability 어휘로 합친다. `@ap/contracts` `KERNEL_PERMISSIONS`와는 계약 테스트로 묶는다(앱이 선언한 메뉴 권한은 FeedbackOps가 부여하지 않으므로 표에 없다, ADR-0072).
  - 범위는 `scope_kind`(`managed_system | space | site | site_room`)로 표현하고, 구현은 앞의 둘만 한다.
  - 출시 조건: 판정·유효 권한·목록·unique 인덱스를 한 변경으로 고치고, kind별 누출 테스트를 넣는다.
- **Managed System과 업무 시스템:** 레지스트리는 둘이고 연결 표로 잇는다. 키는 `(workspace_id, space_id)`이고, 값은 `managed_system_id`다. 연결은 기본값과 이동에만 쓰이고 권한을 주지 않는다.
- **판정:** FeedbackOps 도메인 판정은 그대로 FeedbackOps 백엔드가 한다. 플랫폼 화면은 권한을 표시만 한다(06 §17).
- **Admin 승인:** workspace 수준을 유지한다. 부여·거부·역할 쓰기는 모두 `sessionVersion`을 바꾼다.

## 6. 단계 (Candidate)

| 단계 | 내용 | 이슈 | 선행 |
| --- | --- | --- | --- |
| 0 | 결정·설계 기록(이 문서, ADR-0066, FO ADR-0072) | — | — |
| 1 | 저장소 합류. 1a는 서브모듈을 디렉터리로 바꾸고 CI를 옮겼다(완료, #612). 1b는 도구 통일(Node 26.7, pnpm 11, lockfile 하나, `@ap/ui` `workspace:*`)로 완료했다([#642](https://github.com/hjung3113/analytics-platform/issues/642)) | [#592](https://github.com/hjung3113/analytics-platform/issues/592) | 0 |
| 2 | 실서버 출발점: §4 공통 부분, 실어댑터 조립 | [#593](https://github.com/hjung3113/analytics-platform/issues/593) | 1 |
| 3 | 전역 기능 화면(§3.1) — 시안 컨펌 먼저 | [#594](https://github.com/hjung3113/analytics-platform/issues/594) | 1, 2 |
| 4 | 피드백 운영 업무 시스템(§3.2) — 시안 컨펌 먼저 | [#595](https://github.com/hjung3113/analytics-platform/issues/595) | 1, 2 |
| — | 권한·업무 시스템 통합 결정(§5) | [#596](https://github.com/hjung3113/analytics-platform/issues/596) | 사용자 답, #98 |
| 5 | 독립 앱 은퇴: 옛 URL 리다이렉트, 링크 계약 정리, FeedbackOps 저장소 보관 | [#597](https://github.com/hjung3113/analytics-platform/issues/597) | 3, 4, #151 |

사내 확인(#150 SSO, #151 배포·인프라)은 단계와 병행한다. 운영 배포의 선행 조건이지만 단계 1–4는 mock 인증과 throwaway DB로 진행한다. 첫 사내 사용은 SSO 답을 기다리지 않고 Keycloak(사내 이메일 도메인 가입·이메일 인증)을 OIDC IdP로 두고 연다. 사내 로그인은 Windows 로그인 정보로 연동된다(사용자 관찰 → Active Directory)라서, 답이 오면 Keycloak을 Entra ID·AD FS로 위임하거나 AD에 LDAP·Kerberos로 연동한다. IdP가 바뀌면 `sub`이 바뀌므로 전환 때 인증된 email로 기존 Actor를 한 번 연결한다 — [#603](https://github.com/hjung3113/analytics-platform/issues/603).

## 7. Open

| ID | 질문 | 영향 |
| --- | --- | --- |
| O2 | 역할 모델 통합과 역할 소속 원천 | #596 질문 2, #98(IdP 그룹 claim, #150) |
| O3 | Managed System ↔ 업무 시스템 관계 | #596 질문 1, 공간 → Managed System 매핑(ADR-0045) |
| O4 | 분석 메뉴 데이터 엔드포인트를 같은 서버에 두나, 사내 별도 서버로 두나 | #593 범위 밖. 데이터 원천은 `context_recognized_parser` 적재 DB |
| O5 | 라우팅 이전: TanStack Router 화면을 Kernel Registry·`PlatformLocation`으로. 잘못된 search 값 처리(FeedbackOps는 버림, 플랫폼은 거부·보존) | #594·#595 — **Decided: [ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md)** 결정 1·9(#594 범위; #595는 같은 규칙) |
| O6 | FeedbackOps git 이력 보존 방식(subtree 병합 권장) | #592 |
| O7 | 업무 시스템 이름(`피드백 운영` Candidate) | #595 시안 — **Decided: [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md)** 결정 1(`FeedbackOps`, 부제 `피드백 운영`) |
| O8 | 린터(Biome·ESLint)·테스트 설정·비주얼 하니스(darwin 전용)·백엔드 통합 테스트 DB를 이 저장소 CI에 넣는 방식 | #592 |
| O9 | 권한 이름 매핑: FeedbackOps capability(점 표기, Managed System 범위)를 `Session.user.permissions`·`AccessPrincipal.permissions`에 어떻게 싣나. `console:access`의 원천(`workspace.admin` 또는 새 capability) | #596 질문 2, 06 §17 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 7** |
| O10 | 분석 데이터 서버가 없는 동안(O4) 부트스트랩 필수 필드 `publishedMetrics`·`defaultRangeTo`를 무엇으로 채우나(빈 배열·서버 시계) | #593 임시 결정, [HTTP 어댑터 계약](http-adapter-contract.md) §3 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 8** |
| O11 | `Session.scopes`와 site·room 부여를 어디에 저장하나(FeedbackOps DB의 새 표 또는 별도 meta DB). Scope(site)와 Managed System이라는 두 범위 용어 | #596 질문 1(O3), #98, O4 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 8(임시)** |
| O12 | 한 서버의 두 오류 규약: 플랫폼 경로는 200 envelope, FeedbackOps 경로는 FO ADR-0012. 오류 처리기를 경로별로 나눌지. 413을 422로 바꾸는 동작. 전송 계약의 FastAPI 문구를 Fastify 기준으로 고치기 | #593, HTTP 어댑터 계약 §2 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 2(일부)** |
| O13 | FeedbackOps API를 `/api/v1/feedbackops/...`로 옮길지(화면 경로 `/vocs` 등과의 충돌 제거) | #593, #597(옛 URL) — **Decided: [ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md)** 결정 3(ADR-0069 결정 3 갱신) |
| O14 | CSRF 토큰을 플랫폼 경로에만 걸지, FeedbackOps 변경 경로 전체에 걸지. 같은 출처가 되면 SameSite만으로 충분한지 | #593, #150, HTTP 어댑터 계약 §10 Q8 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 4** |
| O15 | rate limit: 5분 폴링·위젯 여럿·`recordUsage`가 Actor 100/분, read 300/분 안에 드는지, 플랫폼 경로 묶음을 새로 둘지 | #593 측정 |
| O16 | 감사 읽기 노출 범위: FeedbackOps event → `AuditAction` 매핑, `console:access`가 볼 detail의 범위(사유·설문·이메일), `subject_id` text 전환·`scope_id` 추가 migration | #593 + FeedbackOps 개인정보 규칙(FO ADR-0033·0066), 사용자 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 6** — 구현 #621(`subject_id` text·`scope_id`는 `.planning/backlog.md`에 구현 안 함으로 기록) |
| O17 | 적합성 묶음 시드 계정(권한 하나씩 뺀 계정, site 두 곳 계정, 다른 주석 작성자)을 mock 로그인 시드로 만들지 | #593 |
| O18 | 체크리스트 §5 "#98 전에는 부여·회수 쓰기 없음"과 이미 구현된 FeedbackOps 부여·승인 쓰기(FO ADR-0066)의 충돌. 체크리스트를 고칠지, 쓰기를 FeedbackOps 범위로 한정할지 | #596 |
| O19 | FeedbackOps 엔티티의 `EntityRef.scopeId`(`null` + 서버 안 Managed System 판정). 행이 있는지 드러나는 방식(Finding 404/403 대 플랫폼 `empty`/`forbidden`)을 맞출지 | 06 §22 소유자(사용자), #596 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 9, 구현 #623** |
| O20 | Correlation ID 헤더 이름과 Fastify `reqId`·로그 필드 `request_id`를 하나로 맞출지 | #151(사내 표준), #593 — **Decided: [ADR-0069](../adr/0069-platform-port-in-feedbackops-backend.md) 결정 5** |
| O21 | 세션 만료: 지금은 12시간 고정이고 유휴 만료가 없다. #150 정책이 sliding이면 폴링을 활동에서 빼는 처리가 필요하다 | #150 |

## 8. 전환 기간

- 독립 FeedbackOps(v1.3.0)에는 실제 사내 사용자가 없다(사용자 2026-10-21). 사내 사용은 플랫폼으로 시작하므로 병행 운영 기간을 두지 않고, 단계 5는 플랫폼 첫 배포와 함께 한다.

- 독립 FeedbackOps는 유지 보수만 한다: 버그 수정과 합류 준비. 새 기능은 플랫폼 쪽에서 만든다(FO ADR-0072).
- 독립 앱 안에서만 의미가 있는 개선(신고자에게 운영 메뉴 숨기기, 신고자 홈)은 하지 않는다. 신고자는 플랫폼 전역 기능만 쓰게 되므로 문제가 구조상 사라진다. 독립 앱에 실제 신고자가 생기면 다시 연다.
- 단계 4가 끝날 때까지 진입 링크(ADR-0045)와 복귀 키(`platformReturn`, FO ADR-0071)를 그대로 쓴다.
