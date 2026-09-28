# Handoff — 2026-09-29 다음 세션: #49 권한/역할 관리 화면

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고 PR에 `Closes #n`(합의 대기 등 열어 둘 때는 `Refs #n`)을 적는다.
  - 확정 시 공통화 판단·문서 갱신·로드맵 갱신을 확인한다. PR 템플릿과 CI `PR checklist`가 강제한다. 로드맵은 이슈를 닫는 PR 안에서 고친다.
  - 공통 UI·셸·토큰의 모양이 바뀌면 인터랙티브 프로토타입으로 사용자 컨펌. 기존 공통 컴포넌트만 조립한 메뉴 화면(견본)은 해당 없음(#60·#50 선례).
- MVP는 데스크톱 웹만. 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다.

## 현재 상태

- M1 완료. M2(디자인) 보류(FeedbackOps 디자인 확정 뒤, #52 코멘트).
- 2026-09-28~29 완료: #88(실제 시점 표시 `formatInstant`), #60(분석 공간 내 VOC·설문 이력 + FeedbackOps 딥링크, `VITE_FEEDBACKOPS_ORIGIN` 연결), #50(운영 콘솔 변경 감사 `/admin/audit` + 설비 Audit 탭 단일 원천).
- #37 적재 워커 상태 스키마 **초안** 병합(`docs/integration/ingest-status-schema.md`, Candidate). 사용자가 파서 담당에게 직접 전달 — 합의되면 Decided로 올리고 #37을 닫는다. 협의 문서(Claude Docs): https://claude.ai/code/artifact/e3bfc381-4f4f-4d46-b9a0-abe2928ee0cd
- CI: `Platform workspace`·`Platform contracts (E2E)`(31개)·`CSS selectors (build diff)`·Unit A–C·Python codec·`PR checklist`.

## 다음 세션 할 일

1. **#49 운영 콘솔 권한/역할 관리 화면.** 선행 #35·#36·#41 모두 닫힘. 메뉴 `admin-roles`(운영 콘솔 공간의 home 메뉴)가 manifest만 있다.
   - 검증 갈래: Kernel 권한·Scope. 역할은 '운영 콘솔 접근' 한 역할(`console:access`), 실제 IdP는 사내 SSO 사양 대기라 mock 역할(admin/engineer/viewer)과 room grant 모델로 조회 중심으로 설계한다. 쓰기(역할 부여)를 넣을지는 설계에서 판단하고, 사람 결정이 필요하면 `ready-for-human` 이슈로.
   - #50 패턴 재사용: 포트(`@ap/contracts` adapter) → mock(`packages/mock-server`, 권한 확인이 시나리오보다 먼저, `finish()` 금지) → 메뉴 화면(`PlatformDataTable`, page key 검증 시 입력 유지) → 문서.
2. 그 밖은 결정·외부 답 대기(아래). 착수 가능한 새 일이 없으면 사용자에게 확인한다.

## 사람·외부 결정 대기 — 답이 나오기 전에 거기에 기대는 구현을 하지 않는다

- #37 파서 담당 합의(스키마 초안). 합의 뒤 #51 모니터링·트레이스 설계.
- #75 활용률 이벤트에 조회조건을 넣을지.
- #81 FeedbackOps 딥링크 확장.
- #84 = FeedbackOps#548 내 설문 응답 읽기 API. 지금 `mySurveyHistory`는 `respondent_history` `unknown`.
- #85 = FeedbackOps#549 신고자용 `view=my&selected=` 딥링크 확인. 확인되면 딥링크 계약·생성기를 계약 절차대로 함께 변경.
- #86 실제 VOC 어댑터 — #59 토큰 공유(디자인 보류) 뒤.
- #90 지표 상세 이력을 감사 저장소로(ready-for-agent지만 카탈로그 이전 판단 필요), #91 전역 감사 room 권한 결정.

## 이번 세션에 생긴 플랫폼 계약

- **실제 시점 vs wall-clock (06 §6.3):** 설비 업무 시각이 아닌 시점(epoch·timestamptz: 활용률 마지막 사용, FeedbackOps 시각, 감사 `at`)은 `formatInstant`(offset 필수, 달력 검증)로 보는 사람 시간대에 표시. `formatDateTime`은 naive wall-clock 전용. 비교·정렬은 `instantEpochMs`.
- **포트 추가(`PlatformAdapter`):** `myVocHistory`(cursor)·`mySurveyHistory`, `auditTrail`(전역, `console:access`, 필터·offset·`fromAt`/`toAt`)·`entityAudit`(목적지 권한). 서버가 사용자를 정하고 클라이언트는 사용자 id·Scope·`at`을 보내지 않는다.
- **`AuditEvent.target`:** 목적지 참조(`type`·`id`·`scopeId`, 06 §22). 콘솔 행 → `linkTo`로 상세 이동, 사이트가 바뀌면 site 종속 Context를 비우고 Selection은 덮지 않는다.
- **`AssessmentKind` `respondent_history`:** 원천이 없는 조회는 적용 kind를 `unknown`/`source_unavailable`로 선언(0건 주장 금지).
- **메뉴에 앱 설정 주입:** index는 `manifests`만 export. 설정은 서브패스(`@ap/menu-notice-voc/feedbackops-origin`)로, 앱 `main.tsx`만 import(lint 강제).
- **page key 검증 화면:** 잘못된 값이면 경고 + 어댑터 호출 안 함 + 입력은 계속 편집 가능(#50 리뷰 P2). 커서가 남아 오류가 나도 초기화 버튼은 성공 화면 밖에 둔다(#60 리뷰 P2).

## 워커 오케스트레이션 (Orca)

- **역할과 모델(사용자 요청 없이 바꾸지 않는다):**
  - 설계: Grok 4.7 high(`grok -m grok-4.7`, 기본 high). **주간 한도 ~6% 남음(2026-09-28, 금 20:50 초기화).** `orca account list`가 "sign-in expired"로 나와도 CLI는 되는 경우가 있다 — TUI를 띄워 배너의 "Weekly limit left"로 확인.
  - 구현: GLM 5.3 Flash max(`omp --model glm-5.3-flash --thinking max`) — **한도 소진(2026-09-28).** 한도가 없으면 Codex `gpt-6-luna` max(`codex -m gpt-6-luna -c model_reasoning_effort="max"`).
  - 리뷰: Codex gpt-6-astra medium. 조율·스펙·검증·문서·PR: coordinator.
  - 원인·해법이 분명한 작은 작업(#88)은 coordinator가 스펙을 쓰고 설계 워커를 생략했다.
- **표준 흐름:** `run-create` → `terminal create --command '<CLI>'` → `task-create`(스펙은 scratchpad 파일로 두고 "Read and execute the task spec at …"로 가리킴) → `dispatch --inject` → 백그라운드 루프로 `check --run <run> --json`을 30초마다, heartbeat는 ack하고 `worker_done`만 깨움 → `--ack` → `worker-release` → `terminal close`.
- **주의:** coordinator 터미널은 **마지막으로 만든 Run에 묶인다** — 이전 Run으로 dispatch하면 `consumer_fenced`. 새 작업은 새 Run을 만든다. Codex 메시지 JSON에 제어문자가 있어 `json.loads(..., strict=False)`로 읽는다.
- **Grok:** `dispatch --inject` 대신 `terminal send`로 과제 경로를 보내고, 설계 파일 생성 + "DESIGN DONE"으로 완료를 판정한다.
- **정리:** 끝난 탭은 바로 닫는다. 병합된 브랜치는 `--delete-branch`.

## 운영 사항

- **검증:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, Kernel·셸·공통 컴포넌트·mock을 바꾸면 `pnpm e2e`. 로컬 E2E는 `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`. 브라우저 확인은 `ego-browser` 스킬, dev 서버는 `VITE_FEEDBACKOPS_ORIGIN=https://feedbackops.example pnpm dev`. 끝나면 `lsof -tiTCP:5173-5180,4190 -sTCP:LISTEN | xargs kill`.
- **리뷰 지적 수정:** 수정마다 수정 전 코드에서 실패하는 회귀 테스트(워커 보고에 실패 출력을 받는다).
- **새 메뉴 그룹:** `GroupId`·`GROUPS`에 사람이 추가 → `pnpm gen:menu …` → `pnpm install`.
- **Tailwind v4:** 앱 밖 패키지는 `styles.css`의 `@source` + 앱 `style.css`의 `gen:menu-styles` 마커 안 import.
- **알려진 잔여:** gen-menu `--remove` EBUSY 재시도(P2), 문법 기반 lint 한계, `"none"` 문자열 EquipmentID 구분 불가(Unit A), `AnalysisChartFrame` 주석 `at`이 UTC 자름(표시 안 돼 무해), 지표 감사 `at`의 `+09:00` 임시 zone(#90).
- CI: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26. 그 무렵 CI가 깨지면 먼저 확인.

## 보존할 경계

- Decided는 구현 완료가 아니다. 확인 필요 항목을 임의로 결정하지 않는다.
- FeedbackOps 코드는 플랫폼 계약에 맞춰 소급 수정하지 않는다(서브모듈 `6a0c7f8`). 필요한 변경은 FeedbackOps 저장소 이슈(#548·#549 선례)로.
- 역사 기록(`reports/`, `docs/reviews/`, `.agents/reports/`)은 덮어쓰지 않는다.

이전 HANDOFF 내용은 `git log -p HANDOFF.md`.
