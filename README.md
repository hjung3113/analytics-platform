# analytics-platform

`context_recognized_parser`가 적재한 설비 로그 데이터를 소비하는 분석 플랫폼. 설비관리, 기준정보관리, 생산성 분석, 지표관리, 공지, VOC를 아우르는 다중 메뉴 플랫폼.

분석 플랫폼 자체는 개념 설계 단계다. 기존 FeedbackOps 구현은 `products/feedbackops/` 서브모듈로 연결해 통합 설계의 참고 대상으로 둔다. 아직 실행 환경·패키지·배포를 통합한 상태는 아니다.

시작점: [플랫폼 문서](docs/INDEX.md) · [저장소 구조와 FeedbackOps 사용법](docs/integration/repository-layout.md) · [FeedbackOps README](products/feedbackops/README.md)

```text
docs/                     플랫폼 설계 문서
docs/integration/         저장소 연결 및 통합 결정 문서
products/feedbackops/     독립 개발을 유지하는 FeedbackOps 서브모듈
  apps/frontend/         React 프론트엔드
  apps/backend/          Fastify 백엔드
  packages/shared/       FeedbackOps 공용 계약
  packages/ui/           FeedbackOps UI
.agents/                  플랫폼 에이전트 자산
```

클론 후 FeedbackOps 소스 받기:

```sh
git submodule update --init --recursive
```

에이전트 공통 지침: [AGENTS.md](AGENTS.md). 스킬·명령·레퍼런스 공유 구조: [.agents/README.md](.agents/README.md).
