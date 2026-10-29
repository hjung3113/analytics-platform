# analytics-platform

`context_recognized_parser`가 적재한 설비 로그 데이터를 소비하는 분석 플랫폼. 설비관리, 기준정보관리, 생산성 분석, 지표관리, 공지, VOC를 아우르는 다중 메뉴 플랫폼.

플랫폼은 루트 pnpm workspace로 개발하며 mock과 real 어댑터를 조립한다. 코어 서버 `apps/platform-api`, 기능 화면 `apps/feature-screens`, `packages/feature-*`는 같은 workspace의 코드다. UI primitive는 `@ap/ui`가 소유하고(ADR-0046), 역할별 이름과 독립 앱 은퇴는 ADR-0097을 따른다.

시작점: [플랫폼 문서](docs/INDEX.md) · [저장소 구조와 기능 패키지 사용법](docs/integration/repository-layout.md) · [기능 개발 진입점](docs/integration/feature-development.md)

```text
docs/                     플랫폼 설계 문서
docs/integration/         저장소 연결 및 통합 결정 문서
apps/platform-web/        플랫폼 앱(조립 지점, dev 도구)
apps/platform-e2e/        플랫폼 계약 E2E(Playwright 블랙박스)
packages/                 플랫폼 패키지: contracts, ui, kernel, components, shell, mock-server, server-conformance
menus/                    업무 시스템 메뉴 Consumer 패키지(menus/<system>/<group>, @ap/menu-<group>)
platform/                 플랫폼 기능 Consumer 패키지(platform/<feature>, @ap/menu-<name>)
tooling/                  공유 도구: tsconfig, eslint 경계 규칙, gen-menu, css-selectors
archive/               통합 전 Kernel 단위 프로토타입(보존)
apps/{platform-api,feature-screens}, packages/feature-*  기능 앱·패키지(feature packages), 도구는 ops/platform-api/
.agents/                  플랫폼 에이전트 자산
```

플랫폼 실행(Node 26.7.0, pnpm 11.1.1):

```sh
pnpm install
pnpm dev           # http://127.0.0.1:5173
pnpm typecheck && pnpm test && pnpm build
```

에이전트 공통 지침: [AGENTS.md](AGENTS.md)(폴더별 `AGENTS.md`로 이어짐). 스킬·명령·레퍼런스 공유 구조: [.agents/README.md](.agents/README.md).
