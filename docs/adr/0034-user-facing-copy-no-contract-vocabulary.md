# 사용자 문구는 계약 어휘를 쓰지 않고 서버 message는 세부다

상태: **Decided (2026-10-15)**.
- 결정자: 사용자 — 2026-10-15, [#304](https://github.com/hjung3113/analytics-platform/issues/304) 추천안을 채택했다.

기본 7일 조회에서 위젯 여러 개가 `time_domain_unverified: …` 원문만 보이고, 왜 실패했는지와 무엇을 하면 되는지는 없었다. 같은 화면에 계약 상태어·enum 원문·수식 표기·계약 문장이 사용자 문장으로 섞여 있었다. 상태 분류 자체는 [06 §19](../contract/platform-ui-contract.md#19-loading--empty--error-taxonomy)가 그대로 소유한다. 이 결정은 그 분류를 바꾸지 않고 사용자에게 보이는 문장만 정한다.

## 결정

- 서버 `message`는 사용자 본문에 넣지 않는다. Kernel i18n이 계약 오류 코드별 원인과 행동을 갖고, 서버 message는 Correlation ID 옆 세부(접근 가능한 이름)로만 보인다. 매핑되지 않는 코드는 일반 오류 문구와 세부다.
- 사용자 문구에 계약 상태어(Candidate·Open·Deferred), 상태 enum 원문, 수식 표기(`[from, to)`, 초 정렬), 계약 문장(세션값을 자동 적용하지 않는다, 다른 Scope로 조용히 대체하지 않는다)을 쓰지 않는다. 이미 있는 번역 라벨을 쓴다.
- 권한·공간 거부는 공간·메뉴 이름과 "권한 담당자에게 요청하세요"와 홈이다. `permission=`·`space=` 원문은 보이지 않는다. 요청 경로 목적지는 두지 않는다.
- 표현은 기존 `StateMessage`다. 새 공통 부품을 만들지 않고 화면 구조는 바꾸지 않는다.

## Considered Options

- **서버 message를 본문으로 유지**: 코드와 설비 id가 바로 보이지만, 원인도 행동도 없는 영어·코드 원문이라 기각한다.
- **코드별 카탈로그 없이 일반 문구만**: 모든 오류가 같은 문장이 되어 `time_domain_unverified`처럼 사용자가 좁혀야 하는 실패를 구분하지 못하므로 기각한다.
- **코드별 원인·행동과 세부의 서버 message (채택)**: 본문은 다음에 할 일이고, 원문은 식별자 옆에 남긴다.

## 결과

- 문구 원칙은 [06 §19](../contract/platform-ui-contract.md#19-loading--empty--error-taxonomy)에 한 단락이다. §19 상태 분류와 `outcome` 분기는 바꾸지 않는다.
- 카탈로그는 Kernel i18n이고 표현은 `StateMessage`다. 응답 포트(`@ap/contracts`)는 바꾸지 않으며, 코드는 message 접두로만 판정한다.
- 구현은 #304다.
