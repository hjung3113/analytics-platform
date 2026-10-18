## analytics-platform 부록 (AP addendum)

- 기준 ref: `origin/main` (`git diff origin/main...HEAD`).
- 코디네이터가 돌린 검사(패키지·루트 검사, E2E, 변이 검사)와 화면 증거는 `.review/W-<n>-VERIFY.md`에 있다.
- 작업 파일에 성능 관점(perf)이 있으면 조회 횟수·불필요한 재조회·재렌더링·번들 크기 변화도 본다.
- **계약·테스트 관점**: 건드린 06 계약(URL·Context·권한·Scope·조회 수명주기·메뉴 간 연결)과 관련 ADR을 따라가 본다.
- **아키텍처 관점**: 의존 방향(`contracts → ui/kernel → components → shell → apps`), Kernel·공통 컴포넌트가 메뉴와 mock을 모르는지, 공통화 기준(06 §24 — 소비자 2–3곳), FeedbackOps primitive는 `@ap/ui`로만.
- UI(UX 리뷰가 없을 때만): 레이아웃·위계·한국어 화면 문구·접근성(이름, 포커스, 키보드)·`DESIGN.md`와 이웃 화면과의 일관성.
- 보고 기준의 AP 표기: `fix size: <파일>, ≈<줄>`과 `사용자 결정 필요: 예/아니오`(공통의 `owner decision needed`와 같은 뜻).
- 보고서: 지적이 없으면 없다고 쓴다. 지적 칸은 `수정안` 포함.
