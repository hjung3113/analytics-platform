# 어댑터·세션·공간 테스트 fixture는 `@ap/kernel/testing` 한 곳에서 공개한다

상태: **Decided (2026-10-16)**.
- 결정자: 사용자 — 2026-10-16, [#381](https://github.com/hjung3113/analytics-platform/issues/381). 포트 메서드 하나를 더할 때마다 손으로 쓴 어댑터 stub이 약 21곳 깨지는 비용을 보고 "통합한다"로 정했다. #265의 "패키지 내부 fixture" 결정을 이 범위만 바꾼다.

#265는 `testAdapter`·`testSession`·`testSpace`·`noContext`를 패키지 안에서만 쓰는 fixture로 두었고, 닫을 때 "전 패키지 공개 테스트 API나 필수 필드의 optional 전환은 하지 않는다."고 적었다. 그 결과 같은 본문이 kernel·components·shell에 세 벌 생겼고, 메뉴와 앱 테스트는 어댑터 17개 메서드를 매번 손으로 썼다. `listAnnotations`·`saveAnnotation`을 더할 때 그 모든 곳을 고쳤고, #399(`deleteAnnotation`)가 다음이다.

## 결정

- `@ap/kernel`은 `package.json` `exports["./testing"]`(`src/testing.ts`)로 테스트 전용 공개 진입점을 낸다. `noContext`·`testSpace`·`testSession`·`testAdapter`가 거기에 있고 한 벌만 둔다. `src/index.ts`에서는 내보내지 않는다.
- 이 진입점은 테스트 파일에서만 import한다. 경계 lint는 `**/*.test.{ts,tsx}`·`**/test-support.ts`·`**/test-setup.ts`에만 깊은 경로 `@ap/kernel/testing`을 허용하고, 프로덕션 소스에서는 정적·동적 import 모두 오류다. 허용은 `components`·`shell`·`menu`·`app` 프리셋의 테스트 파일에만 더했고, 공유 `tooling`·`contracts`·`mock-server`·`server-conformance` 프리셋은 넓히지 않았다.
- 테스트는 `testAdapter({ …의도한 메서드만… })`로 어댑터를 만든다. 기본값은 거절(`forbidden`) 또는 빈 응답이다. 다른 응답이 필요한 메서드(예: 메뉴 질의가 `empty`)는 override로 적는다.
- 어댑터 계약 그 자체를 판정하는 이중 구현은 대상이 아니다. `@ap/server-conformance`의 `referenceAdapter`는 포트에 메서드가 늘면 타입 검사가 깨져야 하므로 손으로 쓴 완전한 구현으로 남고, `@ap/server-conformance`는 계속 `@ap/contracts`만 import한다. 같은 이유로 `this`를 검증하는 클래스 어댑터(kernel `adapter.test.tsx`)와 실제 `createAssembly` 어댑터를 펼치는 테스트(`workspace-assembly.test.tsx`)도 그대로다.

## Considered Options

- **(A) 패키지마다 내부 fixture 유지(#265)**: 본문 세 벌이 어긋날 수 있고, 메뉴·앱 테스트는 stub을 계속 손으로 쓴다. 포트 메서드가 늘 때마다 약 21곳을 고친다.
- **(B) `@ap/kernel/index`에서 함께 내보냄**: 프로덕션 번들이 테스트 fixture를 끌고 갈 수 있고 공개 API 표면이 늘어난다.
- **(C) 별도 `@ap/testing` 패키지**: 의존 방향과 패키지 목록이 바뀐다. 이 fixture는 kernel 포트 타입에 묶여 있어 분리할 이유가 없다.
- **(D, 채택) kernel의 `./testing` 하위 경로 + 테스트 파일 전용 lint**: 본문 한 벌, 공개 표면은 하위 경로 하나, 프로덕션 import는 lint가 막는다.

## 결과

- 세 벌의 본문을 `packages/kernel/src/testing.ts` 한 벌로 합쳤다. kernel 테스트는 상대 경로 `./testing`, components·shell·메뉴·앱 테스트는 `@ap/kernel/testing`을 쓴다. 기본 세션 동일성 테스트는 kernel에 하나만 남는다.
- 경계 lint 규칙과 회귀 행은 `tooling/eslint/src/index.js`·`boundaries.test.ts`에 있다.
- `packages/AGENTS.md`(공개 진입점 규칙의 예외)와 `packages/contracts/AGENTS.md`(포트 메서드 추가 시 고칠 fixture)를 같은 변경에서 고쳤다. 포트 변경 시 `testAdapter`, `packages/mock-server/src/adapter.ts`, `referenceAdapter`만 고치면 된다.
