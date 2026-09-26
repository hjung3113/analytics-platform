# analytics-platform

`context_recognized_parser`가 적재한 설비 로그 데이터를 소비하는 분석 플랫폼. 설비관리, 기준정보관리, 생산성 분석, 지표관리, 공지, VOC를 아우르는 다중 메뉴 플랫폼.

플랫폼 프론트엔드는 루트 pnpm workspace로 개발 중이다(서버는 mock). 기존 FeedbackOps 구현은 `products/feedbackops/` 서브모듈로 연결해 통합 설계의 참고 대상으로 두며, 이 workspace에 포함하지 않는다. 서버·배포 통합은 아직 결정하지 않았다.

시작점: [플랫폼 문서](docs/INDEX.md) · [저장소 구조와 FeedbackOps 사용법](docs/integration/repository-layout.md) · [FeedbackOps README](products/feedbackops/README.md)

```text
docs/                     플랫폼 설계 문서
docs/integration/         저장소 연결 및 통합 결정 문서
apps/platform-web/        플랫폼 앱(조립 지점, 메뉴 화면, mock 서버)
packages/                 플랫폼 패키지: contracts, ui, kernel, components, shell
tooling/                  공유 개발 도구 설정
prototypes/               통합 전 Kernel 단위 프로토타입(보존)
products/feedbackops/     독립 개발을 유지하는 FeedbackOps 서브모듈
  apps/frontend/         React 프론트엔드
  apps/backend/          Fastify 백엔드
  packages/shared/       FeedbackOps 공용 계약
  packages/ui/           FeedbackOps UI
.agents/                  플랫폼 에이전트 자산
```

플랫폼 실행(Node 26.7.0, pnpm 11.1.1):

```sh
pnpm install
pnpm dev           # http://127.0.0.1:5173
pnpm typecheck && pnpm test && pnpm build
```

클론 후 FeedbackOps 소스 받기:

```sh
git submodule update --init --recursive
```

에이전트 공통 지침: [AGENTS.md](AGENTS.md)(폴더별 `AGENTS.md`로 이어짐). 스킬·명령·레퍼런스 공유 구조: [.agents/README.md](.agents/README.md).
