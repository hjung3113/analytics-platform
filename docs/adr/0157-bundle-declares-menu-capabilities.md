# 선언 묶음이 자기 capability 행과 메타를 선언한다: 메뉴 권한이 닫힌 목록의 별칭이 아니게 한다

상태: **Candidate (2026-11-13)** — 설계. 고문 리뷰 뒤 Decided로 올린다. [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md) 결정 3을 개정한다.
- 결정자: 사용자(소유자) — 2026-11-13 [#1902](https://github.com/hjung3113/analytics-platform/issues/1902) 질문 «니추천대로»(방향 (a)와 아래 두 조건). 이 ADR의 세부 형태는 구현이 정한다.
- Scope: [#1902](https://github.com/hjung3113/analytics-platform/issues/1902). 관련: [ADR-0068](0068-permission-scope-and-business-system-link.md), [ADR-0116](0116-platform-api-tokens-personal-and-service.md), [ADR-0154](0154-site-and-room-grants-are-platform-owned.md), #1844, #1846.

## 맥락

ADR-0146 결정 3은 메뉴 권한을 `permission → capability` 행으로 두고 capability는 «지금의 부여 체계»가 정한다고 했다. 그 capability 목록(`CAPABILITIES`)은 코드에 닫혀 있다. 저장소 밖 조립은 플랫폼 코드와 마이그레이션을 고칠 수 없으므로 시스템별·동작별 권한(예: 보기와 표시하기를 따로)은 기존 capability에 얹을 수밖에 없고, 그러면 서로 다른 메뉴 권한이 같은 부여 하나가 된다(`widget:view`와 `widget:annotate`가 모두 `workspace.read`).

capability를 새로 더하려면 손대야 하는 곳은 네 가지다: 닫힌 목록과 메타(`packages/feature-shared/src/enums/capabilities.ts`, `CAPABILITY_META`), 부여 범위 정책의 손으로 유지하는 두 목록(`supported-scope-policy.ts`), 감사 읽기 투영이 하드코딩한 «비민감 capability» 목록(마이그레이션의 SQL), 화면 문구(`apps/feature-screens/src/lib/copy/capabilities.ts`).

## 결정

1. **묶음이 capability를 선언한다.** 선언 묶음(ADR-0146 결정 2)에 `capabilities` 행을 둔다. 한 행은 `id`와 메타(민감 여부 `sensitive`, Admin 우회 `adminModuleBypass`, 받을 수 있는 Role Level, 범위 종류, 표시 이름)다. 메뉴 권한 행의 `capability`는 플랫폼 capability 또는 이 묶음이 선언한 capability여야 하고, 둘 다 아니면 기동 실패다.
2. **선언 capability의 기본은 가장 닫힌 쪽이다.** 메타 필드를 적지 않으면 `sensitive: true`, `adminModuleBypass: 'none'`, User Role Level 제외(`NOT_FOR_USER_ROLE`과 같은 효과), 범위는 workspace 단일이다. 완화는 묶음이 필드마다 명시할 때만 일어난다. 메타의 어휘는 `CapabilityMeta`와 같고 새 필드를 만들지 않는다.
3. **플랫폼 capability 이름은 재정의할 수 없다.** 선언 `id`가 `CAPABILITIES`에 있으면 기동 실패다(fail-closed, 같은 이름의 메타를 «덮어쓰기»도 «보태기»도 허용하지 않는다). 선언 capability의 `id`는 묶음 안에서 유일하고, 플랫폼이 쓰는 모듈 접두어(`workspace.`, `voc.`, `eqv.` 등 `CAPABILITIES`의 접두어 집합)와 겹치지 않는 자기 접두어 하나를 가진다. 접두어 규칙은 이름 충돌을 미리 막는 장치이고, 최종 판정은 위 «목록에 있으면 거부»다.
4. **부여는 별개이고 선언은 부여가 아니다.** 선언 capability는 부여 표(ADR-0068)의 ordinary capability처럼 부여·신청·승인된다. `widget.annotate`를 부여해도 `widget.view`는 주어지지 않는다. 부여받지 못한 사람은 선언 capability로 열리는 메뉴 권한에 접근하지 못한다. 한 capability의 판정은 그 capability의 부여만 본다.
5. **저장 어휘는 코드 목록이 아니라 «플랫폼 ∪ 선언» 레지스트리다.** 서버는 기동 때 묶음의 선언 capability를 검증하고 레지스트리를 만든다. 부여·신청·API 토큰 범위·확인 서비스가 capability를 받아들일 때 `isCapability`(닫힌 목록) 대신 이 레지스트리를 쓴다. 묶음에서 사라진 capability의 기존 부여 행은 남기되 판정에서 비활성이다(없는 capability는 거부). 메타는 레지스트리에서 읽는 한 곳이다.
6. **DB 변경(마이그레이션 하나).** 감사 읽기 투영이 하드코딩한 비민감 capability 목록을 레지스트리 표(`core.declared_capabilities`: `capability`, `sensitive`, 기동 때 맞춰 넣음)와의 대조로 바꾼다. 선언 capability는 기본이 민감이므로 투영에서 제외되고, 묶음이 `sensitive: false`를 명시한 것만 보인다. 부여 표와 신청 표의 capability 열은 이미 `text`이고 어휘 CHECK가 없으므로 완화할 제약은 이 투영뿐이다(구현 노드가 `rg`로 다시 확인하고, 다른 하드코딩이 나오면 같은 방식으로 옮긴다).
7. **범위 정책의 두 손 목록은 선언 capability에 대해 목록에 의존하지 않는다.** `supportedScopeCandidates`는 선언 capability의 범위 종류 메타를 읽는다(기본: workspace 단일). `NOT_FOR_USER_ROLE`은 선언 capability에 대해 메타의 Role Level로 판정한다. 플랫폼 capability의 두 목록은 이 ADR이 바꾸지 않는다(`.planning/backlog.md` 해당 행은 유지).
8. **화면 문구.** 선언 capability의 표시 이름은 묶음의 메타가 준다. 화면 문구 표에 없는 capability는 그 표시 이름을 쓰고, 표시 이름도 없으면 `id`를 보인다. 코드를 고치지 않는다.
9. **공개 시험은 합성 선언만 쓴다**(ADR-0146 결정 6).

## 음성 시험(수용 기준)

- 부여받지 않은 사람은 선언 capability로 열리는 메뉴 권한에 접근할 수 없다(Admin 우회도 기본에서는 없다).
- 선언 `id`가 플랫폼 capability 이름이면 기동 실패다.
- 합성 `widget.annotate`를 부여해도 `widget.view`(다른 선언 capability) 또는 `workspace.read`는 주어지지 않는다.
- 메타를 비운 선언 capability는 User Role Level에 부여할 수 없고 감사 투영에 나타나지 않는다.
- 묶음에서 선언을 뺀 뒤 기존 부여 행은 판정에서 거부된다.

## Considered Options

- **(a, 채택) 묶음이 capability 행과 메타를 선언한다.** «선언하면 끝»에 가장 가깝다.
- **(b) 메뉴 권한을 Managed System 단위로 부여한다**(권한 = 시스템 × 기존 capability). 같은 capability를 시스템으로만 나누므로 «보기와 표시하기를 따로»는 해결하지 못한다.
- **(c) 지금대로 두고 가이드에 한계를 적는다.** 한계가 남고 권한 선언과 판정 단위가 계속 어긋난다. 이 ADR이 채택되기 전의 임시 안내로만 쓴다.

## Deferred (구현 안 함)

- 선언 capability 이름 바꾸기·합치기의 이행 절차. 이유: 사라진 선언은 비활성이면 충분하다. 다시 여는 조건: 사내 파일럿이 선언 capability 이름을 바꿔야 할 때.
- 플랫폼 capability의 두 손 목록을 메타 플래그 하나로 합치기. 이유: `.planning/backlog.md`가 이미 따로 기록한다.

## 결과

- 저장소 밖 조립이 플랫폼 코드와 마이그레이션 없이 자기 권한 단위를 선언한다. 판정은 여전히 코어 서버 한 곳이다.
- #1844 (a)(메뉴 권한 없음 화면의 권한 요청 진입)가 쓰는 «메뉴 권한 → capability» 대응은 이 레지스트리를 읽는다.
