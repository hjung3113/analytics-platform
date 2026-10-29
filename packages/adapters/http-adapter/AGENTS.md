# packages/adapters/http-adapter — 실서버 클라이언트

`@ap/http-adapter`는 `PlatformAdapter`를 HTTP로 옮기는 실어댑터다. 와이어 형식(경로·변환 표·부트스트랩·폴링·CSRF·Correlation ID)의 원본은 [전송 형식](../../../docs/integration/http-adapter-contract.md), 메서드별 의미는 [실서버 연결 체크리스트](../../../docs/integration/real-server-checklist.md) §2다. 이 패키지는 그 문서를 코드로 옮길 뿐 규칙을 새로 정하지 않는다.

## 파일

- `src/index.ts` — 공개 진입점: `bootstrapHttpAdapter(options)`와 그 타입. 결과는 `ready`(어댑터)·`login`(401·3xx·`opaqueredirect`)·`unavailable`(correlationId)이고 reject하지 않는다.
- `src/session/bootstrap.ts` — 첫 부트스트랩과 조립.
- `src/calls/transport.ts` — `fetch` 한 번: Kernel `signal`과 내부 타이머의 수동 연결(`AbortSignal.any` 미사용), `redirect: 'manual'`, `credentials: 'same-origin'`, `X-Correlation-Id`. 내부 타임아웃은 `AbortError`가 아니다.
- `src/calls/calls.ts` — 호출 묶음별 변환: envelope(reject 없음), 쓰기(`unknown`), 비 envelope(`TransportError`), 선택 포트(`PortError`).
- `src/adapter.ts` — `PlatformAdapter` 멤버마다 한 줄(경로·메서드·본문·CSRF).
- `src/session/session.ts` — 세션 스냅샷 identity, `csrfToken`(메모리만), `subscribe` 폴링, single-flight 재확인과 백오프, `onSessionLost`.
- `src/validate.ts` — 응답 모양 검사. 모르는 키는 무시한다.
- `src/saved-views/` — HTTP saved-view store and `importLocal` (ADR-0099). `guards.ts` matches command/response wire schemas recursively and rejects unknown keys. `store.ts` sends each of the 16 commands once with CSRF.

## 규칙

- The only runtime dependency is `@ap/contracts`. Only test files may import the `@ap/contract-schemas/source` devDependency to check guard/wire-schema equivalence. Do not import React, DOM components, other `@ap/*` packages, or feature packages.
- 쿠키·토큰을 저장소(`localStorage` 등)에 쓰지 않는다. 사용자 id·actor를 보내지 않는다.
- 사용자에게 보이는 `message`는 짧은 코드(`client_timeout`·`network_error`·`session_expired`·`http_<status>`·`invalid_response`·`invalid_envelope`)뿐이다. URL·응답 본문·스택을 싣지 않는다(#101).
- 이 패키지를 import하는 곳은 앱의 운영 조립 `apps/platform-web/src/real/**`(경계 lint)와 플랫폼 API의 실서버 적합성 테스트(devDependency, 테스트 코드만 — ADR-0073, #674)뿐이다.
- 새 포트 메서드가 생기면 `src/__tests__/methods.test.ts`의 표가 타입 오류로 알려 준다.

## 검증

`pnpm --filter @ap/http-adapter lint|typecheck|test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). 테스트는 `fetch`를 주입하며 실제 네트워크를 쓰지 않는다.

## 폴더 배치

`src/`는 `session/`(세션·부트스트랩)과 `calls/`(호출 변환·상관 id·전송)로 나뉜다. 루트에는 공개 진입점 `index.ts`와 `adapter`·`validate`만 둔다. 테스트와 공용 도우미 `test-support.ts`는 `__tests__/`에 둔다(ADR-0090, #713).
