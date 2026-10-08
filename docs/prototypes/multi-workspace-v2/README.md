# Multi-workspace v2 — clickable UI prototype

**Status:** 사용자 승인 UX 방향의 참고 프로토타입. 데이터·권한·backend·운영 동작의 원본 아님.

- [인터랙티브 HTML 열기](index.html)
- [멀티 워크스페이스 상세 설계](../../15_multi_workspace_ui.md)
- [Navigation/Scope 계약 원본](../../06_platform_ui_contract.md)
- [결정 근거 ADR-0026](../../adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)
- [구현 추적 #249](https://github.com/hjung3113/analytics-platform/issues/249)

## 실행

`index.html`은 React 빌드와 무관한 **단일 HTML(내장 CSS/JS)** 시안이다. 파일을 내려받아 데스크톱 브라우저에서 열 수 있다. 실제 데이터를 읽지 않고, 로컬 브라우저에서 임시 데모 항목을 추가한다. 샘플 레코드/수치는 합성 데이터다.

## 직접 확인할 시나리오

1. **플랫폼 홈:** 4개 업무 공간 + 개발·운영 콘솔을 확인한 뒤 표준 로그 개발로 진입.
2. **로그 개발:** 전용 사이드바에서 개발 현황/모델/검증/협력사 메뉴를 전환하고 우측 상세를 확인.
3. **시스템 전환:** 레일로 생산성 분석·지표관리·개선 실행을 이동. 각 Sidebar가 서로 다른 메뉴로 바뀌는지 확인.
4. **시스템별 협업:** 로그 개발에서 VOC·Task·설문으로 진입하면 '관리 대상: 표준 로그 개발'이 표시되는지 확인.
5. **전체 협업:** 권한자용 전체 협업 허브 시안에서 VOC/Task/설문과 대상 시스템 필터를 확인.
6. **교차 링크:** 관련 시스템 화면으로 이동 후 출발 화면 복귀 동작 확인.
7. **검색:** Ctrl+K로 워크스페이스·메뉴를 검색.
8. **협력사 검토:** 샘플 CSV 내보내기(실제 업무 파일은 XLSX 예정; 보안메일 연동 없음).

## 중요한 구현 제한

- **픽셀 정본 아님:** HTML의 rail 56px, sidebar 252px, 별도 topbar 56px는 mock 편의용. 실제 앱의 확정 계약은 rail 52px, sidebar 240px/접힘 56px, 별도 topbar 없이 50px 페이지 헤더이다([06 §7](../../06_platform_ui_contract.md#7-application-shell)).
- **디자인 시스템 정본 아님:** 색상은 FeedbackOps 토큰의 화면 모사다. 구현은 `@fops/ui`를 `@ap/ui`로 소비하고 기존 셸을 확장한다.
- **데모 데이터:** 로그인·역할/권한·SSO·API·저장소 연동 없음. 화면에 보이는 시스템별 스코프는 서버 보안의 증거가 아니다.
- **협업 도메인:** FeedbackOps는 기존 백엔드·권한을 유지. 공간-Managed System의 식별 관계/전체 허브 권한은 미결이다.
- **실행 순서:** 계획/시안 → 실제 앱 `?variant=` 비교 및 승인 → 계약/권한 확인 → 구현·E2E. 새 제품의 전체 화면을 이 HTML에서 바로 복사해 구현하지 않는다.
