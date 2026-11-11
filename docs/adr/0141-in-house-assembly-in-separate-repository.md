# 사내 조립은 이 저장소 밖의 별도 저장소에서 한다: 방향을 채택하고, 전제 변경은 저장소 밖 조립 시험이 통과한 뒤에 발효한다

상태: **Decided (2026-11-11)** — 방향. 아래 「발효 조건」을 채우기 전에는 [ADR-0131](0131-sdk-consumer-skill-and-intent-table.md)의 전제(이 저장소에서 개발, 외부 배포 제외)가 그대로 유효하다.
- 결정자: 사용자(소유자) — 2026-11-11, [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 §3의 소유자 결정 13행 전부에 "추천대로". 이 ADR은 그중 1번이다. 결정 4–13은 [Host 진입점 계약](../design/host-entry-contract.md) §11에 이관 대기로 적었다.
- Scope: [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) v0.36.0 1단계, [#1702](https://github.com/hjung3113/analytics-platform/issues/1702).

## 맥락

[#1700](https://github.com/hjung3113/analytics-platform/issues/1700)은 «공통 엔진은 범용, 업무 의미는 사내»를 위해 사내 조립을 별도 저장소로 두자고 제안한다. 하루 전의 결정들은 반대 전제 위에 있다.

- [ADR-0131](0131-sdk-consumer-skill-and-intent-table.md): 소유자가 «여러 개발자가 이 저장소에서 개발하는 전제로 외부 배포는 이번에서 뺍니다»로 결정했다(2026-11-10).
- [SDK 외부 확장 설계](../design/sdk-external-extension.md): #428을 같은 이유로 보류했다. 다시 여는 조건은 «저장소 밖 패키지가 이 확장을 실제로 필요로 할 때»다.
- [사내 적용 가이드 §5](../integration/in-house-rollout.md#5-사내-메뉴-개발-가이드): 사내 메뉴를 이 저장소의 `menus/`에 더한다.
- [#1603](https://github.com/hjung3113/analytics-platform/issues/1603)의 외부 소비자 안내(G3·G5)는 보류다. 열린 결정 [#232](https://github.com/hjung3113/analytics-platform/issues/232)(공개 저장소에 사내 코드·도메인 문서를 둘지)는 이 방향이 사실상 답한다.

공개 저장소의 Kernel 어휘와 공간 이름은 이미 사내 도메인 어휘이므로, 사내 의미를 공개에 더 얹는 쪽은 한계가 있다.

## 결정

- **방향을 채택한다.** 사내 도메인 의미(사내 메뉴, 사내 핸들러, 사내 권한 데이터)는 별도 조립 저장소가 소유한다. 이 저장소는 범용 엔진, Host 진입점, 계약, 적합성 묶음, 합성 예시를 소유한다.
- **발효 조건.** 저장소 밖 조립 시험([Host 진입점 계약](../design/host-entry-contract.md) §10)이 CI에서 통과하면 아래가 한꺼번에 바뀐다. 그전에는 어느 것도 바꾸지 않는다.
  - ADR-0131의 전제 문장을 이 ADR이 대체한다(ADR-0131 상태 줄에 대체 표시).
  - #428을 다시 연다. 다시 여는 조건(저장소 밖 패키지의 실제 필요)이 이 방향으로 충족된다. 다만 [설계 §8](../design/sdk-external-extension.md)이 기각한 허용 목록·기여 지점·`defineSystem`·manifest 필드는 그대로 기각이다([ADR-0142](0142-out-of-repo-menu-package-and-host-module-split.md)).
  - #232를 닫고, 공개 어휘 처리는 결정 8(Host 진입점 계약 §11)을 따른다.
  - 사내 적용 가이드 §5를 저장소 밖 조립 기준으로 고친다.
- **발효 전에도 허용되는 일.** Host 진입점 추출, Host·어댑터 tarball, 조립 시험 픽스처는 이 저장소 안에서 만든다(화면 변화 없음, 공개 앱이 첫 소비자).

## Considered Options

- **(A, 채택) 사내 조립을 별도 저장소로.** 공개 저장소에 사내 의미를 두지 않아도 된다. 비용은 Host·릴리스·조립 시험을 새로 만드는 일이다.
- **(B) 공개 저장소를 사내에서 포크.** 사내 변경이 공개 파일을 고치므로 업그레이드마다 충돌이 나고 예외가 쌓인다.
- **(C) 지금처럼 이 저장소의 `menus/`에 사내 메뉴를 더한다(ADR-0131).** 공개 저장소에 사내 의미가 들어가고, 공개 저장소의 도메인 어휘를 정리할 계기가 없다.

## Deferred (구현 안 함)

- 발효 조건 전의 ADR-0131 대체, #428 재개, #232 종료, 사내 적용 가이드 §5 변경. 이유: 조립 시험 없이는 방향이 실제로 서는지 모른다. 다시 여는 조건: 조립 시험 통과.

## 결과

- v0.36.0은 Host 진입점 추출, Host·어댑터 tarball, 저장소 밖 조립 시험 하나를 담는다([ADR-0143](0143-release-units-and-compatibility-train.md), Host 진입점 계약 §10).
- 이 ADR의 발효를 확인하는 사람은 조립 시험 통과를 보고 위 네 가지 변경을 같은 PR에서 한다.
