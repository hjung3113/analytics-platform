# 00. 개요 (전체 담당자 공통 진입점)

2026-09-17 작성. Claude Sonnet 5 + grok-4.6 / gpt-6-astra / glm-5.3-flash(1차·2차 교차 리뷰) + codex gpt-5.6-luna(UI/UX 리서치) 공동 작업.

## 목적/범위

이 분석 플랫폼은 `context_recognized_parser`(별도 레포)가 적재한 결과 데이터(job/wafer/prc_l1/prc_step/fnc/xfr/lot 등)를 소비하는 **별도 레포/제품**이다. 파서 스키마 계약에만 의존하고 파서 내부 정규화/판정 로직에는 관여하지 않는다.

범위: 설비 등록/삭제/수정 등 마스터 관리, 기준정보관리, 생산성 분석, 지표관리, 공지, VOC를 아우르는 **다중 메뉴 플랫폼**. 개별 화면보다 메뉴 간에 공유되는 플랫폼 공통 기능(필터 컨텍스트, 필터 포워딩, 위젯 프레임워크, 지표 정의 관리 등)의 설계가 핵심.

## 리뷰 반영: 핵심 발견

### 1차 리뷰 (grok-4.6 / gpt-6-astra / glm-5.3-flash 교차 검토)

세 리뷰 모두 같은 곳을 가장 크게 지적했다: 파서 레포에 이미 `docs/23_secondary_processing_ideas.md`(파서 외부 소비 계층 설계, 구현 계약은 아님)가 `equipment_master`(유효구간 이력), `occurrence_directory`, `module_class_map`, `(equipment_id, anchor)` 전용 조인 규칙, mart 재계산 요구, 커버리지/Unmapped 원칙을 이미 구체적으로 설계해뒀다. 이 초안이 그걸 참조 없이 더 약한 버전으로 재도출한 부분(설비관리를 단순 CRUD로, View만으로 계약 안정화가 끝난다고 서술)이 있었다. **`docs/23`을 이 플랫폼 설계의 authoritative 입력으로 삼는다.**

또한 "생산성 분석"의 가동률/수율은 현재 파서 데이터만으로 못 낸다는 지적도 세 리뷰가 공통으로 확인했다(docs/23 제안 1/2) — 물리 점유율/관측 Process 시간/사이클타임 분포는 가능하지만 SEMI E10형 가동률·수율은 설비 상태 이력·외부 라벨 데이터가 전제된다. 메뉴/지표 이름을 실제 계산 가능 범위에 맞췄다(→ `02_domain_menus.md`).

리뷰 간 불일치: 백엔드(FastAPI 유지 여부는 조건부 — codex는 팀 언어 구성에 따라 ASP.NET Core/NestJS도 동등 후보라고 보고, omp는 FastAPI+SQL-first면 유지 타당하다고 봄), 차트(Plotly의 그리기 실력에 대해 원문의 표현이 부정확하다는 점은 codex·omp 둘 다 지적).

### 2차 리뷰 (공지·VOC 추가 + UI/UX 리서치 이후 재검토)

공통으로 잡은 가장 심각한 문제: 딥링크 설계의 "UTC 저장값" 전제가 파서의 실제 시각 계약(타임존 없는 설비 wall-clock)과 충돌 — UI/UX 리서치 작성 시 시간대 전환 규칙 없이 UTC를 전제해 생긴 오류였다(정정된 wall-clock 시간 계약은 `06_platform_ui_contract.md` §6.3에서 Decided).

또한 VOC를 "변경 감사 재사용"만으로 떼워낸 것은 과했다 — 접수/담당자/상태전이/댓글은 VOC 자체 모델이고, Audit Trail은 그 위에 겹치는 변경 이력일 뿐이다(→ `02_domain_menus.md`). 공지·VOC·주석이 로드맵 어느 Phase에도 명시되지 않은 점도 세 리뷰 공통 지적 — 로드맵에 반영(→ `05_roadmap_and_open_questions.md`).

omp는 추가로 이 문서의 `docs/23` 인용 정확성 오류 2건을 찾았다 — `docs/23` §2.5의 "anchor rename 구현 대기" 서술은 실제로는 이미 완료된 stale 문구이고(실제 진실은 `docs/11` §14.1), "PortId → ModuleIsPort 트리플릿"을 그 §14.1에 묶은 것은 오류로 실제는 `docs/09` §8.2 + `docs/22` §1.1이다(→ `01_architecture_and_data_contract.md`에서 정정).

## 명시적으로 제외 (YAGNI, 1차 리뷰 공통 의견)

승인 워크플로우(감사+버전 관리로 대부분 대체, 규제 요구가 나오면 재검토), 다국어(문자열 외부화만 저비용으로 미리 준비), 범용 알림/알람 룰 엔진(적재 중단·집계 실패 같은 운영 알림부터 넣고 공정 이상 알림은 지표·임계값이 검증된 후), 외부 BI 연동(mart/view를 SQL로 질의 가능하게 문서화해두면 나중에 붙이는 비용이 낮음), 스케줄 리포트, 처음부터 자유 SQL/코드를 받는 지표 DSL(감사 불가·주입 위험 — 제약된 표현식/AST로 시작해 필요해지면 확장).

## 문서 구조

역할별로 나눠져 있다 — `docs/INDEX.md` 참조.
