# Handoff — 2026-10-04 다음 세션: M2 `?variant=` 프로토타입(현재 vs FeedbackOps 디자인) → 사용자 컨펌

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 다음 세션 주제는 **M2 프로토타입 — 실제 앱 위 `?variant=`로 현재 디자인과 FeedbackOps 디자인(토큰·셸)을 비교해 사용자 컨펌**이다. 결정은 [ADR-0010](docs/adr/0010-feedbackops-design-system-shared-on-tailwind-v4.md), 소비 검증 결과·구현 조건·범위 영향은 [#52 코멘트](https://github.com/hjung3113/analytics-platform/issues/52#issuecomment-5974265606).
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md):
  - "화면/UI 설계": 공통 UI·셸·토큰의 모양이 바뀌면 **실제 앱 위 `?variant=` 인터랙티브 프로토타입으로 사용자 컨펌 후 구현**(`.agents/skills/prototype/UI.md`). 프로토타입 코드는 버리고 결정만 옮긴다.
  - "FeedbackOps 서브모듈 경계": 서브모듈 안 수정이나 참조 커밋 갱신은 **요청된 범위에서만**. FeedbackOps 쪽 버그·후속은 그쪽 저장소 이슈로(사용자 확인 뒤).
  - "작업 관리": 이슈에서 시작하고, 대안이 있는 결정은 ADR(+05 행)로 남긴다.
- MVP는 데스크톱 웹만. 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다 — 대상은 **플랫폼 공통 부품·셸·토큰**이다.

## 현재 상태 (2026-10-04)

- FeedbackOps#743(Tailwind v4)이 FeedbackOps#744로 병합됐고, 서브모듈 참조는 `ef6c8e83`(develop 최신)이다.
- **소비 검증 완료 — 쓸 수 있다.** 버리는 브랜치 `spike/52-fops-ui-consume`(origin에 있음, main 병합 안 함). 구현 조건 4가지: `@types/react` 한 벌(워크스페이스 `overrides`), CI `submodules: true`, gitlink를 올리면 플랫폼 lockfile도 같은 PR에서, `@fops/ui` 배럴 번들 크기(`sideEffects`).
- **범위 영향**: FeedbackOps 셸 프레임(`AppFrame`·`AppRail`·`AppSidebar`)은 `@fops/ui`가 아니라 FeedbackOps 앱 소유 → 플랫폼 `@ap/shell`이 모양을 따라 그린다. 플랫폼 테마 키 65개 중 34개는 FeedbackOps와 같은 이름, 31개(어두운 사이드바 `nav-*`, `surface-sunken`, `accent-*-soft`, 차트·카테고리 색 등)는 플랫폼 확장 층으로 남기거나 옮긴다. 프리미티브(shadcn)는 이미 거의 같다(파일당 차이 1–19줄) → 모양 차이는 토큰과 셸에서 나온다.
- 사내 적용 트랙: 플랫폼 쪽 에이전트 작업은 끝났고 사람 결정만 남았다(아래).

## 다음 세션 할 일 — 순서대로

1. **프로토타입 브랜치**(main에서, 예: `prototype/52-fops-design`): spike 브랜치의 워크스페이스 연결(`pnpm-workspace.yaml` 패키지 2개 + `overrides`, `@fops/ui` 의존, lockfile)을 가져온다.
2. **3안**(대표 화면 `/analytics/productivity`·`/analytics/cycle-time`·`/equipment`·`/metrics`, `scopeId=ICH`, 1440×900):
   - A 현재 그대로.
   - B FeedbackOps 토큰만 — ADR-0058 import 계약 + 플랫폼 확장 층(플랫폼 전용 키를 FeedbackOps 값에 매핑), 셸 구조는 플랫폼 그대로(사이드바는 밝게).
   - C FeedbackOps 셸까지 — B 토큰 + 레일(52px, 공간 전환)·밝은 사이드바(240px, 그룹=섹션 제목, Scope 선택)·50px 헤더. 2단계 셸 편입 때 FeedbackOps 쪽 변경이 가장 적은 안.
   - 토큰은 전역이라 안 전환 때 스타일시트를 통째로 바꾼다(A용 `style.css` ↔ B·C용 FeedbackOps 계약 CSS). Kernel URL 정규화가 `variant` 파라미터를 지우는지 먼저 확인.
3. **기준 캡처**(현재 화면 4장)를 프로토타입 브랜치 `.agents/reports/design/shots/`에 넣는다.
4. 사용자 컨펌 → UI/UX 리뷰는 Sol 6.1 xhigh → 결정을 #52에 기록 → 구현(조건 4가지 포함, `repository-layout.md`·CI 갱신) → #53 DESIGN.md 개정 → #156 레이아웃 슬롯.
5. FeedbackOps 쪽 발견(사용자에게 이슈 등록 여부 확인): `Callout` 인라인 스타일이 RGB 숫자 묶음 토큰을 색으로 써서 테두리·배경 무효, `@fops/ui`에 `sideEffects` 없음, `@types/react` 19.0.2.

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
