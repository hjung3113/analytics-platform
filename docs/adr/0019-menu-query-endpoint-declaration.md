# 메뉴 데이터 조회는 메뉴가 선언한 엔드포인트와 범용 요청 하나로 하고, 서버는 요청이 아니라 자기 선언 사본으로 판정한다

상태: **Decided (2026-10-01)**.
- 결정자: 사용자 — 2026-09-29 #100 설계 결정 기록에서 방향(Q1)·엔드포인트 권한(Q5)·kind 어휘(Q6)·이행 범위(Q7)를 정하고 어댑터 판정 기준(Q8)에 동의했다. 2026-10-01 #100 사람 확인 게이트에서 Q3·Q4·Q9·Q10과 06 §19 명시적 공집합 예외를 정하고 단계 9 범위를 "계약 검증 + 최소 이전"으로 줄였다 | 플랫폼 — 포트 판정 규칙 초안(Q8이 동의한 기준)과 Q10 적용 키 범위의 확장을 06 §4·§22에서 유도했다.

#100 전에는 메뉴가 데이터를 읽는 길이 셋이었다. 화면이 mock `serve()`를 직접 불러 권한·assessment kind·계산을 클라이언트 인자로 넘기는 길, Kernel 포트 `PlatformAdapter`에 메뉴 어휘 메서드(VOC 이력 등)를 늘리는 길, Registry만 읽는 길. 앞의 둘은 권한·kind·계산·원천 데이터가 클라이언트에 남아 실서버(FastAPI, [03](../03_backend_stack.md))로 교체할 수 없고 포트가 메뉴 수에 비례해 커진다. 서버 경계 계약을 mock 밖으로 꺼내야 했다.

세부 규칙의 소유 문서: 메뉴가 선언하는 항목은 [06 §5](../06_platform_ui_contract.md#5-menu-extension-contract)("조회 엔드포인트"), 명시적 공집합 예외는 [06 §19](../06_platform_ui_contract.md#19-loading--empty--error-taxonomy), 서버 판정 순서·등록 검증은 [실서버 연결 체크리스트](../integration/real-server-checklist.md) §3, 패키지 경계·포트 판정·메뉴 패키지 모양은 [패키지 경계](../integration/platform-packages.md) §3–§5, 선언·요청 타입의 원본은 `packages/contracts/src/menu-query.ts`다. 구현은 2026-10-01에 끝났다(#110–#115, #125–#133). 이 ADR은 결정과 이유만 둔다.

## 결정

- 플랫폼이 범용 요청 `MenuQuery`(엔드포인트 id + 선언이 apply하는 Context 투영 + params)의 모양과 포트 메서드 `PlatformAdapter.menuQuery` 하나를 소유한다.
- 메뉴가 자기 `src/endpoints.ts`에 `EndpointSpec`(권한·적용 Context·assessment kind·한도·허용 params 키)을 데이터로 선언한다. 앱은 전송 하나(mock 또는 HTTP)를 주입한다.
- 서버는 요청이 아니라 자기 쪽 선언 사본으로 요청 모양·권한·Scope·한도를 판정한다. 권한·kind·계산은 요청에 싣지 않는다. 클라이언트에는 선언(권한 이름·kind·한도)만 남고, 계산과 원천 데이터는 메뉴 `src/mock/`(서버 쪽 절반)에 둔다.
- 화면은 Kernel `useMenuQuery`(렌더 시점)·`useMenuFetch`(표 페이지·내보내기)로만 조회한다.

## Considered Options

- **(범용 요청 + 메뉴 엔드포인트 선언 + 전송 하나, 채택)**: 실서버 구현이 엔드포인트별 `fetch`로 충분하고, 권한·kind를 선언 데이터로 클라이언트·서버가 공유한다. 새 메뉴가 앱 주입 지점이나 포트 메서드를 늘리지 않는다.
- **(A) 메뉴별 타입 포트 주입**: 새 메뉴마다 앱 주입 지점과 실서버 구현이 하나씩 는다. 실서버 구현은 결국 엔드포인트별 `fetch`라 범용 전송으로 충분하고, 선언을 데이터로 공유하는 효과(클라이언트 kind 검사, 공개 스키마 산출물)도 약하다. 쓰기처럼 조회 모양에 안 맞는 메뉴 기능이 생기면 재검토한다(Q1).
- **(B) `PlatformAdapter`에 메뉴 메서드 계속 추가**: 포트가 메뉴 수에 비례해 커지고 `@ap/contracts`가 메뉴 도메인 어휘를 흡수한다 — 이 이슈의 원인이다.
- **(C) 현행 유지, 메뉴 `api.ts`만 교체 지점**: 권한·kind·계산·원천 데이터가 클라이언트 인자로 남아 교체가 불가능하고 공개 계약이 생기지 않는다.
- **(D) 선언을 `@ap/contracts`에 중앙 집중**: contracts가 메뉴 목록을 알게 된다(06 §3 "플랫폼은 개별 메뉴를 알지 못한다"). manifest를 메뉴가 소유하듯 선언도 메뉴가 소유한다.
- **(E) mock 핸들러를 `@ap/mock-server` 안에**: mock-server가 메뉴 선언 타입을 import해야 해 `mock-server → menu` 역방향 간선이 생긴다.

## 결과

- **포트 판정 규칙**(플랫폼 초안, Q8 사용자 동의): `PlatformAdapter` 멤버는 ① Kernel·components·shell이 직접 부르거나 ② 06 §4 Kernel 책임 저장소(세션·권한·Scope, Registry, 활용률, 감사, 오류 보고)를 읽고 쓰며 ③ 입출력에 특정 메뉴·외부 제품 어휘가 없을 때만 둔다. 한 메뉴의 도메인 데이터 조회, 전역 Context 위의 분석 조회, 외부 제품 데이터 투영은 메뉴 엔드포인트다. 그래서 `myVocHistory`·`mySurveyHistory`와 `MyVoc*` 타입은 포트에서 `@ap/menu-notice-voc` 엔드포인트로 옮겼고, `accessDirectory`(조회 전용)·`auditTrail`·`entityAudit`·`usageSummary`는 포트에 남았다. 현행 본문은 [패키지 경계](../integration/platform-packages.md) §4.
- **Q3·Q9 (사용자, 게이트):** 요청 모양은 선언과 정확히 일치한다. 선언이 apply하지 않는 Context 키가 오면 error, apply하는 키가 없으면 error이며 `time`의 `from`/`to`는 null일 수 없다.
- **Q10 (사용자 결정, 범위는 플랫폼 유도):** 등록 규칙 6 — `requiresScope: false` 엔드포인트는 site에 묶인 Context를 apply할 수 없다. 게이트 질문은 `roomNames`·`condition`·`selection` 셋이었고, site 경계 우회를 막는다는 취지에 맞춰 06 §22의 site 종속 키 여섯 개(`lot`·`recipe`·`ppid` 포함)로 적용한 것은 플랫폼의 결정이다.
- **Q4와 명시적 공집합 (사용자, 게이트):** 06 §5 "메뉴가 선언하는 정보"에 조회 엔드포인트를 더했고, 명시적 공집합은 원천 조회 없이 `empty`·assessments 없음·trust 없음으로 답하는 예외로 06 §19에 적었다.
- **Q5:** 엔드포인트 권한은 데이터 접근 권한이라 메뉴 manifest 권한과 달라도 된다(`home`은 `platform:view` 메뉴이면서 공지 조회에 `notice:view`를 요구한다). 등록 때는 `menuId`와 권한 이름의 실재만 검사한다. 처음 "같아야 한다"였던 것을 같은 날 이 사례로 고쳤고, 결정 기록에는 고친 이의 이름이 따로 없다.
- **Q6·Q7:** `respondent_history` kind는 플랫폼 어휘에 두고 두 번째 소비자가 나오면 재검토한다. 이행은 2개 화면 검증 → 사람 확인 게이트 → 생성기 전환 → 나머지 패키지별 이전 → `serve` 제거 순서였고 모두 끝났다.
- **Q2 선언 원본(TS ↔ FastAPI codegen)은 Open — [#148](https://github.com/hjung3113/analytics-platform/issues/148).** FastAPI 착수 때 정하며 [사내 적용 가이드](../integration/in-house-rollout.md) §2가 추적한다. 선언의 필드명·타입 모양은 Candidate로 남는다.
- 소비자가 늘 때까지 미룬 것: 메뉴 쓰기(mutation) 엔드포인트, 위젯 요청 묶음·스트리밍, 공개 스키마 codegen, manifest ↔ 엔드포인트 Context 역방향 교차 검증(이전 메뉴가 3개 이상일 때).
- 설계 경과(이슈 진단, 이행 단계 1–12, #98 영향)는 git 이력에 남는다(PR #109–#143). 이 ADR이 설계 기록 문서 `menu-query-port.md`를 대체한다.
