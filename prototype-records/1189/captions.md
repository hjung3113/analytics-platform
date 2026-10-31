# #1189 홈·시스템 전환기 시안 — 캡처 설명

실제 앱(mock, admin 역할) 1440×900 @2x. 캡처 전에 MARS → CLAS를 방문해 `이어서`와 최근 방문이 보이는 상태로 맞췄다(지금 화면도 같은 상태). 전환기 캡처는 MARS `생산성 개요`에서 열었다. 주소에 `?variant=A|B|C`를 붙이면 시안, 없으면 지금 화면 그대로다.

| 파일 | 내용 |
| --- | --- |
| `home-{now,A,B,C}.png` | `/home` 전체 |
| `switcher-{now,A,B,C}.png` | 전환기를 연 화면 |
| `switcher-trigger-{now,A,B,C}.png` | 닫힌 트리거, 왼쪽 위 320×200 |

## 셋 다 같은 규칙 (1차 수정 반영)

- **시스템 표식 = 그 시스템의 outline 아이콘**(칩·상자 없음, DESIGN.md L154/L310). 지금 쓰는 그룹 아이콘 그대로다: MARS 막대, BRAVO 게이지, CLAS 선, 도구 지도, 운영 콘솔 목록. 표준 로그 개발과 개선 실행은 지금 둘 다 `내 작업` Inbox 아이콘이라 구별이 안 돼서 시안에서 두루마리·렌치로 바꿨다 — 실제 구현에는 `SpaceDef.icon` 같은 계약 필드가 필요하다. 한글 첫 글자 상자(`표`·`개`·`도`·`운`)는 어디에도 없다.
- **닫힌 트리거**: 라틴 이름(MARS·BRAVO·CLAS)만 첫 글자(`M`), 한글 이름은 시스템 아이콘. 그 아이콘이 그 시스템의 레일 섹션 아이콘과 같으면(도구 지도 = 유일한 섹션, 운영 콘솔 목록 = `대시보드` 섹션) 레일과 겹치지 않게 중립 `Layers` 아이콘으로 바꾼다. 홈(현재 시스템 없음)은 A 집, C `Layers`(C는 레일 맨 위가 이미 집 링크라서). 도구·표준 로그 개발·운영 콘솔 트리거는 따로 찍어 확인만 했다(12장에는 없음).
- **글자 단계**: 이름 14px semibold primary, 짧은 문구 13px `text-secondary`, 그룹 라벨 12px semibold muted, 목록 보조값(`CLAS · 방금`) 12px secondary. 지금 화면의 10px(`text-caption`) muted 부제는 없앴다.
- **세로 리듬(A·C)**: 위 시스템 블록과 아래 즐겨찾기·최근 방문·공지가 같은 열 격자(A 3열, C 4열, 열 간격 40px)를 쓰고, 라벨은 둘 다 24px 줄, A의 행은 위아래 모두 36px다.
- **관찰**: 시안 홈은 내용이 화면 위쪽 절반에서 끝나 아래가 비어 있다(최소화한 결과). 즐겨찾기·공지가 차면 아래 목록이 길어진다.

## A 조용한 목록 (리서치 추천)

- 홈: 카드·칩·테두리 없음. 작은 그룹 라벨 아래 한 줄 행(아이콘 · **이름** · 짧은 문구)을 3열로. 이어서가 있는 행은 오른쪽 끝에 링크 색 `이어서 · 생산성 개요`(무엇을 이어 가는지 함께 적음).
- 홈 아래쪽: 즐겨찾기·최근 방문·공지를 테두리 없는 같은 3열 목록으로, 위 3열과 왼쪽 끝을 맞췄다. 패널 부제 문장·회색 빈 상자·파란 공지 띠를 없앴고 `공지 목록`은 공지 라벨 오른쪽 `전체 보기`로.
- 전환기 트리거: 파란 칩·모서리 화살표 대신 32px 중립 상자 안 `M` + `⇅`(레일의 다른 버튼과 같은 32px). 아래 구분선 없음.
- 팝오버: 320px 1열 목록(아이콘 · 이름 · 짧은 문구), 현재는 ✓ 하나(`현재` 글자는 화면 읽기 전용). 제목 칸막이·`시작:` 줄 없음, `이어서`는 행 툴팁. 플랫폼 메뉴는 목록 아래 3열 링크.
- 차용: shadcn sidebar-07 팀 전환기(https://ui.shadcn.com/blocks/sidebar), Notion 워크스페이스 ✓(https://www.notion.com/help/intro-to-workspaces), PatternFly context selector — 8개 안팎은 검색 없는 1열(https://www.patternfly.org/components/menus/context-selector/design-guidelines), DESIGN.md 내비 아이콘 outline·section label.
- 구현 규모(추정): 코드 3(`SystemSwitcher.tsx`, `OperationsHome.tsx`, `AppRail.tsx`) + 앱 1(`menus.ts` 문구·아이콘) + 계약 1(`SpaceDef.icon`) + 테스트 3(`SystemSwitcher.test.tsx`·`.entry.test.tsx`, `OperationsHome.test.tsx`, e2e 셀렉터 점검) + 문서 2(`multi-workspace-ui.md` §3.1·§3.2, ADR-0102 개정). 계약 변경: 전환기 "2열 카드" → "1열 목록", "플랫폼 메뉴 위쪽" → "아래쪽", 홈 그룹 제목 `t-section-title` → section label.

## B 런처 격자

- 홈: 그룹마다 아이콘 타일(44px 테두리 아이콘 상자 + 이름)을 한 줄로. 설명 없음. **이어서 표시는 B에서 뺐다** — 타일은 여전히 이어서 위치로 열리고 툴팁에 `이어서: 생산성 개요`가 있다(타일 폭에 대상 이름까지 넣으면 잘린다).
- 격자 규칙 하나: 타일 104px, 그룹 안 간격 8px(아이콘 간 피치 112px), 그룹 사이는 48px 더(피치 152px). 타일은 왼쪽 정렬이라 그룹 라벨·아이콘 상자·이름이 한 왼쪽 선에 선다. hover는 아이콘 상자 배경과 이름 색만 바꾼다.
- 홈 아래쪽: A와 같은 3열 조용한 목록, 왼쪽 끝을 타일 줄과 맞췄다.
- 전환기 트리거: 와플(⋮⋮⋮) 아이콘, 칩 없음 — 레일의 다른 버튼과 같은 모양. 현재 시스템은 트리거에 보이지 않는다(페이지 머리 `MARS › 메뉴`와 사이드바 머리가 대신 보인다). **계약 §3.2 "현재 시스템 아이콘(또는 짧은 문자)"과 다르다.**
- 팝오버: 같은 아이콘 상자 + 13px 이름의 3열 칸(칸 안 가운데 정렬 — 좁은 팝오버에서는 같은 폭 칸이라 가운데가 고르다), 현재는 선택 배경 하나. 플랫폼 메뉴 링크도 같은 3열. 그룹 라벨은 넣지 않았다(넣으면 ADR-0102 그룹 분류를 SDK가 알아야 해서 공개 계약 변경).
- 차용: Microsoft 365 앱 런처(https://learn.microsoft.com/en-us/microsoft-365/admin/manage/pin-apps-to-app-launcher), Google Workspace 앱 런처(https://workspaceupdates.googleblog.com/2017/07/changing-default-order-of-apps-in.html), PatternFly application launcher(https://www.patternfly.org/components/menus/application-launcher/design-guidelines).
- 구현 규모(추정): A의 파일 + ADR 1. 약 6–7 파일.

## C 이름 보이는 트리거 — **계약 변경 필요(§3.2 "머리를 또 다른 전환기로 만들지 않는다", ADR-0042 레일 전환기)**

- 전환기 트리거: 사이드바 머리 전체가 버튼(32px 상자 안 `M` · **MARS** / 섹션 이름 12px · `⇅`), 오른쪽에 접기는 그대로. 홈에서는 `Layers` + `분석 플랫폼`.
- 레일 맨 위: 전환기 대신 `홈` 링크(다른 레일 버튼과 같은 32px muted 아이콘). 사이드바를 접으면 전환기가 레일 맨 위로 돌아오게 코드를 짰지만 브라우저로 확인하지 않았다(캡처 없음).
- 팝오버: 머리 아래로 열리는 A와 같은 1열 목록.
- 홈: 그룹 = 열(4열 한 줄, 분석 | 업무 운영 | 도구 | 플랫폼 관리). 행은 두 줄(20px 아이콘 · **이름** / 짧은 문구). 이어서는 이름 줄 오른쪽 끝에 `이어서 · 생산성 개요`로, 이름과 같은 기준선. 아래 목록은 같은 4열 격자(즐겨찾기 | 최근 방문 2칸 | 공지)라 위아래 열 끝이 맞는다.
- 차용: shadcn sidebar-07 팀 전환기(https://ui.shadcn.com/blocks/sidebar), Vercel 스코프 선택(https://vercel.com/docs/dashboard-features), GitHub 왼쪽 위 컨텍스트 스위처(https://github.blog/changelog/2023-11-03-multi-account-support-on-github-com/).
- 구현 규모(추정): `SystemSwitcher.tsx`, `AppRail.tsx`, `AppShell.tsx`, `AppSidebar.tsx`, `PlatformSidebar.tsx`, `OperationsHome.tsx`, 앱 `menus.ts`, 계약 `SpaceDef.icon` + 테스트 3–4 + 문서·ADR 2. 약 10 파일.

## 짧은 문구 표 (시안 전용 문구, 실제 원본은 앱 `menus.ts`의 `SpaceDef.subtitle`)

모든 시안에서 설명 문장(`description`)은 보이지 않는다. MARS와 CLAS가 둘 다 `생산성 분석`이던 부제를 구별되게 바꿨다.

| 시스템 | 지금 부제 | 지금 설명 | 제안 문구 | 시안 아이콘 |
| --- | --- | --- | --- | --- |
| MARS | 생산성 분석 | 설비·기간별 생산성과 사이클타임을 분석합니다. | 생산성·사이클타임 | 막대(지금 그대로) |
| BRAVO | 지표관리 | 지표 정의·버전·발행을 관리합니다. | 지표 관리 | 게이지(지금 그대로) |
| CLAS | 생산성 분석 | 설비별 동작시간과 동작 흐름을 분석합니다. | 동작시간 분석 | 선(지금 그대로) |
| 도구 | 설비 Top View | 설비 레이아웃을 Top View로 보고 로그를 재생합니다. | 설비 Top View | 지도(지금 그대로) |
| 표준 로그 개발 | (없음) | 설비 모델별 로그 개발 단계와 검증을 관리합니다. | 모델별 로그 검증 | 두루마리(지금 Inbox) |
| 개선 실행 | (없음) | 개선 과제의 현장 적용과 효과를 관리합니다. | 개선 과제 적용 | 렌치(지금 Inbox) |
| 운영 콘솔 | (없음) | (홈 카드는 열 수 있는 섹션 이름을 이어 붙임: VOC · Finding · Task 관리 · …) | VOC·Task·플랫폼 관리 | 목록(지금 그대로) |

## 참고

- mock 데이터에서 CLAS의 이어서 메뉴 이름이 `CLAS`라 `이어서 · CLAS`로 보인다(메뉴 이름이 시스템 이름과 같은 것은 mock 문구).
- 홈 페이지 머리 설명 문장(`접근 가능한 메뉴, …`)은 페이지 머리 규칙이라 손대지 않았다.
- 색과 글자 크기는 DESIGN.md 토큰만(`surface-card`, `border-subtle`, `row-hover`, `row-selected`, `text-*`, `text-xs/sm/base`), 새 의존성 없음.
