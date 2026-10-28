# analytics-platform

`context_recognized_parser`가 적재한 설비 로그 데이터를 소비하는 분석 플랫폼. 설비관리, 기준정보관리, 생산성 분석, 지표관리, 공지, VOC를 아우르는 다중 메뉴 플랫폼.

플랫폼 프론트엔드는 루트 pnpm workspace로 개발 중이다(서버는 mock). FeedbackOps(`apps/{platform-api,feature-screens}`·`packages/feature-*`·`docs/feedbackops/`)는 같은 저장소의 코드이며 루트 workspace의 일부이고 UI primitive는 `@ap/ui`가 소유한다(ADR-0046). 서버·배포 통합은 아직 결정하지 않았다.

시작점: [플랫폼 문서](docs/INDEX.md) · [저장소 구조와 FeedbackOps 사용법](docs/integration/repository-layout.md) · [FeedbackOps README](docs/feedbackops/README.md)

```text
docs/                     플랫폼 설계 문서
docs/integration/         저장소 연결 및 통합 결정 문서
apps/platform-web/        플랫폼 앱(조립 지점, dev 도구)
apps/platform-e2e/        플랫폼 계약 E2E(Playwright 블랙박스)
packages/                 플랫폼 패키지: contracts, ui, kernel, components, shell, mock-server, server-conformance
menus/                    메뉴 Consumer 패키지(@ap/menu-<group>)
tooling/                  공유 도구: tsconfig, eslint 경계 규칙, gen-menu, css-selectors
archive/               통합 전 Kernel 단위 프로토타입(보존)
apps/{platform-api,feature-screens}, packages/feature-*  FeedbackOps 앱·패키지(feature packages), 도구는 ops/platform-api/
docs/feedbackops/        FeedbackOps 문서(구조는 저장소 구조 문서)
.agents/                  플랫폼 에이전트 자산
```

플랫폼 실행(Node 26.7.0, pnpm 11.1.1):

```sh
pnpm install
pnpm dev           # http://127.0.0.1:5173
pnpm typecheck && pnpm test && pnpm build
```

에이전트 공통 지침: [AGENTS.md](AGENTS.md)(폴더별 `AGENTS.md`로 이어짐). 스킬·명령·레퍼런스 공유 구조: [.agents/README.md](.agents/README.md).
