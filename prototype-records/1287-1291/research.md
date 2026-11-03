# 시안 ①②③ 참고 조사 (#1287–#1291)

조사 방법: 아래 제품·디자인 시스템의 공개 문서·화면 구조를 시안 설계의 근거로 삼았다. 각 항목의 URL은 공개 문서 위치이며, 이 시안 작업에서 페이지를 다시 열어 확인하지는 않았다(사전 지식 기반 정리 — 사실 확인이 필요하면 링크를 연다).

## ① 역할별 메뉴 배치

| 참고 | 관찰 | 시안에 쓴 것 |
| --- | --- | --- |
| Jira Service Management — 고객 포털과 에이전트 화면 분리 (https://support.atlassian.com/jira-service-management-cloud/docs/what-is-the-help-center/) | 요청자(고객)는 포털에서 요청·조회만, 에이전트는 별도 큐 화면에서 처리. 같은 요청을 두 화면이 다른 투영으로 보여 준다 | 직속 VOC(공개 부분) ↔ 업무 흐름 VOC 처리함(내부 부분) 분리, 상세에 「업무 흐름에서 처리」 링크 |
| GitHub — 저장소 탭(Issues·Pull requests·Projects)과 Settings 분리 (https://docs.github.com/en/repositories) | 매일 쓰는 작업 탭과 관리(Settings·권한)를 다른 자리에 둔다. 권한이 없으면 Settings 탭이 보이지 않는다 | 업무 흐름(작업) ↔ 운영 콘솔(권한·시스템·감사) 분리, 권한 없으면 카드 숨김 |
| Linear — 사이드바 Inbox·My issues(개인) / Teams(작업) / Settings(관리) 3단 (https://linear.app/docs/conceptual-model) | 개인 항목이 맨 위, 팀 작업 공간, 관리가 따로 | 직속(공지·VOC·설문) + 내 활동 / 업무 흐름 / 운영 콘솔 |
| Atlassian Design System — Side navigation 그룹과 섹션 제목 (https://atlassian.design/components/side-navigation) | 그룹 제목은 명사형 짧게, 한 그룹 5개 안팎 | 그룹 이름 짧게(「VOC 처리」「설정」), 그룹당 2–4 메뉴 |
| Zendesk — Views(큐)·Triage 용어 현지화 (https://support.zendesk.com/hc/en-us/articles/4408888828570) | 한국어 UI에서 큐·분류를 우리말로 쓴다 | 수신함→VOC 처리함, Triage→분류, Clusters→반복 VOC, Evidence→근거 |

## ② 직속 VOC·공지

| 참고 | 관찰 | 시안에 쓴 것 |
| --- | --- | --- |
| Canny·Productboard Portal — 공개 피드백 게시판 (https://help.canny.io/en/articles/1287098-boards) | 카드형 목록, 상태 배지, 최근 답변 미리보기 | 안 C(카드 피드) |
| GitHub Issues 목록 (https://docs.github.com/en/issues/tracking-your-work-with-issues/filtering-and-searching-issues-and-pull-requests) | 표형 한 줄 목록 + 「Author: 나」 같은 빠른 필터 | 안 A(표 + `전체 / 내가 등록한`) |
| Outlook·Gmail 읽기 창 (https://support.microsoft.com/en-us/office/use-and-configure-the-reading-pane-to-preview-messages-2fd687ed-7fc4-4ae3-8eab-9f9b8c6d53f0) | 목록과 본문을 한 화면에 | 안 B(목록 + 읽기 창), 공지 안 B |
| Atlassian Confluence 공지·Statuspage 사고 이력 (https://support.atlassian.com/statuspage/docs/what-is-statuspage/) | 진행 중/지난 항목을 나눠 지난 것은 접거나 흐리게 | 공지 안 A(지난 공지 토글), 안 B(「종료됨」 묶음) |
| GOV.UK Design System — Step by step / Task list (https://design-system.service.gov.uk/components/task-list/) | 진행 단계 표시로 「지금 어디까지」를 먼저 보여 줌 | VOC 상세 안 B(단계 줄) |

## ③ 기능 화면 틀

| 참고 | 관찰 | 시안에 쓴 것 |
| --- | --- | --- |
| Linear 이슈 목록·보드 (https://linear.app/docs/board-layout) | 목록·보드가 본문 가장자리까지 채움, 헤더 아래 바로 툴바 | 안 A·C(여백 없음) |
| GitHub Primer — Page layout `padding` 옵션 (https://primer.style/components/page-layout) | 페이지 틀이 여백 없음/보통/넓음을 옵션으로 둔다 | B1 `bodyInset` 선택 옵션 근거 |
| Atlassian Jira 보드 (https://support.atlassian.com/jira-software-cloud/docs/what-is-a-board/) | 열 폭이 화면 폭에 맞게 줄고, 넘치면 그때 가로 스크롤 | 안 C 보드 열 폭 맞춤 |
| Material 3 Chips 가이드 (https://m3.material.io/components/chips/guidelines) | 필터 칩은 적게, 나머지는 메뉴로 | 안 C 빠른 필터 3개 + 「더보기」 |
| shadcn/ui Card (https://ui.shadcn.com/docs/components/card) | 얇은 테두리 카드로 영역을 묶음 | 안 B(얇은 여백 + 카드) |
