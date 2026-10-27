# ADR-0081 — FeedbackOps 운영 화면은 플랫폼 틀(사이드바 `목록 범위`, 한 줄 머리)로 업무 시스템 `FeedbackOps` 하나에 옮긴다

- Status: Decided (2026-10-24) — 사용자. 화면 사양은 소유 문서에 있다.
- Amended (2026-10-24, #759): 결정 4의 방법: `SpaceDef.carriedPageKeys` + `resolveLink`, 06 §6.4 예외; 사이드바 선택기는 `PlatformSlots.scopeControl`.
- Decider: 사용자 — 실제 앱 위 시안 A(플랫폼 틀)·B(FeedbackOps 틀)를 본 뒤 "플랫폼 틀에 맞추되 개선사항을 뽑는 쪽으로"(2026-10-24, [#595](https://github.com/hjung3113/analytics-platform/issues/595)). 개선사항은 Opus xhigh UX 리뷰(UX-1–UX-15, 보고서는 저장소 밖 `.review/595-ux-review.md`)에서 뽑았고, 구현 전 필수 항목(선택기 의미 UX-1, URL 범위 UX-2, 관리자 화면에서 끔 UX-3, 이름 충돌 UX-4, VOC 사이드바 중복 UX-5, 원본에 없는 버튼 UX-6)은 시안에 반영했다. 아래 UX 번호는 그 보고서의 항목이다. 최종 화면은 owner 확인 시안(owner 비공개 링크 https://claude.ai/artifact/HKPUoygVuZEpUWoVn5oRvU)이다. 시안 코드(브랜치 `hjung3113/proto-595-fo-system`)는 버린다.
- Scope: #595, 지도 [#598](https://github.com/hjung3113/analytics-platform/issues/598), [ADR-0066](0066-feedbackops-merges-into-platform.md) 결정 3, [합류 설계](../integration/feedbackops-merge-design.md) §3.2–3.3.
- 부분 대체: [ADR-0042](0042-system-switcher-and-system-owned-rail.md)(FeedbackOps 섹션 목록), [ADR-0045](0045-feedbackops-entry-link-mapping-and-scope.md)(바닥 블록의 새 탭·전체 진입 링크), [ADR-0070](0070-global-features-platform-menu-and-voc-drawer.md) 결정 4(사용자 메뉴 `FeedbackOps 전체`). 나머지는 그대로다.

## 맥락

합류 단계 4는 관리자·개발자용 FeedbackOps 화면(수신함·Triage·VOC Cluster, Finding, Task Request·Task·Milestone, 연동, 설문 관리, 관리자)을 업무 시스템 하나로 옮긴다. 화면 내용은 다시 쓰지 않는다(합류 설계 §2 원칙 2). 바뀌는 것은 셸 안의 틀이다: 레일 섹션, 사이드바 메뉴, Managed System 범위 선택기 자리, 화면 머리, 다른 시스템에서의 진입과 복귀, 신고자에게 보이는 것.

시안 두 안을 실제 앱 위에서 비교했다. A는 범위 선택기를 플랫폼 사이드바의 Scope 자리에 두고 머리를 한 줄로 합친다. B는 선택기를 화면 제목 줄에 두고 FeedbackOps 자체 제목 줄을 플랫폼 머리 아래에 남긴다. B는 06 §7의 Scope 선택기를 하나 더 만들고, 머리가 두 줄이 된다.

## 결정

1. **업무 시스템 이름은 `FeedbackOps`, 부제는 `피드백 운영`이다.** MARS·BRAVO·CLAS와 같은 패턴이다(합류 설계 §7 O7을 닫는다). 권한은 `feedbackops:access`다(ADR-0045). 안에서 무엇을 볼 수 있는지는 FeedbackOps가 판정한다.
2. **레일 섹션은 FeedbackOps 레일 그대로 7개다**: `대시보드`(FeedbackOps 홈 = 액션 큐) · `VOC` · `Findings` · `Tasks` · `연동` · `Surveys` · `관리자`. 첫 칸은 플랫폼 `홈`과, `Surveys`는 플랫폼 메뉴 `설문`과 이름이 겹치지 않게 한다. 시스템 아이콘은 집 모양이 아니다.
3. **사이드바 메뉴는 FeedbackOps `NAV_TREE` 그대로이되**:
   - 신고자 항목(`내 VOC`, `VOC 등록`, `설문 참여`)은 뺀다. 레일 `VOC 등록`과 플랫폼 메뉴가 맡는다.
   - `연동` 섹션의 `Findings` 중복은 뺀다. Triage 보기·보기 항목은 원본 `parentId`대로 하위 항목이다.
   - 이름: 관리자 `권한 요청 검토`, `FeedbackOps 설정`, 연동 `연동 액션 대시보드`.
   - `관리자`는 원본 다섯 메뉴를 그대로 둔다. 승인을 콘솔로 옮기는 일은 ADR-0068 결정 2의 스키마 뒤에 따로 한다(합류 설계 §3.3).
4. **범위 선택기는 플랫폼 사이드바 Scope 자리에 하나, 라벨 `목록 범위`다.**
   - 의미는 FeedbackOps 원본 그대로다: 모든 사용자에게 `전체`(= 내 담당 시스템의 합집합), 범위 밖 시스템은 흐리게 `범위 밖` 표시, 관리자는 워크스페이스 전체.
   - 값의 원천은 URL `managedSystem` 키 하나다. 저장소에 남기지 않는다(06 §6.4). 키가 없으면 `전체`다. 06 §6.2의 분석 `scopeId`와는 별개 키다.
   - `관리자` 섹션 화면에서는 끄고 원본 안내를 단다.
   - 레일 섹션·사이드바 메뉴로 옮겨도 고른 범위가 유지된다(시안은 섹션 이동에서 범위를 잃었다 — 구현에서 고친다).
5. **화면 머리는 플랫폼 페이지 머리 한 줄이다.** `FeedbackOps › <메뉴>`, 즐겨찾기 ☆, 원본 화면에 있는 동작 버튼만 오른쪽에 둔다. 원본 화면의 제목 줄은 그리지 않는다. 원본에 없는 버튼을 새로 만들지 않는다.
6. **진입은 전환기 카드다.** 사용자 메뉴의 `FeedbackOps 전체` 링크는 없앤다(ADR-0070 결정 4의 "#595까지"). 구현됨(2026-10-28, #764 p2): 앱의 `feedbackOps` 슬롯이 `overall: null`을 돌려준다(SDK 타입·`overall` 대상은 그대로).
7. **다른 시스템의 바닥 블록은 셸 안 이동이다.** 항목 `VOC` · `Task` · `설문`, 설명 줄 `FeedbackOps로 이동합니다`(외부 링크 표시 없음). 링크는 `managedSystem`과 복귀 정보만 싣는다(출발 화면의 기간을 싣지 않는다, ADR-0045). 도착 화면 본문 맨 위에 복귀 줄(15 §3.2)이 있다. 전환기로 바로 들어오면 복귀 줄이 없다.
8. **신고자(`feedbackops:access` 없음)에게는 전환기 카드도 바닥 블록도 없다.** 신고자의 일은 레일 `VOC 등록`과 플랫폼 메뉴(`내 VOC`·`설문`)가 맡는다.

여기서 정하지 않는 것(구현 이슈에서 정하고 기록): 저장된 보기의 아이콘과 저장 경로(UX-7), 건수 배지의 범위 연동(UX-8), 복귀 줄이 사라지는 규칙(UX-10 — #760에서 정함, 위 Amended), 접힌 사이드바의 하위 항목 표시(UX-12), FeedbackOps 안에서 연 VOC 등록의 기본 등록 대상(UX-14).
- Amended (2026-10-25, #760): 결정 7의 복귀 줄이 사라지는 규칙(UX-10)을 정했다 — `returnTo`는 FeedbackOps 공간의 `carriedPageKeys`(FO 안 이동에서 유지, 같은 공간 링크는 이어받기만 하고 만들지 않는다, 다른 시스템·전환기 선택·돌아가기·저장된 보기 적용에서 사라진다)이고, 마지막 화면·최근 방문 복원은 `returnTo`를 저장하지 않으며, 복귀 줄은 `PlatformPage`가 `ReturnOrigin.accepted`일 때 그린다. `Task`·`설문`은 #763·#764 전까지 새 탭이다. 슬롯 `feedbackOps.permission`이 블록 게이트(결정 8). 15 §3.2·§6.1, 06 §8·§22.
- Amended (2026-10-25, #761 node k): 정적 하위 항목(예: Triage 보기 항목)은 `MenuMeta.navViews`, 저장된 보기는 `PlatformSlots.spaceNavSection` 구역, 건수 배지(UX-8)는 `PlatformSlots.navCounts`, 접힌 사이드바에 하위 항목과 구역이 없는 것(UX-12)은 셸 규칙, VOC 등록 기본 대상(UX-14)은 `VocComposeContext.carried`를 읽는다. 06 §5·§8.

- Amended (2026-10-28, #764 p1): `Surveys` 그룹(`foSurveys`, 패키지 `@ap/menu-fo-surveys`)이 들어왔다 — `Survey 관리`(`/feedbackops/surveys`, 사이드바 개수 배지 `surveys.all`)와 사이드바에 행이 없는 `Survey 빌더`·`Survey 결과`·`Survey 후속 조치`(`/feedbackops/surveys/:surveyId/builder|results|follow-up`, `parent: fo-surveys`). 목록의 선택은 `focus`(FeedbackOps `selected`, `/surveys/<id>`도 같다)이고 페이지가 Survey 상세를 `FoBridge` 안 `FoDetailDrawer`로 셸 상세 슬롯에 그리며, 후속 조치의 응답 선택은 `focus`(화면이 제어, 자동 선택 없음)다. 하위 화면은 목록 맥락(`area`·`status`·`follow_up`·`managedSystem`)을 싣고 목록으로 돌아오고, 화면 안 FeedbackOps 링크(목록 ↔ 빌더·결과·후속 조치)에는 어댑터(`surveyCarry`)가 현재 `area`·`status`·`follow_up`을 목적지가 이름 붙이지 않았을 때만 싣고 목록으로 가는 링크에 `focus`=이 Survey를 더한다(`returnTo`·`platformReturn`은 싣지 않는다). `Survey 관리`가 자기 툴바 제목을 그리지 않는다(결정 5). 바닥 블록의 `설문`은 `Survey 관리`를 셸 안에서 연다 — 신고자 `설문`·`설문 응답`의 `/surveys`·`/surveys/:id/respond`는 그대로이고 별칭을 걸지 않는다. 빌더의 미저장 초안은 메뉴를 옮기면 사라진다(`.planning/backlog.md`). 사용자 승인: 새 메뉴 여섯(lead 2026-10-27). 15 §3.2·§6.1·§8, 합류 설계 §3.2.

## Considered Options

- **(B) FeedbackOps 틀 유지**: 원본 화면 머리를 그대로 쓰므로 옮기는 일이 적다. 대신 06 §7의 Scope 선택기가 둘이 되고, 머리가 두 줄이 되어 목록이 한 줄 내려가며, 시스템마다 선택기 자리가 달라진다.
- **(A) 플랫폼 틀, 채택**: 시스템을 오가도 같은 자리에서 같은 것을 찾는다. 대신 원본 화면의 제목 줄과 선택기를 셸 자리로 올리는 이음매가 필요하다.
- **사이드바 섹션 재편(더 적은 섹션)**: 합류 설계 §1이 화면 재설계를 범위 밖에 두었다.

## 결과

- ADR-0042·0045·0070 해당 항목에 `부분 대체: ADR-0081`을 적는다. 합류 설계 §3.2 표와 §7 O7, 15 §3.2(바닥 블록·`FeedbackOps 홈`·사용자 메뉴 문장)·§6.1, 06 §8·§9.1(사용자 메뉴 `FeedbackOps 전체`, `feedbackOps` 슬롯, 새 탭 진입)을 이 결정에 맞춘다. 지금 동작을 적은 문장은 구현 PR에서 바꾸고, 그때까지는 "구현 안 함" 안내만 단다.
- 구현은 #595의 하위 이슈다. dev:real에서 확인할 것: 다리로 올린 원본 머리와 플랫폼 머리가 겹치지 않는지, URL 범위 동기화와 범위 밖 처리, 배지, 상세 선택 키, 전환기 Enter 뒤 제목 포커스, Tasks 열과 상세 패널을 함께 열 때.
- Amended (2026-10-26, #763 p1): `Tasks` 그룹(`foTasks`, 패키지 `@ap/menu-fo-tasks`)에 `Tasks`(보드, `/feedbackops/tasks`)·`내 Task`(`/feedbackops/my-tasks`)와 사이드바에 숨은 `Task 목록`(`/feedbackops/tasks/list`, `Tasks` 아래)을 넣었다. 선택은 `focus`이고 상세는 `FoBridge` 안의 `FoDetailDrawer`(셸 상세 슬롯)다. 바닥 블록의 `Task`는 `Task 목록`을 `managedSystem`과 함께 셸 안에서 열고, `설문`은 #764 p1부터 셸 안이다. Task 저장된 보기는 하지 않는다(`.planning/backlog.md`). 06 §8, 15 §3.2·§6.1.
- Amended (2026-10-26, #763 p2): `Tasks` 그룹이 끝났다 — `Task Requests`(`/feedbackops/task-requests`)와 `Milestones`(`/feedbackops/milestones`)가 들어와 사이드바 순서는 `Task Requests`·`Tasks`·`내 Task`·`Milestones`(숨은 `Task 목록`)이다. 두 화면의 선택도 `focus`이고, 화면이 `renderDetail`로 준 부품을 `FoDetailDrawer`가 제자리에서 그리며(`Milestone 생성`도 같다) 닫기는 화면의 `requestClose`를 거친다. Task Request·Milestone 링크는 `operatorHostLinks`로 살아 있다. FeedbackOps가 비유한 토스트 시간(`Infinity`)을 주면 다리가 그 값을 빼고 Kernel 기본값(동작이 있으면 8초)을 쓴다. Findings는 #762 전까지 연결하지 않는다(결정 10). 06 §8, 15 §3.2.
- Amended (2026-10-26, #762 p1): `Findings` 그룹이 들어왔다 — `전체 Finding`(`/feedbackops/findings`, 사이드바 개수 배지 `findings.all`). 선택은 `focus`(FeedbackOps `selected`)이고, 페이지가 Finding 상세를 `FoBridge` 안 `FoDetailDrawer`로 셸 상세 슬롯에 직접 그린다(화면에는 `renderDetail`로 늘 `undefined`를 넘기고 아무것도 자동 선택하지 않는다). Task·Milestone·Cluster·VOC·Evidence의 Finding 링크는 `operatorHostLinks`로 살아 있고, `returnTo`를 단 링크는 연결하지 않는다(결정 10). `연동` 그룹은 #762 p2다. 06 §8, 15 §3.2.
- Amended (2026-10-26, #762 p2): `연동` 그룹이 들어와 #762가 끝났다 — `연동 액션 대시보드`(`/feedbackops/integration`)·`Evidence`(`/feedbackops/evidence`)·`엔티티 링크`(`/feedbackops/entity-links`)·`커버리지`(`/feedbackops/coverage`)이고 `Findings` 행은 없다(결정 3). 대시보드의 복구 항목과 Evidence의 선택은 `focus`(FeedbackOps `selected`)이고, 두 화면이 `renderDetail`로 준 부품을 `FoDetailDrawer`가 제자리에서 그리며 닫기는 화면의 `requestClose`를 거친다. 네 표(`integrationDashboardRoute`·`evidenceRoute`·`coverageRoute`·`entityLinksRoute`)는 `operatorHostLinks`로 살아 있어 홈 커버리지 카드·점프 카드·복구 항목의 출처 링크가 이 메뉴로 연결된다. `/admin/*`·`/admin/settings#coverage` 같은 관리자 이동은 #764 전까지 연결하지 않는다(결정 10). 엔티티 링크의 검색·행 선택 컨트롤, 대시보드의 Managed System 개요 표·점프 카드, 커버리지의 자체 필터는 원본 그대로 옮겼다(결정 5, 백로그 D8·D15). 06 §8, 15 §3.2.
- Amended (2026-10-28, #764 p2): `관리자` 그룹(`foAdmin`, 패키지 `@ap/menu-fo-admin`)이 들어와 #764가 끝났다 — `Managed System`·`Analytics Area`·`권한 요청 검토`·`부여 목록`·`FeedbackOps 설정`(`/feedbackops/managed-systems|analytics-areas|permission-requests|permission-grants|settings`). 메뉴 권한은 `console:access`(`workspace-admin` 규칙)라 `feedbackops:access`만 가진 사용자에게는 보이지 않는다(화면의 `PermissionGate`는 표시 힌트, 백엔드가 판정). `목록 범위`는 `ScopeControl`이 그룹 id `foAdmin`에서 끄고 화면은 이어받은 `managedSystem`을 무시한다(Analytics Area의 자체 필터는 페이지 키 `system`). 선택은 `focus`이고 권한 요청·부여 화면은 자동 선택하지 않으며 상세는 `FoDetailDrawer`다. 다섯 표(`adminOperatorTargets`)는 `operatorHostLinks`로 살아 있어 Coverage의 `설정`(`/admin/settings#coverage` = `section=coverage`)·권한 요청 알림과 복구 출처 링크가 이 메뉴로 연결된다. 화면이 자기 제목 줄을 그리는 다섯 관리자 화면과 `Survey 관리`는 `hostOwnsTitle`이면 줄을 그리지 않는다. 결정 6이 구현됐다: 사용자 메뉴 `FeedbackOps 전체` 링크는 없다. 권한 요청 승인에서 콘솔로 가는 이동은 ADR-0068 결정 2에 따라 하지 않는다. 06 §8, 15 §3.2·§6.1.
