# 통합 검색과 Event 관계 기록 (#1509, S-f)

화면 기준은 소유자가 2026-11-08 확인한 검색 A(선택기 줄)와 Item 편집 C(접힌 요약)다. 수용 매트릭스는 [검색 설계 §11](../../../../docs/design/features/log-knowledge-search/README.md#11-수용-매트릭스-s-g-1510)이다. 검색 의미·권한·순위는 [검색 설계](../../../../docs/design/features/log-knowledge-search/README.md) §4와 [API 계약](../../../../docs/architecture/platform-api/api/log-knowledge.md#knowledge-search-1507-s-d)이 소유한다. 이 문서는 메뉴의 화면 조합과 주소를 소유한다.

## 화면과 주소

- `log-knowledge-search`, `/log/knowledge/search`: `logKnowledge` 그룹 첫 메뉴이자 기본 진입점. 읽기 권한은 `platform:view`, 전역 Context를 검색 조건으로 사용하지 않는다.
- `q`: 검색 원문(200자 이하). 검색 버튼 또는 Enter로 적용한다. 입력에서 제안 버튼으로 포커스를 옮길 때는 적용하지 않는다.
- `relation`: JSON 문자열 `{ "source": "CHAMBER/STEP_PROCESS", "predicate": "before", "target": "CHAMBER/PROCESS_START" }`. `after`도 허용하며 서버가 정방향으로 돌려준다. 종류는 `kind=all|observed|expected`, 반대 방향은 `opposite=true`일 때만 보인다(기본 꺼짐).
- 해석 칩은 서버가 돌려준 방향을 항상 보인다. ×를 누르면 명시 관계를 지우고, 원문이 닫힌 순서 연산 질의이면 연산어를 빼 평문 검색으로 바꾼다. 그래야 같은 원문이 즉시 다시 방향으로 해석되지 않는다. 필터 초기화는 종류·반대 방향도 기본값으로 돌린다.
- 주소가 잘못되면 `PageKeyWarning`으로 문제 키와 복구 버튼을 보인다. 키셋 커서는 주소에 저장하지 않는다. 더 보기는 같은 질의의 다음 페이지를 붙이며 각 페이지도 Kernel 조회 수명주기를 따른다.

검색 줄 → 순서 검색(도움말, Event A/먼저·나중/Event B/종류/순서 검색 버튼) → 방향 해석 칩 → 결과 카드 순서다. `PlatformPage`, `SearchInput`, `Combobox`, `RadioGroup`, `Select`, `ListToolbar`, `ObjectRow`, 기존 소유·유형·상태 배지를 조합한다. 검색 선택기는 `density="compact"`, Event 키는 `font="mono"`다. 이 화면의 ObjectRow는 비어 있는 선행 셀을 숨겨 들여쓰기를 남기지 않는다.

결과는 Item별 한 행이다. 제목과 KI-n은 상세로 이동하고 `returnTo`로 검색 주소를 보존한다. 소유 모델/SW, 유형, 발행·검증·처리 세 축, 일치 이유, 가시성 판정을 통과한 관련 Item 링크와 최신 발췌를 보인다. 반대 방향은 본 결과와 별도 구역이다. 정확한 총건수·필터별 건수·페이지 수는 표시하지 않는다. `hasMore`의 «더 있음», `capped`의 «100건 이상», 가시 관련 Item 수만 사용한다.

첫 화면과 결과 없음에는 «검색 결과 · 더 있음» 제목을 두지 않는다. 결과 없음은 «방금 발행한 Item은 잠시 뒤 검색됩니다»를 보인다. 조회 중·오류/재시도도 별도로 처리한다. `indexLag.backfill.state=running`이면 정수 퍼센트로 «색인 중 n%»를 보이고 N/N을 표시하지 않는다. `lagSeconds`가 있으면 결과 행에 색인 지연을 보인다. 이 힌트는 특정 행이 아니라 API가 제공하는 가시 범위 전체의 지연 힌트다.

검색과 제안은 `useMenuQuery`를 사용하므로 사용자·권한 세대별 쿼리 키와 이전 응답 폐기를 따른다. 검색 원문을 이용·감사 이벤트로 보내는 코드는 없다. Item 쓰기는 기존 같은 메뉴의 읽기만 무효화한다. 다른 메뉴인 검색은 새 마운트에서 다시 읽으며, 같은 검색 버튼을 다시 누르면 명시적으로 새로 조회한다.

## Item 편집 서랍

근거 추가 아래, 대상 선택 위에 «Event 관계 기록»을 둔다. 비워도 저장할 수 있다. 각 행은 관계 번호·종류·순서 문장·수정/빼기로 시작하며 수정하면 종류, 먼저/나중, Event A/B, 입력 접기를 보인다. 목표 Event와 «보다»는 한 묶음으로 배치한다. 20개에서 추가만 비활성화하고 빼기는 유지한다.

소유 모델의 발행 명세, SW Item이면 해당 SW의 실효 명세를 읽어 키를 제안한다. 직접 입력한 키도 선택할 수 있고 명세에 없는 키는 별도 칩으로 보인다. 명세 조회 실패를 명세에 없는 키로 판정하지 않으며 재시도와 직접 입력 안내를 보인다. 소유자 선택이 바뀌어도 작성 중인 키를 지우지 않고 새 명세 기준으로 다시 표시한다.

생성은 `relations[]`를 보낸다. 리비전 수정은 처음 읽은 기록과 달라졌을 때만 배열을 보내며, 마지막 행을 지우면 `[]`로 대체한다. 바꾸지 않은 기록은 생략하여 서버가 기록 당시 `resolved`를 보존하게 한다. `after`를 뒤집는 책임은 서버에 있다. 미완성·자기 관계·중복·20개 초과는 쓰기 전 확인하며 서버 오류는 해당 관계 행에 표시한다. 파생 작성은 API가 관계 입력을 받지 않아 이 편집기를 보이지 않는다.

## 합성 mock 검증 주소

모든 상태는 같은 앱과 동일한 화면 코드를 사용한다. 기본 경로는 `/log/knowledge/search?v=1`이다.

| 상태 | 추가 query |
| --- | --- |
| 첫 화면 | 없음 |
| 방향 결과 | `q=STEP_PROCESS%20before%20PROCESS_START` |
| 일치 이유 네 종류 | `q=mock-reasons`(표현 검증용 합성 fixture, 개념 확장·순위 구현 아님) |
| 반대 방향 | 위 주소에 `opposite=true` |
| 결과 없음 | `q=UNSEEN_A%20before%20UNSEEN_B`(방향 칩 유지), 또는 `q=mock-none` |
| 색인 진행 | `q=mock-indexing`(48%, 지연 칩) |
| 오류 | `q=mock-error` |
| 조회 중 | dev 응답 시나리오 «느림»에서 검색 실행 |
| 관계 요약/편집 | 방향 결과의 KI-1 → 수정 → Event 관계 기록(수정 버튼으로 펼치기) |

mock은 기존 30개 Item에 합성 관계를 얹고 생성·리비전 변경을 같은 저장소에서 검색한다. 운영 검색 순위·ACL·인증 커서의 대체 구현이 아니다. 명세에 없는 키를 포함해 상세 읽기와 편집 저장을 왕복할 수 있다.

## 남은 제한

- 열린 검색의 다른 메뉴 쓰기 직후 자동 갱신은 미구현이다. 재진입 또는 같은 검색의 재실행으로 새 값을 읽는다. 사유와 재개 조건은 [검색 설계 §9](../../../../docs/design/features/log-knowledge-search/README.md#9-미구현-목록-다시-여는-조건)가 소유한다. 색인 반영 자체의 지연은 별개이며 API의 `indexLag`로 안내한다.
- 저장 검색, 새 ranking/adapter, 오타 교정 및 제안 endpoint를 넘는 자동완성은 이 화면 범위 밖이다. 재개 조건은 [검색 설계 §9](../../../../docs/design/features/log-knowledge-search/README.md#9-미구현-목록-다시-여는-조건)가 소유한다.
