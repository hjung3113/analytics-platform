# W-1197p 캡처 설명 — 모델 탐색 · 모델 공통 프로파일 · 전체 기술 Item · Item 상세 (`?variant=A|B|C`)

실제 mock 앱(셸·사이드바·밀도 실제)에서 ego-browser로 찍었다. 크기는 `sips`로 확인했다(1440×900, `*-item-drawer.png`만 1280×800). 데이터는 합성 픽스처(제조사 8, 공정 12, 모델 300, SW 약 600, Item 80)다. 하단 가운데 검은 알약은 안 전환기이며 설계 대상이 아니다.

## 캡처

- `now-logdev.png` — 수정 전 표준 로그 개발 공간: 로그 지식 허브 그룹에 카탈로그 관리 하나뿐
- `A-models.png` — 모델 탐색 A: 검색 + 제조사·공정·활성 상태 필터 줄 + 표, 기본 활성
- `A-profile.png` — MX-200(공정 3, SW 5) 프로파일 A: 섹션 이동 막대 + 요약·SW 버전 표·모델 공통 Item·Top View 순서
- `A-profile-empty.png` — MX-210(SW 0) A: `등록된 SW 버전이 없습니다` + SW 버전 추가
- `A-items.png` — 전체 기술 Item A: 소유·유형·검증·처리·게시(기본 게시됨) 필터 + 표
- `A-item.png` — KI-101(r3, 근거 3, 이견 있음) A: 본문 2/3 + 근거·연결·리비전 1/3, 판단 변경 이력은 아래
- `A-item-drawer.png` — A 판단 변경 서랍(1280×800): 축·새 상태·사유 필수·근거 연결
- `A-derive.png` — A 관련 Item으로 신규 작성: derived_from 안내, 소유 다시 고르기, 근거 비움, 상태 초기화
- `B-models.png` — 모델 탐색 B: 왼쪽 제조사 → 모델 트리(지연 펼침) + 선택한 제조사의 모델 표(공정은 표 필터)
- `B-profile.png` — MX-200 B: 허브(SW 버전·모델 공통 Item 5행 미리보기 + 모두 보기, 오른쪽 요약·관련 지식·Top View)
- `B-profile-empty.png` — MX-210 B: 빈 SW 상태가 허브 카드 안에
- `B-items.png` — 전체 기술 Item B: A와 같은 필터 표(과제가 A·B 동일 지정)
- `B-item.png` — KI-101 B: 본문 + 연결 Item, 오른쪽 탭 근거 / 판단 이력 / 리비전
- `B-item-drawer.png` — B 판단 변경 서랍(1280×800): 오른쪽 탭 줄이 좁아져 가로 스크롤
- `B-derive.png` — B 파생 작성 서랍
- `C-models.png` — 모델 탐색 C: Miller 열 제조사 → 모델 → SW 버전 + 요약 칸(Vendor A › MX-200 › v3.2.1 선택)
- `C-profile.png` — MX-200 C: 탭 요약 / SW 버전 5 / 모델 공통 Item 2 (SW 버전 탭)
- `C-profile-empty.png` — MX-210 C: SW 버전 0 탭의 빈 상태
- `C-items.png` — 전체 기술 Item C: 목록 + 분할 미리보기(행 클릭 = 미리보기, `전체 화면으로 열기`)
- `C-item.png` — KI-101 C: 전체 폭 탭 본문 / 근거 / 판단 이력 / 리비전, 본문은 사실 열 | 의견·개선 열
- `C-item-drawer.png` — C 판단 변경 서랍(1280×800)
- `C-derive.png` — C 파생 작성 서랍

## 안별 장단점

### 모델 탐색
- **A 필터 표**
  - 강점: §16.6 열·필터를 그대로 따르고, 모델 수천 개와 공정 N:M에서도 한 모델이 한 행이다. 검색이 먼저인 사용에 가장 빠르다.
  - 약점: 제조사 → 모델 위계가 보이지 않는다. MX-200처럼 이름을 모르면 필터를 먼저 골라야 한다.
  - 근거: NN/g 패싯 필터, Cloudscape table view, Backstage catalog(`lk-ui-research.md` A.1).
- **B 트리 + 표**
  - 강점: 제조사별로 훑어보기 쉽다. 트리 선택은 표의 범위만 정하고 소유를 정하지 않는다. 공정은 N:M이라 트리에 넣지 않고 필터로 남겼다.
  - 약점: 트리 숫자(전체)와 표(활성만)가 다르게 보인다. APG 트리 키보드·지연 로드 상태를 SDK가 갖춰야 한다. 표 폭이 줄어 열이 잘린다.
  - 근거: Carbon tree view, Primer lazy subtree, WAI-ARIA APG tree, Cloudscape split view(A.2).
- **C Miller 열**
  - 강점: 제조사 › 모델 › SW 경로가 한눈에 보이고, SW 버전까지 펼치지 않고 좁힌다.
  - 약점: 화면 폭을 많이 쓴다. 검색이 먼저인 사용에 약하고, 요약 칸이 비어 보인다. 열 접근성 선례는 검증되지 않았다.
  - 근거: Apple column views(제목만 확인, 내용은 추정 — A.3).

### 모델 공통 프로파일
- **A 섹션 쌓기**
  - 강점: 명세 순서 그대로라 빈 상태(SW 0)와 개수가 숨지 않는다. 섹션 이동 막대가 붙어 있다.
  - 약점: SW·Item이 많으면 길게 스크롤해야 하고, Top View 안내가 접힘 선 아래로 밀린다.
  - 근거: Cloudscape details(base), PyPI anchor-nav(B.1).
- **B 허브 + 미리보기**
  - 강점: SW 5행·Item 5행 미리보기 + 모두 보기로 Item이 많아도 첫 화면이 일정하다. 모델 공통 Item과 SW 소유 Item 개수를 나란히 둬서 상속처럼 보이지 않는다.
  - 약점: 모두 보기가 한 번 더 조작해야 하는 단계다. 오른쪽 요약 칸이 좁아 설명이 줄바꿈된다.
  - 근거: Cloudscape details hub, Backstage relations(B.2).
- **C 탭**
  - 강점: 화면이 짧고 SW 프로파일(§16.11) 탭 패턴과 같다. 탭 라벨에 개수가 있어 SW 0이 보인다.
  - 약점: 요약 탭만 열면 SW·Item 내용이 숨는다. 탭을 오가야 비교할 수 있다.
  - 근거: Cloudscape details with tabs(B.3).

### 전체 기술 Item
- **A·B 필터 표**(과제가 같은 표로 지정)
  - 강점: §16.12 행 `[Item ID, 제목, 소유 Model/SW, 유형, 검증/처리 상태, 갱신일]`과 필터 다섯 개. 게시됨이 기본이고, 보관·초안은 흐리게 보인다.
  - 약점: 본문을 보려면 Item을 열어야 한다. 상태 배지 두 개가 열을 넓힌다.
  - 근거: 연구 C 목록 항목, Cloudscape table view.
- **C 목록 + 분할 미리보기**
  - 강점: 행 클릭만으로 본문 네 구획을 미리 보며 빠르게 분류할 수 있다. 전체 화면은 버튼 하나다.
  - 약점: 미리보기 칸에 근거·이력이 없다(전체 화면에서 봄). 표의 필터 줄을 쓰지 못하고 게시됨 체크만 있다.
  - 근거: Cloudscape split view(C.3).

### Item 상세
- **A 본문 2/3 + 근거 1/3**
  - 강점: 명세 ASCII 그대로다. 사실(실선 카드)과 의견(점선·바탕 다름 + `의견 · 사실 아님`)을 시각적으로 나누고, 근거가 본문 옆에 있다.
  - 약점: 판단 변경 이력이 접힘 선 아래에 있다. 서랍을 열면(1280) 본문 칸이 좁아진다.
  - 근거: Sentry issue details, PagerDuty postmortem, GitHub advisory(C.1).
- **B 본문 + 근거·이력 탭**
  - 강점: 판단 이력에 스크롤 없이 닿는다. 본문 폭이 넓다.
  - 약점: 이력을 보는 동안 근거가 가려진다. 서랍을 열면 오른쪽 탭 줄이 넘친다(`B-item-drawer.png`).
  - 근거: Sentry activity, Cloudscape tabs(C.2).
- **C 전체 폭 탭**
  - 강점: 본문을 사실 열 | 의견·개선 열로 나눠 읽기 쉽다. 탭에 근거·이력·리비전 개수가 있다.
  - 약점: 본문과 근거를 동시에 볼 수 없어 근거 확인 왕복이 생긴다. 헤더 아래 정보가 탭 뒤에 숨는다.
  - 근거: Cloudscape details with tabs(B.3 패턴을 상세에 적용 — 추정).

## SDK 조각 후보

### `HierarchyExplorer` (B의 트리, `prototype/HierarchyTree.tsx`가 지역 대역)
- props: `label`(트리 접근 이름), `roots: Node[]`, `Node = { id, label, meta?, muted?, children?: () => Node[] | Promise<Node[]> }`(있으면 부모, 펼칠 때만 읽음 = 지연), `selectedId`, `onSelect(id)`(선택 = 옆 칸 범위), `onActivate?(id)`(Enter·더블클릭 기본 동작, 예: 잎 열기), `expanded`/`defaultExpanded`/`onExpandedChange`(제어·비제어), `loadState`(노드별 `loading|done|error` + `onRetry`), `indent` 토큰(단계별 들여쓰기 — 지역 대역은 인라인 스타일 대신 단계 클래스).
- 동작(APG tree): `tree`/`treeitem`/`group`, 모든 노드에 `aria-level`·`aria-setsize`·`aria-posinset`(부분 DOM), 부모만 `aria-expanded`, `aria-selected` 하나, roving tabindex, ↑/↓ 보이는 노드, → 열기 또는 첫 자식, ← 닫기 또는 부모, Home/End, 첫 글자 type-ahead, 펼침 단추와 행은 별개 대상(펼침 단추는 Tab 정지점 아님), 지연 로드 `불러오는 중`/`다시 시도`와 완료 안내, 24px 이상 대상, 긴 라벨은 말줄임 + title.
- 경계: 위계 단계 수와 단계 이름, 무엇이 잎인지는 메뉴가 선언한다(N:M 축은 트리에 넣지 않고 필터로 둔다). 기존 `LegendTree`(차트 범례·보이기 체크)와 키보드 코어를 나눌 수 있는지 검토해야 한다.
- C(Miller 열)를 고르면 같은 노드 모델로 `layout="columns"`를 받는 형태가 후보다. 이 경우 열마다 `listbox` + 열 사이 ←/→ 이동이 필요하고 검증된 공개 접근성 선례는 없다.

### `HierarchyBreadcrumb` (세 안 모두)
- 지금은 SDK `PlatformPage crumbs`(부모 메뉴 + 추가 조각 + 제목)로 `모델 탐색 › Vendor A › MX-200`, `전체 기술 Item › KI-101`을 만들었다. 동적 조상 표시는 이미 된다.
- 빠진 것: 현재 항목 `aria-current="page"`(지금 제목 h1이 마지막 조각 역할), 조상 조각마다 그 단계로 좁힌 목록 링크(`href`는 메뉴가 계산 — A는 `filter`, B/C는 `node`), 긴 경로 가운데 접기(`…` 메뉴), 조상 이름을 아직 모를 때 자리 표시(로딩).
- 소유 대상 표시(KI-101의 `소유 SW MX-200 / v3.2.1`)는 breadcrumb가 아니라 메뉴 몫의 칩이다. 소유는 경로가 아니다.
