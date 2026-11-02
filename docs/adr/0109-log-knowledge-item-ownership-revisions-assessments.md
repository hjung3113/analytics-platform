# 로그 지식 허브 Item: 소유·Revision·판단 이력

상태: **Decided (2026-11-02)**.
- 결정자: 사용자 — 2026-11-02, [#1197](https://github.com/hjung3113/analytics-platform/issues/1197) 최소판 범위 승인. 세부(컬럼·표 구성·권한 이름)는 코디네이터가 설계 v0.6 §4–5에 맞춰 정했다.

## 배경

「모델 탐색 → 모델 공통 프로파일 → 기술 Item 목록·상세」 슬라이스가 쓰는 Item 저장 구조를 정한다. 설계 v0.6의 Item 표(19–24)는 후보이고, 카테고리·태그·그룹·초안·검색은 이번에 넣지 않는다.

## 결정

1. **소유는 Model 또는 SW 하나이고 바뀌지 않는다.** `knowledge_item`은 `owner_model_id`와 `owner_software_id` 중 정확히 하나만 갖는다(`num_nonnulls = 1`). 합성 키 FK로 같은 워크스페이스의 행만 가리키고 `ON DELETE RESTRICT`다. 런타임 역할은 소유 컬럼에 UPDATE 권한이 없다(컬럼 단위 GRANT). 소유가 달라야 하면 새 Item을 만든다. 이유: 소유가 바뀌면 Item의 뜻이 바뀐다.
2. **Revision은 불변이다.** 제목·유형·관찰·기대·분석 의견·개선·변경 메모를 `knowledge_item_revision`에 쌓고 고치지 않는다(런타임 SELECT·INSERT만). Item은 `latest_revision_no`만 갖는다. 유형은 닫힌 목록 넷(이상 사례 `anomaly`, 확인 필요 `needs_check`, 동작 설명 `behavior_note`, 작업 기준 `guideline`)이다. 이유: 판단과 근거가 어느 Revision에 기댄 것인지 남아야 한다.
3. **판단은 발행과 따로, 두 축의 추가 전용 이벤트다.** 확인 상태(`not_checked`·`observed`·`verified`·`disputed`)와 처리 상태(`open`·`under_investigation`·`resolved`)는 `item_assessment_event`에 이전·새 상태, 근거 문장, 판단한 Revision, 행위자와 함께 쌓는다. Item 행의 두 상태 컬럼은 최신 이벤트의 투영이며 같은 트랜잭션에서 쓴다. 발행 상태(`published`·`archived`)는 별개 축이다. 이유: 「발행되었다」와 「검증되었다」는 다른 사실이다.
4. **근거는 포인터만 둔다.** `item_revision_evidence`는 출처 종류·출처 시스템·외부 id·버전·해시·위치(행/시간 범위)·메모(≤500자)만 갖고 내용을 복사하지 않는다. 추가 전용.
5. **파생은 새 Item이다.** 다른 SW에서 같은 현상을 확인하면 새 Item을 만들고 `item_link`의 `derived_from`(새 Item → 원본, 원본의 Revision 고정)을 잇는다. 새 Item은 `not_checked`·`open`으로 시작하고 근거를 복사하지 않는다. `related` 링크는 Revision 없이 잇는다. 링크는 추가 전용이고 자기 연결을 거절한다.
6. **표시 번호는 워크스페이스별 카운터다.** `item_no`(`KI-<n>`)는 `item_counter`의 한 행을 원자적 upsert(`INSERT … ON CONFLICT DO UPDATE … RETURNING`)로 올려 받는다. 같은 워크스페이스의 동시 발급은 이 행에서 직렬화되고(첫 Item도 같다), 롤백하면 카운터도 되돌아 빈 번호가 없다. `(workspace_id, item_no)` 유일 인덱스가 보조 장치다.
7. **쓰기 권한은 새 워크스페이스 capability `knowledge.item.publish`다.** Developer는 요청해 받고, User는 거절되고, Admin은 항상 갖는다(구현은 쓰기 노드). 메뉴 권한 `knowledge:item-publish`가 이 capability에 대응한다(`knowledge:catalog-manage` ↔ `knowledge.catalog.manage`와 같은 짝, 부트스트랩 규칙 `item-publish`). 이번 슬라이스의 읽기는 `platform:view`다.
8. **미룬 것.** 초안·검토, 카테고리·태그·수동 그룹, 근거 출처 ACL 재검사, 검색은 후속이다([backlog](../../.planning/backlog.md)).

## 결과

- 마이그레이션 0082가 여섯 표(Item 다섯 + 카운터)와 권한을 만든다. 모든 PK/FK는 `workspace_id`를 포함한다.
- 읽기 4종(모델 탐색·모델 프로파일·Item 목록·Item 상세)은 [api/log-knowledge.md](../architecture/platform-api/api/log-knowledge.md).
