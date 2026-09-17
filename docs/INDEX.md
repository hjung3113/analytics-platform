# 문서 인덱스

이 레포는 `context_recognized_parser`(별도 레포)가 적재한 데이터를 소비하는 분석 플랫폼의 개념 설계 문서다. 아직 코드는 없다 — 여기 문서들이 구현 전 합의된 설계다.

## 역할별 진입점

| 역할 | 먼저 볼 문서 | 같이 볼 문서 |
| --- | --- | --- |
| 전체 / 기획(PM) | `00_overview.md` | `02_domain_menus.md`, `05_roadmap_and_open_questions.md` |
| 기획(PM) — 메뉴/로드맵 확정 | `02_domain_menus.md` | `05_roadmap_and_open_questions.md` |
| 백엔드/인프라 | `01_architecture_and_data_contract.md` | `03_backend_stack.md` |
| 프론트엔드 | `04_frontend_ui_ux.md` | `02_domain_menus.md` (딥링크·필터가 걸리는 메뉴 구조) |
| 신규 합류자 | `00_overview.md` → 자기 역할 문서 순서로 | — |

## 문서 목록

- `00_overview.md` — 목적/범위, 리뷰 반영 핵심 발견(1차·2차), YAGNI 제외 목록
- `01_architecture_and_data_contract.md` — 전체 아키텍처(view/mart), 파서-플랫폼 데이터 계약 리스크, mart 재계산·집계 가능성·마스터 소유권
- `02_domain_menus.md` — 플랫폼 코어 공통 기능, 도메인 메뉴 그룹(설비관리/기준정보관리/생산성분석/지표관리/공지/VOC)
- `03_backend_stack.md` — 백엔드/DB/인증/마이그레이션 기술 스택, 재현성·시간 계약
- `04_frontend_ui_ux.md` — 프론트 기술 스택, UI/UX 리서치(상용 SaaS 참고), 정보구조, 딥링크, 페이지별 UI 패턴, 차트/주석 설계
- `05_roadmap_and_open_questions.md` — Phase 0~4 로드맵, Open Questions

## 원본

이 문서들은 Claude Docs에서 진행된 설계 세션(1차 리뷰: grok-4.6/gpt-6-astra/glm-5.3-flash, UI/UX 리서치: codex gpt-5.6-luna, 2차 리뷰: grok-4.6/gpt-6-astra/glm-5.3-flash)의 최종 산출물을 역할별로 분리해 옮긴 것이다. 원본 통합 문서: https://claude.ai/code/artifact/005e792f-7bda-4f27-b9fd-e89b4474fead
