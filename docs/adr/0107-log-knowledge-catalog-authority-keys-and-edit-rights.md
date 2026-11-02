# 로그 지식 허브 카탈로그: 원천·코드 키·편집 권한

상태: **Decided (2026-11-02)**.
- 결정자: 사용자 — 2026-11-02, [#1192](https://github.com/hjung3113/analytics-platform/issues/1192). 코디네이터가 설계 v0.6 §12.1의 미결 중 P0(#1193–#1195)를 막는 세 항목에 추천안을 올렸고, 사용자가 추천안을 그대로 승인했다.

## 배경

로그 지식 허브 설계([v0.6](../design/features/log-knowledge-hub/design-v0.6-candidate.md))는 카탈로그(Vendor·Process·Model·SW) CRUD와 CSV/XLSX Import를 P0로 둔다. 그 앞에 세 가지가 미결이었다: 카탈로그의 원천, `code_key` 정규화와 유일성, 카탈로그를 고칠 수 있는 사람. 이 셋 없이는 #1193의 스키마도, #1194의 권한 검사도, #1195의 충돌 판정도 정할 수 없다.

## 결정

1. **원천은 허브 자신이다.** P0 카탈로그의 권위 원천은 `log-knowledge` 모듈의 카탈로그다. 회사 공식 기준정보와는 `knowledge.external_identity_map`의 매핑으로만 잇는다. 서로 다른 외부 키를 자동으로 합치지 않고, Import가 기존 행을 외부 값으로 조용히 덮어쓰지 않는다. 공식 마스터가 정해지면 우선순위는 새 ADR로 정한다. 이유: 지금 공식 원천이 없고, 원천이 생겨도 매핑 표만 있으면 내부 ID를 바꾸지 않고 옮길 수 있다.
2. **코드는 원문과 키를 따로 둔다.** 사람이 입력한 `code`(SW는 버전 문자열)는 원문 그대로 저장해 표시한다. 비교·유일성은 `code_key`(SW는 `version_key`)로 한다: 유니코드 NFKC → 앞뒤 공백 제거 → 안쪽 연속 공백 하나로 → 대문자(로캘 무관). 유일 범위는 Vendor `(workspace_id, code_key)`, Process `(workspace_id, code_key)`, Model `(workspace_id, vendor_id, code_key)`, SW `(workspace_id, model_id, version_key)`이다.
   - 비활성 행도 키를 쥔다. 같은 키로 새 행을 만들지 않고 기존 행을 다시 활성화한다. 이유: 비활성 행에 Item·Spec이 남아 있어 같은 키를 두 객체가 갖게 되면 Import와 검색이 헷갈린다.
   - 코드는 Update로 고칠 수 있다(감사 기록, 키 유일성 재검사). 내부 ID는 바뀌지 않는다.
   - Model의 Vendor 이동(재소유)은 P0에서 거절한다. 새 Model을 만들고 옛 Model을 비활성화한다.
   - 이유: 대소문자·공백·전각 차이로 같은 장비가 두 행이 되는 것이 실제로 가장 흔한 중복이다. 원문은 그대로 남아 표시 정보를 잃지 않는다.
3. **편집은 capability로 준다.** 카탈로그 읽기는 워크스페이스에 접근할 수 있는 모든 사용자에게 허용한다(객체 ACL은 #1197·#1199에서). 쓰기는 `knowledge.catalog.manage`(CRUD·비활성화·Model–Process 매핑)와 `knowledge.catalog.import`(Import 검증·해결·적용) 두 capability로 나눈다. Admin은 항상 갖는다. Developer는 기존 권한 요청·직접 부여 흐름으로 받는다. User는 받지 않는다. 둘 다 sensitive가 아니다. 새 Role Level은 만들지 않는다. 부여 범위(어느 scope 키에 거는지)는 #1194에서 기존 부여 모델을 보고 정하고, 그 결정을 이 ADR에 덧붙인다. 이유: 기존 Role Level·부여 흐름을 그대로 쓰면 권한 화면·감사가 따로 필요 없고, Import는 한 번에 많은 행을 바꾸므로 CRUD와 따로 줄 수 있어야 한다.

## 결정 3 보충: 부여 범위

두 capability는 워크스페이스 범위로 부여한다(`managed_system_id` 없음). 카탈로그가 워크스페이스 전체 것이고 `log-dev`는 Managed System이 아니기 때문이다. `adminModuleBypass: 'always'`, sensitive 아님. Developer는 기존 권한 요청에서 Managed System 없이 요청한다. 결정자: 코디네이터, 사용자의 2026-11-02 ADR-0107 승인 아래(#1193).

## 다른 안

- 공식 마스터가 정해질 때까지 카탈로그를 막는다 — P0 전체가 외부 대기가 되어 버렸다.
- 코드를 대소문자 그대로 비교한다 — `ab-100`과 `AB-100`이 다른 Model이 되어 버렸다.
- 비활성 행의 키를 풀어 재사용한다 — 남은 Item·Spec과 새 행이 같은 키를 가져 버렸다.
- 새 Role Level `CatalogEditor`를 만든다 — 설계 v0.6 §3.3이 capability 묶음으로만 쓰기로 했고, Role Level 추가는 enum·제약·도메인 검사를 함께 바꿔야 해서 버렸다.

## 남은 것

자기 승인, 서비스 계정, 명세 안정 키, Top View 계약 등 v0.6 §12.1의 나머지 항목은 해당 P1·P2 이슈(#1196–#1201)의 결정 게이트로 남는다.
