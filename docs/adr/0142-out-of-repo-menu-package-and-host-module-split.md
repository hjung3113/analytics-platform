# 사내 메뉴는 «저장소 밖 메뉴 패키지», 자체 UI 제품은 호스트 모듈로 나눈다

상태: **Decided (2026-11-11)** — 범주와 용도 구분. 저장소 밖 조립이 실제로 서는 시점은 [ADR-0141](0141-in-house-assembly-in-separate-repository.md)의 발효 조건을 따른다.
- 결정자: 사용자(소유자) — 2026-11-11, [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 §3의 소유자 결정 13행 전부에 "추천대로". 이 ADR은 그중 2번이다.
- Scope: [#1702](https://github.com/hjung3113/analytics-platform/issues/1702). 계약 문서 변경은 [platform-packages.md §3](../integration/platform-packages.md)의 «저장소 밖 메뉴 패키지» 절이 소유한다.

## 맥락

저장소 밖에서 플랫폼에 올라오는 방식이 둘이다. 고르지 않으면 두 장치가 나란히 남는다.

- **메뉴 패키지**: 지금 `menus/*/*`와 같은 모양으로 SDK 전체(`@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`)를 쓴다. 저장소 밖 범주는 아직 없고, 경계 lint 프리셋과 `pnpm gen:menu`는 저장소 안에서만 돈다.
- **호스트 모듈**([ADR-0053](0053-host-module-contract-v1.md)): `<모듈 id>:` 접두사로 격리되지만 `@ap/contracts`와 `@ap/ui`만 import하므로 `PlatformDataTable`, 차트, `useMenuQuery`를 쓰지 못한다([platform-packages.md §3](../integration/platform-packages.md) 규칙 7).

## 결정

- **SDK로 만드는 사내 메뉴는 «저장소 밖 메뉴 패키지»다.** 새 범주이며 [platform-packages.md §3](../integration/platform-packages.md)에 규칙을 더한다. 사내 메뉴가 공통 표·차트를 쓰는 것이 SDK의 목적이다.
- **자체 UI를 가진 다른 제품은 호스트 모듈이다.** ADR-0053의 계약을 그대로 쓴다.
- **그 밖에 만들지 않는다.** 허용 목록(`contributors`), 이름 붙은 기여 지점(`targetSlot`), `defineSystem`, manifest 필드는 [SDK 외부 확장 설계 §4.2·§8](../design/sdk-external-extension.md)이 기각·보류한 것과 같으며 그대로 기각이다. 우선순위·overlay·replacement 규칙은 그 설계에 없던 후보이고 만들지 않는다. 공개 메뉴의 대체·비활성은 조립 저장소가 자기 `menus.ts`에서 그 메뉴를 import하지 않는 것으로 얻는다.
- **«System Extension»과 «Menu Contribution»은 구현된 타입이 아니다.** 후보 이름으로만 남는다.

## Considered Options

- **(A, 채택) 메뉴 패키지와 호스트 모듈을 용도로 나눈다.** 사내 분석 메뉴는 공통 표·차트·`useMenuQuery`를 쓰고, 자체 UI 제품은 격리된다.
- **(B) 호스트 모듈 단일안.** 검토 에이전트 하나가 낸 안이다. 사내 메뉴가 공통 표·차트를 쓰지 못해 SDK 목적과 어긋나서 채택하지 않았다.
- **(C) #1702 본문의 허용 목록·기여 지점·overlay.** 정적 조립에서는 조립자가 지울 수 있어 강제되지 않는 허가이고, 실제 통제는 조립 파일 리뷰와 서버 판정이라는 [설계 §4.2](../design/sdk-external-extension.md)의 이유가 그대로 해당한다.

## Deferred (구현 안 함)

- 메뉴 lint 프리셋의 배포 방법과 `gen:menu`의 저장소 밖 사용. 이유: 이 ADR은 범주를 정하고 구현 방식은 정하지 않는다. 다시 여는 조건: 조립 시험 노드가 프리셋을 소비자 쪽에 어떻게 둘지 정할 때([Host 조립 계약](../design/host-entry-contract.md) §10).
- 2026-11-12: 메뉴 lint 프리셋(`appHost`·`menu` 등)은 v0.36.0 릴리스 단위에 들어가지 않고 시작 키트(#1790)도 실지 않는다. 배포 경로(별도 패키지 또는 키트 동봉)는 정해지지 않았다(#1702).
- 우선순위·overlay·replacement·플러그인 생명주기·런타임 켜고 끄기. 이유: 위 기각 사유와 [components.md](../contract/components.md)의 Deferred 「외부 설치형 Plugin SDK」. 다시 여는 조건: 조립자와 대상 소유자가 다른 조립이 생길 때.

## 결과

- `docs/integration/platform-packages.md` §3에 «저장소 밖 메뉴 패키지» 절이 생긴다.
- [GLOSSARY.md](../../GLOSSARY.md)에 `저장소 밖 메뉴 패키지` 항목이 생긴다.
- 호스트 모듈 계약(ADR-0053)은 바뀌지 않는다.
