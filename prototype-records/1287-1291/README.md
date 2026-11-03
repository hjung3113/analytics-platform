# #1287–#1291 시안 기록 (버리는 코드, 병합 안 함)

- 비교 페이지: `index.html` (Artifact https://claude.ai/artifact/QZEEkPrA34idxvrz4Xr82e), 설명 `captions.md`, 조사 `research.md`, 캡처 `img/` (1440×900, ego-browser).
- 시안 코드: `apps/platform-web/src/proto1287/`(① 배치, ② 직속 VOC·공지 — 화면 안 예시 데이터), `packages/adapters/feature-bridge/src/feature/FeatureScreenPage.tsx`·`operator-menus.ts`, `apps/platform-web/src/style.css` 끝(③ 틀). 주소 `?variant=A|B|C`(한 번 읽어 세션에 유지, `?variant=now`로 해제).
- 실행: `app-preview.py start <checkout> --backend --env <verify env> --seed` 실서버 + 버리는 DB. 컨펌된 안은 이 코드를 버리고 새로 구현한다.
