# Kernel App Shell — Unit A

**합성 fixture, 실제 메뉴 아님.** sample-overview / sample-analysis / sample-reference는 capability 차이를 검증하는 빈 라우트이며 업무 메뉴·업무 콘텐츠가 없다.

이 프로토타입은 플랫폼 다섯 갈래 중 Kernel(App Shell/Menu Registry/Context/URL), 메뉴간 Context 연결, 레이아웃(§12 Page Archetype 5종)을 검증한다. Chart Frame, PlatformDataTable, DetailDrawer는 범위 밖이다.

## 실행

설치된 Node 26.7.0 / npm 11.19.0으로 검증했다. 이 디렉터리에서:

```sh
npm ci --cache .npm-cache --no-audit --no-fund
npm run dev
```

http://127.0.0.1:5173/sample-analysis 를 연다. 최초 Scope는 선택되지 않는다. 헤더 Scope와 전역 room/Condition/Selection을 명시적으로 변경한 뒤 sidebar 또는 Search ⌘K 목록으로 이동한다. reference에서 `Not used on this page`, overview에서 Condition `Reference only`, analysis에서 `Supported · server validation pending`을 확인한다. 브라우저 back/forward는 URL 상태를 복원한다. Cmd+K(Ctrl+K도 지원), Escape, Tab으로 palette를 조작할 수 있다.

analysis의 합성 execution 행에서 `Open detail`을 누르면 `/equipment/{id}` 상세로 이동한다. 상세는 목적지 EquipmentID를 Selection과 별도 필드로 보여주고 Condition/Selection을 `Not used on this page`로 표시한다. `← Back to Sample analysis`는 진입 직전 URL을 그대로 복원한다.

- `Selection → Explicit empty set`은 부재와 다르며 미지원 페이지에서도 URL에 남는다.
- Condition 변경은 고정 Selection을 바꾸지 않는다.
- 실제 서버 요청·SSO·권한 승인은 없다. Supported는 capability 선언일 뿐, 검증·조회 완료가 아니다.
- Help/User는 명시적인 자리 표시다. 검색 입력·인덱싱·조회는 없다.

## Candidate 선택

`docs/04_frontend_ui_ux.md`의 React + TypeScript + Tailwind 후보를 사용했다. 작은 독립 실행 디렉터리를 위해 Vite, 자동 DOM 검증에 Vitest/jsdom/Testing Library를 선택했다. Radix Dialog는 palette의 focus trap/Escape/초점 복귀에 사용한다. lockfile이 이번 검증 버전을 고정하며 production 채택 결정이 아니다.

### Decided 스택 이식 (docs/04, 2026-09-25)

Tailwind CSS v4 + shadcn/ui(Radix) + `cn()` 위로 옮겼다. FeedbackOps 원본(`products/feedbackops` @ `b5dd614`)은 런타임에 참조하지 않고 파일을 복사했으며, 복사본은 import 경로만 바꿨다(각 파일 첫 줄에 출처 표기).

- 이식: `src/utils/cn.ts`, `src/components/Button.tsx`(FeedbackOps 커스텀 CVA Button) + `shadcn/button.tsx` 재수출 shim, `shadcn/dialog.tsx`(palette), `shadcn/select.tsx`(Scope/room/Condition/Selection), `shadcn/label.tsx`.
- 제외: 나머지 18개(alert-dialog, alert, avatar, badge, card, checkbox, combobox, dropdown-menu, hover-card, input, popover, radio-group, sheet, skeleton, tabs, textarea, toggle-group, tooltip) — Shell에 소비처가 없다. combobox는 검색이 필요 없는 고정 옵션 4개라 select로 충분하다. cmdk palette 재작성은 범위 밖이다.
- 토큰: `src/styles/tokens.css`는 FeedbackOps ADR-0021의 시맨틱 **이름**과 R G B triple 형식을 따르고 **값**은 이 레포 `DESIGN.md` `colors:`를 쓴다(docs/04가 네이밍만 이식한다고 명시). FeedbackOps VOC 도메인 토큰(status/severity/confidence/managed-system)과 레이아웃·spacing·글자 크기 토큰은 가져오지 않았다(Shell 치수는 DESIGN.md/06의 270/64/54). 어두운 sidebar용 `surface-sidebar-hover`/`text-sidebar`/`border-sidebar`/`focus-ring-sidebar`는 FeedbackOps에 없는 플랫폼 추가분이다.
- v3→v4: FeedbackOps `tailwind.preset.ts`의 `theme.extend.colors: rgb(var(--x) / <alpha-value>)`를 `src/style.css`의 `@theme inline { --color-x: rgb(var(--x)); }`로 옮겼다. `bg-accent-primary/15` 같은 투명도 합성은 v4 `color-mix()`로 유지되며 `src/theme.test.ts`가 실제 Tailwind 컴파일로 검증한다. 원본 `animate-in`류 클래스는 FeedbackOps에서도 플러그인 없이 무효이며 그대로 둔다.
- Radix Select는 빈 문자열 item을 금지하므로 `ContextSelect`가 경계에서 `''`↔`__absent`를 변환한다. 호출부의 문자열 계약(Condition의 JSON 문자열 value, `'__inherited'` sentinel)은 그대로다. Radix Select는 이미 선택된 값을 다시 고르면 `onValueChange`를 부르지 않으므로 `'__inherited'` 재선택은 원시 컴포넌트 단계에서 no-op이며, `setSelect`의 sentinel guard는 방어적으로 남겼다.
- 테스트는 native `change` 이벤트 대신 user-event로 trigger→option을 클릭한다. jsdom에 없는 ResizeObserver/pointer capture/scrollIntoView는 `src/test-setup.ts`에서 no-op로만 채운다.

TanStack Router는 검토 대상이지만 이번 실험에서는 채택하지 않았다. 기존 codec의 반복 query 키·alias·opaque 보존을 그대로 검증하기 위해 Browser History와 단일 URL adapter만 사용한다. 라우트 중첩/loader/서버 캐시가 없는 빈 fixture 3개에 Query/Zustand를 추가하지 않았다. 이 선택은 원본 Candidate를 확정하거나 변경하지 않는다.

## 구조와 codec 경계

- `src/codec.ts`: 기존 `../kernel-context-url-scope/context_url.py`와 **95개 parity vector 범위 내 동등성이 검증된** 포팅. Python과 같은 원본 capability route를 유지한다.
- `src/kernel.ts`: fixture 경로 ↔ 원본 codec 경로 adapter. 메뉴 이동만 extras를 제외하고 등록된 전역 Context는 모두 보존한다.
  - **Cross-menu Context Link (§22):** `/equipment/{id}`는 codec의 `route === 'equipment'`(`/prototype/equipment/{id}`)로 매핑되는 상세 pseudo-page다. `detailLink()`가 `contextLink(context, 'equipment', id)`로 등록 Context를 그대로 옮기고, 목적지 ID는 경로 세그먼트에만 둔다 — `selectedEquipmentIds`에 합치거나 대체하지 않는다(§6.4 `[A,B]`→C 예시). 진입 직전 origin URL 전체를 미등록 키 `returnTo`로 상세 URL에 싣고, Back은 그 URL로 정확히 돌아간다. 따라서 상세에서 Context를 바꿔도 출발 Context를 덮어쓰지 않는다. `returnTarget()`은 `returnTo`가 정확히 하나이고 등록 메뉴의 로컬 URL일 때만 링크를 만든다(외부·protocol-relative·다른 상세·중복 값은 거부하고 "Return context unavailable"을 표시). 상세에서 sidebar로 나가면 일반 메뉴 전환처럼 destination과 `returnTo`를 버린다. 권한 기반 링크 숨김/비활성화와 CFG 연계는 Deferred다.
- `src/registry.ts`: `equipmentDetail`은 sidebar에 없는 파라미터 경로 상세이며 `menus`에 넣지 않지만 같은 `supportedContext`/`pageType` 모델을 쓴다(room `reference`, Condition/Selection 포함 나머지 `unsupported`). 메뉴 항목은 식별자/그룹/이름/경로/아이콘, 필요 권한·Scope, 8개 Context capability, page type, 선택 기능 선언. requiredPermissions/requiredScope는 선언만 하며 Shell이 노출 판단에 소비하지 않는다. §5/§9 Permission-aware visibility의 클라이언트 구현은 이번 Unit 범위 밖(Deferred)이며 서버 권한 엔진과 별개인 후속 작업이다.
- `src/App.tsx`: Shell이 sidebar/header/breadcrumb/global controls/palette를 소유한다. 페이지 등록으로 전역 renderer를 전달할 수 없다.
- `src/PlatformPage.tsx`: 7개 required named slots(null 허용), `children?: never`, 런타임 exact-key 검사. content에는 pageType별 archetype(또는 상세 pseudo-page 내용)만 들어간다.
- `src/PageArchetypes.tsx` (§12): Overview / Analysis Workspace / Management / Catalog / Workflow 5개 archetype. 각각 `PlatformPage`의 `content` slot 안에만 들어가며, 정확한 named region 집합(null 허용)·`children?: never`·런타임 exact-key 검사를 `PlatformPage`와 같은 방식으로 강제한다. region은 §12 나열 순서대로 `<section data-region aria-label>` landmark로 렌더링되고(Management의 Search+Filter와 Workflow의 Status/Priority/Owner Filter는 `role="search"`), 시각 배치도 읽기 순서를 뒤집지 않는다. 비어 있는 region은 landmark를 유지하고 라벨을 pseudo-element로만 표시한다(textContent는 빈 문자열).
  - **Page Header / Global Context / Data Trust 해석:** §12에서 이 세 항목은 Overview·Analysis Workspace 목록에만(Page Header는 Management에도) 나오지만, §8은 title/description/actions/dataTrustSummary를 모든 페이지의 Shell Slot으로 두고 그 밖의 전역 UI 삽입을 금지하며, §6 예시는 Equipment Master(management)·Metric Catalog(catalog)·VOC(workflow)도 Context capability를 선언해 Global Context에 `Not used on this page`를 표시하는 대상으로 둔다. 따라서 세 항목은 모든 page type에서 Shell이 제공하고, archetype은 그 사이의 고유 region만 받는다(Management의 Page Header도 제외). archetype에 `title`/`contextExtension`/`dataTrustSummary`를 넘기면 타입·런타임 오류다.
  - **반응형 (§25):** `src/style.css`에 `--breakpoint-wide: 90rem`(1440px)을 추가하고 Tailwind 기본 `lg`(64rem = 1024px)와 함께 쓴다. <1024px는 1열 stack(조회 중심, Analysis Workspace를 모바일용으로 재배치하지 않음), `lg` 1024–1439px는 grid column 축소, `wide` ≥1440px는 full layout. Analysis의 Selection/Annotation과 Management의 Detail Drawer는 `wide`에서 오른쪽 docked column이고, 1024–1439px에서는 문서 흐름 위치에서 sticky로 고정되는 오른쪽 drawer로 전환되며 비어 있으면 숨는다. viewport 고정(`fixed inset-y-0`)이 아니라서 Shell 헤더/Global Context 위를 덮지 않는다. drawer의 열기/닫기와 focus trap(§26)은 slot 내용(DetailDrawer 등) 책임이다. Sidebar collapse는 Shell의 수동 토글(inline width)로만 동작하며 1024–1439px 자동 collapse는 이번 범위에 넣지 않았다. 실제 브라우저 리사이즈 검증은 수행하지 않았고, `src/PageArchetypes.test.tsx`가 Tailwind 컴파일 결과의 media query(64rem/90rem, 1024–1439 전용 drawer 규칙)만 확인한다.
  - **Fixture 연결:** Shell은 registry의 `pageType`으로 archetype을 고른다. sample-overview → Overview, sample-analysis → Analysis Workspace(기존 Context Link용 `Synthetic executions` 행은 drill-down 목록이므로 Breakdown table region으로 이동, 나머지 region은 비움), sample-reference → Catalog(전부 빈 region). 상세 pseudo-page는 archetype 없이 기존 DetailContent를 쓴다. Management/Workflow는 등록 메뉴를 추가하지 않고 컴포넌트 테스트와 `src/archetypes.typecheck.tsx` 음성 타입 검사로만 검증한다.
- `src/slots.typecheck.tsx`: 직접 JSX 속성(children, header 등)과 누락 slot이 컴파일 오류라는 음성 검사. spread나 `data-*` 같은 우회는 타입 검사를 통과할 수 있으며 런타임 exact-key 검사가 막는다. TypeScript 구조 계약이며 임의 React portal/직접 DOM 조작까지 막는 보안 격리는 아니다.

포팅은 기존 bounded codec처럼 room/Condition/Selection만 해석한다. 기간/from/to, Lot/Recipe/지표/anchor 등의 기존 outside-profile 키는 opaque 미적용으로 보존한다. 단독 from도 원본처럼 opaque이며 전체 생산 URL/시간 계약의 구현 완료를 뜻하지 않는다. 미래 v는 전체 거절한다. Scope URL은 권한 증명이 아니며 미지 Scope를 다른 값으로 대체하지 않는다. 실제 서버 검증/선택지 원천은 보류했다.

**시간 지원 메뉴 추가 gate (M7):** `from`/`to`를 지원하는 메뉴를 추가하기 전에 §6.3/§6.4의 datetime 형식 검증(`Z` 접미사 거절, 한쪽만 있으면 오류)을 이 codec의 opaque 보존 경로에 실제로 적용해야 한다. 현재 profile과 모든 fixture는 time을 미지원으로 선언하며 조회가 없다. 이는 구현 범위의 Deferred이며, 시간 형식과 metricId+metricVersion 쌍 계약 자체는 이미 Decided다.

## Known divergence (M1)

[Compliance review](../../.agents/reports/kernel-work-order-app-shell-menu-registry-compliance-review.md)의 벡터 밖 탐침 결과를 기록한다. 아래 6개 유형은 95개 parity vector에 포함되지 않은 **known divergence**이며, 동등성 테스트의 기대값으로 편입하지 않았다. 빈 fragment 유형은 두 입력을 함께 적었다. #6(서로게이트)은 이후 라운드(07c20ac, f00265f)에서 Python·TS codec 동작을 직접 수정해 좁혔다 — 나머지 5개 유형은 이번에도 재실행하거나 수정하지 않았다.

| # | 입력/조건 | Python 원본 | TypeScript | 차이 분류 |
| --- | --- | --- | --- | --- |
| 1 | `/prototype/context?v=1#`, `/prototype/context#` (빈 fragment) | 허용 | `invalid_url` | TS가 더 엄격함 |
| 2 | `///prototype/context?v=1` (urlsplit의 빈 netloc) | 허용 | `invalid_url` | TS가 더 엄격함 |
| 3 | `a_b:foo` | `invalid_route` | `invalid_url` | 둘 다 거절; 오류 코드만 다름 |
| 4 | equipmentGroup Condition의 `id`가 객체 `{"id":1}` | `invalid_id` | `invalid_condition` | 둘 다 거절; 오류 코드만 다름(TS 중복 key 탐지가 중첩 객체 key까지 셈) |
| 5 | equipmentGroup Condition의 `id`가 `NaN` | `invalid_id` | `invalid_condition` | 둘 다 거절; 오류 코드만 다름(TS JSON.parse가 NaN 거절) |
| 6 | **Condition 값에 한정:** JSON 이스케이프 `\ud800` (짝 없는 서로게이트) | `invalid_id` (07c20ac 수정 전에는 serialize에서 `UnicodeEncodeError`, ContractError 아님) | 성공 | Python이 더 엄격함. 원래 **Python 원본 결함**으로 기록했으나 Python을 수정했고, TS Condition 경로는 의도적으로 그대로 둠 |

#6의 범위는 Condition 값으로 한정한다. `scope_id`/`room_names`/`selection`/`destination`에 짝 없는 서로게이트를 넣은 constructed state는 이전에 TS `serialize()`에서 잡히지 않은 `URIError: URI malformed`로 실패했다(벡터 밖, 별도 버그). 지금은 TS도 Python과 같이 `invalid_id` ContractError로 거절하므로 divergence가 아니며, `codec.test.ts`의 회귀 테스트가 네 필드의 거절과 Condition 성공(#6 유지)을 함께 고정한다.

Shell은 `pathname+search`로 원본 codec 경로를 조립하므로 리뷰상 앞의 3개 유형은 앱 경로에서 발생하지 않는다. Python 서로게이트 버그는 [work order](../../.agents/reports/kernel-work-order-app-shell-menu-registry-draft.md)의 사용자 확인 #7에 별도 수정 필요로 기록했고, 이후 07c20ac에서 수정했다. 전체 입력 공간의 동등성은 주장하지 않는다.

## 검증

```sh
npm ci --cache .npm-cache --no-audit --no-fund
PYTHONDONTWRITEBYTECODE=1 python3 scripts/generate-parity.py
npm run typecheck
npm test
npm run build
```

Python 생성기는 원본 codec를 읽기 전용으로 실행해 95개 정상/오류 벡터를 만든다. 테스트는 canonical 문자열, 오류 코드 우선순위, 모든 Condition 축, 공집합/부재, Unicode code point 정렬, 중복 JSON 키, 별칭, 미등록/opaque 필드, 목적지 ID 분리까지 대조한다. 156개 테스트(95 parity + 1 constructed-state + 5 lone-surrogate〈4개 필드 거절 + Condition 성공〉 + 26 Shell〈Context Link 8개, archetype 연결 3개 포함〉 + 27 Page Archetype〈5종 × 5 + 반응형 2〉 + 1 canonical token 대조 + 1 Tailwind v4 theme 컴파일)가 통과하며 typecheck는 3개 Shell slot 음성 타입 사례와 15개 archetype 음성 타입 사례(5종 × children/Shell slot 또는 타 archetype region/누락 region)를 포함한다. 실제 명령과 출력은 `verification.log`에 있다.

Page Archetype 라운드와 Context Link 라운드에서 npm ci, parity 생성, typecheck, 자동 DOM/키보드 테스트, build를 재실행했다. 개발 서버 HTTP smoke는 이번에 재실행하지 않았다. 실제 브라우저 시각 검토·production 권한/데이터 연동은 수행하지 않았다. 데이터 조회가 없으므로 loading/조회 empty/계산 기준시각을 꾸며내지 않는다.

원본 revision과 §29 수용 범위, **사용자 확인 필요 8개**는 [work order](../../.agents/reports/kernel-work-order-app-shell-menu-registry-draft.md)에 모았다(단, #7 서로게이트 버그는 07c20ac/f00265f에서 수정 완료 — work order 자체는 병합 전 브랜치 기록이라 갱신하지 않음). 원본 계약 문서는 수정하지 않았다. Python 프로토타입(`context_url.py`)은 이 서로게이트 수정(07c20ac)에서만 변경했다.
