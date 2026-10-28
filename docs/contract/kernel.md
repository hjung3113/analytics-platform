# Kernel 기능

> Scope: Menu Registry·전역 Context·URL 계약·권한·Scope·Audit 등 Kernel이 소유하는 책임과 규칙.  
> 포함 절: §4, §5, §6, §9, §10, §11, §17, §21  
> 색인과 「절 → 문서」 대응표: [06. Platform UI Contract](platform-ui-contract.md)  
> 상태 표기(Decided / Candidate / Open / Deferred): [문서 소유권과 결정 상태](platform-ui-contract.md#문서-소유권과-결정-상태)

## 4. Platform Kernel Responsibilities

Platform Kernel이 소유해야 하는 UI 책임:

- Application Shell
- Workspace 전환(권한 기반 노출, §9.1)
- Menu Registry
- Route/Search Parameter Contract
- Global Context
- Permission / Scope Context
- Breadcrumb 생성
- Command Palette
- Favorite / Recent Menu
- Saved View 진입점
- Page-level Action Slot
- Data Trust 표시 표준
- 라우트 단위 Error Boundary(메뉴 화면 렌더 실패를 콘텐츠 슬롯에 가두고 Correlation ID를 표시한다. 보고는 어댑터 `reportClientError`에 식별 필드만 보낸다)
- Toast / Modal infrastructure (확인 대화상자 헬퍼는 후보)
  - Toast: 톤은 `info`·`warning`·`danger`, 한 번에 4개까지 남고(넘친 토스트의 타이머는 함께 정리) 기본 5초(`durationMs`는 본질적 시간 제한에만), 액션 토스트는 `durationMs`가 없으면 자동으로 닫히지 않고 누르거나 닫을 때까지 남는다. `toast(text, tone?, detail?, { action?, durationMs? })`는 id를 돌려주고 `dismissToast(id)`로 호출자가 닫는다. 선택 `action`은 `{ label, onAction }` 버튼 하나이며 누르면 한 번 실행하고 토스트를 닫는다. 모든 토스트는 포커스나 포인터가 안에 있는 동안 자동 닫힘을 멈추고 벗어나면 처음부터 다시 센다. 포커스가 아직 토스트에 닿지 않은 사용자는 이 멈춤을 쓰지 못하므로, 소비자는 액션을 토스트 밖에서도 할 수 있게 하거나 제한 시간이 본질적이어야 한다(미뤄 둔 커밋의 되돌리기 창 등, WCAG 2.2.1 essential 예외 — 이때만 `durationMs`를 준다). 다리로 붙은 화면의 되돌리기·다시 불러오기·링크 토스트를 위한 것이다(#761 k2, #595).
    - 위치(#886): 스택은 뷰포트가 아니라 **콘텐츠(main) 열**의 아래 가운데에 놓인다(폭은 열 폭 − 32px와 420px 중 작은 값, 아래 여백 16px). 상세 aside·VOC 드로어는 열 밖이라 가려지지 않는다. 좁은 열(1280 + 내비 펼침 + 상세 ≈ 548px)에서도 가로로 넘치지 않고, 톤과 관계없이 새 토스트가 맨 아래, 오래된 것이 위인 한 목록이다. 분석 보드의 되돌리기 알림도 이 스택으로 올린다(`toast(text, 'info', undefined, { action, durationMs: 8000 })` — 8초는 본질적 되돌리기 창이다). 보드와 셸 알림이 한 곳·한 순서로 쌓이므로 서로 겹치지 않고, 보드는 자기 sonner `Toaster`를 두지 않는다. 열 아래에 붙는 막대·칩 줄이 있는 화면은 그 높이만큼 스택의 아래 여백을 올려 토스트가 그것을 가리지 않게 한다 — 분석 보드는 시트 띠(41px) 위로 아래 여백 56px이다. 낭독 문구는 토스트가 뜰 때의 언어로 한 번 정해지고, 뒤에 언어를 바꿔도 이미 낭독한 문구는 바뀌지 않는다. 스택은 보드 dock 칸 경계선 위에 놓인다(`z-[100]`). 포커스가 안에 있던 토스트가 닫히면(동작·닫기) 포커스는 `<body>`가 아니라 main으로 간다. 되돌리기 창은 `@ap/kernel`의 `UNDO_WINDOW_MS`(8초) 하나이고 보드 되돌리기와 다리가 같이 쓴다(#946 Q8). FeedbackOps가 시간 없이 보낸 동작 토스트(되돌리기)는 다리에서 이 창을 받고, `Infinity`(계속 둠)는 Kernel 기본값을 따른다.
    - 낭독: 스택은 한 번 만든 뒤 레이아웃이 바뀌어도 다시 마운트하지 않는다. 보이는 목록에는 `aria-live`·`role`이 없다. 낭독은 시각적으로 숨긴 지속 라이브 영역 둘(`aria-live="polite"` — info·warning, `aria-live="assertive"` — danger)이 맡고, 토스트가 올라오는 때 한 번 그 톤 이름(`알림`·`경고`·`오류`)과 본문·세부를 받는다(버튼은 제외). 레이아웃 변화나 닫힘은 다시 낭독하지 않는다.
  - ListToolbar(#886): 탭과 액션이 한 줄(50px)에 들어가면 한 줄이고, 툴바 **자신의 폭**(뷰포트 아님)이 탭 블록 최소 폭(22rem)과 액션을 함께 담지 못하면 액션이 탭 줄 아래 오른쪽 정렬 둘째 줄(줄마다 50px, 두 줄 100px)로 감싼다. 액션 줄도 툴바 폭을 넘지 않으며, 그래도 넘치는 액션은 그 줄 안에서 감싸 높이가 늘어난다(가로 스크롤·잘림 없음 — 소비자는 액션 묶음을 `flex-wrap`으로 둔다). 아래 규칙선은 border가 아니라 1px 오버레이라 줄 높이가 더해지는 값 그대로다. 툴바에는 높이를 적지 않는 고정 표지 `data-list-toolbar`만 두고(두 줄이면 고정 `50`이 거짓이 되고 측정값을 읽는 곳도 없다, #946 Q9) `role="toolbar"`는 쓰지 않는다.
- Theme / Design Token
- 공통 Keyboard Shortcut: ⌘/Ctrl+K 명령 팔레트, `[` 사이드바 접기/펼치기(입력 중 제외), Esc로 상세 패널(패널 안)·팝오버 닫기. 셸은 본문 바로가기 링크를 제공한다
- 메뉴 활용률 계측(진입·체류 이벤트는 어댑터로 전송하고, 콘솔은 집계만 읽는다)

현재 구현: 즐겨찾기·최근 방문(12건)·마지막 Scope 제안·사이드바 접힘·언어·표 열 설정은 브라우저 localStorage에만 저장된다(기기 간 동기 없음). 서버 보존 여부는 결정 대기(`.planning/README.md`).

### Kernel이 소유하지 않는 것

- Equipment-specific business logic
- 특정 지표 계산 로직
- 특정 분석 차트 configuration
- VOC 상태 전이 규칙
- 개별 메뉴만 사용하는 Form schema

Domain logic이 Kernel로 역류하지 않도록 한다.

---

## 5. Menu Extension Contract

초기에는 외부 설치형 플러그인이 아니라 **코드 내부 선언형 Menu Registry**로 시작한다.

메뉴·그룹이 선언하는 개념적 정보(Decided — 그룹 표시 행만 Candidate):

| 정보 | 책임 |
| --- | --- |
| 식별자·그룹·이름·경로·아이콘 | 메뉴 탐색과 현재 위치 표시 |
| 필요한 권한·Scope | 플랫폼의 노출 판단과 서버의 접근 검증 |
| 지원 Context | 기간·설비·Equipment Group의 두 층·room_name·Lot·PPID·Recipe·지표 버전의 지원 여부 명시 |
| 페이지 유형 | overview / analysis / management / catalog / workflow |
| 선택 기능 | 내보내기·저장된 뷰·주석·비교 지원 여부 |
| 조회 엔드포인트 (2026-10-01) | 메뉴가 부르는 서버 조회마다: 식별자·소유 메뉴·허용 입력 키·데이터 접근 권한(메뉴 권한과 달라도 됨)·Scope 요구·적용 Context(메뉴가 적용하는 키의 부분집합)·적용 assessment kind(§19)·조회 한도·시간역 병합 가드 적용 여부(`mergeTimeDomain`, §6.3). 요청에는 적용 Context와 입력만 실리고, 서버는 요청이 아니라 자기 선언 사본으로 권한·kind·한도를 판정한다. 선언과 다른 요청 모양(적용하지 않는 Context 키, 적용 키 누락, 선언 밖 입력 키)은 오류다. Scope를 요구하지 않는 조회는 site에 묶인 Context(room_name·Condition·Selection·Lot·Recipe·PPID, §22)를 적용할 수 없다 |
| 쓰기 동작 (2026-10-20) | 서버 쓰기는 메뉴가 동작마다 선언하고(`ActionSpec`: 식별자·소유 메뉴·허용 입력 키·권한·Scope 요구·동시성 방식 `none`/`version`·성공 뒤 다시 읽을 조회) 포트의 범용 `menuAction` 하나로 보낸다. 요청에는 동작 id·`scopeId`만 든 `context`·`input`·멱등 키·(버전 방식이면) `expectedVersion`이 실린다. 답은 조회 `ApiResponse`가 아니라 쓰기 전용 `ActionResponse`(`outcome` `ok`·`invalid`·`conflict`·`forbidden`·`not_found`·`error`·`unknown`, 필드 오류, `replayed`)다. 서버 판정 순서·멱등 기록·버전 충돌은 [ADR-0054](../adr/0054-write-port-declared-actions-idempotency-version.md)와 [실서버 체크리스트](../integration/real-server-checklist.md) §3. 구현 형식(Candidate): `packages/sdk/contracts/src/adapter/action.ts`. Kernel 훅은 #502. |
| Sidebar 그룹 표시 (`hideLabelWhenSingle`, Candidate) | 그룹이 선언하면 확장된 사이드바에서 보이는 메뉴가 하나일 때 섹션 제목을 생략한다. 기본값은 생략하지 않음 |

**열린 메뉴 어휘(Decided, [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)):** 그룹 id·공간 id·메뉴 권한은 `@ap/contracts`의 브랜드 문자열이고(`groupId('…')`·`spaceId('…')`·`menuPermission('…')`로 만든다), SDK는 그 값 목록을 갖지 않는다. 닫힌 목록은 앱이 선언한다 — 공간·그룹은 `SPACES`·`GROUPS`, 메뉴 권한은 `createRegistry({ permissions })`에 넘기는 목록이다. `createRegistry`는 선언되지 않은 그룹·공간·권한과 모양이 틀린 id를 `RegistryError`로 거부하고, Kernel 고유 권한(`KERNEL_PERMISSIONS`)과 앱이 선언한 권한의 `:` 앞부분을 모듈 id가 쓸 수 없는 예약 네임스페이스로 본다. 전체 목록은 `registry.permissions`다. 새 그룹·공간·권한은 계약 패키지가 아니라 앱 조립 파일을 고친다.

메뉴와 그룹이 선언하고 Shell이 소비한다. 필드명·TypeScript 타입·등록 방식은 구현 설계에서 구체화한다(그룹 표시 행의 필드명 `hideLabelWhenSingle`은 Candidate). 조회 엔드포인트 선언의 구현 형식(Candidate)은 `packages/sdk/contracts/src/menu/menu-query.ts`의 `EndpointSpec`이고, 결정과 이유는 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md)다.

페이지 키(`pageKeys`·`contextResetKeys`), 상세 경로(`parent`·`navHidden`), Scope 필요 여부(`requiresScope`), 지표 초기화(`initializesMetric`), 그룹 대표(`primary`, 그룹당 정확히 하나)도 메뉴가 선언한다. `createRegistry`가 시작 시 중복·충돌·공간 규칙을 검증한다([패키지 경계](../integration/platform-packages.md) §5). 필드명은 Candidate다.

사이드바 하위 항목(`navViews`, Candidate, [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md), #761): 메뉴가 `{ id, label, page }[]`를 선언하면 펼친 사이드바가 그 메뉴 행 아래에 들여 쓴 행을 하나씩 그리고, 각 행은 그 메뉴로 `page` 프리셋을 붙여 이동한다(공간 `carriedPageKeys`는 현재 화면 값을 따른다). Registry는 프리셋이 비어 있지 않을 것(빈 `page`는 부모 행과 같은 곳을 가리키는 중복 행), 프리셋 키가 그 메뉴의 `pageKeys`일 것, 공간 `carriedPageKeys`·`focus`가 아닐 것, 메뉴 안에서 `id`가 겹치지 않을 것, ko/en 라벨이 비어 있지 않을 것, `navHidden` 메뉴에 두지 않을 것을 검증한다. 보기가 현재인 때는 프리셋 키가 모두 URL의 page 값과 같을 때이고(여럿이면 키가 가장 많은 것) 그때는 **그 보기만** `aria-current="page"`를 갖고 부모 행은 갖지 않는다. 일치하는 보기가 없으면 부모 행이 기존 규칙을 유지한다. 접힌 사이드바(56px)는 하위 항목을 그리지 않는다. 보기는 팔레트 항목도 즐겨찾기·최근 방문 대상도 아니다.

화면(`component`) 없이 manifest만 등록한 메뉴도 허용한다. 사이드바·팔레트에 '예정'으로 표시되고 선언(권한·pageType·Context capability)만 보여 준다.

**조회 실행 선언(Decided, [ADR-0061](../adr/0061-query-draft-applied-address-and-required-gate.md)):** 선택적 `query: { mode: 'apply', required?: { context?: ContextKey[], page?: {key,label: Text}[] } }`로 일괄 적용을 선택한다. 부재는 live 모드다. Apply는 time capability가 apply여야 하며 필수 Context는 메뉴가 apply하는 알려진 키, 필수 page는 `pageKeys`와 비어 있지 않은 ko/en label이어야 한다. Scope는 `requiresScope`로 선언한다. 엔드포인트의 선택적 `requiredContext`도 그 엔드포인트가 apply하는 키만 받는다. Apply 메뉴와 엔드포인트가 함께 apply하는 키의 명시적 required 선언은 일치해야 한다(등록 검증). 보조 엔드포인트의 작은 투영에는 메뉴의 다른 필수 키를 강요하지 않는다. 서버는 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md)의 모든 투영 필드 구조적 존재 검사에 더해 required의 의미적 존재를 검사한다. 초안 API·실행은 §11, 서버 표본은 [연결 체크리스트](../integration/real-server-checklist.md) §4를 따른다.

### 금지

- 신규 메뉴 추가 때 Sidebar JSX 직접 수정
- 메뉴마다 Breadcrumb 수동 구현
- 페이지마다 별도의 Date Picker 구현
- 페이지가 권한에 따라 메뉴 숨김 로직을 직접 구현
- 메뉴별 임의 query parameter 규칙 생성

---

## 6. Context Capability Contract

§6.1–6.4와 §19의 세부 판정 근거·반례·Candidate 필드명 전체 목록은 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md`를 따른다.

전역 Context를 모든 메뉴가 무조건 소비하는 것은 아니다.

각 메뉴는 어떤 Context를 지원하는지 선언한다.

예:

| Menu | Time | Equipment | Lot | Metric Version |
| --- | --- | --- | --- | --- |
| Equipment Master | △ | O | X | X |
| 생산성 개요 | O | O | X | △ |
| 사이클타임 | O | O | O | O |
| Wafer Journey | O | O | O | △ |
| Metric Catalog | X | △ | X | O |
| VOC | X | X | X | X |

`O`: 직접 필터로 적용  
`△`: 전달/참조 가능하지만 직접 조회 필터는 아닐 수 있음  
`X`: 미지원

코드 어휘(이름 Candidate): Context 키 10종 `time`·`roomNames`·`line`·`prcGroup`·`condition`·`selection`·`lot`·`ppid`·`recipe`·`metric`(`scopeId`는 별도 키), 지원 값 `apply`(O)·`reference`(△)·`unsupported`(X).

VOC 행: `/voc`(내 VOC)는 `myActivity` 그룹의 FeedbackOps 신고자 화면(다리, [ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md), #654)이고 `/voc/:vocId`(내 VOC 상세)는 그 아래 navHidden 상세다. 세션 사용자 기준 읽기라 전역 Context를 모두 `unsupported`로 선언한다. 페이지 키는 `/voc`가 `q`·`status`·`sort`·`focus`(`focus`는 셸 상세 패널, 잘못된 값은 거부하고 보존, §6.4), 상세가 `returnTo`다. VOC 처리 워크플로는 FeedbackOps가 전담한다([ADR-0027](../adr/0027-feedbackops-stays-standalone-entry-links.md)).

### 규칙

다른 메뉴에서 전달된 Context를 대상 메뉴가 지원하지 않으면 조용히 폐기하지 않는다.

예:

```text
Inherited context
Equipment: EQP-013
Lot: A1023   · Not used on this page
```

Global Context와 Page-local Filter를 같은 Chip 스타일로 혼용하지 않는다.

상태 계층은 다음처럼 분리한다.

1. **Global Context** — 메뉴 간 전달
2. **Page Filter** — 현재 메뉴 조회에만 적용
3. **Visualization State** — Zoom / Brush / Series visibility
4. **Persistent Annotation** — 저장되는 도메인 객체

### 6.1 식별자와 URL 소유 상태 (Decided)

- 목적지 객체 식별자와 전달하는 분석 Context를 분리한다. `(equipmentId, entityType, anchor)`는 **occurrence 전용 식별키**다. `anchor`는 파서의 RecordSequence를 담은 **불투명 숫자 문자열**이다([ADR-0094](../adr/0094-occurrence-anchor-is-record-sequence.md)). 시각으로 해석하지 않고, 숫자로 비교·정렬하지 않으며, 한 `equipmentId` 안에서 같음만 비교한다(설비가 다르면 같은 값도 다른 occurrence). 안정 범위: 같은 입력을 같은 순서로 처음부터 처리하면 같은 값이고, 체인을 다시 만들거나 재처리하면 바뀔 수 있다. 그때 저장된 링크는 기존 `missing` 응답을 받으며 새 상태는 없다. occurrence 상세는 시작 시각을 키와 별도 필드로 받아 표시한다. `lotId` 같은 업무 ID는 occurrence 검색 보조이며 anchor 없는 occurrence 조인에 쓰지 않는다.
- Site가 활성 Scope에서 확립된 상태에서 설비 마스터의 객체 키는 `equipment_id` 하나다(전역 유일 ID, [ADR-0004](../adr/0004-site-is-db-partition-not-column.md)). EquipmentID로 Site DB를 추정하지 않는다. VOC는 `vocId`, 지표는 `metricId`와 `metricVersion`으로 식별한다. 도메인 객체에 occurrence 키를 강제하지 않는다.
- URL은 요청한 `scopeId`, `from`/`to`, `roomNames`, `lineNames`, `prcGroups`, `equipmentGroup`(Condition)와 `membershipBasis`(소속 기준), `selectedEquipmentIds`(Selection; 기존 `equipmentIds` 대응), `lotIds`, `ppid`, `recipeIds`, `metricId`/`metricVersion`, 해당 화면의 탭/저장된 조회조건 식별자 및 해당하는 경우 occurrence anchor를 소유한다(anchor는 숫자 문자열이다 — 시각 형식 검사와 "초 단위만 연다"는 규칙은 이 키에 적용하지 않고, 구문은 정규형 10진 `/^(0|[1-9][0-9]{0,18})$/`뿐이다). 공개 필드명·조건 인코딩은 별도 결정이 없으면 Candidate다. `equipmentGroup` 맵 확장과 `membershipBasis`는 ADR-0059에서 Decided로 정했다(#552 1부 계약·호환 구현). 객체 ID는 목적지 경로/계약에 따라 별도로 전달한다.
- **`lotIds` / `ppid` / `recipeIds`(필드명 Candidate, 축은 Decided)**: Lot은 논리적 묶음, Job은 실행 인스턴스이며 1:1이 아니다. PPID는 LEH `FlowId`, Recipe(`prc_name`)는 PRC `RecipeId`다. Recipe를 Lot 전체의 고정값으로 가정하지 않는다. `lotIds`/`recipeIds`는 집합 정규화, `ppid`는 단일값 후보로 등록한다. Operation은 v1 필터/URL 축에서 제외한다. Recipe 필터가 Job 전체를 포함할지 매칭 PRC 구간만 포함할지는 **Candidate / 메뉴별 정의**이며 Kernel이 강제하지 않는다.
- **Equipment Group 두 층(Decided, 2026-10-21 — [ADR-0059](../adr/0059-app-injected-equipment-axes-and-condition.md); #552 1부 계약·호환 구현)**: Condition은 앱이 주입한 axisId → 비어 있지 않은 value-id 배열의 맵이다. 서로 다른 축은 AND, 같은 축의 값은 OR이며 축 부재는 그 축 무제약이다. `equipmentGroup`은 단일 JSON 값으로 유지한다. Line·PRC 그룹은 Condition 축이 아닌 독립 전역 집합 키 `lineNames`/`prcGroups`다(2026-10-21 사용자 정정 — 소유자 #552·#513). v1 Maker+Model은 maker/model 단일값 AND 맵으로 읽는다(2026-10-21 구현에서 확정 — 코디네이터 결정, 사용자가 되돌릴 수 있음). Selection `selectedEquipmentIds`는 명시적으로 고른 **고정 EquipmentID 집합**이다. 조건만 선택했다고 결과 전체를 자동 물질화하지 않는다. [ADR-0002](../adr/0002-stgroup-materializes-to-equipment-ids.md)의 두 층 분리는 유지한다.
- **주입 축과 소속 기준(Decided, 2026-10-21; #552 1부 계약·호환 구현)**: 앱은 안정 `id`, 표시 `label`, `membershipHistory: boolean`, 선택적 `dependsOn: axisId` descriptor를 공급한다. 플랫폼은 닫힌 축 union 대신 axis-id 문자열을 주입 descriptor에 대조한다. 공개 API는 특정 업무 시스템·SQL·SP 구조를 모른다. `membershipBasis` 부재는 `current`(지금 소속), `asOf`는 그 시점 소속이다. 사용한 모든 축이 이력을 지원해야 `asOf`가 유효하고 아니면 거부한다(자동 current 전환 금지). 사용자가 기준을 고르며 서버가 소속 이력을 공급한다. `roomNames`는 기존 독립 집합 키다. Maker→Model 같은 의존 축은 서버가 선택한 부모 값 안에서 평가하며 클라이언트가 자식 값을 조용히 지우지 않는다.
- **Line / PRC 그룹(Decided, 2026-10-21 사용자 정정 — 소유자 #552·#513):** `lineNames`/`prcGroups`는 Site에 묶인 독립 집합 키이며 Scope 변경 때 지운다. 부재는 무제약, `lineSelection=none`/`prcGroupSelection=none`은 명시 공집합이고 ID와 표식을 함께 쓰면 오류다. Line은 room_name에 걸칠 수 있으며 권한 수준이 아니므로 Scope·room grant 외 별도 grant를 요구하지 않는다. `membershipBasis=asOf`는 Condition 또는 PRC 그룹이 있을 때만 유효하다. PRC 그룹은 서버 소속 이력 지원 키이고 Condition은 사용 축 전체의 이력 지원을 검증한다. 기준은 Condition·PRC 그룹과 함께 복사·투영하며 두 값이 모두 없으면 serializer가 기준도 생략한다.
- **room_name은 Global Context(Decided)**: 공개 집합 키 후보는 `roomNames`이며 도메인 값 `room_name`과 매핑한다. 요청 Scope 안의 조회 범위를 좁히며 권한을 부여하지 않는다. 집합 정규화/공집합 규칙을 따르고 Page Filter `processIds`를 별도로 만들지 않는다.
- **page-owned URL 키의 예시로 `granularity`(Candidate 필드명, Decided — 메커니즘)**: 조회 기간(`from`/`to`)과 집계 단위(시간별/일별/주별로 뭉쳐 보기)는 다른 축이다. 모든 메뉴가 집계 단위 선택을 갖는 게 아니므로 전역 Context Bar가 아니라 `metricId`+`metricVersion` 쌍과 같은 방식으로 화면마다 선언·등록하는 page-owned 계약으로 둔다. 값 후보: `hour`/`day`/`week`.
- 딥링크 왕복은 조회조건·명시 선택·지표 버전을 재현한다. live Condition은 재방문 시 선언한 소속 기준의 멤버/매칭 결과를 재평가하므로 대상 집합이 달라질 수 있음을 표시한다. Selection은 고정이며, 지연 완료·마스터 정정으로 숫자는 달라질 수 있으므로 결과에는 계산 기준시각을 표시한다.
- 단순 차트 줌은 로컬 상태다. Brush 후 명시적인 분석 구간 적용만 전역 Context/URL로 전달한다.
- 미지원 Context는 조용히 버리지 않고 적용되지 않음을 표시한다. 보존·재적용 방식은 §6.4를 따른다.
- `savedViewToken`은 긴 URL을 대체할 후보 계약으로 예약한다(Deferred; 저장된 뷰 자체는 §21, ADR-0092). 저장된 뷰 구현 전에는 토큰 생성이나 비활성 버튼을 셸 필수 요소로 두지 않는다.

**URL/JSON 케이싱과 매핑 소유 (Decided):** URL·JSON 공개 필드명은 camelCase, DB는 해당 스키마 관례(snake_case)를 유지한다. 컬렉션은 URL 반복 키(`equipmentIds=A&equipmentIds=B`), JSON은 배열로 직렬화한다(콤마 결합은 ID의 예약문자와 충돌할 수 있어 채택하지 않는다). 공개 계약(이름·타입·카디널리티·버전·지원 Context·page-owned 키 등록)은 플랫폼 Kernel이 소유하며 클라이언트 라우터와 서버 요청 검증은 같은 산출물을 소비한다. SQL 컬럼/조인/계산식 매핑은 서버 소비 계층이 소유하고 공개 필드가 DB 컬럼과 1:1이라고 가정하지 않는다. 구현 형식은 Zod 스키마 → JSON Schema(2020-12) 산출물이다(Decided, [ADR-0096](../adr/0096-contract-schemas-zod-source-and-reference-implementations.md)). OpenAPI는 원본이 아니다.

**집합 키 정규화와 공집합 표식 (Decided):** 집합 키(`selectedEquipmentIds`; 기존 `equipmentIds` 대응, `roomNames`, `lotIds`, `recipeIds`)가 URL에 부재하면 해당 명시 집합의 제약은 없다(Scope·권한·다른 조건·조회량 제한은 유지). Selection 부재는 Condition이 있을 때 그 소속 기준의 평가 결과 전체를 조회한다는 뜻이지 Condition까지 무제약으로 바꾸는 뜻이 아니다. 유효 ID 1개 이상이면 선택 집합이며 중복은 제거하고 순서는 무의미하다(정규 URL은 Unicode 코드 포인트 사전식 정렬, trim/대소문자 변환/유니코드 정규화로 서로 다른 ID를 합치지 않는다). 빈 문자열/공백만 있는 ID는 형식 오류다(반복 키는 항목이 0개면 키 자체가 사라지므로 `equipmentIds=`는 "빈 ID 1개"이지 "선택 0개"가 아니다). **명시적 공집합**은 집합 키마다 등록되는 단일값 표식으로 표현한다(필드명 Candidate, 예: Selection 집합의 `equipmentSelection=none`). 표식만 있으면 명시적 공집합, ID 키와 표식이 동시에 있으면 오류다. 공집합을 지원하는 메뉴는 나머지 요청이 유효할 때 `outcome=empty`로 처리하고, 공집합 때문에 잘못된 Scope/기간을 성공으로 바꾸지 않는다. **미지원 메뉴는 공집합을 미적용으로 보존할 뿐 자기 결과를 강제로 empty로 만들지 않는다.** 표식과 ID 집합은 한 논리 Context로 함께 전달·제거한다.

**Condition의 null / 빈 배열(Decided, 2026-10-21; #552 1부 계약·호환 구현):** 내부 `condition=null`은 URL `equipmentGroup` 부재이며 축 제약 없음이다. 맵 `{}`도 제약 없음으로 정규화해 키를 생략한다. URL의 JSON `null`·배열, 맵의 축 값 `null`·`[]`·빈 ID는 `invalid_condition`이며 보정하지 않는다. 값 배열은 기존 ID 집합처럼 중복 제거·정렬하되 ID를 변형하지 않는다. Condition 축에는 명시적 공집합 표식을 만들지 않는다. 기존 `roomNames=null`/`selection=null`은 키 부재, `[]`는 각각 `roomSelection=none`/`equipmentSelection=none`을 뜻한다. 이 변경은 다른 기존 집합 키의 표식도 바꾸지 않는다.

**단일값 키 중복 (Decided):** `scopeId`/`from`/`to`/`v`/`equipmentGroup`/`membershipBasis`/`ppid`/`metricId`/`metricVersion`/목적지 객체 ID 등 카디널리티 1인 키가 반복되면 같은 값이어도 형식 오류다. 클라이언트와 서버가 첫 값/마지막 값을 다르게 해석하는 것을 금지한다.

**전역 지표 Context: `metricId` + `metricVersion` 쌍 (Decided):** v1의 전역 지표 Context는 단일 `metricId`와 단일 `metricVersion`의 쌍이다. 두 필드는 공개 스키마에 함께 등록하고 함께 보존·적용·제거한다(전역 반복 키나 지표별 맵은 v1에 없음). 완성/초기화 불변식:
  - query에 둘 다 있음 → 완성된 전역 Context. 서버가 그 `metricId`에 그 `metricVersion`이 속하고 유효한지 검증하고, 실패하면 오류로 처리하며 최신 버전으로 대체하지 않는다.
  - query에 ID만 있음 → 초기화를 선언한 진입점에서만 미완성 입력으로 허용하고, 서버가 확인한 발행 버전을 URL에 기록한 뒤 조회한다. 확인 불가면 선택 상태, 초기화 미지원 경로는 계약 오류다.
  - query에 버전만 있음 → 목적지 경로 계약이 소유 `metricId`를 유일하게 정의할 때만 경로 ID를 query로 복사해 쌍을 완성한다. 세션·이전 화면·화면 이름으로 ID를 추정하지 않는다.
  - query에 둘 다 없음 → 전역 지표 Context 없음. 경로가 지표 하나를 유일하게 식별하고 초기화를 선언했다면 물질화 가능하고, 아니면 선택 상태다.
  - 목적지 객체의 지표 ID와 전역 `metricId`는 역할이 다를 수 있다(지표 A 문맥을 들고 지표 B 상세로 이동). 목적지 객체 ID로 전역 쌍을 몰래 덮어쓰지 않는다. 같은 지표를 요구하는 경로인데 ID가 다르면 오류다.
  - Context Link helper는 대상이 **동일한 `metricId`의 해당 버전**을 조회에 쓸 때만 쌍을 적용한다. 다른 지표·미지원 메뉴는 쌍을 보존하되 미적용으로 표시한다. 사용자가 명시적으로 바꾸거나 제거할 때만 쌍 전체를 변경한다.
  - 여러 지표 버전이 필요한 화면은 page-owned 계약으로 선언·등록·검증한다. 전역 단일값을 모든 위젯의 버전으로 확대 해석하지 않으며, 같은 지표에 전역 값과 page-owned 값이 상충하면 오류로 처리한다(묵시적 우선순위 없음).

**줌 vs 명시적 구간 적용, v1 소수초 처리 (Decided):** v1에서 URL/전역 Context로 적용되는 구간은 초 정렬 `[from, to)`뿐이다. 판정 기준은 구간 길이가 아니라 **선택한 양 경계가 초에 정렬돼 있는가**다. 미정렬이면 외향 정렬(시작은 이전 초로 내림, 끝은 다음 초로 올림) 미리보기를 보여주고 사용자가 확인해야 URL/전역 Context가 바뀐다. 확인 전에는 조회·URL을 바꾸지 않고, 취소하면 로컬 브러시만 유지한다. v1은 소수초 정확 구간 공유를 지원하지 않는다.

### 6.2 Scope와 권한 (Decided / Open)

- Scope는 사용자가 요청하는 조직·데이터 접근 범위이며 단위는 Site다. Site 안에서는 부여된 room_name만 보인다. `scopeId`는 URL에 담지만 권한 증명이 아니다. 서버는 **매 요청마다** 사용자 권한과 요청 Scope를 재검증한다.
- 접근할 수 없는 Scope는 명시적 오류/선택 상태로 처리하며 다른 Scope로 조용히 대체하지 않는다. 같은 URL이 다른 사용자에게 같은 접근 권한을 부여하지 않는다.
- 세션·최근방문 값은 미검증 후보이며, 재적용 전에 현재 Scope에서 설비·Lot 선택과 권한의 유효성을 다시 검증한다.
- **요청 `scopeId`는 하나다(Decided).** 부재는 명시적 선택 상태이며 임의 Scope로 대체하지 않는다. Scope 선택지 조회와 분석 데이터 조회는 구분한다. 사용자가 명시한 무단 ID는 조용히 제거하지 않으며, 전체 권한 실패는 `outcome=forbidden`이다(§19).
- **권한·조회 범위는 Site → room_name → StGroup → Equipment 관계를 따른다(Decided, 2026-09-24).** 실무 권한 부여 축은 Site 내 room_name이다. room_name과 StGroup은 여러 Line에 걸칠 수 있으며 Line은 독립 생산·조회 축이다. Factory는 별도 Scope 레벨로 모델링하지 않는다. [ADR-0005](../adr/0005-scope-room-name-line-independent.md)가 ADR-0001의 Line 중심 Scope 주장을 대체한다.
- 설비 분류(Maker → Model → ChamberType → EquipmentID)는 위 접근 범위와 별개다. StGroup은 room_name·Site 경계를 넘지 않는 설비 능력 묶음이며 분임조는 엔지니어 조직 묶음이다. 둘의 소속은 외부 공급값이다. Group 조건이나 Line 선택이 room_name 권한을 대신하거나 넓히지 않는다. 근거: [GLOSSARY](../../GLOSSARY.md).
- **요청 `scopeId`는 v1에서 단일 선택만 허용한다(Decided, 2026-09-22).** 복수 Scope 선택은 이후 확장 후보로 남기되 v1 범위 밖이다.
- **부모·자식 권한 상속 및 조회 필터 자동 포함의 세부 규칙은 Open domain decision이다.** room_name이 실무 권한 축이라는 결정과 구별한다. Site 선택만으로 모든 room_name에 대한 접근이 허용된다고 해석하지 않으며, 셸에 고정 다단 선택기를 요구하지 않는다.
- **Site는 물리 DB 경계다(Decided).** Site 선택은 컬럼 필터가 아니라 연결 대상을 정한다. 설비 ID 사용 전에 활성 Scope의 Site가 확립돼 있어야 한다. URL에 없는 `scopeId`를 세션에서 몰래 채우거나 EquipmentID로 Site를 역산하지 않는다([ADR-0004](../adr/0004-site-is-db-partition-not-column.md)).
- **Scope 확인 상태(현재 코드 어휘, 이름 Candidate):** `none`·`validating`·`valid`·`forbidden`·`unknown_scope`(서버가 모르는 id — 권한 거부가 아니다)·`error`(확인 요청 실패). `error`는 자동 재시도 없이 사용자가 '다시 시도'하며, 현재 세션에서 `valid`가 되기 전에는 Scope가 필요한 조회를 보내지 않는다.

<a id="ctx-time"></a>
<a id="63-시간-계약-decided-tz-값다중-사업장-같은-날짜는-open-domain-decision"></a>
### 6.3 시간 계약 (Decided; 다중 사업장 같은 날짜·교대일/영업일은 Open domain decision)

> **참조 `CTX-TIME` — 이 절이 전역 Context·URL 시간 계약의 원본이다.** 문서 탐색용 식별자이며 공개 API 버전이 아니다. 결정 상태·예외·미결은 아래 해당 문단을 읽는다. 위 두 anchor는 안정 참조와 과거 제목 링크 호환용이며 제목 변경 때도 유지한다.
>
> **의존:** [03 시간 계약](../architecture/backend-stack.md#시간-계약-중요--2차-리뷰에서-발견된-실수)의 원천 wall-clock, §6.1의 초 정렬·원천 정밀도 및 §6.2의 Scope, [01 R/H 정책 원본](../architecture/architecture-and-data-contract.md#late-arrival-policy). `defaultRangeTo`의 의미는 이 절, `R`/`H`의 의미는 01이 소유한다.

기간은 파서 원본과 같은 시간대 없는 설비 wall-clock으로 전달하며 임의로 UTC로 변환하지 않는다. 시간의 원천 의미는 `../architecture/backend-stack.md`를 따른다. 아래는 이 wall-clock 계약 위에서 **메커니즘 수준으로 확정한** 항목이다. TZ 실제 값은 한국(Asia/Seoul) 단일값으로 우선 확정했다(2026-09-22, 해외 사업장인 중국 시안·미국 오스틴 실존은 확인됐으나 확장은 아직 미착수). 다중 사업장이 실제로 편입될 때의 "같은 날짜" 의미와 교대일/영업일 의미는 여전히 Open domain decision이다.

**구간 경계와 datetime 문자열 (Decided):** 공통 조회 경계는 half-open `[from, to)`이며 `from < to`를 요구하고 잘못된 날짜는 보정하지 않고 거부한다. v1 URL의 `from`/`to`는 정확히 `YYYY-MM-DDTHH:mm:ss`(naive, `Z`/offset·소수초·날짜-only는 형식 오류)다. 원천값·조인 키·occurrence anchor의 정밀도는 축소하지 않으며, 경계 비교는 원천 전체 정밀도로 한다(`to=10:00:00`이면 `10:00:00.000`과 `10:00:00.500` 모두 제외). v1의 초 단위 입력 제한은 원천 정밀도 축소가 아니라 **신규 제품 제한**이다.

**날짜만 선택한 경우 (Decided):** URL에는 datetime만 허용한다. 달력에서 고른 양끝 포함 구간 `[D1, D2]`는 UI에서 `[D1T00:00:00, (D2+1일)T00:00:00)`으로 변환해 URL에 쓴다("다음 날"은 naive 달력 연산이지 UTC instant+24시간이 아니다). 교대일·영업일·다중 사업장 같은 날짜 의미는 이 결정 밖(Open domain decision)이다.

**원천 시간대 미확인 시 처리 (Decided):** 단일 설비, 또는 동일 wall-clock 기준이 확인된 설비 집합은 절대 TZ를 몰라도 naive 범위로 조회할 수 있다. 임의의 기본 TZ를 가정하거나 URL `from`/`to`를 UTC 필터로 바꾸거나 확인 안 된 다른 시간역과 축을 병합하지 않는다. TZ 미확인은 Data Trust에 표시한다. 확인된 TZ 이름이 있어도 DST 등으로 변환이 항상 가능한 것은 아니므로, 확인된 이름 ≠ 변환 가능이다. 이 결정이 향후 별도 UTC 분석 API 자체를 영구 금지하는 것은 아니다.

**복수 설비 시간축 병합 가드 (Decided):** 서로 다른 설비를 같은 시간축/버킷으로 병합하는 조회는 **서버 소유 assertion**이 있을 때만 허용한다(비보장을 "경고 후 허용"으로 약화하지 않는다). `scopeId`나 클라이언트가 보낸 시간역 id는 증명이 아니다. 최소 assertion 계약: `(equipmentId, timeDomainId, validFrom, validTo)`, 범위 `[validFrom, validTo)`(해당 설비의 naive wall-clock, 내부 정밀도 유지 — 지금 특정 테이블·마이그레이션을 요구하지 않는다). 실제 조회 대상 설비 전체에 대해 요청 `[from, to)` 전체가 빈틈없이 덮이고, 그 구간들의 `timeDomainId`가 모두 같을 때만 병합을 허용한다(한 설비가 요청 중간에 도메인을 바꿔도 v1 병합은 거절). 덮이지 않은 구간이 있으면 `time_domain_unverified`, 확인된 도메인 불일치가 있으면 `time_domain_mismatch`이며, 둘 다 `outcome=error`(요청 검증 오류, correlation id)로 처리하고 `empty`/`unknown`/경고 후 병합으로 위장하지 않는다. 이력 없는 현재 스냅샷으로 과거 구간을 소급 증명하지 않는다. 서로 다른 시간역의 **분리** 조회는 계속 허용한다.

**Apply 모드 기본 기간 예외(Decided, ADR-0061):** 아래 물질화 시계와 범위 계산은 재사용하지만 기간 양쪽이 없는 유효 주소에서는 기본 기간을 초안에만 둔다. 적용 URL에는 쓰지 않고 조회하지 않는다(§11). live 메뉴의 URL 물질화는 유지한다. 부분·잘못된 기간은 두 모드 모두 오류로 거부하며 보정하지 않는다.

**기본 구간 물질화 시계 `defaultRangeTo` (Decided):** 브라우저 로컬 now, 서버 UTC 문자열 절단, "watermark = now = Data through" 등식은 모두 쓰지 않는다. 서버가 해당 시간역·데이터셋의 기본 조회 상한 `defaultRangeTo`(배타적 초 경계, wall-clock)를 제공한다. `defaultRangeTo`는 half-open 구간의 상한이므로 그 값 자체는 §6.3의 경계 규칙에 따라 항상 제외된다. 서버가 이 값을 정할 때 "포함"이 뜻하는 것은 **포함하려는 마지막 실제 데이터 시각이 `defaultRangeTo`보다 항상 이전이 되도록**(그 시각이 필터로 잘리지 않도록) 상한을 잡는다는 것이지, 상한 이전 데이터가 모두 도착했거나 집계가 완전하다는 뜻이 아니다 — 예를 들어 포함하려는 마지막 시각이 `10:00:00.000` 또는 `10:00:00.500`이면 `defaultRangeTo`는 최소 `10:00:01`이어야 한다. 기본 구간은 `[defaultRangeTo − Δ, defaultRangeTo)`(naive 길이 산술, 자정 비정렬)로 물질화하며, 산출 불가 시 자동 물질화하지 않고 기간 선택을 요구한다. 현재 포트(`defaultRangeTo(): string`)는 항상 값을 준다 — 산출 불가 분기는 실서버 연결(#154) 때 포트에 더한다(결정 대기, `.planning/README.md`). 한 번 물질화한 URL 기간을 데이터 갱신만으로 자동 이동시키지 않는다. 사용자가 명시적으로 고르는 기간 프리셋(`1일/7일/사용자 지정`)은 이 메커니즘을 그대로 재사용해 Δ=24h/168h로 확정했다(2026-09-22). 최초 진입 시 자동 물질화되는 기본 Δ 숫자 자체는 별도로 Open이다.

**조회 바 달력 프리셋(Decided, 2026-10-21, #553 위임 결정):** Apply 모드의 최근 24시간·최근 7일은 같은 서버 앵커에서 24h·168h를 뺀다. 오늘은 `defaultRangeTo`의 날짜 D, 기준일은 사용자가 고른 날짜 D로 `[D 00:00:00, D+1 00:00:00)`를 만든다. 브라우저 now·UTC 변환을 쓰지 않으며 직접 범위는 초 정렬 naive 시각을 그대로 유지한다. 이 명시적 선택은 최초 기본 Δ의 Open 결정을 바꾸지 않는다.

`defaultRangeTo`와 자동 재집계 창의 원천 진행 경계 `R`(정의는 [01 지연 완료 허용 시간](../architecture/architecture-and-data-contract.md#late-arrival-policy) 참조)은 서로 다른 계약 필드이며 항상 같은 값은 아니다. **`R`이 존재할 때만** 같은 시간역·대상 조건에서 `defaultRangeTo ≤ R`인 경우에만 그 기본 구간을 자동 물질화하고, 만족하는 값이 없으면 마지막 점을 버리거나 `R`을 올리지 않고 기간 선택을 요구한다(L2). `R`이 아직 없는 경우(첫 mart 세대 생성 전, 워커 일시 중단 등)에는 이 비교를 적용하지 않는다 — `defaultRangeTo`가 독립적으로 유효하면 그대로 자동 물질화하고, 자동 재집계만 보류한다([01 정책](../architecture/architecture-and-data-contract.md#late-arrival-policy) 참조).

**실제 시점은 wall-clock이 아니다 (Decided, 2026-09-28):** 설비 업무 시각이 아닌 실제 시점(epoch·timestamptz — 예: 메뉴 활용률 마지막 사용, FeedbackOps VOC 접수 시각)은 이 절의 wall-clock 계약 대상이 아니다. 화면에는 `@ap/contracts`의 `formatInstant`로 보는 사람의 시간대에 맞춰 표시하고, `formatDateTime`(naive wall-clock 전용)으로 표시하지 않는다. `formatInstant`는 offset 없는 문자열을 거부해 두 종류가 섞이지 않게 한다(#88).

### 6.4 URL 계약 (Decided; 필드명·enum 문자열은 Candidate)

상태 저장소(deferred) 단계 전까지 일반 주소는 계속 v1 쿼리를 싣는다. 공유 링크는 주소창 문자열이 아니라 적용된 상태를 §11의 `buildShareLink`로 다시 직렬화한 것이다.

배포 하위 경로는 주입된 위치 어댑터의 브라우저 경계에서만 붙고 떼며, 앱 내부 URL·`returnTo`·저장 URL은 base 없는 앱 상대 경로다([ADR-0030](../adr/0030-location-adapter-base-path.md)).

**메뉴 경로: 정규 경로와 옛 별칭 (Decided, 2026-10-27, [ADR-0093](../adr/0093-canonical-paths-from-space-and-menu-id.md)):** 공간에 속한 그룹의 메뉴 URL은 `/{공간 id}/{메뉴 id 슬러그}` 뒤에 manifest 경로의 `:param` 세그먼트를 순서대로 붙인 정규 경로다(슬러그: `:`→`-`, camelCase→kebab-case, 소문자; 예 `equipment-detail` → `/mars/equipment-detail/:equipmentId`, 모듈 메뉴 `eqv:topview` → `/tools/eqv-topview`). 공간 없는 그룹의 메뉴는 manifest 경로가 정규 경로이고, 플랫폼 홈은 앱이 `createRegistry({ platformHomeMenuId })`로 선언해 `registry.platformHome`으로 읽는다. 지정한 id는 등록된 공간 없는 메뉴여야 하고 정규 경로에 매개변수가 없어야 한다. 공간 없는 메뉴가 `/`를 경로 또는 별칭으로 선언하면 이 옵션이 필수지만, 지정 id가 그 메뉴일 필요는 없다. manifest 경로가 정규 경로와 다르면 옛 별칭(`MenuMeta.aliases`)이 되고, `createRegistry`가 돌려주는 메뉴는 `path`가 정규 경로이며 `aliases`에 옛 경로가 있어 `pathFor`는 정규 경로만 만든다. `matchRoute`는 정규 경로와 별칭을 모두 맞추고(정적 세그먼트 우선) `RouteMatch.viaAlias`로 어느 쪽인지 알린다 — `params`는 늘 정규 경로의 파라미터 이름이다. `safeReturnTo`는 저장된 옛 문자열도 받고 원래 문자열을 돌려준다. Registry는 같은 공간 슬러그 중복, 정규 경로·별칭 전체의 경로 모양 충돌, 예약 루트인 공간 id(Kernel 고유 루트 `board`·`api`·`auth`와, 앱이 `createRegistry`의 `reservedRoots`로 선언한 루트 — 이 앱은 `home`·`survey`·`voc`·`notifications`·`notices`·`permission-requests`. Kernel은 앱 메뉴 루트를 알지 못하고, 선언하지 않으면 거부하지 않는다. 항목이 id 모양이 아니면 `RegistryError`), 공간 id로 시작하는 공간 없는 경로·별칭, `/board` 이름공간 경로와 다른 메뉴의 정규 경로를 가로채는 패턴을 `RegistryError`로 거부한다. 허용되는 별칭 간 중첩은 정적 세그먼트가 우선한다. **별칭 리다이렉트:** 메인 화면이 별칭(`viaAlias`)으로 열리면 Context를 해석한 직후 주소를 정규 경로로 한 번 `replace`한다(history 항목을 더하지 않고, 검색 문자열은 알 수 없는 키·`focus`·`returnTo`·v1 쿼리까지 바이트 그대로, 주소 해시도 그대로). 정규 주소로 열면 쓰지 않는다. 별칭 주소에서는 화면을 그리지 않고 조회·사용 계측(`entry`)·최근 방문·공간 마지막 화면도 기록하지 않으므로, 옛 경로로 나가는 요청은 없다. 기간·지표 버전의 기본값 채우기는 정규 주소로 옮긴 뒤 평소처럼 한 번 더 쓴다. 배포 base path는 위치 어댑터 경계에서만 붙는다(Registry·저장 URL은 앱 상대 경로). 리다이렉트는 권한·Scope를 바꾸지 않아, 열 수 없는 메뉴는 정규 주소에서 같은 거부를 보인다. **이 앱의 플랫폼 홈은 정규 `/home`이다:** 홈 메뉴가 `path: '/home'`에 `aliases: ['/']`를 선언하고 `/`는 `/home`으로 옮겨진다. 홈이 필요한 곳(홈 링크, 플랫폼 메뉴의 `홈`, 되돌아갈 곳이 없을 때의 폴백, 홈 화면의 최근 방문)은 `matchRoute('/')`가 아니라 `registry.platformHome`을 읽고, 없으면(`null`) 공간 홈 폴백으로 간다. **`returnTo`:** 저장된·옛 형식의 `returnTo`(별칭 경로)도 돌아가기 포커스를 받는다 — `pageNavigation.requestReturn`이 두 주소를 정규 형태로 맞춰 비교하고, 저장된 값은 고쳐 쓰지 않는다(`safeReturnTo`는 원래 문자열을 돌려주고 공유·VOC 페이로드는 계속 `returnTo`를 싣지 않는다). 설문은 정규 `/survey`·`/survey/:surveyId/respond`이고 `/surveys…`는 별칭이다(FeedbackOps 단독 `/surveys…` 주소와 그 파서는 이 경로가 아니라 변하지 않는다). 옛 → 정규 경로 표는 `apps/platform-web/src/canonical-paths.test.ts`가 조립된 Registry로 검사한다.

**위치 어댑터와 비교:** `PlatformLocation.replace(url, { keepFragment: true })`는 같은 도착의 별칭 리다이렉트·기본값 물질화 때 현재 주소의 fragment를 보존해 한 번의 history replace로 쓴다. 옵션을 생략하거나 false이면 현재 fragment를 이어 붙이지 않는다. 입력은 base 없는 앱 상대 URL이다. `registry.canonicalHref(href)`는 pathname과 선택적인 query로 된 입력에서 매칭된 별칭만 정규 경로로 바꾸고 query를 그대로 보존한다. 정규 경로 또는 매칭되지 않은 입력은 그대로 반환한다. 비교용이며 검증이나 fragment 처리를 수행하지 않는다.

**Equipment Group / Context Capability (Decided; 공개 표현 Candidate, ADR-0059 확장 Decided·#552 1부 계약·호환 구현):** 메뉴는 Condition과 Selection의 적용/참조/미지원 범위를 선언하고 두 층을 전달·보존한다. 주입된 사용 축 전체와 소속 기준을 유지하며 다른 축으로 역추정하지 않는다. Condition만 있으면 선언한 소속 기준으로 재평가하고, 명시 Selection이 있으면 그 고정 ID 집합을 분석 대상으로 사용한다. 재평가된 Condition에서 빠졌다는 이유로 선택을 자동 교집합·확장·대체하지 않는다. 권한/Scope 검증 실패는 명시적으로 처리한다. 조건 편집 시 기존 선택의 처리 UI는 Candidate이며 조용한 선택 변경은 허용하지 않는다.

**Condition 프리셋(Decided, 2026-10-25, [ADR-0083](../adr/0083-condition-presets.md); 필드명 Candidate):** 메뉴가 `conditionPresets`(id·이름·축 id 집합 2개 이상)와 그 id를 담는 page key `conditionPreset`을 선언하면, 커널은 그 메뉴(보드 칸이면 그 칸)의 조회 투영과 조회 신원에서 Condition을 **활성 프리셋의 축만** 남긴다(남는 축이 없으면 `null`). 프리셋은 투영만 좁힌다 — 전역 Condition과 URL `equipmentGroup`, 칸 복사, 히스토리 복원은 그대로이고, 프리셋 밖 축의 값은 전역에 남아 다른 메뉴가 쓴다(조회 바가 "이 보기에서 미적용"으로 드러낸다, §11). Apply 메뉴에서 프리셋 전환은 초안 page만 바꾸므로 조회 0회이고 적용이 1회다. live 메뉴에서는 전환이 곧바로 투영을 바꾼다. **진입 규칙(2026-10-25, ADR-0083 보충):** page 값이 없으면 활성 프리셋은 현재 Condition의 비어 있지 않은 축을 모두 포함하는 **첫 선언 프리셋**이고, 그런 프리셋이 없으면 선언된 기본값이다. page 값이 있으면(알 수 없는 id는 기본값) 그것이 이긴다. 판정은 주소(전역 Condition + page)만으로 정해지므로 히스토리·새로고침에서 같다.

**`equipmentGroup` v1 호환 확장(Decided, 2026-10-21; #552 1부 계약·호환 구현):** URL 버전을 올리지 않는다. 새 표현은 배열 맵 `{"stgroup":["A"]}`이고 serializer는 배열 맵만 쓴다. v1 tag는 축 이름을 모르는 구조 규칙으로 읽는다 (2026-10-21, 코드 리뷰 C2 — SDK에 구체 축 이름을 두지 않는다는 사용자 규칙). 문자열 `axis`가 있는 객체는 v1 tag이며, 정확히 `{axis: X, id: Y}`인 문자열 쌍은 `{[X]: [Y]}`로 읽는다. `id` 없이 문자열 필드가 하나 이상 있으면 각 필드 이름을 축으로 하는 단일값 배열 맵으로 읽고, 그 밖의 tag 모양은 `invalid_condition`이다. 이 구분을 위해 축 id `axis`는 예약한다. 기존 Maker+Model 두 ID도 필드 이름에 따라 `{maker:[X], model:[Y]}`로 읽어 AND 의미를 보존한다. 단일축 소비자는 같은 한 값 조건으로 동작해야 한다. `membershipBasis=asOf`는 §6.1의 이력 지원 검증을 거치며 생략은 current다. 미주입 축은 오류로 거부하고 검증된 조회에 쓰지 않는다. 주입된 축이 대상 메뉴에서 미지원인 경우는 전체 Condition과 기준을 보존하고 미적용으로 표시한다. 보드 복사도 Condition 전체와 기준을 함께 전달하며 칸 소유권([ADR-0049](../adr/0049-analysis-context-belongs-to-a-pane.md))은 유지한다.

**옵션·Selection 평가 포트(Decided, 2026-10-21):**

- `listAxisOptions({ scopeId, axisId, query?, parents?: Record<axisId,string[]>, membershipBasis?, period?, cursor?, limit }, signal)` → `{ items: {id,label}[], nextCursor: string|null }`.
- `listAxisOptions.axisId`는 주입된 Condition 축 외에 SDK 전역 집합 키 `lineNames`·`prcGroups`도 받는다. 두 키는 도메인 축 id가 아니며 descriptor 주입이 필요 없다. 요청 Scope의 부여된 행에서만 값을 도출하고 같은 검색·페이징·커서·오류 규칙을 적용한다. 이 전역 옵션의 `parents`는 자신을 제외한 `roomNames`·`lineNames`·`prcGroups`만 받으며 키 사이는 AND, 같은 키 값은 OR다. 생략은 무제약, `[]`는 빈 옵션이다. 부여 밖 room 부모는 부여된 행과의 교집합이므로 값을 노출하지 않는다.
- `searchEquipment({ scopeId, roomNames, lineNames, prcGroups, condition, membershipBasis, period?, query?, cursor?, limit }, signal)` → `{ items: EquipmentSummary[], nextCursor: string|null, total? }`. `EquipmentSummary`는 `{equipmentId,room,axes:Record<axisId,string[]>}`다. `axes`에는 서버가 정한 분류 축과 별도로 `lineNames`·`prcGroups` 키의 소속 배열을 포함한다(Condition descriptor와 독립). `total` 부재는 0이 아니다. 세 집합 키의 `null`(무제약)과 `[]`(명시적 공집합)를 유지한다. 검색은 ID/표시명에 대소문자 무관 부분 일치를 적용한다.
- `resolveSelection({scopeId,ids},signal)` → `{items:({id,status:'ok',summary:EquipmentSummary}|{id,status:'forbidden'|'not_found'})[]}`. 입력의 첫 출현 순서로 중복을 제거한다. 같은 Site의 부여 안 된 room ID는 forbidden(제출 ID·상태만), 다른 Site에만 있는 ID와 없는 ID는 모두 not_found다. 검색 페이지 밖 선택을 삭제·대체하지 않는다. 선택 확인은 분석 허가가 아니며 최종 분석 판정은 **Scope → room grant → Condition → Selection** 순서다.
- 세 포트는 인증된 세션과 해당 Scope·room 부여만 필요하며 특정 메뉴 권한을 요구하지 않는다. 매 페이지·해석 요청에서 다시 검사한다. 모르는 Scope는 unknown_scope, 부여 없는 Scope는 scope_forbidden, 명시적 room 필터에 부여 밖 값이 있으면 요청 전체가 room_forbidden으로 거부된다. 옵션·표시명·축·커서·total은 부여된 행에서만 도출한다.
- 비 envelope 비동기 포트다. 성공한 빈 페이지는 `{items:[],nextCursor:null}`이고 ID별 판정은 성공 데이터다. 실패는 세 갈래 규칙의 원본인 [실서버 체크리스트 §2](../integration/real-server-checklist.md#2-platformadapter-메서드별로-지킬-것)를 따른다 — 판정 코드 목록 원본은 `@ap/contracts`의 `PORT_ERROR_CODES`이고 판별은 `isPortError`다([ADR-0074](../adr/0074-port-failures-three-surfaces-structural-port-error.md)).
- limit는 유한 정수만 받고 서버가 1–200으로 제한한다. ID의 결정적 문자열 순서로 자른다(mock: UTF-16 사전식). 커서는 opaque이며 포트·정규화한 입력(커서·limit 제외)·Scope·세션/권한 세대에 묶인다. 입력/세션 불일치·잘못된 커서는 invalid_cursor다. mock은 서버에 보관한 토큰+마지막 ID의 keyset이며 만료 없음, limit 변경 가능이다. 페이지 사이 앞쪽 삭제·삽입에 offset을 쓰지 않아 기존 남은 행을 건너뛰거나 앞서 반환한 ID를 반복하지 않는다. 경계 앞에 새로 삽입/재분류된 행은 새 검색에서 보인다. 실서버는 이 보장을 유지하는 keyset/스냅샷 또는 명시적 실패·재시작 정책과 데이터 버전/만료를 정해야 한다.
- asOf에는 정확한 wall-clock YYYY-MM-DDTHH:mm:ss, 실재 달력 값, from < to인 완전한 period가 필요하다. 의미는 반개방 [from,to) 기간 중 소속된 적이 있는 값의 합집합이며 다중축 AND와 부모도 기간 중 소속 합집합에 적용한다. 옵션은 대상과 제공한 모든 부모의 이력을 요구한다. 현재 모드의 유효한 선택적 period는 검증 후 소속 평가에서 무시한다. mock은 이력 가능 descriptor의 현재 소속으로만 대신 평가하며 이력 없는 대상/부모/Condition과 PRC-only asOf는 membership_basis_unsupported로 거부한다. **실제 이력 평가는 미구현**이며 실제 원천 연결 때 기간 중 소속 변경을 검증하고 다시 연다.
- mock descriptor는 서버 소유 `createMockAdapter({equipmentAxes?})`로 받는다(기본값은 mock 소유). Condition 옵션은 dependsOn의 모든 상위 축만 parents에 허용하고 미등록 축·무관한 부모는 거부한다. 부모 생략은 무제약, 부모의 []는 빈 옵션이다. 다단계 부모는 AND로 좁히며 기존 선택을 지우지 않는다. Condition은 서버 descriptor의 축만 허용한다.
- Kernel useAxisOptions·useEquipmentSearch는 기본 pageSize 50, `status/items/error/retry/hasMore/loadMore/loadingMore/loadMoreError/total?`을 제공한다. 가장 가까운 화면의 **보존된 global**을 쓰며 context는 전체 PortContext 스냅샷으로만 덮어쓴다(부분 병합/다른 Scope 허용 없음). 활성화·동일 세션의 Scope 검증·유효 Context·asOf period 준비 전에는 요청하지 않는다. 다른 Scope override는 scope_forbidden 오류, disabled는 idle과 빈 결과다. 입력 변경 프레임에 이전 데이터를 숨기고 요청을 abort하며 늦은 응답을 버린다.
- useResolvedSelection(ids,{enabled?,scopeId?})은 `status/byId/summaries/error/retry`를 주며 Condition/기간/검색 페이지와 독립이다. 전송 실패를 ID별 not_found로 위장하지 않는다. `PortFailure={code:PortErrorCode|null,message,retryable}`에서 전송 실패는 재시도 가능, 판정 실패는 invalid_cursor만 재시도 가능이다. 페이지 실패는 앞 페이지를 유지하고 실패 커서를 재시도한다. invalid_cursor 재시도는 이전 페이지를 지우고 첫 페이지부터 시작한다. loadMore는 single-flight이고 페이지 중복 ID는 합친다.
- 메모리 캐시는 PlatformProvider의 어댑터·세션·revision 세대 안에서 **화면 소유자 + 포트 + 정규화한 모든 유효 입력**을 키로 쓴다. 소유자마다 비구독 항목은 최근 사용 순서(구독 해제·ensure 시 갱신)로 최대 50개를 보관하고 초과분은 오래된 순으로 버린다. 구독 중인 항목은 퇴출하지 않는다(가역적인 메모리 예산 선택). main은 라우트 변경에도 유지하고 각 paneId는 독립이며 선택 칸의 context-bar Provider는 같은 소유자를 공유한다. 칸 제거 시 캐시를 버리고 재사용은 새로 시작한다. 세션/권한/마스터 subscribe 변경이나 어댑터 교체 시 전체 캐시를 무효화한다. 페이지 커서는 base 입력 항목 곁에 따로 둔다.
- contextOptions·evaluateSelection은 deprecated 호환 포트로 유지한다. 셸 바와 모든 소비자가 새 포트로 전환하고 호환 검증을 마친 뒤 제거를 다시 연다.

기존 `equipmentIds` 목록 필터와 `selectedEquipmentIds`는 같은 EquipmentID 명시 집합을 나타내는 공개 표현이다. 새 이름은 Selection의 역할을 드러내는 후보이며 두 개의 독립 필터가 아니다. 기존 이름의 동등 별칭/버전 이행은 아래 `v` 규칙으로 등록한다. 동시 입력은 후보 스키마에서 거부하여 우선순위 추정을 피한다. 상세의 단일 `equipment_id`도 **같은 식별자 개념**이며, 집합 조회와 목적지 객체 ID라는 사용 역할만 다르다.

**분석으로 돌아가기 (Decided):** 상세/드릴인 진입 직전의 분석 Context(Condition·Selection·미적용 값 포함)를 그대로 복원한다. 목록 `equipmentIds=[A,B]`에서 목적지 객체 C를 보았어도 복귀는 `[A,B]`이며 C를 합치거나 C 하나로 바꾸지 않는다. 상세에서 본 객체나 상세의 변경된 조건으로 출발 Context를 덮어쓰지 않는다. 복귀 시 권한·Scope는 재검증하며 실패해도 원래 선택을 조용히 축소하지 않는다. 복원은 원래 조건의 복원이지 live Condition 결과나 계산 숫자의 동결이 아니다. 출발 페이지의 등록된 URL 상태도 보존하되 로컬 줌/brush의 복원 보장은 추가하지 않는다. 상세에서 사용자가 전역 Context를 바꾼 뒤 복귀하면 출발 Context로 돌아가며, 되돌린 Context 항목을 화면에 알린다(조용히 되돌리지 않는다). 되돌린 항목에는 Scope도 포함한다. 상세에서 바꾼 Context를 유지한 채 이동하는 길은 메뉴 위치(breadcrumb·사이드바)다.

**`returnTo`(page key; 메커니즘 Decided, 필드명 Candidate):** 상세 목적지 메뉴는 `pageKeys`에 `returnTo`를 선언해 출발 화면의 전체 URL을 받는다. 값은 앱 내 상대경로여야 하며(`//`·`\`·`#`·제어문자·경로 안 `:`은 거부, 절대 URL은 항상 거부) 등록된 비상세 메뉴 경로로 매칭되고 그 메뉴의 `pageKeys`로 파싱될 때만 채택한다. 아니면 `parent` 메뉴(없으면 홈)로 복귀한다.

**URL vs 세션/최근방문 우선순위, 누락값 (Decided):** URL에 있는 키는 항상 이긴다. URL에 없는 키를 세션/최근방문으로 채우지 않는다(세션은 제안값일 뿐이며, 적용하는 순간 URL에 기록한다). 키 부재는 공개 스키마가 정의한 "선택 없음 / 기본 의미 / 필수 누락" 중 하나로만 해석하고, 필수값을 임의 Scope나 떠다니는 최신 지표 버전으로 대체하지 않는다. 시간을 요구하는 메뉴에서 기간 양쪽이 모두 없으면 기본 구간이 정의·검증 가능할 때만 절대 `from`/`to`를 URL에 물질화하고(불가하면 기간 선택 요구), **한쪽만 있으면 형식 오류로 거부한다**(보정하지 않음). 상대적인 "최근 기간"이 물질화되기 전의 URL은 시점 의존 진입점이며 재현 가능한 분석 링크가 아니다.

**Apply 모드 URL 소유 예외(Decided, ADR-0061):** URL(보드에서는 칸 주소)은 적용한 global/page만 소유하고 초안은 소유하지 않는다. 위 기본 기간 URL 물질화는 live 메뉴에 해당하며 Apply에서는 §6.3의 초안 예외를 따른다. 명시적 유효 기간과 필수값이 있는 deep link·Back/Forward·저장된 칸은 세션의 과거 실행 여부와 무관하게 같은 조건을 실행한다. 초안 복원(#554)은 이 주소 복원과 다르며 자동 실행하지 않는다. 기존 링크·드릴·returnTo와 setGlobal·setPage는 적용된 값과 주소만 사용한다.

**URL 계약 버전 `v` (Decided):** 양의 정수 query `v`, 생략은 `v=1`로 해석한다. 인바운드 URL은 그 버전 디코더로만 해석하며 북마크의 `v`를 자동으로 최신으로 rewrite하지 않는다(조회 신원을 바꾸지 않기 위함). helper가 **새로** 만드는 정규 URL은 동등 요청을 새 버전으로 표현할 수 있는지 검증한 뒤에만 현재 `v`를 명시하고, 불가능하면 지원 중인 원래 버전을 보존하거나 전환 불가를 알린다. 미지원 `v`(미래 또는 sunset 이후)는 부분 추측 없이 전체 거부한다. `v`는 `metricVersion`·DB 마이그레이션·메뉴 구현 버전과 별개다. 같은 `v` 안에서 등록된 의미-동등 별칭만 허용하고, 별칭으로 기존 값의 의미를 바꾸지 않는다. sunset 날짜/기간은 별도 공지·정책으로 정하며 이 결정에 포함하지 않는다.

**잘못된 값 / 미등록 키 / 미지원 Context (Decided):** 등록된 키의 형식 오류(잘못된 날짜, `Z` 접미사, 빈 필수 ID, 잘못된 `v`, 한쪽만 있는 `from`/`to` 등)는 조회를 거부하고 명시적 오류를 표시하며 clamp/보정하지 않는다. 유효한 형식이지만 없거나 권한 없는 객체는 자동 대체하지 않는다. **등록된** 전역 Context가 대상 메뉴에서 미지원이면 URL에 남기고 미적용으로 표시하며, 지원 메뉴로 복귀하면 재검증 후 적용한다. **미등록** 키도 현재 URL에는 남기되 검증된 조회조건으로 넘기지 않고 전역 Context로 승격하지 않는다. 새 키가 조회 의미를 필수로 바꾸면 `v` breaking change로 처리한다.

**뒤로가기 복원 범위와 셸 내비게이션 (Decided):** 플랫폼이 보장하는 복원 범위는 **URL이 소유한 상태**(전역 Context + 그 페이지가 URL에 쓰기로 한 탭/뷰 id + 선언됐지만 미적용인 등록 Context + §6.1 공집합 표식)로 한정한다. 줌/브러시/시리즈 가시성은 보장 밖이다(로컬 저장 자체가 금지되는 것은 아니나 제품 복원 계약에는 넣지 않는다). **셸의 사이드바/메뉴 레지스트리를 통한 메뉴 전환도 Context Link helper와 같은 규칙을 따른다**: 전달 집합은 등록된 전역 Context뿐이며 대상의 지원 여부와 무관하게 보존한다. 적용은 대상이 지원하고 검증한 값에만 한다. page-owned 상태와 미등록 키는 자동 복사하지 않는다. 예외 하나: 공간이 `SpaceDef.carriedPageKeys`를 선언하면 **같은 공간의 메뉴 사이**에서만 그 키들을 현재 URL 값 그대로 대상에 싣는다(대상이 `pageKeys`로 선언한 키만, `linkTo`의 `page`에 명시한 값이 우선하고 `null`은 뺀다. 전역 키와 겹치는 키·키를 선언하지 않은 소속 메뉴는 `createRegistry`가 거부, [ADR-0081](../adr/0081-feedbackops-operator-screens-platform-frame.md) 결정 4). helper는 **보존할 Context**와 **적용할 Context**를 구분해야 하며, "지원 키만 골라 쓴다"는 동작이 URL에서 나머지를 지운다는 뜻이면 안 된다(보존 약속과 충돌). **Context 변경 시 초기화할 page 키 (Candidate 필드명 `contextResetKeys`, #45):** 결과 집합에 묶인 page 키(표 페이지 번호, 선택 구간 등)는 메뉴 manifest가 `pageKeys`의 부분집합으로 선언하고, Kernel이 사용자의 전역 Context 변경(`setGlobal`·초기화)과 **같은 내비게이션 안에서** 지운다. 뒤로/앞으로 가기와 URL 진입은 아무 키도 지우지 않는다(복원은 정확해야 한다). 페이지가 Context 변경을 감지해 뒤따르는 replace로 지우는 방식은 뒤로가기에서도 발동해 복원을 깨므로 쓰지 않는다.

**드릴다운 단계 (Decided, [ADR-0025](../adr/0025-drilldown-level-page-keys-path-bar-layout.md); 필드명 Candidate):** 화면 안에서 단계별로 좁혀 들어가는 메뉴는 manifest `drill.levels`에 단계 순서(page key와 표시 이름)를 선언한다. 단계 키는 `pageKeys`와 `contextResetKeys`에 함께 등록해야 하고(Registry가 검사) 단계는 1개 이상이며 상한 없이 메뉴가 선언한다([ADR-0063](../adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)). 단계 값은 page 소유 ID·마스터 값이며 전역 Context로 승격하지 않는다(공정으로 들어가도 Context 바의 room_name은 그대로다). 앞 단계 키 없이 뒤 단계 키만 있는 URL은 형식 오류로 거부하고 조회하지 않는다. 형식이 맞지만 지금 범위의 결과에 없는 값은 그 단계에서 거부를 보이고 다른 값으로 바꾸지 않는다. 새 단계 진입·앞 단계로 올라가기·같은 단계의 다른 값으로 바꾸기는 history push이며, 바꾼 단계 뒤의 키를 같은 내비게이션에서 지운다. 사용자의 전역 Context 변경은 위 `contextResetKeys` 규칙으로 단계 키를 모두 지우고, 뒤로/앞으로 가기와 URL 진입은 지우지 않는다. manifest `drill.resetKeys`(필드명 Candidate)는 단계에 묶인 다른 page key(예: 고른 행)를 적는다. Kernel `setPage`가 단계 키의 값을 바꾸는 쓰기(`useDrill`의 `enter`·`goTo`, 경로 바의 올라가기, 단계 키를 직접 쓰는 메뉴)를 받으면 `resetKeys`를 같은 쓰기에서 함께 지운다(history 항목 하나, `contextResetKeys`가 Context 변경에서 하는 일을 단계 이동에서 한다). 같은 쓰기가 reset 키 값을 직접 주면 그 값이 이기고, 단계 값이 그대로인 쓰기(같은 단계 다시 진입, 현재 깊이로 `goTo`)는 아무것도 지우지 않는다. Registry는 각 항목이 선언된 `pageKeys`이고 단계 키·`returnTo`가 아니며 중복이 없는지 검사한다(`contextResetKeys`일 필요는 없다). 뒤로/앞으로·URL 진입·`setGlobal`은 이 규칙을 적용하지 않아 복원된 항목은 정확하다. 초안 쓰기(`setDraftPage`)는 적용하지 않는다 — 드릴은 초안이 아니라 주소를 `setPage`로 쓴다. 단계 안의 다른 page key(정렬·축 등)의 기록 방식은 이 계약이 바꾸지 않는다. 화면 모양은 §12.7, 다른 메뉴로 넘어갔다 돌아오는 복귀는 §22.

**복수 Scope와 시간 계약이 해결되기 전 허용할 조회 범위 (Decided):** §6.2의 `scopeId` 단일 원칙과 §6.3의 시간역 병합 가드로 닫힌다. TZ 매핑이 끝날 때까지 분석을 전면 금지하지는 않는다(단일 설비 naive 조회는 계속 허용). 프로토타입에서 무제한 조회를 허용하는 것은 거부한다.

완성된 URL API나 프로토타입 검증을 이 결정만으로 주장하지 않는다 — 구현·필드명 확정은 별도다.

### 6.5 분석 Context의 범위 — 칸 (Decided, [ADR-0049](../adr/0049-analysis-context-belongs-to-a-pane.md))

이 절의 "전역 Context"는 **현재 칸의 분석 Context**를 뜻한다. 본 화면은 칸이 하나뿐인 경우이고, 분석 보드([16](../design/analysis-board.md))는 칸마다 분석 Context를 하나씩 가진다. 구현은 #421 — #496(Kernel 칸 Context), #497(보드 화면), #498(메뉴 보드 지원)로 끝났다(v0.14.0).

- **값의 위치:** 본 화면의 칸은 §6.1–6.4대로 URL이 소유한다. 보드의 칸은 보드 상태가 소유하고 URL에 쓰지 않는다. 메뉴는 어느 쪽인지 모르고 Kernel 훅으로만 읽고 쓴다. 메뉴·모듈 코드는 URL을 직접 읽거나 쓰지 않는다.
- **시작과 독립:** 새 칸은 기본 조건을 복사해 시작한다. `분석 보드에 열기`로 넣으면 누른 화면의 분석 Context, 보드에서 바로 넣으면 마지막으로 본 본 화면의 분석 Context다. 그 뒤로 칸끼리, 그리고 본 화면과 연결이 없다. 일괄로 맞추는 것은 명시적 동작(시트의 모든 칸에 적용, 다른 시트에 복사)뿐이고 한 번 복사한다.
- **같은 규칙을 칸 단위로:** 지원하지 않는 Context의 보존·미적용 표시(§6.4), `contextResetKeys` 초기화, 드릴다운 단계 키와 `drill.resetKeys` 초기화는 칸마다 같은 규칙을 따른다. page 키는 칸 상태에 산다.
- **Scope:** 칸 하나는 언제나 단일 `scopeId`다(§6.2). 칸마다 서버가 권한을 다시 판정하고, 거부된 칸만 권한 상태가 된다. 여러 칸의 Scope를 한 조회로 합치지 않는다.
- **Context 바:** 바는 늘 지금 선택된 칸 하나의 분석 Context를 편집한다. 본 화면에서는 지금과 같다.
- **구현 위치:** Kernel `PaneScreenProvider`(`@ap/kernel`)가 칸 하나의 화면 상태를 준다. `usePlatform()`은 가장 가까운 화면의 상태를 읽고 `screenMode`(`'main'`·`'pane'`)·`paneId`를 더한다. 쓰기와 메뉴 이동은 URL 대신 칸의 `onChange`·`onLeave`로 간다(#496).

---

## 9. Information Architecture

최상위 Navigation Group:

```text
Overview

Equipment
Master Data
Analytics
Metrics
Notice & VOC
Administration
```

이 7그룹을 navigation IA의 단일 기준으로 둔다(Decided). 표시명은 운영 개요 / 설비관리 / 기준정보관리 / 생산성 분석 / 지표관리 / 공지·VOC / 관리·감사다. 이 그룹들은 §9.1의 워크스페이스 층 아래에서 배치된다. 관리·감사는 운영 콘솔로 이동한다. 나머지 그룹의 업무 공간 귀속은 §9.1에서 Decided다([ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)). `../product/domain-menus.md`의 6개 도메인 중 공지와 VOC가 한 그룹을 공유하고, 운영 개요·관리·감사는 플랫폼 기능이다. 도메인 개수와 내비게이션 그룹 개수를 같게 맞출 필요는 없다. 하위 화면 배치와 표시명 변경은 별도 설계 결정이다.

Sidebar 기능(셸 구조는 §7, ADR-0011):

- Collapse / Expand(240px ↔ 56px, `[` 단축키)
- 그룹은 기본적으로 섹션 제목, 메뉴는 그 아래 목록. `hideLabelWhenSingle` 그룹은 보이는 메뉴가 하나일 때 확장된 사이드바에서 제목을 생략한다(06 §5, Candidate)
- Favorite
- Recent (최근 URL로 복귀; 접근성 이름에 “최근 방문” 맥락을 포함)
- Permission-aware visibility
- 메뉴 검색은 레일의 Command Palette(§10)로 한다. 사이드바 안에 별도 메뉴 필터를 두지 않는다.

메뉴가 늘어날수록 평면적인 Sidebar 확장은 금지한다.

<a id="91-워크스페이스-decided-2026-09-26"></a>
### 9.1 업무 시스템 (Decided, 2026-09-26)

메뉴가 많은 여러 업무 시스템이 한 사이드바에 평면으로 쌓이지 않도록, 그룹 위에 **업무 시스템** 층을 둔다. 업무 시스템은 **독립된 업무 단위**다(**업무 시스템 구성 개정 Decided, 2026-10-08, [ADR-0026](../adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)**). 모든 업무 시스템은 같은 App Shell·Kernel·전역 Context·권한 계약을 공유하며, 업무 시스템은 사이드바에 표시할 그룹 집합과 진입 권한만 나눈다. 화면 설계 상세는 [15 멀티 워크스페이스](../design/multi-workspace-ui.md)다.

| 업무 시스템 | 대상 | 그룹 / 화면 |
| --- | --- | --- |
| MARS (생산성 분석) | 분석 엔지니어 | 개요·분석 대시보드, Cycle Time·Wafer/Job·드릴다운과 관련 상세 |
| BRAVO (지표관리) | 지표 관리자 | 지표 카탈로그·정의/버전·발행/이력·사용처 |
| CLAS (생산성 분석) | 분석 엔지니어 | 메뉴가 MARS와 다른 별도 생산성 분석 시스템. 이 플랫폼에는 견본 메뉴 설비 동작시간(TopN 가로 막대·LaneTimeline 소비자, #590)이 있고 기존 CLAS 화면 이전은 계획이다. 권한은 `analytics:view`를 쓴다 |
| 표준 로그 개발 | 로그 개발 담당자 | 모델별 개발 현황·단계, 검증 Round·규칙/결함·협력사 검토(도메인 구현은 별도 제품이 소유) |
| 개선 실행 | 개선 담당자 | 개선 과제·대상 설비·현장 적용·성과 입력/검증(도메인 구현은 별도 제품이 소유) |
| 운영 콘솔 (지원) | 개발자·운영자 | 시스템 모니터링, 개발자용 파이프라인 트레이스, 메뉴 활용률([05 계측](../overview/roadmap-and-open-questions.md#메뉴-활용률-계측-decided--v1-범위-포함-2026-09-22-grilling-round-2)), 관리·감사(권한/역할, 변경 감사), Menu Registry 조회 |

- **시스템 이름과 부제(Decided, 2026-10-20, #472):** 업무 시스템 `label`은 시스템 이름(MARS·BRAVO·운영 콘솔)이고 선택적 `subtitle`(`SpaceDef`·`PlannedSpace`, 있으면 ko·en 모두 비어 있지 않아야 하며 Registry가 거부한다)은 그 성격을 한 줄로 설명한다(MARS는 `생산성 분석`, BRAVO는 `지표관리`, 운영 콘솔은 없음). 업무 시스템 id·경로·권한은 이름과 무관하다. 시스템을 설명하는 목록 — 플랫폼 홈 런처 카드(부제 아래에 `description` 유지)와 전환기의 실제·준비 중 행 — 만 이름 아래 둘째 줄에 부제를 보인다. 짧은 자리 — 레일, 전환기 버튼 이름·툴팁, 사이드바 머리 시스템 이름, 팔레트 시스템 경로, breadcrumb, FeedbackOps 머리, 즐겨찾기·최근 소속, 경로 거부 문구, 관리 화면의 업무 시스템 이름 — 는 이름만 쓴다. 메뉴 그룹 제목(`GroupDef.label`)은 사이드바 섹션이지 시스템이 아니라 바뀌지 않는다.
- **플랫폼 홈:** 접근 가능한 업무 시스템을 고르는 시스템 런처다(카드 → 최근 방문·즐겨찾기 → 공지, [ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)). 모든 메뉴를 중복 나열하지 않는다. 홈 링크는 전환기 머리의 `플랫폼 홈`이다(`registry.platformHome`을 열 수 있을 때만, 15 §3.2·§8). 레일 로고는 링크가 아니다. (ADR-0070: 홈 링크는 전환기 팝오버 `플랫폼 메뉴` 구역과 전역 화면 사이드바의 `홈`이 맡고, 홈 순서는 카드 → `내 할 일` → 즐겨찾기·최근 방문·공지다. 15 §3.2)
- **전역 유틸리티 메뉴(Decided, 2026-10-09, [ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)):** 플랫폼 홈·공지·내 VOC는 어떤 업무 시스템에도 속하지 않는다. 자기 메뉴 권한(`platform:view`·`notice:view`·`voc:view`)으로만 판정하고 업무 시스템 진입 권한을 거치지 않으며, 접근 가능한 업무 시스템 수에 들지 않는다. 이 화면에서는 업무 시스템 사이드바를 붙이지 않고 레일의 업무 시스템 표식도 끈다. 명령 팔레트에서는 업무 시스템이 아닌 별도 묶음(플랫폼)으로 보인다. Registry 표현: `GroupDef.space: null`(명시 필수). 다른 메뉴를 전역으로 올리려면 이 규칙을 개정한다. **개정(Decided, 2026-10-22, [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md)):** 전역 메뉴에 알림·설문·권한 요청을 더한다(각자 자기 메뉴 권한, 알림·설문·권한 요청은 #594의 뒤 PR이 자기 권한을 정하기 전까지 `platform:view`를 쓴다 — `PERMISSIONS`는 서버 읽기와 함께 추가한다, ADR-0068). 권한 요청은 `platform:view`를 그대로 둔다 — 로그인한 모두가 요청할 수 있고 요청별 판정은 FeedbackOps 서버가 한다(#657 결정, 2026-10-24). 전역 화면에는 업무 시스템 사이드바 대신 플랫폼 사이드바(`홈` / `내 활동` / `공지`)를 붙인다. 업무 시스템 안에서는 전환기 팝오버의 `플랫폼 메뉴` 구역이 같은 목적지를 연다. `플랫폼`을 업무 시스템으로 만들지 않는다(15 §3.2).
- **FeedbackOps(협업):** FeedbackOps는 플랫폼에 합류하며, 모두가 쓰는 기능은 플랫폼 메뉴와 레일에, 관리자·개발자 화면은 피드백 운영 업무 시스템에 둔다. 독립 앱은 은퇴한다([ADR-0066](../adr/0066-feedbackops-merges-into-platform.md), [ADR-0070](../adr/0070-global-features-platform-menu-and-voc-drawer.md), [합류 설계](../integration/feedbackops-merge-design.md)). 전체 협업 허브 링크(사용자 메뉴 `FeedbackOps 전체`)는 없앴다 — 진입은 전환기 카드다(ADR-0081 결정 6, #764 p2).
- **기존 메뉴 귀속(Decided, 2026-10-09, [ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)):** 운영 개요(플랫폼 현황)는 홈 런처에 합친다. 설비관리·기준정보관리는 생산성 분석 업무 시스템(분석 그룹 다음), 관리·감사는 운영 콘솔, 공지·내 VOC는 전역 유틸리티다. 경로와 메뉴 권한은 바꾸지 않는다. 가공 상태 조회처럼 아직 없는 메뉴는 만들 때 정한다. 사용자용 VOC·설문의 1단계 읽기·원본 화면 쓰기 규칙은 [저장소 연결 문서](../integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26)를 따른다.
- **업무 시스템별 마지막 화면 복원(Decided, 2026-10-09, [ADR-0028](../adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)):** 레일·홈 카드로 업무 시스템에 들어가면 그 업무 시스템의 마지막 화면으로 간다. 사용자+업무 시스템별로 탭 세션 범위에 저장하고(기기·세션 간 동기화 없음), 가기 전에 경로·메뉴 권한·업무 시스템 진입·등록 page key를 다시 확인한다. 실패하면 업무 시스템 홈, 업무 시스템 홈을 열 수 없으면 그 업무 시스템에서 열 수 있는 첫 메뉴(사이드바 순서)로 간다. 현재 업무 시스템을 다시 누르면 아무 일도 하지 않는다. 전역 Context는 지금 값을 쓰고 업무 시스템마다 과거 값을 되살리지 않는다. 앱이 업무 시스템 id를 바꿀 때를 위해 `PlatformProvider`가 선택 prop `spaceIdMigrations`(옛 id → 새 id)를 받아 옛 키로 저장된 마지막 주소를 읽을 때 새 id로 옮긴다(새 키가 있으면 새 키 우선, 쓰기는 새 id만; 2026-10-27, 713m D3, [ADR-0090](../adr/0090-repo-structure-by-branch.md)).

- **노출:** 업무 시스템 전환은 레일 맨 위 업무 시스템 전환기(팝오버 카드, 15 §3.2·ADR-0042, 2026-10-19)로 한다. 카드를 고르면 사이드바와 레일 섹션이 대상 업무 시스템 것으로 바뀌고 포털 재진입을 강제하지 않는다. 카드는 `accessibleSpaces` 중 `spaceEntry`가 있는 것만 레지스트리 순서로 그리고, 보조 문구는 `이어서: <메뉴>`(검증된 마지막 화면) 또는 `시작: <메뉴>`다. 현재 업무 시스템 카드를 다시 고르면 이동 없이 닫고 전환기 버튼으로 포커스를 돌린다. 전환기는 레일 하나에만 둔다 — 사이드바 머리 전환기나 사이드바 탭을 두지 않는다(ADR-0028). 접근 가능한 업무 시스템이 하나여도, 업무 시스템 밖 화면에서도 전환기는 있다(업무 시스템 밖에서는 현재 표식이 없다). 업무 시스템이 하나뿐인 사용자는 카드 하나와 `플랫폼 홈`을 본다. 업무 시스템 안에서는 레일 섹션 버튼(그룹 단위)이 같은 업무 시스템의 다른 섹션으로 보내며 현재 섹션을 누르면 아무 일도 없다. 현재 섹션은 `aria-current="true"`다(`page`는 현재 메뉴만). 업무 시스템 진입 권한도 §17 규칙을 따른다(비노출 + 직접 URL은 서버 검증).
- **Context:** 업무 시스템 전환은 §6.4의 셸 내비게이션과 같은 규칙을 따른다. 등록된 전역 Context(Scope·기간·설비 선택 등)는 전부 보존하고, 대상 화면이 지원·검증한 값만 적용한다. 예: 사용자용 가공 상태 조회에서 본 설비·기간으로 개발자용 트레이스를 바로 연다.
- **Registry:** 소속 업무 시스템은 메뉴가 아니라 **그룹이** 선언한다(`GroupDef.space`, **필드명 Decided, 2026-09-27**). 현재 업무 시스템은 매칭된 라우트의 메뉴에서 유도하며 업무 시스템용 URL 키는 없다(§6.4: 경로가 이미 업무 시스템이다 — 정규 경로는 `/{업무 시스템 id}/…`, ADR-0093). 위 표의 **업무 시스템별 배치**는 Decided다. **업무 시스템별 그룹 수 상한은 두지 않는다(Decided, 2026-09-27)** — 새 그룹은 업무 시스템 추가보다 먼저 기존 그룹에 흡수할 수 있는지 검토하고, 업무 시스템당 7개 이하를 권장한다. 표 항목 중 무엇이 그룹이고 무엇이 그 아래 화면인지는 각 업무 시스템을 구현할 때 정한다.
- **운영 콘솔 권한(Decided, 2026-09-27):** '운영 콘솔 접근' 한 역할로 시작한다. 개발자·운영자 모두 운영 콘솔 전 화면에 들어간다. 메뉴 활용률 열람은 05 결정(개발자·운영자 기본 + 개별 부여)을 따른다. 역할 분리가 필요해지면 그때 나눈다. 권한/역할 화면(`/admin/roles`, #49)은 **조회 전용**이다 — 사용자별 보유 권한, 그 권한이 여는 메뉴(Registry `permission` 기준 클라이언트 조인이며 권한 증명이 아니다), 사이트별 부여 room_name을 보여 준다. 부여·회수(05의 개별 부여 포함)의 원천은 **분리(2026-09-29 Decided, 절반 확정, #98)**: room_name 부여와 메뉴 활용률 열람 개별 부여는 플랫폼 메타 DB가 소유하고, 역할 소속(누가 운영 콘솔 접근자인가)의 원천은 IdP 그룹 claim 사양이 나올 때까지 Open이다(claim을 주면 IdP, 안 주면 메타 DB). 쓰기 포트·화면은 아직 만들지 않는다.
- **Command Palette:** 사용자가 접근 가능한 모든 업무 시스템의 메뉴와 전역 유틸리티를 검색한다. 결과는 업무 시스템별로 묶고(레일 순서, 전역 유틸리티는 별도 묶음 — 플랫폼 메뉴의 목적지 전부, ADR-0070), 행 보조줄은 `<시스템> › <섹션> › <메뉴>` 전체 경로이며 연속해서 같은 이름은 한 번만 쓴다(전역 유틸리티는 `플랫폼 › <그룹> › <메뉴>`). FeedbackOps 외부 링크는 넣지 않는다.
- **범위 밖:** 업무 시스템별 테마·별도 로그인·업무 시스템별 Scope는 두지 않는다. 업무 시스템 `id`, FeedbackOps `Managed System`, 데이터 Scope는 서로 다른 식별 층이며 1:1을 가정하지 않는다([ADR-0068](../adr/0068-permission-scope-and-business-system-link.md)). 현재 Registry에는 MARS·BRAVO·CLAS·운영 콘솔·표준 로그 개발·개선 실행 여섯 업무 시스템이 있다. 홈·공지·내 VOC는 플랫폼 메뉴다. 표준 로그 개발·개선 실행은 내 작업 우선 메뉴 구성이고 메뉴는 모두 예정이다([ADR-0065](../adr/0065-log-dev-and-improvement-spaces-work-queue-first.md), #252).

---

## 10. Command Palette as Platform Navigation

메뉴 수가 증가하면 Sidebar만으로 탐색하지 않는다.

Command Palette는 플랫폼 공통 기능으로 둔다.

지원 후보:

```text
Go to 사이클타임
Go to Equipment EQP-013
Open Metric "Cycle Time P95"
Open recent view
Open saved view
Create VOC from current context
```

메뉴 이동을 기본 책임으로 둔다. Entity Search와 Action Command는 수요 검증 후 채택할 Deferred 후보이며 구현 시점은 정하지 않는다. 플랫폼 메뉴의 목적지(홈·알림·내 VOC·설문·권한 요청·공지)는 메뉴 이동 대상으로 팔레트에 나온다(ADR-0070, §9.1). VOC 등록은 레일 버튼이 연다. `Create VOC from current context`는 여전히 Deferred 후보다.

---

## 11. Global Context Bar

Context 바는 전역 Context를 표시·편집하는 셸 자리다. 초안/적용 메뉴에서는 이 자리가 조회 바(`QueryBar`)로 바뀌며, live 메뉴에서는 즉시 적용한다.

플랫폼에서 가장 중요한 공통 UI 중 하나다.

대표 Context: Time Range · room_name · Line · PRC 그룹 · Equipment Group(Condition·Selection) · Lot · PPID · Recipe · Metric(ID+버전 쌍). Scope는 Global Context에 속하지만 선택기는 사이드바 머리에 하나만 둔다(§7).

**다중축·소속 기준(Decided, 2026-10-21; Apply 모드 구현 — [ADR-0059](../adr/0059-app-injected-equipment-axes-and-condition.md)):** 바는 앱이 주입한 여러 축과 축별 여러 값을 표시·편집하고 축 간 AND / 축 안 OR의 적용 조건을 요약한다. “그 시점 소속 / 지금 소속” 선택과 현재 적용한 기준을 표시하며 이력 없는 축을 쓰면 지금 소속만 허용한다. 미지원 축·무효 조합·옵션 갱신 시 기존 값을 조용히 지우지 않고 사유를 표시한다. 후보의 서버 검색·페이징과 고정 선택의 페이지 밖 보존은 §6.4를 따른다. Apply 모드는 아래 조회 바를 쓰고 live 모드는 기존 즉시 적용 바를 유지한다.

**링크 복사 두 갈래 (Decided, 사용자 위임 2026-10-27, #961 노드 961f):** 바(live 바 오른쪽 끝, 조회 바 동작 행)의 `링크 복사` 묶음은 분할 버튼이다. 본 버튼 `현재 조건 공유`는 항상 적용된 조건의 링크를 복사하고(마지막 선택을 기억하지 않는다), 화살표 `링크 복사 방식 선택`의 메뉴는 `현재 조건 공유`와 `메뉴 주소 복사`(조건 없는 정규 경로)를 도움말 줄과 함께 둔다. 페이로드는 호스트의 **적용된** `global`/`page`만으로 `buildShareLink`(셸 `context/shareLink.ts`)가 v1 codec으로 만든다: 조회 바의 초안, `returnTo`, 등록되지 않은 extras는 들어가지 않고 §6.4의 carried page key는 `page`가 가진 그대로 남는다. 경로 파라미터가 없거나 직렬화에 실패하거나 4000자를 넘으면 잘라 내거나 맨 경로로 대신하지 않고 실패 문구만 보인다(4000자는 되돌릴 수 있는 기본값). 성공 문구는 클립보드 쓰기가 끝난 뒤에만 낸다. 쓰기가 거부되면 의도별 실패 문구와 다시 시도, 생성한 링크 그대로를 담은 읽기 전용 칸을 보이며 직렬화 실패 뒤에는 칸을 보이지 않는다. 조회 바의 미적용 변경은 `미적용 변경 N개 · 공유에서 제외`로, 한 번도 적용하지 않은 조회는 `아직 조회 조건을 적용하지 않았습니다.`로 알린다. 보드 칸에서는 그 칸의 경로·적용 상태를 복사하고 보드 주소는 칸 링크가 아니다. 이후 링크 종류(예: 스냅샷 `/share/:snapshotId`, 2단계 #294)는 이 메뉴의 항목으로 늘린다. VOC 재현 링크도 같은 `buildShareLink`를 쓴다.

Condition 프리셋(§6.4)은 조회 투영만 좁히므로 뒤로가기·보드 칸 복원에서 Condition 전체와 프리셋 page key가 주소 그대로 복원된다.

**조회 바의 조건 묶음(Decided, 2026-10-25, ADR-0083, #580 노드 580c):** `condition`이 `apply`이고 메뉴가 프리셋을 선언하면 `설비 조건` 묶음의 첫 줄에 `조건 묶음` 라디오(`SegmentedRadio`)가 서고 활성 프리셋의 축 입력만 그려진다. 전환은 초안 page만 바꾸고(적용 전 조회 0회, 적용 1회) 폴라이트 상태 문장 하나로 알린다(`조건 묶음: 조직 기준. N개 조건은 이 보기에서 미적용입니다.`, N이 0이면 뒷문장 없음). 활성 프리셋 밖 축의 값은 전달된 조건 줄에 `<축> <값> · <묶음>에서 미적용`으로 남고 `×`로 전역 Condition에서 지울 수 있다. 편집 중 요약은 초안 프리셋, 적용 요약(조회 바·보드 `적용 조건`·페이지 머리 `적용된 조회 조건`)은 적용된 프리셋으로 읽고, 적용 요약에는 프리셋 밖 축의 값이 없다. 보드 칸 Popover도 같은 구현이다. `조회 조건` 접기 버튼은 보이는 경계가 있는 `secondary` 도구줄 버튼이며 `aria-expanded`를 따르는 chevron(DESIGN.md 접기 규칙: 접힌 상태 `∨`로 펼치기, 펼친 상태 `⌃`로 접기)이 붙고 접근 이름은 그대로다.

Apply 모드의 Line·PRC 그룹은 독립 전역 키 옵션 포트로 편집하며 live 바는 전달값 요약·제거를 유지한다(2026-10-21 사용자 정정 — 소유자 #552). Condition 요약은 주입 descriptor 순서의 축 이름과 값, `asOf`일 때 “그 시점 소속”을 표시하고 PRC 그룹에도 같은 기준 표시를 붙인다.

### 일괄 적용 조회(Decided, ADR-0061)

- `GlobalContextBar`는 메뉴 `query.mode: 'apply'`일 때 SDK `QueryBar`로 전환하며 기존 live 메타데이터 effect를 마운트하지 않는다. 펼친 조회 바는 기간·공정·Line·PRC와 주입 축·소속 기준·EquipmentID 두 그룹, 미지원·참조 전달값 제거 영역, 단일 적용 동작을 제공한다. 전역 Scope 선택은 기존 즉시 동작을 유지한다. 접힌 요약은 실제 초안값과 적용값을 구별하고 전체값 열기를 제공하며 유효한 초안은 펼치지 않아도 적용한다.
- `null`은 전체 후보, `[]`는 명시적 빈 선택이다. Condition 축의 마지막 값 제거는 키를 지운다. 후보 페이지에 없는 값은 보존하며 조합 판정은 서버가 한다. 조회 바는 필수 누락뿐 아니라 Scope·유효성·메뉴 page 오류·커밋 대기 사유를 설명한다.
- `PageFilterBar mode="draft"`는 제어된 필드 API를 유지하고 자체 Apply/form 제출만 없앤다. 메뉴는 초안 page·기간에서 값·기본값·요약·오류를 계산하고 `PlatformPage.queryBarExtension`으로 전달한다. 결과·차트·목록·내보내기·드릴 링크는 적용값을 유지한다. 첫 소비자는 cycle-time(기간·공정 필수)이고 다른 메뉴는 live다.
- `PlatformPage.queryResult`는 메뉴가 고른 권위 있는 요약 쿼리의 `status/completedAt`이다. 정상 머리 아래(칸은 본문 안) 적용 조건 스트립에 적용값과 `요약 조회 완료` instant를 표시하며 viewer 시간대로 포맷한다. idle/loading/null은 완료를 숨기고 같은 신원의 refreshing은 기존 완료를 유지한다. 오류 응답의 완료도 성공 주장 없이 표시한다. cycle-time은 KPI 쿼리를 원천으로 쓰고 다른 위젯 오류는 기존 OutcomeScope로 남긴다. SDK는 쿼리를 추가·집계하지 않는다.

- `useQueryDraft()`는 `{ mode, draft: {global,page}, dirty, setDraftGlobal, setDraftPage, apply, revert, reset, missing, canApply, applying }`를 제공한다. live에서는 적용값을 비추고 setter가 기존 API로 통과한다. dirty는 비어 있고 apply/revert/reset은 no-op이다.
- 초안은 논리적 화면마다 하나다. 본 화면·다른 칸은 격리하고 같은 칸의 본문·Context 바는 시트 수명 소유자 `PaneQueryDraftProvider screens` 아래서 같은 저장소를 읽는다. 칸 선택·숨김·접힘·편집기 재마운트는 초안을 보존한다. 칸/시트 제거, 메뉴·경로 params·세션 교체는 폐기한다.
- 초안 setter는 URL·조회·적용 결과를 바꾸지 않는다. global setter는 codec·주입 축·소속 기준을 검증하며 실제 의미 변경 시 `contextResetKeys`를 즉시 초안 page에서 제거한다. page setter는 선언된 키만 받고 null/빈 문자열은 삭제한다. 미지원 등록 Context와 extras는 Apply의 한 번의 push에도 보존한다. 잘못된 기간·지표 쌍·축·이력 미지원 asOf는 명시적 오류이며 자동 보정하지 않는다. 초기화는 Scope와 기본 기간만 가진 초안 + 빈 page, 되돌림은 적용 global/page다.
- dirty는 정규화한 의미가 바뀐 GlobalContext 필드명과 page 키 목록이다. 집합·Condition 순서 변경은 dirty가 아니다. Apply는 정확히 최종 후보의 required와 Scope를 검사하며 global 변경으로 제거될 required page도 누락으로 본다. 불가·동일 후보는 no-op이다. 초기화 경로의 초안 id-only 지표는 서버 발행 버전을 먼저 채워 한 번에 커밋한다. 미등록·미발행은 거부하며 비초기화 경로의 incomplete 쌍 오류는 유지한다. URL id-only 확인 replace는 초안 기본 기간을 적용하지 않는다.
- 주소의 실제 변경은 다른 writer·링크·history·보드 일괄 적용 모두 초안을 새 적용값으로 rebase한다. 같은 주소 이동은 유지한다. Scope 선택은 기존 즉시 API로 Site 경계 필드를 지운 뒤 rebase한다. 자체 Apply의 지연 반영은 클릭 뒤 편집을 보존하고 중복 호출을 동기 억제한다. `applying`은 현재 turn의 커밋 전달 중이며 조회 loading과 별개다. 전달 뒤 false로 정착하고 미확인 제안은 중복 억제만 유지한다(주소 확인/다른 주소 이동 때 해제).
- 실행 게이트는 주소의 명시적 유효한 from/to + 선언 필수값이다. bare route, v/extras만, Scope만, page만, 미지원 Context만 있는 주소는 idle이다. 필수 Scope는 현재 세션에서 검증해야 요청할 수 있다. 시간 없는 Apply opt-in은 실행 여부를 주소로 재현할 표현이 없어 Registry 오류로 거부한다. 실행 marker나 세션 hasApplied flag를 추가하지 않는다.
- 필수 Context의 대응은 time→from+to, roomNames→roomNames, line→lineNames, prcGroup→prcGroups, condition→condition, selection→selection, lot→lotIds, ppid→ppid, recipe→recipeIds, metric→metricId+metricVersion이다. null/undefined는 누락, 기간·지표는 유효한 완전한 쌍이어야 한다. 집합 `[]`는 존재이며 기존 원천 조회 없는 empty 응답을 유지한다. 빈 page는 누락이다. `missing`은 `{key,label: Text}[]`이고 Context에는 CONTEXT_LABELS, page에는 선언 label을 사용하며 queryMissing 사전으로 선택 사유를 번역한다. 필수값 없이 실행 전이면 missing=[]와 일반 조회 전 문구를 쓴다.
- 분석 요청(useMenuQuery, 공유 menuRequest를 쓰는 useMenuFetch·ModuleHost.query)에 게이트를 적용한다. fetch.ready는 false이며 직접 호출도 adapter 대신 기존 not_ready envelope로 답한다. raw usePlatformQuery·목적지/entity·감사·주석은 보조 요청으로 유지한다. Scope·session·투영 검증은 유지하고 required는 서버 검증을 대신하지 않는다. 조회 바와 cycle-time opt-in은 #553에서 제공하며 최근 조건 저장·복원은 아래 계약을 따른다.

### 최근 조회 조건(현재 견본 구현, 저장 위치 Open — #554)

- SDK `QueryHistoryStore`는 `{userId, menuId, scopeId}`별 `list/record/remove/clear` 비동기 포트다. `PlatformProvider queryHistory`가 없거나 live 메뉴이면 기능과 UI를 제공하지 않는다. 현재 견본 호스트는 `platform:query-history:v1:` + JSON 튜플 `[1,userId,menuId,scopeId]`의 브라우저 저장소를 주입한다. 이는 현재 구현이며 저장 위치의 최종 계약은 아니다. local-only와 서버 동기화 중 선택은 파일럿 전에 결정한다(#554 §5); Saved View는 이 범위에 포함하지 않는다.
- 저장 항목은 `{id, query, schemaVersion:1, lastAppliedAt, count}`뿐이다. `query`는 codec으로 정규화한 적용 global과 선언 page 키의 코드포인트 정렬이며 extras·returnTo·초안·결과·인증정보는 저장하지 않는다. id는 UTF-16 코드 단위에 대한 32비트 FNV-1a 8자리 16진수이며 병합에는 query 일치도 필요하다. 명시적 Apply 제안이 적용 주소로 확인될 때 클릭 당시 후보·사용자·메뉴·Scope로 정확히 한 occurrence(count=1)를 보낸다. 실패·동일값·미확인/대체된 제안·직접 이동·Back/Forward·기본값 물질화·초안 편집은 기록하지 않으며 분석 응답 실패는 기록을 취소하지 않는다.
- 저장소가 병합·횟수·시각·20건 보존을 소유한다. 플랫폼은 Web Locks로 같은 origin의 탭·호출자를 직렬화한다. lock 미지원과 저장소 읽기/쓰기 실패는 고정된 비민감 오류로 거부한다. Kernel은 오류를 잡아 `disabled | loading | ready | unavailable` 상태로 제공하며 일반 조회는 계속한다. 성공한 빈 목록은 ready다. schemaVersion·문자열·현재 query 문법·유한 비음수 시각·양의 safe-integer 횟수를 검사한다. 손상된 현재 envelope는 빈 목록으로 읽고 성공한 record 전에는 덮지 않는다(명시적 clear는 삭제). 미래 envelope는 모든 변경을 거부하며 migration을 요구한다. 지원하지 않는 query 버전은 일반 무효 행으로 남겨 삭제할 수 있다.
- 정렬은 lastAppliedAt 내림차순 → count 내림차순 → id 코드포인트 오름차순 → query 코드포인트 오름차순이다. SDK `useQueryHistory()`는 상위 10행·restore/remove/clear·상태와 열기 검증을 제공한다. 최근 조건은 상대 시각과 실제값 요약을 표시하며 옵션 선택은 초안만 복원한다. 삭제는 복원 옵션 밖에 두고 모두 지우기는 팝오버 안에서 확인한다. Escape는 연 버튼으로 돌아간다.
- 값 표시·복원 전에 현재 메뉴 권한과 검증된 Scope, 저장 Scope 일치, room grant, 현재 주입 축·asOf 지원·완전한 지표 쌍·codec·선언 page 키를 검사한다. 팝오버를 열면 표시할 행의 고정 EquipmentID 합집합을 기존 resolveSelection으로 한 번 확인하며 ok만 허용한다. 실패/진행 중/권한 회수는 값·원문·오류 내용을 노출하지 않는 일반 상태와 시각·삭제만 표시한다. Line·PRC·page 값은 사용자의 이전 입력이며 별도 권한 포트를 신설하지 않는다. 세션 객체·revision·저장 포트·논리적 화면·Scope가 바뀌는 첫 렌더부터 이전 행을 숨기고 늦은 완료·붙들린 동작을 무효화한다. 이력은 목록·복원 검사마다 validateScope로 현재 room grant를 독립 확인하며, 진행 중 검사는 세션/revision 변경·해제 때 취소한다. 화면 Scope 상태와 다시 시도 수명주기는 이 검사로 바꾸지 않는다.
- 재방문 자동 초기화는 논리적 초안 저장소에서 한 번 수행하며 별도 pane Provider가 공유한다. 성공적으로 해석한 주소에 Scope/version 이외 전역값과 선언 page가 없을 때만 최신 한 건을 검증해 복원한다(extras는 유지하되 복원하지 않음). 최신이 무효이면 이전 건으로 대체하지 않는다. 조회 시작 이후 편집·되돌림·초기화·Apply·주소 변경이 있었으면 덮어쓰지 않으며 되돌린 편집도 revision으로 감지한다. 유효 deep link·부분/잘못된/미지원 전달 조건은 항상 우선한다.
- 수동·자동 복원은 같은 원자적 초안 전체 교체를 쓴다. 저장 항목에 없는 page 키는 지우며 저장 global과 page를 검증된 한 쌍으로 복원한다. 이 명시적 경로에서는 contextResetKeys도 그 global 소속으로 보존해 다음 Apply에서 제거하지 않는다. 이후 일반 global 편집의 reset 규칙은 유지한다. 적용값·extras·URL·분석 게이트·결과는 복원으로 바뀌지 않고 사용자가 Apply해야 실행한다. ModuleHost·FeedbackOps/반환 링크는 계속 적용값만 읽는다.
- page 표시명·유효 기본값은 소비자의 순수 `historyPageSummary(global,page)` 메타데이터가 제공하며 현재 초안/결과 요약을 다른 행에 빌려 쓰지 않는다. history 내용은 usage·오류 보고로 보내지 않는다. 실기기 동기화·서버 저장·공유 정책은 이 포트의 별도 구현 범위다.

### Context 변경 규칙

- 사용자가 명시적으로 바꾼 값만 전역 상태를 변경한다.
- 단순 Chart Zoom은 Global Context를 변경하지 않는다.
- Brush 후 `Analyze selected range` 같은 명시적 Action이 있어야 Global Context로 승격한다.
- Scope·설비·기간 등 Context가 바뀌면 이전 결과를 새 조건의 결과처럼 표시하지 않는다. 이전 요청이 늦게 완료돼도 새 Context 결과로 채택하지 않는다. 동일 Context 재조회에서만 이전 결과와 갱신 중 표시를 함께 유지할 수 있다. 권한 변경/Scope 전환에서는 이전 결과를 숨기고 현재 권한을 재검증한다.
- 지원하지 않는 Context는 명시적으로 표시한다.
- 초기화는 분석 Context만 지우고 요청 Scope는 유지한다(같은 내비게이션에서 `contextResetKeys`도 지운다, §6.4). 링크 복사는 현재 URL을 그대로 복사하며 받는 사람의 권한으로 서버가 다시 검증한다(§6.2).

---

## 17. Permission-aware UX Contract

권한은 메뉴 노출만의 문제가 아니다.

같은 권한/Scope 규칙이 다음에 모두 적용되어야 한다.

- Menu visibility
- Route access
- Filter option
- Query result
- Saved View
- Export
- Drill-through
- Context Link
- VOC related analysis link

### UI 규칙

권한 없음과 데이터 없음은 구분한다.

```text
No matching data
```

와

```text
You do not have access to this scope
```

는 같은 Empty State를 사용하지 않는다.

URL Context는 보안 경계가 아니며 서버가 항상 재검증한다.

---

## 21. Saved View Contract

Saved View는 단순 Filter 저장 기능이 아니라 플랫폼 공통 자산이다. 결정은 [ADR-0092](../adr/0092-saved-view-units-tiers-and-groups.md)(#294, Decided 2026-10-27), 구현은 #1011(mock 범위)이다. 서버 저장·ACL·감사는 #155 합의 전이라 이 절은 **포트와 UI 계약**을 정하고 서버 정책은 아래 「서버 몫」으로 남긴다.

### 21.1 저장 단위 (Decided)

| 단위 | 담는 것 |
| --- | --- |
| 조건 세트 | 지원 Context(기간 규칙, 설비 Selection/Condition, `membershipBasis`, Line·PRC 그룹). 메뉴 사이에 재사용한다. 메뉴가 지원하지 않는 값은 §6.4대로 적용되지 않음을 표시한다. |
| 메뉴 뷰 | 한 메뉴의 적용 조건 + page-owned 키(필터·표 열 상태·분석 표시) + 차트 옵션 + 배치 + 패널별 좁히기 설정(`panels`) + `schemaVersion`·메뉴 안정 ID·메뉴 스키마 버전. |

- 보드 시트는 메뉴 뷰 여러 개의 배치이며 새 형식이 없다. 패널은 따로 저장하지 않고 메뉴 뷰의 `panels`다.
- 저장하지 않는 것: 일시 hover, 단순 chart zoom, 열린 modal, 미적용 draft. 원시 데이터와 엔진 raw JSON은 저장하지 않는다(엔진 중립 배치만).
- **패널 좁히기**는 메뉴 Context를 좁히기만 한다(단계 자르기, 부분 선택, 메뉴 기간 안의 부분 구간). 메뉴 Context를 바꾸거나 넓히지 않는다. 좁힌 뒤 메뉴 조건이 바뀌어 범위 밖이 된 구성원은 교집합만 그리고 제외된 값과 사유를 보인다(0개면 빈 결과). 이 규칙은 패널 설정에만 적용되며 메뉴 전역 Selection을 자동 교집합으로 바꾸는 근거가 아니다(§6.4). 이번 단계는 `panels` 슬롯과 읽기 전용 요약만 두고 저장·복원은 #911 계약 뒤다.

### 21.2 소유·공유 (Decided)

- 소유 단계는 개인 → 그룹 → 공식이다. 그룹은 **조직 팀**(인사/SSO 원천, 멤버 편집 불가)과 **커스텀 그룹**(사용자가 만들고 멤버를 관리)이며 같은 계약이다. `stgroup`(설비 작업 대체 묶음)과 다른 말이다.
- 공유 대상: `나만 / 사람 지정 / 그룹 / 공식 신청`. 소유자, 공개 대상, 승인 상태는 별도 필드다(승인 신청이 공개 대상을 대체하지 않는다).
- 공유는 권한을 주지 않는다. 열람·복원마다 서버가 Scope·room·메뉴 권한을 다시 판정하고, 권한이 모자란 뷰는 허용된 정보만 이유와 함께 `열 수 없음`이다. 공유 목록을 볼 권한과 그 Scope 데이터를 볼 권한은 별개다.
- 업데이트·공유·승인·회수·그룹 편집은 **객체별 capability**(서버가 뷰·그룹마다 주는 가능 동작: 열람/복제/편집/공유/그룹 관리/승인/회수)로 UI를 구성한다. 역할 하나로 가르지 않는다. 공식 게시본은 개인 편집으로 덮어쓰지 않으며 변경본은 재승인 대상이다. 다른 사람이 관리하는 뷰는 개인 복사본 저장을 쉽게 제공한다.
- 사람 지정 목록의 `커스텀 그룹으로 저장`은 그룹 생성·선택까지만 한다. 뷰의 공개 대상은 `공유 대상 저장` 또는 새 뷰의 최종 `저장`에서만 확정된다. 이미 생성한 그룹은 취소해도 남는다(생성 완료 때 안내).
- 게시·회수·승인·그룹 멤버 변경은 서버 감사 대상이다. UI는 서버 성공 뒤에만 상태를 바꾸고 실패·충돌은 입력을 보존한다. 감사 기록 자체는 서버 몫이므로 UI 문구가 감사 완료를 주장하지 않는다.

### 21.3 선택기·저장·주소 (Decided)

- 진입점은 조회 도구행 안의 **현재 뷰 선택기**다(이름 검색, 공유 대상 필터, 현재 항목 체크, `내 기본` 별도 표식, `수정됨`, 저장 메뉴). 추가 고정 행을 만들지 않고 정상 완료 메시지는 기존 알림 패턴을 쓴다. `뷰 관리`는 소유자·저장 내용·승인 큐·낡음/권한 설명을 요청할 때만 여는 표면이며 일상 조회 중 자동으로 열거나 본문 폭을 고정 점유하지 않는다. 승인 대기는 이 표면의 필터로 직접 연다.
- `현재 뷰에 저장`과 `새 뷰로 저장`은 분리한다. 수정되지 않은 현재 조건도 새로 저장할 수 있고 저장 경로는 항상 제공한다. `저장본으로 되돌리기`(뷰 저장본)와 조회의 `초안 되돌리기`(미적용 초안)를 구별하고, `미적용 변경`과 `저장되지 않은 변경`을 구분해 보인다. 뷰 전환으로 변경을 버릴 때는 저장/버리기/취소를 준다. **적용한 조건을 저장**하는 것이 기본이며 초안이 있으면 적용 뒤 저장하도록 안내한다.
- 개인 기본은 사용자·메뉴별 시작점이며 해제할 수 있다. 직접 링크·새로고침·history의 명시 주소를 기본 뷰로 덮어쓰거나 누락 키를 기본에서 채우지 않는다(§6.4). 일반 메뉴 진입의 기본 적용 경로와 그때의 주소 물질화는 구현 노드가 정한다. 선택한 뷰 ID/버전과 명시 주소가 충돌하면 명시 주소가 이긴다. 복원 결과를 링크로 복사하면 뷰 ID가 아니라 물질화된 Context를 재현한다(`savedViewToken`은 여전히 예약, Deferred).
- 최근 실행(QueryHistory, §6)은 별도 경로다. 뷰 목록에 섞지 않고 복원은 초안이며 자동 실행·게시가 없다.
- 낡은 뷰(메뉴 스키마·축·지표 버전 변경)와 권한 부족은 이유와 안전한 갱신 경로(의미를 보존하는 이행만 미리보기 후 확정, 아니면 기존 조건을 보존한 채 다시 선택)를 준다. 무효 축을 제거해 무제약으로 만들거나 빈 교집합을 전체로 바꾸지 않는다. 서버 거부 때 기존 결과를 새 뷰 결과로 남기지 않는다.
- 키보드(§26, Windows): 뷰 행과 `⋯`는 독립 포커스 대상, 검색→항목→동작, Enter/Space, Escape는 한 단계씩 닫고 트리거로 복귀한다. 중첩 대화상자는 닫힌 부모로 포커스를 돌리지 않는다. 비활성 사유는 키보드로 읽을 수 있다.

### 21.4 서버 몫 (#155 합의 전 — 구현 안 함)

저장소는 `SavedViewStore` 포트(앱이 `PlatformProvider`에 주입, QueryHistory와 같은 방식; 없으면 기능과 UI가 없다)다. 이번 단계의 구현은 브라우저 로컬 mock이다. 서버 ACL·감사·동시 수정·멤버 이탈의 즉시성·공식 회수 뒤 공개 대상·관리자 부재 시 소유권은 #155에서 정한다. 시안의 임의 재게시는 계약이 아니다.

Saved View가 권한을 우회하지 않도록 복원 시 서버 Scope를 다시 검증한다. 구현 승인 범위는 ADR-0092와 #1011이 정한다(`../overview/roadmap-and-open-questions.md`의 가설은 구현 승인이 아니다).
