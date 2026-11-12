# Site·room 부여는 플랫폼 부여 표가 소유하고, 막힌 자리에서 바로 신청한다

상태: **Decided (2026-11-12)** — 결정 1·6은 소유자 지시, 질문 1–4와 공통 보안 규칙(결정 1의 원천 하나, 결정 4의 토큰 범위)은 고문 결정(소유자 위임)이다.
- 결정자: 사용자(소유자) — 2026-11-12 [#1844](https://github.com/hjung3113/analytics-platform/issues/1844) «어느 site room을 볼 수 있는지는 플랫폼에서 운영자가 정하게 하자 / 권한 신청하게 하던지»와 같은 날 추가 «필요한 사용자가 필요한 시스템이나 site·room 권한을 신청하게, 자연스럽게 UX 되는지 확인». 이 지시가 직접 덮는 것: [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md) 결정 1·2의 대체(그 ADR이 기각한 안 B를 채택), 06 계약 kernel §6.2에 «막힌 자리의 신청 진입» 추가.
- 질문 1–4: 고문(소유자 위임, 2026-11-12, 팀장 전달) — 1·2·4 수락(조건 포함), 3 변경(`scopes` 뜻 유지, 신청 가능 site는 별도 필드). 같은 검토가 원천 하나 규칙과 토큰 범위 규칙을 더했다.
- Scope: [#1844](https://github.com/hjung3113/analytics-platform/issues/1844). 관련: [ADR-0068](0068-permission-scope-and-business-system-link.md) 결정 2, [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md), [ADR-0148](0148-minimal-forwarder-and-identity-token.md) 결정 4, [ADR-0153](0153-upstream-target-routing-and-declared-connectors.md) 결정 9, [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md), [#1839](https://github.com/hjung3113/analytics-platform/issues/1839) 고문 리뷰 B1.
- Supersedes: [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md) 결정 1·2(원천 = 사내가 주입하는 resolver, 구현 모양 = 사내 부여 서비스 호출). 결정 3·4·5(resolver 없으면 `requiresScope` 등록 거부, 요청마다 닫힌 쪽으로 판정, 단위는 site·room)는 유지한다.
- Amends: [ADR-0068](0068-permission-scope-and-business-system-link.md) 결정 2 — 범위 종류 `site`·`site_room`을 구현한다(그 ADR의 출시 조건 그대로). `space`는 예약으로 남기고 만들지 않는다. [ADR-0147](0147-scope-grants-come-from-an-injected-resolver.md) 결정 4 둘째 문장과 [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) «Scope 집행» 행 — `validateScope`의 site·room 목록은 `analytics.v_sites_v1`이 아니라 Scope 카탈로그(결정 3)에서 온다.

## 맥락

- ADR-0147은 부여 원천을 사내가 주입하는 resolver로 두었고, 운영 resolver는 사내 부여 서비스(`POST {base}/scopes/resolve`)를 부르는 `createHttpScopeResolver` 하나뿐이다. 소유자는 사내에 새 서버를 두지 않기로 했다(#1839, ADR-0153). 그 계약을 말하는 사내 시스템은 없다.
- 세션 스냅샷은 `scopes: []`이고(`platform-port/session-snapshot.ts`), `validateScope`가 부르는 `GET /api/v1/platform/scopes/{id}/check` 라우트가 없다. Kernel은 Scope가 `valid`가 되기 전에는 Scope가 필요한 조회를 보내지 않으므로(kernel §6.2), 서버가 부여를 알아도 화면은 그 조회를 보내지 않는다.
- 부여 체계는 이미 있다: `permission.permission_grants`·`permission_requests`, 공유 grant command(승인과 직접 부여), 만료·회수·재발급, `sessionVersion` 증가. ADR-0068은 `site`·`site_room`이 별도 저장소 없이 이 체계에 들어온다고 정했다. 지금 판정은 `managed_system_id IS NULL`을 workspace 전체로 읽으므로, 범위 열만 더하면 site 부여가 workspace 전체 부여로 판정된다.
- 권한이 없을 때 사용자가 갈 길: capability는 `RequestAccessButton`(feature 화면)과 내 활동 `/permission-requests`가 있다. 셸의 Scope 선택기·Scope `forbidden` 상태·room 필드에는 신청 진입이 없다.

## 결정

### 1. 원천은 플랫폼 부여 표다 (ADR-0147 결정 1·2 대체)

- site·room 부여는 `permission.permission_grants`에 행으로 둔다. 운영자가 직접 부여하거나, 사용자가 신청하고 운영자(`workspace.admin`)가 승인한다. 승인과 직접 부여는 지금의 공유 grant command를 쓴다.
- 사내에 부여 서비스를 두지 않는다. `createHttpScopeResolver`는 선택지로 남는다.
- **원천은 정확히 하나다.** Scope 카탈로그(결정 3)가 있으면 부여 표가 원천이다. `scopeCatalog`와 `MENU_SCOPE_GRANT_SERVICE_URL`이 함께 있으면 기동 실패다. 이유: 둘이 겹치면 운영자가 콘솔에서 회수해도 다른 원천이 판정해 접근이 남고, 승인받은 사용자는 계속 막힌다.
- 부여 표가 원천이 아닌 배포(HTTP 부여 서비스)에서는 `scope.read`의 신청·부여 쓰기가 `validation.failed`이고, 세션의 신청 가능 site 필드(결정 5)를 내지 않으며, 앱은 site·room 신청 진입을 주입하지 않는다.
- 세션 `scopes`·`validateScope`·조회 판정·상류 토큰의 `scopes` claim은 언제나 같은 원천 하나에서 답한다.

### 2. 부여 행의 모양 (ADR-0068 결정 2의 출시 조건)

- 새 capability `scope.read`(site·room 데이터 읽기)를 둔다. 메뉴 권한이 아니라 Scope 부여의 운반체다. `sensitive: false`, `adminModuleBypass: 'none'`, 모든 Role Level이 받을 수 있다.
- `permission_grants`에 범위 구분자 `scope_kind`(`managed_system` | `site` | `site_room`)와 열 `scope_site`·`scope_room`을, `permission_requests`에 `requested_scope_kind`·`requested_scope_site`·`requested_scope_room`을 더하고 kind별 CHECK를 건다. `managed_system`은 지금 판정 체계의 모든 행(workspace 전체·Managed System·object 범위)이고 기존 행은 모두 이 종류다:
  - `managed_system`: `scope_site`·`scope_room`이 NULL(지금 행 그대로).
  - `site`: `capability = 'scope.read'`, `managed_system_id`·`scope_room` NULL, `scope_site` NOT NULL.
  - `site_room`: `capability = 'scope.read'`, `managed_system_id` NULL, `scope_site`·`scope_room` NOT NULL.
  - `scope.read`는 `managed_system` kind로 둘 수 없다.
- 판정·유효 권한 계산·부여 목록·활성 unique 인덱스를 한 변경으로 고친다. 지금 grant를 읽는 모든 판정(check-service, 플랫폼 권한 resolver, scope-service, recovery·selected read)은 `scope_kind = 'managed_system'`만 읽는다. 활성 unique 인덱스는 지금 열(`workspace_id`, `actor_id`, `capability`, `managed_system_id`·`object_type`·`object_id`의 COALESCE, 마이그레이션 0063)에 `scope_kind`와 `scope_site`·`scope_room`의 COALESCE를 더한 것이다.
- **누출 시험(kind마다, 경로 수준):** `site` 부여가 workspace 전체 capability로 판정되지 않음, `site_room` 부여가 다른 room·다른 site로 넓어지지 않음, `managed_system` 부여가 site·room 부여로 읽히지 않음, 만료·회수·대체된 행은 다음 요청부터 빠짐.
- 명시 거부(deny)는 site·room에 두지 않는다(Deferred). 회수가 그 일을 한다.
- `scope.read`의 신청·결정·부여·회수 기록은 다른 비민감 capability처럼 플랫폼 감사 투영에 들어간다(투영 허용 목록에 더한다).
- Admin도 부여가 있어야 본다. Scope에는 무조건 우회가 없다: 부여 표 resolver는 Role Level을 보지 않는다. 이 규칙은 «기본은 못 보고, 볼 때는 감사 기록이 남는다»이지 Admin을 막는 경계가 아니다: workspace 설정 `permission_self_approval`이 기본값 `allowed`이면 Admin은 직접 부여로 자기에게 줄 수 있고 `self_grant` 감사가 남는다. `forbidden`이면 다른 Admin이 줘야 한다.

### 3. 부여할 수 있는 값(Scope 카탈로그)은 배포 설정이 낸다

- Scope 카탈로그 = `{ site, label, rooms: [room_name, …] }`의 목록. 배포 설정 묶음([ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md), `MENU_DECLARATIONS_FILE`)의 선택 필드 `scopeCatalog`에 둔다. 기동 때 읽고 검증한다(빈 site·room 값, 중복, 한 site 안의 중복 room은 기동 실패).
- Scope 카탈로그에 없는 값은 부여·신청할 수 없다(쓰기에서 `validation.failed`). 승인도 그 순간의 카탈로그로 다시 판정한다(신청과 승인 사이에 재기동으로 카탈로그가 바뀔 수 있다).
- 이미 있는 부여가 Scope 카탈로그에서 빠진 값을 가리키면 판정에서 버린다(닫힌 쪽). 그 행은 활성으로 남아, 같은 이름이 다시 들어오면 접근이 되살아난다. 그래서 운영 콘솔의 부여 목록은 그런 행을 «카탈로그에 없음»으로 표시해 보여 주고 회수할 수 있게 하며, 기동 때 카탈로그 밖을 가리키는 활성 부여의 수를 경고 로그로 남긴다(기동 실패는 아니다). 값을 빼거나 이름을 바꿀 때는 그 값의 부여를 먼저 회수한다(`in-house-rollout.md`).
- Scope 카탈로그는 배포 하나에 하나이고 그 배포의 모든 workspace가 같은 카탈로그를 쓴다(부여 행은 `workspace_id`별).
- ADR-0153의 라우팅이 들어오면, 라우팅에 적힌 site·room이 Scope 카탈로그 안인지 기동에서 확인한다(그 레인의 노드 몫).
- Scope 카탈로그를 바꾸려면 배포 설정을 바꾸고 다시 기동한다. 부여·회수는 재기동 없이 다음 요청부터다.
- Scope 카탈로그가 없으면 지금과 같다: 세션 `scopes: []`, `validateScope`는 `unknown_scope`, `requiresScope` 엔드포인트 등록 거부.

### 4. resolver와 판정

- `createGrantTableScopeResolver({ db, catalog })`가 `ScopeResolver`를 구현한다. 요청마다 DB를 읽고 캐시하지 않는다. 활성(`revoked_at`·`superseded_at` NULL, `expires_at`이 없거나 미래) `scope.read` 행만 읽는다. `site` 부여는 그 순간의 Scope 카탈로그 room 전체로 펼친다. Scope 카탈로그 밖 값은 버린다. DB 오류는 거부로 실패한다(`resolveRequestScopes`가 `forbidden`으로 바꾼다).
- `buildServer`는 Scope 카탈로그가 있으면 이 resolver를 주입한다(결정 1의 원천 하나). ADR-0147 결정 3(resolver 없으면 등록 거부)은 그대로다.
- **토큰 범위:** API 토큰 호출에서 부여 표 resolver는 토큰 범위에 `scope.read`가 없으면 빈 집합을 낸다(capability 판정의 토큰 거부와 같은 판정, [ADR-0116](0116-platform-api-tokens-personal-and-service.md) «토큰의 실효 권한 = 소유자의 현재 부여 ∩ 토큰 범위»). `scope.read`는 세션 전용이 아니며 토큰 범위에 실을 수 있다. `scope.read`를 실은 토큰은 소유자의 site·room 전체를 받는다(site별 토큰 범위는 Deferred).
- 상류 토큰의 `scopes` claim(ADR-0148 결정 4, ADR-0153 결정 3.6)은 이 resolver의 결과를 싣는다. 원천만 바뀐다.

### 5. 세션 scopes와 validateScope (질문 3 변경)

- 세션 `scopes`의 뜻은 그대로다: room 부여가 하나 이상 있는 site만 `{ id: site, label, grantedRooms, totalRooms }`로 낸다(`ScopeOption` 계약, 서버 적합성 검사 «a site with no grant is not an option»). 부여가 site 전체보다 적은 site는 `grantedRooms < totalRooms`로 드러난다.
- 신청할 수 있는 site(Scope 카탈로그에 있고 부여가 없는 site)는 세션의 **별도 선택 필드**로 낸다(이름은 구현 노드, 예: `requestableScopes?: readonly { id, label, totalRooms }[]`). 부여 표가 원천일 때만 낸다. 세션에 두면 `sessionVersion`으로 같이 갱신되어, 승인되면 그 site가 폴링 한 번에 이 필드에서 `scopes`로 옮겨 간다. 이 필드를 내는 서버는 그 목록에 부여가 있는 site를 넣지 않는다(적합성 검사에 한 줄 더함). 셸은 신청 포트가 주입됐을 때만 이 필드를 «신청할 수 있는 site»로 그린다.
- 부여받지 않은 room의 이름은 세션·`ScopeCheck`에 싣지 않고, 신청 화면이 부르는 신청 후보 조회로만 낸다(인증된 workspace 구성원만).
- 노출 판단: Scope 카탈로그의 site 이름·`totalRooms`·room 이름은 인증된 workspace 구성원 모두에게 보이는 조직 값으로 본다. 막힌 자리에서 신청하려면 대상의 이름이 보여야 한다. 데이터 행·설비·부여 현황(누가 무엇을 받았는지)은 여기에 들지 않는다.
- `GET /api/v1/platform/scopes/{id}/check` → `ScopeCheck`(계약 무변경). Scope 카탈로그에 없는 id는 `unknown_scope`, 부여 room이 없으면 `forbidden`(`grantedRooms: []`), 있으면 `valid`와 부여 room 목록이다. 요청마다 같은 resolver로 답한다.
- 부여·회수·승인은 이미 `sessionVersion`을 바꾼다. 세션 폴링이 바뀐 세션을 받으면 Kernel은 Scope를 다시 확인한다(`validatedFor`). 그래서 승인 뒤 새로고침 없이 반영된다. 이 동작을 구현 노드의 시험으로 고정한다.

### 6. 막힌 자리에서 바로 신청한다 (소유자 추가 2026-11-12)

- **막힌 자리:** (a) 메뉴·공간 권한이 없어 열지 못한 화면(capability), (b) Scope 선택기에서 `grantedRooms`가 0이거나 전체보다 적은 site, (c) Scope 확인 `forbidden`, (d) room 필드에서 부여되지 않은 room, (e) Scope가 필요한 조회의 `forbidden` outcome.
- 각 자리는 대상(capability / site / site·room)이 미리 채워진 신청으로 이어진다. 기본 대상은 막힌 자리의 것이다: (d)는 그 room, (b)·(c)는 site만 미리 채우고 범위 종류(site 전체 / site·room)는 사용자가 고른다. «site 전체»를 고르는 자리(신청·직접 부여)는 이후 추가되는 room도 포함한다는 뜻을 문구에 담는다(예: «site 전체 — 이후 추가되는 room 포함», 최종 문구는 시안). 신청 화면은 내 활동 `/permission-requests`를 넓혀 쓴다. 그 화면에서 신청 상태(대기·승인·거절)를 보고, 승인되면 원래 자리로 돌아간다(`safeReturnTo`).
- SDK는 이를 앱이 주입하는 선택 포트로 받는다. 셸은 신청 화면을 모른다. 대상 형식(`PermissionRequestTarget`)은 `@ap/contracts`에 두고, 포트가 없으면 지금 화면 그대로다(기존 메뉴 무변경).
- 운영자는 기존 권한 요청 검토 화면에서 site·room 신청을 승인·거절하고, 기존 직접 부여 폼에서 범위 종류(시스템 / site 전체(이후 추가 room 포함) / site·room, 최종 문구는 시안)를 골라 Scope 카탈로그 값으로 부여한다. 새 화면은 만들지 않는다.
- 진입의 모양(링크로 신청 화면에 가는지, 그 자리의 대화상자인지)과 새 URL 키는 루트 AGENTS §UI 시험 B(링크 가능한 상태)에 걸리므로 `?variant=` 시안을 만들고 소유자 확인을 받은 뒤 구현한다. **결정: 다섯 자리 (a)–(e) 모두 그 자리에서 같은 «권한 요청» 대화상자를 연다(inline).** 링크 진입은 버렸다: 새 URL 키(요청 대상·대화상자 열림)가 필요하고, 신청 화면에는 대화상자가 없으며, (d)의 적용 전 조회 조건 초안을 잃는다. 결정자: 고문(소유자 위임, 2026-11-13, #1844 댓글). 소유자가 말하면 뒤집는다. 조건 세 가지:
  - 대기 상태는 서버의 «내 권한 요청»에서 읽고 자리 단위로 맞춘다. Site 자리 (b)·(c)는 그 Site의 대기 요청(Site 전체든 공정이든), 공정 자리 (d)·(e)는 그 공정 또는 그 Site 전체의 대기 요청이 있으면 대기로 보인다. 새로고침·뒤로 가기 뒤에도 같다.
  - 제출 뒤에는 기존 대화상자의 «권한 요청 완료» 단계(요청 ID, 상태, `확인`)를 그대로 쓴다.
  - 요청자 화면·검토 콘솔·부여 목록은 새로 그리지 않고 실제 화면(인라인 신청 폼과 행 목록, `ListTabs`·`ObjectRow`, `권한 부여` 폼)을 넓힌다. 머리 버튼 «직접 부여»는 두지 않는다.
- 화면 문구는 GLOSSARY대로 room을 «공정»으로 쓴다: «Site 전체 (이후 추가되는 공정 포함)», «Site·공정».
- 첫 배포 순서: Scope 카탈로그를 넣고 기동한 뒤 Admin이 첫 부여를 한다. `permission_self_approval: forbidden`이면 Admin이 둘 이상 있어야 누구든 첫 Scope를 받는다(`in-house-rollout.md`).
- kernel §6.2: «site 부여는 그 site의 Scope 카탈로그 room 전체(이후 추가 room 포함)를 준다(Decided, ADR-0154)»를 더하고, 나머지 상속 규칙(room → StGroup → Equipment, 조회 필터 자동 포함)은 Open으로 둔다(1844d).
- review-ux 한 번으로 전체 흐름(사용자 신청 → 운영자 승인 → 사용자 조회 성공)을 1440×900 캡처로 확인한다.

## Considered Options

- **(A, 채택) 플랫폼 부여 표 + 배포 설정 Scope 카탈로그.** 사내 준비물에 부여 서비스가 없다. 부여 체계·감사·만료·회수를 그대로 쓴다.
- **(B) 사내가 주입하는 resolver(ADR-0147).** 사내에 새 서비스가 필요하다. 소유자가 기각했다(#1839). 선택지로만 남긴다.
- **(C) 별도 `scope_grants` 표.** ADR-0068 결정 2가 «별도 저장소를 만들지 않는다»고 정했다. 신청·승인·감사를 두 번 만든다.
- **Scope 카탈로그 (D) DB 표 + 운영 콘솔 편집.** 재기동 없이 바꿀 수 있지만 새 화면(시안)이 필요하고, site·room 표기는 배포마다 다른 사내 값이라 ADR-0146의 배포 설정에 둔다. Deferred.
- **Scope 카탈로그 (E) ADR-0153 라우팅에서 유도.** 라우팅은 room을 적지 않는 경로를 허용해(site 하나 = 대상 하나) `totalRooms`를 알 수 없다.

## Deferred (구현 안 함)

- site·room 명시 거부(deny). 이유: 회수로 충분하고, 거부 표에 범위 종류를 더하는 일은 판정 경로를 하나 더 바꾼다. 다시 여는 조건: 회수 뒤에도 재신청을 막아야 하는 운영 요구.
- Scope 카탈로그의 DB 표·콘솔 편집(D). 다시 여는 조건: 재기동 없이 site·room을 바꿔야 하는 운영 요구, 또는 workspace마다 다른 카탈로그가 필요한 배포.
- site 존재 자체의 비공개(카탈로그 항목별 비공개 표시). 이유: 지금 구성원에게 숨겨야 하는 site가 없다. 다시 여는 조건: 그런 site가 있는 배포.
- site별 토큰 범위(토큰이 일부 site·room만 받게). 이유: 그런 토큰 소비자가 없다. 다시 여는 조건: site를 좁힌 토큰 요구.
- Line 부여 축(ADR-0147 Deferred 그대로).

## 질문 (#1844 설계) — 닫힘

1. Scope 카탈로그 = 배포 설정 `scopeCatalog`: 수락. 조건은 결정 3(카탈로그 밖 부여의 콘솔 표시·기동 경고, 승인 시점 재확인).
2. site 부여 = 판정 시점의 카탈로그 room 전체(이후 추가 room 포함): 수락. 조건은 결정 6(문구, 기본 대상)과 kernel §6.2 Decided 한 줄.
3. 부여 없는 site를 `scopes`에: 변경 — 결정 5(별도 선택 필드, room 이름은 신청 후보 조회).
4. Admin도 부여 필요: 수락. 조건은 결정 2(자기 부여와 감사)와 결정 6(첫 배포 순서).

## 결과

- 노드(각각 따로 병합):
  - 1844a: 이 ADR, ADR-0147 상태, `docs/adr/README.md`.
  - 1844b: 스키마·마이그레이션, `scope.read`, 판정 필터, kind별 누출 시험, Scope 카탈로그 로더, 부여 표 resolver(토큰 범위 판정 포함). 누출 시험에 더함: site 부여만 회수하면 room 부여 몫만 남음, 카탈로그에 room을 더하면 site 부여 사용자에게만 열림, 부여 없는 Admin은 빈 집합, `scope.read` 범위 없는 토큰은 빈 집합.
  - 1844c: 신청·승인·직접 부여 API의 범위 종류.
  - 1844d: `buildServer` 주입, 원천 겹침 기동 실패, 카탈로그 밖 부여 기동 경고, 세션 `scopes`·신청 가능 site 필드, `validateScope` 라우트, 적합성 검사 한 줄. 문서: kernel §6.2, `real-server-checklist.md` «Scope 부여 서비스 계약», `in-house-rollout.md`.
  - 1844e: 신청 진입 시안 → 소유자 확인.
  - 1844f: SDK 신청 포트와 셸 진입, 내 활동 신청 화면, 콘솔 폼. 실서버 확인 한 번, review-ux 한 번.
- #1729 h·#1839와 함께 쓸 때 사내 준비물은 계정·주소·설정 묶음(Scope 카탈로그 포함)뿐이다.
- 시험·예시·픽스처의 site·room 값은 합성 이름만 쓴다([ADR-0151](0151-public-domain-vocabulary-is-frozen-by-an-allowlist.md)). GLOSSARY 항목(`scope.read`, Scope 카탈로그, 막힌 자리)은 1844d에서 더한다.
