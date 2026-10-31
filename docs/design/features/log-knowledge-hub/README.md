# Log Knowledge Hub — 설계 문서 색인

> **Status: Candidate / 구현 전.** 이 문서 디렉터리는 공개 저장소에서 검토 가능한 **합성/비기밀 설계**만 담는다. 기술 결정은 실제 플랫폼 코드·Decided ADR이 우선하며, 문서 PR은 설계 검토용이다.

## 문서 권위

1. **[design-v0.6-candidate.md](./design-v0.6-candidate.md)** — **최신 설계 기준선**. 플랫폼 직접 탑재, Fastify/DB/API/ACL, 40개 **후보** 테이블, 트랜잭션·검색·검수 및 2026-11-01 재검수 내용. §14에 검토 수정·미결 게이트 명시.
2. **[product-ux-reference-v0.4.md](./product-ux-reference-v0.4.md)** — 제품 결정 1–17번, 카탈로그 관리 5단계 UX(§15), 상세 화면/와이어프레임(§16), 합성 검증 시나리오(§17). **독립 실행·이중 Shell/서버 관련 문장은 폐기된 역사적 내용**이며 v0.6보다 우선하지 않음.
3. 별도 `Log_Knowledge_Hub_UI_Reference_v0.4.html` 정적 그래픽 레퍼런스는 이번 PR에 포함하지 않음. 플랫폼 실제 UI/코드를 검증한 것으로 간주하지 말 것.

## 추적

- **Epic:** [#1192](https://github.com/hjung3113/analytics-platform/issues/1192)
- **P0:** [#1193](https://github.com/hjung3113/analytics-platform/issues/1193) 플랫폼/DB, [#1194](https://github.com/hjung3113/analytics-platform/issues/1194) 카탈로그, [#1195](https://github.com/hjung3113/analytics-platform/issues/1195) Import
- **P1:** [#1196](https://github.com/hjung3113/analytics-platform/issues/1196) Spec, [#1197](https://github.com/hjung3113/analytics-platform/issues/1197) Item, [#1198](https://github.com/hjung3113/analytics-platform/issues/1198) Draft/승인, [#1199](https://github.com/hjung3113/analytics-platform/issues/1199) 검색
- **P2:** [#1200](https://github.com/hjung3113/analytics-platform/issues/1200) Viewer/외부 근거, [#1201](https://github.com/hjung3113/analytics-platform/issues/1201) 통합 인수
- **기존 공통 기능:** [#1108](https://github.com/hjung3113/analytics-platform/issues/1108) 계층 탐색, [#1087](https://github.com/hjung3113/analytics-platform/issues/1087) 분석 Site 권한(별도)

## 공개·구현 원칙

- 기밀 설비 원본 로그·개인정보·실제 소프트웨어/도면·사내 주소·서비스 자격증명·사내 접속정보를 추가하지 않는다.
- 단계별 PR에서 P0→P1→P2 순으로 **필요 스키마만** 생성한다. 명세/설계 문서의 SQL 조각을 전체 실행 migration으로 오인하지 않는다.
- 구현 시 `apps/platform-api/AGENTS.md`, `menus/AGENTS.md`, `docs/architecture/platform-api/*`, `docs/agents/feature-implementation.md`를 확인한다. 테스트는 격리 DB에서 실행하며 근거를 각 PR에 남긴다.
