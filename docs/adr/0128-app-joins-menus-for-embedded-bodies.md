# ADR-0128 — 한 메뉴 화면이 다른 메뉴의 본문을 품을 때는 앱이 둘을 잇는다

- 상태: Decided (2026-11-08, lead 결정·Opus high 검토, 되돌릴 수 있음, #1475 코멘트)
- 계약: [platform-packages §3 규칙 2](../integration/platform-packages.md), [Log Explorer 설계 §1·§6.2](../design/features/log-explorer/README.md)

## 배경

Round 상세(`menu-log-models`)의 «원본/시퀀스» 탭은 로그 탐색(`menu-log-analysis`)의 조사 본문을 그대로 쓴다(설계 §1: 같은 컴포넌트, 데이터 경로를 따로 만들지 않는다). 메뉴끼리 import는 규칙이 금지하고, `feature-screens`는 `components`·`kernel`을 쓸 수 없는 층이라 본문을 거기로 옮기면 `ui`·`api` 주입으로 통째로 다시 써야 한다.

## 결정과 이유

- **둘째 슬롯.** 같은 방식으로 `menu-log-knowledge`는 `./model-topview-slot`(`setModelTopView`)을 열고, EV는 `@eqv/platform-adapter/model-topview`(`ModelTopView`, 읽기 전용 Top View)를 연다. `main.tsx`가 둘을 잇는다. 모델 프로필 Top View 절은 슬롯이 비면 그림을 그리지 않는다(#1656).
- **앱이 잇는다.** `menu-log-analysis`는 `./view`(`RoundSourceView`)를, `menu-log-models`는 `./round-source-slot`(`setRoundSourceView`)을 정확한 서브경로로 연다. `apps/platform-web/src/main.tsx`만 두 경로를 import하고 시작할 때 꽂는다. `analysis-actions`·`setFeatureApi`와 같은 방식이라 규칙 2(메뉴끼리 import 금지)는 그대로다.
- **`./view`는 얇게 두고 본문은 지연 로드한다.** `main.tsx`가 시작할 때 import하므로 표·가상화·Source 읽기는 탭이 열릴 때 불러오는 별도 덩어리다. 정적으로 import하면 `check:lazy-chunks`가 가상화 코드가 시작 덩어리에 들어갔다고 막는다.
- **슬롯 타입은 구조적이다.** 꽂히는 컴포넌트는 `{ roundId, sampleSet }`만 받으므로 두 메뉴 중 어느 쪽도 상대의 타입을 import하지 않는다. 슬롯이 비어 있으면(아무것도 꽂지 않는 호스트) Round 상세에 탭이 없다.
- **본문은 페이지 틀과 주소 키에서 분리한다.** 본문은 `PlatformPage` 없이 `frame`을 받고, 주소 키 이름(`tab`·`focus`·`drawer`)을 호스트가 정한다. Round 화면은 `tab`을 개발 건 상세의 `rounds`·`history`로 쓰므로 탭 본문은 `sourceTab`·`sourceFocus`·`sourceDrawer`를 쓴다.
- **Round 탭은 읽기 전용이다.** 조사 행을 만들지도 찾지도 않고 Round의 샘플 목록(`roundDetail.sampleSet`)으로 Source를 읽는다. 저장 조건·근거 위치 바구니·담기는 이 탭에 없다.

## 채택하지 않은 것

- 메뉴 간 lint 예외: 규칙 2의 첫 예외가 되고 소유자 승인이 필요하다.
- 공용 패키지로 추출: 사용처가 둘뿐이다. 세 번째 사용처가 생길 때 다시 본다.
- 링크로 대체: 설계의 «같은 컴포넌트를 탭에»와 다르다.

## 결과

`tooling/eslint`의 앱 `main.tsx` 프리셋만 두 서브경로를 연다(경계 테스트가 다른 앱 파일·메뉴·`src` 경로를 막는지 고정한다). 세 번째 호스트가 이 본문을 품으려 하면 슬롯을 공용 패키지로 올리는지 다시 정한다.
