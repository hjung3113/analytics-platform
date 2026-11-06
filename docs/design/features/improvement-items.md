# 개선 아이템 플랫폼 기능 (#1328)

> **Status: 소유자 답 반영(2026-11-04) — §6 Q1–Q8을 추천대로 결정, 노드 a(스키마·읽기)·b(쓰기·이력·감사·`improvement.manage`)·c(Quest 읽기 포트·mock·HTTP 어댑터·적합성)·d(소유자 A안 목록·상세·만들기 서랍) 구현됨, e의 담당 지정 알림(e1)·홈 담당 건수 카드(e2)와 f의 효과 확인(전후 비교 연결·판단/링크 저장) 구현됨, e의 분석 진입점과 f의 편집형 표(#540) 남음.** 단 Q3의 「담당자가 User인 경우 본인 건 상태 변경 예외」는 지금 두지 않는다(팀장 결정, 되돌릴 수 있음; 실제 User 담당자 사례가 생기면 다시 연다). 근거: [ADR-0106 개정 2](../../adr/0106-improvement-task-is-quest.md)(개선 아이템은 플랫폼 DB, Quest는 BRAVO 소유, ID로만 가리킴). 지금 레포에는 노드 a·b의 DB·읽기·쓰기 API([api/improvement-items.md](../../architecture/platform-api/api/improvement-items.md))와 노드 c의 Quest 읽기 포트(어댑터 `getQuest`·`searchQuests`, 서버 모듈 없음)가 있고, `platform/improvement-items`의 직속 목록·상세·만들기 서랍이 있다. 노드 d의 호스트 빌드·엔드포인트 스냅샷 생성·E2E·데스크톱 시각 검증은 별도 게이트다. 용어는 [GLOSSARY](../../../GLOSSARY.md)의 `과제(Quest)`·`개선 아이템`·`효과 확인`. 화면 선택은 아래 §4와 [ADR-0106 개정 3](../../adr/0106-improvement-task-is-quest.md)을 따른다.

## 1. 도메인

개선 아이템 = 분석으로 추론한 문제 하나와 그 조치 한 줄. 표시 번호 `IM-<n>`(워크스페이스별 원자 카운터, ADR-0109 결정 6 방식).

| 필드 | 내용 |
| --- | --- |
| `problem` | 추론한 문제(필수, 길이 상한) |
| `action` | 조치(상태가 조치 이상이면 필수) |
| `action_date` | 조치일. 날짜만 담는다(wall-clock, 시간대 변환 없음). 효과 확인의 기준일 |
| `status` | 아래 상태 흐름 |
| `assignee_id` | 플랫폼 사용자(없을 수 있음) |
| `targets` | 대상 설비·공정 여러 개: 종류(설비·공정) + 외부 키 + 표시 이름 스냅샷. 플랫폼에 설비 마스터가 없으므로 외부 키 문자열만 저장 |
| `quest_id` | BRAVO Quest의 ID 문자열(없을 수 있음, §2·Q2) + 표시 제목 스냅샷 |
| `origin` | 만든 분석 화면: 메뉴 id + 분석 Context(지표·기간·설비) 스냅샷. 교차 메뉴 링크 계약(`cross-menu-links.md`)대로 목적지 id와 Context를 분리해 저장하고, 상세에서 「분석 화면 열기」로 되돌아간다 |
| `effect_check` | 효과 확인 결과(`effective`·`ineffective`·`inconclusive`) + 판단 메모 + 확인에 쓴 전후 비교 링크(#1243) |

**상태 흐름:** `open`(문제 기록) → `in_progress`(조치 중) → `done`(조치 완료, `action_date` 필수) → `verified`(효과 확인됨, `effect_check` 필수). 어느 단계에서든 `dropped`(취소, 사유 필수). `done`·`verified`·`dropped`에서 이전 단계로의 되돌림은 `reopen` 한 동작으로만 하고 이력에 남긴다.

**합법 상태 쌍(원본, DB 트리거 `improvement_item_guard`와 API가 같은 표를 쓴다):** 앞으로 가는 이동 `open→in_progress`·`in_progress→done`·`done→verified`와 `open|in_progress|done|verified→dropped`는 `itemSetStatus`만 받는다. 되돌림 `done→in_progress`·`verified→done`·`dropped→open`은 `itemReopen`(사유 필수)만 받고, `itemSetStatus`에 보내면 `status:illegal_transition`이다. 되돌려도 `effect_*`·`drop_reason` 열은 그대로 두고 이력은 `item_event`에 남는다. 그 밖의 쌍과 같은 상태로의 이동은 모두 거절한다. 상태 이름은 화면에서 한국어(`문제 기록`·`조치 중`·`조치 완료`·`효과 확인됨`·`취소`).

**이력.** 필드 변경은 추가 전용 `improvement_item_event`(item, actor, 시각, 바뀐 필드 전·후 JSON, 사유)에 남긴다. 「설비별 적용 이력」은 `targets`로 이 표를 설비 기준으로 조회한 것이다(ADR-0106 개정 2). 별도 감사 기록은 기존 감사 패턴을 따른다.

## 2. Quest 참조 계약

- 플랫폼은 Quest를 **ID로만** 저장하고, BRAVO 쪽 읽기는 `PlatformAdapter`의 읽기 전용 포트로 한다: `getQuest(id)`, `searchQuests({ query, status, page })`. 쓰기 없음. 구현은 사내 BRAVO 어댑터, 이 레포는 mock 어댑터와 계약 테스트만 갖는다.
- 보이기: 포트 응답 `ok`면 현재 제목·상태를 보이고 스냅샷을 갱신하지 않는다(읽기는 읽기). `not_found`(사라짐)면 스냅샷 제목에 「BRAVO에서 확인되지 않음」을 붙이고 링크를 끈다. `unavailable`(BRAVO 오류)이면 스냅샷으로 보이고 「지금 확인할 수 없음」을 붙인다. 두 경우 모두 개선 아이템은 그대로 열리고 수정할 수 있다.
- Quest 선택기: `searchQuests`를 쓴다. BRAVO가 검색을 못 주면 ID 직접 입력으로 낮춘다(Q7).
- **결과 매핑(노드 c, 구현됨):** 포트는 던지지 않고 `ApiResponse`로 답한다. `getQuest(id)`: `ok`+데이터 = 보임, outcome `empty`+`data: null` = `not_found`, outcome `error` = `unavailable`, `forbidden`은 그대로. `searchQuests({ query?, status?, page, pageSize })`(`page` 0부터, `pageSize` 1–50, `query` ≤ 200자) → `QuestSearchPage = { supported, items, page, hasMore }`: 검색을 못 하는 BRAVO는 outcome `ok`·`supported: false`·`items: []`(선택기가 ID 직접 입력으로 낮춘다), 「일치 없음」은 `supported: true`·`items: []`, `error`는 BRAVO를 쓸 수 없을 때뿐이다. `Quest = { id, title, status }`이고 `status`는 BRAVO의 표시 문자열이라 값을 나열하지 않는다. 링크(`url`)는 안전한 URL 도우미를 재사용할 수 있을 때까지 계약에 없다. 새 `PortError` 코드는 만들지 않았다(코드 어휘·공개 API가 바뀐다).
- Quest 화면은 BRAVO가 만든다. 개선 아이템 목록을 거기서 보이려면 플랫폼이 `questId`로 거른 목록 주소를 준다(교차 메뉴 링크).

## 3. API·DB (기존 log-knowledge·Task 패턴)

- 새 모듈 `apps/platform-api/src/modules/improvement-items`, 소유 스키마 `improvement`(마이그레이션 노드 a). 표: `item`, `item_target`, `item_event`, `item_counter`. 모든 PK/FK에 `workspace_id`. 낙관적 동시성은 `row_version`.
- 읽기(`platform:view`, menu-query): `improvement.items`(필터 `status`·`assignee`·`questId`·`questLinked`·`target`·`origin`), `improvement.itemDetail`, `improvement.itemEvents`. Quest 읽기는 메뉴 조회가 아니라 어댑터 포트(§2, 노드 c)다 — platform-api는 Quest 엔드포인트를 서비스하지 않는다(platform-api 읽기는 BRAVO에 닿을 수 없다).
- 쓰기(menu-action, capability **`improvement.manage`** 워크스페이스 범위, Admin 항상, Developer 요청, User 거절 — 안, Q3): `itemCreate`, `itemUpdate`(version CAS), `itemSetStatus`, `itemAssign`, `itemLinkQuest`, `itemReopen`. 편집형 표(#540)의 여러 칸 편집은 `itemBulkUpdate`(행마다 version, 부분 실패 보고)로 받는다. 모든 쓰기는 감사 기록 + `item_event`.
- 알림: 담당자 지정 때 기존 알림 모듈로 한 건(노드 e1 구현됨: `improvement.assigned_to_me`, 받은 알림은 `/improvement-items/<id>` 상세로 연결, 홈 담당 건수 카드는 e2).
- 엔티티 링크: VOC·Finding·Task와 이을 수 있게 `improvement_item` 종류를 06 계약에 더하는 일은 후속(Q8 아님, 기본 미포함).

## 4. 화면 (Decided, 소유자 2026-11-05 A안 + 효과 확인 대기 힌트)

직속 목록 메뉴 `improvement-items`(`/improvement-items`), 숨긴 상세 메뉴 `improvement-item`(`/improvement-items/:itemId`), 만들기 서랍을 `platform/improvement-items`에서 조립한다. 읽기는 로그인 전원(`platform:view`), 만들기·상태 이동은 `improvement:manage`다. feature REST 다리 대신 menu-query/menu-action을 쓴다.

1. **만들기 진입 — 「개선 아이템 남기기」.** 목록 주소에 `focus=new&origin=<분석 메뉴 ID>`와 전역 Context를 따로 넘긴다. 서랍은 분석 Context를 먼저 보여 주고 문제·조치와 선택적인 과제(Quest)를 받는다. 분석 출처가 없으면 대상 설비·공정이 필수다. 분석 메뉴는 폼을 갖지 않는다. 기존 분석 메뉴의 머리글 액션 추가는 노드 e의 진입점 조립 범위다.
2. **목록.** 표 위의 저장된 보기 탭은 `내 담당`(기본, 담당=나 + 효과 확인됨·취소 제외, 조치 완료 유지), `전체`, `과제(Quest) 미연결`. 열은 번호·문제·상태·담당·과제(Quest)·대상·조치일이고 조치 완료 줄에 「효과 확인 대기」를 붙인다. `담당` 머리글은 최소 폭을 확보한다. 표 필터는 ADR-0105의 반복 `filter`와 숨긴 이력 상태를 쓰며 `view`, `q`, `page`, `sort`를 복원한다. 빈 결과도 검색·필터·적용값·보기 탭·만들기를 유지하고 「조건 지우기」를 제공한다. 권한 거부는 별도로 보인다.
3. **상세.** 본문 왼쪽에 문제·조치·과제(Quest)·분석 출처·대상 이력, 오른쪽에 상태 이동과 변경 이력을 둔다. 분석 기간은 시작·끝 모두 KST로 표시하고 조치일과 구분한다. 출처 ID와 저장 Context를 `resolveLink`에 따로 전달한다. 상태 이동 확인에는 조치·조치일·효과 판단·취소/되돌림 사유의 필수 규칙을 적용하고, 충돌 시 초안을 보관한 채 최신 버전을 명시적으로 확인하게 한다.
4. **효과 확인 영역(노드 f 효과 부분 구현됨).** `beforeAfterPeriods`에 조치일 00:00 KST와 앞뒤 같은 길이(기본 7일, 1·7·14·30일 선택)를 넘겨 두 기간의 양끝을 KST로 보인다. 저장 출처의 같은 분석 메뉴에 지표·설비 Context와 뒤 기간 `from`·`to`를 `resolveLink`로 전달한다. 앞 기간은 분석 메뉴의 기존 Compare 조회가 같은 길이로 산출하며, 비교 켜기는 분석 화면에서 한다(URL 키 추가 없음). 출처·조치일 없음은 각각 이유를, 지원하지 않거나 열 수 없는 분석 화면·2000자 초과/안전하지 않은 링크는 열 수 없음 안내를 보인다. 링크를 열거나 「효과 확인에 이 비교 사용」으로 선택한 뒤 `done→verified` 확인에서 선택 링크 함께 저장을 끌 수 있다. 기간을 바꾸면 선택을 해제한다. 저장한 결과·메모·링크는 읽기 전용이고 `verified`에서는 기간 조작을 보이지 않는다. 이 화면에는 차트·효과 수치를 만들지 않는다. 편집형 표는 #540이 SDK 조각을 제공할 때까지 구현 안 함.

목록·상세의 불러오는 중·없음·오류·권한 없음, 과제(Quest)의 사라짐/서비스 불가/검색 미지원은 별도 상태로 처리한다. 과제(Quest) 포트에 안전한 URL 계약이 없어 정상 응답도 외부 링크를 만들지 않는다.

## 5. 노드 분할

a) 도메인·스키마·읽기 · b) 쓰기·이력·감사 · c) Quest 포트(어댑터, 구현됨 — platform-api는 Quest 엔드포인트 없음) + mock 어댑터 + 선택기 계약 · d) 화면(구현됨, 소유자 A안): 서랍·목록·상세 · e) 알림·담당 첫 화면 · f) 편집형 표(#540 뒤, 구현 안 함)·효과 확인(#1243 조각 조립 구현됨, 호스트 검증 대기). a→b→c→d. 편집형 표는 선행 SDK 조각이 없으면 열지 않는다. GLOSSARY에 상태·되돌림·효과 판단 용어를 등록했다.

### 홈 담당 건수 카드 (노드 e2, 구현됨)

`platform/improvement-items`가 Kernel `homeTodo` 슬롯에 카드를 제공하고 앱이 기능 다리의 기존 내 할 일과 함께 조립한다. 홈 패키지는 다른 메뉴를 import하지 않는다. `improvement.items`를 `pageSize=1`로 두 번 읽어 `total`을 표시한다: `내 담당`과 같은 본인·효과 확인됨/취소 제외, 그중 `done`인 효과 확인 대기 건수. `platform:view`로 읽으며 만들기·상태 변경 권한은 필요 없다.

0건도 `담당 건수 없음`과 `내 담당` 링크를 유지한다. 담당 배정 전에도 진입 위치가 일정하고, 조회 실패·권한 제한을 0건과 구분하기 위해서다. 높이가 고정된 카드 안에서 로딩·다시 시도 가능한 오류·권한 제한·0건·건수를 한국어/영어로 표시한다. 링크는 메뉴 ID와 페이지 키 코덱으로 저장된 보기를 만들며 예전 검색·페이지·서랍 조건을 지운다. 호스트의 1440/1280 캡처·review-ux·impeccable critique/audit는 별도 검증이다.

## 6. 결정 (`질문 #1328`, 소유자 2026-11-04: 추천대로)

| # | 질문 | 추천 | 이유 |
| --- | --- | --- | --- |
| Q1 | 담당자 첫 화면을 따로 둘지, 둔다면 어디에 | 별도 화면 없음. 직속 `개선 아이템` 목록의 저장된 보기 `내 담당`을 첫 화면으로, 홈에 담당 건수 카드 | 새 화면 수를 줄이고, 담당자가 User일 수도 있어 로그인 전원이 보는 직속에 둔다(업무 흐름은 Developer·Admin만, ADR-0110). 필요가 보이면 그때 `내 활동`으로 |
| Q2 | Quest 없이 아이템을 만들 수 있나 | 허용. 단 `origin`(분석 Context)이나 대상 설비 중 하나는 필수, 목록에 `과제(Quest) 미연결` 필터, 나중에 `itemLinkQuest` | 분석이 BRAVO의 Quest 발행보다 먼저일 수 있다. 막으면 아이템이 메모장 밖으로 쫓겨난다. 빈 아이템 방지는 필수 조건으로 한다 |
| Q3 | 쓰기 권한 | capability `improvement.manage`(Developer 요청, User 거절), 읽기는 로그인 전원 | `item.publish`와 같은 구조. 담당자가 User라면 지정된 본인 건의 상태 변경만 허용하는 예외 필요 여부를 답해 달라 |
| Q4 | 상태 흐름 | §1의 다섯 상태 + `reopen`. `verified`에는 효과 확인 필수 | 효과 확인이 이 기능의 존재 이유(ADR-0106)라서 건너뛰고 닫지 못하게 한다 |
| Q5 | 대상 설비·공정 | 여러 개, 외부 키 + 이름 스냅샷만 저장 | 플랫폼에 설비 마스터가 없다. 이름 변경은 스냅샷이 기록으로 남는다 |
| Q6 | 담당자는 한 명인가 | 한 명 | 책임이 흐려지지 않는다. 공동 작업은 아이템을 나눈다 |
| Q7 | BRAVO가 Quest 검색 읽기를 줄 수 있나(`searchQuests`) | 가능하다고 가정(결정)하고 ID 입력으로 낮추는 길을 둠 | 사내 어댑터 쪽 사실이라 소유자만 안다 |
| Q8 | 엔티티 링크(VOC·Finding·Task) 연결 | 이번 슬라이스에서 제외, 후속 | 06 계약 변경이 필요해 소유자 승인 사안 |
