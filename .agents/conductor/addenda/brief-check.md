## analytics-platform 부록 (AP addendum, base ref `origin/main`)

공통 항목에 대한 AP의 경로·예시:

- 항목 2 (규칙은 복사): 계약 원본은 `docs/contract/platform-ui-contract.md` 해당 절, 관련 ADR, `packages/contracts`, `registry.ts`, mock-server 엔드포인트 선언(`apps/platform-web/src/dev/mock-assembly.tsx`의 `MOCK_ENDPOINTS`, `server-conformance.test.ts`의 `PARAMS`)이다. 키 개수·필수 여부·범위가 이것들과 일치해야 한다.
- 항목 1: 이름 대상에 i18n 키가 들어간다. 바닥 문구: "공통 X로 파싱한다"고만 쓰면 작업자가 X를 지어낸다.
- 항목 8: 작업자가 돌릴 수 있는 테스트 파일을 명시해야 한다(E2E는 코디네이터 몫이다).
- 항목 11: 예시 — FeedbackOps s70: `pnpm patch --offline`은 없다.
- 항목 12: 예시 — FeedbackOps s70: #995의 첫 설계 둘과 #997의 첫 수정이 render 중 ref/DOM 접근에서 깨졌다.
- 보고서의 AP 형식: 판정 줄(`ready`/`fix brief`) 다음 finding을 리뷰 라운드 비용 순으로. 맨 끝은 작업 파일의 sentinel.
