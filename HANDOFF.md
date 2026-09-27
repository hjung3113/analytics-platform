# Handoff — 2026-09-27 다음 세션: 틈틈이 목록(M1 완료)부터

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고, PR에 `Closes #n`을 적는다.
  - 무엇이 확정되면 공통화 판단·문서 갱신·로드맵 갱신을 확인한다. PR 템플릿과 CI `PR checklist`가 강제한다.
  - UI 변경은 인터랙티브 프로토타입으로 사용자 컨펌을 받은 뒤 구현한다.
- MVP는 데스크톱 웹만 지원한다(05 Decided). 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다.

## 현재 상태

- main은 이 PR 병합 시점 기준. 플랫폼 계약 E2E 30개(#44·#45·#46·#41·#43·#42). CI `Platform workspace`·`Platform contracts (E2E)`·Unit A–C·Python codec·`PR checklist` 초록.
- 모노레포 이행 1–6단계 완료(PR #16–#32). 작업 관리 체계(#62), 데스크톱 전용 결정(#65).
- **디자인 트랙(M2)은 보류:** FeedbackOps 디자인 개선이 확정된 뒤 재개한다.
  - 재개 방향: FeedbackOps 디자인을 기반으로 삼고 플랫폼 확장 패턴(Context 바·차트 프레임·분석 레이아웃·KPI)을 더한다.
  - 1차 평가는 #33.
  - 지금까지의 프로토타입(A안 완성, B안 WIP)은 브랜치 `hjung3113/prototype-design-direction`에 있다(main 병합 안 함). 재개 절차는 #52 코멘트.

## 다음 세션 할 일 (순서대로)

1. **M1 마지막 이슈 #48 차트 번들 분할.** 그 뒤 틈틈이: #57 `@types/node` 부채, #58 CSS selector 비교 CI, #37 적재 워커 스키마 초안, #61 FeedbackOps 양방향 딥링크 계약.
   - **M1은 #48만 남았다(#41·#42·#43·#45·#46·#47 완료).** #42(Registry 조회) 한 줄 요약: `admin-registry` 메뉴(`pageType: catalog`, pageKeys `sort`/`page`/`focus`)가 client registry를 `PlatformDataTable`로 조회하고 행 동작으로 선언 드로어를 연다. #43(활용률 계측)도 완료 — kernel이 `adapter.recordUsage`(entry/dwell, 식별 필드만)로 계측하고 콘솔 `admin-usage`는 `adapter.usageSummary` 집계만 읽는다(조회조건 수집 여부는 #75 결정 대기).
   - 안전망은 `pnpm e2e`(#44, [`apps/platform-e2e`](apps/platform-e2e/AGENTS.md)).

## 결정 (2026-09-27 인터뷰로 확정)

- 인증: FeedbackOps 방식(AuthProvider — 개발 Mock + 운영 OIDC 계열, 서버 세션 쿠키, 백엔드 매 요청 재검증). 실제 IdP 사양만 사내 확인 대기.
- 운영 콘솔: '운영 콘솔 접근' 한 역할.
- 공간 필드: `space`, 그룹 수 상한 없음(권장 7개 이하).
- FeedbackOps 1단계 쓰기: 원본 화면 딥링크.
- 적재 워커 스키마: 플랫폼이 초안(#37) → 파서 담당 협의.
- 시각 회귀: 지금은 빌드 CSS selector 비교 CI(#58), 픽셀 비교는 디자인 확정 뒤.

자세한 내용은 [05 결정 상태](docs/05_roadmap_and_open_questions.md)와 로드맵 "사람의 결정" 표.

## 워커 오케스트레이션 (Orca)

- **역할과 모델:**
  - 설계: Grok 4.7 high. TUI는 `--effort`를 무시하므로 띄운 뒤 `/effort high`를 보낸다.
  - 구현: GLM 5.3 Flash max(`omp --model glm-5.3-flash --thinking max`, OpenRouter 금지). 시각 품질이 필요하면 Claude Opus, **구현 워커는 `--effort low`**.
  - 리뷰: Codex gpt-6-astra medium.
  - 조율·검증·PR: coordinator.
  - 작업은 하나씩 작게 나눈다.
- **Codex 실행:** `worker-start --agent codex`는 경고(⚠)가 있으면 준비 단계에서 타임아웃난다. `orca terminal create --command 'codex -m gpt-6-astra -c model_reasoning_effort="medium"'` → `task-create` → `dispatch --inject`. 리뷰어 역할을 빼지 않는다.
- **완료 대기:** `check --wait` 출력은 keepalive 줄 뒤에 JSON이 온다(마지막 `\n{\n`부터 파싱). heartbeat만 온 배치는 ack하고 다시 기다린다.
- **정리:** 끝난 탭은 바로 닫고(`terminal create`로 연 탭은 release 후에도 남음), 병합된 워크트리·브랜치는 지운다.

## 운영 사항

- **새 메뉴 그룹:** `GroupId`·`GROUPS`(행에 `space` 포함, 06 §9.1)에 사람이 추가 → `pnpm gen:menu <group> --label-ko … --label-en …` → `pnpm install`. 생성기 변경은 깨끗한 트리에서 `node tooling/gen-menu/scripts/probe.ts`로 확인.
- **검증:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, Kernel·셸·공통 컴포넌트·mock을 바꿨으면 `pnpm e2e`(보고: `apps/platform-e2e/contract-report/README.md`). 캐시 없이는 `pnpm exec turbo run lint typecheck test --force`.
- **dev 서버 누수:** vite가 `node …/vite.js`로 떠서 `pkill -f "vite --host"`에 안 걸린다. 끝나면 `lsof -tiTCP:5173-5180 -sTCP:LISTEN | xargs kill`. 포트가 밀리면 브라우저 검사가 엉뚱한 서버를 본다.
- **브라우저 검사:** `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`, 스크립트는 그 폴더에서 실행. 데스크톱 1440×900 기준.
- **스택 PR:** 기반 PR을 `--delete-branch`로 병합하면 위 PR이 닫힌다. 기반은 브랜치 유지로 병합 → `gh pr edit <n> --base main` → `origin/main` 병합 후 push.
- **Tailwind v4:** 앱 밖 패키지는 `styles.css`의 `@source` + 앱 `style.css` import. 이동·생성 PR은 빌드 CSS selector 집합 비교.
- **알려진 잔여:** gen-menu `--remove`의 EBUSY 재시도 경로(P2), 문법 기반 lint의 한계(platform-packages §6), `"none"` 문자열 EquipmentID 구분 불가(Unit A).
- CI: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26. 그 무렵 CI가 깨지면 먼저 확인.

## 보존할 경계

- Decided는 구현 완료가 아니다. 확인 필요 항목을 임의로 결정하지 않는다.
- FeedbackOps 코드는 플랫폼 계약에 맞춰 소급 수정하지 않는다(서브모듈 gitlink `6a0c7f8`).
- 역사 기록(`reports/`, `docs/reviews/`, `.agents/reports/`)은 덮어쓰지 않는다.

이전 HANDOFF 내용은 `git log -p HANDOFF.md`.
