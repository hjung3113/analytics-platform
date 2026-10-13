# 하위 경로 배포는 위치 어댑터를 주입하고 앱 내부 URL 계약을 유지한다

상태: **Decided (2026-10-13)**.
- 결정자: 사용자 kimhyojung (2026-10-13).

소개 사이트의 mock 데모(#317)는 `/analytics-platform/demo/`에 배포되며 사내 앱도 프록시 하위 경로에 배포될 수 있다(#151). 기존 기능의 영향을 최소화하면서 브라우저 주소와 앱 내부 경로를 연결해야 한다(#318). URL 계약 원본은 [06 §6.4](../06_platform_ui_contract.md#64-url-계약-decided-필드명enum-문자열은-candidate)이다.

## 결정

위치 포트를 Kernel에 주입한다. 기본 브라우저 어댑터는 기존 pathname/search 읽기와 history 쓰기를 그대로 수행한다. 앱 조립 지점만 Vite `BASE_URL`을 읽고 `/`가 아닐 때 하위 경로 어댑터를 주입한다. 읽기·쓰기·anchor href·링크 복사의 절대 URL 변환은 이 경계가 소유한다.

## Considered Options

- **해시 라우팅**: 딥링크와 `returnTo` 계약을 바꾸며 `isAppRelativePath`의 `#` 거부와 충돌하므로 기각한다.
- **빌드 시점 번들 패치**: 소스와 검증된 산출물의 대응을 깨고 검증하지 않은 코드를 배포하므로 기각한다.
- **Kernel 내부 `basePath` 분기**: 동작은 만들 수 있으나 Kernel의 읽기·쓰기·링크 경계 곳곳에 배포별 분기를 두므로 기각한다.
- **위치 어댑터 주입(채택)**: 서버 포트 주입과 같은 구조로 배포 지식을 브라우저 경계에 가두고 기본 동작을 유지한다.

## 결과

- Registry·`linkTo`·`returnTo`·저장된 마지막 화면·URL 보안 검사는 base 없는 앱 상대 경로를 유지한다. base 밖 pathname은 미등록 경로로 처리한다.
- 링크 복사 소비자는 Kernel의 절대 URL helper를 통해 배포 경로를 포함한다. Kernel은 Vite를 import하지 않는다.
- FeedbackOps로 넘기는 `returnTo`의 절대화는 이번 범위 밖이며 데모에서 연결을 활성화하지 않는다. Pages 딥링크 fallback 배포 조립은 #317이 소유한다.
