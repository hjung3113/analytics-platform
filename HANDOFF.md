# Handoff — 2026-09-26 통합 인터랙티브 프로토타입 병합 (PR #13-15), 워크스페이스 결정 반영

## 현재 상태

`main`은 PR #14 병합 커밋 `6e5a749` 이후 이 핸드오프 커밋까지 반영된 상태이며 작업 트리 clean. CI는 이제 **5개 Job**(기존 4개 + `platform-app`)이고 전부 초록불이다.

- **PR #13** (`a9e1e01`) — `prototypes/platform-app`(현재 `apps/platform-web`): 흩어져 있던 Kernel 유닛 4개를 하나의 앱으로 통합한 인터랙티브 프로토타입. 기존 유닛은 수정하지 않았다.
  - Kernel: Menu Registry(06 §9 그룹), 전역 Context URL 계약(시간·room_name·Condition/Selection·Lot/PPID/Recipe·지표 쌍), 요청마다 Scope 재검증, 역할 권한, 즐겨찾기/최근방문, 메뉴 활용률 계측, 이전 Context 결과를 새 결과로 보이지 않는 요청 수명주기.
  - 셸: 스크린샷 스타일의 다크 아코디언 사이드바(64px 레일), 탑바(Scope 검증 상태, ⌘K, 한/EN, 역할 전환, 응답 시나리오 시뮬레이터), 전역 Context Bar(미지원 Context 보존 표시).
  - 공통 컴포넌트: PlatformPage 슬롯, PlatformDataTable, DetailDrawer, AuditTimeline(첫 실구현), DataTrustIndicator, §19 상태 분류, StatCard, AnalysisChartFrame.
  - Consumer 화면: 08 랜딩(coordinator), 09 설비 마스터(Codex), 11 생산성 개요(OMP GLM‑5.3), 12 사이클타임 드릴다운·13 지표 카탈로그(Grok 4.7). 워커 보고서는 `apps/platform-web/reports/`.
  - 교차 리뷰(Grok: 플랫폼 계층 P0 2·P1 6·P2 5, OMP: 화면 P1 2·P2 3)의 수정 6건을 **Grok 4.7 high 설계 → 구현(GLM 5.3 Flash max, 한도 소진 후 GPT‑6‑Luna max) → coordinator 브라우저 검증** 순서로 하나씩 반영. 설계서는 `reports/design/01~06`. 테스트 51개.
- **PR #14** (`6e5a749`) — 사용자 인터뷰 결정 문서화: 워크스페이스 3개(분석/운영 콘솔/피드백, 06 §9.1), 가공 상태 원천=적재 워커 보고(06 §19, 01), FeedbackOps 단계적 통합(integration/repository-layout.md), 07 IA·05 결정 행·인터뷰 기록. GPT‑6‑Astra medium 리뷰(P0 1·P1 2·P2 1)를 보강 커밋 `9c275a9`로 반영.
- **PR #15** (`5bbe96b`) — CI에 `platform-app` Job 추가(Node 26.7.0, typecheck/test/build).
- worktree·워커 탭 모두 정리 완료(이 세션이 연 것만. FeedbackOps #513/#514 탭은 다른 세션 소유).

## 사용자 확인 필요

**기존 15개(변경 없음)** — 인증/권한 3, UX 정책 4, 후속 구현 범위 5, 아키텍처 1, 공개 URL 1, CFG 연계 1. 목록은 [직전 handoff](.agents/reports/handoff-history-through-2026-09-26-b.md#사용자-확인-필요--15개-변경-없음-unicode-버그는-해소).

**2026-09-26 새 Open** ([인터뷰 기록](docs/reviews/2026-09-26-workspace-ops-interview.md#남은-open)):
- 적재 워커 상태 기록 스키마·원인 분류·보존 기간, `context_recognized_parser` 저장소 변경 범위(운영 콘솔·가공 상태 조회의 선행 조건).
- Registry `space` 필드명, 공간별 그룹 상한, 06 §9.1 표의 그룹/화면 구분.
- FeedbackOps 1단계에서 VOC 등록·설문 응답 제출을 원본 화면 딥링크로 처리하는 방식(Candidate) 확정 여부.
- 운영 콘솔 권한 모델(개발자와 운영자 역할 분리 여부).

## 다음 세션 추천 작업

우선순위 순. 05에 Decided로 기록된 다음 구현 범위는 **프론트엔드 플랫폼 틀 + 메뉴 개발 환경(서버는 mock)** 이다(인터뷰 기록의 추정 6~9주, 일정 승인 아님).

1. **모노레포와 패키지 추출** — `platform-app`에서 `kernel` / `ui`(토큰·shadcn) / `components` / `shell` 패키지를 pnpm workspace로 분리하고 메뉴 패키지 템플릿(생성기)을 만든다. 첫 단계로 패키지 경계와 의존 방향만 설계 문서로 확정하고 사용자 확인을 받는다.
2. **워크스페이스 층 구현(06 §9.1)** — Registry `space` 선언, 좌상단 공간 전환기(접근 가능한 공간 2개 이상일 때만), 공간 간 전역 Context 보존, 관리·감사를 운영 콘솔로 이동. 필드명·그룹 상한은 Open이므로 Candidate로 구현하고 표시한다.
3. **platform-app README "남은 플랫폼 과제" 해소** — 표 정렬/페이지 등 page key 등록, 지표별 버전 page key와 Trust envelope 다중 버전, 목적지 객체 단건 조회 API, overlay 그림자 규칙, compare 이전 기간 정렬, ECharts 코드 분할(번들 672kB), 서버 측 메뉴 권한 재검증, Lot·PPID·Recipe 편집기. 시간역 병합 실패 시 "설비 선택을 좁히세요" 같은 구체 안내도 추가.
4. **개발 환경 정비** — lint(URL 직접 조립 금지 등 계약 lint), Storybook, 시각 회귀·접근성 테스트.
5. **파서 저장소 협의** — 적재 워커 상태 보고 스키마(위 Open). 합의 전에는 운영 콘솔·가공 상태 조회를 화면 설계까지만 진행한다.
6. FeedbackOps Milestone(FR-TASK-004)은 사용자가 원본 저장소에서 구현 중(#514). 피드백 공간은 그 구현을 참조한다.

## 이번 라운드에서 배운 운영 사항

- **워커 분배:** 발견 사항 여러 개를 한 워커에 몰아주면 GLM max가 25분 넘게 계획만 하고 파일을 하나도 바꾸지 않았다. 작업을 잘게 나눠 **Grok 설계 → 구현 모델 구현 → coordinator 검증**을 하나씩 하는 방식이 빨랐다. 설계 문서는 구현과 겹쳐서 미리 받아도 된다.
- **Orca 탭 정리:** `orca terminal create`로 띄운 Grok/OMP/Codex 터미널은 external이라 `worker-release` 후에도 열려 있다. 수락 후 `orca terminal close`로 직접 닫는다.
- **Codex 준비 확인 실패:** 주간 한도 경고 배너가 있으면 `worker-start --agent codex`가 `agent_readiness`에서 실패한다. `orca terminal create --command "codex -m <model> -c model_reasoning_effort=\"<effort>\""` → `task-create` → `dispatch --inject`로 우회했다. orca는 `gpt-6-luna`의 `max` effort를 거부하지만 Codex CLI 자체는 지원한다.
- **GLM 경로 — OpenRouter 사용 금지:** omp에서 `z-ai/glm-*`처럼 `vendor/` 접두사가 붙은 ID는 OpenRouter 경유다. 이번 라운드에 실수로 이 경로를 썼다가 크레딧 부족(402)으로 멈췄다(대화형 TUI는 오류 없이 멈춤). 반드시 접두사 없는 z.ai 직접 연결 ID(`glm-5.3-flash` 등, 5시간 한도 있음)만 쓰고, 한도가 차면 OpenRouter가 아니라 사용자가 지정한 다른 모델(예: Codex Luna)로 바꾼다. 사전 확인은 `omp -p "reply with OK only" --model <id> --thinking low < /dev/null`. 비대화 실행은 반드시 `< /dev/null`(아니면 stdin 대기로 멈춤).
- **계정 한도(2026-09-26 기준):** Codex 주간 약 9% 남음, Grok 주간 약 46% 사용, z.ai는 5시간 한도 후 재개. OpenRouter는 쓰지 않는다.
- CI: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26으로 바뀐다는 GitHub 공지가 있다. 그 무렵 CI가 깨지면 이것부터 확인한다.

## 보존할 경계

- Decided는 구현 완료가 아니다. 위 확인 필요 항목을 임의로 결정하지 않는다.
- 메뉴 화면은 플랫폼 갈래를 검증하는 Consumer다. platform-app의 화면 5개로 다섯 갈래 검증은 한 차례 끝났으므로, 다음은 메뉴 추가가 아니라 플랫폼 틀(패키지·워크스페이스·개발 환경)이다.
- FeedbackOps 코드는 2단계(인증·Scope 결정) 전까지 플랫폼 계약에 맞춰 소급 수정하지 않는다. 서브모듈 gitlink는 `6a0c7f8`.
- 역사 기록과 외부 원본은 덮어쓰지 않는다. 문서 대조를 런타임 검증으로 보고하지 않는다.

## 필요할 때만 읽는 기록

[직전 HANDOFF(PR #10-12)](.agents/reports/handoff-history-through-2026-09-26-b.md) · [그 이전](.agents/reports/handoff-history-through-2026-09-26.md) · [platform-app README](apps/platform-web/README.md) · [교차 리뷰](apps/platform-web/reports/review-grok-kernel.md), [화면 리뷰](apps/platform-web/reports/review-omp-screens.md) · 병합된 PR: [#13](https://github.com/hjung3113/analytics-platform/pull/13) [#14](https://github.com/hjung3113/analytics-platform/pull/14) [#15](https://github.com/hjung3113/analytics-platform/pull/15). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
