# 메뉴 데이터 조회 포트 (설계 기록 — 구현 완료 2026-10-01)

> 상태: **설계 기록.** 이슈 #100의 설계와 결정 경과를 남긴 문서다. 구현은 §10 단계 1–12로 끝났다(#110–#115, #125–#133). **현재 계약의 원본은 이 문서가 아니다:** 메뉴 선언 항목은 [06 §5](../06_platform_ui_contract.md#5-menu-extension-contract)("조회 엔드포인트"), 명시적 공집합 예외는 06 §19, 패키지 경계·포트 판정·메뉴 패키지 모양은 [platform-packages](platform-packages.md) §3–§5, 규칙은 `menus/AGENTS.md`·`packages/*/AGENTS.md`, 동작은 코드(`packages/contracts/src/menu-query.ts`, `packages/kernel/src/query.ts`, `packages/mock-server/src/endpoints.ts`)다. 충돌하면 그쪽을 따른다.
>
> 아래 §1–§9의 파일 경로·줄 번호는 작성 시점(`main` `0bd8a88`, 2026-09-29) 기준의 기록이다 — 지금 코드와 다르다(예: `src/api.ts`·`serve`는 #132에서 사라졌다). 미해결로 남은 것은 Q2(선언 원본 TS ↔ FastAPI codegen, FastAPI 착수 때)뿐이다.

## 결정 기록 (2026-09-29, 사용자)

| 항목 | 결정 |
| --- | --- |
| Q1 방향 | 범용 요청(`MenuQuery`) + 메뉴 선언(`EndpointSpec`) + 앱이 주입하는 전송 하나(§2.1). 대안 A(메뉴별 포트 주입)는 쓰기처럼 조회 모양에 안 맞는 기능이 생기면 재검토 |
| Q7 범위 | 단계 이행(§10): 2개 화면 검증 → 사람 확인 게이트 → 생성기 전환 → 나머지 패키지별 1 PR → `serve` 제거. VOC 이전(§10 단계 10)도 #100 범위에 포함 |
| Q8 어댑터 기준 | §3 저장소 소유 기준과 멤버별 판정에 동의(`accessDirectory` 유지, VOC 메서드·타입 이전) |
| Q5 | 엔드포인트 권한은 **데이터 접근 권한**이며 메뉴 manifest 권한과 달라도 된다(2026-09-29 개정: 처음엔 "같아야 한다"였으나 `home`이 `platform:view` 메뉴이면서 공지 조회에 `notice:view`를 요구하는 실제 사례와 충돌해 바꿨다). 등록 시 `menuId`·권한 이름이 Registry에 실재하는지만 검사한다 |
| Q6 | `respondent_history`는 플랫폼 kind 어휘에 유지, 두 번째 소비자가 나오면 재검토 |
| Q2 | 미룸 — FastAPI 착수 때 |
| Q3 (2026-10-01, 게이트) | 선언이 apply하지 않는 Context 키가 요청에 오면 **error로 거부**한다(단계 7a, #125) |
| Q4 (2026-10-01, 게이트) | 06 §5 "메뉴가 선언하는 정보"에 **조회 엔드포인트(권한·적용 Context·kind·한도)를 추가**한다 — 06·05 반영 완료(#134). 패키지 경계 문서 이관은 단계 12(#133) |
| Q9 (2026-10-01, 게이트) | 선언이 apply하는 Context 키가 요청에 없으면 **error로 거부**한다. `time`의 `from`/`to`는 null 불가(단계 7a, #125) |
| Q10 (2026-10-01, 게이트) | **등록 규칙 6**: `requiresScope: false` 엔드포인트는 site에 묶인 Context(`roomNames`·`condition`·`selection`·`lot`·`recipe`·`ppid`, 06 §22)를 apply할 수 없다(단계 7a, #125). 질문은 앞의 셋으로 받았으나 site 경계 우회를 막는다는 결정 취지에 맞춰 06 §22의 site 종속 키 여섯 개로 적용 |
| 06 §19 명시적 공집합 (2026-10-01, 게이트) | 명시적 공집합은 원천 조회 없이 `empty`·assessments 없음·trust 없음으로 답하는 **예외로 06 §19에 명시**한다 — 반영 완료(#134) |
| 단계 9 범위 (2026-10-01, 사용자) | 나머지 메뉴는 화면을 다듬지 않고 **플랫폼 계약 검증 + 최소 이전**만 한다(실데이터 없는 견본 화면이므로). 메뉴마다 새 조회 방식 위에서 처음 확인하는 계약만 의미가 있다: 공통 표 서버 페이징(`equipment-master`, `cycle-time`, `metrics`), 내보내기 서버 재검증(`cycle-time`·`equipment-master`), 지표 버전 서버 검증(`metrics`+#123), 엔드포인트 권한 ≠ 메뉴 권한(`home`). 작은 메뉴는 한 PR로 묶어도 된다 |
| #98 | 선택지 3, 절반만 확정: room_name 부여·열람 개별 부여는 플랫폼 메타 DB 소유, 역할 소속 원천은 IdP 그룹 claim 사양이 나올 때까지 보류(§9) |

## 1. 현재 상태 검증 (이슈 진단 대조)

### 1.1 조회 경로는 두 갈래가 아니라 세 갈래이며, 한 패키지 안에서도 섞인다

| 경로 | 호출 모양 | 누가 정하나 |
| --- | --- | --- |
| A. mock `serve()` 직접 | 메뉴 `src/api.ts`가 `@ap/mock-server`의 `serve`를 재export, 화면이 `serve({ permission, global, kinds, compute, … })` | **클라이언트**가 권한·kind·한도·계산 함수를 넘긴다 |
| B. Kernel 포트 `PlatformAdapter` | `usePlatform().adapter.<method>(query)` 또는 Kernel 훅(`useEntityQuery`) | 포트 계약. 서버(mock)가 권한을 정한다 |
| C. 서버 조회 없음 | `usePlatform().registry`를 직접 읽음(`RegistryCatalog`) 또는 화면 없음 | — |

메뉴 패키지 7개(`menus/*`) 기준:

| 패키지 | 경로 | 근거 |
| --- | --- | --- |
| `home` | A | `menus/home/src/pages/OperationsHome.tsx:21` — 공지 데이터 `NOTICES`가 화면 파일 안의 상수(`:9`)이고 `compute`가 필터 |
| `equipment` | **A + B 혼합** | 목록 `EquipmentMaster.tsx:22,41`은 `serve`, 상세 `EquipmentDetail.tsx`는 `useEntityQuery`(=`adapter.getEntity`)와 `adapter.entityAudit`(`:20`) |
| `master-data` | C | `src/index.ts`에 화면 없는 manifest만 있음 |
| `analytics` | A | `ProductivityOverview.tsx` 4곳, `CycleTimeDrilldown.tsx` 4곳, `ExecutionDetail.tsx` 1곳, `cycleData.ts:224`(내보내기) 1곳 |
| `metrics` | A | `MetricCatalog.tsx` 2곳, `MetricDetail.tsx` 3곳 |
| `notice-voc` | B | `MyVocHistory.tsx:33,36` — `adapter.myVocHistory`, `adapter.mySurveyHistory` |
| `admin` | B + C | `AccessDirectory.tsx:156`, `AuditTrail.tsx:97`, `UsageOverview.tsx:20`은 어댑터, `RegistryCatalog`는 Registry 직접 |

`serve(` 호출은 4개 패키지·8개 파일·18곳이다(`grep -rnE "serve(<[^>]*>)?\(\{" menus`, 테스트 제외).

### 1.2 이슈 진단 중 맞는 것

- `menus/analytics/src/api.ts:1-6`가 mock을 재export한다. 사실.
- `ServeOptions`가 contracts가 아니라 mock에 있다. 사실, 현재 위치는 `packages/mock-server/src/server.ts:88-114`(이슈의 `:96-112`는 낡음).
- `PlatformAdapter`에 `myVocHistory`·`accessDirectory`·`auditTrail`이 있다. 사실, 현재 `packages/contracts/src/adapter.ts:220`(auditTrail), `:234`(accessDirectory), `:239`(myVocHistory). `MyVocStatus`는 `:93`(이슈의 `:67`은 낡음). `mySurveyHistory`(`:244`)도 같은 부류인데 이슈에 빠져 있다.
- 생성기가 mock `serve`를 박아 넣는다. 사실, 현재 `tooling/gen-menu/src/templates.ts:55`(`src/api.ts`)와 `:193-208`(페이지의 `serve` 호출). 이슈의 `:139-151`은 지금은 manifest 템플릿 자리다.
- `PLATFORM_REQUIREMENTS.md:141`(공개 스키마 단일 산출물 + codegen)이 미체크. 사실.

### 1.3 이슈 진단 중 틀리거나 빠진 것

1. **"분석 메뉴 4개"는 부정확하다.** `serve`를 부르는 건 패키지 4개(`home`·`equipment`·`analytics`·`metrics`)이고 분석 메뉴는 그중 `analytics` 하나다. 분석 화면만의 문제가 아니라 관리·카탈로그·개요 화면 모두의 문제다.
2. **"두 갈래"가 아니라 세 갈래(1.1)이고, `equipment`는 한 패키지가 A와 B를 섞는다.** "어느 쪽이 계약인지"는 메뉴 단위가 아니라 화면 단위로 갈린다.
3. **계산만 새는 게 아니라 원천 데이터가 클라이언트 코드에 import된다.** `menus/analytics/src/api.ts`는 `serve`뿐 아니라 `EQUIPMENT`·`jobsInPeriod`·`jobsForEquipmentDay`·`cycleMinutes` 등 mock 모집단을 재export하고, `cycleData.ts:280,293,304,312`는 `EQUIPMENT`를 직접 읽는다. `api.ts`를 HTTP로 바꾸는 것만으로는 전환이 불가능하다 — `productivityData.ts`·`cycleData.ts`의 계산 전체가 서버 쪽으로 옮겨가야 한다. `home`의 `NOTICES`도 같은 문제다.
4. **Context 능력 선언(06 §6 `apply/reference/unsupported`)이 서버 조회와 연결돼 있지 않다.** `serve`는 manifest `context`를 모르고 항상 `scopeId·roomNames·condition·selection`을 적용한다(`resolveEquipment`, `server.ts:65-81`). `lotIds·ppid·recipeIds`는 클라이언트 `compute`가 거른다(`cycleData.ts` population). 그래서 `ExecutionDetail.tsx:29-33`은 `reference`로 선언한 키를 화면이 **손으로 null로 지워서** 보낸다. 선언과 집행이 따로 논다.
5. **§19 적용 kind 선언이 호출마다 제각각이다.** `ProductivityOverview.tsx:76`만 `time_domain`까지 선언하고 같은 화면의 나머지 3개 위젯은 기본값(`collection, processing_delay, coverage`)에 기대며, 메트릭 화면은 `['processing_delay']`, 홈은 `[]`다. 06 §19는 "조회 계약(공개 스키마/메뉴 선언)이 적용 kind를 선언"한다고 하는데 지금은 호출 인자가 정한다.
6. **지표 버전도 클라이언트 상수다.** `productivityData.ts`의 `METRIC_VERSIONS`와 `MetricCatalog.tsx:42-46`의 지표 쌍 검증이 `compute` 안에서 돈다. 06 §6.1은 쌍 검증을 서버 책임으로 둔다.
7. `export-permission.test.ts`가 `api.ts`를 통해 `setRole`/`getRole`을 쓴다 — 테스트도 mock 내부에 묶여 있다(마이그레이션 때 테스트 위치를 같이 옮겨야 함).

## 2. 제안 계약

### 2.1 핵심 방향 (추천)

**앱이 메뉴마다 타입 있는 포트 객체를 주입하는 방식이 아니라**, ① 플랫폼이 **범용 조회 요청 모양** 하나를 소유하고 ② 메뉴가 **엔드포인트 선언**(권한·적용 Context·적용 kind·한도)을 데이터로 소유하며 ③ 앱은 **전송 구현 하나**(mock 또는 HTTP)를 주입한다. mock에서는 메뉴별 서버 절반(계산)이 앱 조립 지점에서 mock 전송에 등록된다.

이슈의 "메뉴별 서버 포트를 앱이 주입"을 조금 바꾼 것이다. 이유: 실서버는 FastAPI다([03](../03_backend_stack.md)). 실서버 쪽에서 메뉴별 TS 포트 구현은 전부 "`fetch` 한 줄"이 되므로 메뉴마다 주입 지점을 두는 비용만 남는다. 메뉴별 포트 주입안은 대안 A(§7)로 비교한다.

### 2.2 타입 스케치 (`@ap/contracts`, 새 모듈 `src/menu-query.ts`)

```ts
// 필드명 전부 Candidate.
import type { AssessmentKind, ApiResponse } from './response';
import type { Capability, ContextKey, Permission } from './menu';
import type { GlobalContext } from './url';

/** 메뉴가 선언하는 조회 엔드포인트 하나. 클라이언트·서버가 같은 선언을 읽는다(PLATFORM_REQUIREMENTS:141). */
export type EndpointSpec<P, T> = {
  id: string;                    // '<group>.<name>', 전역 유일. 전송 경로 키
  menuId: string;                // 이 엔드포인트를 소유한 메뉴(manifest id). 등록 시 Registry에 실재해야 한다
  paramKeys: Readonly<Record<keyof P & string, true>>; // 허용 params 키 전부를 객체 키로 — 빠뜨리면 컴파일 오류; 런타임 목록은 Object.keys(spec.paramKeys)
  permission: Permission;        // 서버의 엔드포인트 ACL. 요청에 싣지 않는다
  requiresScope: boolean;
  context: Partial<Record<ContextKey, Exclude<Capability, 'unsupported'>>>; // 없는 키 = unsupported
  kinds: readonly AssessmentKind[]; // §19 적용 kind. 서버가 정확히 1회씩 응답
  limits?: { maxHours?: number; maxRows?: number }; // too_large 판정 — maxRows는 결과 전체(페이지 아님) 상한, 비페이지 행 배열 엔드포인트(내보내기·탐색)만 선언(#175)
  mergeTimeDomain: boolean;         // §6.3
  readonly _types?: { params: P; data: T }; // 팬텀. 런타임 값 없음
};
export const defineEndpoint = <P, T>(spec: Omit<EndpointSpec<P, T>, '_types'>): EndpointSpec<P, T> => spec;
/** 여러 params 타입의 선언을 한 배열로 받는 자리(단계 2 Registry). `P`가 invariant라 `any`만 모두 받는다. */
export type AnyEndpointSpec = EndpointSpec<any, unknown>;

/** 요청 Context: 선언에서 'apply'인 키와 scopeId만. JSON 배열·camelCase(06 §6.1). */
export type MenuQueryContext = Partial<GlobalContext>;
export function projectContext<P, T>(spec: EndpointSpec<P, T>, g: GlobalContext): MenuQueryContext;

/** 전송되는 요청. permission·kinds·compute·metricVersion 표시값은 없다. */
export type MenuQuery<P = unknown> = { endpoint: string; context: MenuQueryContext; params: P };

// PlatformAdapter에 범용 메서드 하나 추가(§3 판정 규칙 1·2 충족 — Kernel이 부르고 메뉴 어휘가 없다)
//   menuQuery(req: MenuQuery, signal?: AbortSignal): Promise<ApiResponse<unknown>>;
```

- **ContextKey → 필드 대응:** `time`→`from`,`to` · `roomNames` · `condition` · `selection` · `lot`→`lotIds` · `ppid` · `recipe`→`recipeIds` · `metric`→`metricId`,`metricVersion`(쌍으로만). `scopeId`는 `requiresScope`면 항상 싣는다.
- **`reference` 키는 싣지 않는다.** reference는 "보이지만 조회 필터 아님"(06 §6)이므로 조회 요청에 들어갈 이유가 없다. `ExecutionDetail`의 수동 null 처리가 선언으로 대체된다.
- **null과 `[]` 구분 유지:** 현재 코드 관례대로 `null`=제약 없음, `[]`=명시적 공집합(`server.ts:220-222`). URL 표식(`equipmentSelection=none` 등)과 JSON `[]`의 대응은 기존 codec이 맡는다.
- **params:** 페이지 입력(`granularity`, `sort`, `page`, 커서 등). 엔드포인트마다 타입이 있고, 허용 키는 `paramKeys` 객체의 키로 전부 선언한다(런타임 목록은 `Object.keys`). 팬텀 제네릭 `_types`는 런타임에 지워져 키를 알 수 없기 때문이다. 서버는 `paramKeys`에 없는 키를 거부한다(`accessDirectory`·`recordUsage`가 이미 쓰는 "unknown key 거부" 자세와 같음).
- **이기종 엔드포인트 Registry:** `P`는 `paramKeys`에서 반공변이고 팬텀 `_types.params`에서 공변이어서 invariant다. 여러 params 타입을 한 배열로 묶는 단계 2 Registry는 `AnyEndpointSpec = EndpointSpec<any, unknown>`을 쓴다.
- **응답:** 기존 `ApiResponse<T>` 그대로. 새 envelope를 만들지 않는다.

### 2.3 Kernel (`@ap/kernel`)

```ts
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, enabled?: boolean): QueryState<T>;
```

- `spec`에서 `P`를 추론하고 `params`는 `NoInfer<P>`로 검사해, params 리터럴이 선언된 타입을 넓히지 않게 한다.
- `usePlatformQuery` 위에 얹는다. 식별자는 `[revision, user.id, spec.id, projectContext(spec, global), params]` — 적용하지 않는 Context 키가 바뀌어도 결과를 숨기거나 재조회하지 않고, 적용 키가 바뀌면 지금처럼 이전 결과를 숨긴다(06 §19 규칙 유지).
- `spec.requiresScope`이면 현재 Context의 Scope가 `scope.scopeId === global.scopeId`이고 `scope.validatedFor === session`인 상태로 서버 검증을 통과할 때까지 요청하지 않는다. `validatedFor`는 검증 기준 세션 객체의 identity이므로 같은 `user.id`를 유지한 채 세션이 교체돼도 다시 검증한다. `spec.context.time === 'apply'`이면 절대 기간 `from`·`to`가 준비된 뒤 요청한다. `MenuMeta.requiresScope`는 조회 전에 Scope 선택과 서버 검증을 요구하므로, Kernel이 한 번 강제해 페이지마다 게이트를 중복 구현하지 않게 한다.
- 응답 `outcome`이 `ok` 또는 `empty`일 때 `assessments`의 kind 다중집합 누락·중복·초과가 있으면 `error`와 `contract_violation: assessments <got> ≠ declared <want>`를 반환한다. 단, 적용된 집합 키에 요청 값 `[]`가 실리고 응답이 `outcome: 'empty'`, `assessments: []`, `trust: null`이면 06 §6 명시적 공집합으로 그대로 전달한다. 그 외 `ok`·`empty` 응답에는 정확한 kind 다중집합 검사를 적용한다. 다른 outcome은 그대로 전달한다.
- Kernel은 개별 엔드포인트를 모른다(선언을 인자로 받을 뿐).

```ts
export type MenuFetch<P, T> = { ready: boolean; fetch: (params: P, signal?: AbortSignal) => Promise<ApiResponse<T>> };
export function useMenuFetch<P, T>(spec: EndpointSpec<P, T>): MenuFetch<P, T>;
```

- **호출형(단계 9, #128).** 컴포넌트나 사용자 동작이 시작하는 요청 — `PlatformDataTable`의 `loadPage`(06 §15)와 내보내기 — 은 결과 식별자를 호출자가 가진다(표는 Context·사용자·revision으로 페이지를 식별한다). `useMenuFetch`는 `useMenuQuery`와 같은 Scope·기간 게이트(`ready`), 같은 요청 모양(호출 시점의 `projectContext`), 같은 assessment kind 검사를 쓴다. `ready` 전에 부르면 어댑터를 부르지 않고 `error`(`not_ready: …`)로 답해, 게이트를 빠뜨린 페이지도 검증 안 된 Scope를 보내지 못한다.
- **페이징 모양:** `PageQuery`(`page` 0부터·`pageSize`·`sorting`)·`PageResult`·`sortAndPage`는 `@ap/contracts`(`paging.ts`)에 둔다 — 클라이언트 표와 서버(mock 핸들러)가 같은 모양을 쓰고, mock은 `contracts`만 import할 수 있기 때문이다. 엔드포인트 params는 페이지 필터와 `PageQuery`를 펼쳐 싣는다(예: `equipment.master.page`의 `q`·`status`·`maker`·`page`·`pageSize`·`sorting`). cursor 페이징이 필요한 엔드포인트는 자기 params에 둔다(§7).

### 2.4 오류·권한·Scope 처리 (서버 쪽 판정 순서, Candidate)

mock `serve`의 현재 순서(`server.ts:198-253`)를 선언 기반으로 옮긴다.

1. `endpoint` 미등록 → `error`("unknown endpoint").
2. 요청 모양 위반(요청 최상위에 `permission`·`kinds` 같은 알 수 없는 키, GlobalContext 필드가 아닌 Context 키, `projectContext`가 투영하지 않는 Context 키(Q3), 선언이 적용하는 Context 키 누락(Q9), `paramKeys`에 없는 params 키) → `error`. `time`을 적용하면 `from`·`to`는 각각 존재하는 non-null 문자열이어야 한다. `metric`을 적용하면 `metricVersion`은 `metricId` 없이 올 수 없다(06 §6.1; 반대로 `metricId`만 있고 `metricVersion`이 `null`인 초기화 진입점은 허용한다). **클라이언트가 보낸 값으로 권한·kind를 정하는 길 자체를 없앤다.** 요청 Context 키는 `projectContext`가 투영하는 키와 같아야 한다. 적용 키는 값이 `null`이어도 모양이 유효하며(제약 없음), `scopeId: null`도 구조 오류가 아니어서 5단계 Scope 판정이 `forbidden`으로 답한다. 엔진은 검증 후 투영 결과를 `emptyGlobal` 위에 얹으므로 적용하지 않는 필드는 기본 중립값으로 남고 Scope·room·Condition·Selection 판정과 핸들러에 전달되지 않는다. 우리 클라이언트는 `projectContext`가 정확히 그 키만 보낸다.
   - 등록 시점 검증: `createMockAdapter({ endpoints, registry })`(실서버도 같은 검증)는 앱이 주입한 Registry(manifest 목록)로 `spec.menuId`가 실재하는지, `spec.permission`이 Registry의 어떤 메뉴가 선언한 권한 이름인지(오타 방지)를 검사하고, 둘 중 하나라도 아니거나 `id`가 이미 등록된 것과 겹치면(여러 메뉴 패키지의 배열을 합칠 때 생기는 중복) 등록을 거부한다. 또 엔드포인트가 `apply`로 선언한 Context 키를 소유 메뉴 manifest가 `apply`로 선언하지 않았으면(reference·unsupported·없음) 등록을 거부한다. 소유 메뉴 manifest가 Scope를 요구하는데(`requiresScope`) 엔드포인트가 `requiresScope: false`면 그것도 거부한다(`projectContext`가 `scopeId`를 빼서 5단계의 사이트·room 부여 검증이 건너뛰어진다). **등록 규칙 6:** `requiresScope: false` 엔드포인트는 site에 묶인 Context 키(`roomNames`·`condition`·`selection`·`lot`·`recipe`·`ppid`, 06 §22)를 `apply`할 수 없다. `time`·`metric` 적용은 이 규칙에 막히지 않는다. **등록 규칙 7(#175):** `limits.maxRows`를 선언하면 값은 양의 정수여야 하고, `page`·`pageSize` params를 가진 페이지 엔드포인트에는 선언할 수 없다(행 상한은 결과 전체 기준이라 페이지로 이미 묶인 엔드포인트에는 무의미). `mock-server`는 메뉴를 모르므로 manifest는 앱이 넘긴다. **엔드포인트 권한은 메뉴 권한과 같을 필요가 없다**(Q5): manifest 권한은 메뉴 노출·진입, 엔드포인트 권한은 서버의 데이터 접근 판정이다. 서버는 요청이 아니라 이 선언 사본을 믿으므로 엔드포인트 권한은 엔드포인트 PR에서 데이터 소유 기준으로 리뷰한다.
2a. params **값** 검증(#123): 모양 규칙으로 표현할 수 없는 값(예: 계열에 없는 `metricVersion`)은 엔드포인트의 `validate`가 오류 문장을 돌려주면 `error`. 알 수 없는 params 키처럼 잘못된 요청이지 빈 결과가 아니다. 실행 상세 occurrence는 `cycle_time` 계열 버전(3·4)만 받는다 — 예전엔 `v999`가 v3 계산 위에 라벨만 붙어 나갔다.
3. `spec.permission`을 세션으로 검사 → `forbidden`. 응답 시나리오보다 우선(현재와 같음).
4. (mock만) 시나리오 early return.
5. `requiresScope`면 Scope → room grant → Condition → Selection(현재 `resolveEquipment`) → `forbidden`.
6. `limits.maxHours` → `too_large`.
7. 명시적 공집합 → `empty`.
8. `mergeTimeDomain`이면 §6.3 판정.
9. 핸들러 실행.
10. 핸들러가 돌려준 결과 전체(페이지 아님)가 `limits.maxRows`를 넘으면 데이터 없이 `too_large`; 선언했는데 배열이 아니면 계약 `error`. ids로 거른 뒤 크기가 기준(#175, 체크리스트 §3-9).
11. `spec.kinds`로 `assessments` 채움, `trust`는 서버가 붙임(`metricVersion` 표시값도 서버가).

경계: **권한 판단·kind 목록·계산·원천 데이터는 서버 절반에만 있다.** 클라이언트 번들에 남는 것은 선언(권한 이름·kind 이름·한도 숫자)뿐이고, 서버는 요청이 아니라 자기 쪽 선언 사본을 믿는다. 실서버에서 FastAPI가 같은 선언을 어떻게 공유하는지는 §8 Q2.

### 2.5 패키지 배치와 의존 방향

| 위치 | 내용 | import |
| --- | --- | --- |
| `@ap/contracts` `src/menu-query.ts` | `EndpointSpec`, `AnyEndpointSpec`, `defineEndpoint`, `MenuQuery`, `MenuQueryContext`, `projectContext`(순수 함수), `PlatformAdapter.menuQuery` | 없음(현행 규칙) |
| `@ap/kernel` | `useMenuQuery` | `contracts` |
| `@ap/mock-server` | 범용 엔진 `serveEndpoint(endpoints: ReadonlyMap<string, AnyMockEndpoint>, req, signal?, opts?)` + `createMockAdapter({ endpoints: readonly AnyMockEndpoint[], registry })`. `MockEndpoint = { spec, handle, isEmpty?, source?, metricVersion? }`; `world`·`jobs`는 그대로 | `contracts` |
| `menus/<g>/src/endpoints.ts` | 그 메뉴의 `defineEndpoint(...)` 목록과 params/data 타입 | `contracts` |
| `menus/<g>/src/mock/` → 서브패스 `@ap/menu-<g>/mock` | 엔드포인트별 mock 핸들러(지금의 `compute`, `productivityData.ts`·`cycleData.ts` 계산, `NOTICES`) | `contracts`, `mock-server`, 자기 `endpoints.ts` |
| `menus/<g>/src/pages/*` | `useMenuQuery(endpoint, params)` | `contracts`, `kernel`, `components`, `ui`, 자기 `endpoints.ts`. **`mock/`·`mock-server` 금지** |
| `apps/platform-web/src/main.tsx` | `createMockAdapter({ endpoints: [...analyticsMock, ...], registry })` 주입 | 전부 |

- 새 역방향 간선 없음: `contracts → kernel → (menu pages)`, `contracts → mock-server → (menu mock)`, 앱이 둘을 조립. `menu → mock-server` 간선은 이미 있고(`api.ts`), 허용 파일 범위만 `src/api.ts` → `src/mock/**`로 바뀐다.
- 앱 전용 메뉴 서브패스는 선례가 있다: `@ap/menu-notice-voc/feedbackops-origin`(`tooling/eslint/src/index.js:22`). `/mock`도 같은 방식으로 `main.tsx`만 import하게 lint로 막는다.
- 실서버 전환 때 앱은 `createMockAdapter` 대신 HTTP 어댑터를 주입하고 `/mock` 서브패스를 import하지 않는다 → 계산 코드는 운영 번들에 들어가지 않는다.

## 3. `PlatformAdapter`에 넣어도 되는 것 / 안 되는 것 (판정 규칙, Candidate)

**넣어도 된다** — 아래 1 또는 2를 만족하고, 3을 만족한다.

1. `kernel`·`components`·`shell`이 직접 부른다(예: `evaluateSelection`, `listAnnotations`, `getEntity`, `menuQuery`).
2. 06 §4 Kernel 책임의 저장소를 읽거나 쓴다 — 세션·권한·Scope, Registry, 메뉴 활용률 계측, 감사, 오류 보고. 화면이 운영 콘솔 메뉴에 있어도 저장소가 Kernel 것이면 해당(§24 적용 범위: Kernel 책임은 반복 기준 밖).
3. 입출력 타입에 특정 메뉴·외부 제품의 도메인 어휘가 없다(FeedbackOps DTO, 설비·지표 필드 등). `EntityRef`처럼 불투명 id는 허용.

**넣으면 안 된다** — 한 메뉴의 도메인 데이터 조회, 전역 Context 위의 분석 조회, 외부 제품 데이터 투영. 이것들은 메뉴 엔드포인트(§2)로 간다.

| 현재 멤버 | 판정 | 이전 방법 |
| --- | --- | --- |
| `auditTrail` | **유지** | 감사는 Kernel 책임(규칙 2). 호출자가 admin 메뉴뿐이어도 저장소가 플랫폼 소유. |
| `entityAudit` | 유지 | 감사 저장소 + `AuditTimeline`(공통 컴포넌트) 소비. |
| `usageSummary` | 유지 | 06 §4 계측. |
| `accessDirectory` | **유지(조회 투영으로 고정)** | 권한·Scope 저장소(규칙 2). 단 원천이 #98에 달려 있어 쓰기 메서드는 추가하지 않는다. #98 영향은 §9. |
| `myVocHistory`, `mySurveyHistory` | **이전(완료, #131)** | FeedbackOps 제품 데이터의 사용자 투영이고 06 §4가 "VOC 상태 전이 규칙"을 Kernel 밖으로 둔다. `menus/notice-voc/src/endpoints.ts`에 `noticeVoc.myVocHistory`(params `{ cursor: string | null }` — 첫 페이지는 `null`, 생략은 발급한 적 없는 커서로 보고 `Invalid cursor`; context 없음, `requiresScope: false`, kinds `[]`, 서버 쪽 `mart: false`), `noticeVoc.mySurveyHistory`(kinds `['respondent_history']`)로 선언. `packages/mock-server/src/my-voc.ts`의 핸들러 본문과 픽스처는 `menus/notice-voc/src/mock/`으로. |
| `MyVocStatus`, `MyVocItem`, `MyVocQuery`, `MyVocPage`, `MySurvey*` | **이전** | `@ap/contracts` 루트에서 빼서 `menus/notice-voc/src/endpoints.ts`로. 현재 사용처는 `menus/notice-voc/src/voc-status.ts`, `pages/MyVocHistory.tsx`, `voc-status.test.ts`와 mock뿐이라 메뉴 밖 소비자가 없다. |
| `AssessmentKind`의 `'respondent_history'` | **유지(결정됨, Q6)** | kind 어휘는 플랫폼 소유(06 §19)라 contracts에 남는다. 두 번째 소비자가 나오면 재검토(§8 Q6). |
| 나머지(`session`·`validateScope`·`publishedMetrics`·`contextOptions`·`evaluateSelection`·`getEntity`·`defaultRangeTo`·`recordUsage`·`reportClientError`·`listAnnotations`·`saveAnnotation`·`subscribe`) | 유지 | 규칙 1 또는 2. |

`feedbackops-link.ts`(contracts)는 제품 간 딥링크 계약(06 §22 외부 hop)이라 이 판정 대상이 아니다.

## 4. 메뉴 생성기(`tooling/gen-menu`) 변경

> 단계 8(#126) 반영 완료 — 생성기가 `src/endpoints.ts`·`src/mock/index.ts`·`./mock` export·`useMenuQuery` 페이지·`main.tsx` mock 마커 배선을 만들고, `--remove`는 바이트 단위 inverse로 되돌린다. `manifest.test.ts` 템플릿에는 엔드포인트 소유 검사(id `<group>.` 접두사, `menuId` = manifest id)를 추가했다.
- `src/api.ts`(`templates.ts:55`) 대신 `src/endpoints.ts`(표본 엔드포인트 1개: `permission: SCAFFOLD_PERMISSION`, `requiresScope: false`, context 없음, kinds `[]`)와 `src/mock/index.ts`(`{ ready: true }` 핸들러)를 만든다.
- 페이지 템플릿(`templates.ts:193-208`)은 `serve({...compute})` 대신 `useMenuQuery(endpoint, {})`.
- 생성 패키지 `package.json` `exports`에 `./mock` 추가. `@ap/mock-server` 의존은 유지(mock 절반이 씀).
- 앱 연결이 3줄+의존 1줄에서 **1줄 더**: `main.tsx` 마커 영역에 `/mock` import와 `endpoints` spread. `--remove`·`ownership`·`markers`·probe(`tooling/gen-menu/scripts/probe.ts`)를 같이 바꾼다.
- `SCAFFOLD_PERMISSION`(`templates.ts:25`)은 manifest와 엔드포인트가 계속 한 상수를 쓴다(이미 "둘이 어긋나지 않게" 의도로 한 곳에 있음).
- `manifest.test.ts` 템플릿에 "엔드포인트 id가 `<group>.` 접두사" 정도의 검사 1개를 추가할지는 구현 때 판단.

## 5. 마이그레이션 범위

### 5.1 비교

| | 안 1: 1–2개 먼저 검증 | 안 2: 견본 전부 한 번에 |
| --- | --- | --- |
| 실제 규모 | 화면 2개, 엔드포인트 5개 | 패키지 4개(serve 18곳) + notice-voc 이전. `admin`·`master-data`는 대상 아님 — "7개 전부"는 실제로 5개 패키지 |
| 장점 | 계약 실수를 2곳에서 발견하고 고친다. PR이 작다(루트 규칙 "PR은 한 단계씩") | 경로가 즉시 하나가 된다 |
| 단점 | 이행 기간에 경로가 하나 더 는다(이 이슈가 지적한 문제의 일시 악화) | 계산 이전(`productivityData.ts`·`cycleData.ts`)과 계약 결함이 18곳에 복제된다. 리뷰 불가능한 크기 |
| 완화 | 검증 직후 생성기를 먼저 바꾸고, lint로 `serve` 신규 사용을 막고, 나머지 이전을 이슈로 줄 세운다 | — |

**추천: 안 1(잠정 추천에 동의).** 단 "1–2개로 끝"이 아니라 "2개로 계약 검증 → 사람 확인 → 생성기 전환 → 나머지 패키지별 이전 → `serve` 제거"까지가 #100의 완료 조건이어야 한다. 목표가 경로 하나이므로 부분 이전 상태로 멈추면 안 된다.

### 5.2 검증 메뉴 (추천)

1. **`productivity-overview`** — 가장 어려운 apply 경로: 위젯 4개 병렬, `time`·`roomNames`·`condition`·`selection`·`ppid`·`recipe` apply, `time_domain` 포함 kind, `maxHours` → `too_large`, partial widget failure, Data Trust.
2. **`execution-detail`** — reference 경로: 모든 Context가 `reference`라 `scopeId`만 적용되는지, 목적지 id(`equipmentId`·`entityType`·`anchor`)를 params로, 분석 Context와 분리하는지(06 §6.1·§22). 지금 수동 null 처리(1.3-4)가 없어지는 게 성공 기준. metric이 reference인 화면이 계산 정의(버전)를 고를 때는 화면이 해석한 버전을 params로 넘긴다(필터가 아님).

둘 다 `@ap/menu-analytics`라 여러 패키지의 mock 등록은 검증하지 못한다. 이건 생성기 전환 단계의 probe(임시 그룹 패키지 생성)가 확인한다. 페이징 params 모양이 걱정되면 3번째로 `equipment-master`(PlatformDataTable `loadPage`, 06 §15)를 추가할 수 있다.

**다섯 갈래 중 검증하는 곳:** Kernel 기능(전역 Context 직렬화, 권한·Scope 매 요청 재검증, 요청 수명주기), 메뉴간 연결(§22 목적지 id ↔ 분석 Context 분리 — `execution-detail`), 공통 컴포넌트(`DataTrustIndicator`·`QueryView`가 응답을 그대로 소비하는지). 레이아웃(Overview·Analysis archetype)은 부수 확인이고, 차트 계약은 검증 대상 아님.

## 6. Premature Platformization(§24) 검토

**지금 만든다** — 06 §4 Kernel 책임(전역 Context·권한·Scope·서버 경계)이라 메뉴 반복을 기다리지 않는다. 게다가 `serve` 패턴은 이미 4개 패키지·18곳에서 반복돼 반복 기준도 충족한다.

- `EndpointSpec`·`MenuQuery`·`projectContext`, `PlatformAdapter.menuQuery`, `useMenuQuery`
- mock 범용 엔진(`serveEndpoint`)과 `createMockAdapter`
- lint 경계(`mock-server`는 `src/mock/**`만, pages → mock 금지, `/mock`은 `main.tsx`만)
- 생성기 전환
- VOC 두 메서드의 어댑터 밖 이전

**소비자가 늘 때까지 미룬다**

- 메뉴 쓰기(mutation) 엔드포인트 — 현재 메뉴 쓰기 소비자 없음(`saveAnnotation`은 Kernel/차트 계약 쪽).
- 페이징 공통 추상화(cursor vs offset) — `auditTrail`·`accessDirectory`는 offset, `myVocHistory`는 cursor로 이미 다르다. 엔드포인트 params에 둔다.
- 여러 위젯 요청 묶기(batch), 스트리밍, 장기 작업.
- 공개 스키마 내보내기/codegen(OpenAPI·JSON Schema) — 실서버(FastAPI) 착수 때(§8 Q2).
- manifest ↔ 엔드포인트 Context **역방향** 교차 검증(manifest가 `apply`한 키를 어떤 엔드포인트도 apply하지 않으면 거부) — 이전 메뉴가 3개 이상 되면. 정방향(엔드포인트가 manifest보다 넓게 `apply`하면 등록 거부)은 등록 검증에 포함한다(§2.4).

## 7. 대안과 기각 이유

| 대안 | 내용 | 기각 이유 |
| --- | --- | --- |
| A. 메뉴별 타입 포트 주입 | 메뉴가 `VocPort` 같은 인터페이스를 정의하고 앱이 `PlatformProvider ports={{ voc: impl }}`로 주입, 화면은 `useMenuPort(VOC_PORT)` | 새 메뉴마다 앱 주입 지점 + 실서버 구현이 하나씩 는다. 실서버 구현은 결국 엔드포인트별 `fetch`라 범용 전송으로 충분하다. 권한·kind를 선언 데이터로 공유하는 효과(클라이언트 kind 검사, 공개 스키마 산출물)도 약하다. 쓰기처럼 조회 모양에 안 맞는 메뉴 기능이 생기면 그때 재검토. |
| B. `PlatformAdapter`에 메뉴 메서드 계속 추가 | 지금 VOC처럼 | Kernel 포트가 메뉴 수에 비례해 커지고 contracts가 메뉴 도메인 어휘를 흡수한다(이 이슈의 원인). |
| C. 현행 유지, 메뉴 `api.ts`만 교체 지점 | `api.ts`를 나중에 HTTP로 바꾼다(platform-packages §5의 원래 설명) | 권한·kind·계산·원천 데이터가 클라이언트 인자로 남아 교체가 불가능하다(1.3-3). 공개 계약이 생기지 않는다. |
| D. 선언을 contracts에 중앙 집중 | 모든 엔드포인트 선언을 `@ap/contracts`에 둔다 | contracts가 메뉴 목록을 알게 된다(06 §3 "플랫폼은 개별 메뉴를 알지 못한다"). manifest를 메뉴가 소유하는 것과 같은 이유로 선언도 메뉴가 소유. |
| E. mock 핸들러를 `@ap/mock-server` 안에 | 메뉴 계산을 mock-server로 옮김 | mock-server가 메뉴 선언 타입을 import해야 해서 `mock-server → menu` 역방향 간선이 생긴다. |

## 8. 질문과 결정 상태 (미해결: Q2)

- **Q1.** (결정됨) 2.1의 방향(범용 요청 + 메뉴 선언 + 전송 하나 주입)을 채택한다. 대안 A(메뉴별 포트 주입)는 조회 모양에 안 맞는 기능이 생기면 재검토.
- **Q2.** 실서버 착수 후 선언의 원본은 어디인가: TS 선언 → FastAPI(Pydantic) codegen, 아니면 FastAPI OpenAPI → TS codegen. `PLATFORM_REQUIREMENTS.md:141`과 06 §6.1("형식은 Candidate")이 여기에 걸린다.
- **Q3.** (결정됨 2026-10-01: 거부) 선언이 apply하지 않는 Context 키가 요청에 오면 서버가 거부(error)할지 무시할지. 추천: 거부 — 클라이언트 투영 버그를 드러낸다.
- **Q4.** (결정됨 2026-10-01: 추가) 06 §5 "메뉴가 선언하는 정보"(Decided 표)에 "조회 엔드포인트(권한·적용 Context·적용 kind)"를 추가하나. 06 변경이라 플랫폼 레벨 결정.
- **Q9.** (결정됨 2026-10-01: 거부, #117) 적용하는 Context 키가 요청에 없거나 null이면? 지금은 `time` 적용 + `limits.maxHours` 엔드포인트에 `to`를 빼면 "기간 없음"으로 한도 검사를 건너뛴다(`serve()`와 같음). 추천: 적용 키는 반드시 있어야 한다(없으면 error) — Q3와 같은 "요청 모양은 선언과 정확히 일치" 원칙, 단계 7a에서 함께.
- **Q10.** (결정됨 2026-10-01: 등록 규칙 6 — site 종속 키 여섯 개, #117) `requiresScope: false` 엔드포인트가 `roomNames`·`condition`·`selection`을 apply해도 되나? 지금은 등록 검증을 통과하고 site·room 부여 검증 없이 핸들러에 간다. 추천: 등록 규칙 6으로 금지(§2.4 규칙 목록 변경이라 플랫폼 레벨 결정).
- **#117 게이트 질문.** 명시적 공집합은 원천 조회가 실행되지 않아 `outcome: 'empty'`, `assessments: []`, `trust: null`로 반환하는 의도적 예외이며, 06 §19의 “`empty`는 선언한 kind를 모두 담는다”는 규칙과 다르다. 06 §19에도 이 예외를 적을지 게이트에서 확인한다 → (결정됨 2026-10-01: 06 §19에 예외로 명시, 단계 12)
- **Q5.** (결정됨, 개정) 엔드포인트 권한은 데이터 접근 권한이라 메뉴 manifest 권한과 달라도 된다. 근거 사례: `menus/home/src/index.ts`는 `platform:view`, `OperationsHome.tsx`의 공지 조회는 `notice:view`. 등록 시에는 `menuId`와 권한 이름의 실재만 검사한다.
- **Q6.** (결정됨) 메뉴 하나만 쓰는 assessment kind(`respondent_history`)는 플랫폼 어휘에 유지한다. 두 번째 소비자가 나오면 메뉴 확장 어휘 허용 여부를 재검토한다.
- **Q7.** (결정됨) 마이그레이션 범위(5.1) 승인: 2개 검증 → 확인 → 생성기 → 나머지 패키지별(각각 이슈). 이 과정에서 기존 화면 8개를 차례로 건드리므로 루트 규칙("메뉴 화면 3개 이상 연속 작업 전 범위 확인")에 따라 여기서 범위를 확인받았다. VOC 이전은 #100에 포함한다.
- **Q8.** (결정됨) `accessDirectory`를 Kernel 포트에 두는 판정(§3 규칙 2)에 동의한다.

## 9. #98 영향 (권한 부여·회수의 원천)

**추천: 선택지 3(분리)을 방향으로 채택하되, 지금 확정할 수 있는 절반만 확정한다.**

- **room_name 부여와 05의 "메뉴 활용률 열람 개별 부여"는 플랫폼 메타 DB 소유로 지금 정할 수 있다.** 근거: room_name은 이 플랫폼의 권한 축이고([ADR-0005](../adr/0005-scope-room-name-line-independent.md)) 사내 IdP가 이 축을 안다는 근거가 없다. [01 아키텍처](../01_architecture_and_data_contract.md) 도식이 이미 "플랫폼 메타 DB(사용자/권한/…)"를 둔다. 05 열람 권한 결정은 "기존 역할 체계 위에 얹는다"고 해서 IdP에 새 그룹을 요구하지 않는다.
- **역할 소속(누가 운영 콘솔·엔지니어인가)의 원천은 SSO 사양이 나올 때까지 보류.** #35는 닫혔고 구조(AuthProvider 추상화, 서버 세션, 매 요청 백엔드 재검증)는 Decided지만, 실제 IdP 프로토콜·그룹 claim 제공 여부는 여전히 Open이다([05](../05_roadmap_and_open_questions.md) Open 행). IdP가 그룹 claim을 주면 3, 안 주면 역할도 메타 DB로 가서 사실상 1이 된다. 어느 쪽이든 room_name 절반은 바뀌지 않는다.
- **선택지 2 기각 사유:** 사내 권한 시스템이 room_name 부여와 개별 열람 부여를 담는지 확인된 바 없다(미확인). 담지 않으면 05 결정을 구현할 수 없다.
- 확인 범위: 위 판단은 docs(05·06 §9.1·01·03·ADR-0005)와 이슈 #35·#98 본문만 읽은 것이다. 사내 권한 시스템 실사양은 확인하지 못했다.

**`accessDirectory` 계약에 주는 영향**

- 조회 모양(`AccessPrincipal`: 역할·권한·사이트별 부여 room)은 어느 안이든 유지된다. 선택지 3이면 행의 필드마다 원천이 다르므로, (Candidate) 필드 출처 표시(`role`은 upstream, `sites`는 platform)를 나중에 붙일 수 있다 — 지금은 소비자가 없어 미룬다.
- 쓰기 포트가 생긴다면 room_name 부여·회수만이고, §3 규칙 2(권한 저장소 = Kernel 책임)에 따라 **메뉴 엔드포인트가 아니라 `PlatformAdapter`**에 둔다. 역할 소속 쓰기는 upstream이면 영원히 없다.
- `accessDirectory` doc 주석(`adapter.ts`)·`mock-server/src/access.ts`·`menus/admin/src/pages/AccessDirectory.tsx`의 "#98 대기" 문구는 이 결정에 맞춰 갱신했다: room_name·개별 부여의 소유는 플랫폼 메타 DB로 확정, 역할 소속 원천만 Open.

**#100 설계에 주는 영향:** 없음에 가깝다. 메뉴 엔드포인트의 권한 판정(2.4의 3·5단계)은 서버가 세션·부여 저장소를 읽는 것이고 원천이 IdP든 메타 DB든 요청 모양은 같다. 따라서 #100은 #98 결정을 기다리지 않고 진행할 수 있다.

## 10. 구현 이슈 분할 (각 단계 작게, 검증 포함)

| # | 단계 | 검증 |
| --- | --- | --- |
| 1 | contracts: `menu-query.ts`(`EndpointSpec`(`menuId`·`paramKeys` 포함)·`defineEndpoint`·`MenuQuery`·`projectContext`). `PlatformAdapter.menuQuery`는 여기서 추가하지 않는다(구현체·테스트 fixture가 typecheck에서 깨지므로 단계 2로) | contracts 단위 테스트: capability별 투영, `null`/`[]` 보존, metric 쌍은 함께만, reference 키 제외. React import 0(lint) |
| 2 | mock-server: `serveEndpoint` 엔진(현 `serve` 단계 재사용) + `createMockAdapter({ endpoints, registry })`. **`PlatformAdapter.menuQuery(req, signal?)` 멤버를 여기서 추가**하고 mock 어댑터와 기존 `PlatformAdapter` 테스트 fixture 전부를 같은 PR에서 갱신한다(typecheck 유지). 선언이 apply하지 않는 Context 키는 해석·핸들러에 넘기지 않는다 | 요청에 `permission`/`kinds` 키 → error, reference로만 선언한 `roomNames`·`condition`·`selection`이 실려 와도 결과가 그 키가 없을 때와 같음(회귀 테스트), `paramKeys` 밖 params 키 → error, 미등록 id → error, `menuId`·권한 이름이 Registry에 없거나 `id`가 중복이거나 manifest보다 넓게 `apply`하거나 manifest의 Scope 요구를 풀면 등록 거부, kind 정확히 1회, 권한이 시나리오보다 우선. 기존 `time-domain`·`explicit-empty`·`menu-permission` 테스트 통과 수 유지 |
| 3 | kernel: `useMenuQuery` | fixture 어댑터: 역할 전환 즉시 이전 결과 숨김, apply 아닌 키 변경은 재조회 없음, apply 키 변경은 숨김. Kernel 변경이므로 `pnpm e2e` |
| 4 | lint: `mock-server`는 `src/mock/**`(+ 이행 중 `src/api.ts`), pages → `mock/` 금지, `@ap/menu-*/mock`은 `main.tsx`만 | `tooling/eslint` `boundaries.test.ts`에 위반 사례 추가(수정 전 실패) |
| 5 | `productivity-overview` 이전(엔드포인트 4개, 계산 → `src/mock/`) | 기존 테스트, `pnpm dev`에서 시나리오 normal/partial/too_large/forbidden/역할 전환, `pnpm e2e` 보고서 |
| 6 | `execution-detail` 이전(수동 null 처리 제거) | returnTo 왕복·§22 e2e, occurrence 조회가 90일 Context에서도 too_large가 아님 |
| 7 | **사람 확인 게이트** — 1–6 결과로 §8 Q3·Q4·Q9·Q10(#117) 답 받기 (2026-10-01 완료) | — |
| 7a | 게이트 결정 반영(#125): Q3 비적용 키 → error, Q9 적용 키 누락 → error, Q10 등록 규칙 6 | 각 거부 규칙 테스트(수정 전 실패), 기존 테스트·`pnpm e2e` |
| 8 | gen-menu 전환(§4) | gen-menu 테스트 + `scripts/probe.ts`(임시 그룹이 루트 네 명령 통과 = 다중 패키지 mock 등록 확인) |
| 9 | 나머지 이전(범위는 결정 기록 "단계 9 범위"): `equipment-master` + Kernel `useMenuFetch`·contracts 페이징 모양(#128, 완료), `cycle-time`(계산 → `src/mock/cycle.ts`, 지표 버전은 서버가 적용된 metric 쌍에서 해석, 내보내기 엔드포인트, `src/mock/** → ../pages/**` 임시 lint 허용 종료, analytics `api.ts` 삭제)과 `home`(`NOTICES` → mock, 공지 대상 사이트는 params `targetScopeId`)(#127·#130, 완료), `metrics`(지표 카탈로그·판정을 `src/mock/catalog.ts`로, 쌍 판정·카탈로그 페이지·내보내기·정의·사용처·이력 엔드포인트) + #123 params 값 검증 훅(#129, 완료 — `LEGACY_SERVE_PATHS`가 비었다) | 각 패키지 테스트 + 브라우저 + `pnpm e2e` |
| 10 | VOC 이전: 두 메서드 어댑터에서 제거, `MyVoc*` 타입 메뉴로 (#131, 완료 — 엔진에 mart가 아닌 원천 `mart: false`(Trust 없음, mart 개발 시나리오 비적용)·핸들러 `actor`·`MockRequestError`(데이터로만 판정하는 잘못된 요청, 예: 다른 사용자 커서)를 추가. `noticeVoc.myVocHistory` params는 `{ cursor: string \| null }`) | `MyVocHistory.test.tsx`, `voc-status.test.ts`, contracts에서 `MyVocStatus` grep 0 |
| 11 | `serve` 공개 export·`src/api.ts` 규칙 제거 (#132, 완료 — `ap/no-new-serve` 규칙·`LEGACY_SERVE_PATHS` 삭제, api.ts lint 예외를 에러 fixture로 고정) | `grep -rn "serve" menus` 0, lint 규칙에서 api.ts 예외 삭제 |
| 12 | (#133, 완료) 문서: platform-packages §3 규칙 3·§4·§5, `menus/AGENTS.md`, `packages/AGENTS.md`, 06 §5(Q4 결과), `PLATFORM_REQUIREMENTS.md:141` 상태, ROADMAP | 각 PR의 "문서 갱신" 체크 |
