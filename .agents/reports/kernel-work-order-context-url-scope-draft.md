# Kernel work order — Context/URL/Scope prototype

Status: **Candidate implementation work order**, 2026-09-24. 계약 변경이 아니라 지정된 Kernel slice의 실행 증명이다.

## 원본과 revision

기준 checkout: `hjung3113/kernel-context-url-scope`, Git `41067ab2a4421366a42425c9cf56c8e27e0ae116` (작업 시작 시 clean). 아래 문서는 이 revision으로 고정하여 읽었다. 별도 revision 번호 없는 문서는 이 Git revision이 인용 버전이다.

| 원본 | 적용 절·결정 |
| --- | --- |
| `AGENTS.md` 전체 | 플랫폼 목적 5갈래 중 Kernel Context/URL/Scope 및 메뉴간 연결 검증. 화면 제작 아님 |
| `docs/INDEX.md` | 문서 역할·원본 우선순위 |
| `docs/06_platform_ui_contract.md` (Draft) | §4–6 Kernel/확장/Context, §6.1 집합·단일값·목적지 분리, §6.2 room_name Scope, §6.4 URL 보존·버전·복귀 |
| 동일 06 | §8 셸 슬롯, §17 URL은 권한 증명 아님, §18 평가 기준시각, §19 오류/권한/empty 분리, §22 Context Link, §26 텍스트 오류, §28–29 Platform Done |
| `CONTEXT.md` | 물리 조직과 접근 범위 / 설비 식별 계층 / 공정 범위와 설비 그룹 |
| `docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md` | 질문 1·2·5·10 및 문서 적용 판단. 합의 근거 기록이며 authoritative 아님 |
| `PLATFORM_REQUIREMENTS.md` | Open Questions 2·7; 미결 입력에 의존하는 동작만 보류 |
| `docs/adr/0002-stgroup-materializes-to-equipment-ids.md` | Decided, 2026-09-24 개정: Condition live / Selection 고정, 단일 축 |
| `docs/adr/0004-site-is-db-partition-not-column.md` | Site는 DB 연결 경계, 전역 유일 EquipmentID로 Site를 추론하지 않음 |
| `docs/adr/0005-scope-room-name-line-independent.md` | Decided, 2026-09-24: room_name 접근 축, Line 독립, 권한 상속 세부 Open |

## 목표 동작과 범위

URL → 정규화된 `ContextState` → URL → 동등 상태를 증명한다. Scope 요청과 검증 결과를 분리하고, 서버 대역은 매번 Scope를 조회해 Site 연결을 선택한 후 room_name·명시 EquipmentID·목적지 ID를 검증한다. Group은 권한을 부여하지 않으며 Selection을 변경하지 않는다. 고정 Selection 없이 Condition만 있으면 현재 결과를 평가한다.

포함: 순수 파싱/직렬화, v1 후보 스키마, Scope 선택 필요 상태, 집합/공집합/별칭 검증, 3종 Condition, 최소 capability 선언, Context Link·출발 URL 복원, 로컬 권한·멤버십 fixture와 실행 테스트/데모.

제외: App Shell/Menu Registry 구현·화면·브라우저 history 통합, 실제 SSO/API/DB/외부 그룹 공급, 권한 상속 정책, 기간·지표·Lot/PPID/Recipe·occurrence·page-owned 계약, 시간축 병합, 집계·Data Trust 서비스, savedViewToken, Line 필터, 메뉴/차트/공통 UI 컴포넌트. 최소 경로 `/prototype/context`, `/prototype/reference`, `/prototype/equipment/{id}`는 실제 메뉴가 아닌 capability 대역이다. 이 프로파일은 기간을 요구하지 않는 설비 ID 검증만 수행하며 분석 쿼리를 실행하지 않는다. 전체 플랫폼 v1 디코더 완성을 주장하지 않는다. Scope 및 room/Condition/Selection/목적지 이외 등록 키(`from`, `to`, `lotIds`, `ppid`, `recipeIds`, `metricId`, `metricVersion`, `savedViewToken`, `anchor`, `entityType`)는 별도 `unapplied_globals`에 값·반복 순서를 보존하고 Context Link로 전달하며 결과 `unapplied`에 키를 표시한다. 이 축의 의미 해석·값 검증·적용은 구현하지 않으며 지원 소비자에서 적용 전 검증해야 한다. 미등록 키는 기존 `extras`로 분리하여 현재 URL에서만 보존한다.

## Candidate 구현 선택

Python 3.9+ 표준 라이브러리만 사용한다. 현장 Python 3.9.6에서 추가 설치·네트워크 없이 `unittest`, `urllib.parse`, `json`으로 재현 가능하고 서버 검증 대역과 순수 codec을 분리하기 쉽다. 프론트엔드/플랫폼 언어 확정이나 FastAPI 구현이 아니다. 공개 산출물 형식·키·enum은 Candidate이며 이후 승인 시 공유 스키마로 이동할 수 있다.

- `v`: 생략=1, 신규 정규 URL은 `v=1`; 버전을 먼저 추출·검증하여 미지원 버전은 경로·중복·기타 v1 형식 오류보다 `unsupported_version`으로 우선 거절한다.
- `scopeId`: 단일 opaque ID. fixture가 Site 연결·명시 room 집합을 제공한다. ID의 문자열에서 Site/Line을 파싱하지 않는다.
- `roomNames`: 반복 키. 없음=추가 제약 없음, `roomSelection=none`=명시 공집합.
- `selectedEquipmentIds`: 반복 키. 없음=명시 선택 제약 없음, `equipmentSelection=none`=명시 공집합. 기존 `equipmentIds`는 v1 동등 별칭으로 등록하고 정규 출력은 새 이름을 사용한다. 두 이름 동시 사용은 거절한다.
- `equipmentGroup`: 단일 percent-encoded JSON 객체. 정확히 `{ "axis":"stgroup", "id":"SG-photo" }`, `{ "axis":"team", "id":"Team-A" }`, 또는 `{ "axis":"makerModel", "maker":"Maker-X", "model":"Model-X" }`. 혼합 축·잉여 필드·중복 JSON 키 거절. trim/case/Unicode 변환 없음.
- 목적지 EquipmentID는 경로 segment이며 Global Selection과 별도다. 원본 출발 URL은 호출자가 보관하고 복귀 helper에서 다시 파싱·검증한다. 임의 return URL로 리다이렉트하지 않는다.
- unknown query는 현재 URL에서만 쌍·중복 순서를 보존하며 적용하지 않는다. 다른 경로로 보낼 때는 등록된 전역 Context만 전달한다.

## 입력·출력·실패 조건

입력은 로컬 상대 URL과 서버가 소유한 현재 사용자/Scope/설비 fixture다. 파서는 `ContextState(scope_id, room_names, condition, selection, destination, extras, unapplied_globals)`를 출력한다. 집합은 `None`(부재), `()`(명시 공집합), 정렬·중복 제거된 tuple(명시 집합)로 구별한다. Unicode 코드 포인트 순서로 정렬하고 공백만 있는 ID는 거절하되 유효 ID의 공백·대소문자·유니코드 형태는 보존한다.

검증 대역 결과는 `outcome`, `code`, `correlationId`, `siteConnection`, `equipmentIds`, `unapplied`, `conditionEvaluation`를 가진다. 결과는 실제 분석 응답 스키마가 아닌 로컬 요청 검증 증거다. 그룹 평가가 있으면 fixture 기준시각과 live 의미를 명시하고 실제 Data Trust/coverage를 꾸며내지 않는다. reference 경로는 모든 세부 Context를 미적용 보존하고 선택 공집합으로 자신의 결과를 empty로 만들지 않는다.

| 입력/실패 | 기대 |
| --- | --- |
| scopeId 누락 | selection_required, 조회 없음·Site 추론 없음 |
| 알 수 없는/무단 Scope, 무단 room·설비·목적지 | forbidden, 자동 대체/부분 선택 제거 없음 |
| 선택 설비가 roomNames 제약 밖 | error, 고정 Selection 축소하지 않음 |
| 존재하지 않는 설비 | error, 자동 대체 없음 |
| 빈 ID·단일 키 중복·표식 충돌·혼합 alias·잘못된 percent/UTF-8/JSON·축 조합 | 명시적 ContractError, 조회 없음 |
| 미래 v + 다른 형식 오류 | unsupported_version으로 전체 요청 우선 거절 |
| 범위 밖 등록 전역 키 | URL 및 Context Link에 보존·미적용 표시; 조회조건에는 적용하지 않음 |
| 유효 Scope + 적용되는 명시 공집합 | empty; 다른 잘못된 입력의 검증은 생략하지 않음 |
| Condition 결과가 변경됨 | Condition-only 결과만 변경; 명시 Selection은 그대로 |

fixture의 명시 room grant는 부모 권한 상속 결정을 대신하지 않는다. Site별 dictionary는 연결 선택의 로컬 대역이며 Site 컬럼 필터가 아니다. 명시 ID 오류는 empty보다 먼저 검증한다.

## Platform Done 수용 사례

1. 출발 `/prototype/context?scopeId=scope-photo&roomNames=PHOTO&equipmentGroup=%7B%22axis%22%3A%22stgroup%22%2C%22id%22%3A%22SG-photo%22%7D&selectedEquipmentIds=B&selectedEquipmentIds=A&selectedEquipmentIds=A`를 읽으면 Selection=(A,B), PHOTO, StGroup Condition이 독립적으로 남는다. 정규 URL을 재파싱해 상태 동등성을 assert한다.
2. Selection 밖 C의 상세로 Context Link 이동 후 출발 URL로 복귀한다. 목적지는 C지만 Selection은 A,B 그대로다. Condition 최신 멤버가 B,C로 바뀌어도 A,B를 유지한다. Condition-only URL은 최신 B,C를 평가한다.
3. reference 대역에 넘긴 미지원 Condition·Selection·roomNames(공집합 포함)는 URL에 보존·미적용 표시된다. 출발 URL 복귀 시 재검증하고 권한이 철회되면 forbidden이며 A를 몰래 제거하지 않는다.
4. 같은 URL을 무권한 사용자에게 전달해도 forbidden. scopeId가 없으면 ID에서 Site를 찾지 않는다. room_name이 같은 설비의 Line이 달라도 동일 접근 축으로 판정한다.
5. 미래 버전/중복 scope/빈 ID/명시 공집합 충돌/혼합 축은 오류. 유효한 공집합은 empty이나 잘못된 Scope/목적지/ID를 숨기지 않는다.

§28–29 적용 경계: 재사용 codec/helper와 capability 선언, 권한 검증 경계 및 텍스트 오류를 검증한다. 실제 메뉴·셸·브라우저 back/forward·UI 접근성·Data Trust/Loading 통합 완료는 주장하지 않는다. UI를 만들지 않아 §8 슬롯과 §26 시각·키보드 항목은 이번 산출물에서 적용 대상이 아니다.

## 실제 차단 Open 질문 (우선순위)

**이 로컬 round-trip 증명을 막는 Open은 없다.** 아래는 이 slice를 실제 서비스로 채택할 때 차단되는 동작만 기록한다.

| 우선순위 | 질문 / 결정 주체 | 차단되는 동작 / 답변 전 가능한 일 |
| --- | --- | --- |
| P0 서비스 연동 전 | 실제 scopeId→Site 연결·room grant를 누가 어떤 권한 상속 규칙으로 공급하는가? 도메인·인증 담당 지정 필요 (06 §6.2, Requirements OQ2) | 운영 권한 검증; 이번에는 explicit grant fixture만 사용 |
| P0 서비스 연동 전 | 권한 밖 EquipmentID를 `not_found`와 `forbidden`으로 구분해 노출할 것인가? 같은 Site DB 내 enumeration 위험이며 06이 정의하지 않음; 보안·권한 정책 담당자 지정 필요 | 운영 객체 존재 노출 정책; 이번 fixture는 현재 구분 반환 동작 유지 |
| P1 공개 URL 확정 전 | 후보 키/표식/Condition JSON·별칭 이행과 공유 스키마 형식을 승인할 것인가? 플랫폼 계약 담당 지정 필요 (06 §6.1/6.4, Requirements OQ7) | 외부 북마크 호환 계약 확정; 이번에는 고립된 v1 Candidate codec 증명 |

room_name Scope·전역 유일 EquipmentID·Condition/Selection 두 층은 재질문하지 않는다. 시간 assertion/SSO/상태 서비스는 이번 비분석·로컬 slice를 막지 않아 질문 목록에 넣지 않는다. **플랫폼 레벨 결정 필요:** 기존 Decided 계약을 바꿀 필요는 발견하지 않았다. 서비스 채택 전 권한 공급·객체 존재 노출 정책과 공개 후보 승인이 남아 있다.

## 산출물·검증

구현 및 실행 방법/파일 목록: `prototypes/kernel-context-url-scope/README.md`.
검증 증거: `prototypes/kernel-context-url-scope/verification.log` (실제 테스트/데모 stdout·stderr). 원본 계약 문서는 수정하지 않는다. 후속 compliance-only reviewer는 이 work order와 프로토타입 디렉터리만 리뷰하면 된다.


## 리뷰 응답

- M1: 범위 밖 등록 키를 `extras`와 분리해 URL·메뉴간 전달에서 보존하고 `unapplied`로 표시하며, 축 의미 해석은 계속 제외한다. 등록 키 이동·복귀 및 리뷰의 단독 `from` probe 회귀 테스트를 추가했다.
- M2: 버전 추출·검증을 v1 검사보다 먼저 수행해 미지원 버전과 다른 오류가 동시에 있어도 `unsupported_version`을 반환하며 회귀 테스트로 확인한다.
- M3: 코드의 `equipment_not_found` / `equipment_forbidden` 구분은 유지하고, 같은 Site DB 내 존재 노출 정책을 담당자 지정이 필요한 P0 Open 질문으로 추가했다.
