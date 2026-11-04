# 개선 아이템 플랫폼 기능 — 설계 초안 (#1328)

> **Status: 소유자 답 반영(2026-11-04) — §6 Q1–Q8을 추천대로 결정, 노드 a(스키마·읽기) 구현됨, b–f 남음.** 단 Q3의 「담당자가 User인 경우 본인 건 상태 변경 예외」는 지금 두지 않는다(팀장 결정, 되돌릴 수 있음; 실제 User 담당자 사례가 생기면 다시 연다). 근거: [ADR-0106 개정 2](../../adr/0106-improvement-task-is-quest.md)(개선 아이템은 플랫폼 DB, Quest는 BRAVO 소유, ID로만 가리킴). 지금 레포에는 노드 a의 DB·읽기 API([api/improvement-items.md](../../architecture/platform-api/api/improvement-items.md))만 있고, 쓰기·Quest 포트·화면은 없다. 용어는 [GLOSSARY](../../../GLOSSARY.md)의 `과제(Quest)`·`개선 아이템`·`효과 확인`. 답이 나오면 실제 대안 사이 결정은 ADR로 남긴다(다음 번호는 `next-adr.sh`로 확인).

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

**상태 흐름(안):** `open`(문제 기록) → `in_progress`(조치 중) → `done`(조치 완료, `action_date` 필수) → `verified`(효과 확인 완료, `effect_check` 필수). 어느 단계에서든 `dropped`(취소, 사유 필수). `done`·`verified`·`dropped`에서 이전 단계로의 되돌림은 `reopen` 한 동작으로만 하고 이력에 남긴다. 상태 이름은 화면에서 한국어(`문제 기록`·`조치 중`·`조치 완료`·`효과 확인됨`·`취소`).

**이력.** 필드 변경은 추가 전용 `improvement_item_event`(item, actor, 시각, 바뀐 필드 전·후 JSON, 사유)에 남긴다. 「설비별 적용 이력」은 `targets`로 이 표를 설비 기준으로 조회한 것이다(ADR-0106 개정 2). 별도 감사 기록은 기존 감사 패턴을 따른다.

## 2. Quest 참조 계약

- 플랫폼은 Quest를 **ID로만** 저장하고, BRAVO 쪽 읽기는 `PlatformAdapter`의 읽기 전용 포트로 한다: `getQuest(id)`, `searchQuests({ query, status, page })`. 쓰기 없음. 구현은 사내 BRAVO 어댑터, 이 레포는 mock 어댑터와 계약 테스트만 갖는다.
- 보이기: 포트 응답 `ok`면 현재 제목·상태를 보이고 스냅샷을 갱신하지 않는다(읽기는 읽기). `not_found`(사라짐)면 스냅샷 제목에 「BRAVO에서 확인되지 않음」을 붙이고 링크를 끈다. `unavailable`(BRAVO 오류)이면 스냅샷으로 보이고 「지금 확인할 수 없음」을 붙인다. 두 경우 모두 개선 아이템은 그대로 열리고 수정할 수 있다.
- Quest 선택기: `searchQuests`를 쓴다. BRAVO가 검색을 못 주면 ID 직접 입력으로 낮춘다(Q7).
- Quest 화면은 BRAVO가 만든다. 개선 아이템 목록을 거기서 보이려면 플랫폼이 `questId`로 거른 목록 주소를 준다(교차 메뉴 링크).

## 3. API·DB (기존 log-knowledge·Task 패턴)

- 새 모듈 `apps/platform-api/src/modules/improvement-items`, 소유 스키마 `improvement`(마이그레이션 노드 a). 표: `item`, `item_target`, `item_event`, `item_counter`. 모든 PK/FK에 `workspace_id`. 낙관적 동시성은 `row_version`.
- 읽기(`platform:view`, menu-query): `improvement.items`(필터 `status`·`assignee`·`questId`·`questLinked`·`target`·`origin`), `improvement.itemDetail`, `improvement.itemEvents`, `improvement.questSearch`.
- 쓰기(menu-action, capability **`improvement.manage`** 워크스페이스 범위, Admin 항상, Developer 요청, User 거절 — 안, Q3): `itemCreate`, `itemUpdate`(version CAS), `itemSetStatus`, `itemAssign`, `itemLinkQuest`, `itemReopen`. 편집형 표(#540)의 여러 칸 편집은 `itemBulkUpdate`(행마다 version, 부분 실패 보고)로 받는다. 모든 쓰기는 감사 기록 + `item_event`.
- 알림: 담당자 지정 때 기존 알림 모듈로 한 건(노드 e).
- 엔티티 링크: VOC·Finding·Task와 이을 수 있게 `improvement_item` 종류를 06 계약에 더하는 일은 후속(Q8 아님, 기본 미포함).

## 4. 화면 (IA 수준, `?variant=` 시안은 소유자 답 뒤)

새 화면 셋이라 3개 이상 규칙에 걸린다: 목록, 상세, 만들기. 만들기와 편집은 서랍으로 줄이면 새 메뉴 화면은 **목록 + 상세 둘**이다.

1. **만들기 진입 — 「개선 아이템 남기기」.** MARS·CLAS 분석 화면의 머리글 액션이 플랫폼 만들기 서랍으로 가는 교차 메뉴 링크다. 분석 Context(지표·기간·설비)가 서랍을 미리 채우고 사용자는 문제·조치만 쓴다. 분석 메뉴는 폼을 갖지 않는다(Kernel·메뉴는 서로를 모른다). Quest가 있으면 선택기, 없으면 비워 둔다.
2. **목록 `개선 아이템`.** 열: 번호·문제·상태·담당·Quest·대상·조치일. 필터는 표 필터 모델(ADR-0105). 저장된 보기 `내 담당`(담당=나, 종료 아님)이 담당자의 첫 화면 후보(Q1). 여러 칸 편집은 편집형 표 조각(#540)이 올라온 뒤 같은 표에 얹는다.
3. **상세.** 요약·상태 이동·`origin`으로 분석 화면 열기·대상 설비 이력·효과 확인(기준일 전후 비교 조각 #1243, `action_date`만 넘김)·이력 타임라인.
- 상태 네 가지(불러오는 중·없음·오류·권한 없음), Quest 사라짐 표시, 상태 이동 확인을 시안에서 확인한다.

## 5. 노드 분할

a) 도메인·스키마·읽기 · b) 쓰기·이력·감사 · c) Quest 포트 + mock 어댑터 + 선택기 계약 · d) 화면(시안 컨펌 후): 서랍·목록·상세 · e) 알림·담당 첫 화면 · f) 편집형 표(#540 뒤)·효과 확인(#1243 뒤). a→b→c→d. f는 선행 조각이 없으면 열지 않는다. GLOSSARY는 답이 확정된 노드 d 전에 상태 용어를 올린다(이 PR은 문서 범위 밖이라 고치지 않음).

## 6. 결정 (`질문 #1328`, 소유자 2026-11-04: 추천대로)

| # | 질문 | 추천 | 이유 |
| --- | --- | --- | --- |
| Q1 | 담당자 첫 화면을 따로 둘지, 둔다면 어디에 | 별도 화면 없음. 직속 `개선 아이템` 목록의 저장된 보기 `내 담당`을 첫 화면으로, 홈에 담당 건수 카드 | 새 화면 수를 줄이고, 담당자가 User일 수도 있어 로그인 전원이 보는 직속에 둔다(업무 흐름은 Developer·Admin만, ADR-0110). 필요가 보이면 그때 `내 활동`으로 |
| Q2 | Quest 없이 아이템을 만들 수 있나 | 허용. 단 `origin`(분석 Context)이나 대상 설비 중 하나는 필수, 목록에 `Quest 미연결` 필터, 나중에 `itemLinkQuest` | 분석이 BRAVO의 Quest 발행보다 먼저일 수 있다. 막으면 아이템이 메모장 밖으로 쫓겨난다. 빈 아이템 방지는 필수 조건으로 한다 |
| Q3 | 쓰기 권한 | capability `improvement.manage`(Developer 요청, User 거절), 읽기는 로그인 전원 | `item.publish`와 같은 구조. 담당자가 User라면 지정된 본인 건의 상태 변경만 허용하는 예외 필요 여부를 답해 달라 |
| Q4 | 상태 흐름 | §1의 다섯 상태 + `reopen`. `verified`에는 효과 확인 필수 | 효과 확인이 이 기능의 존재 이유(ADR-0106)라서 건너뛰고 닫지 못하게 한다 |
| Q5 | 대상 설비·공정 | 여러 개, 외부 키 + 이름 스냅샷만 저장 | 플랫폼에 설비 마스터가 없다. 이름 변경은 스냅샷이 기록으로 남는다 |
| Q6 | 담당자는 한 명인가 | 한 명 | 책임이 흐려지지 않는다. 공동 작업은 아이템을 나눈다 |
| Q7 | BRAVO가 Quest 검색 읽기를 줄 수 있나(`searchQuests`) | 가능하다고 가정(결정)하고 ID 입력으로 낮추는 길을 둠 | 사내 어댑터 쪽 사실이라 소유자만 안다 |
| Q8 | 엔티티 링크(VOC·Finding·Task) 연결 | 이번 슬라이스에서 제외, 후속 | 06 계약 변경이 필요해 소유자 승인 사안 |
