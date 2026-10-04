# Handoff — 2026-10-04 다음 세션: M2 구현(C안) — #192 → #193 → #194

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 디자인 방향은 **C안**으로 정했다(2026-10-04 사용자, [ADR-0011](docs/adr/0011-design-direction-feedbackops-shell.md)): FeedbackOps 토큰(ADR-0058 계약) + FeedbackOps 셸 구조(레일·밝은 사이드바·사이드바 Scope 선택·50px 페이지 머리, 상단 바 없음), 프리미티브는 `@fops/ui` 재수출. 스펙은 프로토타입 브랜치 `prototype/52-fops-design`(`.agents/reports/design/shots/52-fops/`).
- 구현 이슈(순서대로, 각각 PR 하나): **#192** `@fops/ui` 워크스페이스 편입(화면 변화 없음) → **#193** 토큰·테마 + 프리미티브 원본화 → **#194** 셸 구조. 각 이슈 본문에 범위·완료 기준이 있다. **#195**(DetailDrawer → 고정 상세 슬롯)는 사람 결정 대기.
- 작업자(2026-10-04 사용자): 구현은 **Luna max**(`codex --model gpt-6-luna -c model_reasoning_effort=max`), 복잡한 구현(#193·#194)은 **Sol 6.1 medium**. GLM은 한도 소진으로 쓰지 않는다. PR 리뷰는 Opus 5.5 high, 보이는 UI는 Sol 6.1 xhigh UI/UX 리뷰 추가.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md). 메뉴 화면은 다듬지 않는다 — 대상은 플랫폼 공통 부품·셸·토큰.

## 현재 상태 (2026-10-04)

- 서브모듈 참조 `ef6c8e83`(FeedbackOps Tailwind v4 병합). 소비 검증 결과·구현 조건 4가지는 [#52 코멘트](https://github.com/hjung3113/analytics-platform/issues/52#issuecomment-5974265606), 그대로 #192 본문에 옮겼다.
- FeedbackOps에 올린 후속: [#746](https://github.com/hjung3113/FeedbackOps/issues/746) Callout 테두리·배경 무효(버그), [#747](https://github.com/hjung3113/FeedbackOps/issues/747) `sideEffects` 없음, [#748](https://github.com/hjung3113/FeedbackOps/issues/748) `@types/react` 19.0.2. 플랫폼은 #747·#748이 풀릴 때까지 자기 설정으로 우회한다(#192).
- 버리는 브랜치(origin, main 병합 안 함): `spike/52-fops-ui-consume`(소비 검증), `prototype/52-fops-design`(3안 프로토타입).

### 그 밖에 남은 일

- **사용자 확인 대기**: ADR-0009(운영 조립 주입) Candidate 승인. #149 전송 형식 초안(질문은 문서 §10, 인프라 확인 항목은 사내 적용 가이드 §3.2).
- **사내에 물을 것(사람)**: #150 SSO 사양, #151 배포·인프라, #148 선언 원본, #149 합의. 질문 목록은 [사내 적용 가이드](docs/integration/in-house-rollout.md) §3. 답이 오면 해당 이슈와 05·원본 문서를 Decided로.
- 답이 다 오면 #154 실어댑터(`createAssembly`를 `CreateAssembly` 타입으로 구현해 `AP_PLATFORM_ASSEMBLY`로 꽂는다), #155 사내 FastAPI. #165 폴링·세대 재검증은 #149 합의 뒤.
- 에이전트 대기 중: #122(메뉴 조회 포트 사람 확인 게이트 — #100 §10 단계 7 — 뒤에만), #90(견본 메뉴 작업 — 낮은 우선순위).
- 표 행 복사(#174) 남은 실확인: 실제 엑셀·구글 시트 붙여넣기, Safari 클립보드, HTTP 경로 실브라우저.

### 작업 방식 메모

- 이 머신은 16GB다. 작업자에게는 패키지 범위 검사만(테스트를 고치는 라운드엔 `typecheck`도 — vitest는 타입을 보지 않는다), 루트 test/build/e2e는 코디네이터가 마지막에 한 번씩 순서대로. 작업자가 죽거나 Orca 런타임이 재시작되면 남은 vitest(부모 PID 1)를 확인해 정리한다.
- 커밋은 루트 검사가 **모두 0으로 끝났을 때만**(검사 결과로 커밋 단계를 막는다).
- 화면 동일성 증명: main과 워크트리 dev 서버를 다른 포트로 띄워 같은 URL·역할의 DOM을 Playwright로 비교한다.
- ego-browser가 응답하지 않으면(`ego-browser nodejs -e 'console.log(1)'`) `apps/platform-e2e`의 Playwright로 대체한다고 말한다.
- 생성기(`tooling/gen-menu`)를 바꾸면 깨끗한 트리에서 probe(`node tooling/gen-menu/scripts/probe.ts`). mock 등록은 `apps/platform-web/src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS` 하나 — params를 선언한 엔드포인트만 `server-conformance.test.ts`의 `PARAMS`에 표본.

## 사람·외부 결정 대기 — 답 전에는 거기에 기대는 구현을 하지 않는다

- #148 선언 원본, #149 전송 형식 합의, #150 SSO, #151 배포·인프라.
- #37 파서 담당 합의(스키마 초안) → 뒤에 #51 모니터링·트레이스.
- #75 활용률 이벤트에 조회조건을 넣을지, #91 전역 감사 room 권한, #98 역할 소속 원천(#150 답에 기댐 — 답 전에는 부여·회수 포트를 만들지 않는다).
- FeedbackOps: #81 딥링크 확장, #84(FeedbackOps#548 설문 응답 읽기 API), #85(FeedbackOps#549 신고자 딥링크), #86 실제 VOC 어댑터(#59 토큰 공유 뒤).
- 05 Open으로만 기록한 것: ECharts 렌더러(결정 SVG ↔ 코드 canvas), Router·Zustand 미채택 확정 여부.
