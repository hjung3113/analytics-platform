# Unit A compliance review — App Shell + Menu Registry

- 대상: `.agents/reports/kernel-work-order-app-shell-menu-registry-draft.md`, `prototypes/kernel-app-shell/` (untracked, 미커밋)
- 기준 revision: HEAD `10f270dc58e1b8b03aa4743f55a70848ebc4fbe4` (work order 인용값과 일치 확인)
- 역할: compliance-only review. 코드·work order·원본 계약은 수정하지 않았다.
- **전체 판정: PASS-WITH-MINOR-ISSUES — BLOCKING 0건, MINOR 8건**

## 1. 직접 실행한 검증

`prototypes/kernel-app-shell`에서 실행 (Node v26.7.0, Python 3.9.6):

| 명령 | 결과 |
| --- | --- |
| `npm ci --cache .npm-cache --no-audit --no-fund` | exit=0, `added 154 packages` (install-scripts 경고만) |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/generate-parity.py` | exit=0, `Generated 95 vectors from unchanged Python codec`; `src/parity-vectors.json` sha1 재생성 전후 동일(`b540a8dd…`) |
| `npm run typecheck` | exit=0 (`slots.typecheck.tsx`의 `@ts-expect-error` 3개가 모두 실제로 발동해야 통과) |
| `npm test` | exit=0, `Test Files 3 passed (3)`, `Tests 109 passed (109)` — codec.test 96, tokens.test 1, App.test 12 |
| `npm run build` | exit=0, `✓ 88 modules transformed`, Radix `"use client"` directive 무시 경고만 |
| dev server smoke (`vite --port 5187`) | `/sample-analysis` 200, `/src/App.tsx` 200, 이후 종료 |
| `git diff --stat 10f270d -- docs DESIGN.md AGENTS.md prototypes/kernel-context-url-scope` | 출력 없음 (원본 계약·Python 원본 변경 없음) |

추가 탐침(scratchpad, 저장소 밖에서 실행):
- Python `context_url.py`와 esbuild로 번들한 `codec.ts`에 벡터 밖 19개 URL을 넣고 대조: 13 SAME, 6 DIFF (M1 참조).
- 임시 tsconfig로 `PlatformPage` 우회 사례를 typecheck: spread로 넣은 임의 key와 `data-*` 속성이 **컴파일 통과** (M2 참조).

## 2. 항목별 판정

### 2.1 Work order 인용·범위

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 기준 commit | PASS | HEAD와 일치 |
| 06 §4/§5/§6/§6.4/§7/§8/§28/§29 인용 | PASS | 절 번호·내용 일치. "적용/참조/미지원"은 §6 표(O/△/X)와 §6.4 "Condition과 Selection의 적용/참조/미지원 범위를 선언" 표현과 맞다 |
| DESIGN.md 치수 인용 | PASS | `components.sidebar-shell.width: 270px`, `components.top-bar.height: 54px`; collapsed 64px는 DESIGN.md에 없고 06 §7 Baseline에만 있음 — work order가 정확히 구분함 |
| 04 기술 스택 Candidate | PASS | 04: "React + TypeScript + Tailwind … 구현 후보". Vite/Vitest/Radix Dialog는 README에 prototype 전용 Candidate로 명시, TanStack Router 미채택 이유 기록. 원본 Candidate 상태를 바꾸지 않음 |
| 포함/제외 범위 vs 문서 | PASS | 제외 항목(SSO, 권한 엔진, 검색 인덱스, 차트/테이블/드로어)은 §10 "Entity Search와 Action Command는 … Deferred 후보", §30 "구현 순서·배치 시점은 Deferred"와 충돌 없음 |
| "합성 fixture, 실제 메뉴 아님" 준수 | PASS | registry는 `Sample overview/analysis/reference`, group `Synthetic fixtures`, 권한 `fixture:inspect`, 옵션 값 `fixture-*`뿐. `content={null}`이고 테스트가 `[data-slot=content]` 빈 텍스트를 확인한다. src/index.html을 grep한 결과 VOC/설비/지표/Occupancy 등 업무 용어 없음. (`PHOTO` 문자열은 parity 벡터에만 있고 UI에는 없음) |
| 다섯 갈래 선언 | PASS | work order 첫머리에 "Kernel의 Shell/Registry/Context/URL 및 메뉴간 Context 연결"을 검증 갈래로 밝힘 (AGENTS.md 요구) |

### 2.2 codec.ts ↔ context_url.py

| 규칙 | 판정 | 근거 |
| --- | --- | --- |
| 버전 검사 순서 | PASS | 두 구현 모두 `v`만 먼저 읽고 unsupported_version → invalid_version → duplicate_singleton 순서로 판정한 뒤 URL/route/field를 검사한다. 벡터(v=2/99 × route·encoding·중복 오류 9종)와 추가 탐침(`%76=2`, `scopeId=a&scopeId=a&v=2`, `v=1;x=2`)이 일치. kernel.ts도 fixture route 검사보다 먼저 `parseUrl`을 호출하고, App 테스트가 `v=99&roomNames=%ZZ` → unsupported_version과 URL 무변경을 확인 |
| 범위 밖 등록 키 보존 | PASS | `OUTSIDE_PROFILE` 10개 키 집합이 동일. `REGISTERED`에 포함돼 extras로 가지 않고 `unapplied_globals`에 남는다. `contextLink`는 extras만 비우고 unapplied를 유지한다 (Python `context_link`와 같음). `serialize`의 invalid_unapplied/invalid_extras 가드도 동일 |
| Condition/Selection 분리 | PASS | `equipmentGroup`(단일 구조화 Condition, 축 3종, 정확한 필드 집합, 중복 JSON key 거부)과 `selectedEquipmentIds`/`equipmentIds` 별칭(동시 입력 시 alias_conflict), `equipmentSelection=none` 표식의 공집합/부재 구분이 동일. Condition 변경은 Selection을 건드리지 않음 (App 테스트 확인) |
| 정규화/인코딩 | PASS | 코드 포인트 정렬, Python `str.strip` 공백 집합, `quote_plus`의 `!'()*` 처리, `json.dumps(ensure_ascii=False, separators)` 동등 — 벡터와 탐침 일치 |
| 벡터 밖 edge case 동등성 | MINOR (M1) | 아래 참조 |

### 2.3 PlatformPage §8 named slot

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 7개 slot 이름 | PASS | `title, description, primaryAction, secondaryActions, contextExtension, content, dataTrustSummary` = §8 트리와 동일 |
| children/직접 prop/누락 slot 타입 오류 | PASS | `@ts-expect-error` 3건이 typecheck 통과 = 실제 오류 발생 |
| 런타임 exact-key 검사 | PASS | children 추가·누락 시 throw (App 테스트) |
| "임의 prop은 타입 검사에서 거절" 주장의 완전성 | MINOR (M2) | spread·`data-*` 우회 |
| Shell 독점 | PASS | header/aside/breadcrumb/global context/palette는 App만 렌더하고, PlatformPage 단독 렌더 시 header/aside 없음 |

### 2.4 Registry fixture (§5/§6)

| §5 정보 | 판정 | 필드 |
| --- | --- | --- |
| 식별자·그룹·이름·경로·아이콘 | PASS | `id, group, name, path, icon` |
| 필요한 권한·Scope | PASS (선언) / MINOR (M3, 소비 안 함) | `requiredPermissions, requiredScope` |
| 지원 Context | PASS | 8축 `time, room_names, condition, selection, lot, ppid, recipe, metricVersion` — §5의 "기간·설비·Equipment Group의 두 층·room_name·Lot·PPID·Recipe·지표 버전"과 대응. 3개 fixture 조합은 모두 서로 다름 (테스트 확인) |
| 페이지 유형 | PASS | `overview/analysis/catalog` (5개 enum 타입) |
| 선택 기능 | PASS | `features: export/savedView/annotate/compare` 모두 false |
| §5 금지 사항 | PASS | 사이드바·palette는 registry에서 생성(JSX 직접 수정 없음), breadcrumb는 Shell이 생성, 메뉴별 query 규칙 없음 |

### 2.5 §6.4 메뉴 전환 규칙 (App.tsx/kernel.ts)

| 규칙 | 판정 | 근거 |
| --- | --- | --- |
| 등록 전역 Context를 지원 여부와 무관하게 보존 | PASS | `navigate` → `writeLocation(…, transfer=true)` → `contextLink`. analysis→reference→overview→analysis 이동에서 room/Condition/명시적 공집합 Selection/`lotIds`가 유지됨 (App 테스트) |
| 미등록 키는 현재 URL에 남기고 전환 시 전달하지 않음 | PASS | `update`는 `serialize`(extras 유지)를 쓰고, `navigate`는 extras를 제거함. 두 경로 모두 테스트 |
| 미지원 시 미적용 표시 | PASS | reference에서 `Not used on this page` 4건(room, Condition, Selection, lotIds), overview Condition `Reference only`, analysis `Supported · server validation pending` 3건 |
| 공집합 보존 | PASS | 미지원 페이지에서도 `equipmentSelection=none` 유지, "Explicit empty set" 표시 |
| back/forward 복원 | PASS / MINOR (M5, 증거 강도) | `popstate` 핸들러가 URL에서 다시 읽음 |
| Scope 단일·미대체 | PASS | 헤더 선택기 1개(테스트 확인), Scope가 없으면 "Scope selection required", 모르는 Scope는 `· unverified`로 보존하고 대체하지 않음 (§6.2, §7) |

### 2.6 §7 Baseline 치수

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 270 / 64 / 54 | PASS | `shellDimensions`와 inline style. `tokens.test.ts`가 DESIGN.md(`sidebar-shell.width`, `top-bar.height`)와 06 §7(`Sidebar collapsed 64px`)을 **정규식으로 직접 읽어** 대조하므로 canonical에서 벗어나면 테스트가 실패함 |
| page header 56~64 / context bar 48 / padding 24 | PASS (Candidate 영역) | `.page-heading min-height:64px`, `.global-context min-height:48px`, 좌우 24px. 이 값들은 테스트로 검증되지 않음 |

### 2.7 §28 Governance / §29 Platform Done

| 항목 | 판정 |
| --- | --- |
| Registry 등록, 지원 Context 선언, 공통 Page Slot, Route/Deep-link | PASS |
| Permission Scope 전 구간 적용 | 해당 없음 (서버·권한 엔진 제외가 명시됨). 다만 M3 |
| Global/Page/Chart 상태 분리, 이동 시 Context 전달 명시, back/forward | PASS (page/chart 상태 없음) |
| §29 표가 production Platform Done을 주장하지 않음 | PASS — "bounded Unit 완료와 production Platform Done은 구별한다"고 명시 |

### 2.8 "사용자 확인 필요" 표 — 임의 결정 여부

임의로 결정한 항목은 없다. 6개 모두 "이번 구현"은 계약상 최소 동작(무조회, 합성 값, 목록만, 자동 변경 없음, opaque 보존)에 머문다. #4의 "자동 변경 없이 유지"는 §6.4 Decided("조용한 선택 변경은 허용하지 않는다")가 요구하는 동작이지 새 결정이 아니다. 다만 상태 라벨 두 개가 원본과 어긋난다 (M6).

## 3. MINOR 이슈 (BLOCKING 없음)

**M1. 벡터 밖 codec edge case 6건이 다르게 동작한다.** 이 때문에 work order의 "기존 Python과 동등한 canonical v1 codec"은 95개 벡터 범위 안에서만 입증된다.
- `/prototype/context?v=1#`, `/prototype/context#`: Python은 빈 fragment를 허용해 OK, TS는 `invalid_url`.
- `///prototype/context?v=1`: Python은 `urlsplit`이 빈 netloc으로 보고 OK, TS는 `invalid_url`.
- `a_b:foo`: Python `invalid_route`, TS `invalid_url`.
- `equipmentGroup`의 `id`가 객체(`{"id":1}`)나 `NaN`일 때: Python `invalid_id`, TS `invalid_condition`. TS의 regex 기반 중복 key 탐지가 중첩 객체 key까지 세고, `JSON.parse`는 NaN을 거부하기 때문.
- `\ud800` 이스케이프가 든 Condition: Python은 `serialize`에서 `UnicodeEncodeError`(ContractError 아님)로 실패하고 TS는 성공한다. **Python 원본 쪽 결함**이다.

TS가 더 엄격하거나 오류 코드만 다른 경우이고, Shell은 `pathname+search`로 `/prototype/context`를 조립하므로 앞의 3건은 앱에서 발생하지 않는다. 계약(§6.4 "형식 오류는 거부") 위반은 아니다. 권고: 동등성 주장을 "95 벡터 범위"로 한정하거나, 이 사례를 벡터에 추가하고 기대 차이를 기록한다. Python 결함은 원본 담당 결정 사항으로 보고한다.

**M2. 타입 수준 slot 강제에 우회로가 있다.** 확인한 사례는 `const x = {...slots, header: 'x'}; <PlatformPage {...x}/>`와 `<PlatformPage {...slots} data-global="x"/>`이고, 둘 다 `tsc` exit=0이다. 런타임 exact-key 검사(key 8개 → throw)가 막기는 한다. 그러나 work order의 "children/전역 header slot 및 임의 prop은 타입 검사에서 거절"은 과장이다. 정확한 표현은 "직접 JSX 속성은 타입 거절, spread·`data-*`는 런타임 거절"이다. §8 "이 Slot 외의 위치에 페이지가 직접 전역 UI를 삽입하지 않는다" 자체는 충족된다.

**M3. Registry의 `requiredPermissions`/`requiredScope`를 Shell이 소비하지 않는다.** §5 표는 이 정보의 책임을 "플랫폼의 노출 판단과 서버의 접근 검증"으로 정하고, §9 Sidebar 기능은 "Permission-aware visibility"를 둔다. 제외 목록의 "권한 엔진"과 사용자 확인 #1(SSO/서버 재검증)은 서버 측만 다룬다. 클라이언트 노출 판단 미구현은 제외 목록에도, 확인 목록에도 명시돼 있지 않다. 권고: 제외 항목이나 확인 항목에 명시한다.

**M4. Registry의 비-profile capability(time/lot/ppid/recipe/metricVersion)를 표시가 사용하지 않는다.** `ContextDisplay`는 `unapplied_globals`를 registry 값과 무관하게 항상 `'unsupported'`로 표시한다. 현재 3개 fixture가 모두 해당 축을 `unsupported`로 선언해 결과는 일치하지만, 선언과 표시가 연결돼 있지 않다. codec이 해당 축을 해석하지 않으므로 "미적용" 표시는 사실과 맞다.

**M5. back/forward 테스트가 실제 `history.back()`가 아니다.** `replaceState(origin)` 후 `popstate`를 직접 발생시키므로 핸들러가 URL을 다시 읽는지만 증명하고, 브라우저 history stack 왕복은 증명하지 않는다. 실제 브라우저 검토는 work order에서도 미수행으로 명시했다.

**M6. 확인 표의 상태 라벨 2건이 원본과 다르다.**
- #4 "Context 편집 시 기존 Selection 처리 제품 UX"를 Open으로 표시했으나, 06 §6.4는 "조건 편집 시 기존 선택의 처리 UI는 **Candidate**이며"라고 쓴다.
- #6 "기간·지표 등 profile 밖 Context"를 Open으로 표시했다. 그러나 해당 계약(§6.3 datetime 형식, §6.4 "한쪽만 있으면 형식 오류로 거부한다", metricId+metricVersion 쌍)은 Decided다. 미결인 것은 **이 prototype의 구현 범위**다.

그대로 두면 coordinator 최종 목록에서 Decided 계약을 Open으로 오인할 수 있다. 권고: #6을 "구현 범위 보류(계약은 Decided)"로 고쳐 쓴다.

**M7. 범위 밖 시간 키가 형식 검증 없이 보존된다.** `from=2026-01-01T00:00:00Z` 단독 입력이 오류 없이 opaque로 보존되는 것을 확인했다(Python 원본과 동일). §6.3/§6.4는 `Z`와 한쪽만 있는 `from`/`to`를 형식 오류로 정한다. 모든 fixture가 time을 미지원으로 선언하고 조회도 없어 결과상 위반은 아니다. README와 work order도 이를 한계로 적었다. 시간 지원 메뉴를 추가하기 전에 반드시 닫아야 하는 항목으로 기록한다.

**M8. 경미한 표기 사항.**
- verification.log에 `npm ci` 단계가 없다(본 리뷰에서 재실행 확인).
- CSS가 DESIGN 토큰 대신 raw hex를 쓴다. §23은 Candidate이므로 위반은 아니다.
- palette에 메뉴 이름 필터 입력이 없다. §9 "Search Menu"가 있으나 §10이 메뉴 이동만 기본 책임으로 두므로 위반은 아니다.

## 4. 결론

- BLOCKING: **0**
- MINOR: **8** (M1–M8)
- 판정: **PASS-WITH-MINOR-ISSUES**

원본 계약·Python 원본·work order·prototype 코드는 수정하지 않았다. 이 리포트 파일만 새로 만들었다. `npm ci`/build가 prototype 디렉터리 안의 gitignore 대상(`node_modules/`, `dist/`, `.npm-cache/`)을 재생성했으며, `dist` 산출물 해시는 기존과 동일하다.
