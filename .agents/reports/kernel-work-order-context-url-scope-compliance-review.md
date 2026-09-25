# Compliance review — Kernel Context/URL/Scope work order & prototype

Status: **Compliance-only review**, 2026-09-24. 리뷰 대상은 수정하지 않았다(코드·work order·원본 계약 문서 무변경). 발견 사항만 기록한다.

- 리뷰 대상: `.agents/reports/kernel-work-order-context-url-scope-draft.md`, `prototypes/kernel-context-url-scope/` (context_url.py, fixture_server.py, test_context_url.py, demo.py, README.md, verification.log)
- 기준 revision: HEAD `41067ab2a4421366a42425c9cf56c8e27e0ae116` (work order가 인용한 revision과 일치). `git diff HEAD -- docs CONTEXT.md PLATFORM_REQUIREMENTS.md` 결과 없음 → 원본 계약 문서 무변경 확인.
- 대조 원본: `AGENTS.md`, `docs/06_platform_ui_contract.md` §4–6(6.1–6.4), §8, §17–19, §22, §26, §28–29, `CONTEXT.md`, `docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md` Q1·2·5·10, `PLATFORM_REQUIREMENTS.md` Open Questions, ADR-0002 / 0004 / 0005.

## 전체 판정

**PASS-WITH-MINOR-ISSUES — BLOCKING 0건, MINOR 3건, 관찰(비결함) 4건.**

Decided 규칙(room_name Scope 축·Line 독립, EquipmentID 전역 유일·Site 비추론, Condition live / Selection 고정 2계층, URL·scopeId는 권한 증명 아님, Group은 권한을 부여하지 않음, 복귀 시 선택 비변경·재검증)과 충돌하는 동작은 발견하지 못했다. MINOR 항목은 모두 이 로컬 prototype slice를 막지 않으며, codec을 공유 v1 스키마로 승격하기 전에 해결하면 된다.

## 1. 실행 재확인 (직접 실행, 저장소 루트, Python 3.9.6)

```text
$ python3 -B -m unittest discover -s prototypes/kernel-context-url-scope -p "test_*.py" -v
... (11개 테스트 모두 ok)
Ran 11 tests in 0.006s
OK
EXIT CODE: 0

$ python3 -B prototypes/kernel-context-url-scope/demo.py
INPUT: /prototype/context?scopeId=scope-photo&roomNames=PHOTO&equipmentGroup=...&selectedEquipmentIds=B&selectedEquipmentIds=A&selectedEquipmentIds=A
CANONICAL: /prototype/context?v=1&scopeId=scope-photo&roomNames=PHOTO&selectedEquipmentIds=A&selectedEquipmentIds=B&equipmentGroup=%7B%22axis%22%3A%22stgroup%22%2C%22id%22%3A%22SG-photo%22%7D
ROUND TRIP: PASS
DETAIL C: /prototype/equipment/C?v=1&...&selectedEquipmentIds=A&selectedEquipmentIds=B&...
REFERENCE UNAPPLIED: ['room_names', 'condition', 'selection']
RETURN FIXED SELECTION: ['A', 'B']
CURRENT LIVE CONDITION: {'mode': 'live', 'evaluatedAt': '2026-09-24T09:05:00+09:00', 'currentEquipmentIds': ['B', 'C'], 'source': 'local-fixture'}
RETURN AFTER REVOKED GRANT: forbidden scope_forbidden
ALL DEMO ASSERTIONS: PASS (local fixtures only; no analytical query)
EXIT CODE: 0
```

- 결과: **테스트 11 passed / 0 failed / 0 errors**, 데모 exit 0. `verification.log`의 기록과 출력이 일치한다(테스트 이름·개수·데모 라인 동일).
- 추가로 scratchpad의 읽기 전용 probe 스크립트(프로토타입을 import만 함)로 테스트가 다루지 않는 20개 경계 입력을 실행했다. 결과는 아래 항목에 인용한다.

## 2. Work order 인용 정확성

| # | 항목 | 판정 | 근거 |
| --- | --- | --- | --- |
| C1 | 기준 revision `41067ab…` | PASS | `git rev-parse HEAD`와 일치, 원본 문서 diff 없음 |
| C2 | 06 Draft, §4–6, §6.1 집합/단일값/목적지 분리, §6.2 room_name Scope, §6.4 보존·버전·복귀 | PASS | 해당 절 내용과 일치. 06 상단 상태 `Draft` 확인 |
| C3 | §17 "URL은 권한 증명 아님" | PASS | §17 원문은 "URL Context는 보안 경계가 아니며 서버가 항상 재검증한다", "권한 증명이 아니다" 문구 자체는 §6.2에 있음. 의미 동일, 인용 허용 범위 |
| C4 | §18 평가 기준시각, §19 오류/권한/empty 분리, §22, §26 텍스트 오류, §28–29 | PASS | 각 절 존재·요지 일치 |
| C5 | §8 셸 슬롯·§26 시각/키보드 "비적용" 선언 | PASS | UI를 만들지 않으므로 타당. §8 "Slot 외 위치에 전역 UI 삽입 금지"와 충돌 없음 |
| C6 | CONTEXT.md 3개 절 | PASS | "물리 조직과 접근 범위 / 설비 식별 계층 / 공정 범위와 설비 그룹" 절 존재 |
| C7 | round-2 리뷰 Q1·2·5·10, "authoritative 아님" | PASS | 문서 상태 줄에 "authoritative 아님" 명시. 네 질문 답변과 work order 해석 일치 |
| C8 | PLATFORM_REQUIREMENTS OQ2·OQ7 | PASS | OQ2 = Scope 상속 세부 Open, OQ7 = 공개 계약 산출물 형식. "미결 입력에 의존하는 동작만 보류" 문장도 원문과 일치 |
| C9 | ADR-0002 Decided 2026-09-24 개정 / ADR-0004 / ADR-0005 Decided, 상속 Open | PASS | 세 ADR 상태·Consequences와 일치 |

## 3. 범위(포함/제외) 적합성

| # | 항목 | 판정 | 근거 |
| --- | --- | --- | --- |
| S1 | AGENTS.md 5갈래 중 검증 대상 명시 | PASS | "Kernel Context/URL/Scope 및 메뉴간 연결 검증. 화면 제작 아님" — AGENTS.md "메뉴 화면 착수 전 어느 갈래를 검증하는지 밝힌다" 충족. 새 메뉴·화면 없음 |
| S2 | 제외 목록(App Shell/Menu Registry/SSO/상속 정책/시간/지표/savedViewToken/Line 필터 등) | PASS | §6.2 상속 Open, §6.1 savedViewToken Deferred, §6.3 시간 계약을 건드리지 않음. `/prototype/*`를 capability 대역으로만 선언해 §5 Menu Registry를 사칭하지 않음 |
| S3 | Open 질문 처리(P0 권한 공급, P1 공개 스키마 승인) | PASS | 06 §6.2 상속 Open, OQ7과 일치. Decided 사항(room_name, 전역 유일 ID, 2계층)을 재질문하지 않음 |
| S4 | "Decided 계약 변경 필요 없음" 선언 | PASS | 아래 동작 검증에서도 Decided 규칙 변경이 필요한 충돌은 없었다 |
| S5 | §6.4 "프로토타입에서 무제한 조회를 허용하는 것은 거부" | PASS (관찰 O4 참고) | 시간축 분석 쿼리는 실행하지 않는다. Scope만 있을 때 fixture가 권한 room의 전체 설비 ID를 반환하지만 이는 분석 조회가 아니라 설비 ID 검증 대역이다 |

## 4. 동작 vs Decided 규칙

| # | Decided 규칙 (원본) | 코드 동작 | 판정 |
| --- | --- | --- | --- |
| D1 | room_name이 권한 축, Line 독립 (ADR-0005, 06 §6.2) | `fixture_server.py` 권한은 `allowed_rooms`만 사용, `line`은 어디서도 권한 판정에 쓰지 않음. A(L1)·B(L2) 모두 PHOTO로 허용(`test_room_scope_not_line_or_group_authority`) | PASS |
| D2 | roomNames는 Scope 안을 좁힐 뿐 권한 부여 아님 (06 §6.1) | 허용되지 않은 room은 `room_forbidden`; probe 17 `roomNames=PHOTOX` → forbidden | PASS |
| D3 | Group(Condition)은 권한을 부여하지 않음 (06 §6.2, ADR-0005) | Condition 후보는 `allowed_rooms` 내 설비로 먼저 제한. probe 8 makerModel Maker-X/Model-X → ETCH의 D 제외하고 `[A,B]`; probe 7 team Team-B → `[C]`(D 제외) | PASS |
| D4 | EquipmentID 전역 유일, ID로 Site 역산 금지, Site는 ID 사용 전 확립 (ADR-0004, 06 §6.1/§6.2) | scopeId 부재 시 DB 접근 전 `selection_required`, `siteConnection=None`(probe 11: 잘못된 ID가 있어도 조회 없음). Site 연결은 `scopes[scope_id]`에서만 결정 | PASS |
| D5 | scopeId 단일, 중복은 형식 오류, 무단/미지 Scope는 대체 없이 forbidden (06 §6.2, §6.1 단일값 중복) | `SINGLE` 중복 → `duplicate_singleton`; probe 12 미지 Scope → forbidden | PASS |
| D6 | URL은 권한 증명 아님, 매 요청 재검증 (06 §6.2, §17) | `request()`가 매번 `parse_url` 후 grant 재조회. 같은 URL을 bob에게 → forbidden. grant 철회 후 복귀 → forbidden | PASS |
| D7 | Condition live / Selection 고정, 자동 교집합·확장·대체 금지 (ADR-0002, 06 §6.4) | Selection이 있으면 `ids = set(selection)`; Condition 결과는 `conditionEvaluation`에만 표시. 멤버십 변경 후 Selection `[A,B]` 유지, Condition-only는 `[B,C]` | PASS |
| D8 | Condition은 한 축만, 축 간 조합·역추정 금지 (ADR-0002, 06 §6.1) | `set(obj) != {'axis', *FIELDS[axis]}`로 잉여 필드 거절, 중복 JSON 키 거절(중첩 포함, probe 14) | PASS |
| D9 | 결과에 평가 기준시각 표시 (06 §6.1, §18) | `conditionEvaluation.evaluatedAt`, `mode=live`, `source=local-fixture` — 가짜 Data Trust/coverage를 만들지 않음 | PASS |
| D10 | 목적지 ID와 Selection 분리, 복귀 시 선택 비변경 (06 §6.1, §6.4 분석으로 돌아가기, §22, 리뷰 Q5) | 목적지는 경로 segment, `context_link`가 Selection 유지. C 상세 후 복귀 `[A,B]`. `restore_context`는 출발 URL(미등록 키 포함)을 그대로 재파싱 | PASS |
| D11 | 집합 부재/공집합 표식/정렬·중복제거, trim·case·Unicode 정규화 금지, 빈 ID 오류 (06 §6.1 집합 키 정규화) | `None`/`()`/정렬 tuple 구분, 표식+ID 동시 → 오류, `equipmentIds=` → `invalid_id`, 코드 포인트 정렬, `é` vs `é`·`' A '` 보존 테스트 | PASS |
| D12 | 공집합은 나머지가 유효할 때만 empty, 미지원 메뉴는 empty로 만들지 않음 (06 §6.1) | 잘못된 Scope/room/ID/목적지가 있으면 empty보다 forbidden/error 우선. reference는 공집합을 미적용 보존하고 `ok` (probe 9) | PASS |
| D13 | `equipmentIds`↔`selectedEquipmentIds` 동등 별칭, 동시 입력 거부 (06 §6.4) | `alias_conflict`, 정규 출력은 `selectedEquipmentIds`, 별칭+표식 충돌도 거절(probe 13) | PASS |
| D14 | `v` 생략=1, 새 정규 URL은 `v` 명시, 미지원 v 전체 거부, 북마크 rewrite 금지 (06 §6.4) | 생략 시 1, serialize는 `v=1` 명시, `v=2`·`v=0`·`v=01`·`v=` 거절. 인바운드 URL은 변경하지 않고 새 링크에만 정규화 | PASS (MINOR M2 참고) |
| D15 | 미등록 키: 현재 URL에만 보존, 검증 조건으로 넘기지 않음, 다른 경로로 자동 복사 금지 (06 §6.4) | extras는 serialize에 보존, server는 무시, `context_link`는 `extras=()` | PASS |
| D16 | 등록 전역 Context가 미지원이면 URL 보존 + 미적용 표시 (06 §6.1, §6.4) | 이 profile의 3개 축(room/condition/selection)은 reference에서 `unapplied`로 보존. 그 외 등록 키는 `unsupported_profile`로 거절 | PASS (이 profile 범위) / MINOR M1 |
| D17 | 권한 없음 ≠ 데이터 없음, 오류에 correlation id, 원인/행동 텍스트 (06 §17, §19, §26) | `forbidden`/`empty`/`error` 분리, 모든 결과에 `correlationId`, ContractError 메시지에 교정 행동 포함 | PASS |

## 5. 발견 사항

### MINOR (non-blocking — 이 prototype slice를 막지 않음)

**M1. 범위 밖 등록 전역 키를 보존·미적용 대신 전체 거절한다.**
- 코드: `context_url.py` `OUTSIDE_PROFILE` → `unsupported_profile`. probe 3: `/prototype/reference?scopeId=scope-photo&from=2026-09-24T00%3A00%3A00` → `ContractError:unsupported_profile`.
- 충돌 문장: 06 §6.4 "**등록된** 전역 Context가 대상 메뉴에서 미지원이면 URL에 남기고 미적용으로 표시하며, 지원 메뉴로 복귀하면 재검증 후 적용한다." 및 §6.1 "미지원 Context는 조용히 버리지 않고 적용되지 않음을 표시한다."
- 판단: work order와 README가 "restricted v1 Candidate profile, 전체 v1 디코더 아님"으로 명시했고, 조용히 버리지 않고 fail-closed로 거절하므로 이 slice의 증명 대상(room/Condition/Selection/목적지)에는 영향이 없다. 다만 이 codec을 공유 v1 스키마/라우터로 승격하면 유효한 v1 북마크(`from`/`to`·`lotIds` 등 포함)를 거절하게 되어 §6.4와 직접 충돌한다. **승격 전에 해당 키를 파싱·보존·미적용 표시하도록 바꾸거나, P1 공개 스키마 승인 질문에 이 제한을 명시해야 한다.**

**M2. v≠1 URL에 v1 규칙을 먼저 적용해 오류 코드가 달라진다.**
- 코드: `parse_url`이 경로 판정·`SINGLE` 중복 검사를 버전 검사보다 먼저 한다. probe 1: `?v=2&scopeId=a&scopeId=a` → `duplicate_singleton`(기대: `unsupported_version`); probe 2: `/prototype/other?v=2` → `invalid_route`.
- 충돌 문장: 06 §6.4 "인바운드 URL은 그 버전 디코더로만 해석하며 … 미지원 `v`(미래 또는 sunset 이후)는 부분 추측 없이 전체 거부한다."
- 판단: 요청은 어쨌든 전체 거부되므로 보안·데이터 영향은 없다. 오류 코드/메시지가 사용자에게 "북마크를 고쳐라"로 오인될 수 있다는 점만 문제다(`unsupported_version` 메시지는 "do not rewrite the bookmark"). `v` 추출·검증을 다른 검사보다 먼저 하면 해결된다. 다음 라운드에서 고쳐도 된다.

**M3. 같은 Site DB 안에서 권한 밖 설비의 존재 여부가 드러난다.**
- 코드: `fixture_server.py`는 `equipment_not_found`(error)를 `equipment_forbidden`(forbidden)보다 먼저 검사. probe 6: 권한 밖 `D` → `forbidden/equipment_forbidden`, 없는 `ZZZ` → `error/equipment_not_found`.
- 관련 문장: 06 §17 "권한 없음과 데이터 없음은 구분한다", §6.4 "유효한 형식이지만 없거나 권한 없는 객체는 자동 대체하지 않는다." — 06은 권한 밖 ID의 존재 비공개 여부를 정하지 않았으므로 **계약 위반은 아니다**.
- 판단: 권한이 room 단위이고 같은 Site DB에 다른 room 설비가 함께 있으므로, 운영 권한 검증에서는 enumeration 경로가 된다. P0 "권한 공급·상속 규칙" 질문에 "권한 밖 ID를 not_found와 구분해 노출할지"를 함께 올리는 것을 권장한다. 로컬 fixture slice는 막지 않는다.

### 관찰 (결함 아님, 기록용)

- **O1.** `selection_required`(scopeId 부재)와 `selection_outside_room_filter`(Selection이 roomNames 밖이면 error)는 06에 정의되지 않은 Candidate 의미다. README가 `selection_required`는 §19 outcome enum 추가가 아니라고 명시했고, `selection_outside_room_filter`는 §6.4 "조용한 선택 변경 불허"와 일관된 fail-closed 선택이다. P1 공개 스키마 승인 때 함께 확정 대상으로 넣는 것이 좋다.
- **O2.** reference 경로는 미적용 Selection의 권한을 검증하지 않는다(probe 10: 권한 밖 `D`가 있어도 `ok`, `unapplied=['selection']`). §6.4 "지원 메뉴로 복귀하면 재검증 후 적용"과 일치하고 조회에 쓰지 않으므로 누출도 없다. 적합하다.
- **O3.** `serialize()`는 정규화되지 않은 `ContextState`(정렬 안 된 tuple 등)를 받으면 `parse_url(serialize(s)) != s`가 된다. docstring이 "parsed ContextState로 호출"을 요구하므로 계약 결함은 아니다. 공유 helper로 승격할 때 생성 시점 정규화를 검토하면 된다.
- **O4.** scopeId만 있고 Condition/Selection이 없으면 권한 room의 전체 설비 ID를 반환한다(`test_unknown_preserved_only_in_current_url`: `[A,B,C]`). 분석·시간 조회가 아니므로 §6.4 "프로토타입 무제한 조회 거부"와 충돌하지 않는다. 실제 서비스 연동 시에는 조회량 제한이 필요하다(OQ4 운영 수치).

## 6. Platform Done (§29) 대비 — work order 주장 범위 내

| §29 항목 | 판정 | 비고 |
| --- | --- | --- |
| 공통 계약 위에 올라가 있음 | PASS | 단일 codec + capability 선언, 같은 `parse_url`을 클라이언트/서버 대역이 공유(§6.1 "클라이언트 라우터와 서버 요청 검증은 같은 산출물을 소비") |
| 다른 메뉴와 Context 연결 | PASS | `context_link`/`restore_context`가 등록 전역 Context만 전달, 목적지 분리 |
| 권한/Scope 일관 | PASS | 모든 경로가 같은 서버 검증 경로 사용 |
| 공통 Loading/Error/Data Trust | 해당 없음(주장 안 함) | work order가 명시적으로 제외 — 과대 주장 없음 |
| Platform Component 추출 / Domain 책임 명확 | PASS | UI 컴포넌트 없음. 설비 행 매칭 로직은 fixture 대역에 있고 Kernel codec에는 domain 로직이 없음(§4 "Kernel이 소유하지 않는 것" 준수) |

## 7. 요약

- BLOCKING: **0건**
- MINOR: **3건**(M1 범위 밖 등록 키 거절, M2 버전 검사 순서, M3 권한 밖 ID 존재 노출)
- 전체 판정: **PASS-WITH-MINOR-ISSUES**
- 재실행: 테스트 11 pass / 0 fail, 데모 exit 0 — 모두 `verification.log`와 일치.
