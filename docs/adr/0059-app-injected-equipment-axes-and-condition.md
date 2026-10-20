# 설비 조회 조건은 앱이 주입한 축의 다중값 맵으로 하고 선택은 고정 ID로 유지한다

상태: **Decided (2026-10-21, 코디네이터 결정 — 사용자가 되돌릴 수 있음)**. 계약 결정이며 #552 1부는 맵·URL·주입 검증·기존 소비자 호환을 구현한다. 새 조회 포트·다중축 편집 UI·실제 이력 평가는 아래 미구현 항목으로 남긴다.

- 사용자 결정: #513의 2026-10-20 답변 — 축 목록은 앱이 주입하고, 모든 축에서 사용자가 그 시점 소속 / 지금 소속을 고르며, 이력 없는 축은 지금 소속만 허용한다.
- 코디네이터 결정: 2026-10-21 작업 지시의 아래 1–7. 사용자 결정에서 도출한 공개 표현·포트·호환 방침이며 사용자가 되돌릴 수 있다.

## 맥락

MARS 이관 웨이브 1(#557)의 조회 조건은 여러 설비 분류를 함께, 각 분류에서 여러 값을 골라야 한다. 닫힌 `ConditionAxis`와 단일축·단일값 URL, 옵션·설비 후보 전량 응답으로는 이를 담기 어렵다. 플랫폼은 앱의 분류 마스터나 저장소 구조를 소유하지 않으며 #513과 별도의 축 Registry를 만들지 않는다. 세부 Context·URL·조회 포트 계약의 원본은 [06 §6.1/§6.4/§11](../06_platform_ui_contract.md)이다.

[ADR-0002](0002-stgroup-materializes-to-equipment-ids.md)의 Condition/Selection 분리는 유지하고 단일축 제한과 과거 소속 미도입 부분을 대체한다. 선택의 재현성과 질의의 재평가를 분리하는 이유는 그대로다.

## 결정

1. **축은 앱이 주입한다.** 플랫폼은 안정 `id`, 표시 `label`, `membershipHistory: boolean`, 선택적 `dependsOn: axisId`만 아는 descriptor를 받는다. 닫힌 `ConditionAxis` union을 주입 descriptor에 대조 검증하는 axis-id 문자열로 바꾼다. 예를 들어 model은 maker에 의존할 수 있다. 축 추가가 플랫폼 릴리스를 요구하지 않게 하며 공개 API에는 MARS·SQL·SP 전용 어휘를 넣지 않는다. 실제 축과 값·소속 이력은 앱·서버가 공급한다.
2. **Condition은 axisId → 비어 있지 않은 value-id 배열의 맵이다.** 서로 다른 축은 AND, 같은 축 값은 OR다. 축 부재는 그 축 무제약이며 `[]`는 `invalid_condition` 파싱 오류다. 명시적으로 아무것도 고르지 않음은 Selection/roomNames/lineNames/prcGroups 표식으로 표현하며 Condition 축에 공집합 의미를 추가하지 않는다. Maker→Model은 선택한 Maker 안에서 서버가 Model 값을 평가하며 클라이언트는 값을 조용히 가지치기하지 않는다. 조합 결과가 없으면 빈 결과를 보이며 조건을 완화하지 않는다. 이는 조건 의도를 보존하고 서버를 평가의 최종 권위로 두기 위함이다.
3. **URL v1을 호환 확장한다.** `equipmentGroup`을 유지하고 새 표현은 배열 맵 `{"stgroup":["A"]}`이다. serializer는 배열 맵만 쓴다. 기존 v1 tagged object(`{"axis":"stgroup","id":"A"}` 등)는 그대로 읽어 같은 의미의 배열 맵으로 이행한다. 이를 구분하기 위해 축 id `axis`는 예약한다. 기존 `makerModel` 쌍은 `{maker:[X], model:[Y]}`로 손실 없이 읽어 Maker X AND Model Y를 유지한다(2026-10-21 구현에서 확정 — 코디네이터 결정, 사용자가 되돌릴 수 있음). `lineNames`/`prcGroups`는 `roomNames`와 같은 독립 전역 집합 키이고 Condition 축이 아니다(2026-10-21 사용자 정정 — 소유자 작업 지시 #552, #513). `roomNames`는 유지한다. `membershipBasis=asOf`를 선택적으로 더하며 부재는 `current`다. `asOf`는 Condition 또는 PRC 그룹이 있을 때만 유효하고, 사용한 모든 Condition 축이 이력을 지원해야 한다. PRC 그룹은 서버 소속 이력을 지원하는 전역 키다(소유자 #513). 기존 북마크의 의미를 유지하면서 새 축마다 전역 키나 URL 버전을 늘리지 않기 위함이다.
4. **소속 기준은 모든 사용 축에 공통이다.** 사용자는 “그 시점 소속 / 지금 소속”을 고르고 화면은 적용한 기준을 표시한다. 이력 없는 축이 하나라도 있으면 지금 소속만 가능하며, 전달된 `asOf`를 조용히 current로 바꾸지 않는다. 서버가 소속 이력을 공급한다. StGroup에도 같은 계약을 적용해 축마다 소속 기준의 의미가 달라지지 않게 한다. 기준시점·기간별 평가의 세부 입력은 아래 구현 항목에서 확정한다.
5. **옵션은 검색·커서 페이지 포트로 공급한다.** `listAxisOptions({ scopeId, axisId, query?, parents?: Record<axisId,string[]>, cursor?, limit }, signal)` → `{ items: {id,label}[], nextCursor: string|null }`를 둔다. 기존 소비자를 위해 `contextOptions`는 유지하되 deprecated로 표시하고, 모든 기존 소비자가 새 포트로 전환하고 호환 검증을 통과한 뒤 제거한다. 클라이언트 캐시 키는 모든 입력이며 입력 변경 시 이전 요청을 abort하고 오래된 입력의 늦은 응답을 버린다. 종속 옵션을 갱신해도 기존 선택을 몰래 삭제하지 않는다. 전량 로딩 비용과 응답 역전으로 잘못된 옵션을 보여 주는 문제를 피하기 위함이다.
6. **후보 검색과 고정 선택 확인을 분리한다.** `searchEquipment({ scopeId, roomNames, lineNames, prcGroups, condition, membershipBasis, query?, cursor?, limit }, signal)` → `{ items: EquipmentSummary[], nextCursor: string|null, total? }`로 검색·페이징한다. `EquipmentSummary`는 EquipmentID, room, 축별 값 맵이다. 별도 `resolveSelection({ scopeId, ids }, signal)`은 ID마다 `ok | forbidden | not_found` 상태를 반환하며 forbidden ID에는 상세 필드를 일절 주지 않는다. 현재 페이지나 결과 밖의 선택 ID를 버리거나 다른 ID로 대체하지 않고 UI가 결과 밖·권한 거부·없음 등의 이유를 표시한다. 서버는 매 요청 Scope → room grant → Condition → Selection 순서로 판정한다. 선택 확인 포트는 후보 페이지와 독립적으로 ID의 접근 가능 상태를 확인하며 Condition을 우회해 분석 대상을 허용하지 않는다. 대량 후보와 선택 보존을 함께 지원하면서 권한 밖 설비 메타데이터가 새지 않게 한다.
7. **단일축 소비자와 칸 소유권은 유지한다.** 기존 한 축·한 값도 배열 원소 하나로 같은 의미를 표현한다. 분석 보드 칸은 Condition 전체와 그 소속 기준을 함께 복사하고 이후에는 독립적으로 소유한다. [ADR-0049](0049-analysis-context-belongs-to-a-pane.md)의 칸 소유·명시적 일괄 적용은 바꾸지 않는다. 메뉴 전환·드릴·복귀에서도 미지원 축은 보존하고 미적용으로 표시한다. 축 확장이 기존 소비자나 보드 격리를 깨뜨리지 않게 하기 위함이다.

## Considered Options

- **닫힌 union에 축 추가**: 기존 타입은 간단하지만 앱별 축마다 플랫폼을 바꿔야 하고 도메인 마스터가 공통 계약에 스며든다. **앱 주입 descriptor(채택)**는 검증 책임을 늘리는 대신 확장과 플랫폼 중립성을 보장한다.
- **축마다 새 전역 키**: 개별 필터는 직접적이나 전역 키와 capability가 늘고 조합·전달 규칙이 분산된다. **하나의 Condition 맵(채택)**은 공통 AND/OR와 보존 규칙으로 축을 묶는다.
- **URL v2로 전환**: 디코더 경계를 분명히 하지만 기존 링크 전환 비용이 생긴다. **v1 호환 확장(채택)**은 기존 표현을 같은 질의로 읽고 새 출력만 배열로 정규화한다. 구형 런타임이 새 다중축 링크를 읽는다는 보장은 하지 않는다.

## v1 링크 이행

- `equipmentGroup` 부재는 `condition=null`(축 제약 없음), 맵의 축 부재도 그 축 무제약이다. `null`인 JSON/축 값, `[]`인 맵/축 값, 빈 ID는 유효한 Condition이 아니다. 빈 맵 `{}`는 제약 없음으로 정규화하고 serializer에서 키를 생략한다. 기존 ID 정규화 규칙을 따르되 ID 자체를 변형하지 않는다.
- 새 링크는 배열 맵만 쓴다(문자열 값 맵은 과거에 쓰인 적이 없어 받지 않는다). v1 `makerModel`은 maker/model 두 축의 단일값 AND로 이행한다(2026-10-21 구현에서 확정 — 코디네이터 결정, 사용자가 되돌릴 수 있음). 미주입 축은 검증된 질의로 사용하지 않고 오류를 표시한다. 주입됐지만 메뉴에서 미지원인 축과는 구별한다.
- v1 링크: 현재 `packages/contracts/src/url.ts`는 `{"axis":"stgroup","id":"A"}`, `{"axis":"team","id":"B"}`, `{"axis":"makerModel","maker":"X","model":"Y"}` tagged object를 받는다. 이 v1 링크도 기존 디코더 의미대로 읽어 새 내부 표현으로 이행한다. 앞의 둘은 해당 축의 단일값 배열로, Maker+Model은 `{maker:[X], model:[Y]}`로 이행해 두 ID와 AND 의미를 보존한다(2026-10-21 구현에서 확정 — 코디네이터 결정, 사용자가 되돌릴 수 있음).
- `v`는 올리지 않고 기존 링크의 `v`를 자동 변경하지 않는다. 신규 직렬화만 배열 맵을 쓴다. `equipmentIds` 별칭과 `equipmentSelection=none`, `roomSelection=none` 및 다른 기존 집합 표식의 의미는 유지한다. Condition 축의 `[]`는 이 표식으로 전환하지 않는다.

## 결과

플랫폼은 축의 구조·조합·전달·보안 경계를 소유하고 앱은 분류와 값·옵션·소속 이력을 공급한다. 전량 응답 의존을 줄이는 대신 커서·취소·캐시·선택 상태 확인과 legacy 디코더의 적합성 검사가 필요하다. Condition은 선언된 소속 기준으로 재평가하는 질의이고 Selection은 고정 집합이므로 같은 링크가 결과 숫자의 불변을 보장하지 않는다.

## 구현 PR에 남기는 항목 (Open / 미구현)

아래는 #552 1부 이후에도 미구현이다. 새 포트는 2부에서, UI는 실앱 시안 승인 뒤 다시 연다. 호스트 통합 검증은 구현 작업자의 패키지 검사와 별도로 수행한다.

- 새 `listAxisOptions` / `searchEquipment` / `resolveSelection` 포트와 서버·적합성 검사 구현, `contextOptions` 제거 조건 검증. 1부는 기존 포트를 유지하며 deprecated로 표시하고, 맵·capability projection·단일축 호환층·공개 API snapshot을 갱신한다. 실서버 적합성 검증은 실제 어댑터를 연결할 때 다시 연다.
- `asOf`를 조회 기간의 시점별 이력에 적용하는 정확한 평가 입력·시간 경계와 옵션의 소속 기준 처리. 제시한 포트에는 별도 시각 인자가 없으므로 서버가 사용할 시점·기간 전달을 구현 전에 확정한다. PRC 그룹은 한 시점에 하나이나 기간 중 소속 변경은 가능하다(#513).
- 실제 어댑터의 종속축 상충·Back/Forward·미지원 메뉴·보드 전체 복사 통합 검증. 1부의 패키지 검사는 tagged-object v1·배열 맵, Maker+Model 단일값 AND(2026-10-21 구현에서 확정 — 코디네이터 결정, 사용자가 되돌릴 수 있음), null/빈 배열/미주입 축/이력 미지원 오류, AND/OR와 보드 복사를 다룬다. 호스트 E2E·실서버 검증은 별도다.
- 커서 유효 범위·페이지/선택 상한·선택 개수 표시·캐시 무효화(세션·권한·마스터 변경 포함)와 오류/한도 상태. Scope·room grant 변경, 권한 회수, 1만 개 이상 후보, 요청 취소·늦은 응답, 페이지 밖 선택 및 forbidden 상세 비노출 검증. 별도 정책 값은 이 ADR에서 임의로 정하지 않는다.
- MultiCombobox를 소비하는 다중축/다중값 바와 접근성·오류 상태는 실앱 시안 승인 뒤 구현한다. #553 Draft/Apply, #554 조회 이력, #513 계층 보기·모듈 축은 각 이슈 소유로 여기서 구현하지 않는다. #557의 실제 소비자 게이트는 MARS 외 두 번째 견본도 포함한다.
