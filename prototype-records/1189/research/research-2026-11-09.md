# UI 리서치 — #1189 홈·시스템 전환기, #1190 차트 카탈로그 탭 넘침

작성 2026-11-01. 코드 기준 진단. 실제 앱 캡처는 찍지 않았음(코드·토큰만 읽음). 시각 판정은 시안 캡처 뒤 다시 할 것.

## Summary

**Q1 진단 상위 (홈·전환기가 "안 예쁜" 이유)**
1. 전환기 트리거 아이콘이 레일 바로 아래 첫 섹션 아이콘과 같다 — `spaceIcon()`=홈 메뉴 그룹 아이콘(`SystemSwitcher.tsx:48,57`), 레일 섹션도 같은 그룹(`systemSections.ts:14`). 같은 아이콘이 위아래로 두 번 보인다.
2. 트리거는 레일에서 유일하게 채운 파란 칩 + 아이콘 안쪽 모서리에 10px 화살표가 겹침(`SystemSwitcher.tsx:81-82`). 배지처럼 보이고, hover에서 파랑이 회색으로 바뀌어 반응이 거꾸로다.
3. 전환기 팝오버는 카드 안에 카드가 들어간 구조(테두리 있는 2열 카드 `:10,139-146`), 카드마다 3줄(이름·부제·`시작:`/`이어서:`)이고, 현재 항목 표시가 셋이다(파란 테두리+배경+✓현재 `:146,153`). 주 기능(시스템 고르기) 위에 플랫폼 메뉴 줄이 먼저 온다(`:117-135`).
4. 홈 카드도 같은 문제: 내비 카드에 채운 `icon-blue-soft` 칩(`OperationsHome.tsx:72`)은 DESIGN.md L154·L310(내비 아이콘은 칩 없는 outline)과 어긋난다. 같은 회색 12px 줄이 3개 쌓여(부제·설명·이어서 `:74-76`) 위계가 평평하고, 설명 문장이 길다(`apps/platform-web/src/menus.ts:84-90`).
5. 그룹 제목이 18px `t-section-title`(`:96`)로 14px 카드 제목보다 크다. 그룹 4개에 카드가 1–3개씩이라 3열 격자가 들쭉날쭉하고, 그룹 간격과 섹션 간격이 둘 다 `space-y-4`로 같다. 페이지 전체가 테두리 카드 가득(card soup, DESIGN L235).

**Q1 시안 방향** (상세 §Q1.4)
- **A 조용한 목록** — Notion·Slack·shadcn sidebar-07 팀 전환기. 홈: 작은 그룹 라벨 + 칩·테두리 없는 한 줄 행(아이콘·이름·부제 / 오른쪽 `이어서`). 전환기: 트리거 = 중립 모노그램(M·B·C) + 화살표 한 개, 팝오버 = 1열 메뉴 목록, 현재는 ✓만, 플랫폼 메뉴는 아래로. 약 3 파일 + 테스트·문서 3.
- **B 런처 격자** — Google·M365 와플, PatternFly 앱 런처. 홈·전환기 둘 다 아이콘+이름만 있는 같은 격자. 그룹 분류를 전환기도 쓰게 되면 ADR-0102 재검토가 필요하다. 약 4–5 파일.
- **C 이름 보이는 트리거** — Vercel·GitHub 컨텍스트 스위처. 사이드바 머리에 `MARS ⌄`. §3.2 "머리를 또 다른 전환기로 만들지 않는다"와 충돌하므로 계약 변경 = 사용자 결정. 약 5+ 파일.
- **추천: A.** "패턴 유지 + 미니멀 + 짧게"에 가장 가깝고 계약(아이콘 또는 짧은 문자 트리거, 2열→1열만 개정)을 거의 바꾸지 않는다.

**Q2 (#1190)**: 탭 10개, 탭마다 이름 + `지원 N/8` 꼬리표. 추정 폭 약 1,250px인데 본문은 약 1,116px(1440−레일 52−사이드바 240−좌우 32). 꼬리표만 약 500px를 차지하고, 스크롤 컨테이너가 이중이다(`ChartCatalog.tsx:85` + `PlatformTabs.tsx:14`). 이 폭 수치는 계산값이며 실측하지 않았다.
- **A 화살표+가장자리 흐림** — Carbon·MUI. 이미 있는 `useHorizontalOverflow`와 `ListTabs` 방식을 `PlatformTabs`로 옮긴다. 2–3 파일.
- **B 넘치는 탭은 `더보기 ⌄` 메뉴로** — Primer UnderlineNav·PatternFly·Ant. 선택한 탭은 늘 보이게 하고, 트리거에 선택된 탭 이름을 보인다. 3–4 파일.
- **C 카탈로그는 세로 탭** — Carbon·PatternFly vertical. `orientation` 지원. 메뉴 레이아웃까지 바뀐다. 3 파일.
- **추천: B를 SDK에 넣고, 메뉴 쪽에서 `지원 N/8` 꼬리표를 뺀다**(동작·지원 패널과 aria-label에 같은 정보가 있음, fold 범위). 꼬리표만 빼도 1440px에서는 들어갈 가능성이 높지만, 상세 패널을 열면 다시 넘친다.

## Q1. 홈 화면 + 왼쪽 위 시스템 전환기

### Q1.1 현재 구조 (코드 기준)

- 홈 `platform/home/src/pages/OperationsHome.tsx`
  - `launcherGroups`가 있으면 그룹마다 `t-section-title` 제목과 1/2/3열 container 격자를 그린다(`:95-99`).
  - 카드(`:71-77`): `rounded-lg border p-3`, 36px 파란 칩 안에 20px 아이콘, 이름 `t-card-title`, 부제 `text-xs muted`, 설명 `text-xs muted`, `이어서:` `text-xs secondary`.
  - 그 아래 `내 할 일`, 즐겨찾기·최근 패널 두 개(각각 부제 문장), 공지(파란 배경 줄)가 이어진다.
- 그룹 설정 `apps/platform-web/src/menus.ts`의 `HOME_LAUNCHER_GROUPS`(ADR-0102): 분석(MARS·BRAVO·CLAS) / 업무 운영(표준 로그 개발·개선 실행) / 도구 / 플랫폼 관리(운영 콘솔).
- 전환기 `packages/sdk/shell/src/frame/SystemSwitcher.tsx`
  - 트리거: 40px 타깃 안에 32px `bg-accent-primary-soft` 칩, 16px 시스템 아이콘, 오른쪽 아래 10px ChevronDown.
  - 팝오버(520px, `padding="none"`):
    - 제목 줄(`border-b`)
    - 플랫폼 메뉴(점으로 구분한 글자 링크, `border-b`)
    - `업무 시스템` 라벨
    - 2열 카드(테두리, 3줄)
    - `준비 중` 카드
- 계약 `docs/design/multi-workspace-ui.md` §3.2 전환기 줄: "현재 시스템 아이콘(또는 짧은 문자) + 작은 펼침 표시", 2열 카드, 검색 없음, 포커스 규칙. 짧은 문자 트리거는 이미 계약 안에 있다.

### Q1.2 외부 패턴

| 제품·시스템 | 트리거 | 내용 | 홈/런처 시사점 | 출처 |
| --- | --- | --- | --- | --- |
| shadcn/ui sidebar-07 팀 전환기 | 32px 로고 정사각(`size-8 rounded-lg`) + 이름(truncate) + `ChevronsUpDown`(ml-auto) | 드롭다운 1열. 라벨 `text-xs muted`, 행 = 24px 테두리 로고 + 이름 + `⌘n` 단축키, 마지막에 추가 | 설명 없이 이름만. 현재는 트리거로 보여 준다 | https://ui.shadcn.com/blocks/sidebar , https://ui.shadcn.com/r/styles/new-york-v4/sidebar-07.json |
| Notion 워크스페이스 전환기 | 왼쪽 위 워크스페이스 이름 클릭 | 드롭다운 목록, ✓ 현재. `Ctrl+Shift+#`로 n번째로 이동 | 이름만, 설명 없음 | https://www.notion.com/help/intro-to-workspaces |
| Slack 워크스페이스 전환기 | 왼쪽 세로 아이콘 줄 | 아이콘 아래 번호. `Ctrl+[n]`, `Ctrl+Tab`, `Ctrl+Shift+S`로 펼침 | 레일형 전환기에 숫자 단축키 | https://slack.com/help/articles/201374536 |
| GitHub 대시보드 컨텍스트 스위처 | 왼쪽 위 사용자명 ⌄ | 조직 목록 드롭다운 | 이름 보이는 트리거 | https://github.blog/changelog/2023-11-03-multi-account-support-on-github-com/ (계정 전환), 대시보드 스위처는 공식 문서 미확인 |
| Vercel 스코프 선택 | 이름 옆 위아래 화살표 | 팀·프로젝트 전환, 즐겨찾기 | 이름 + 화살표, 즐겨찾기 | https://vercel.com/docs/dashboard-features , https://vercel.com/changelog/favorite-teams-and-projects-to-appear-in-your-dashboard |
| PatternFly Context selector | 드롭다운 토글 | 검색(긴 목록일 때만), 목록, 고정 footer. 앱 전체 범위면 마스트헤드나 내비 맨 위 | 약 8개 이하 정적 목록이면 검색 불필요 | https://www.patternfly.org/components/menus/context-selector/design-guidelines |
| PatternFly Application launcher | 아이콘 트리거 | 링크 목록(아이콘 선택), 즐겨찾기 섹션, 긴 목록이면 검색, 외부 링크 아이콘 | 런처 = 아이콘+이름 목록 | https://www.patternfly.org/components/menus/application-launcher/design-guidelines |
| Carbon UI shell Switcher | 헤더 맨 오른쪽 아이콘(위치가 바뀌지 않게) | 최근/자주/전체 앱 링크 | 관리 가능한 수면 전부 보인다 | https://carbondesignsystem.com/components/UI-shell-header/usage/ |
| Atlassian navigation | 왼쪽 앞에 앱 전환기, 그 옆 AppHome(로고 아이콘 + 이름, 좁으면 이름 숨김) | — | 아이콘 + 이름, 좁으면 아이콘만 | https://atlassian.design/components/atlassian-navigation/examples |
| Microsoft 365 앱 런처(와플) | 와플 아이콘 | 아이콘+이름 격자, 고정(pin)한 앱을 위에, `모든 앱` | 설명 없는 아이콘 격자 | https://learn.microsoft.com/en-us/microsoft-365/admin/manage/pin-apps-to-app-launcher |
| Google Workspace 앱 런처 | 와플 | 아이콘+이름 격자, 사용자가 순서 변경 | 같은 패턴 | https://workspaceupdates.googleblog.com/2017/07/changing-default-order-of-apps-in.html |
| Linear | 사이드바 위 워크스페이스 이름. 탐색은 ⌘K 중심 | — | 검색이 숙련자 경로(이 레포 §3.2와 같은 역할 분담) | https://linear.app/enablement/guide/navigating-linear (전환기 상세는 공식 문서 미확인) |

공통 결론:
- (a) 사용자가 이미 아는 시스템 목록은 **이름 중심, 설명 없음**이 표준이다. 설명은 툴팁이나 첫 사용 때만 쓴다.
- (b) 현재 항목 표시는 하나(✓ 또는 선택 배경)만 둔다.
- (c) 목록이 8개 안팎이면 검색 없이 1열 메뉴로 충분하다(PatternFly).
- (d) 트리거는 로고나 짧은 문자 + 화살표 한 개(`ChevronsUpDown`)이고, 화살표는 아이콘과 겹치지 않고 나란히 둔다.
- (e) 키보드: 메뉴 방향키 이동, 숫자 단축키는 선택 사항(Slack·Notion·shadcn).

### Q1.3 진단 — 무엇이 "안 예쁜가" (file:line, 최소 수정 방향)

전환기 `packages/sdk/shell/src/frame/SystemSwitcher.tsx`

1. **`:48,57` 트리거 아이콘 = 첫 레일 섹션 아이콘.** `spaceIcon(homeMenuId)`는 홈 메뉴 그룹의 아이콘이고, 레일 섹션(`systemSections.ts:14`)도 그 그룹을 그린다. 그래서 레일 맨 위에 같은 아이콘이 두 번 보인다. → 계약이 허용하는 "짧은 문자" 모노그램(`MARS`→`M`, `표준 로그 개발`→`표`)이나 `SpaceDef`의 전용 아이콘을 쓴다. 모노그램이 가장 작은 수정이다.
2. **`:81` 채운 `bg-accent-primary-soft` 칩.** 레일의 다른 버튼은 모두 칩 없는 muted 아이콘이라(`AppRail.tsx:39,49`) 트리거만 튄다. hover 클래스가 칩 배경을 `row-hover`(회색)로 덮어 파랑에서 회색으로 바뀐다. → 중립 표면(`surface-card` + `border-border-subtle`)이나 칩 없는 모양으로 바꾸고, hover는 `row-hover`, 열림 상태는 `surface-row-selected`로 한다.
3. **`:82` `ChevronDown size-2.5 absolute bottom-0.5 right-0.5`.** 32px 칩 안 모서리의 10px 화살표가 알림 배지처럼 보인다. → 화살표를 빼고 툴팁과 `aria-haspopup`에 맡기거나, 모노그램 오른쪽에 `ChevronsUpDown size-3`을 나란히 둔다(32px 안 `gap-0.5`).
4. **`:114-116` 제목 줄.** 내용이 제목 하나인 줄에 `border-b`가 있어 팝오버 위에 빈 칸막이가 생긴다. → 제목은 `sr-only`(aria-labelledby는 유지)로 하거나 라벨 크기(`text-caption muted`)로 줄인다.
5. **`:117-135` 플랫폼 메뉴가 시스템 목록 위에 온다.** 라벨 `플랫폼 메뉴 · 모든 시스템에서 공통`과 점으로 구분한 링크가 꼬리말처럼 읽히는데, 주 작업(시스템 고르기)보다 앞에 있다. → 순서를 시스템 목록 → 구분선 → 플랫폼 메뉴로 바꾸고, 부제 `· 모든 시스템에서 공통`은 지운다. 계약 §3.2 "위쪽에" 문구 개정 필요.
6. **`:10,139-146` 팝오버 안 테두리 카드 2열.** 떠 있는 표면 안에 테두리 카드가 7개 있어 테두리가 이중이다. → 1열 메뉴 행(`rounded-md px-2 py-1.5 hover:bg-surface-row-hover`, 테두리 없음). 2열 결정 개정 필요.
7. **`:151` `시작: <메뉴>` 줄이 모든 카드에 있다.** 정보량은 작은데 높이는 1.5배다. → `이어서:`만 남긴다(resumed일 때). 오른쪽 muted 한 줄이나 툴팁도 가능.
8. **`:146,153` 현재 표시가 셋**(파란 테두리, 파란 배경, ✓현재 글자). → ✓ 아이콘 하나와 `aria-current`만 둔다. `현재` 글자는 sr-only.
9. **`:150` 부제 줄.** MARS와 CLAS의 부제가 둘 다 `생산성 분석`(`menus.ts:84,86`)이라 구별에 도움이 안 된다. → 1열 행에서 이름 옆에 muted 인라인으로 두면 "MARS 생산성 분석"처럼 한 줄이 된다. 문구는 앱 소유이니 앱에 제안만 한다.

홈 `platform/home/src/pages/OperationsHome.tsx`

10. **`:72` 내비 카드에 채운 칩**(`size-9 rounded-md bg-icon-blue-soft`). DESIGN.md L154 "navigation 그룹에는 채운 chip을 만들지 않음", L310 "navigation 그룹 icon은 unboxed outline"과 맞지 않는다. 모든 카드가 같은 파란 칩이라 구별 정보도 없다. → `size-5 text-text-muted` outline 아이콘만 둔다(칩 없음).
11. **`:73-76` 12px 회색 줄 3개**(부제·설명·이어서)로 위계가 평평하고 카드 높이가 제각각이다(`items-start min-h-16` + `break-keep` 줄바꿈). → 이름 + 부제를 한 줄(`t-card-title` + 인라인 muted)로, `이어서`를 둘째 줄로 하고 설명은 지운다(사용자 요구 "간략하게"). 설명은 `title` 툴팁으로 남길 수 있다.
12. **`:75` 운영 콘솔 설명 = 섹션 이름 join.** 권한에 따라 길어져 그 카드만 높아진다. → 11과 같이 설명 줄을 지우면 함께 해결된다. 남겨야 하면 `truncate`.
13. **`:96` 그룹 제목 18px `t-section-title`**이 14px 카드 제목보다 무겁다. 그룹이 넷이라 제목 무게가 화면을 지배한다. → 그룹 라벨을 `text-caption font-semibold text-text-muted`(DESIGN "section label") 정도로 낮춘다. ADR-0102·§3.1의 `t-section-title` 문구 개정 필요.
14. **`:95,98` 그룹마다 3열 격자.** 1개(도구·운영 콘솔)나 2개 그룹은 오른쪽이 비어 들쭉날쭉하다. → 그룹 라벨을 격자 칸 위에 두는 열 방식(그룹 = 열, 4열 한 줄)이나, 한 패널 안의 연속 목록으로 바꾼다.
15. **`:71,108` 모든 카드에 테두리, hover는 `border-accent-primary`.** 아래 패널·공지도 모두 테두리라 card soup(DESIGN L235)이다. → 시스템 영역을 패널 하나로 묶고 안쪽 행은 테두리 없이 `hover:bg-surface-row-hover`로 한다.
16. **`:83,95` 간격이 모두 `space-y-4`.** 그룹 간격과 섹션 간격이 같아 가까움으로 묶이지 않는다. → 그룹 사이 `space-y-3`, 큰 섹션 사이 `space-y-6`.
17. **`:122,132` 패널 부제가 긴 문장**("지금 조회 조건을 유지하고 그 화면의 기본 보기로 이동합니다."). → 지우거나 툴팁으로 옮긴다.
18. **`:146` 공지가 파란 배경 줄.** DESIGN L310 "장식 full-row tint로 모든 항목을 강조하지 않는다". `공지 목록` 링크도 제목 없이 위에 떠 있다(`:144`). → 즐겨찾기·최근과 같은 `Panel` 행 목록으로 바꾸고, 링크는 패널 머리 오른쪽에 둔다.

### Q1.4 시안 방향 (홈 + 전환기 함께)

**A. 조용한 목록 (Quiet directory)** — 추천
- 차용: shadcn sidebar-07 팀 전환기(1열, 이름 중심, 단축키), Notion·Slack(✓ 현재, 숫자 단축키), PatternFly context selector(8개 안팎이면 검색 없음), DESIGN.md(내비 아이콘 outline, section label).
- 홈:
  - 그룹 라벨을 caption 크기로 낮춘다.
  - 시스템은 패널 하나 안의 테두리 없는 행이다(아이콘 outline · **이름** · muted 부제 / 오른쪽 `이어서: 메뉴`).
  - 설명은 지운다(툴팁).
  - 1440px에서 그룹을 열로 두는 2–4열.
  - 패널 부제를 지우고, 공지는 Panel 행으로 바꾼다.
- 전환기:
  - 트리거 = 중립 32px 모노그램 + 나란한 `ChevronsUpDown`.
  - 팝오버 약 320px 1열: 행 = 아이콘 · 이름 · muted 부제 · (오른쪽) ✓.
  - 아래 구분선 + 플랫폼 메뉴 링크 줄.
  - `시작:` 줄과 제목 칸막이를 지운다.
- 바뀌는 계약: §3.2 "2열 카드" → "1열 목록", "플랫폼 메뉴 위쪽" → "아래쪽". §3.1/ADR-0102 그룹 제목 `t-section-title` → section label. 트리거 짧은 문자는 이미 허용됨.
- 편집 규모:
  - 코드 3: `SystemSwitcher.tsx`, `OperationsHome.tsx`, `kernel/src/i18n.tsx`(문구 정리).
  - 테스트 3: `SystemSwitcher.test.tsx`·`.entry.test.tsx`, `OperationsHome.test.tsx` + e2e `contract-shell.spec.ts` 셀렉터 점검.
  - 문서 2: `multi-workspace-ui.md` §3.1·§3.2, ADR-0102 개정 또는 새 ADR.

**B. 런처 격자 (App grid)**
- 차용: Google Workspace·M365 와플(아이콘+이름 격자, 설명 없음), PatternFly application launcher(그룹 섹션), Atlassian AppHome(아이콘 + 이름).
- 홈:
  - 그룹마다 아이콘 위 / 이름 아래의 정사각 타일 격자(약 96–112px, 테두리 없음, hover row-hover).
  - `이어서`는 타일 아래 한 줄 caption.
  - 시스템이 늘어도 한눈에 보인다.
- 전환기: 같은 타일 격자의 축소판(3열, 그룹 라벨 포함). 홈과 전환기가 같은 모양이라 학습 비용이 낮다.
- 주의:
  - 전환기가 그룹 분류를 쓰면 ADR-0102 "다른 표시 표면이 같은 분류를 필요로 하면 배치와 공통 소유권을 다시 검토"에 걸린다. 분류를 SDK 슬롯으로 올리는 공개 계약 변경 = 사용자 승인.
  - 분류 없이 평면 격자로 두면 변경이 없다.
  - 큰 아이콘 타일은 아이콘 구별력에 기댄다. 현재 아이콘이 그룹 아이콘이라 겹칠 수 있어 시스템별 아이콘이나 모노그램이 필요하다.
- 편집 규모: A + `launcher-groups` 공유 시 `contracts`/`kernel` 슬롯 1–2, ADR 새로 하나. 약 5–7 파일.

**C. 이름 보이는 트리거 (Named context switcher)**
- 차용: Vercel 스코프 선택(이름 + 화살표), GitHub 왼쪽 위 컨텍스트 스위처, Notion·Linear 사이드바 머리 이름.
- 사이드바 머리(50px) 시스템 이름을 `MARS ⌄` 버튼으로 만들어 1열 목록 팝오버를 연다. 레일 맨 위는 플랫폼 홈 로고나 모노그램만 남긴다.
- 홈은 A와 같다.
- 충돌:
  - §3.2 "머리를 또 다른 전환기로 만들지 않는다"와 ADR-0042 레일 전환기 결정을 뒤집는다 = 계약 변경, 사용자 결정 필요.
  - 사이드바를 접으면 이름이 사라져 레일 쪽 대체가 필요하다.
- 편집 규모: `SidebarHeader` 계열 + `AppRail.tsx` + `SystemSwitcher.tsx` + 홈 + 문서·ADR. 약 6+ 파일.

### Q1.5 셸의 다른 "적은 노력, 큰 효과" 후보 (후보만)

1. **레일 버튼 상태 통일** `AppRail.tsx`
   - `:39` 섹션 버튼과 `:49` 검색 버튼에 `focus-visible:ring` 클래스가 없다(VOC `:62`에는 있음).
   - `:71` 도움말 버튼만 hover가 `bg-surface-sunken`이고 Tooltip 대신 `title`을 쓴다.
   - 한 상수(`RAIL_BTN`)로 묶으면 일관성이 바로 보인다. 1 파일.
2. **홈 공지 tint 제거**(`OperationsHome.tsx:146`, 진단 18). Panel 행으로 바꾸면 홈 아래쪽 소음이 줄어든다. 1 파일.
3. **레일 구분선 두 개**(`AppRail.tsx:30,69`, `w-6 border-t`). 전환기를 중립 트리거로 바꾸면 위 구분선을 없애고 간격으로 대신할 수 있다. 1 파일.

## Q2. 차트 카탈로그 탭 넘침 (#1190)

### Q2.1 현재

- `menus/mars/analytics/src/endpoints.ts:326` `CHART_KINDS` 10개.
- 라벨(`support.ts:4-9`): 선 · 막대 · 히트맵 · 도넛 · 산점도 · 상자그림 · 파레토 · TopN 막대 · Lane 시간선 · 분해 막대.
- `ChartCatalog.tsx:90`: 탭마다 라벨 뒤 `ml-2 text-tiny` `지원 N/8` 꼬리표(약 45–50px).
- 폭 추정(계산, 실측 아님):
  - 라벨 합 약 460px + 탭 좌우 padding 24px×10 + 꼬리표 약 50px×10 ≈ 1,200–1,260px.
  - 본문 ≈ 1440 − 52(레일) − 240(사이드바) − 32 = 약 1,116px, 여기서 `집중` 버튼 약 56px를 빼야 한다.
  - 꼬리표를 빼면 약 700px로 들어간다. 상세 패널(440px)을 열면 약 676px라 다시 아슬아슬하다.
- 스크롤 컨테이너가 이중이다: `ChartCatalog.tsx:85` `div overflow-x-auto`와 `PlatformTabs.tsx:14` TabsList `overflow-x-auto`. 화살표·흐림 표시 없이 기본 스크롤바만 보인다.
- 같은 패키지에 이미 넘침 처리가 있다: `packages/sdk/ui/src/toolbar/ListTabs.tsx`(좌우 화살표 버튼, 16px mask 흐림, 선택 탭 자동 노출, reduced-motion)와 공용 훅 `packages/sdk/ui/src/internal/useHorizontalOverflow.ts`.
- `PlatformTabs` 소비자: `ChartCatalog`, `EquipmentDetail`, `DetailDrawer`, feature-screens(`CoverageScreen`, `ConversationTimeline`). 범용으로 넣으면 이들도 같은 동작을 받는다.

### Q2.2 외부 패턴

| 패턴 | 동작 | 출처 |
| --- | --- | --- |
| Carbon Tabs | 넘치면 가로 스크롤 + 좌우 화살표. 줄바꿈·쌓기 금지. 세로 탭은 쌓고 긴 라벨은 2줄 뒤 말줄임 + 툴팁. 자동/수동 활성화 | https://carbondesignsystem.com/components/tabs/usage/ |
| MUI scrollable tabs | `variant="scrollable"` + `scrollButtons="auto"`(넘칠 때만 버튼) | https://mui.com/material-ui/react-tabs/ |
| Ant Design Tabs | 스크롤 + 넘친 탭은 `…` 드롭다운(`more` prop, popupRender로 검색 가능) | https://ant.design/components/tabs |
| Primer UnderlineNav | 좁으면 아이콘부터 숨기고, 넘친 항목은 `More` 디스클로저 메뉴. 가로 스크롤 불필요. 토글은 `aria-expanded` 버튼, 현재 항목 `aria-current` | https://primer.style/components/underline-nav , https://primer.style/components/underline-nav/accessibility |
| PatternFly Tabs | 기본 가로 스크롤 / overflow 탭(`More`, 늘 마지막, 고르면 그 이름으로 바뀜, 숨은 수 표시 가능) / 세로 탭 | https://www.patternfly.org/components/tabs/design-guidelines |
| WAI-ARIA APG Tabs | tablist·tab·tabpanel, 좌우 화살표 순환, Home/End, 세로면 `aria-orientation="vertical"` + 위아래 키 | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ |

### Q2.3 시안 (모두 `PlatformTabs`의 범용 동작, 메뉴는 선언만)

**A. 화살표 + 가장자리 흐림 (scroll affordance)**
- 차용: Carbon, MUI `scrollButtons="auto"`, 기존 `ListTabs`.
- `TabsList`가 자기 viewport를 갖고 `useHorizontalOverflow`로 넘침을 감지한다. 넘칠 때만 좌우 24px 화살표와 16px mask 흐림을 보이고, 선택 탭은 자동으로 보이는 범위에 스크롤한다. 기본 스크롤바는 숨긴다. 단 DESIGN L230 머리 규칙처럼 "시각 스크롤바를 감추지 않는다" 선례가 있어 확인이 필요하다.
- 접근성:
  - 화살표 버튼은 포인터 보조이고 탭 키 이동은 Radix 방향키가 담당한다. 버튼은 `tabIndex={-1}` + `aria-hidden`(키보드 사용자는 방향키로 이동하면 자동 노출), 또는 `aria-label="이전 탭 보기"`로 Tab 순서에 넣는다. `ListTabs`는 후자에 가깝다.
  - reduced-motion이면 즉시 스크롤.
- 장점: 계약이 그대로이고 기존 구현을 재사용한다. 단점: 숨은 탭이 몇 개인지, 무엇인지 안 보인다.
- 편집: `PlatformTabs.tsx`, `ChartCatalog.tsx:85`(바깥 overflow 제거), `tabs.test.tsx`. 화살표 마크업을 `ListTabs`와 공유하는 내부 컴포넌트로 빼면 +1. 약 3–4 파일.

**B. 넘친 탭은 `더보기` 메뉴 (priority+ overflow)** — 추천
- 차용: Primer UnderlineNav `More`, PatternFly overflow tab, Ant `more`.
- `TabsList`가 트리거 폭을 재서, 들어가는 만큼만 탭으로 보이고 나머지는 마지막 `더보기 (n) ⌄` 버튼의 DropdownMenu 항목으로 보낸다.
  - 선택한 탭이 숨은 쪽이면 트리거 문구가 그 탭 이름이 되고 선택 막대가 트리거에 붙는다(PatternFly).
  - 또는 선택 탭을 보이는 목록 끝으로 바꿔 넣는다(Primer식).
  - 메뉴 항목은 `menuitemradio` + `aria-checked`, 고르면 `onValueChange`.
- 접근성:
  - tablist 안 tab 순서는 보이는 탭만이고 방향키는 보이는 탭 사이를 돈다.
  - `더보기`는 tablist 밖(바로 뒤)의 `aria-haspopup="menu"` + `aria-expanded` 버튼이라 Tab으로 닿는다.
  - 숨은 tab의 `aria-controls` 패널 관계는 메뉴로 선택한 뒤 보이는 트리거로 옮긴다.
  - 측정은 숨은 probe 복제(DESIGN L239 compact 상태줄의 "hidden probe" 선례)로 하고, 경계에서 진동하지 않게 여유(hysteresis)를 둔다(ADR-0035 선례).
- 장점: 스크롤 없음, 숨은 개수가 보임, 상세 패널을 열어 좁아져도 안정적. 단점: 측정 로직이 늘고, 선택 탭 이동 정책을 정해야 한다.
- 편집: `PlatformTabs.tsx`(+ 내부 `useTabOverflow` 훅), `ChartCatalog.tsx:85`, `tabs.test.tsx`, `components.md`나 DESIGN.md 탭 줄에 넘침 규칙 한 줄. 약 4 파일. 보이는 모양이 바뀌므로 프로토타입 컨펌 대상.

**C. 카탈로그형은 세로 탭 (vertical tablist)**
- 차용: Carbon vertical tabs, PatternFly vertical tabs, 카탈로그·설정 화면의 왼쪽 목록.
- `TabsList`에 `orientation="vertical"` 스타일(왼쪽 2px 선택 막대, 기준선 오른쪽 1px)을 더한다. 10개 이상 카탈로그는 왼쪽 약 160px 열로, 꼬리표 `지원 N/8`도 줄 오른쪽에 자연스럽게 들어간다.
- 접근성: Radix가 `aria-orientation="vertical"` + 위아래 키를 처리한다(APG).
- 장점: 넘침 자체가 사라지고 개수가 늘어도 확장된다. 단점: 차트 폭을 약 160px 잃는다(분석 화면 차트 우선 원칙과 긴장, `동작·지원` 오른쪽 레일과 합치면 양쪽이 좁아짐). 메뉴 레이아웃 변경이라 메뉴 수정 범위가 커진다.
- 편집: `PlatformTabs.tsx`(vertical variant), `ChartCatalog.tsx`(레이아웃), `tabs.test.tsx`, DESIGN 탭 줄. 약 4 파일.

**메뉴 쪽 함께 (fold 범위, 30줄 이하):** `ChartCatalog.tsx:90`의 보이는 `지원 N/8` 꼬리표를 지운다. 같은 정보가 `aria-label`(`:89`)과 `동작·지원` 패널에 이미 있다. 남겨야 하면 `N/8`처럼 숫자만 쓴다. 이것만으로도 1440px 기본 상태는 들어갈 가능성이 높다(계산값). 다만 상세 패널이 열린 폭에서는 SDK 동작이 여전히 필요하다.

## 출처 목록

- https://ui.shadcn.com/blocks/sidebar
- https://ui.shadcn.com/r/styles/new-york-v4/sidebar-07.json
- https://www.notion.com/help/intro-to-workspaces
- https://slack.com/help/articles/201374536
- https://github.blog/changelog/2023-11-03-multi-account-support-on-github-com/
- https://vercel.com/docs/dashboard-features
- https://vercel.com/changelog/favorite-teams-and-projects-to-appear-in-your-dashboard
- https://www.patternfly.org/components/menus/context-selector/design-guidelines
- https://www.patternfly.org/components/menus/application-launcher/design-guidelines
- https://carbondesignsystem.com/components/UI-shell-header/usage/
- https://atlassian.design/components/atlassian-navigation/examples
- https://learn.microsoft.com/en-us/microsoft-365/admin/manage/pin-apps-to-app-launcher
- https://workspaceupdates.googleblog.com/2017/07/changing-default-order-of-apps-in.html
- https://linear.app/enablement/guide/navigating-linear
- https://carbondesignsystem.com/components/tabs/usage/
- https://mui.com/material-ui/react-tabs/
- https://ant.design/components/tabs
- https://primer.style/components/underline-nav
- https://primer.style/components/underline-nav/accessibility
- https://www.patternfly.org/components/tabs/design-guidelines
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/

미확인:
- GitHub 대시보드 컨텍스트 스위처와 Linear 전환기 상세는 공식 문서로 확인하지 못했다(위 표에 표시).
- Atlassian 새 navigation-system 페이지는 내용을 받지 못해, 지원 중단된 atlassian-navigation 예시를 인용했다.
