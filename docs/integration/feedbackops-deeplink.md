# FeedbackOps and platform link contract

Status: #597 standalone retirement, following [ADR-0097](../adr/0097-platform-features-and-role-based-names.md). The standalone app, outbound link builder/parser, `platformReturn`, origin allowlist and external navigation slots are removed. No parallel host or redirect table remains. The historical decisions in ADR-0045 and FO ADR-0071 stay unchanged as records.

## 1. Platform feature navigation

The platform registers the retained FeedbackOps screens through `@ap/fo-bridge` and `menus/feedbackops/*`. `FeedbackOpsSlot.entriesFor(spaceId)` returns only registered menu targets; permission checks, the app-owned Managed System mapping, and internal `returnTo` recovery remain. Context and destination IDs stay separate. Package names and all 36 frontend exports remain unchanged; #1098/#1099 own later naming changes.

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

## 3. Ownership

- The SDK owns `PlatformHop`, `buildPlatformInboundLink`, `parsePlatformInboundLink` in `packages/sdk/contracts/src/links/platform-inbound-link.ts`, global Context and platform `returnTo` validation. The inbound wire format and error codes remain unchanged, including legacy `feedbackops_origin`/`feedbackops_path` errors.
- FeedbackOps feature screens own their semantic search schemas, data and workflows. The platform registry and bridge own their mounted URLs and translate `selected`/`param` to `focus` as declared by each menu.
- Tests: `apps/platform-web/src/platform-inbound-link.test.ts`, `packages/adapters/fo-bridge/src/fo-entry-graph.test.ts`, bridge route mapper tests and the retained platform E2E contracts.

## 4. Changes

Update this document with inbound codec or navigation contract changes. New query meaning follows the platform URL version contract. Do not restore outbound standalone helpers, `platformReturn` or the retired standalone origin configuration.
