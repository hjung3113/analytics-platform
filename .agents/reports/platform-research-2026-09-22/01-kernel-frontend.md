# 담당 A — 플랫폼 기능·프론트엔드·OSS 대체 조사

- 조사일: 2026-09-22 (Asia/Seoul)
- 범위: Platform Kernel, Menu Registry, 전역 Context/URL, 데이터 상태, 표·차트·접근성, OSS 대체 경계
- 소유 산출물: 이 파일만 수정했다.
- 검증 경계: 문서·소스·공식 프로젝트 문서를 읽어 설계 선택을 제안했다. 애플리케이션 구현, 의존성 설치, 벤치마크, 실제 API/DB/권한 연동은 수행하지 않았다.

## 1. 핵심 권고

1. **공개 URL/Context codec과 Menu Registry를 OSS 밖의 Platform Kernel 계약으로 먼저 고정한다.** TanStack Router는 탐색과 search param 전달에 쓰되 URL 의미, canonicalization, 권한, 미지원 Context의 보존은 소유하지 않는다.
2. **현재 FeedbackOps에 이미 있는 TanStack Router + TanStack Query + Zod 흐름을 선택 후보의 출발점으로 삼는다.** 다만 제품 코드를 플랫폼에 그대로 복사하지 말고, 순수 codec, declarative menu manifest, query generation gate, response trust model을 새 공통 경계로 만든다.
3. **표는 TanStack Table + TanStack Virtual, 차트는 Apache ECharts adapter를 우선 POC한다.** 서버 필터·정렬·집계·downsample과 의미론적 table fallback은 플랫폼 책임으로 둔다. 라이브러리가 성능을 보장한다고 가정하지 않는다.
4. **UI primitive는 한 계열만 채택한다.** 현재 실제 자산인 Radix primitive + checked-in shadcn-style wrapper를 우선 후보로 두고, Base UI 또는 React Aria로 바꾸려면 접근성·컴포넌트 범위 POC를 먼저 통과시킨다.
5. 가장 큰 실패는 **라이브러리의 fallback, clamp, 자동 retry/cache, guest embed 권한을 제품 계약으로 오인하는 것**이다. Context가 바뀐 뒤 이전 결과가 화면에 남거나 URL 값이 조용히 보정되는 경우를 merge blocker로 취급한다.

이 권고는 문서 계약(특히 `docs/06_platform_ui_contract.md`)과 현재 코드 자산을 연결하는 제안이다. `docs/05_roadmap_and_open_questions.md`가 라이브러리 선택과 POC를 Candidate/Deferred로 남겨 둔 상태를 구현 완료로 바꾸지는 않는다.

## 2. 현행 상태

### 2.1 문서로 확정된 계약

- `docs/INDEX.md`는 `docs/06_platform_ui_contract.md`를 전역 UI/URL/Scope/Context/IA/확장 계약의 authoritative 문서로 지정하고, `docs/04_frontend_ui_ux.md`를 구현 후보·조사 문서, `docs/05_roadmap_and_open_questions.md`를 결정 상태 문서로 분리한다.
- `docs/06_platform_ui_contract.md`는 URL이 scope, half-open wall-clock range `[from,to)`, equipment/lot set, `metricId+metricVersion`, page state와 occurrence anchor를 소유한다고 정한다. URL은 `v`와 엄격한 형식을 사용하며 malformed 값·중복·metric pair 불일치를 조용히 고치거나 clamp하지 않는다. URL의 `scopeId`는 권한이 아니므로 서버가 매 요청 재검증해야 한다.
- 같은 문서는 URL을 이긴 session fallback을 금지하고, unknown key는 보존하되 query에는 사용하지 않으며, 등록됐지만 현재 적용할 수 없는 Context는 보존하고 미지원 상태로 표시하도록 정한다. Context 변경 중 이전 결과가 새 Context 아래 나타나지 않아야 한다.
- Shell은 `title`, `description`, `primaryAction`, `secondaryActions`, `contextExtension`, `content`, `dataTrustSummary` 슬롯을 제공한다. Menu Registry, supported Context, route/deep link, permission/Scope, data trust, context transfer가 Platform Done의 필수 축이다.
- 응답은 `outcome`과 `assessments[]`의 두 층을 사용한다. `source`와 `observedAt`이 trust 근거이며, `unknown`은 추론할 수 없다는 뜻이다. empty, partial, stale, loading은 서로 다른 상태이고 목록 건수나 UI timeout으로 원인을 만들어내면 안 된다.
- `docs/04_frontend_ui_ux.md`는 React+TypeScript+Tailwind, TanStack Query/Zustand, TanStack Router, TanStack Table/Virtual, ECharts 등을 후보로 적고 있으며 “실제 성능·CJK·대규모 parser benchmark는 아직 없음”을 명시한다. 이 문서는 구현 승인서가 아니다.
- `docs/05_roadmap_and_open_questions.md`는 URL/Context 계약, stale result 방지, wall-clock/half-open time, polling과 server-completed generation, 동일 Postgres/read-only schema, late-arrival mechanism을 Decided로 두지만 라이브러리·POC·saved view/widget framework를 Candidate 또는 Deferred로 남긴다.

### 2.2 현재 구현으로 확인된 것

- 플랫폼 루트에는 별도 frontend package나 실행 가능한 App Shell이 없다. 현재 `HEAD`는 `e999c997a4282e9b88b6fb3df36c6212b8adf2e4`이며, 플랫폼 작업 트리는 연구 보고서 디렉터리 외 변경이 없다.
- `products/feedbackops`는 gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`를 가리키는 독립 submodule이다. 해당 제품의 규칙과 자산을 플랫폼 공통 계약으로 소급 적용하지 않는다.
- FeedbackOps frontend manifest에는 다음 버전이 고정되어 있다: `@tanstack/react-router` 1.170.1, `@tanstack/react-query` 5.62.7, React 19.0.0, Zod 3.25.67, Zustand 5.0.2, Tailwind 3.4.17. UI package에는 Radix component wrapper와 local shadcn-style source가 있다. 이는 재사용 후보라는 뜻이지 플랫폼 채택 상태라는 뜻은 아니다.
- `products/feedbackops/apps/frontend/src/main.tsx`는 `QueryClientProvider`와 TanStack Router를 실제로 조립한다. `src/lib/api/client.ts`는 fetch에 `AbortSignal`을 전달하고 Zod 성공 payload를 검증한다. 따라서 cancellation과 schema validation의 제품 선례는 있으나 generation guard, platform-wide response envelope, public URL codec은 확인되지 않았다.
- `src/routes/_authed/vocs.tsx`와 `admin/permissions/requests.tsx`는 route-local Zod search schema와 `validateSearch`를 사용한다. 이는 URL state를 typed route로 다룰 수 있음을 보여 주지만 각 schema가 제품 route에 묶여 있어 Platform Kernel의 공통 codec 또는 Menu Registry로 볼 수 없다.
- `src/routes/_authed.tsx`의 `NAV_TREE`는 rail/domain별 hard-coded navigation이다. `AppFrame.tsx`는 rail/sidebar/outlet/detail panel을 조합하며 스스로 “shell이 아니다”라고 설명한다. 이 구조는 전환 시 참고할 수 있으나 declarative registry, scope permission, supported Context 계약을 충족한다는 증거는 없다.
- 현재 FeedbackOps manifest/lock에는 ECharts, Plotly, Recharts, AG Grid, TanStack Table/Virtual, Base UI, React Aria가 확인되지 않았다. 차트·대규모 표·대체 primitive는 미구현/미측정 상태다.

### 2.3 아직 모르는 것

- 실제 플랫폼 runtime, API schema artifact, server query generation, 권한/Scope provider, CJK 데이터량, 동시 사용자와 대표 표 row 수가 정해지지 않았다.
- TanStack Query의 retry/polling 값, cache isolation key, generation의 서버 발행 시점과 late-arrival horizon은 결정되지 않았다. 숫자 latency·throughput·row threshold는 측정 전에는 권고 목표가 아니다.
- ECharts와 table virtualization의 실제 frame time, memory, bundle size, screen reader 동작은 이 조사에서 측정하지 않았다. 공식 페이지의 capability/벤더 설명을 로컬 성능 증거로 인용하지 않는다.
- Superset/Metabase를 내부 kernel에 넣을지, 외부 BI export/integration으로 둘지는 비즈니스·보안 결정이 필요하다. 이 조사로 그 결정을 대신하지 않는다.

## 3. 후보 비교

| 문제/경계 | 후보 및 확인한 버전·edition | 적합성 / 공백 | 라이선스·유료 경계 | 운영·통합·탈출 비용 | 권고 | 근거 |
|---|---|---|---|---|---|---|
| URL navigation/search | TanStack Router (현재 제품 고정 1.170.1), React Router 대안 | typed/validated search와 route inheritance가 유용하다. 그러나 strict wall-clock codec, duplicate rejection, unknown preservation, Scope recheck는 직접 구현해야 한다. | TanStack Router와 React Router 모두 MIT 계열 공개 소스 | 현재 제품 자산과의 전환 비용이 낮다. router API를 public contract로 노출하면 교체 비용이 커지므로 codec을 분리해야 한다. | **유지 후보**: TanStack Router + platform-owned codec. React Router는 SSR/framework 요구가 생길 때 대체 후보 | [TanStack search validation](https://tanstack.com/router/latest/docs/how-to/validate-search-params), [shared search params](https://tanstack.com/router/latest/docs/how-to/share-search-params-across-routes), [TanStack Router repo](https://github.com/TanStack/router) |
| server state/cancel/revalidation | TanStack Query (현재 제품 5.62.7; upstream package JSON 확인 5.x), custom hooks | query key에 context 변수를 넣고 AbortSignal을 전달할 수 있다. signal을 fetch가 소비하지 않으면 cancellation이 보장되지 않는다. generation gate와 trust state는 직접 소유해야 한다. | MIT | 기존 API client 선례와 integration cost가 낮다. query library semantics를 public response contract와 섞으면 교체가 어렵다. | **유지 후보**: TanStack Query + owned generation/commit guard | [Query cancellation](https://tanstack.com/query/v4/docs/react/guides/query-cancellation), [query keys](https://tanstack.com/query/latest/docs/framework/query-keys), [TanStack Query repo](https://github.com/TanStack/query) |
| 대규모 표 | TanStack Table + TanStack Virtual; AG Grid Community/Enterprise | TanStack은 headless라 tokens, semantics, URL/state ownership을 직접 통제한다. Virtual은 DOM 렌더링만 줄이며 server filter/sort/fetch를 제공하지 않는다. AG Grid는 빠른 기능 폭을 얻지만 advanced grouping/pivot/tree와 일부 server-side 기능은 Enterprise 경계가 있다. | TanStack Table/Virtual MIT. AG Grid Community MIT, Enterprise 유료; 가격·기능은 재확인 필요 | TanStack은 초기 조립 비용이 있으나 exit가 쉽고 kernel 계약과 맞는다. AG Grid는 feature adoption 뒤 라이선스·theme·API 종속이 커진다. | **유지 후보**: TanStack Table + Virtual. AG Grid는 실제 grouping/pivot/tree 요구가 발생하고 Enterprise 비용을 승인할 때만 **보강 후보** | [TanStack server-side guide](https://tanstack.com/table/latest/docs/guide/client-side-vs-server-side), [virtualization guide](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization), [TanStack Table repo](https://github.com/TanStack/table), [AG Grid licensing](https://www.ag-grid.com/license-pricing/), [row grouping boundary](https://www.ag-grid.com/javascript-data-grid/grouping-data/) |
| chart/brush/summary | Apache ECharts 6.1.0 upstream package JSON, Plotly.js, visx/D3 | ECharts는 dataZoom/brush/ARIA component가 있어 분석 화면의 local interaction 후보로 좋다. 서버 aggregate/downsample, textual summary, table equivalent, persistent annotation model은 별도다. | ECharts Apache-2.0. Plotly.js는 MIT이지만 chart adapter 범위와 distribution은 별도 검증 필요. | ECharts option model에 화면이 직접 잠기지 않도록 `ChartFrame`/adapter가 필요하다. 다른 chart 교체는 adapter 경계가 있으면 가능하다. | **보강 후보**: ECharts adapter를 작은 vertical slice로 POC. “가장 빠른 chart” 판단은 보류 | [ECharts features](https://echarts.apache.org/en/feature.html), [ECharts ARIA](https://echarts.apache.org/en/handbook/en/best-practices/aria/), [ECharts repo/package](https://github.com/apache/echarts) |
| accessible primitives | 현재 Radix + checked-in shadcn-style wrapper; Base UI; React Aria | Radix는 현재 코드 자산과 맞고 low-level composition이 가능하다. Base UI는 unstyled/Tailwind-compatible이며 ARIA APG/WCAG 2.2를 지향한다. React Aria는 접근성 상호작용 폭이 넓다. 어느 것도 Shell Slot, tokens, Context contract를 대신하지 않는다. | Radix MIT, Base UI MIT, React Aria Apache-2.0 | 한 component category에 여러 계열을 섞으면 focus/keyboard/theme 운영이 어려워진다. 현재 wrapper를 재사용하면 exit가 쉽지만 promotion audit이 필요하다. | **유지 후보**: Radix + checked-in source. Base UI/React Aria는 접근성 POC를 통과한 경우의 **대체 후보** | [Radix repo](https://github.com/radix-ui/primitives), [Base UI](https://base-ui.com/), [React Spectrum repo](https://github.com/adobe/react-spectrum), [shadcn source ownership](https://ui.shadcn.com/docs/new) |
| declarative menu/shell | 직접 구현한 platform manifest + Shell Slots | 외부 plugin framework보다 kernel 계약과 permission/context ownership을 명확히 할 수 있다. dynamic plugin SDK를 먼저 만들 근거는 없다. | 플랫폼 코드에 따라 결정 | registry를 public manifest로 정의하면 domain menu 추가는 가볍지만 schema migration/permission review가 필요하다. | **유지**: platform-owned registry. 외부 plugin system은 **보류** | `docs/06_platform_ui_contract.md` §§8, 22, 28; current product `NAV_TREE`는 참고 자산 |
| full BI/admin replacement | Apache Superset embedding; Metabase guest/full embedding | Superset embed는 feature flag, allowed origins, guest token과 자체 host/URL lifecycle을 필요로 한다. Metabase guest embed는 identity 및 row/column security에 제약이 있고 source license가 AGPL/commercial로 나뉜다. 둘 다 URL/Scope/Data Trust kernel의 대체가 아니다. | Superset Apache-2.0. Metabase AGPL 또는 commercial | identity, guest token, cross-domain, permission model, visual theme와 public Context가 이중화된다. 도입 후 탈출 비용이 높다. | Superset은 **참고/Deferred**, Metabase는 kernel 선택에서 **제외**; 외부 BI 연계 요구가 확정될 때 별도 조사 | [Superset repo](https://github.com/apache/superset), [Superset embedding](https://superset.apache.org/user-docs/using-superset/embedding/), [Metabase license](https://github.com/metabase/metabase/blob/master/LICENSE.txt), [Metabase embed security](https://www.metabase.com/docs/latest/embedding/securing-embeds) |

라이선스는 2026-09-22에 확인한 공식 저장소·공식 문서 기준이며, 구매 가격·지원 기간·기능표는 도입 시 다시 확인해야 한다. “MIT/Apache-2.0”은 도입 승인이나 보안 검토의 대체가 아니다.

## 4. 적용 카드

### A1. Public URL codec과 Context artifact

- **문제:** 메뉴 간 링크와 back/forward에서 scope, time, equipment/lot set, metric pair가 달라지거나, malformed 값을 router가 fallback하면 분석 결과의 의미가 바뀐다.
- **현재 근거:** `docs/06_platform_ui_contract.md` §§4–6, 11은 URL 우선순위, 엄격한 `YYYY-MM-DDTHH:mm:ss`, `[from,to)`, duplicate rejection, `metricId+metricVersion` pair, unknown key preservation, unsupported Context 표시를 규정한다. FeedbackOps route-local Zod schema는 선례지만 공통 codec은 없다.
- **제안:** `PublicContextV{n}`를 순수 TypeScript artifact로 정의하고 `decode → validate → canonicalize → encode`를 같은 계약에서 생성한다. set은 repeated key와 명시적 empty marker를 사용하며, unknown은 raw URL에 보존하되 typed context에는 넣지 않는다. TanStack Router `validateSearch`는 이 codec의 thin adapter로만 사용한다.
- **Platform 소유:** schema/version, error codes, canonicalization, supported/unsupported Context, Context Link helper, server-side revalidation contract.
- **재사용 경계:** Zod는 parser 구현 후보이며 Zod 오류 모양은 public error contract가 아니다. router를 바꿔도 codec test vector와 server schema는 유지되어야 한다.
- **실패 모드:** router fallback으로 required value를 채움, date-only/offset/Z를 허용함, duplicate set을 dedupe함, URL `scopeId`를 권한으로 신뢰함, unsupported key를 삭제함.
- **최소 검증:** valid round trip; invalid date/offset/fraction; `from >= to`; duplicate ID; one-sided metric pair; explicit empty; unknown preservation; unsupported `v`; server forbidden scope. 위 테스트는 실행하지 않았다.
- **우선순위/선행:** P0; Menu Registry와 모든 query route의 선행. 목표 latency 같은 수치는 측정 전 가설로도 둘 필요가 없다.
- **문서 반영:** 선택 시 `docs/06`에 artifact와 error vocabulary를 추가하고, `docs/04`에는 router를 codec의 소비자로 낮춰 적는다. `docs/05`에 test vector/POC 상태를 기록한다.
- **신뢰도:** 높음(문서 계약과 공식 router validation capability), 구현 난이도·서버 codegen 방식은 중간.

### A2. Menu Registry와 Shell Slot 경계

- **문제:** 현재 제품의 `NAV_TREE`처럼 navigation을 route 파일에 하드-code하면 권한, supported Context, breadcrumb, deep link, shell slot이 메뉴마다 복제된다.
- **현재 근거:** `docs/06` §§8, 22, 28은 registry와 Context Link helper를 kernel 책임으로 둔다. FeedbackOps `NAV_TREE`와 `AppFrame`은 참고 가능한 실제 조립 코드지만 platform registry가 아니다.
- **제안:** `MenuManifest`를 `id`, `group`, `label`, `route`, `icon`, `requiredPermission`, `supportedContext`, `shellSlots`, `contextLinkPolicy`를 가진 선언형 artifact로 둔다. Shell은 manifest로 rail/breadcrumb/command entry를 만들고 domain page는 content와 domain actions만 제공한다.
- **Platform 소유:** manifest schema, menu visibility policy, permission check hook, supported Context, slot naming, Context Link transfer/unsupported behavior.
- **재사용 경계:** FeedbackOps label/href/icon/countKey를 복사하지 말고 field shape만 참고한다. dynamic plugin loading, remote manifest, arbitrary menu-side URL composition은 이번 범위에 넣지 않는다.
- **실패 모드:** hidden menu가 direct URL에서 열림, menu가 Scope를 우회함, page가 shell chrome을 다시 그림, raw URL string을 직접 조합함, domain API가 registry를 import함.
- **최소 검증:** 한 분석 메뉴와 한 관리 메뉴를 등록해 동일 shell에서 title/action/context/dataTrust가 렌더링되는지 확인; permission denied direct link와 unsupported Context를 확인. 미실행.
- **우선순위/선행:** P0; A1 codec 및 permission contract 선행.
- **문서 반영:** `docs/06`에 manifest 최소 schema와 slot ownership을, `docs/07`에 실제 slot mapping을, `docs/05`에 registry POC status를 추가한다. `DESIGN.md`에는 token/component binding만 둔다.
- **신뢰도:** 높음.

### A3. Query key, cancellation, generation gate

- **문제:** Context 변경 직후 이전 요청이 늦게 도착하면 새 URL 아래 오래된 결과가 표시된다. polling/refetch가 server-completed generation을 건너뛰면 “최신”이라는 표시도 거짓이 될 수 있다.
- **현재 근거:** `docs/06`은 stale result 금지와 query/correlation ID를 요구하고, `docs/05`는 polling과 server-completed generation을 Decided로 둔다. FeedbackOps API client는 `AbortSignal`을 fetch에 전달하지만 platform generation guard는 없다.
- **제안:** TanStack Query key를 `routeId + canonicalContext + pageFilters + metricPair + serverGeneration`으로 만든다. queryFn은 반드시 signal을 provider fetch까지 전달한다. context transition에는 이전 observer를 cancel하고, commit gate가 `contextFingerprint`와 `requestGeneration`을 확인한 결과만 store/view에 반영한다. 같은 Context refresh는 `Refreshing`으로 이전의 같은-context 결과를 유지할 수 있다.
- **Platform 소유:** key canonicalization, context fingerprint, generation comparison, stale/partial semantics, correlation/query ID, retry/polling policy defaults.
- **재사용 경계:** Query cache는 transport implementation이다. bearer/PII를 URL이나 query key에 넣지 않으며, Query가 signal을 받았다는 사실만으로 cancellation을 보장한다고 말하지 않는다.
- **실패 모드:** query key에서 metricVersion 또는 scope를 누락함, signal을 무시하는 fetcher, retry가 forbidden을 재시도함, same key race를 generation 없이 commit함, source watermark를 mart complete로 표시함.
- **최소 검증:** delayed first request + changed context + delayed second request에서 first response가 paint되지 않는 fixture; same-context refresh와 partial widget failure; server generation mismatch; abort 확인. 미실행.
- **우선순위/선행:** P0; A1과 response envelope 선행.
- **문서 반영:** `docs/06`의 query lifecycle에 generation/commit rule과 retry classification을 추가하고 `docs/05`에 polling period는 open으로 유지한다.
- **신뢰도:** 높음(official Query cancellation/key semantics와 현재 code 선례); 실제 race 구현은 중간.

### A4. Table, server query, virtualization

- **문제:** 분석 표는 sorting/filtering/export/context link가 필요하며 row가 많을 수 있다. virtual DOM만 적용하고 서버 query를 그대로 두면 네트워크와 필터 비용은 줄지 않는다.
- **현재 근거:** `docs/04`와 `docs/06`은 server aggregate/downsample, large table virtualization, raw log browser 전송 금지를 요구한다. TanStack 공식 문서도 server-side filtering/sorting/fetching은 애플리케이션 책임이고 virtualization은 DOM 렌더링 문제만 다룬다고 설명한다.
- **제안:** TanStack Table을 headless table state/semantics에, TanStack Virtual을 viewport rendering에 사용한다. filter/sort/page/cursor/aggregate는 server query contract로 보내고, table은 항상 keyboard와 semantic fallback을 유지한다. `Chart → Table` 전환은 같은 query fingerprint와 data trust를 공유한다.
- **Platform 소유:** column visibility policy, selection/deep-link semantics, server query schema, loading/empty/partial states, keyboard/focus, 32px row token(현재 DESIGN 기준), CSV/export data trust.
- **재사용 경계:** Table/Virtual API는 internal adapter 뒤에 둔다. 실제 grouping/pivot/tree가 필요하고 Enterprise license가 승인된 경우에만 AG Grid를 별도 adapter로 검토한다.
- **실패 모드:** virtual row를 실제 전체 데이터로 오인함, server sort와 client sort가 달라짐, 표와 chart가 서로 다른 generation을 표시함, raw logs를 브라우저로 전송함, focus가 virtual unmount로 사라짐.
- **최소 검증:** 대표 fixture에서 server sort/filter/cursor, keyboard row navigation, same query table/chart, viewport scroll, large data memory/frame 측정. 수치와 대표 데이터는 아직 정하지 않았고 실행하지 않았다.
- **우선순위/선행:** P1; A1/A3의 query contract 선행.
- **문서 반영:** `docs/04`의 후보표에 “server-side는 앱 책임”과 AG Grid Enterprise boundary를 적고, `docs/06`에 table fallback/accessibility/data trust를 명시한다.
- **신뢰도:** 중간-높음; 실제 volume threshold는 측정 전 미정.

### A5. Chart adapter, brush와 textual fallback

- **문제:** 차트의 zoom/brush는 분석에 유용하지만 chart-local state와 URL-owned Context, persistent annotation, table fallback을 섞으면 공유 링크와 접근성이 깨진다.
- **현재 근거:** `docs/04`는 ECharts/Plotly/visx/D3 후보와 POC 필요성을 적고, `docs/06`은 local zoom/brush와 explicit URL brush, textual summary/table route, no-color-only를 요구한다. ECharts 공식 문서는 dataZoom/brush 및 ARIA component를 제공한다.
- **제안:** `ChartFrame`가 title/unit, data trust, loading/error, textual summary, “open as table” action을 소유하고, ECharts option은 adapter 내부에 둔다. zoom은 local; URL을 바꾸는 brush는 명시적 Apply로 Context Link를 거친다. annotation은 별도 domain object/API로 두고 chart graphic layer에 저장하지 않는다. 서버가 aggregate/downsample한 데이터만 보낸다.
- **Platform 소유:** chart state taxonomy, axis/time-domain contract, accessible summary/table parity, Context Link, annotation identity, source/observedAt display.
- **재사용 경계:** ECharts `dataZoom`/ARIA capability를 활용하되 option shape를 외부 계약으로 만들지 않는다. ECharts의 vendor performance 문구는 로컬 benchmark가 아니다.
- **실패 모드:** brush가 URL 없이 화면만 바꿈, local zoom을 공유 Context로 저장함, empty/unknown을 0으로 그림, 색상만으로 alarm/state를 구분함, raw event logs를 전송함.
- **최소 검증:** same fixture chart/table equality; brush apply/back-forward; keyboard/ARIA summary; partial series; unknown/stale trust; CJK labels; representative downsample correctness. 미실행.
- **우선순위/선행:** P1; A1/A3/A4의 context/query/trust 선행.
- **문서 반영:** `docs/04`에 ECharts를 “adapter POC 후보”로 쓰고, `docs/06`에 ChartFrame/table parity와 annotation ownership을 추가한다.
- **신뢰도:** 중간; library capability는 높으나 시각화 요구와 데이터 규모는 미확정.

### A6. UI primitive, tokens, focus와 Shell Slot

- **문제:** 여러 primitive family를 섞으면 dialog, combobox, focus trap, keyboard navigation, theme token이 서로 달라지고 shell contract가 컴포넌트 구현에 묻힌다.
- **현재 근거:** `products/feedbackops/packages/ui`는 Radix 기반 wrapper와 local shadcn-style source를 이미 갖고 있다. `docs/06` §§23, 26은 primitive/semantic/component token 층, visible focus, dialog focus trap, icon label과 textual error를 요구한다.
- **제안:** 플랫폼 첫 slice에서는 Radix primitive + checked-in source를 한 family로 고정하고, component source를 platform-owned wrapper로 승격할지 audit한다. Base UI는 combobox/popover 범위에서, React Aria는 keyboard/screen reader breadth가 실제 병목일 때만 같은 acceptance test로 비교한다. Shell은 library primitive 위에 slot/permission/context/dataTrust를 조립한다.
- **Platform 소유:** token names, CSS variables, component states, focus order, keyboard shortcuts, error/empty/partial/loading visuals, slot contract.
- **재사용 경계:** FeedbackOps wrapper를 그대로 import하지 않고 source license, dependency, product coupling을 검토해 복사/승격한다. Radix/Base UI/React Aria를 동일 역할에 병행하지 않는다.
- **실패 모드:** Tailwind class가 semantic token을 우회함, dialog에 focus return이 없음, chart/table만 color로 상태 표시, domain page가 slot 밖 shell chrome을 그림.
- **최소 검증:** keyboard-only shell/dialog/drawer, focus trap/return, screen reader accessible name, reduced motion, 200% zoom, light/dark semantic tokens. 미실행.
- **우선순위/선행:** P1; Shell/registry가 필요하고 A2와 병행 가능.
- **문서 반영:** `DESIGN.md`는 token/component ownership, `docs/06`은 behavior/accessibility contract, `docs/04`는 chosen primitive와 alternatives를 각각 기록한다.
- **신뢰도:** 높음(현재 source와 공식 primitive 문서); 실제 CJK/AT 조합은 중간.

### A7. Response envelope, Data Trust와 관측 가능성

- **문제:** UI가 HTTP 200, 빈 배열, query timeout만 보고 “정상/완료/데이터 없음”을 추론하면 운영자는 결과 신뢰도를 판별할 수 없다.
- **현재 근거:** `docs/06` §§18–19는 `outcome + assessments[]`, source, observedAt, unknown, partial widget failure, correlation/query ID를 명시한다. 현재 FeedbackOps Zod success parsing은 payload shape 검증 선례지만 이 두 층 trust model은 확인되지 않았다.
- **제안:** server envelope를 platform schema로 만들고, `DataTrustSummary`/widget trust component은 envelope만 렌더링한다. 한 widget의 error가 page 전체를 제거하지 않도록 widget boundary를 둔다. error action은 retry/cancel/contact owner처럼 evidence에 맞게 만든다.
- **Platform 소유:** envelope schema, outcome vocabulary, assessment provenance, observedAt/time domain, correlation ID, redaction, retry classification.
- **재사용 경계:** Query/HTTP status는 transport signal이다. UI는 status code만으로 empty cause나 source completeness를 만들지 않는다.
- **실패 모드:** empty array를 “source empty”로 표기, source watermark를 mart complete로 표기, missing assessment를 healthy로 표시, correlation ID 없이 운영자에게 retry를 요구함.
- **최소 검증:** success/empty/partial/stale/unknown/error fixture, widget-isolated failure, correlation ID display, response redaction, same fixture table/chart trust parity. 미실행.
- **우선순위/선행:** P0; A3 query coordinator와 server API contract 선행.
- **문서 반영:** `docs/06` authoritative envelope section을 code schema artifact와 연결하고 `docs/05`에 backend ownership/open questions를 적는다.
- **신뢰도:** 높음(문서 계약), 서버 payload와 운영 연동은 중간.

### A8. BI/admin 제품의 재사용 경계

- **문제:** Superset/Metabase를 빠른 내부 dashboard로 embed하면 차트와 filter는 얻지만 platform URL, Scope, identity, data trust, metric version이 이중화될 수 있다.
- **현재 근거:** Superset 공식 embedding은 feature flag, allowed origins, guest token과 host integration을 요구한다. Metabase 공식 문서는 guest embed에서 identity 및 row/column security 제약을 명시하고 source license가 AGPL/commercial로 나뉜다.
- **제안:** kernel replacement로 채택하지 않고, 외부 BI export/integration 요구가 확정된 뒤 별도 adapter/permission review를 한다. 내부 첫 vertical slice는 platform-owned shell + table/chart로 검증한다.
- **Platform 소유:** URL/context/Scope/auth, metric version, data trust, audit, deep link. embed product는 이 계약의 authoritative source가 될 수 없다.
- **재사용 경계:** Superset/Metabase는 참고 또는 외부 BI target으로만 다룬다. guest token을 앱의 permission proof로 취급하지 않는다.
- **실패 모드:** guest embed의 locked parameter를 authorization으로 오인, host URL과 platform URL을 혼용, row security가 embed 경로에서 빠짐, commercial/AGPL 조건을 무시함.
- **최소 검증:** 실제 identity/Scope/row-level security, deep link round trip, source/observedAt, audit trail, logout/token expiry를 별도 security POC로 확인. 미실행.
- **우선순위/선행:** Deferred; kernel contract, auth model, BI use case가 먼저 결정되어야 한다.
- **문서 반영:** `docs/05` Deferred/open question으로 유지하고, 도입 결정 전에는 `docs/06` 구현 후보로 올리지 않는다.
- **신뢰도:** 높음(공식 embed/license 문서).

## 5. 권장 최소 조합과 대안

### 5.1 최소 조합

다음 조합이 현재 계약과 이미 관찰한 코드 자산을 가장 적게 흔든다.

- **Kernel contract:** platform-owned `PublicContext` codec + `MenuManifest` + Shell Slots + Context Link helper.
- **Navigation:** TanStack Router를 route transport로 사용하고, route-local Zod schema는 공통 codec을 호출한다.
- **Server state:** TanStack Query를 cache/fetch lifecycle로 사용하고, `AbortSignal`, canonical context key, `requestGeneration` commit gate를 별도로 둔다.
- **Data views:** TanStack Table + Virtual, 서버 filter/sort/aggregate, semantic table fallback.
- **Charts:** ECharts adapter를 POC하고 `ChartFrame`가 trust/summary/table action을 소유한다.
- **Primitives:** Radix + checked-in source 한 계열, platform tokens와 acceptance tests로 감싼다.
- **BI:** 현재는 채택하지 않는다. Superset은 reference/Deferred, Metabase는 kernel 선택에서 제외한다.

이 조합은 라이브러리 목록을 확정하는 계획이 아니라, platform-owned seam을 먼저 정하고 후보를 그 뒤에 끼우는 최소 검증 경로다. 각 library의 capability는 공식 문서로 확인했지만 이 조합의 latency, bundle size, row limit, 사용자 만족도는 측정하지 않았다.

### 5.2 가장 작은 end-to-end 검증 흐름

1. `/analytics/cycle-time` 한 route에 `v`, scope, equipment/lot set, metric pair, strict from/to를 넣은 public schema와 invalid test vector를 만든다.
2. 같은 schema를 route validation, MenuManifest의 supported Context, Context Link, server request validator가 공유하는지 확인한다.
3. 첫 요청을 지연시킨 뒤 Context를 바꾸고 두 번째 요청을 완료시켜, 첫 응답이 새 Context 화면에 paint되지 않는지 확인한다. forbidden scope는 서버에서 거절되어야 한다.
4. 같은 fixture를 table과 ECharts에 표시한다. server generation, `outcome`, `assessments[]`, source/observedAt가 두 view에 동일하게 나타나야 한다.
5. chart zoom은 local로, brush Apply는 URL Context 변경으로 동작시킨다. back/forward에서 URL-owned state만 복원한다.
6. partial widget failure, unknown trust, cancellation, retryable/non-retryable error, keyboard/focus/dialog/table/chart summary를 검증한다.
7. 이 invariant 검증 뒤에야 CJK, row/cardinality, concurrency, frame time, memory, bundle size를 대표 workload로 측정한다. 숫자 목표가 필요하면 데이터량·동시성·브라우저/장비를 먼저 정하고 가설로 기록한다.

### 5.3 대안을 고를 조건

- TanStack Router를 바꿀 조건: 플랫폼이 SSR/data-loader/React Router 생태계에 강하게 묶이거나, team 운영 표준이 확정된 경우. 그래도 `PublicContext` codec과 manifest는 유지한다.
- TanStack Table을 AG Grid로 바꿀 조건: 실제 요구에 grouping/pivot/tree/enterprise server row model이 포함되고, 라이선스·bundle·접근성·exit 비용을 포함한 POC가 통과한 경우.
- ECharts를 Plotly/visx/D3로 바꿀 조건: 통계 trace, custom rendering, annotation/editor 요구가 ECharts adapter 경계를 넘어서는 경우. “더 빠를 것”은 교체 근거가 아니다.
- Radix를 Base UI/React Aria로 바꿀 조건: 같은 acceptance test에서 필요한 combobox, focus, keyboard, screen reader 동작을 더 잘 충족하고 현재 source migration 비용을 승인한 경우.

### 5.4 지금 채택하지 않을 것

- dynamic remote menu/plugin SDK, saved-view/widget framework, full BI product embedding, numeric performance SLA, arbitrary time-zone conversion, chart-specific annotation storage.
- 이런 항목은 `docs/05`의 Deferred/Open 상태를 유지한다. 실제 반복 사례와 운영 증거가 생긴 뒤 platformization 여부를 다시 결정한다.

## 6. 충돌·중복·미결정 질문 (최대 5)

1. **URL strict rejection과 TanStack Router 문서의 fallback 예시:** required Context는 fallback을 금지할지, optional display-only key만 fallback을 허용할지 결정해야 한다. 이 보고서는 전자를 기본으로 제안한다.
2. **Router search state와 platform codec의 소유:** route가 codec을 호출하는 얇은 adapter로 고정할지, 서버 schema artifact를 codegen할지 미정이다. 어느 경우에도 route-local schema가 contract source가 되면 안 된다.
3. **Server generation의 권위와 polling 주기:** generation 발행 지점, source/mart completeness, late-arrival horizon, polling visibility/stop 조건이 미정이다. 숫자 주기를 지금 정하면 근거 없는 SLA가 된다.
4. **Radix, Base UI, React Aria의 단일 선택:** 현재 자산 재사용, accessibility breadth, source ownership 중 우선순위를 정하고 동일 acceptance suite로 비교해야 한다. 세 계열 병행은 피한다.
5. **외부 BI 연계 필요성:** Superset/Metabase가 필요한 실제 consumer와 authorization boundary가 있는지, platform chart/table을 대체하지 않고 export target으로 충분한지 결정해야 한다.

## 7. 출처와 검증 한계

### 공식 문서·저장소

- [TanStack Router — search parameter validation](https://tanstack.com/router/latest/docs/how-to/validate-search-params), [shared search params](https://tanstack.com/router/latest/docs/how-to/share-search-params-across-routes), [repository](https://github.com/TanStack/router)
- [TanStack Query — query cancellation](https://tanstack.com/query/v4/docs/react/guides/query-cancellation), [query keys](https://tanstack.com/query/latest/docs/framework/query-keys), [repository](https://github.com/TanStack/query)
- [TanStack Table — client/server-side data](https://tanstack.com/table/latest/docs/guide/client-side-vs-server-side), [virtualization](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization), [repository](https://github.com/TanStack/table)
- [Apache ECharts — features](https://echarts.apache.org/en/feature.html), [ARIA best practices](https://echarts.apache.org/en/handbook/en/best-practices/aria/), [repository/package](https://github.com/apache/echarts)
- [AG Grid — licensing/pricing](https://www.ag-grid.com/license-pricing/), [row grouping](https://www.ag-grid.com/javascript-data-grid/grouping-data/), [key features](https://www.ag-grid.com/javascript-data-grid/key-features/)
- [Radix primitives repository](https://github.com/radix-ui/primitives), [Base UI](https://base-ui.com/), [React Spectrum/React Aria repository](https://github.com/adobe/react-spectrum), [shadcn source ownership](https://ui.shadcn.com/docs/new)
- [Apache Superset repository](https://github.com/apache/superset), [Superset embedding](https://superset.apache.org/user-docs/using-superset/embedding/)
- [Metabase license](https://github.com/metabase/metabase/blob/master/LICENSE.txt), [Metabase embed security](https://www.metabase.com/docs/latest/embedding/securing-embeds)

### 저장소 근거

- `docs/INDEX.md`, `docs/04_frontend_ui_ux.md`, `docs/05_roadmap_and_open_questions.md`, `docs/06_platform_ui_contract.md`, `docs/07_app_shell_wireframe.md`, `DESIGN.md`, `PLATFORM_REQUIREMENTS.md`, `HANDOFF.md`
- `products/feedbackops/apps/frontend/package.json`, `src/main.tsx`, `src/lib/api/client.ts`, `src/routes/_authed.tsx`, `src/routes/_authed/vocs.tsx`, `src/routes/_authed/admin/permissions/requests.tsx`, `src/lib/layout/AppFrame.tsx`
- `products/feedbackops/packages/ui/package.json`, `packages/ui/src/components/shadcn/dialog.tsx`, submodule commit `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`

### 한계

- 공식 문서는 API capability, library license, embed/license boundary를 확인하는 데 사용했다. 공식 사이트의 “millions of data points”, “fast”, “accessible” 같은 표현을 이 플랫폼의 성능·접근성 통과 증거로 사용하지 않았다.
- 이 보고서는 의존성을 설치하거나 실제 route를 실행하지 않았고, ECharts/TanStack Virtual/AG Grid의 성능·메모리·bundle size, CJK 레이아웃, screen reader 조합, real permission/API behavior를 측정하지 않았다.
- 현재 FeedbackOps 버전은 submodule의 고정 manifest에서 관찰한 값이며 platform 채택 버전이 아니다. upstream 최신 버전·가격·지원 범위는 구현·구매 시점에 재확인해야 한다.
- 다음 문서 변경은 선택과 POC가 결정된 뒤에 수행한다. `docs/04`에는 선택 후보와 측정 결과, `docs/06`에는 확정된 artifact/behavior 계약, `docs/05`에는 decision/open/deferred 상태만 반영하고, 이번 조사만으로 authoritative 문서를 바꾸지 않는다.
