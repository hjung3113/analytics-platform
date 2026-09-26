# @ap/contracts

플랫폼과 서버·메뉴가 공유하는 계약 타입과 순수 함수. 향후 백엔드와 공유할 수 있게 런타임 환경 의존을 두지 않는다.

## 파일

- `url.ts` — 전역 Context URL codec(`parseQuery`, `buildQuery`, `isAppRelativePath` 등). 06 §6 URL 계약의 구현.
- `menu.ts` — `MenuMeta`(manifest 선언부), `ContextKey`, `Capability`, `PageType`, `Permission`.
- `response.ts` — 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`). 06 §18–19.
- `adapter.ts` — `PlatformAdapter` 포트와 입출력 타입. 설계는 [패키지 경계](../../docs/integration/platform-packages.md) §4.
- `audit.ts`, `i18n.ts` — `AuditEvent`, `Text`.
- `globals.d.ts` — DOM lib 없이 쓰는 최소 `URLSearchParams`·`AbortSignal` 선언.

## 규칙

- import 금지: React, DOM 타입, Node API, 다른 `@ap/*` 패키지, 외부 런타임 라이브러리.
- 필드 추가·이름 변경은 계약 변경이다. 소비처(kernel, shell, 앱 mock 구현)를 같은 PR에서 맞추고, 06이나 패키지 경계 문서에 반영할 결정인지 먼저 판단한다. 필드 이름 대부분은 Candidate다.
- URL codec을 바꾸면 앱 통합 테스트 `apps/platform-web/src/url-contract.test.ts`를 함께 갱신한다. 보정 없이 오류로 거부하는 원칙(06 §6)을 유지한다.
- `PlatformAdapter`에 메서드를 추가하면 `packages/mock-server/src/adapter.ts` 구현과 `packages/kernel/src/adapter.test.tsx` fixture 어댑터를 같이 고친다.

## 검증

`pnpm --filter @ap/contracts typecheck`, 그 뒤 루트 `pnpm typecheck && pnpm test`.
