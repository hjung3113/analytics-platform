# Handoff — 2026-09-22 문서 운영 설계 완료 / 다음은 M1

## 다음 세션의 목표와 권한

최신 사용자 요청: **문서 운영 설계 산출물을 커밋하고, 다음 세션부터 실행할 수 있도록 HANDOFF를 갱신한다.** 다음 작업은 아래 M0 확인 후 **M1 문서 이행**이다. 이번 세션은 준비·기록·커밋까지만 수행했으며 M1 자체는 아직 실행하지 않았다. 제품 구현, 새로운 제품/기술 선택, 문서 대규모 이동, 서브모듈 변경은 다음 작업에 포함되지 않는다. 이번 커밋 요청은 push 요청이 아니다.

아래 ‘이전 세션 기록’의 추가 리서치 우선 안내는 당시 이력이다. 현재 작업 순서는 이 상단 안내를 따른다. 과거의 체크박스 동시 갱신 지시도 설계 결정과 구현 완료를 같은 상태로 취급하는 근거가 아니다.

## 시작할 때 읽을 자료

1. 현재 `AGENTS.md`, `git status --short`, `git log -3 --oneline`, `git submodule status`, [docs/INDEX.md](docs/INDEX.md).
2. [문서 운영 종합 안내](.agents/reports/doc-operations-2026-09-22/README.md).
3. [첫 이행 지시서](.agents/reports/doc-operations-2026-09-22/migration-plan.md)의 M0/M1과 ‘첫 번째 작업’ 전체.
4. [현황 문제 목록](.agents/reports/doc-operations-2026-09-22/current-map.md), [운영 모델](.agents/reports/doc-operations-2026-09-22/operating-model.md), [대표 작업 검증](.agents/reports/doc-operations-2026-09-22/representative-validation.md)의 V1/V2.
5. 판단하는 문구의 실제 원문: 특히 [06 전역 계약](docs/06_platform_ui_contract.md) §6.1–6.4 및 03/04/07 해당 절. 보고서 요약으로 원문을 대신하지 않는다.

## 바로 실행할 첫 단위: M1

쓰기 범위는 다음 네 문서로 제한한다.

- `docs/INDEX.md`: DESIGN/PLATFORM_REQUIREMENTS/HANDOFF의 역할과 실제 상대 링크를 추가하고 메뉴 구현 읽기 경로를 06 Kernel 계약부터 안내한다.
- `docs/03_backend_stack.md`: 원천 wall-clock 의미를 보존하고, 이미 결정된 시간 메커니즘과 실제 TZ/날짜 의미 Open을 분리하여 06 §6.3으로 연결한다.
- `docs/04_frontend_ui_ux.md`: URL 버전·오류 등 확정 메커니즘을 Open으로 읽게 하는 안내를 정정한다. 공개 이름·artifact 후보 상태는 유지한다.
- `docs/07_app_shell_wireframe.md`: §6의 오래된 Open 안내를 원본 상태에 맞추고, §7 시나리오 참조와 §8 혼합 상태가 유지되는지 확인한다.

상세 문안·수용 기준·되돌림은 이행 지시서에 있다. 새 파일 구조나 전면 metadata부터 설치하지 않는다. M1 완료를 전체 문서 정합성 해결이나 제품 구현 승인으로 보고하지 않는다. DESIGN 내부 stale 표현, REQUIREMENTS 정리, 05 상세 원본 이관 등은 후속 단계다.

## 반드시 보존할 경계

- 06은 전역 UX·Context·URL·Scope·Menu Extension 원본이다. DESIGN은 시각 token/render 원본이며 06의 최소 기준·상태·접근성 의무를 임의 변경할 수 없다.
- **현재 05는 상태 목록뿐 아니라 폴링·DB 접근·R/H 상세 원본도 소유한다.** 색인으로 축소하며 본문을 삭제하지 않는다. M1에서 05/06/DESIGN 본문을 이관하지 않는다.
- Decided/Candidate/Open은 문단별로 구분한다. 단일 요청 scopeId·서버 재검증은 Decided, hierarchy·상속·복수 선택·소속 규칙은 Open이다. 기술 후보·필드명·숫자를 이번 정정으로 승격하지 않는다.
- R 부재 시 유효한 독립 defaultRangeTo 물질화는 허용하고 자동 재집계만 보류하는 예외, 단일 설비 naive 조회, 집합/단일 query key의 다른 중복 규칙을 유지한다.
- 셸 270/54, 기본 표 최소 32, compact 시각 목표 25, coarse-pointer target 44를 재결정하지 않는다.
- FeedbackOps는 독립 제품이며 현재 gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`다. 내부 수정·pin 갱신 금지. parser도 독립 upstream이다.

## 검증과 완료 보고

M0에서 사용자 dirty/untracked 변경을 보존하고 달라진 관련 원문만 재검토한다. M1 후에는 링크 대상·기존 heading·§참조, before/after 의미·예외, `git diff --check`, V1/V2 문서 워크스루를 확인한다. 네 파일 밖 변경이 없는지 점검하고 미결·미실행을 보고한다. runtime 검증을 수행했다고 쓰지 않는다. 후속 commit/push는 해당 세션 지시 범위를 따른다.

조사 snapshot 기준 HEAD는 `2d6fe5ad9f9d610e45ba028930f7c2effdad9d4a`다. 조사 종료 시 471개 원본 무변경, §6.3 사본 일치, 제한된 링크 검사·음성 점검 4개·외부 사본 7개 로컬 manifest 일치를 확인했다. **이 HANDOFF는 이후 사용자 요청으로 갱신했다.** 따라서 조사 snapshot과 비교하면 HANDOFF 차이와 기록 커밋에 따른 HEAD 차이는 예상된다. docs 계약의 추가 차이까지 자동 허용하지 않는다.

`source-snapshot.json`/`validation.json`은 조사 종료 증거로 보존한다. `validate.py`는 실행 시 validation.json을 덮어쓰고 이후 HANDOFF drift를 보고하므로, 다음 세션에서 통과시키려고 snapshot을 갱신하지 않는다. 새로운 작업의 검증 결과는 별도 작업 기록에 남긴다.

## 완료 산출물과 남은 입력

주 에이전트·Grok 4.6 High·GLM 5.3 Max의 독립 분석/반박/재응답과 Luna Max 조사·최종 검토를 마쳤다. [토론 판단 기록](.agents/reports/doc-operations-2026-09-22/discussion/DECISIONS.md)에 철회·채택·보류 이유가 있다. 원본 인접 소비자 포인터는 한 계약 시범 권고이며 영구 위치는 실제 운영으로 평가한다.

[사용자 인터뷰 항목](.agents/reports/doc-operations-2026-09-22/interview.md)에 첫 업무·결정 주체, Scope/시간/운영 입력, 팀 검증 기록 위치 등을 정리했다. 답변 없이 M1은 진행할 수 있다. 답변 의존 제품 범위는 Open으로 유지한다. [검증 기록](.agents/reports/doc-operations-2026-09-22/verification.md)에 원문 재확인 범위와 미검증 사항이 있다.

---

## 이전 세션 기록 — 당시 안내이며 현재 실행 지시 아님

아래 원문은 조사 맥락과 중요한 근거를 보존하기 위한 이력이다. 현재 목표와 충돌하는 부분은 위 최신 안내를 따른다.

# Handoff — 2026-09-22

## 다음 세션의 목표

사용자 요청: **기존 프로젝트 활용 리서치를 더 진행하고, 아이디어를 문서에 넓게 모아둔 뒤 나중에 한 번에 정리한다.** 다음 세션에서 바로 구현하거나 후보를 확정하지 않는다.

시작할 때 `git status`, `git log`, `git submodule status`로 현재 상태를 확인한다. 이 노트는 기록이며 Git 상태의 대체물이 아니다.

## 이번 세션의 진행과 합의

- 플랫폼 구현 전 공통 규약(책임·사용자·Scope·권한·메뉴·URL·Context·셸·UI·감사 등)을 먼저 정하는 방향에 합의했다. 기존 FeedbackOps의 구현을 활용하되 무조건 새로 만들거나 전부 플랫폼 공통 코드로 승격하지 않는다.
- FeedbackOps 원본 개발을 유지하며 참고하기 위해 `products/feedbackops/` 서브모듈을 추가했다. 원격은 `hjung3113/FeedbackOps`, 추적 브랜치는 `develop`, 최초 고정 커밋은 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`다.
- 연결·문서 안내는 `ad5b18b`로 커밋하고 `origin/main`에 푸시했다. 플랫폼 문서는 기존 `docs/`에 유지했다. workspace·서버·DB·배포 통합 여부는 미정이다.
- 사용자 지정 **Luna Max**에게 원격/로컬 본인 작성 저장소 조사를 맡겼다. 원격 49개 중 fork 3개를 제외한 소유 저장소 46개를 분류했다. 세부 소스 검토 깊이는 저장소마다 다르며 전수 실행 검증은 아니다.
- 루트 에이전트는 원격 목록과 `vocpage` 알림·승인 트랜잭션, `jira-voc-nexus` 재처리·근거 없는 경우의 동작을 직접 확인했다. 보고서 전체의 모든 주장을 독립 검증한 것은 아니다.
- 사용자 최신 의견: `vocpage`는 FeedbackOps로 대체됐지만, **FeedbackOps에 없는 유용한 부분이 있으면 선별해 가져올 수 있다.** 일괄 제외나 전체 병합이 아니다.
- 조사 결과를 아래 문서로 남겼다. 현재 요청은 문서와 이 HANDOFF의 **커밋**이며 추가 푸시는 요청되지 않았다.

## 읽을 자료

1. `docs/INDEX.md` — 설계 문서 진입점.
2. `docs/integration/repository-layout.md` — 폴더별 역할과 서브모듈 갱신 절차.
3. `docs/integration/repository-ideas.md` — 최신 사용자 의견을 반영한 브레인스토밍 모음. Candidate이며 구현 승인이나 로드맵이 아니다.
4. `.agents/reports/repository-integration-candidates-luna.md` — 상세 조사, 커밋·소스 근거, 전체 후보 목록, 검증 한계.
5. `docs/06_platform_ui_contract.md` — 전역 계약의 authoritative source.

## 추가 리서치의 출발점

- **VOC bot의 정확한 정체:** 조사한 계정 목록에 별도 `voc-bot` 이름은 없었다. 다른 이름/로컬 프로젝트일 수 있으며 아직 특정하지 못했다. `vocpage`나 `jira-voc-nexus`를 그 봇이라고 단정하지 않는다.
- **FeedbackOps 대비 실제 차이:** `vocpage`의 알림 수신자·읽음·반복 억제, payload review, 외부 마스터 snapshot과 `system-survey`의 임시저장/첨부 UX를 FeedbackOps 현행 코드와 비교한다. 없는 가치만 후보로 남긴다.
- **jira-voc-nexus:** event ID/내용 지문 기반 replay·conflict, 근거 제한 초안과 대상별 제안은 참고 가치가 있다. 실제 Jira ingress·production ACL·게시 서비스가 있는 것으로 해석하지 않는다.
- **FileGateway:** 원문 로그·설정 조회의 별도 서비스 연동 후보. Scope/권한과 wall-clock 시간 변환, 실제 제품 수요를 확인해야 한다.
- **ProjectGraph:** 정적 변환 계보와 evidence 산출물 참고 후보. 실제 실행 데이터의 lineage나 플랫폼 Data Trust를 이미 제공한다고 단정하지 않는다.
- **standard-log-lifecycle / log-contract-lens:** 검증 회차·결함·원본-필드 진단 UX 설계 참고. 구현 성숙도와 실제 메뉴 수요를 구분한다.
- **agent 계열:** 제품에 통째로 편입할 근거는 현재 약하다. 버전/내용과 검증 증거 결속, 결과물 해시 기록, 제안과 사람 승인 분리 원칙 정도를 참고한다.
- **parser:** 독립 upstream과 플랫폼 소유 view/mart 계약을 유지한다. 관련 자료를 참고한다는 이유로 파서 내부 책임을 흡수하지 않는다.

추가 조사에서도 본인 작성 근거, 실제 구현 여부, FeedbackOps와 중복, 재사용 방식, 미확정 질문을 함께 기록한다. 원본 저장소는 읽기 전용으로 두고 새 submodule 추가·코드 변경은 별도 요청이 있을 때 진행한다.

## 검증과 보존 사항

- 문서 링크 확인, `git diff --check`, FeedbackOps `check-boundaries`는 이번 세션에서 통과했다. 마지막 두 검사는 각각 문서 변경과 서브모듈 연결 단계에서 수행했다.
- 후보 프로젝트의 빌드·DB·Jira·FTP·실서비스 실행 테스트는 하지 않았다.
- FeedbackOps 원본 `/Users/hyojung/Desktop/2026/FeedbackOps`의 미추적 `docs/.superpowers/` 등 로컬 변경은 가져오거나 수정하지 않았다. 다른 후보 저장소의 dirty 상태도 보존했다.
- 원격 후보 수·커밋·브랜치·구현 상태는 조사 시점 정보이므로 후속 판단 전에 필요한 범위만 갱신한다.

## 이전 설계 세션의 결정과 미결 질문

셸 치수(사이드바 270px·헤더 54px)와 테이블 행 밀도(최소 32px, 25px는 compact 시각 목표)는 이전 세션에서 Decided로 반영됐다. 이번 세션에서 변경하지 않았다. `PLATFORM_REQUIREMENTS.md`의 나머지 질문은 아래와 같이 남아 있다. 다음 세션은 먼저 추가 리서치를 진행하고, 결정 정리는 사용자와 이후에 한다.

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
