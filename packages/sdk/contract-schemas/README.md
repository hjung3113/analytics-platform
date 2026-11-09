# @ap/contract-schemas

서버와 주고받는 전송 계약의 Zod 스키마와, 거기서 만든 JSON Schema(2020-12) 산출물입니다. 저장소 밖 서버가 같은 계약을 따를 수 있게 하는 것이 목적입니다([ADR-0096](../../../docs/adr/0096-contract-schemas-zod-source-and-reference-implementations.md)).

- **공개 진입점:** `.`(스키마), `./source`
- **산출물:** `schemas/*.json`(JSON Schema)과 `endpoints.json`(메뉴 엔드포인트 선언 사본)입니다. `pnpm sdk:schemas`가 릴리스용 묶음으로 만듭니다.
- **의존 방향:** 운영 코드는 `zod`만 import합니다. 다른 `@ap/*`와 React는 lint가 막습니다.

서버 쪽에서 쓰는 순서는 [사내 적용 가이드](../../../docs/integration/in-house-rollout.md), 처음 읽는 개발자는 [첫 메뉴 화면 만들기](../../../docs/guides/first-menu-screen.md)입니다. 작업 규칙은 [AGENTS.md](AGENTS.md)에 있습니다.
