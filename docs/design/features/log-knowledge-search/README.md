# 로그 지식 통합 검색 — 방향 관계·ACL-aware 색인 설계 (구현됨)

> **Status: Candidate → 소유자 답 3개 반영(2026-11-08), ADR-0124·0125 Decided.** 구현됨: `item_event_relation_record` 표와 `relations[]` 쓰기·읽기(S-b), 접근 규칙(S-a), 색인 저장·갱신(S-c: `search_document`, `search_outbox`, 소비자, backfill, 생성 포인터, 운영 읽기). 검색 질의(S-d: `SearchPort`·PG 어댑터·`logKnowledge.search`/`searchSuggest`·계약 스키마). 화면(S-f, #1509): 통합 검색 A(선택기 줄)·Item 편집 C(접힌 관계 요약), 소유자 확인 2026-11-08. 평가 세트·부하 보고(S-e, [results.md](results.md)). 통합 수용 검증(S-g, #1510): 수용 매트릭스는 §11. 미구현은 §9에만 있다. 근거는 [#1199](https://github.com/hjung3113/analytics-platform/issues/1199)이고 Epic [#1192](https://github.com/hjung3113/analytics-platform/issues/1192)의 불변식과 [v0.6 통합 설계](../log-knowledge-hub/design-v0.6-candidate.md) §5.4·§9를 **구체화**한다(같은 내용을 다시 쓰지 않는다). 결정은 [ADR-0124](../../../adr/0124-knowledge-search-evaluates-acl-at-query-time-and-reads-display-live.md)(ACL은 조회 때, 표시는 live)와 [ADR-0125](../../../adr/0125-event-order-search-uses-structured-event-relation-records.md)(방향 검색은 구조화된 Event 관계 기록)이 소유하며 둘 다 **Decided**(소유자 2026-11-08)다. 코드와 Decided ADR이 이 문서보다 우선한다. 결정마다 «소유자 2026-11-08»로 표시한다.
>
> 공개 저장소다. 예시는 합성 데이터만 쓴다.

## 1. 이 설계가 하는 것

설비사·공정·Model·SW를 가로질러 **발행된 지식 Item**을 한 곳에서 찾되, 아래 네 가지를 검색이 훼손하지 않게 한다.

1. **관계 방향.** `STEP_PROCESS`가 `PROCESS_START`보다 먼저라는 Item과 그 반대 Item은 다른 결과다. 관찰(`observed`)과 명세상 기대(`expected`)도 다른 결과다. 관계 기록의 `observed`는 Item의 확인 상태 `observed`(`관찰됨`)나 본문 «관찰» 칸과 다른 값이며 서로 대신하지 않는다.
2. **기술 의미.** 같은 Event 이름이 다른 SW에 있어도 사람이 확정한 개념 매핑 없이는 같은 뜻으로 합치지 않는다.
3. **접근 권한.** 권한이 없는 Item은 결과·미리보기·자동완성·건수·주소 어디에도 나타나지 않는다. 회수는 다음 요청부터 반영된다.
4. **발행 경계.** 검색 대상은 사람이 발행한 **최신 Revision**뿐이다. Draft·Validator 후보는 검토함 전용이다([#1198](https://github.com/hjung3113/analytics-platform/issues/1198)).

하는 일: `SearchPort` 계약과 PG(FTS + `pg_trgm`) 어댑터, 색인 문서와 outbox, 최초 색인(backfill)·재색인·롤백, 방향 관계 조회, 객체 접근 규칙, 검색 화면 1개.

하지 않는 일(§9): 외부 AI·embedding 호출(사내 규칙: 외부 AI 호출 없음, embedding 비활성), 원본 로그 본문 색인([log-explorer §4.1](../log-explorer/README.md#41-토큰-호출과-내보내기-소유자-2026-11-07-허용-범위감사상한을-설계에-포함)과 같은 이유), Evidence 원천 ACL 어댑터([#1200](https://github.com/hjung3113/analytics-platform/issues/1200)·[#1201](https://github.com/hjung3113/analytics-platform/issues/1201)), 저장 검색.

## 2. 책임 경계와 용어

| 무엇 | 소유 | 검색이 가지는 것 |
| --- | --- | --- |
| Item·Revision·판단·링크·대상(subject) | `log-knowledge` ([ADR-0109](../../../adr/0109-log-knowledge-item-ownership-revisions-assessments.md)) | **파생 색인만**. 원본이 아니므로 버려도 다시 만들 수 있다 |
| 모델 명세 Event·관계 | 모델 명세 Revision ([ADR-0111](../../../adr/0111-log-knowledge-model-spec-is-the-source.md)) | 안정 키(`moduleKey/eventKey`)로만 가리킨다 |
| 개념 매핑(`confirmed`+`equivalent`) | `spec_concept_mapping` | 읽기. 제안·거절 상태는 동치 검색에 쓰지 않는다 |
| 객체 접근 규칙 | `log-knowledge` (**이 슬라이스가 만든다**, §3.4) | 조회 때 읽는다. 색인에 복사하지 않는다 |
| 팀·역할 | Core 현재 projection | 복제하지 않는다 |
| Evidence 본문·원천 ACL | 각 원본 소유자 | 색인하지 않는다. «근거 있음(접근 제한)» 메타만 |

용어는 [GLOSSARY](../../../../GLOSSARY.md)를 따른다: `발행`(게시 아님), `지식 근거`(Item에 붙는 근거, 로그 한 줄을 가리키는 `근거 위치`와 다른 객체), 관찰/기대/분석 의견/개선, 확인 상태(`not_checked`·`observed`·`verified`·`disputed`). 새 용어 두 개(이 PR에서 GLOSSARY에 등재):

- **Event 관계 기록** (`EventRelationRecord`): Item Revision이 «이 Event가 저 Event보다 먼저/나중에 일어난다»를 **관찰했다/명세가 기대한다**고 구조화해 적은 한 줄. 본문 문장과 별개다. «Event 관계»만 쓰면 모델 명세의 `spec_event_relation`(명세가 선언한 순서)과 섞이므로 «기록»을 붙인다.
- **색인 지연** (`indexLag`): 검색에 반영할 최신 원본 변경(새 Revision, 개념·alias·카탈로그 변경)이 색인에 아직 반영되지 않은 상태. 화면에 칩으로 보인다.

«검색 결과 없음»과 «색인 중 / 접근 제한으로 가려짐»은 같은 말이 아니다. 접근 제한으로 가려진 개수는 절대 말하지 않는다(§3.4).

## 3. 데이터 모델 (확정 DDL 아님)

스키마 `knowledge`. 번호는 병합 시점의 다음 빈 번호이고 journal은 이어져야 한다. 모든 신규 테이블은 한 번에 만들지 않고 §7 노드에서 필요한 것만 만든다(v0.6 §5.2 단계별 물리화).

### 3.1 `item_event_relation_record` — 방향의 원천 (ADR-0125)

Item의 «관찰»·«기대» 본문은 자유 텍스트이고 방향은 거기서 읽을 수 없다. 방향은 S-b가 만든 `item_event_relation_record` 표(쓰기 입력 `relations[]`, 상세 응답 `relations`)가 담는다. 방향 검색은 S-d가 이 표를 읽어 구현한다([api 계약](../../../architecture/platform-api/api/log-knowledge.md#knowledge-search-1507-s-d)). `spec_event_relation`은 **모델 명세가 선언한** 순서(기대 쪽)일 뿐 Item이 «실제로 거꾸로 관찰했다»를 담지 못한다. 본문 문장을 해석해 방향을 뽑으면 `A 전에 B`/`B 후에 A`/부정문에서 틀린다(§8). 그래서 Revision이 방향을 **구조화해서 직접 적는다.**

`item_id`, `revision_no`, `ordinal`, `kind`(`observed`·`expected`), `source_key`·`target_key`(`moduleKey/eventKey`, [spec-target-key](../../../../apps/platform-api/src/modules/log-knowledge/domain/spec-target-key.ts)와 같은 안정 키), `predicate`, `resolved`(쓸 때 소유자의 실효 명세에 두 키가 모두 있었는지).

- Revision 불변이므로 이 표도 추가 전용이다(UPDATE/DELETE 금지, ADR-0109 2).
- `predicate`는 닫힌 목록 `before`(source가 target보다 먼저)로 시작한다. `after`는 **저장하지 않고** 입력 때 `before`로 뒤집어 저장한다(`B after A` → `A before B`). 이래야 «같은 사실의 두 표기»가 한 행으로 모이고, 반대 방향은 행이 다르다. 순서 외 술어(`requires`, `excludes` 등)는 이번에 없다(§9).
- 키는 Item 소유 Model의 명세(SW Item은 그 SW의 실효 명세)에 있어야 한다. 명세에 없는 키는 저장 거절이 아니라 `unresolved`로 저장하고 방향 검색에는 쓰되 화면에 «명세에 없는 Event»를 표시한다(명세가 먼저 바뀌어도 Item이 막히지 않게).
- 한 Revision에 최대 20줄(Item 대상 상한과 같은 크기).
- 기존 Item에는 기록이 없다. 방향 검색은 기록이 있는 Item만 방향 일치로 올리고, 기록이 없는 Item은 본문 검색 결과로만 나온다. 본문을 소급 해석해 채우지 않는다.

### 3.2 `search_document` — 파생 색인

구현됨(S-c): 표·GIN 색인 둘·정규화(`domain/search-normalize.ts`)가 있다. 열 구성과 저장 규칙은 [04-database-and-migrations](../../../../apps/platform-api/docs/04-database-and-migrations.md#search-index-1506-s-c-migration-file-_search_indexsql)이 갖는다. `term_text`는 토큰·Event 키(관계 기록·대상)·소유 Model/SW/업체/공정의 코드와 이름·확정된 개념 레이블이다. 승인 alias는 코드에 alias가 없어 아직 넣지 않는다.

Item당 한 행(`item_id` PK, `index_generation`). 최신 **발행** Revision만 반영한다.

`item_id`, `workspace_id`, `revision_no`(색인한 Revision), `source_row_version`(색인 당시 Item `row_version`), `search_text`(제목·유형·관찰·기대·분석 의견·개선·변경 메모 정규화본), `tsv`(GIN), `term_text`(토큰·Event 키·승인 alias, trigram GIN), `index_generation`, `indexed_at`.

- **ACL을 담지 않는다**: 접근 방식·소유 Model/SW의 제한 여부 같은 열이 없다(ADR-0124). 소유자 열(`owner_model_id`/`owner_software_id`)은 필터용 복사가 아니라 조회 때 Item 행에서 읽는다.
- **지식 근거를 담지 않는다**: Item의 지식 근거(원천 참조·`locator`·`note`)와 발췌는 색인하지 않는다.
- 정규화: 소문자·NFKC, `_`·`-`·`.`·카멜 경계에서 쪼갠 토큰과 원형 토큰을 **둘 다** 넣는다(`STEP_PROCESS` → `step_process`, `step`, `process`). 한국어는 형태소 사전 없이 공백 토큰 + 문자 n-gram(trigram)으로 시작하고 품질은 §6으로 잰다. 한국어 형태소 사전이나 별도 엔진은 측정 결과로 `SearchPort` 어댑터를 바꿔 해결한다.

### 3.3 `search_outbox` — 변경 알림 (페이로드 없음)

구현됨(S-c): 쓰는 지점과 읽는 운영 항목은 [api/log-knowledge.md](../../../architecture/platform-api/api/log-knowledge.md#search-index-operations-1506-s-c)가 갖는다. alias 승인·회수는 alias가 없어 해당 없음이다.

`outbox_id`, `item_id`, `reason`(`published`·`archived`·`access_changed`·`concept_changed`·`alias_changed`·`subject_changed`·`catalog_changed`·`reindex`), `state`(`pending`·`running`·`done`·`failed`·`dead`), `attempt_count`, `available_at`, `last_error`(코드만, 본문 없음), 생성 시각.

- **«Item X를 다시 만들어라»만 담는다.** 새 Revision 내용이나 권한을 페이로드로 나르지 않는다. 소비자는 처리 때 **원본 테이블의 현재 값**을 읽어 문서를 만든다. 그래서 알림 순서가 뒤바뀌거나 중복돼도 결과가 같고 낡은 알림이 새 Revision을 덮을 수 없다(§5).
- 원본 변경과 **같은 트랜잭션**에 쓴다: 발행·보관(Item 쓰기 5종), 접근 규칙 변경, 개념 확정/거절, alias 승인/회수, 대상(subject) 변경, 카탈로그 이름·비활성 변경(영향 Item 전체는 배치로 나눠 쓴다). 승인과 같은 트랜잭션 원칙은 [#1198 Q3](https://github.com/hjung3113/analytics-platform/issues/1198) 답 그대로다(그 이슈는 outbox를 만들지 않았고 backfill과 outbox는 여기서 만든다).
- 같은 Item의 `pending` 알림은 하나로 합친다(부분 unique `item_id where state='pending'`).

### 3.4 객체 접근 규칙 — 이 슬라이스의 선행 (소유자 2026-11-08: 포함)

현재 `knowledge` 스키마에는 `access_mode`나 `object_access_rule`이 **없다**. Item·Model·SW 읽기는 메뉴 권한(`platform:view`, 토큰은 `workspace.read` grant·scope 포함)과 Actor의 workspace만 본다(쓰기 capability는 읽기에 쓰이지 않는다). «ACL-aware 색인»은 ACL이 있어야 성립하므로, 최소 규칙을 이 슬라이스에 넣는다(v0.6 §5.2 36번, §8). 소유자가 이 슬라이스에 포함하기로 했다(§10 Q1, 추천대로). 범위:

- **제한 대상은 Model, SW, Item** 셋. `access_mode`(Entity Link·VOC의 `Visibility`와 다른 knowledge 전용 열): `internal`(기본: 로그인한 내부 사용자 공개)·`restricted`(허용 규칙에 든 주체만).
- **상속은 위에서 아래로, 거절 우선**: 상위(Model)가 `restricted`이고 주체가 허용되지 않으면 그 아래 SW·Item도 보이지 않는다. 하위 허용 규칙으로 상위 제한을 풀 수 없다.
- 주체: **Actor만** 저장한다. 팀·역할은 Core에 멤버십 테이블이 생긴 뒤 현재 projection을 조회 때 읽는 방식으로 추가한다(복제하지 않는다). 규칙: `rule_id`, `target_kind`, `target_id`, `grantee_kind`(`actor`), `grantee_id`, `effect`(`allow`·`deny`), `valid_until?`, 생성·회수(`revoked_at/by`) — 규칙은 지우지 않고 회수한다. 만료·회수된 규칙은 세지 않는다.
- 규칙 변경은 감사와 같은 트랜잭션(`knowledge.access.mode_changed`·`rule_added`·`rule_revoked`, id만). 검색 outbox(`access_changed`)는 노드 c가 같은 쓰기 지점에 더한다. 변경 권한 capability는 `knowledge.access.manage`(세션 전용 — 권한 부여는 토큰 불가 목록, [ADR-0116](../../../adr/0116-platform-api-tokens-personal-and-service.md) 결정 4). 관리는 capability로 판정하고 가시성으로 판정하지 않는다: 관리자는 자신에게 보이지 않는 대상도 다루고 자신에게 허용을 줄 수 있다(감사). 읽기에는 Admin 우회가 없다.
- 구현: API·저장은 [api/log-knowledge.md](../../../architecture/platform-api/api/log-knowledge.md#object-access-1504-s-a-migration-0112).
- 서비스 Actor(Agent·Validator)는 검색 읽기에 명시된 grant가 있어야 하고 승인·발행 경로는 여전히 없다.
- **Evidence 원천 ACL은 이 규칙에 없다.** 원본 소유자의 판정이므로 #1200/#1201의 어댑터 몫이다. 그 전에는 Item이 보여도 근거는 «근거 있음(접근 제한 확인 전)» 메타로만 나가고 검색은 근거를 색인·미리보기하지 않는다(§3.2).

## 4. 검색 흐름

구현됨(S-d): 아래 1–5단계, 순위 1–4·6단계, 반대 방향 별도 구역, 키셋 커서, `capped`, 자동완성. 계약과 한계는 [api/log-knowledge.md](../../../architecture/platform-api/api/log-knowledge.md#knowledge-search-1507-s-d)가 갖는다. 5단계(승인 alias)는 alias가 코드에 없어 구현하지 않았다. `indexLag`의 지연과 진행률은 현재 사용자가 볼 수 있는 발행 Item만으로 구한다(§5.2). 전체 workspace 진행률은 정수 퍼센트여도 숨은 Item 수를 유추하게 하므로 검색 응답에 쓰지 않는다. 커서는 workspace·Actor·해석된 질의·필터에 묶고 HMAC으로 인증한다. 다른 사용자·workspace의 커서와 변조된 커서는 잘못된 커서와 같은 오류로 거절한다. 프로세스가 재시작되거나 다른 인스턴스로 요청이 가면 첫 페이지부터 다시 조회한다.

```text
GET-like menu-query  logKnowledge.search { q, ownerFilter, relation?, kind?, cursor, limit<=50 }
  1. 질의 해석   : 원문 보존 → 토큰 + (명시된) 관계 조건. 해석 결과를 응답에 되돌려 준다
  2. 후보 생성   : SearchPort.search(plan, cursor, limit)  → item_id 후보 + 매칭 이유   (색인에서)
  3. 가시성 판정 : 같은 SQL 안에서 Item/Model/SW 현재 접근 규칙으로 거른다            (live, ADR-0124)
  4. 표시값 읽기 : 통과한 최대 limit행만 제목·발췌는 최신 Revision에서, 발행·확인·처리 상태는 Item 행의 현재 값에서 읽는다 (live)
  5. 응답        : item_id당 한 행, 비슷한 Item은 별도 행 + 관계 링크
```

### 4.1 질의 해석과 방향

- **기본은 평범한 텍스트 검색**이다. 방향은 사용자가 **명시한 관계 조건**(검색 화면의 «순서 검색» 선택기: Event A, 먼저/나중, Event B, 종류 관찰/기대/모두)이나 질의 안의 닫힌 연산어(`before`, `after`, `먼저`, `이전`, `나중`, `이후`, `→`) 양쪽에 Event 토큰이 있을 때만 켜진다. 못 알아본 질의는 방향 없이 텍스트로 처리한다. 모델이 문장을 «이해»해 방향을 추정하지 않는다(외부 AI 호출 없음, 사내 규칙).
- 질의에서 해석한 방향은 화면에 «방향으로 해석: STEP_PROCESS → PROCESS_START (관찰)» 칩으로 **항상 보이고** 끌 수 있다. 조용히 해석하지 않는다.
- `B after A`는 `A before B`로 정규화해 같은 행을 찾는다. `B before A`는 다른 질의다.
- Event 토큰은 모델 명세의 안정 키·승인 alias와 대조한다. 같은 키가 여러 Model/SW에 있으면 **각 Model/SW의 기록을 각자 찾고** 결과 행에 소유 Model/SW를 단다. 다른 소유자의 기록을 동치로 합치지 않는다.
- 사람이 `confirmed` + `equivalent`로 확정한 개념 매핑이 있을 때만 «같은 개념의 다른 Event»도 후보에 넣고, 행에 «개념 매핑으로 일치» 이유를 단다. 확장 값은 `(Model ID, Event 키)` 쌍이다. 관계 기록은 Item 소유 Model(SW는 상위 Model), 대상(subject)은 자신의 `model_id`가 매핑의 Model과 같아야 한다. `proposed`·`rejected`는 쓰지 않는다([ADR-0111](../../../adr/0111-log-knowledge-model-spec-is-the-source.md)).

### 4.2 매칭 이유와 순위 (정량값은 측정 뒤)

위 단계일수록 앞에 둔다. 한 단계 안의 점수는 측정 전에 정하지 않는다([#1199](https://github.com/hjung3113/analytics-platform/issues/1199) 성능은 가설).

| 단계 | 이유 |
| --- | --- |
| 1 | 같은 소유자(Model/SW)의 **같은 방향 Event 관계 기록**이 `observed` |
| 2 | 같은 방향, `expected`만 있음 — 행에 «명세상 기대» 표시, 관찰 결과와 섞어 세지 않는다 |
| 3 | 정확한 토큰·Event 키 일치 |
| 4 | `confirmed` 개념 매핑으로 일치 |
| 5 | 승인 alias 일치 |
| 6 | 본문(FTS)·trigram 유사 |

- **반대 방향만 있는 Item**(`B before A`, 같은 종류 조건과 개념 매핑으로 판정)은 관계 조건과 텍스트를 함께 검색해도 위 단계 어디에도 들어가지 않는다. 사용자가 «반대 방향도 보기»를 켜면 **별도 구역**으로 보이고 기본은 꺼짐이다. 같은 방향 기록도 있으면 본 결과에 남고, 기록이 없는 Item은 텍스트로 찾을 수 있다.
- 오타(trigram)는 자동 교정하지 않는다. 결과가 적을 때 «혹시 이 토큰?» 제안만 보인다(불확실한 alias를 강제 교정하지 않음, v0.6 §9.1).
- 정렬 tie-break는 `(단계, 점수, published_at DESC, item_id ASC)`로 안정 정렬이다.

### 4.3 중복 제거 — 같은 Item 안에서만

`item_id`당 결과 한 행이다. 제목이 같거나 `related`·`derived_from` 링크가 있어도 다른 Item이면 **각각 행**으로 두고, 행 아래에 «관련 Item n건» 링크를 단다(링크 대상도 가시성 판정을 거친 것만 센다). 다른 SW·Model의 비슷한 Item을 점수로 합치지 않는다.

### 4.4 자동완성·건수·미리보기

- 모두 §4의 같은 SQL(3단계)을 거친다. 자동완성은 Item 제목·Event 키·승인 alias의 접두 일치이고 후보 12개 이하다. 가시성 판정 없는 별도 경로를 만들지 않는다.
- **정확한 총 건수를 주지 않는다.** `hasMore`와 «100건 이상» 상한 표시만 쓴다(같은 판정을 거쳐 최대 101건까지 센 값). 이유: 총 건수는 권한 때문에 가려진 건수를 역산하게 한다.
- 미리보기(발췌)는 통과한 행의 **최신 Revision 텍스트에서 그 순간** 만든다(ADR-0124). 색인에 발췌를 저장하지 않는다.

## 5. 색인 갱신·최초 색인·롤백

### 5.1 갱신 소비자

구현됨(S-c): `knowledge.search.drain`이 위 규칙대로 돈다(배치 100, 시도 상한 8, 알림별 advisory 잠금). 한 번의 cron 실행이 약 55초 동안 계속 비워 낸다.

`pg-boss`(`apps/platform-api/src/lib/jobs.ts` 재사용)에 `knowledge.search.drain` 작업을 두고 한 번에 `FOR UPDATE SKIP LOCKED`로 제한된 개수(시작값 100)만 가져온다. 새 인프라는 없다. 한 알림의 처리:

1. 알림의 `item_id`를 **원본에서 지금 값으로** 읽는다(Item 행의 발행 상태, 최신 발행 Revision, 대상, 매핑, alias).
2. 발행되지 않았거나 보관됐으면 문서를 지운다(또는 `index_state=hidden`). 그렇지 않으면 문서를 만든다.
3. `INSERT … ON CONFLICT (item_id) DO UPDATE … WHERE search_document.source_row_version <= EXCLUDED.source_row_version` — 오래된 처리가 새 문서를 덮지 못한다.
4. 알림을 `done`으로. 실패하면 지수 후퇴로 `failed`, `attempt_count` 상한(시작값 8) 뒤 `dead`.

- 처리가 원본의 현재 값을 읽으므로 순서 역전·중복이 안전하다. 같은 알림을 두 번 처리해도 같은 문서가 된다(멱등).
- 목표(가설): 발행에서 검색 가능까지 p95 10초. 실측 전 보장 아님.
- `dead` 알림은 운영 콘솔에서 건수가 보이고 «다시 시도»(`requeue`)로 `pending`이 된다. 검색은 `dead`가 있어도 계속 되고 해당 Item은 `indexLag` 칩으로 표시된다.

### 5.2 최초 색인 (backfill) — #1198이 넘긴 일

구현됨(S-c): `knowledge.search.backfill`(10분 cron과 시작 시 한 번), 운영 진행 위치는 `search_backfill_progress` 한 행이다. 전체 건수·진행 상태는 `knowledge.access.manage`로 보호된 운영 경로에서만 읽는다.

색인 migration이 배포된 뒤 `search.backfill`이 **발행된 모든 Item**을 `item_id` 키셋 순서로 배치(시작값 500)마다 `reason='reindex'` 알림으로 넣는다. 진행 위치(`last_item_id`, 전체 수, 완료 수)는 한 행에 저장돼 중단 후 이어진다. 빈 DB에서도 같은 코드가 돌고 0건에서 즉시 완료다.

검색의 `indexLag`는 운영 카운터·상태를 읽지 않는다. 같은 SQL에서 현재 가시성 판정을 통과한 발행 Item만 대상으로, `lagSeconds`는 이 Item들의 가장 오래된 `pending` 알림 나이(없으면 null), `backfill.percent`는 구축 중 생성(없으면 활성 생성, 포인터 없으면 1)에 문서가 있는 비율을 내림한 정수다. 상태는 보이는 발행 Item이 없으면 `none`·0%, 모두 문서가 있으면 `done`·100%, 일부가 없으면 `running`이다. 소유자 필터나 검색어와 무관하게 사용자가 볼 수 있는 발행 Item 전체를 기준으로 한다. 숨은 Item의 추가·알림·운영 완료 수는 이 힌트를 바꾸지 않는다. Revision 갱신 지연과 최초 문서 생성 진행은 다르므로, 문서가 있는 Item의 새 변경이 대기하면 `done`과 지연 나이가 함께 나올 수 있다. 화면은 이 가시 범위 힌트로 «색인 중»을 표시하고 전체 «n / N»을 표시하지 않는다.

### 5.3 재색인·롤백·SearchPort 교체

구현됨(S-c): 생성 포인터와 새 생성 시작·전환·롤백·보존 기간 뒤 삭제는 저장소 함수다(HTTP 진입점 없음). 소비자는 활성·구축 중·직전 생성 모두에 쓴다. 그림자 비교와 `SearchPort`는 아직 없다.

- `index_generation`: 새 생성(n+1)을 옆에 만들고 완료·검증 뒤 활성 생성 포인터를 **한 번의 UPDATE**로 바꾼다. 롤백은 포인터를 되돌리는 것이다(색인은 파생이므로 데이터 손실이 없다). 이전 생성은 보존 기한(시작값 7일) 뒤에 지운다.
- `SearchPort` 어댑터를 바꾸려면 같은 계약 테스트(§6 평가 세트 포함)를 통과해야 하고, 전환 전에 **그림자 비교**(같은 질의를 두 어댑터에 보내 결과만 비교, 응답은 기존 것)로 순위·재현율 차이를 본다. 어댑터는 ACL을 모른다 — 가시성 판정과 표시값 읽기는 어댑터 밖(§4 3·4단계)이라 어댑터를 바꿔도 권한 경계가 그대로다.
- 장애 복구: 색인이 깨졌거나 의심되면 `reindex` 전체를 새 생성으로 돌린다. 검색은 그 동안 활성 생성으로 계속 응답한다.

## 6. 품질·성능 측정 (수용 기준)

성능과 한국어 품질은 **가설이고 측정 전에는 보장하지 않는다**.

- **평가 세트**: 합성 Item(공개 저장소이므로 합성)을 질의 유형별로 만든다 — 정확 토큰, snake/camel 변형, alias, 오타, 한국어 기술 용어(조사 붙은 형태 포함), 방향(정/역), 관찰/기대, 같은 Event 이름의 다른 SW. 각 질의에 정답 Item 집합을 적는다. 승인된 사내 샘플은 소유자가 허용한 뒤에만 비공개 환경에서 쓰고 이 저장소에 올리지 않는다.
- **지표**: Recall@20, Precision@10, MRR(유형별), 방향 반례 통과율(정/역을 섞어 본 실패 수 = 0이어야 한다).
- **부하**: 합성 10만 Item, 동시 30, 기본 20건/페이지, 접근 규칙이 걸린 비율 0%·5%·30%에서 서버 p95와 `EXPLAIN (ANALYZE, BUFFERS)`를 보고한다. 목표 p95 ≤ 300ms는 **가설**이며 결과가 목표를 못 넘으면 보고서에 그 숫자를 적는다(숫자를 맞추려고 ACL 판정을 약하게 하지 않는다 — 그럴 때의 선택지는 §10 D6).
- 산출물: 평가 세트와 스크립트(저장소), 측정 보고서(`docs/`의 결과 문서 한 편). 합성 결과를 운영 품질로 쓰지 않는다.

## 7. 구현 노드 분할 (제안)

티어는 `tier.sh`·PROFILE §Size and path 기준. 한 노드 = 한 PR 기본. 이 설계 PR은 문서만(light)이다. 마이그레이션 노드는 전체 백엔드 `test:integration`을 따른다.

| 노드 | 내용 | 기대 티어 | 선행 |
| --- | --- | --- | --- |
| 0 | `pg_trgm` 설치(bootstrap `scripts/db/init.sql` + migration은 확인만, 0042 pgvector 방식) | light | 소유자 답(완료) |
| a | 객체 접근 규칙: `access_mode`·`object_access_rule`·`knowledge.access.manage`·감사·가시성 판정 함수(SQL)·직접 URL/목록/상세에 적용 | full, `impl-complex`(권한·유출 경계), `flags.permission` | 0 |
| b | `item_event_relation_record` + Item 쓰기 액션 입력(`relations[]`) + 상세 읽기 | full, 마이그레이션 | 0 |
| c | `search_document`·`search_outbox`·소비자·backfill·재색인 생성 포인터·운영 가시성 | full, 마이그레이션, `impl-complex` | 0, a(알림 대상), b |
| d | `SearchPort` 계약 + PG 어댑터 + `logKnowledge.search` 읽기(해석·방향·가시성·표시값·커서)·계약 스키마 | full, `impl-complex` | c |
| e | 평가 세트 + 부하·EXPLAIN 보고 — **구현됨**, 결과·미달·미구현 목록은 [results.md](results.md) | light(문서·스크립트) 또는 full(CI 포함 시) | d |
| f | 검색 화면 1개 + Item 편집 서랍의 «Event 관계 기록» 입력(구현됨, #1509; 확인된 검색 A·서랍 C) | full, `ux=required`, 시각 부분 `impl-complex-sol` high | d, 시안 컨펌 |
| g | 통합: 계약 E2E(권한 회수·방향·SW 구분·Draft 미노출·backfill 중 표시), `.planning` 줄, 소유 문서 갱신 | full | a–f |

병렬: a∥b, e는 d 뒤 f와 병렬. 화면이 한 개라 «메뉴 3개 이상 연속 신규» 확인 대상이 아니다. f의 시안은 소유자가 2026-11-08 검색 A·서랍 C로 확인했다. 화면 주소·입력·상태·합성 검증 경로는 [메뉴 화면 계약](../../../../menus/log-dev/log-knowledge/docs/search.md)이 소유한다.

## 8. 반례와 대응

| 위험 | 대응 |
| --- | --- |
| `A before B` Item이 `B before A` 질의에 나옴 | 방향은 구조화 기록에서만, `after`는 입력 때 뒤집어 한 행으로. 반대 방향은 기본 꺼진 별도 구역(§4.2) |
| 본문 문장 «B 전에 A가 아니다»(부정)를 방향으로 읽음 | 본문은 방향에 쓰지 않는다. 기록이 없는 Item은 방향 일치에 오르지 않는다(§3.1) |
| `expected`가 관찰된 결함처럼 상위에 | `observed`만 1단계, `expected`는 2단계 + «명세상 기대» 표시 |
| 같은 Event 이름의 다른 SW Item이 합쳐짐 | 소유자별 각자 행. `confirmed` 개념 매핑으로만 후보 확장(이유 표시) |
| 제안(`proposed`) 개념 매핑으로 동치 검색 | 쓰지 않음 |
| 제목이 같은 다른 Item 병합 | 병합은 `item_id` 안에서만, 관련은 링크 |
| 미승인 Draft·Validator 후보가 검색에 | Draft는 별도 테이블이고 색인은 발행 Revision에서만 만든다. 검증: 발행 전후 테스트 |
| 권한 회수 뒤 검색·자동완성에 남음 | 가시성은 조회 때 현재 규칙으로 판정, 색인에 ACL 없음(ADR-0124). 회수는 다음 요청부터 |
| 총 건수·«n건 가려짐»으로 존재 유추 | 정확 건수 없음, 가려진 건수 비공개, 상한 표시만 |
| 상위 Model 제한 후 하위 허용으로 우회 | 거절 우선 상속, 하위 허용은 상위 제한을 못 푼다 |
| 제한된 Item의 제목이 «관련 Item» 링크·유사 Item에 노출 | 링크 대상도 3단계 판정을 거침 |
| 오래된 알림이 새 Revision 문서를 덮음 | 알림은 페이로드 없음, 처리 때 현재 값을 읽고 `source_row_version` 가드 |
| 색인 지연 동안 옛 본문이 결과에 나옴 | 표시는 최신 Revision을 live로 읽음. 색인은 후보 찾기에만 쓰고 `indexLag` 칩 |
| 새로 발행한 Item이 바로 안 나옴 | 알려진 한계(수 초). 빈 결과 문구에 «방금 발행한 Item은 잠시 뒤 검색됩니다», 목록 화면에는 바로 보임 |
| outbox 장애로 영구 누락 | `dead` 건수 가시화 + requeue + 전체 재색인(새 생성) |
| 질의 문자열이 감사·이용 이벤트로 새어 나감 | 질의 원문은 기록하지 않는다. 길이·필터 키·결과 유무만([ADR-0020](../../../adr/0020-usage-events-identity-fields-only.md) 정신) |
| 검색 결과 캐시가 다른 사용자에게 | 서버 응답 캐시를 두지 않는다. 클라이언트 캐시는 기존 Kernel 쿼리 키(사용자별, 권한 변경 시 무효화)를 따른다 |
| 한국어 질의가 FTS 기본으로 안 맞는데 «되는 것처럼» 보고 | 평가 세트 수치를 보고서에 적고, 유형별 미달은 미달로 쓴다 |
| `pg_trgm`이 운영 DB에 없음 | bootstrap에서 설치하고 migration은 존재를 확인(없으면 지시문과 함께 실패, 0042와 같은 방식) |

## 9. 미구현 목록 (다시 여는 조건)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| 팀·역할 주체의 접근 규칙(§3.4) | `core.teams`는 멤버십 테이블이 없는 스키마 자리뿐이라 현재 projection을 읽을 수 없다. 규칙의 주체는 Actor만 | Core에 팀 멤버십 projection이 생김 |
| 접근 규칙 관리 화면 | 노드 a는 API만(화면 없음). 관리 UI는 시안 컨펌이 필요 | 소유자가 관리 화면 범위를 정함 |
| C7 숨은 코드의 충돌 응답 차단 — **미구현** | 생성·코드 변경의 `duplicate` 및 import의 `taken` 응답이 숨은 Model/SW 코드가 사용 중임을 확인해 준다. 전역 고유키를 유지하면서 응답·쓰기 선행 권한을 어떻게 바꿀지는 소유자 결정이 필요 | 소유자가 namespace 쓰기 권한 또는 충돌 비공개 응답 계약을 결정 |
| C12 연속 Item 번호의 숨은 건수 유추 차단 — **미구현** | 연속 Item 번호와 visible total을 함께 보면 숨은 Item 건수를 역산할 수 있다. 기존 `KI-n` 식별자 호환 정책은 소유자 결정이 필요 | 소유자가 비연속 번호·공개 표시 번호 등 식별자 정책 또는 이 채널의 허용 여부를 결정 |
| Knowledge/lifecycle 이벤트의 caller-aware 감사 projection — **미구현** | 제한된 객체 ID가 Admin에게도 노출되면 안 되므로 일반 Admin projection에서 제외. `core.audit_log` 원본은 보존 | 호출자의 현재 객체 접근 권한을 판정하는 projection 구현 |
| Evidence 원천 ACL을 검색에 반영 | 원본 소유자 판정이 어댑터 실사 전 | #1200/#1201의 원천 ACL 어댑터 확정 |
| 순서 외 관계 술어(`requires`·`excludes` 등) | 필요가 입증되지 않음 | 소비자가 두 번째 술어를 요구 |
| 본문 소급 해석으로 기존 Item의 방향 채우기 | 부정문·역순 문장에서 틀림. 외부 AI 금지 | 사람이 기록을 채우는 도구 요구가 있을 때(사람 확인 흐름 포함) |
| 한국어 형태소 사전·OpenSearch·사내 embedding/pgvector | 측정 전. embedding 비활성, 외부 호출 금지 | §6 측정에서 PG 기본이 목표 미달이고 사내에서 검증된 엔진이 있을 때 `SearchPort` 어댑터로 |
| 저장 검색(`knowledge_saved_query`) | 기존 플랫폼 Saved Views로 충분한지 미확인 | Saved Views가 이 필터를 표현하지 못한다는 확인([v0.6 §14-6](../log-knowledge-hub/design-v0.6-candidate.md)) |
| 정확한 총 건수 | 존재 유추 위험 | 가려진 건수를 못 알아내게 하는 방법이 있을 때 |
| 원본 로그 본문 검색 | 본문이 ACL 밖으로 나감 | [log-explorer §9](../log-explorer/README.md#9-미구현-목록-다시-여는-조건)의 조건 |
| 그림자 비교의 자동 승격 | 첫 교체 전에는 불필요 | 어댑터를 실제로 바꿀 때 |
| 후보 질의 지연 p95 ≤ 300 ms 미달 — **미구현** | 10만 Item 합성 부하에서 목표를 두 자릿수 배 넘는다. 후보 문장이 가시성 판정을 전체 Item에 먼저 돌린 뒤 적중으로 좁힌다([results.md](results.md)). 이 슬라이스는 어댑터·순위를 바꾸지 않는다 | 소유자가 어댑터 성능 노드를 잡음. `search:load`를 0/5/30 %에서 다시 돌려 p95 ≤ 300 ms 요구 |
| 색인 표 `ANALYZE` — **미구현** | 새 표에는 통계가 없어 같은 질의가 440건 말뭉치에서도 수 초 걸린다 | 첫 운영 backfill 전 또는 backfill 작업에 후처리 단계가 생길 때 |
| camelCase 질의가 snake_case 본문을 못 찾음 — **미구현** | 질의 단어가 원형 소문자(`gaslineclog`)로만 남아 문서의 분리 토큰과 맞지 않는다 | 소유자가 `search-normalize`의 변형 접기를 결정 |
| 글자 순서가 바뀐 오타 미적중 — **미구현** | trigram 유사도가 기본 문턱 아래. §4.2: 자동 교정 없음 | 실제 본문 오타 측정에서 놓치는 비율이 문제로 확인됨 |
| alias 질의 유형·승인 alias 단계(§4 5단계) — **미구현** | 코드에 alias가 없다(D8) | alias 노드 착수 |
| 실제 한국어 본문 품질 측정 — **미구현** | 합성 어휘 6개의 1.000은 조사·복합어·띄어쓰기를 말해 주지 않는다 | 소유자가 비공개 환경에서 승인된 샘플 허용(§6) |
| HTTP 경로·단일 viewer 풀 지연 측정 — **미구현** | 부하 스크립트는 읽기 함수만 재고 viewer 하나를 쓴다 | 어댑터 성능 노드에서 경로 단위 부하 점검을 더함 |
| 재시작 뒤 낡은 커서 이어받기 — **미구현** | 커서는 질의·Actor에 묶인 HMAC이고 프로세스 재시작·다른 인스턴스에서는 거절되어 첫 페이지부터 다시 조회한다(§4). 영속 키가 없다 | 운영에서 재시작 중 페이지 이동 실패가 문제로 보고됨 |
| 다른 메뉴 쓰기 직후 열린 검색의 자동 갱신 — **미구현** | 무효화 선언은 같은 메뉴 endpoint만 허용한다. 재진입·재실행으로 새 값을 읽는다 | Kernel이 메뉴 간 무효화 선언을 허용 |

## 10. Open Decisions

| ID | 결정 | 상태 |
| --- | --- | --- |
| Q1 | 객체 접근 규칙 범위(§3.4): Model·SW·Item 세 단계 + 거절 우선 상속을 이 슬라이스(#1199)에 넣을지 | **결정됨**: 넣는다(소유자 2026-11-08, 추천대로). 없으면 «ACL-aware»가 비어 있다 |
| Q2 | Item 편집에 구조화된 «Event 관계 기록»(§3.1) 입력을 추가할지 | **결정됨**: 추가한다(소유자 2026-11-08, 추천대로), ADR-0125 |
| Q3 | 검색 진입점: 새 메뉴 «통합 검색» 1개 vs 기존 «전체 기술 Item» 목록의 검색창 확장 | **결정됨**: 새 메뉴 1개(소유자 2026-11-08, 추천대로). 목록은 거르는 표, 검색은 순위·이유가 있는 결과라 모양이 다르다 |
| D4 | 색인 갱신 방식 | 결정(레인): outbox(페이로드 없음) + pg-boss 소비자. 새 인프라 없음. 이유 §5.1 |
| D5 | 질의 해석 | 결정(레인): 평범한 텍스트가 기본, 방향은 명시 조건·닫힌 연산어일 때만, 해석 칩을 항상 표시, 외부 AI 없음 |
| D6 | ACL 판정을 색인 열로 옮겨 속도를 얻을지 | 측정 전 보류. 먼저 live 판정을 EXPLAIN으로 잰다. 못 미치면 «색인 열은 후보를 좁히는 힌트일 뿐 최종 판정은 live»로만 허용하고 그 변경은 ADR-0124 개정 |
| D7 | 상한 값(자동완성 12, 페이지 최대 50, 건수 상한 100+, drain 배치 100, 재시도 8, 세대 보존 7일, 기록 20줄) | 이 값으로 시작, 측정 후 조정 |
| D8 | alias 승인 권한 | 결정(레인): 개념 매핑과 같은 capability(`knowledge.spec.publish`)로 시작, 새 capability 없음. alias는 Model 또는 SW 범위를 갖고 범위 밖으로 번지지 않는다 |
| D9 | 반대 방향 결과 | 결정(레인): 기본 꺼진 별도 구역 |

## 11. 수용 매트릭스 (S-g, #1510)

테스트 경로는 `apps/platform-api/src/modules/log-knowledge/__tests__/` 아래 `search-read`(`search-read.integration.test.ts`)·`search-index`·`access`·`search-eval/`이고, E2E는 `apps/platform-e2e/tests/features-log-knowledge-search.spec.ts`다. «mock»은 `menus/log-dev/log-knowledge/src/mock/search.test.ts`와 화면 단위 테스트다. E2E는 mock 서버만 보므로 권한 회수·Draft·색인 상태의 실제 판정은 백엔드 통합 테스트가 증명한다.

| 기준 (§1·§8) | 증명하는 테스트 |
| --- | --- |
| 방향: `A before B`와 `B before A`가 다른 결과, `after`는 같은 행 | search-read «`B after A` finds exactly what `A before B` finds…»; E2E «방향 주소를 복원하고 반대 방향을 별도 구역으로 열며 해석을 끈다» |
| 반대 방향은 기본 꺼진 별도 구역, 혼합 질의도 | search-read «the relation kind picks observed or expected records; the opposite direction is an opt-in separate section», «C3: mixed adapter plans exclude reverse-only Items», «C3: the endpoint keeps mixed text/relation reverse-only results…» |
| 부정·한쪽만 있는 문장은 방향 없음, 기록 없는 Item은 방향 일치에 오르지 않음 | search-read «negated or one-sided text is plain text…», «an Item without records is never matched by direction…» |
| `observed` 1단계, `expected` 2단계 + «명세상 기대» | search-read «a forward query returns observed (1) before expected (2…» |
| SW 구분: 같은 Event 이름의 다른 소유자는 각자 행, 합치지 않음 | search-read 같은 테스트(소유자별 행), «C2: concept direction preserves mapped Model identity for %s owners» |
| `proposed`·`rejected` 개념 매핑은 쓰지 않음, 확정은 즉시 반영 | search-read «only a confirmed equivalent mapping widens the match…» |
| 같은 제목의 다른 Item은 병합하지 않음 | search-read «Items with the same title in different owners stay separate rows…» |
| 권한 회수는 다음 요청부터: 결과·자동완성·관련 Item 건수 | search-read «revoking a right removes the Item from the same query, the suggestions and the related-Item count…»; access «an allow rule shows a restricted item; the next request after a revoke hides it again» |
| 상위 제한은 하위 허용으로 못 푼다 | search-read «a restricted parent hides its children…»; access «a restricted model hides its SW and items…» |
| 숨김 = 없음: 같은 응답 모양 | search-read «a hidden owner filter and a nonexistent one answer byte-identically…», «the endpoint answers a session; … hidden and nonexistent owners answer the same» |
| 정확한 총 건수 없음, 숨은 Item은 `capped`에 안 셈 | search-read «the response has no exact total; `capped` ignores hidden Items…» |
| Admin·서비스 Actor에 읽기 우회 없음 | access «Admin has no read bypass…»; search-read «a service Actor reads only through a token that carries workspace.read…» |
| Draft·Validator 후보는 색인·결과에 없음 | search-read «a Draft (create or revise proposal) is never indexed and never returned…» |
| 발행 해제(보관)는 즉시 사라지고 색인에서 지워짐 | search-read «display is read live…»(보관 단계); search-index «deletes the document when the Item is no longer published» |
| backfill 중 표시: 가시 범위 진행률, 숨은 Item이 힌트를 못 바꿈 | search-read «the index hint is a lag age and a whole percent…», «C1: hidden pending changes…», «C1: hidden backfill Items and operational counters…»; search-index «backfills in keyset batches, resumes…» |
| 색인 지연 중 옛 본문이 나오지 않음 | search-read «display is read live: during index lag…» |
| 오래된 알림·중복 알림이 새 문서를 덮지 못함 | search-index «does not let a stale build overwrite a newer document», «merges duplicate notifications…» |
| outbox 장애: `dead` 가시화·requeue | search-index «backs off, goes dead at the attempt cap…», «writes the outbox from the access writer… (real server)» |
| 키셋 커서 안정, 다른 사용자·workspace·변조 커서 거절 | search-read «keyset pages are stable…», «C4: %s cursors are refused…» |
| 질의 원문이 감사·이용 이벤트에 없음 | search-read «the query text is not written to the audit log or the usage events» |
| 색인에 ACL·발췌·근거 열 없음, `pg_trgm` 확인 | search-index «holds no ACL, excerpt or 지식 근거 column», «migration asserts pg_trgm…» |
| 한국어·유형별 품질, 방향 반례 0 | search-eval `search-eval.integration.test.ts`; 수치는 [results.md](results.md) |
| 화면: 해석 칩·반대 방향 구역·Item 이동·관계 서랍 | E2E 위 두 테스트; mock `search.test.ts`, `KnowledgeSearch.test.tsx` |

증명이 없는 기준: «새로 발행한 Item이 바로 안 나옴» 안내 문구는 알려진 한계이고 문구 검사를 따로 두지 않는다. 서버 응답 캐시를 두지 않는다는 것은 구현에 캐시 계층이 없음으로 확인하며 테스트가 없다. p95 ≤ 300 ms는 미달이고 §9에 있다.
