# Handoff — 2026-09-21 (세션 3)

이 파일은 일회성 세션 인계 노트다 — 다음 세션(사람이든 에이전트든)이 한 번 읽고, 유효한 내용은 memory나 다른 문서로 흡수한 뒤 지워도 된다.

## 이번 세션에서 한 일

1. 이전 세션(2026-09-20)이 만든 `PLATFORM_REQUIREMENTS.md` §0 "지금 바로 결정해야 하는 문서 충돌 2건"을 사용자와 함께 결정.
   - 셸 치수: `DESIGN.md` canonical(사이드바 270px · 헤더 54px) 채택. `docs/06_platform_ui_contract.md` §7을 이 값으로 갱신(Baseline → Decided로 표기 변경).
   - 테이블 행 밀도: `DESIGN.md` table-density(최소 32px, 25px는 compact 시각 목표) 채택. `docs/06_platform_ui_contract.md` §15를 이 값으로 갱신.
2. `PLATFORM_REQUIREMENTS.md` §0 두 항목 체크 완료로 표시, 결정 내용 기록.
3. `docs/05_roadmap_and_open_questions.md` 결정 상태 표에 이 결정을 Decided 행으로 추가(문서 소유권 구조: `06`이 전역 계약, `05`가 결정 상태 추적).
4. 사용자가 이 시점에서 커밋/푸시하고 다음 세션에서 이어가기로 결정 — Open Questions 15개 항목은 아직 다루지 않음.

## 현재 저장소 상태

- `docs/06_platform_ui_contract.md`, `docs/05_roadmap_and_open_questions.md`, `PLATFORM_REQUIREMENTS.md` 수정, `origin/main`에 커밋·푸시 완료(이 파일 작성 시점 기준 — 실제 커밋 여부는 `git log`로 확인).
- `.agents/reports/requirements-*.md`, `DESIGN.md`는 변경 없음.

## 다음 세션에서 할 일

**`PLATFORM_REQUIREMENTS.md` 하단 "Open Questions (통합)" 15개 항목을 순서대로 사용자와 리뷰하며 결정한다.** (§0 셸 치수/밀도는 이미 완료 — 1번 항목은 스킵)

권장 순서(이전 세션이 남긴 순서):
2. Scope 도메인(계층·상속·복수 Scope·설비 소속 변경)
3. 시간 의미(TZ 실제 값, timeDomain assertion 공급자, 교대일/영업일)
4. 운영 수치(`defaultRangeTo`, 지연완료 창 `H`, 폴링 주기, 최대 조회량/timeout)
5. 인증·조직·배포(SSO, 백엔드 언어, 온프렘/클라우드, 브라우저 지원, 동시 사용자/보존기간, 멀티테넌시)
6. 상태 근거 서비스(statusSource/observedAt 공급자)
7. 공개 계약 산출물 형식(OpenAPI/JSON Schema/codegen, URL `v` sunset)
8. 디자인 바인딩(다크모드 수요, 아이콘, UI 프리미티브, 차트 라이브러리 POC, CJK 폰트, 기간 프리셋 의미)
9. 공지·알림(배너 위치/조건, 알림 벨 의미)
10. 메뉴 활용률 목적/범위(보존기간, 열람 권한, 익명화)
11. 업무 모델 세부(필드 소유권, VOC 담당 조직/전이 예외, 마스터 필드 원천 소유권)
12. 운영 완료 기준(RTO/RPO, 감사 보존기간, 대량 작업 실패 재개 책임)
13. 추가 메뉴 착수 조건(알람/리포트빌더/저장된 뷰 수요 확인)
14. Donut/Gauge 허용 경계
15. 보조기술 사용자 실존 여부

각 결정이 날 때마다 `docs/05_roadmap_and_open_questions.md`(결정 상태 추적)와 `PLATFORM_REQUIREMENTS.md`(체크박스)에 함께 반영한다 — 이번 세션에서 한 방식과 동일.

## 참고

- 이 파일 자체는 다음 세션이 흡수한 뒤 지워도 된다(이전 세션 관행과 동일).
