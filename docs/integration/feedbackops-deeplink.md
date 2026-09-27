# FeedbackOps ↔ 플랫폼 딥링크 계약

상태: **Decided (phase-1 allowlist)**. 계약 버전: `contract: 1`. 설계 근거: 이슈 #61, 06 §6(URL 계약)·§22(Context Link), [저장소 구조](repository-layout.md). 관찰 기준: FeedbackOps 서브모듈 커밋 **`6a0c7f8`**.

이 문서가 플랫폼 ↔ FeedbackOps 양방향 링크의 원본이다. 플랫폼 URL 규칙 자체(전역 Context 키, `v`, `returnTo`)는 06 §6이 원본이고, FeedbackOps 라우트·검색 스키마는 그쪽 `docs/frontend/routes-and-layout.md`가 원본이다. 여기는 **매핑, phase-1 허용 키(allowlist), 소유 경계, 변경 절차**만 다룬다.

구현은 `packages/contracts/src/feedbackops-link.ts`(`buildFeedbackOpsLink`, `parseFeedbackOpsLink`, `buildPlatformInboundLink`, `parsePlatformInboundLink`). 테스트는 `apps/platform-web/src/feedbackops-link.test.ts`.

FeedbackOps `validateSearch`가 `.strict()`라 알 수 없는 쿼리 키는 그쪽 라우트가 throw 한다. 그래서 **phase-1 생성기는 오늘 그 스키마가 받는 키만 낸다.** 기간·설비·`scopeId`·`returnTo`·`fo`·`v`를 FeedbackOps URL에 넣지 않는다.

## 1. 방향 A — 플랫폼 → FeedbackOps

Base는 인자 `origin`이다. 정규형은 정규식이 아니라 URL 표준 파싱(`new URL(input)`)으로 정하고, 입력이 `new URL(input).origin`과 정확히 같아야 한다(끝의 단일 슬래시 `/` 1개는 허용). `https`만 허용하고 `http`는 `localhost`/`127.0.0.1`만 허용한다. 정규형에서 벗어난 입력 — 축약 IPv4(`https://127.1`의 브라우저 origin은 `https://127.0.0.1`), 대문자 호스트(`https://EXAMPLE.com`), trailing-dot 호스트(`https://example.com.`), userinfo·path·query·hash, 기본 포트 — 는 `feedbackops_origin` 오류로 거부한다 — 보정하지 않는다. 앱이 `VITE_FEEDBACKOPS_ORIGIN`을 읽어 helper에 넘긴다(`PlatformAdapter`·kernel에 넣지 않는다. 어댑터 origin은 플랫폼 서버 포트다). env 연결은 #60이 링크를 그릴 때까지 미룬다.

| target | phase-1이 내는 URL | FeedbackOps가 이미 읽는 것 (`6a0c7f8`) |
| --- | --- | --- |
| `voc-create` | `{origin}/vocs?action=create` 또는 `&managedSystem={uuid}` | `action=create` → `CreateRoute` → `initialManagedSystemId`. 사이드바 href와 동일 |
| `voc-detail` | `{origin}/vocs?view=inbox&selected={uuid}` (+ uuid면 `managedSystem`) | `selected`는 uuid. inbox ListShell |
| `survey-detail` | `{origin}/surveys/{uuid}` | path `surveyId`. search는 `builder`뿐이라 **query를 붙이지 않는다** |

예:

```text
https://feedbackops.example/vocs?action=create
https://feedbackops.example/vocs?action=create&managedSystem=11111111-1111-4111-8111-111111111111
https://feedbackops.example/vocs?view=inbox&selected=22222222-2222-4222-8222-222222222222
https://feedbackops.example/surveys/33333333-3333-4333-8333-333333333333
```

### 매핑 — 보내는 것과 보내지 않는 것

- **VOC id → `selected`, survey id → path.** uuid만 (`8-4-4-4-12` hex). 비-uuid는 `feedbackops_id`로 거부.
- **Scope → 보내지 않음.** 플랫폼 `scopeId`(예: `ICH`)는 Site 이름이고 FeedbackOps `managedSystem`은 Managed System uuid(`createVocRequestSchema.primary_managed_system_id`)다. 장비 ID로 Site/MS를 역산하지 않는다(ADR-0004와 같은 금지). 명시적 표의 uuid만 `managedSystem`으로 넘기고, 행이 없으면 생략한다(사용자가 FeedbackOps에서 고름).
- **기간 `from`/`to`, 설비 Selection → 보내지 않음.** VOC create body에 그 필드가 없고 strict search가 거부한다.
- **플랫폼 `returnTo` → 보내지 않음.** FeedbackOps `sanitizeLoginReturnTo`는 same-origin 상대경로만 받고 `redirectTo`는 로그인 전용이라 재사용할 수 없다. phase-1 복귀는 새 탭이다.
- **설문 제출 화면 없음.** 제출은 인증 API(`GET/POST /surveys/:id/form|responses`)뿐이고 공개 링크 ADR-0036은 Proposed·미구현이다. `survey-respond` 타입을 두지 않고, 제출 경로를 추측하지 않는다.

호출은 `<a href target="_blank" rel="noopener noreferrer">`다. `navigate`/`linkTo`/플랫폼 `returnTo`에 절대 URL을 넣지 않는다. 플랫폼 `returnTo`는 `isAppRelativePath` + `safeReturnTo`(등록 라우트, `pageKeys`로 `parseQuery`)만 사용한다.

## 2. 방향 B — FeedbackOps → 플랫폼

목적지 id는 path, 분석 Context는 query(06 §6.1, §22). Selection을 목적지 id로 바꾸지 않는다. phase-1 hop allowlist:

| hop | path | 받는 query |
| --- | --- | --- |
| `equipment-detail` | `/equipment/{equipmentId}` | 전역 Context + `returnTo` |
| `equipment-master` | `/equipment` | 전역 Context |
| `cycle-time` | `/analytics/cycle-time` | 전역 Context |

예:

```text
https://platform.example/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00
https://platform.example/equipment?v=1&scopeId=ICH&selectedEquipmentIds=ICH-PHOTO-0103
https://platform.example/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=ICH-PHOTO-0103
```

(예의 시각 값은 사람이 읽은 형태고, 실제 직렬화는 `buildQuery`의 form-urlencoded 규칙을 따른다 — `T` 구분자의 `:`는 `%3A`로 직렬화된다.)

- `v` 생략은 1. `v=2`는 `unsupported_version`으로 전체 거부(rewrite 없음).
- 생성기는 파서와 같은 규칙을 **직렬화 전에** 입력에 적용한다. `from`/`to` 쌍·naive 형식·`from < to`와 metric 쌍 위반은 파서와 같은 오류 코드(`partial_period`·`invalid_time`·`invalid_period`·`metric_pair`)로 거부한다 — 직렬화가 한쪽만 있는 기간이나 metricVersion을 조용히 버리지 않도록 먼저 검증한다.
- `equipmentId`는 빌드·파스 모두 공백 없는(nonblank) 단일 세그먼트여야 하고, `.`/`..`(`%2E` 같은 인코딩형 포함)는 `invalid_id`로 거부한다 — 브라우저는 dot 세그먼트를 경로 정규화로 지워버린다(`/equipment/..` → `/`). 파스는 `/equipment/` 뒤 **정확히 1개의 raw 세그먼트**를 요구한다(레지스트리 `matchRoute`와 동일 — `/equipment/A/B` 거부). 인코딩된 슬래시 id(`A%2FB`)는 여전히 유효하다.
- `from`/`to`는 naive `YYYY-MM-DDTHH:mm:ss`, 둘 다 있거나 둘 다 없음, `from < to`. 날짜-only·`Z` 거부(06 §6.3).
- 설비 집합은 반복 키 `selectedEquipmentIds`. 별칭 `equipmentIds`는 parse가 받지만 **생성기는 canonical만** 낸다. 동시 사용은 `alias_conflict`.
- `returnTo`는 `equipment-detail`만(manifest `pageKeys`). 값은 `isAppRelativePath`인 플랫폼 경로. `https://…`, `//`, `\`는 `external_return`으로 거부하고 extras로 남기지 않는다. `cycle-time`/`equipment-master`는 `returnTo` page 키가 아니므로 생성·파싱 모두 거부한다.
- 파스는 **등록된 전역 키 전체**를 `context`(`GlobalContext`)로 반환한다(06 §6.4 보존) — `roomNames`·`condition`·`lotIds`·`ppid`·`recipeIds`·`metricId`/`metricVersion`도 버려지지 않는다. 생성기도 같은 전역 Context를 받으므로 파스→빌드 라운드트립이 모든 등록 키를 보존한다.
- 미등록 키(`managedSystem`, `vocId`, `fo` 등)는 `parseQuery`의 `extras`로 보존한다. 전역 Context로 올리지 않고 조회에 쓰지 않는다. 현재 URL에는 kernel이 보존한다(06 §6.4).
- Scope는 URL이 증명이 아니다. 화면은 기존처럼 `validateScope`을 하고, 설비 상세는 `useEntityQuery` → `getEntity({ type, id, scopeId })`로 확인한다. id로 Site를 채우지 않는다. 이 codec은 그 호출을 하지 않는다.
- 플랫폼 `/voc`는 FeedbackOps VOC가 아니다. VOC id의 플랫폼 목적지를 만들지 않는다(#60).

## 3. 소유 경계

- **플랫폼 소유:** inbound 경로, `v`·전역 키, `returnTo` 규칙, `packages/contracts/src/feedbackops-link.ts`.
- **FeedbackOps 소유:** path, strict search 스키마, MS uuid, VOC/survey uuid. 서브모듈 관찰 커밋을 이 문서 헤더에 적어 기준을 고정한다.
- 어느 쪽도 상대 저장소(`products/feedbackops/`, 원본 저장소)를 직접 고치지 않는다.

## 4. 변경 절차

1. FeedbackOps 라우트·스키마 변경은 원본 저장소 PR로 한다 → 서브모듈 bump → 이 문서를 갱신한다.
2. 새 키로 조회 의미가 바뀌면 플랫폼은 `v` bump(06 §6.4), 이 통합 문서는 `contract` bump를 함께 올린다.
3. **생성기는 이 문서 allowlist 밖의 키를 내지 않는다.** 허용 전 생성기 변경 금지. 테스트(`feedbackops-link.test.ts`)가 이 불변을 단언한다.

## 5. FeedbackOps 쪽 요구 (플랫폼이 패치하지 않음 — #81 ready-for-human)

1. `scopeId`↔`managed_system_id`를 쓰지 말고, 플랫폼 설정 표가 준 uuid만 `managedSystem`으로 받는다.
2. VOC create strict 스키마에 선택 키를 넣기 전에는 기간·설비를 쿼리로 받지 않는다. 저장(설명 vs entity link)을 그쪽이 정한 뒤 키 이름을 이 문서에 추가한다.
3. 제출 라우트 경로를 공개하기 전까지 플랫폼이 `/respond`를 추측하지 않는다.
4. 플랫폼 복귀는 새 파라미터 + 플랫폼 origin allowlist로 설계한다. `redirectTo` 재사용 금지.
