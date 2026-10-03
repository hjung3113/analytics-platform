# Handoff — 2026-10-03 다음 세션: FeedbackOps 디자인·컴포넌트 가져오기(M2 재개)

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 다음 세션 주제는 **M2 재개 — FeedbackOps 디자인(토큰·preset)과 UI 부품(`@fops/ui`)을 플랫폼으로 가져오기**다. 근거와 선택지는 [#52](https://github.com/hjung3113/analytics-platform/issues/52)의 2026-10-01 메모와 2026-10-03 확인 코멘트에 있다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md):
  - "화면/UI 설계": 공통 UI·셸·토큰의 모양이 바뀌면 **실제 앱 위 `?variant=` 인터랙티브 프로토타입으로 사용자 컨펌 후 구현**(`.agents/skills/prototype/UI.md`). 프로토타입 코드는 버리고 결정만 옮긴다.
  - "FeedbackOps 서브모듈 경계": 서브모듈 안 수정이나 참조 커밋 갱신은 **요청된 범위에서만**. 통합 계약이 충돌하면 한쪽을 임의로 고치지 않고 명시적으로 결정한다.
  - "작업 관리": 이슈에서 시작하고, 대안이 있는 결정은 ADR(+05 행)로 남긴다.
- MVP는 데스크톱 웹만. 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다 — 가져오기의 대상은 **플랫폼 공통 부품·셸·토큰**이다.

## 현재 상태 (2026-10-03)

- **FeedbackOps 디자인은 사실상 끝났다**: FeedbackOps#685(출시 전 UI 점검)·#672(타이포 토큰) 닫힘. #52의 보류 사유("수정 중")는 해소 — 재개 여부만 사용자가 정하면 된다.
- 서브모듈 `products/feedbackops` 고정 커밋 `6a0c7f8b`는 `origin/develop` `dfd6d17b`보다 **227커밋 뒤**다.
- 버전 차이(`@fops/ui` ↔ 플랫폼): Tailwind 3.4.17(preset) ↔ 4.3.3(`@tailwindcss/vite`·`@theme`), tailwind-merge 2.5.5 ↔ ^3.7.0(3.x는 Tailwind v4 전용), lucide-react 0.469.0 ↔ ^1.48.0(메이저 차이), React ^19.0 ↔ ^19.3(호환). 토큰 **이름**은 같고(ADR-0021 이름) **값**이 다르다(FeedbackOps Samsung 블루 `#1428a0`·밝은 사이드바 / 플랫폼 `#2563eb`·어두운 사이드바).
- 사내 적용 트랙: 플랫폼 쪽 에이전트 작업은 끝났다(#152 적합성 묶음, #153 운영 조립 분리 — ADR-0009 Candidate, #167·#183·#186 Scope 실패·취소 판정, #149 전송 형식 초안 — Candidate). 남은 것은 사람 결정(아래).
- CI: `Platform workspace`(test 단계 `--concurrency=2`, `check:prod-graph`와 강제 실패 단계 포함)·`Platform contracts (E2E)`(42개)·`CSS selectors (build diff)`(선택자 제거는 라벨 `css-removal-ok`)·Unit A–C·Python codec·`PR checklist`.

## 다음 세션 할 일 — 순서대로

1. **사용자 결정부터(가져오기 전에 필요)** — 답을 받은 뒤 ADR로 남긴다.
   - D1 방식: **A안(추천)** 플랫폼을 Tailwind 3.4로 내리고 `@fops/ui`(토큰·preset·shadcn·부품) 원본을 그대로 사용 / B안 v4 유지·복사 변환(복사본이 갈라짐) / C안 FeedbackOps를 먼저 v4로(출시 전 FeedbackOps를 건드림).
   - D2 참조: `@fops/ui`를 서브모듈 패키지로 **직접 참조(추천)** / 복사.
   - D3 서브모듈 참조 커밋을 최신 develop으로 갱신해도 되는가(227커밋).
   - D4 범위: 무엇을 FeedbackOps 것으로 바꾸고(토큰 값·preset·프리미티브·셸 모양) 무엇을 플랫폼이 계속 소유하는가(공통 컴포넌트의 계약 — `PlatformDataTable`·`DetailDrawer`·`StateView` 등, 차트 색·Context 바·KPI 같은 플랫폼 확장). lucide는 어느 쪽 버전으로 맞출지.
2. **짧은 소비 가능성 검증(버리는 브랜치)**: 플랫폼 워크스페이스에서 `@fops/ui`를 import해 빌드·타입·테스트가 도는지 — pnpm 워크스페이스 포함 방법, `@fops/shared` 등 연쇄 의존, 위 버전 차이(특히 tailwind-merge·lucide), Tailwind 3.4 + PostCSS preset으로 `@ap/ui`·앱 `style.css` 전환 범위. 결과는 #52에 남긴다.
3. **기준 캡처**: 지금 셸 + 대표 화면(분석·관리·목록) 스크린샷 — 프로토타입 비교와 CSS selector diff의 기준.
4. **프로토타입**: 실제 앱 위 `?variant=`(현재 vs FeedbackOps 그대로, 필요하면 절충안) → 사용자 컨펌. UI/UX 리뷰는 Sol 6.1 xhigh.
5. **구현** → #53 DESIGN.md 개정(컨펌된 방향) → #156 레이아웃 슬롯 컴포넌트.

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
