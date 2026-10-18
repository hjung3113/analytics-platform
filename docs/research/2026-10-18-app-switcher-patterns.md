# 앱(시스템) 전환기 · 시스템별 내비 패턴 조사 (#423 1단계)

확인일: 2026-10-18. 공식 문서·디자인 시스템 1차 출처만 사용했다. 인용문은 모두 해당 URL에서 실제로 확인한 원문이고, JS 렌더링이 필요한 페이지(help.salesforce.com, v1.lightningdesignsystem.com, help.sap.com)는 브라우저로 렌더링해 본문을 확인했다. 문서에서 다루지 않은 항목은 `확인 못 함`으로 적는다.

## 요약

- 레일 맨 위 전환기 + 그 아래 현재 시스템의 섹션이라는 15 §3.2 구성은 Atlassian(사이드바 맨 위 전환기)·Salesforce(런처=전체 앱, 내비 바=현재 앱 항목의 역할 분리)·GitLab(사이드바는 현재 영역, 전환은 상단 검색)과 같은 방향이다.
- 열리는 형태는 세 갈래가 공존한다: 팝오버(Slack·SAP 사용자 메뉴), 모달(Salesforce 전체 런처·Azure 메뉴), 목록형 드롭다운(Atlassian·AWS·Google). 우리의 520px 팝오버는 어느 쪽에도 어긋나지 않는 중간 형태다.
- 스위처 안에서 현재 앱을 체크로 표시한다는 직접 선례는 1차 문서에서 확인하지 못했다(10곳 전부 해당 없음 또는 미기술). 현재 위치는 대개 스위처 밖(사이드바 머리·셸 중앙 제목·breadcrumb)이 알려 준다.
- 키보드·포커스는 GitHub Primer ActionMenu가 가장 구체적이다: 열면 첫 항목 포커스, Esc로 닫기, Tab 이탈 시 닫힘, 닫으면 트리거로 복귀, 선택 항목 `aria-checked`. 우리 사양과 거의 같고, "열 때 현재 카드 포커스"만 관례(첫 항목)와 다른 우리 선택이다.
- 준비 중 시스템 비활성 행은 Primer의 inactive 모델(포커스 가능 + 이유 텍스트 필요)과 정합이다. disabled로 구현하면 Primer 기준에 어긋난다.
- 전역 검색 결과의 `시스템 › 섹션 › 메뉴` 경로 표기 직접 선례는 확인 못 함. 가장 가까운 것은 GitHub 커맨드 팔레트의 위치 스코프 표시와 AWS `/Resources` 접두 포커스 검색이다.

## 사례 표

| 제품 | 전환기 위치 | 열리는 형태 | 현재 시스템 표시 | 검색과의 관계 | 출처 (확인일 모두 2026-10-18) |
| --- | --- | --- | --- | --- | --- |
| Atlassian | 앱 왼쪽 위 앱 스위처 버튼 / 새 내비는 사이드바 맨 위 | 앱·사이트 목록, 왼쪽에 조직 목록 | 텍스트 문서 없음(확인 못 함) — 위치는 사이드바 머리 "brand or product" | "Search across all apps on your site" | [앱 스위처](https://support.atlassian.com/platform-experiences/docs/how-to-switch-between-apps-and-organizations), [Jira 새 내비](https://support.atlassian.com/navigation/docs/what-is-the-new-navigation-in-jira) |
| Microsoft 365 | 페이지 왼쪽 위 앱 런처 | 앱 아이콘 격자, `More apps`→`All apps` 확장 | 문서 없음(확인 못 함) | 런처 안 검색 존재(이미지 설명에서 간접) | [M365 앱 시작](https://support.microsoft.com/en-us/office/get-started-with-my-microsoft-365-apps-91a4ec74-67fe-4a84-a268-f6bdf3da1804), [관리자 고정](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/pin-apps-to-app-launcher?view=o365-worldwide) |
| Azure 포털 | 앱 스위처 없음 — 포털 메뉴가 서비스 간 이동 | 포털 메뉴: flyout/docked 전환 | 서비스 메뉴·working pane이 현재 리소스에 문맥 종속 | 머리글 global search(리소스·서비스·문서) | [포털 개요](https://learn.microsoft.com/en-us/azure/azure-portal/azure-portal-overview), [바로 가기](https://learn.microsoft.com/en-us/azure/azure-portal/azure-portal-keyboard-shortcuts), [즐겨찾기](https://learn.microsoft.com/en-us/azure/azure-portal/azure-portal-add-remove-sort-favorites) |
| Google Workspace | 앱 오른쪽 위 Google apps 메뉴 | 9칸 격자 메뉴 | 문서 없음(확인 못 함) | 문서 없음(확인 못 함) | [Open Google Workspace apps](https://support.google.com/a/users/answer/9333810?hl=en) |
| Salesforce | 내비게이션 바 왼쪽 App Launcher | 요약 보기(검색+7개)→`View All`로 전체 모달 | "navigation bar displays all the items contained in the app that you're currently using" — 런처 밖 내비 바가 담당 | 런처 안 `Search apps and items box`, 결과 없으면 전체 런처에서 하이라이트 | [App 전환](https://help.salesforce.com/s/articleView?id=xcloud.basics_app_launcher_lex.htm&language=en_US&type=5), [SLDS App Launcher](https://v1.lightningdesignsystem.com/components/app-launcher/) |
| SAP Fiori | 셸 바 오른쪽 끝 product switch(anatomy 11번) | 이 페이지에 팝오버 구조 미기술(확인 못 함) | 중앙 제목이 "Home 또는 현재 앱 제목", 브랜딩 요소가 product identifier 표시 | 셸 검색: "within the product or across multiple products", 기본 펼침 권고 | [셸 바](https://www.sap.com/design-system/fiori-design-web/v1-136/ui-elements/shell-bar/usage), [사용자 메뉴](https://www.sap.com/design-system/fiori-design-web/v1-136/ui-elements/user-menu/usage), [FLP 셸](https://help.sap.com/docs/btp/sap-fiori-launchpad-for-sap-btp/shell-and-shell-bar?locale=en-US&state=PRODUCTION&version=Cloud), [키보드](https://help.sap.com/docs/btp/sap-fiori-launchpad-for-sap-btp/keyboard-navigation-in-home-page?locale=en-US&state=PRODUCTION&version=Cloud), [최근 활동](https://help.sap.com/docs/btp/sap-fiori-launchpad-for-sap-btp/working-with-recent-activities-and-frequently-used-apps?locale=en-US&state=PRODUCTION&version=Cloud) |
| AWS 콘솔 | 상단 탐색 모음 Services 메뉴(검색창 옆) | Recently visited / Favorites / All services / 유형별 섹션 목록 | 문서 없음(단일 콘솔 개념) | 탐색 모음 unified search(서비스·기능·문서·Marketplace) | [Services 메뉴](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/service-menu.html), [즐겨찾기](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/add-fave.html), [검색](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/using-search.html) |
| Slack | 왼쪽 위 워크스페이스 아이콘 | 로그인한 워크스페이스 목록 | 문서 없음(확인 못 함) | 문서 없음(확인 못 함) | [워크스페이스 전환](https://slack.com/help/articles/1500002200741-Switch-between-workspaces) |
| GitHub | 우상단 프로필 메뉴 안 Switch account(서브메뉴) | 계정 목록 + `See all accounts` | 만료 세션 계정은 회색 표시 | ⌘K 커맨드 팔레트 — 현재 위치가 스코프로 표시 | [계정 전환](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/switching-between-accounts), [커맨드 팔레트](https://docs.github.com/en/get-started/accessibility/github-command-palette), [Primer ActionMenu](https://primer.style/product/components/action-menu/accessibility/) |
| GitLab | 전용 스위처 없음 — 상단 바 `Search or go to`로 영역 전환 | 검색 드롭다운(자주 방문 프로젝트·최근 항목) | "The left sidebar changes based on the information you're viewing" | `Search or go to`가 탐색·검색 겸용, 자동완성에 최근 본 항목 | [사이드바 튜토리얼](https://docs.gitlab.com/tutorials/left_sidebar/), [단축키](https://docs.gitlab.com/user/shortcuts/) |

보조: [The Component Gallery](https://component.gallery/components/)에는 app switcher·product switcher 전용 항목이 없다(2026-10-18 전체 목록에서 확인). 가장 가까운 등재 항목은 [Navigation](https://component.gallery/components/navigation)·[Dropdown menu](https://component.gallery/components/dropdown-menu)·[Popover](https://component.gallery/components/popover)다.

## 질문 1 — 전환기의 위치·모양·열리는 형태

**왼쪽 위 계열**: Atlassian은 "the app switcher, in the top left corner of most Atlassian apps"이고 새 내비에서는 사이드바 1번 자리가 "See your brand or product, and switch Atlassian apps"다. M365는 "selecting the app launcher … from the upper left-corner of the page". Slack은 "Click your workspace icon in the top left". Salesforce는 "on the left side of the navigation bar".

**오른쪽 위 계열**: Google apps 메뉴는 "in the top right". SAP는 product switch가 셸 바 anatomy 11번(마지막)으로 오른쪽 끝이며, "The user menu and product switch icons remain in place"(축소 시에도 유지). GitHub 계정 전환기는 우상단 프로필 메뉴 안 서브메뉴다.

**스위처가 없는 계열**: Azure는 전환기 대신 "Portal menu. Use this global element to navigate between services"이고, GitLab은 "To switch to other areas of the left sidebar, use **Search or go to** in the top bar"로 검색이 전환을 겸한다.

**열리는 형태**: (a) 목록 드롭다운 — Atlassian("a list of apps and sites that you have access to"), Slack, Google, AWS(섹션 있는 목록), Azure portal menu; (b) 모달 — Salesforce SLDS: "The App Launcher is a modal dialog which contains 2 sections", `role="dialog" aria-modal="true"` 마크업 예시까지 제시; (c) 팝오버 — SAP 사용자 메뉴: "The user menu popover consists of … Popover", "The user menu opens on full screen on Size S". 시각 사양(너비·열 수)을 숫자로 문서화한 1차 출처는 없었다(확인 못 함).

**버튼 모양**: Atlassian·Salesforce·M365 모두 아이콘임만 서술하고 모양·크기는 이미지로만 제공한다("The app launcher icon in Office 365" 같은 대체 텍스트 수준). 텍스트로 현재 시스템 이름을 버튼에 표시한다는 사례는 확인 못 함.

## 질문 2 — 현재 시스템 표시

스위처 버튼 자체에 현재 앱을 표시한다는 공식 문서는 없었다(Atlassian·M365·Salesforce·Slack 전부 확인 못 함). 대신 현재 위치는 스위처 밖 요소가 담당한다:

- Salesforce: "The App Launcher displays all your available Salesforce apps and items. In contrast, the navigation bar displays all the items contained in the app that you're currently using." — 런처와 내비 바의 역할 분리로 현재 앱이 무엇인지 알려 준다.
- SAP FLP: "In the middle of the shell bar, you'll see either Home (when you are on the entry page) or the title of the current app you are using." 현행 디자인 시스템 셸 바에서는 브랜딩 요소의 "Product identifier: Unique name that helps the user understand the specific context within the SAP portfolio."
- Azure: breadcrumb("Use the breadcrumb links to move back a level in your workflow")과 문맥 종속 service menu.
- GitLab: "The left sidebar changes based on the information you're viewing."
- GitHub 계정 스위처는 예외적으로 목록 안 상태 표시가 있다: "the managed user account will appear grayed out if your session has expired."

즉 업계 다수는 "버튼=전환, 머리/제목=현재 위치"를 분리한다. 우리 사양(버튼이 현재 시스템 아이콘을 드러냄 + 사이드바 머리 시스템 이름)은 두 역할을 모두 갖는 구성이며, 반대 사례는 없다.

## 질문 3 — 상위 전환기와 앱 내 2단 내비의 관계

- **Atlassian(가장 가까운 구조)**: 새 내비 사이드바 안에 1번 전환기(brand/product)와 2번 콘텐츠 내비("Access essentials like **For you**, **Recent**, **Starred**, and **Apps**"), 8번 유틸리티가 계층으로 공존한다. 도입 이유가 곧 이 구조의 정당화다: "Previously, each Atlassian app had its own layout and navigation pattern, which made switching between tools harder than it needed to be." / "a new navigation experience that aligns how you move through Jira, Confluence, Atlassian Home, and Focus."
- **Salesforce**: "Use the App Launcher to personalize what apps appear on the vertical navigation bar." — 전환기(전체 목록)와 앱 내 세로 내비(현재 앱 항목)의 2단 관계를 명시.
- **Azure**: 전역 shell("The portal menu and page header are global elements that always appear") 아래 서비스별 service menu("contextual to the service or resource that you're working with")가 중첩되는 2단 구조.
- **GitLab**: 사이드바는 현재 영역(프로젝트면 프로젝트 전용)을 보여 주고, 영역 전환은 상단 `Search or go to`가 담당한다. 16.1 안내: "Easily switch contexts, search, and view subsets of data with the new **Your Work** and **Explore** options." / "Scan more quickly because of fewer top-level menu items."
- **SAP**: 스위치는 "Offers access to other products"이고 제품 내부는 "Additional context area. Contains specific elements applicable to the entire product."

공통 원리: 전환 수준(시스템/앱)과 탐색 수준(섹션→메뉴)을 다른 컴포넌트가 담당하고, 전환 후 사이드바 전체가 대상 시스템 것으로 교체된다. 우리 사양(전환기→레일 섹션→사이드바 메뉴의 3단)은 Azure의 전역/서비스 분리 + Atlassian의 사이드바 계층과 같은 계열이다.

## 질문 4 — 키보드·포커스·접근 이름

1차 출처 중 컴포넌트 수준으로 문서화한 것은 GitHub Primer ActionMenu와 SAP FLP가 유일하다.

**Primer ActionMenu**(스위처용은 아니고 일반 메뉴 컴포넌트 — 라벨링함):
- 열림: "When an `ActionMenu` is opened, focus moves to the first item in the menu." 트리거는 `Enter`/`Space`/`ArrowDown` 등으로 연다.
- 닫기: "An open `ActionMenu` can be closed using `Esc`." / "If a keyboard user navigates away from an open `ActionMenu` using `Tab` / `Shift+Tab`, the `ActionMenu` is closed."
- 복귀: "When the `ActionMenu` is closed, focus returns to the most logical location in the page – in general, this is the trigger control that originally opened the `ActionMenu`."
- 활성: "The currently focused menu item can be activated using `Space` or `Enter`."
- 상태: "selectable items have an `aria-checked` attribute", 컴포넌트는 `role="menu"`.
- 라벨: "icons don't have any text alternative… Don't rely on these icons alone to convey meaning", "Menu items must have a clear and descriptive label."
- 비활성 vs 장애: "Inactive menu items must still be focusable… so they **should not** be marked as disabled using `aria-disabled`." / "Disabled menu items: Do not get focus, Cannot be activated." inactive 항목에는 "descriptive `inactiveText`"가 필요하다.
- 트리거 접근 이름에 관한 문구는 확인 못 함(항목 라벨 규정만 있음).

**SAP FLP**: "To navigate in the launchpad using the keyboard instead of the mouse, you use a combination of the Shift, F6, and Tab keys." F6 흐름에 "Last visited tile"이 포함되고 "Pressing Shift + F6 reverses this flow." Esc는 제목 편집 취소로 등장("Esc cancels the title change").

**전역 단축키**: Azure `G+/`(검색), `G+.`("Toggle focus between header and left sidebar"), `G+B`(All services), `G+number`(Favorites 항목). GitLab `s`/`/`(검색바), `Escape`("Hide tooltips or popovers"). GitHub ⌘K 팔레트, 닫기 `Esc`/`⌘K`. Slack 워크스페이스 사이드바 토글 `⌘/Ctrl+Shift+S`.

**포커스 트랩**: Salesforce SLDS 모달 문서(일반 모달 컴포넌트)가 트랩을 다루지만 이번에 원문을 직접 확인하지 못해 인용하지 않는다(확인 못 함). 팝오버형(Slack·SAP·Atlassian)에서 트랩 문서는 확인 못 함.

## 질문 5 — 전역 검색과의 관계

- **전환기와 독립인 전역 검색**: Atlassian "Search across all apps on your site". Azure "Global search. Use the search bar in the page header to quickly find a specific resource, a service, or documentation." AWS "a unified search tool for finding AWS services and features, service documentation, AWS Marketplace products, and more"(유형: Services, Features, Documents, …). SAP FLP: "Opens a global search user interface for finding apps and objects." — 전부 앱 경계를 넘는 대상을 찾는다.
- **스위처 안 검색**: Salesforce "To look for apps or items by name, use the Search apps and items box." 결과는 "Up to 7 apps or items … appear as you type. If there are more results, a View More link appears and when clicked, the full App Launcher opens with all the results highlighted." SLDS: "searchable within the modal via the search input in the modal header", 일치부 `<mark>` 하이라이트. AWS Services 메뉴도 메뉴 안에서 "access your recently visited services, view your Favorites list, and view all AWS services"를 한 자리에 제공한다(메뉴 내 필터).
- **위치가 스코프가 되는 검색**: GitHub "it shows your location at the top left and uses it as the scope for suggestions", `#`·`@`·`/`로 대상 종류를 좁힌다. GitLab `Search or go to`는 "autocomplete suggestions … Projects and groups … Recently viewed merge requests, Recently viewed work items".
- **경로 표기**: 검색 결과에 `시스템 › 섹션 › 메뉴` 형태의 계층 경로를 표시한다는 1차 문서는 확인 못 함. 부분 선례는 GitHub의 위치 스코프 표시와 AWS의 `/Resources` 접두 포커스 검색뿐이다.

## 질문 6 — 최근·이어서·즐겨찾기, 사용 불가·준비 중 표시

**최근/이어서**:
- Azure Home: "For quick and easy access to work in progress, the portal shows a list of your most recently visited resources."
- AWS: "Choose **Recently visited** to view services and applications you recently interacted with."
- SAP FLP Quick Access: "lists of your most used apps and the last functions you have used in the launchpad. Each list displays a maximum of 30 items." + "An app must be used at least twice to appear in the list." + Home/뒤로로 닫은 앱만 기록.
- GitLab: "Choose from the list of frequently visited projects", 자동완성에 "Recently viewed merge requests, Recently viewed work items".
- Atlassian: "**Recent**: Spaces, work items, boards, filters, and dashboards you've visited, edited, or created."
- GitHub 팔레트: "suggestions based on your current context and resources you've used recently."
- 스위처 카드 안에 "이어서: <메뉴>"처럼 다음 화면을 미리 보여 주는 사례는 1차 문서에서 확인 못 함.

**즐겨찾기**:
- AWS favorites quickbar: "located following the navigation bar and is visible in all AWS service consoles", 드래그로 순서 변경.
- Azure: 별표로 서비스를 Favorites에 추가, 드래그 재배치, "You're the only one who sees the changes you make to **Favorites**."
- Salesforce: 앱을 내비 바에 favorite로 고정, 타일 드래그로 자주 쓰는 순 정렬.
- GitLab: 메뉴 항목 pin → "Pinned" 섹션. 단 "The items you pin while you're viewing a project are different than the items you pin while viewing a group."
- M365는 반대로 관리자가 "pin up to three apps … for all the users" 하고 "Any app you add can later be unpinned by the user at any time."
- Google은 고정 자체가 없다: "You can't change the order of apps on the menu or remove apps from the menu."

**사용 불가·준비 중**:
- 권한 필터가 기본이다: Salesforce "Users see only the apps that they are authorized to see according to their profile or permission sets.", Atlassian은 다른 조직 앱을 "hidden from view so they don't clutter the switcher".
- 목록에는 보이되 쓸 수 없음을 표시하는 사례: GitHub 만료 계정 "appear grayed out"(선택하면 재인증으로 안내).
- "준비 중/coming soon" 행의 1차 사례는 확인 못 함. 구현 지침으로 가장 가까운 것은 Primer의 inactive 모델이다(위 질문 4).

## 질문 7 — 15 §3.2 항목별 권고

| §3.2 항목 | 맞는 사례 | 다른 사례 | 권고 |
| --- | --- | --- | --- |
| 전환기 버튼(레일 맨 위, 현재 시스템 아이콘+펼침 표시, 접근 이름 `업무 시스템 전환 · 현재: <시스템>`) | Atlassian 앱 스위처 top-left, M365 upper-left, Slack 좌상단 아이콘 — 왼쪽 위 전환기가 주류 | SAP product switch는 오른쪽 끝; Azure·GitLab은 전환기 없음(메뉴/검색이 겸함) | **그대로.** 접근 이름 공식은 1차 선례가 없어 우리 규정이 더 구체적이다. Primer의 "아이콘만으로 의미 전달 금지"가 이름 규정을 지지한다. |
| 전환기 팝오버(약 520px 2열, 제목, 플랫폼 홈 머리, 카드 체크+`현재`, `이어서: <메뉴>`, `준비 중` 비활성 행) | Salesforce 런처(모달+섹션+안 검색), Atlassian 목록+조직 필터, AWS 섹션형 Services 메뉴 | 현재 카드 체크 표시와 `이어서` 문구는 1차 선례 없음(확인 못 함); Salesforce는 팝오버가 아니라 모달 | **그대로 두되 시안에서 검증.** 최근 정보는 Azure Home·GitLab 제안처럼 별도 화면/검색 제안이 주류다. 카드에 최근 메뉴를 얹는 것은 우리 확장이므로, 컨펌 시 방해되지 않는지 확인한다. |
| 레일 구조(전환기→구분선→현재 시스템 섹션→공통 도구→구분선→도움말·언어·사용자, 공통 도구 고정) | Azure 전역 shell vs 문맥 service menu의 분리, Atlassian 사이드바 1/2/8번 계층, GitLab 영역별 사이드바 | AWS는 상단 바 한 줄에 검색+Services를 나란히 둠 | **그대로.** "시스템을 바꿔도 공통 도구가 움직이지 않는다"는 Azure의 "global elements that always appear … form the shell"과 같은 원리다. |
| 사이드바 머리(시스템 이름+섹션 이름, 또 다른 전환기로 만들지 않음) | Salesforce "런처=전체, 내비 바=현재 앱 항목" 역할 분리 — 전환과 현재 위치를 한 컴포넌트에 섞지 않는다 | 반례 없음. Atlassian도 사이드바 머리는 전환기 1개뿐 | **그대로.** 머리 이중 전환기 사례는 10곳에서 발견하지 못했다. |
| FeedbackOps 바닥 블록(스크롤 밖 고정, `FeedbackOps · <시스템>`, 권한 있는 항목만) | AWS favorites quickbar — "visible in all AWS service consoles"(모든 화면에 고정되는 보조 띠 선례), GitLab Pinned 섹션(항목 고정, 컨텍스트별 분리) | 다른 시스템 진입 블록을 사이드바 바닥에 두는 1차 사례는 확인 못 함 | **그대로.** 선례 부족 자체를 문서에 남긴다. 고정 띠의 존재 자체는 AWS quickbar가 정당화한다. |
| 복귀 줄(`← <출발 메뉴>로 돌아가기`, `<시스템>에서 왔습니다`) | 가장 가까운 것: Azure breadcrumb("move back a level in your workflow") | 명시적 cross-app 복귀 링크의 1차 사례는 확인 못 함 | **그대로(선례 없음을 명시).** 패턴이 희소하므로 URL·Scope 복원이 규칙(06 §6.4·§22)대로 되는지 구현 PR에서 검증한다. |
| 홈(카드 런처, FeedbackOps 카드 같은 권한·순서, 최근·즐겨찾기 유지) | Salesforce 타일 런처, Azure Home 최근 리소스, Atlassian For you/Recent/Starred | Google은 순서 변경·삭제 불가("You can't change the order…") | **그대로.** 카드 런처+최근+즐겨찾기 조합은 업계 기본형이다. |
| 검색(⌘K 전역 메뉴 검색, 결과에 `시스템 › 섹션 › 메뉴`) | Atlassian "Search across all apps on your site", Azure·AWS·SAP 전역 검색 — 앱 경계를 넘는 검색이 주류 | GitHub·GitLab은 현재 위치가 스코프(전역 아님) | **그대로.** 단 경로 표기의 직접 선례는 확인 못 함 — GitHub 위치 스코프 표시가 부분 선례다. 결과 행에 시스템명을 어디에 넣을지는 시안에서 정한다. |
| (참고) 전환기 키보드 규정(열면 현재 카드 포커스, focus trap, Esc→전환 버튼 복귀, Enter/Space 선택, 선택과 포커스 구별) | Primer: Esc 닫기·트리거 복귀·Enter/Space·`aria-checked`·Tab 이탈 닫힘이 우리 규정과 사실상 동일 | "열면 첫 항목 포커스"가 Primer 관례 — 우리는 "현재 카드"로 포커스 | **그대로 두되 관례와의 차이를 기록.** 현재 카드 포커스는 1차 선례가 없는 우리 선택이므로 시안 컨펌에서 키보드 사용자 반응을 확인한다. 준비 중 행은 disabled가 아니라 Primer inactive(포커스 가능+이유 문구 `아직 사용할 수 없습니다`)로 구현한다. |

## 확인 못 함 정리

- 스위처(팝오버·모달) 열림 시의 포커스 트랩·초기 포커스를 제품 문서 차원에서 기술한 1차 출처: 없음(컴포넌트 문서인 Primer만 있음).
- 스위처 안 현재 앱 체크 표시: 10곳 전부 미기술 또는 없음.
- 검색 결과의 계층 경로 표기(`시스템 › 섹션 › 메뉴`): 직접 선례 없음.
- cross-app 복귀 링크(복귀 줄): 1차 사례 없음.
- 팝오버 크기·열 수 등 시각 수치: 어느 출처도 숫자로 미기술.
- AWS 콘솔 서비스 메뉴의 키보드 접근 문서: 해당 GSG 트리에서 찾지 못함.
- Atlassian 앱 스위처의 키보드·접근성 문서: 없음(사이드바 재정렬 방향키·`Ctrl+[`만 확인).

## 출처

위 표와 본문의 URL 전부. 확인일은 2026-10-18로 동일하다. JS 렌더링 페이지(help.salesforce.com, v1.lightningdesignsystem.com, help.sap.com)는 브라우저 렌더링으로, 나머지는 정적 본문으로 확인했다.
