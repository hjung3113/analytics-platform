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
