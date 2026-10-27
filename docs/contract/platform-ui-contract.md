# 06. Platform UI Contract

> Status: 절마다 Decided / Candidate / Open / Deferred로 표기한다(문서 전체 상태 없음).  
> Scope: Analytics Platform UI / Platform Shell / Extension Contract  
> Related: `../overview/overview.md`, `../product/domain-menus.md`, `../architecture/frontend-ui-ux.md`, `../overview/roadmap-and-open-questions.md`

## 문서 소유권과 결정 상태

이 문서는 플랫폼 전역 UX / Scope / Context / URL / Menu Extension / Shell Slot / navigation IA의 단일 authoritative source다. `../product/domain-menus.md`는 도메인 capability catalog, `../architecture/frontend-ui-ux.md`는 구현 후보·리서치·화면 패턴, `../overview/roadmap-and-open-questions.md`는 결정 상태·미결 질문 및 Deferred 구현 가설, `../wireframes/app-shell.md`는 이 계약을 소비하는 셸 설계다. 외부 디자인 참고자료와 에이전트 스킬은 제품 계약의 근거가 아니다.

- **Decided**: 플랫폼 책임 경계와 명시적인 계약 규칙. 구현 완료를 뜻하지 않는다.
- **Candidate**: 별도로 Decided라고 명시하지 않은 배치·토큰·페이지 예시와 기술 선택. 아래에 명시한 셸 치수·테이블 밀도 결정은 제외한다. 독립 초안끼리 일치해도 승인으로 간주하지 않는다.
- **Open**: Scope 부모·자식 상속, 최초 기본 Δ, timeDomain assertion 공급 근거, 다중 Site의 같은 날짜·교대일/영업일 등 각 절에 명시한 미결 입력. URL 메커니즘과 Site→room_name→StGroup→Equipment 관계의 Decided 상태 및 공개 필드명·enum의 Candidate 상태와 구별한다.
- **Deferred**: 저장된 뷰 등 후속 구현 범위. 이 설계가 기능 제공 시점을 확정하지 않는다.

§5~6, §8~9, §11, §17, §19의 책임·행동 규칙은 Decided다. §7 셸 구조·치수는 2026-10-04 [ADR-0011](../adr/0011-design-direction-feedbackops-shell.md)로 FeedbackOps AppFrame 구조(레일 52px·사이드바 240/56px·상단 바 없음·페이지 머리 50px)로 Decided됐다. 치수 값의 단일 원본은 `packages/sdk/ui/src/styles/tokens.css`의 레이아웃 토큰이다(FeedbackOps `a8d768b8`에서 이전). §15 테이블 밀도(최소 32px)는 2026-09-21 `DESIGN.md` canonical 값으로 Decided다. §23 토큰 값의 원본은 ADR-0011로 Decided이며, 나머지 §23 정책·§25 반응형 정책은 아직 Candidate다. 구현 순서와 남은 일은 [`.planning/README.md`](../../.planning/README.md)가 관리하며 이 문서의 계약 상태와 별개다.

구현 순서·배치 시점은 Deferred이며, 이 문서의 계약은 각 기능이 구현될 때 따라야 할 조건이다. 와이어프레임에 표현됐다는 이유만으로 해당 기능의 구현이 승인되지는 않는다. 구체 셸 배치·사용자 작업·상태 시나리오는 `../wireframes/app-shell.md`가 관리한다.

## 절 → 문서

§ 번호는 분할 문서 안에서도 그대로다. 본문의 「06 §N」 약칭은 아래 표로 파일을 찾는다.

| § | 제목 | 문서 |
| --- | --- | --- |
| §1 | 문서 목적 | [platform-ui-contract.md](#1-문서-목적) |
| §2 | Product Design Direction | [platform-ui-contract.md](#2-product-design-direction) |
| §3 | Platform UI Architecture | [platform-ui-contract.md](#3-platform-ui-architecture) |
| §4 | Platform Kernel Responsibilities | [kernel.md](kernel.md#4-platform-kernel-responsibilities) |
| §5 | Menu Extension Contract | [kernel.md](kernel.md#5-menu-extension-contract) |
| §6 | Context Capability Contract | [kernel.md](kernel.md#6-context-capability-contract) |
| §7 | Application Shell | [layout.md](layout.md#7-application-shell) |
| §8 | Shell Slots | [layout.md](layout.md#8-shell-slots) |
| §9 | Information Architecture | [kernel.md](kernel.md#9-information-architecture) |
| §10 | Command Palette as Platform Navigation | [kernel.md](kernel.md#10-command-palette-as-platform-navigation) |
| §11 | Global Context Bar | [kernel.md](kernel.md#11-global-context-bar) |
| §12 | Canonical Page Archetypes | [layout.md](layout.md#12-canonical-page-archetypes) |
| §13 | Shared Component Layers | [components.md](components.md#13-shared-component-layers) |
| §14 | Platform Component Promotion Rule | [components.md](components.md#14-platform-component-promotion-rule) |
| §15 | Platform Data Table Contract | [components.md](components.md#15-platform-data-table-contract) |
| §16 | Analysis Chart Contract | [chart.md](chart.md#16-analysis-chart-contract) |
| §17 | Permission-aware UX Contract | [kernel.md](kernel.md#17-permission-aware-ux-contract) |
| §18 | Data Trust Contract | [components.md](components.md#18-data-trust-contract) |
| §19 | Loading / Empty / Error Taxonomy | [components.md](components.md#19-loading--empty--error-taxonomy) |
| §20 | Detail Surface Contract | [components.md](components.md#20-detail-surface-contract) |
| §21 | Saved View Contract | [kernel.md](kernel.md#21-saved-view-contract) |
| §22 | Cross-menu Context Link | [cross-menu-links.md](cross-menu-links.md#22-cross-menu-context-link) |
| §23 | Design Tokens | [components.md](components.md#23-design-tokens) |
| §24 | Visual Anti-patterns | [platform-ui-contract.md](#24-visual-anti-patterns) |
| §25 | Responsive Strategy | [layout.md](layout.md#25-responsive-strategy) |
| §26 | Accessibility Baseline | [platform-ui-contract.md](#26-accessibility-baseline) |
| §27 | Performance UX Baseline | [platform-ui-contract.md](#27-performance-ux-baseline) |
| §28 | Platform Governance | [platform-ui-contract.md](#28-platform-governance) |
| §29 | Platform-first Definition of Done | [platform-ui-contract.md](#29-platform-first-definition-of-done) |
| §30 | Final Design Target | [platform-ui-contract.md](#30-final-design-target) |

## 1. 문서 목적

이 문서는 개별 메뉴의 화면 디자인을 정의하는 문서가 아니다.

이 프로젝트의 1차 목적은 **설비관리·분석·지표·VOC 같은 개별 기능을 만드는 것보다, 서로 다른 업무 메뉴가 같은 규칙으로 올라갈 수 있는 분석 플랫폼 자체를 만드는 것**이다.

따라서 UI 설계의 우선순위도 다음 순서를 따른다.

1. Platform Kernel
2. Platform-wide UX Contract
3. Menu Extension Contract
4. Shared Components / Patterns
5. Domain-specific Pages

개별 메뉴는 플랫폼을 검증하는 대표 Consumer다. 첫 분석 화면이나 설비관리 화면을 잘 만드는 것 자체가 성공 기준이 아니라, 그 과정에서 만든 계약을 두 번째·세 번째 메뉴가 재사용할 수 있어야 한다.

단, 플랫폼을 목표로 한다는 이유만으로 처음부터 범용 위젯 엔진·외부 플러그인 SDK·저코드 빌더를 만들지는 않는다. **메뉴에서 나온 책임은 실제 메뉴 2~3개에서 반복이 확인된 뒤에만 플랫폼 기능으로 승격**한다. §4 Platform Kernel 책임은 이 반복 기준의 대상이 아니다(§24 적용 범위).

---

## 2. Product Design Direction

이 플랫폼은 마케팅형 SaaS가 아니라 **고밀도 Enterprise Analytics / Operations SaaS**다.

시각적으로는 다음 성격을 결합한다.

| 영역 | 참고할 UX 성격 |
| --- | --- |
| Application Shell | 운영 SaaS처럼 빠른 탐색, 명확한 내비게이션 |
| Analytics | BI처럼 재현 가능한 필터·드릴다운·지표 문맥 |
| Time-series | Ops 도구처럼 시간범위·Brush·주석·상태 가시성 |
| Master Data | Admin 도구처럼 고밀도 Table·Drawer·Audit |

핵심 인상은 **Professional / Technical / Calm / Dense / Precise**다.

### 디자인 원칙

1. **Platform before Page** — 페이지마다 새 패턴을 만들지 않는다.
2. **Context First** — 현재 기간·설비·Lot·Metric Version·Scope를 항상 식별 가능하게 한다.
3. **State is Visible** — Freshness, Coverage, Permission Scope, Filter, Version을 숨기지 않는다.
4. **Dense, not Crowded** — 정보 밀도는 높게, 장식 밀도는 낮게 유지한다.
5. **Progressive Disclosure** — 세부 정보는 Drawer/Popover/Drill-through로 확장한다.
6. **Reproducible Navigation** — 화면 이동은 분석 문맥을 잃지 않아야 한다.
7. **Partial Failure Tolerance** — 한 위젯 실패가 전체 페이지 실패가 되지 않게 한다.
8. **No Silent State Change** — 사용자가 모르는 사이 필터·지표 버전·Scope가 바뀌지 않는다.

---

## 3. Platform UI Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                     Platform Kernel                           │
│                                                               │
│  Auth Context / Menu Registry / Route Contract               │
│  Global Context / Permission Scope / Command Palette          │
│  Saved View / Data Trust / Audit-aware UX                     │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    Platform UI Services                       │
│                                                               │
│  Page Layout / Filter Bar / Data Table / Chart Frame          │
│  Detail Drawer / State Feedback / Export / Context Link       │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    Menu Extension Contract                    │
│                                                               │
│  manifest + route + permission + supported context            │
│  page actions + data trust + deep-link behavior               │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                       Domain Menus                            │
│                                                               │
│  Equipment / Master Data / Analytics / Metrics / VOC / ...   │
└───────────────────────────────────────────────────────────────┘
```

App Shell은 Kernel을 소비하는 별도 패키지다. 페이지는 App Shell을 직접 수정하지 않는다. 플랫폼 기능은 개별 메뉴 import 관계를 알지 못해야 한다.

---

## 24. Visual Anti-patterns

### Card Soup

모든 데이터를 독립 Card로 감싸지 않는다.

### Hidden Context

Equipment / 기간 / Metric Version / Scope가 분석 중 사라지지 않아야 한다.

### Silent Drill-down

차트 클릭이 모르게 Global Filter를 바꾸지 않는다.

### Filter Duplication

페이지별 Date Picker / Equipment Selector를 따로 만들지 않는다.

### Domain Leakage into Shell

`if menu === equipment` 같은 Domain 분기를 Shell에 추가하지 않는다.

### Premature Platformization

한 화면에서만 쓰이는 복잡한 도메인 컴포넌트를 범용 프레임워크로 일반화하지 않는다.

**적용 범위(Decided, 2026-09-22):** "실제 소비자 2–3곳에서 반복될 때 승격"은 메뉴에서 나온 패턴을 공통 컴포넌트로 추출할 때의 기준이다. §4 Platform Kernel 책임(App Shell, Menu Registry, 전역 Context, 딥링크, 권한·Scope, 감사, 메뉴 활용률 계측)은 그 정의상 플랫폼 기능이므로 메뉴 반복을 기다리지 않고 Kernel 준비 순서에 따라 판단한다.

### Decorative Visualization

업무 판단에 기여하지 않는 Gauge, Gradient, 3D Chart를 사용하지 않는다. **경계(Decided, 2026-09-22):** 기본값은 분모가 있는 비율(예: 가동률, 완료율)에 한해 donut만 허용하고, 게이지·스피드미터류(3D/그라디언트 포함)는 기본적으로 쓰지 않는다. 전면·영구 금지는 아니다 — 특정 업무 판단에 실제로 기여한다는 근거가 확인되면 케이스별로 예외를 추가할 수 있다.

---

## 26. Accessibility Baseline

분석 UI라고 접근성을 후순위로 두지 않는다.

최소 원칙:

- 색만으로 상태 구분 금지
- Keyboard focus visible
- 메뉴 사이 이동(링크·팔레트·공간 전환·메뉴 사이 Back/Forward) 뒤 포커스는 새 화면 제목으로 간다(분석 보드의 제목은 프로그램 포커스 전용 `tabindex=-1`이라 Tab 순서에 들지 않고 링을 그리지 않는다 — 다음 Tab은 첫 컨트롤의 보통 링으로 간다, #914). 예외: 화면이 `arrivalTarget`(연결된 요소를 돌려주는 `() => HTMLElement | null`)을 등록했으면 `page`·`return` 도착은 제목보다 먼저 그 요소로 가고(호스트 모듈 화면이 쓴다, #804), 연결된 요소가 없으면 제목이다. `drill`은 등록과 무관하게 현재 단계다. 같은 화면 안 상태 변경은 포커스를 옮기지 않는다(예외: `AuditTimeline`의 `이전 변경 이력 더 보기`가 성공하면 붙은 첫 항목(없으면 끝 캡션)으로 — 포커스가 아직 그 버튼에 있을 때만, §13·ADR-0085). 그 도착(복귀 포함) URL에 `focus=`가 있어 상세 패널이 함께 열려도 패널은 포커스를 가져가지 않는다(§13)
- 같은 화면 안 상태 변경으로 포커스된 컨트롤이 사라질 때: 관리 필터의 `필터 초기화` 버튼이면 같은 컨테이너의 첫 필드로, 상세 패널 안(탭 전환 포함)이면 §13에 따라 선택된 탭(없으면 패널)으로, Scope 게이트 동작 버튼, 표 URL 경고의 `초기화` 버튼, 주소 오류 화면의 `조건 초기화`와 지표 확인 실패의 `이 지표 쌍 지우기`(#389), 관리 화면 필터 키 경고 안의 `필터 초기화`(#389)면 main 랜드마크(셸 밖에서는 페이지 본문 요소)로 간다. 드릴 형식 오류의 `잘못된 단계 지우기`는 드릴 포커스 규칙(현재 단계 칩, 없으면 제목)을 따른다(#389). 홈 즐겨찾기 목록의 `즐겨찾기에서 제거` 버튼이면 다음 행의 제거 버튼(없으면 이전 행의, 그것도 없으면 빈 상태 문단)으로 간다 (#398). 그룹 배너가 사라질 때는 §19를 따른다(상세 패널 안이면 패널, 아니면 main). 어느 경우든 사용자가 이미 옮긴 포커스는 빼앗지 않는다 (#353)
- 가려진(중지된) 소유 표면의 상세는 포커스를 가져오지도 앞 화면으로 돌려주지도 않는다(§13 소유 표면 중지, [ADR-0088](../adr/0088-surface-pause-detail-slot.md)). 보드 복원·도착 때 포커스 우선권은 [ADR-0087](../adr/0087-board-minimize-restore-history.md)의 표를 따르고, 복원은 중지된 상세에 포커스를 두지 않는다.
- 차트 주석 삭제 확인 행(§16)은 삭제가 끝나 다시 조회한 뒤 사라진다. 그때 포커스가 아직 그 확인 행에 있을 때만 다음 본인 주석의 삭제 버튼으로, 없으면 차트의 주석 컨트롤(꺼져 있으면 구간 선택)로 옮긴다. 사용자가 이미 다른 곳으로 옮겼으면 빼앗지 않는다 (#399)
- Modal Dialog는 focus trap; 비모달 DetailDrawer는 §13 포커스 진입·복귀와 목록 이동 허용
- Chart title / unit / textual summary 제공
- Chart와 동일 데이터의 Table 접근 경로 제공
- icon-only action에는 accessible label
- 오류 메시지는 원인/행동을 텍스트로 제공
- fill 페이지 머리 접기의 토글 이름·포커스 이동·안내 규칙은 §12.8이 소유한다(#680)
- 작업 영역 높이 방식(§12.8, #686): 라디오 묶음 이름 `높이 방식`(도구줄 `SegmentedRadio`, 호스트 메뉴에서는 보이는 이름표에 `aria-labelledby`)과 옵션 `화면 맞춤`/`아래로 쌓기`(툴팁이 하는 일을 설명), 좁은 폭에서 비활성이면 이유(`좁은 폭에서는 화면 맞춤으로 보입니다`)를 `aria-describedby`로 읽는다. 줄 경계 `role=separator`의 이름(줄 사이·마지막 줄 아래 두 형태)과 px 값은 §12.8 "경계"가 정하고, 그룹 `⋯`의 `아래 새 줄로 옮기기`는 끌지 않고 새 줄을 만드는 키보드 경로이며 아래 띠(`여기에 놓으면 아래에 새 줄`)는 끌기 전용이다
- §19 공유 응답은 배너 하나가 announce하며 그룹 위젯에는 중복 alert/status live region을 두지 않는다
- 선택 상태는 색 + shape/text 병행
- 입력 기준(Decided, 2026-10-12): 사용자는 Windows에서 키보드와 마우스를 함께 쓴다. 키보드 동작·단축키 표기·스크린리더 주장은 Windows 기준으로 설계·검증하고, macOS 확인은 Windows 스크린리더 동작의 증거가 아니다. 위 키보드 하한(Tab·Enter·Space·Escape로 모든 컨트롤 도달·조작, 끌기 같은 포인터 제스처는 끌지 않는 경로 유지)은 그대로다. 예외: 표 열 너비 조절은 마우스 끌기만 둔다([ADR-0024](../adr/0024-table-column-controls-drag-width-pin-in-list.md)). `LegendTree`의 행 이동은 APG 트리 방향키를 쓰고, 나머지 조작은 Tab·Enter·Space로 제공한다([ADR-0057](../adr/0057-legend-tree-arrow-key-row-navigation.md)). `onDrill`이 있는 `LegendTree`는 Enter를 드릴 가능한 행(`drillOnly`·`canDrill`이 true·`canDrill`이 없으면 자식 있는 행)의 드릴로 쓰고 행의 드릴 버튼은 `tabIndex=-1`이다([ADR-0084](../adr/0084-legend-tree-drill.md)). 단축키는 그 사용자의 잦은 일을 빠르게 할 때만 더하고, 기본 경로로 일을 끝낼 수 있으면 키보드 전용 모드·화면 단축키 안내를 따로 만들지 않는다
- 모션은 공유 FeedbackOps 모션 토큰(150/200/300ms, 표준·진입·퇴장 곡선)과 overlay 진입 모션을 그대로 쓰고(overlay는 진입만 — 닫히는 레이어가 남아 있으면 다음 Escape를 가로채므로 닫으면 바로 사라진다, FO ADR-0063 개정·#312), `prefers-reduced-motion`에서는 공유 CSS가 지속 시간을 사실상 0으로 줄인다. 플랫폼에서 모션을 덮어쓰지 않는다

---

## 27. Performance UX Baseline

플랫폼의 성능 문제를 Skeleton으로 숨기지 않는다.

UI 계약:

- Query timeout / cancellation
- 장기 Query에는 취소/기간 축소/집계 수준 변경 경로 제공
- Progressive or partial rendering where meaningful
- large table virtualization
- server-side aggregation/downsampling
- stale data 여부 표시
- 동일 Context 재조회는 기존 데이터를 유지하며 `Refreshing` 표시 가능(§11)
- route transition 중 Context 혼동 방지

차트에 원본 로그 전체를 내려보내고 프론트에서 DataZoom으로 해결하는 방식은 금지한다.

---

## 28. Platform Governance

새 메뉴 PR은 UI가 예쁜지만 보지 않는다.

다음을 리뷰한다.

### Platform Contract

- Menu Registry를 통해 등록됐는가?
- 지원 Context를 선언했는가?
- 공통 Page Slot을 사용하는가?
- Route/Deep-link 규칙을 따르는가?
- Permission Scope가 전 구간에 적용되는가?

### Reuse

- 기존 Platform Component로 해결 가능한가?
- 페이지 전용 구현이 플랫폼 기능을 중복하고 있지 않은가?
- 반대로 한 번만 쓰는 기능을 과도하게 일반화하지 않았는가?

### Data Trust

- 데이터 기준시각을 확인할 수 있는가?
- 필요한 지표 버전/coverage를 확인할 수 있는가?
- Empty/Error/Permission 상태가 구분되는가?

### Interaction

- Global / Page / Chart 상태가 분리됐는가?
- 메뉴 이동 시 Context 전달이 명시적인가?
- Browser back/forward 동작이 예측 가능한가?

---

## 29. Platform-first Definition of Done

새 기능의 완료를 다음 두 층으로 나눈다.

### Domain Done

- 해당 메뉴 요구사항이 동작함
- 숫자/CRUD/상태전이가 정확함

### Platform Done

- 공통 계약 위에 올라가 있음
- 다른 메뉴와 Context가 연결됨
- 권한/Scope가 일관됨
- 공통 Loading/Error/Data Trust 규칙을 사용함
- 재사용할 가치가 확인된 책임은 Platform Component로 추출됨
- 추출하지 않은 Domain-specific 책임도 명확함

**Domain Done만 만족하면 플랫폼 개발 관점에서는 완료가 아니다.**

---

## 30. Final Design Target

> 새 메뉴가 추가될 때 플랫폼 코드를 계속 고쳐야 한다면 플랫폼 설계가 실패한 것이다.

이 플랫폼은 **작은 Kernel + 명시적 Contract + 검증된 Shared Component + 독립적인 Domain Menu** 구조를 목표로 한다.
