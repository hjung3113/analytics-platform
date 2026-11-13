# Platform port (`/api/v1/platform`)

This file owns what the core server implements of the platform port: routes, supported types, gates and exclusions. Method meaning is [`real-server-checklist.md`](../../../integration/real-server-checklist.md) §2. The wire format is [`http-adapter-contract.md`](../../../integration/http-adapter-contract.md).

`getEntity` and `entityAudit` answer the types in `ENTITY_READABLE_TYPES` (`apps/platform-api/src/modules/platform-port/audit-query.ts`): `voc`, `finding`, `task`.

Implemented (#620): `GET /bootstrap` (session, permissions from the platform vocabulary table, `defaultRangeTo`, `sessionVersion`, `csrfToken`) and `GET /session-state` (`sessionVersion` only; does not touch `last_seen_at`). Server-wide: `X-Correlation-Id` is adopted when it matches `^[A-Za-z0-9._-]{1,128}$`, otherwise generated as `srv-<epoch-ms>-<random>`, echoed on every response and logged as `request_id`. `requireCsrf` (exported from the module) checks `X-CSRF-Token` against `core.sessions.csrf_token` and replies `403 { code: 'csrf.invalid' }`; the write routes below apply it.

Implemented (#1844d, ADR-0154): `GET /scopes/:scopeId/check` authenticates the session and returns plain `ScopeCheck` JSON with no-store. A catalog-unknown id (or absent catalog) is `unknown_scope` with `grantedRooms: []`; a known site without a grant or a resolver failure is `forbidden` with `[]`; otherwise it is `valid` with granted rooms in catalog order. Bootstrap and session-state use the same uncached resolver as dispatch. Catalog deployments expose granted sites in session `scopes` and ungranted sites in optional `requestableScopes`; resolver failure empties `scopes` and omits that optional field. The default deployment without a catalog keeps `scopes: []`.

Implemented (#621): `POST /audit-trail/search` (`AuditTrailQuery` → `ApiResponse<AuditTrailPage>`, gate `console:access`) and `POST /entity/audit` (`EntityRef` + optional `cursor` → `ApiResponse<{ events, nextCursor }>`, pages of 50 ordered `at` desc then `id` asc, `nextCursor` null on the last page, a cursor bound to the ref and read only after the gate (a bad or foreign one is `error` `Invalid cursor`), gate = the same entity read gate as `getEntity`). Read POSTs: no CSRF, every judged result (`forbidden`, `empty`, malformed body → `error`) is HTTP 200 + envelope, no session is 401. Reads go only through `core.platform_audit_events` (platform ADR-0069 decision 6; `core/AGENTS.md`); `AuditEvent` carries no `reason`; only API-token issue/revoke events with recorded, nonempty scopes carry `changes.scopes` as `[null, scopes]` / `[scopes, null]` (capability names joined by `, `; ADR-0069 amendment #1690). The envelope builder is `platform-port/envelope.ts`.

Implemented (#623): `POST /entity` (`EntityRef` → `ApiResponse<entity>`) and `POST /access-directory/search` (`AccessDirectoryQuery` → `ApiResponse<AccessDirectoryPage>`, gate `console:access`, internal members only). `sites` (#2015): with a Scope catalog, one `SiteGrant` per catalog site in catalog order, zero-grant sites included, from the members' active `scope.read` site/room grants (not revoked, superseded or expired; one query for all members), decided by the grant-table resolver's rule (values outside the catalog are dropped); `grantCount` sorts by granted room count. Without a catalog — the default deployment, and the HTTP grant-service deployment (`MENU_SCOPE_GRANT_SERVICE_URL`, which cannot have a catalog) — `sites: []`. The entity gate (`platform-port/entity-read.ts`) is the owning module's detail read — `resolveVocReference`, `getFinding`, `getTask` — shared by `getEntity` and `entityAudit`; a non-uuid, missing or unreadable id is one `forbidden` "Not readable" with `data: null`; `scopeId` set or any other type is `error`. `getEntity` returns identifiers, title and status fields only (voc: `displayId`, `title`, `status`; finding adds `severity`, `managedSystemId`; task adds `priority`, `managedSystemId`, `dueDate`). `empty` is unreachable for `getEntity`.

Implemented (#622): `POST /usage-events` (`{ events }` → `{ accepted: n }`), `GET /usage-summary` and `POST /client-errors` (→ `{ accepted: boolean }`), plus the annotation gate. The two fire-and-forget POSTs run `requireCsrf` before the handler (missing or wrong token, or a dead cookie → `403 csrf.invalid`; no cookie → 401); any signed-in session may record. Every judged rejection is HTTP 200 with `accepted: 0` / `false` and nothing stored: validation mirrors the reference server (exact key set, 20-event batch cap, closed `UsageVia` and `SpaceId`, `via`/`fromMenuId` on an entry only (main: the old `via` values; board: `paneOpen`/`paneReplace`, each key optional), identifier-shaped ids, no URL/query/message), and a malformed JSON body is the same answer. Only the global 100/min/actor rate limit applies (no per-route tier). `usageSummary` needs `console:access` before it reads the query, counts `entry` events only per menu from the server's `received_at` (never the client `at`), and answers `ok` with `menus: []` for zero rows. Both writes use the module's own tables (`platform.usage_events`, `platform.client_errors`, migration 0075; see `apps/platform-api/docs/04-database-and-migrations.md`). `GET /annotations`, `POST /annotations` and `POST /annotations/delete` authenticate and then answer `forbidden` "No permission analytics:view" (the permission is never granted, platform ADR-0069 decision 7); there is no annotation storage, validation, site check, author-only delete or delete audit (`.planning/backlog.md`).

`platform.client_errors` is insert-only and has no read API.

## Method support

Which of the 30 `PlatformAdapter` methods this server answers. `implemented`: served and judged by the conformance run. `partial`: the route exists but answers only part of the declared contract (`menuQuery` answers the Scope-less endpoints the modules register, `menuAction` the writes they register; a Scope-requiring endpoint requires a configured Scope resolver at registration). `gate-only`: the route exists and answers `forbidden` to everyone, so the kit counts it as not implemented. `none`: no server handler. This table is checked against the constants `IMPLEMENTED`, `SERVED_PARTIAL` and `GATE_ONLY` of `apps/platform-api/src/modules/platform-port/__tests__/platform-conformance.integration.test.ts`; a method that changes status fails that test until the row changes with it.

| Method | Support |
| --- | --- |
| `session` | implemented |
| `publishedMetrics` | implemented |
| `defaultRangeTo` | implemented |
| `subscribe` | implemented |
| `validateScope` | implemented |
| `contextOptions` | none |
| `evaluateSelection` | none |
| `listAxisOptions` | none |
| `searchEquipment` | none |
| `resolveSelection` | none |
| `getEntity` | implemented |
| `menuQuery` | partial |
| `menuAction` | partial |
| `recordUsage` | implemented |
| `reportClientError` | implemented |
| `usageSummary` | implemented |
| `usageNextScreens` | implemented |
| `auditTrail` | implemented |
| `entityAudit` | implemented |
| `accessDirectory` | implemented |
| `listAnnotations` | gate-only |
| `saveAnnotation` | gate-only |
| `deleteAnnotation` | gate-only |
| `readPreferences` | implemented |
| `patchPreferences` | implemented |
| `importPreferences` | implemented |
| `lookupPeople` | implemented |
| `listNotices` | implemented |
| `saveNotice` | implemented |
| `deleteNotice` | implemented |
| `uploadFile` | implemented |

## 파일 올리기

`POST /api/v1/platform/files`(#1741, [ADR-0140](../../../adr/0140-generic-file-upload-port.md)): multipart 본문의 `file` 부분 하나, `Idempotency-Key` 헤더(UUIDv4), `X-CSRF-Token`. 쿠키 세션과 `platform:view`가 필요하다(`every-session`). Bearer API 토큰은 받지 않는다: 이 라우트는 토큰 호출을 허용하지 않아 토큰으로 부르면 `permission.session_required`로 거절된다. 세션·CSRF·권한·키·미디어 타입 판정은 본문을 읽기 전(`preParsing`)에 끝나고, `Idempotency-Key`는 소문자로 바꾼 한 철자로 잠그고 기록한다. 같은 키로 같은 이름·형식·크기의 다른 내용을 보내면 내용 SHA-256이 달라 `conflict`다. 저장은 첨부 모듈의 `uploadAttachmentCommand`를 그대로 부른다 — [Attachments](attachments.md)의 저장소 경계, 멱등 틀, 파일 이름이 없는 `attachment_uploaded` 감사, 24시간 정리, 연결 안 된 행은 올린 사람만 내려받기가 같다. 한도는 요청당 32 MiB(`POST /attachments`는 25 MiB 그대로)이고 `file` 부분 하나만 받으며(다른 이름의 파일은 `required`, 두 번째 파일은 `too_many_parts`) 텍스트 필드는 작은 수만 허용한다. 운영 엣지(nginx)는 이 경로만 34m까지 통과시킨다. 허용 MIME은 첨부 모듈의 닫힌 집합 하나다. 속도 제한은 첨부 쓰기 등급(`attachmentMutation`)이고 동시 올리기 슬롯은 `POST /attachments`와 같이 쓴다.

답은 `ActionResponse<{ id, name, size, mimeType }>`이고 판정된 결과는 모두 HTTP 200이다: `ok`(같은 키·같은 파일의 재시도는 `replayed: true`), `invalid`(`fieldErrors`의 `code`: `too_large`·`unsupported_type`·`invalid_filename`·`too_many_parts`·`required`·`malformed`, 헤더 문제는 `path: ['headers', …]`), `conflict`(같은 키, 다른 파일), `forbidden`(`platform:view` 없음), `error`(저장소 장애, 또는 동시 올리기 슬롯이 없을 때 `Retry-After: 5`). 세션 없음 401, 다른 작업 공간 세션 403, CSRF 실패 403 `csrf.invalid`은 HTTP 오류다.

## 감사 응답

기능의 `auditTrail`·`entityAudit`(#621, [ADR-0069](../../../adr/0069-platform-port-in-feedbackops-backend.md) 결정 6·7·9): 응답의 `AuditEvent`에는 `reason`을 싣지 않는다. `changes`는 비어 있지 않은 scopes가 기록된 `api_token.issue`·`api_token.revoke`에만 `scopes: [null, 발급 권한]`·`scopes: [폐기 권한, null]`로 싣는다(권한 이름을 `, `로 이은 문자열). 나머지 사유·메모 본문과 민감 detail은 내보내지 않는다. `auditTrail`의 `type` 필터 문법은 [ADR-0101](../../../adr/0101-opaque-audit-target-filter.md)(불투명 토큰, 형식 맞는 미지 유형은 `empty`)이 소유하고, 응답 `target.type`은 기능 `subject_type` 24종(voc, finding, task, task_request, entity_link, voc_cluster, permission_request, permission_grant, permission_deny, survey, survey_question, managed_system, analytics_area, milestone, attachment, public_update_review_candidate, voc_cluster_suggestion, workspace, improvement_item, catalog_report, queue_settings, excerpt_reader, investigation, api_token)이고 `scopeId`는 항상 `null`이다. `api_token`은 `api_token.issue`·`api_token.revoke`만 공개하고, 실패 인증·세션 요구 거부 이벤트와 토큰 값·해시·prefix·`owner_actor_id`는 내보내지 않는다. SQL의 허용 목록은 42종이며(마이그레이션 `0125_eqv_sample_window.sql`) 거기서 18종을 내보내지 않는다: `knowledge_*` 7종, `eqv_*` 8종, 수명주기 3종(`development_project`, `validation_round`, `execution_request`)은 소유 모듈의 열람 권한을 이 함수가 알 수 없어 뺀다. 나머지 행에서는 다음 셋을 뺀다: ① 설문 응답 주체·event와 한쪽 끝이 `survey_response`·`validation_round`인 `entity_link` 행, ② `detail.capability`가 비민감 허용 목록(`CAPABILITY_META.sensitive = false`)에 없는 권한 행(민감 권한 요청의 수정·취소·결정 이력 포함), ③ `detail.sensitive = true` 행. 빠진 행은 `items`·`total`·`targetId` 필터·페이지에 나타나지 않는다. `page`는 안전한 정수(≤ 2^53−1)만 받고, 끝을 넘은 먼 페이지는 `ok`·`items: []`·실제 `total`이다. `sync` 액션에 대응하는 기능 event는 아직 없다.

## Menu permission diagnostics

`GET /api/v1/platform/usage-summary` also carries the optional deployment diagnostic `undeclaredMenuPermissions` (#1846), specified in the [wire contract](../../../integration/http-adapter-contract.md). Production passes validated snapshot menu requirements into server assembly, which compares them with the assembled menu registry's built-in and deployment declarations plus the kernel table. The server logger warns once per mismatch, and this existing read receives the same findings; no new endpoint or permission is added. A server without a snapshot, or with no undeclared menu permission, omits the field. Diagnostics do not depend on usage rows or the requested usage range.
