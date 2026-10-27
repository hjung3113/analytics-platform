# FeedbackOps ↔ 플랫폼 딥링크 계약

상태: **Decided (phase-1 allowlist)**. 계약 버전: `contract: 2`(1→2: 복귀 키 `platformReturn`, #448). 설계 근거: 이슈 #61, 06 §6(URL 계약)·§22(Context Link), [저장소 구조](repository-layout.md). 관찰 기준: FeedbackOps 서브모듈 커밋 **`13a3c5a`**(이 문서가 다루는 `/vocs`의 `view`·`action`·`selected`·`managedSystem`과 `/surveys/$surveyId`의 `builder` 검색 키는 `a777ad1`·`6a0c7f8`과 같음을 확인했고, 다른 라우트는 확인하지 않았다). 공간별 목록·전체 진입 네 대상(§1 표 아래 넷)은 서브모듈 커밋 **`dc7638f`**의 라우트 검색 스키마로 확인했다(#251). 복귀 키 `platformReturn`은 FeedbackOps 원본 `main`의 **`8c2b32d`**(FO ADR-0071, #1281)로 확인했다 — 서브모듈은 올리지 않았다(링크 계약은 배포된 FeedbackOps를 가리키고 플랫폼 빌드는 그 코드를 쓰지 않는다).

이 문서가 플랫폼 ↔ FeedbackOps 양방향 링크의 원본이다. 플랫폼 URL 규칙 자체(전역 Context 키, `v`, `returnTo`)는 06 §6이 원본이고, FeedbackOps 라우트·검색 스키마는 그쪽 `docs/frontend/routes-and-layout.md`가 원본이다. 여기는 **매핑, phase-1 허용 키(allowlist), 소유 경계, 변경 절차**만 다룬다.

구현은 `packages/sdk/contracts/src/links/feedbackops-link.ts`(`buildFeedbackOpsLink`, `parseFeedbackOpsLink`, `buildPlatformInboundLink`, `parsePlatformInboundLink`). 테스트는 `apps/platform-web/src/feedbackops-link.test.ts`.

FeedbackOps `validateSearch`가 `.strict()`라 알 수 없는 쿼리 키는 그쪽 라우트가 throw 한다. 그래서 **phase-1 생성기는 오늘 그 스키마가 받는 키만 낸다.** 기간·설비·`scopeId`·`returnTo`·`fo`·`v`를 FeedbackOps URL에 넣지 않는다. 복귀는 FeedbackOps가 정한 `platformReturn` 하나뿐이다(아래 "복귀").

## 1. 방향 A — 플랫폼 → FeedbackOps

Base는 인자 `origin`이다. 정규형은 정규식이 아니라 URL 표준 파싱(`new URL(input)`)으로 정하고, 입력이 `new URL(input).origin`과 정확히 같아야 한다(끝의 단일 슬래시 `/` 1개는 허용). `https`만 허용하고 `http`는 `localhost`/`127.0.0.1`만 허용한다. 정규형에서 벗어난 입력 — 축약 IPv4(`https://127.1`의 브라우저 origin은 `https://127.0.0.1`), 대문자 호스트(`https://EXAMPLE.com`), trailing-dot 호스트(`https://example.com.`), userinfo·path·query·hash, 기본 포트 — 는 `feedbackops_origin` 오류로 거부한다 — 보정하지 않는다. 앱이 `VITE_FEEDBACKOPS_ORIGIN`을 읽어 helper에 넘긴다(`PlatformAdapter`·kernel에 넣지 않는다. 어댑터 origin은 플랫폼 서버의 주소다). 앱이 시작할 때 `VITE_FEEDBACKOPS_ORIGIN`을 읽어 슬롯(`feedbackOpsSlot`)에 넘기고, 슬롯이 `buildFeedbackOpsLink`로 공간 진입 링크를 만든다(#60; 내 VOC 화면의 외부 링크는 #654에서 없어졌다). 값이 없거나 정규형이 아니면 링크를 만들지 않고 비활성으로 보인다(보정하지 않음).

| target | phase-1이 내는 URL | FeedbackOps가 이미 읽는 것 (`13a3c5a`) |
| --- | --- | --- |
| `voc-create` | `{origin}/vocs?action=create` 또는 `&managedSystem={uuid}` | `action=create` → `CreateRoute` → `initialManagedSystemId`. 링크 종류는 계약으로 남지만 사이드바는 더 그리지 않는다(`VOC 등록`은 레일 드로어, ADR-0070, #656) |
| `voc-detail` | `{origin}/vocs?view=inbox&selected={uuid}` (+ uuid면 `managedSystem`) | `selected`는 uuid. inbox ListShell |
| `survey-detail` | `{origin}/surveys/{uuid}` | path `surveyId`. search의 다른 키(`builder` 등)는 화면 상태라 **`platformReturn` 밖의 query를 붙이지 않는다** |
| `voc-list` | `{origin}/vocs?view=inbox&managedSystem={uuid}` | `/vocs`의 `view`(inbox\|my\|triage)·`managedSystem`(`apps/frontend/src/features/voc/routes/voc-search.ts`, `dc7638f`). `selected` 없음 |
| `task-list` | `{origin}/tasks?managedSystem={uuid}` | `/tasks`의 `managedSystem`(uuid \| `all`, `apps/frontend/src/routes/_authed/tasks.tsx`, `dc7638f`). 생성기는 uuid만 낸다 |
| `survey-list` | `{origin}/surveys?managedSystem={uuid}` | `/surveys`의 `managedSystem`(uuid \| `all`)·`selected` 둘뿐(`apps/frontend/src/routes/_authed/surveys/index.tsx`, `dc7638f`). 생성기는 `managedSystem` 하나만 낸다 |
| `overall` | `{origin}/home` | `/home`의 `managedSystem`(uuid, optional, `apps/frontend/src/routes/_authed/home.tsx`, `dc7638f`). 쿼리를 붙이지 않는다 — 시스템 범위 없는 허브 |

`overall`을 뺀 여섯 대상은 위 URL 끝에 선택 키 `platformReturn` 하나를 더 붙일 수 있다(contract 2, 아래 "복귀"). 표의 "하나만"·"query 없음"은 그 키를 뺀 나머지 키를 말한다.

목록 셋은 `managedSystem`(uuid)이 필수다. `all`이나 생략으로 범위 없는 URL을 대신 내지 않는다(ADR-0045). `parseFeedbackOpsLink`도 같은 모양만 받는다 — 다른 키·중복 키(`platformReturn` 중복 포함)·비 uuid·규칙을 어긴 `platformReturn`, `/vocs?view=inbox`만 있는 링크, `/home?…`는 거부한다.

예:

```text
https://feedbackops.example/vocs?action=create
https://feedbackops.example/vocs?action=create&managedSystem=11111111-1111-4111-8111-111111111111
https://feedbackops.example/vocs?view=inbox&selected=22222222-2222-4222-8222-222222222222
https://feedbackops.example/surveys/33333333-3333-4333-8333-333333333333
https://feedbackops.example/vocs?view=inbox&managedSystem=11111111-1111-4111-8111-111111111111
https://feedbackops.example/tasks?managedSystem=11111111-1111-4111-8111-111111111111
https://feedbackops.example/surveys?managedSystem=11111111-1111-4111-8111-111111111111
https://feedbackops.example/home
```

### 매핑 — 보내는 것과 보내지 않는 것

- **VOC id → `selected`, survey id → path.** uuid만 (`8-4-4-4-12` hex). 비-uuid는 `feedbackops_id`로 거부.
- **Scope → 보내지 않음.** 플랫폼 `scopeId`(예: `MEM`)는 Site 이름이고 FeedbackOps `managedSystem`은 Managed System uuid(`createVocRequestSchema.primary_managed_system_id`)다. 장비 ID로 Site/MS를 역산하지 않는다(ADR-0004와 같은 금지). `managedSystem`은 앱 조립 계층의 정적 표(업무 공간 id → uuid, 공간당 하나)에서만 온다([ADR-0045](../adr/0045-feedbackops-entry-link-mapping-and-scope.md)). 행이 없으면 `voc-create`·`voc-detail`은 생략하고(사용자가 FeedbackOps에서 고름), 공간별 목록 진입(`voc-list`·`task-list`·`survey-list`)은 그리지 않는다. 사이드바 블록의 `VOC`는 #760부터 이 딥링크가 아니라 셸 안 `수신함`으로 열린다(같은 탭, `managedSystem`과 `returnTo`만 — 앱이 `feedbackops-systems.ts`에서 슬롯 항목 `{ menuId: 'fo-inbox', page: { managedSystem } }`로 준다). `Task`도 #763부터 셸 안 `Task 목록`으로 열려(앱이 슬롯 항목 `{ menuId: 'fo-task-list', page: { managedSystem } }`로 준다) `task-list` 딥링크는 블록이 그리지 않고, `설문`만 이 딥링크(`survey-list`)를 새 탭으로 연다(#764 전까지). 블록 전체는 `feedbackops:access`가 있을 때만 그린다. 행은 있는데 origin이 없거나 정규형이 아니면 새 탭 진입(설문)만 비활성으로 보이고(셸 안 `VOC`·`Task` 진입은 이 딥링크를 쓰지 않으므로 그대로 켜져 있다), 전체 진입(`overall`)은 그리지 않는다(`apps/platform-web/src/feedbackops-systems.ts`, #251). 전체 진입은 `feedbackops:access` 권한자에게만 보인다.
- **기간 `from`/`to`, 설비 Selection → 보내지 않음.** VOC create body에 그 필드가 없고 strict search가 거부한다.
- **플랫폼 `returnTo` → 보내지 않음.** FeedbackOps `sanitizeLoginReturnTo`는 same-origin 상대경로만 받고 `redirectTo`는 로그인 전용이며, `/vocs`·`/tasks`의 `returnTo`는 FeedbackOps 안 경로 세 개(`/home`·`/integration`·`/integration/coverage`)만 받는다.
- **복귀 → `platformReturn`(contract 2, FO ADR-0071).** `voc-create`·`voc-detail`·`voc-list`·`task-list`·`survey-list`·`survey-detail`이 선택 필드 `platformReturn`을 받아 쿼리 맨 끝에 붙인다. `overall`(`/home`)은 받지 않는다. 값은 링크를 그린 플랫폼 화면의 절대 URL이다 — 셸 사이드바는 `FeedbackOpsSlot.entriesFor(spaceId, platformReturn)`로, '내 VOC'는 자기 화면 URL로 넘긴다. 규칙은 FeedbackOps와 같다: 절대 URL, 2048자 이하(`PLATFORM_RETURN_MAX`), `https`(`http`는 `localhost`·`127.0.0.1`만), userinfo 없음. 생성·파스 모두 어기면 `feedbackops_return`으로 거부한다. 화면은 `platformReturnFor(전체 URL, 경로만 URL)`로 고른다: 전체 URL이 길면 경로만, 그것도 안 되면 키를 빼고 링크는 그대로 둔다. 링크가 보이는지는 FeedbackOps 배포의 `PLATFORM_RETURN_ORIGINS`에 플랫폼 origin이 있는지로 정해지고(그쪽 판정), 그 밖이면 FeedbackOps가 아무것도 그리지 않는다. 키는 FeedbackOps URL에만 살아서 그쪽에서 다른 화면으로 옮기면 사라질 수 있다.
- **설문 응답 화면은 있지만 딥링크 타입은 아직 두지 않는다.** FeedbackOps에는 로그인 사용자용 설문 참여 목록 `/surveys/participate`와 응답 폼 `/surveys/$surveyId/respond`가 있다(서브모듈 `dc7638f`에서 확인, FeedbackOps #726). 공개 링크는 FeedbackOps [ADR-0036](../feedbackops/adr/0036-survey-link-distribution-and-respondent-model.md)에서 Rejected(2026-10-13)다 — MVP 응답자는 AD 인증 내부 사용자이고, 외부 응답이 필요해지면 새 ADR로 시작한다. 플랫폼은 이 두 경로로 링크하지 않는다 — 설문 진입은 목록·상세까지다(ADR-0045).

호출은 `<a href target="_blank" rel="noopener noreferrer">`다(사이드바 `VOC`의 셸 안 이동은 제외). `navigate`/`linkTo`/플랫폼 `returnTo`에 절대 URL을 넣지 않는다. 플랫폼 `returnTo`는 `isAppRelativePath` + `safeReturnTo`(등록 라우트, `pageKeys`로 `parseQuery`)만 사용한다.

## 2. 방향 B — FeedbackOps → 플랫폼

목적지 id는 path, 분석 Context는 query(06 §6.1, §22). Selection을 목적지 id로 바꾸지 않는다. 아래는 `buildPlatformInboundLink`·`parsePlatformInboundLink`가 생성·수용하는 레거시 inbound codec 경로다. 플랫폼은 이를 Registry 정규 경로로 교체한다([06 §6.4](../contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)). phase-1 hop allowlist:

| hop | path | 받는 query |
| --- | --- | --- |
| `equipment-detail` | `/equipment/{equipmentId}` | 전역 Context + `returnTo` |
| `equipment-master` | `/equipment` | 전역 Context |
| `cycle-time` | `/analytics/cycle-time` | 전역 Context |

예:

```text
https://platform.example/equipment/MEM-PHOTO-0103?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00
https://platform.example/equipment?v=1&scopeId=MEM&selectedEquipmentIds=MEM-PHOTO-0103
https://platform.example/analytics/cycle-time?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=MEM-PHOTO-0103
```

(예의 시각 값은 사람이 읽은 형태고, 실제 직렬화는 `buildQuery`의 form-urlencoded 규칙을 따른다 — `T` 구분자의 `:`는 `%3A`로 직렬화된다.)

- `v` 생략은 1. `v=2`는 `unsupported_version`으로 전체 거부(rewrite 없음).
- 생성기는 파서와 같은 규칙을 **직렬화 전에** 입력에 적용한다. `from`/`to` 쌍·naive 형식·`from < to`와 metric 쌍 위반은 파서와 같은 오류 코드(`partial_period`·`invalid_time`·`invalid_period`·`metric_pair`)로 거부한다 — 직렬화가 한쪽만 있는 기간이나 metricVersion을 조용히 버리지 않도록 먼저 검증한다.
- `equipmentId`는 빌드·파스 모두 공백 없는(nonblank) 단일 세그먼트여야 하고, `.`/`..`(`%2E` 같은 인코딩형 포함)는 `invalid_id`로 거부한다 — 브라우저는 dot 세그먼트를 경로 정규화로 지워버린다(`/equipment/..` → `/`). 파스는 `/equipment/` 뒤 **정확히 1개의 raw 세그먼트**를 요구한다(레지스트리 `matchRoute`와 동일 — `/equipment/A/B` 거부). 인코딩된 슬래시 id(`A%2FB`)는 여전히 유효하다.
- `from`/`to`는 naive `YYYY-MM-DDTHH:mm:ss`, 둘 다 있거나 둘 다 없음, `from < to`. 날짜-only·`Z` 거부(06 §6.3).
- 설비 집합은 반복 키 `selectedEquipmentIds`. 별칭 `equipmentIds`는 parse가 받지만 **생성기는 canonical만** 낸다. 동시 사용은 `alias_conflict`.
- `returnTo`는 `equipment-detail`만(manifest `pageKeys`). 값은 `isAppRelativePath`인 플랫폼 경로. `https://…`, `//`, `\`는 `external_return`으로 거부하고 extras로 남기지 않는다. `cycle-time`/`equipment-master`는 `returnTo` page 키가 아니므로 생성·파싱 모두 거부한다.
- 파스는 **등록된 전역 키 전체**를 `context`(`GlobalContext`)로 반환한다(06 §6.4 보존) — `roomNames`·`lineNames`·`prcGroups`·`membershipBasis`·`condition`·`lotIds`·`ppid`·`recipeIds`·`metricId`/`metricVersion`도 버려지지 않는다. 생성기도 같은 전역 Context를 받으므로 파스→빌드 라운드트립이 모든 등록 키를 보존한다.
- 미등록 키(`managedSystem`, `vocId`, `fo` 등)는 `parseQuery`의 `extras`로 보존한다. 전역 Context로 올리지 않고 조회에 쓰지 않는다. 현재 URL에는 kernel이 보존한다(06 §6.4).
- Scope는 URL이 증명이 아니다. 화면은 기존처럼 `validateScope`을 하고, 설비 상세는 `useEntityQuery` → `getEntity({ type, id, scopeId })`로 확인한다. id로 Site를 채우지 않는다. 이 codec은 그 호출을 하지 않는다.
- 플랫폼 `/voc`는 FeedbackOps VOC가 아니다. VOC id의 플랫폼 목적지를 만들지 않는다(#60).

## 3. 소유 경계

- **플랫폼 소유:** inbound 경로, `v`·전역 키, `returnTo` 규칙, `packages/sdk/contracts/src/links/feedbackops-link.ts`.
- **FeedbackOps 소유:** path, strict search 스키마, MS uuid, VOC/survey uuid. 관찰 기준 커밋(합류 뒤에는 이 저장소의 커밋)을 이 문서 헤더에 적어 기준을 고정한다.
- 두 쪽은 같은 저장소에 있지만 소유는 위와 같다. FeedbackOps 쪽 키를 바꾸는 변경은 아래 §4 절차로만 한다(동결된 원본 FeedbackOps 저장소는 고치지 않는다, #592).

## 4. 변경 절차

1. FeedbackOps 라우트·스키마 변경은 `apps/fo-*`·`packages/fo-*`·`docs/feedbackops/`를 고치는 이 저장소 PR로 한다(#592) → 이 문서를 같은 PR에서 갱신하고 링크 키가 바뀌면 헤더의 관찰 기준 커밋을 고친다(`platformReturn`, #448).
2. 새 키로 조회 의미가 바뀌면 플랫폼은 `v` bump(06 §6.4), 이 통합 문서는 `contract` bump를 함께 올린다.
3. **생성기는 이 문서 allowlist 밖의 키를 내지 않는다.** 허용 전 생성기 변경 금지. 테스트(`feedbackops-link.test.ts`)가 이 불변을 단언한다.

## 5. FeedbackOps 쪽 요구 (플랫폼이 패치하지 않음 — ADR-0045)

1. `scopeId`↔`managed_system_id`를 쓰지 말고, 플랫폼 설정 표가 준 uuid만 `managedSystem`으로 받는다.
2. VOC create strict 스키마에 선택 키를 넣기 전에는 기간·설비를 쿼리로 받지 않는다. 저장(설명 vs entity link)을 그쪽이 정한 뒤 키 이름을 이 문서에 추가한다.
3. 플랫폼은 설문 응답 경로(`/surveys/participate`, `/surveys/$surveyId/respond`)로 링크하지 않는다. 응답은 FeedbackOps 안에서 한다.
4. 플랫폼 복귀는 새 파라미터 + 플랫폼 origin allowlist로 설계한다. `redirectTo`·내부 `returnTo` 재사용 금지. 요청([FeedbackOps#1278](https://github.com/hjung3113/FeedbackOps/issues/1278)) → FO ADR-0071 `platformReturn`으로 출시, 플랫폼은 contract 2로 반영(#448, §1 "복귀").
