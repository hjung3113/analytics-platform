# 규칙 카탈로그는 Validator가 토큰으로 보고한 읽기 전용 스냅샷이고, 커버리지는 읽을 때 계산한다

상태: **Proposed (2026-11-08).** 결정자: 소유자(미결). 초안: 설계 레인, 근거 [#1486](https://github.com/hjung3113/analytics-platform/issues/1486), 설계 [`log-rules`](../design/features/log-rules/README.md).

## 배경

`logRules`는 Validator가 실제로 지원하는 Rule·RuleSet·Revision·지원 범위를 보여 주고, 모델 명세 요구사항과 Rule의 연결(명세 커버리지)을 보여야 한다. Rule 정의의 권위 원본은 사내 Validator이고 플랫폼 DB에 정의를 독립 복제하지 않는다([#1346](https://github.com/hjung3113/analytics-platform/issues/1346), [#1330](https://github.com/hjung3113/analytics-platform/issues/1330)). Validator의 인터페이스·출력·권한은 실사 전이고, [log-lifecycle](../design/features/log-lifecycle/README.md)은 Validator로 나가는 호출을 두지 않는다. 연결과 목록은 정렬·필터·서버 페이지·시도의 RuleSet Revision 참조(`execution_attempt.rule_set_revision`)를 위해 플랫폼에서 안정적으로 조회되어야 한다.

## 결정

1. **카탈로그는 Validator(또는 그 보고자)가 서비스 토큰([ADR-0116](0116-platform-api-tokens-personal-and-service.md))으로 올린 전체 스냅샷 보고를 받아 저장한 읽기 전용 투영이다.** 플랫폼은 Validator로 나가는 호출을 하지 않는다. 보고는 `report_digest`로 멱등이고, 새 보고가 이전 보고를 `superseded`로 만들 뿐 지우지 않는다.
2. **정의 본문은 저장하지 않는다.** 저장 필드는 닫힌 목록(식별자·짧은 이름·짧은 요약·지원 상태·지원 범위·digest)이고 허용 키 밖의 필드는 거절한다. 보고 행은 불변이며 상태 변화는 새 보고의 새 행이다.
3. **연결은 두 출처를 구분한다:** Validator가 보고에서 선언한 연결(`validator_declared`)과 사람이 만든 수동 연결(`manual`, 사람이 확인해야 커버리지에 셈). 모든 변경은 추가 전용 이력과 감사에 남는다.
4. **명세 커버리지는 저장하지 않고 읽을 때 계산한다**(실효 명세 요구사항 × 현재 active RuleSet Revision × 확인된 연결). 연결 없음은 «확인된 연결 없음», 지원 여부를 모르면 `unknown`, 연결 시점 digest가 달라지면 `stale`(화면 이름 «연결 재확인 필요»)이다. 커버리지는 구성 정보이며 통과가 아니다. 응답에 `coverageDigest`를 두어 Gate가 나중에 근거를 고정한다.
5. 합성 보고자만 있는 동안 «연동 완료»로 표시하지 않는다.

## 대안과 버리는 이유

- **플랫폼이 Validator를 호출해 가져오기(pull 어댑터):** 인터페이스·권한이 실사 전이고 「Validator로 나가는 호출 없음」 원칙과 어긋난다. 실사 뒤 이 ADR을 개정해 연다. 보류.
- **조회 때마다 Validator를 실시간 프록시:** Validator 가용성에 목록·커버리지 계산이 묶이고 서버 페이지·정렬·시도의 옛 RuleSet Revision 참조를 보장할 수 없다. 기각.
- **플랫폼이 Rule 레지스트리를 소유(정의 복제·편집):** 권위 원본이 둘이 되고 편집은 P2이다. 기각.
- **커버리지를 연결 행의 불리언/비율로 저장:** 명세·RuleSet 변경 때 낡은 값이 남는다. 읽을 때 계산하고 digest만 고정한다.
- **연결을 Validator 선언만으로 제한:** Validator 쪽 누락을 사람이 메울 수 없다. 수동 연결을 출처 구분·확인 필요 조건으로 허용한다.

## 결과

- 신규 모듈 `log-rules`, 보고 REST(`validation.catalog.report` capability, 토큰 전용)와 `@ap/contract-schemas v0`, 합성 보고자. 세부는 설계 문서가 소유하고 이 ADR은 결정만 둔다.
- 시험: 같은 보고 재전송 멱등, 허용 키 밖·비밀 패턴 거절, 보고 없음/명세 없음의 별도 표시, Rule 소멸·Revision 변경의 `stale`, 수동 연결의 확인 전 비집계, 타 Workspace 거절, 토큰 scope 밖 호출 거절.
