# 도구 공간 기대 동작표

[기대 동작표](README.md)의 형식을 따른다. 공통 기대와 같은 내용은 적지 않는다.

도구 공간은 외부 모듈(`eqv`)을 Registry에 올려 셸이 맞이하는 방식을 확인하는 견본이다. 재생 화면의 값과 설비 도메인 동작은 대상이 아니다. 서버 재생은 아직 없어([ADR-0132](../../adr/0132-eqv-merges-into-platform.md) 결정 9) mock 조립에서 확인한다. 가는 길은 Home의 `도구` 카드에서 시작한다.

| 플랫폼 기능 | 견본과 가는 길 | 맞는 모습 | 근거 | 확인 |
| --- | --- | --- | --- | --- |
| 모듈 메뉴의 내비게이션 | Home `도구` 카드, 전환기 | 플랫폼 메뉴와 똑같이 카드, 전환기, 사이드바, 팔레트에 나온다 | [§5](../../contract/kernel.md), ADR-0132 | 화면 점검(mock) |
| 권한 없는 역할 | 개발 도구의 역할 전환, 주소 입력 | `eqv:view`가 없으면 카드가 없고 주소 입력은 권한 없음 화면이 된다 | [§9.1](../../contract/kernel.md) | 화면 점검(mock) |
| 정규 경로와 옛 별칭 | 주소 입력 `/tools/eqv-topview`와 옛 별칭 `/tools/topview` | 둘 다 같은 Top View 화면이 열린다 | ADR-0132 결정 6, [§6.4](../../contract/kernel.md) | 화면 점검(mock) |
| 사이드바만으로 진입 | 도구 › 설비 Top View | 화면 안의 선택기로 설비를 골라 볼 수 있다 | [#1644](https://github.com/hjung3113/analytics-platform/issues/1644) 완료 기준 | 화면 점검(mock) |
| 기본 기간의 한도 | 처음 진입 | 기본 구간이 선언한 8시간 한도를 넘지 않아 오류 없이 열린다 | #1644 완료 기준, 모듈 manifest `defaultPeriodHours` | 화면 점검(mock) |
| 기간 Context | 전역 기간 변경 | 기간을 바꾸면 그에 맞게 다시 그리고, 한도를 넘는 기간은 결과처럼 보이지 않고 사유가 나온다 | [§6](../../contract/kernel.md), [§19](../../contract/components.md) | 화면 점검(mock) |
| 주소 복원 | 설비를 고른 뒤 새로고침, 뒤로 | 고른 설비가 복원된다 | manifest `pageKeys`, [§6.4](../../contract/kernel.md) | 화면 점검(mock) |
| 숨은 화면 | Top View에서 Focus로 이동, 새로고침, 복귀 | 구간(`rangeFrom`, `rangeTo`)과 설비가 복원되고 Top View로 돌아간다 | manifest `pageKeys`, §6.4 | 화면 점검(mock) |
| 조회 상태 | 개발 도구의 응답 시나리오 | 로딩, 결과 없음, 오류가 서로 다른 모습이고 빈 결과를 오류로 보이지 않는다 | §19 | 화면 점검(mock) |
