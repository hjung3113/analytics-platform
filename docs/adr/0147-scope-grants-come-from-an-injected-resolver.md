# Scope 부여의 원천은 사내가 주입하는 resolver이고, 단위는 site·room부터 시작한다

상태: **Decided (2026-11-12)**. 결정 1·2(원천·구현 모양)와 결정 4의 `validateScope` 원천은 [ADR-0154](0154-site-and-room-grants-are-platform-owned.md)가 Decided가 되면 대체된다(소유자 지시 2026-11-12, #1844. 0154는 Candidate).
- 결정자: 사용자(소유자) — 2026-11-12 [#1087](https://github.com/hjung3113/analytics-platform/issues/1087) 질문 1·2 «OK»: Scope 부여 원천은 사내가 주입하는 resolver, 단위는 site·room부터(Line은 뒤로). 실제 Scope 부여는 사내 책임이라는 소유자 분할과 맞다.
- Scope: [#1729](https://github.com/hjung3113/analytics-platform/issues/1729), [#1087](https://github.com/hjung3113/analytics-platform/issues/1087). 관련: [ADR-0005](0005-scope-room-name-line-independent.md), [ADR-0068](0068-permission-scope-and-business-system-link.md), [ADR-0069](0069-platform-port-in-feedbackops-backend.md) 결정 8, [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md).
- 소유자 답이 직접 덮는 것은 결정 1·5(#1087 질문 1·2)와 결정 2의 구현 모양(서비스 호출, #1087 2026-11-12)이고, 결정 2~4는 [#1729](https://github.com/hjung3113/analytics-platform/issues/1729) 범위 정리에서 유도했다. 구현 노드가 되돌릴 수 있다.
- 구현 없음. 질문 3·4(토큰 claim, 회수 반영)는 [ADR-0148](0148-minimal-forwarder-and-identity-token.md)이 다룬다.

## 맥락

- 코어 서버의 세션은 `scopes: []`를 돌려주고(ADR-0069 결정 8), `requiresScope` 엔드포인트와 `mergeTimeDomain` 엔드포인트는 «서버에 Scope resolver가 없다»는 이유로 등록이 거부된다(`apps/platform-api/src/modules/menu-dispatch/registry.ts`). 그래서 Scope가 필요한 분석 메뉴는 실서버에서 열리지 않는다.
- 누가 어느 site·room을 받았는지는 Fastify가 안다(ADR-0095 결정 1의 분담). 부여의 원천(사내 조직·권한 시스템)은 이 저장소 밖이다.
- Admin 일괄 임시 부여는 하지 않기로 했다. `scopes: []`에서는 부여해도 쓸 수 있는 화면이 늘지 않기 때문이다(#1087 리드 결정 2026-11-10).

## 결정

1. **원천은 사내가 주입하는 resolver다.** 코어 서버가 사내 조직·권한을 직접 읽지 않는다. 공개 저장소는 resolver의 인터페이스와 합성 resolver(시험용)를 낸다. 실제 resolver는 사내가 만든다.
2. **주입 지점은 서버 조립 한 곳이다.** resolver는 `buildServer` 옵션으로 들어간다. 정확한 이름과 시그니처는 구현 노드가 정하며, 입력은 행위자(와 워크스페이스), 출력은 허용된 site·room 집합이다. 이 resolver는 Scope(site·room) 허용 집합을 내며, 메뉴 권한(capability) 판정기 `PlatformPermissionResolver`(`createPlatformPermissionResolver`)와 다른 것이다.
   - **구현 모양(소유자 결정 2026-11-12):** 공개 어댑터가 resolver를 구현하고, 배포 설정([ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md))이 가리키는 사내 부여 서비스를 호출한다. 사내 코드는 코어 프로세스 밖에 남아 ADR-0146 결정 1과 맞는다. 사내 코드를 `buildServer`에 직접 주입하는 예외는 쓰지 않는다.
3. **resolver가 없으면 지금처럼 기동 실패다.** `requiresScope`·`mergeTimeDomain` 엔드포인트의 등록은 resolver가 있을 때만 허용한다. 우회 경로를 두지 않는다.
4. **판정은 요청마다 서버에서 한다.** resolver 호출이 실패하거나 빈 집합이면 접근을 열지 않는다(닫힌 쪽으로 실패). `validateScope`는 부여 정보와 `analytics.v_sites_v1`로 Fastify가 답한다(ADR-0095 결정 1).
5. **부여 단위는 site·room(`room_name`)이다.** Line은 이 ADR의 대상이 아니다. [ADR-0068](0068-permission-scope-and-business-system-link.md) 결정 2와 [ADR-0005](0005-scope-room-name-line-independent.md)의 «Line은 부여 축이 아니다»는 그대로 유효하다. 두 단위가 동작한 뒤 [#604](https://github.com/hjung3113/analytics-platform/issues/604)(Line까지)가 합쳐진 #1087의 나머지를 다시 열 수 있고, Line을 부여 축으로 하려면 그 두 ADR을 개정하는 결정이 먼저다.

## Considered Options

- **(A, 채택) 사내가 주입하는 resolver.** 부여는 사내 책임이고 공개 서버는 사내 시스템을 모른다.
- **(B) 코어 서버가 부여 표를 소유한다(수동 site·room 부여를 먼저).** ADR-0095 D5가 말한 수동 부여다. 부여 데이터의 원천이 둘이 되고 공개 서버에 사내 조직 개념이 들어온다.
- **(C) Admin에게 임시 일괄 부여.** 위 리드 결정이 기각했다.

## Deferred (구현 안 함)

- Line을 부여 축으로 올리는 일(ADR-0005·0068 개정 필요), #604의 링크 처리·감사 적용 요구. 이유: site·room이 먼저 동작해야 한다. 다시 여는 조건: site·room resolver가 실서버에서 동작한 뒤.
- 설비별 접근 판정(설비 id를 받는 조회가 그 설비에 대한 접근을 요청마다 판정). 이유: 설비 id를 받는 실서버 엔드포인트가 아직 없다. 다시 여는 조건: 재생 엔드포인트(EV 9단계) 또는 #1087의 설비 단위 요구.

## 결과

- v0.37.0의 서버 조립은 «전달기·선언 먼저, Scope 다음»이다. 한 릴리스에 안 들어가면 Scope resolver는 v0.38.0이다([#1729](https://github.com/hjung3113/analytics-platform/issues/1729) 범위 정리).
- resolver가 있으면 `requiresScope` 엔드포인트가 등록되고, 없으면 기동 실패라는 두 경우가 모두 시험 대상이다.
