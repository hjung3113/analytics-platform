# Handoff — 2026-09-27 모노레포 이행 5–6단계 완료 (PR #25–#30)

## 현재 상태

[플랫폼 모노레포 패키지 경계](docs/integration/platform-packages.md) §7 이행 순서 1–6단계가 모두 끝났다. main `9aacff5`. CI 5개 Job 초록불. 테스트 245개(eslint-config 102, gen-menu 75, mock-server 30, platform-web 16, kernel 13, menu-analytics 5, components 3, menu-home 1, menu-metrics 1).

| PR | 단계 | 내용 |
| --- | --- | --- |
| [#25](https://github.com/hjung3113/analytics-platform/pull/25) | 5a | `@ap/mock-server` 추출(`contracts`만 의존) |
| [#26](https://github.com/hjung3113/analytics-platform/pull/26) | 5b | 메뉴 그룹마다 `api.ts` 한 파일만 mock을 앎. CSV 내보내기 분기는 `cycleData.rowsForExport` |
| [#27](https://github.com/hjung3113/analytics-platform/pull/27) | 5c | `menus/*` 7개 그룹 패키지(`@ap/menu-<group>`), 앱 `menus.ts`는 `GROUPS` + manifests 연결 |
| [#28](https://github.com/hjung3113/analytics-platform/pull/28) | 5 리뷰 | Astra 리뷰 반영(문서 nit 3건, 코드 지적 없음) |
| [#29](https://github.com/hjung3113/analytics-platform/pull/29) | 6a | `@ap/eslint-config` 층별 preset + 로컬 규칙 3개, 루트 `pnpm lint`, CI 단계 |
| [#30](https://github.com/hjung3113/analytics-platform/pull/30) | 6b | `pnpm gen:menu` 생성기 + `scripts/probe.ts`(임시 메뉴 생성 → 네 게이트 → 되돌림) |

- 모든 설계·리뷰 기록은 `.agents/reports/step5/`, `.agents/reports/step6/`.
- 리뷰 지적은 수정 없이 실패하는 회귀 테스트와 함께 반영했다(6a fixture 102개, 6b 트랜잭션·소유권·경계·마커 테스트).
- 이번 세션 브랜치·worktree는 모두 정리했다. 이전 세션의 병합 완료 브랜치(로컬 5개, 원격 13개)는 남아 있다 — 삭제 여부는 사용자 확인 후.

## 사용자 확인 필요

임의로 결정하지 않는다.

- **이번 세션에 기본값으로 진행한 것(되돌릴 수 있음):**
  - 생성기는 사이드바 그룹을 만들지 않는다(6b D1). `GroupId`·`GROUPS`는 사람이 추가. 필요하면 `--with-group` 확장.
  - 홈 공지 닫기: 메뉴 코드의 web storage 금지(6a) 때문에 `sessionStorage` 대신 모듈 상태. 화면 이동 후에도 유지, 새로고침(재접속)하면 다시 노출. 08 §8 "세션 동안만 유지"를 이렇게 해석했다. 새로고침 후 유지가 필요하면 Kernel 소유 API로 결정.
  - `published-metrics` 테스트를 그룹별로 분할(깊은 경로 import 금지 때문). kernel+mock 부분만 앱 통합 테스트.
- **인증/권한:** SSO·서버 권한 재검증, Scope 데이터 원천·상속 규칙, Registry permission 필드를 Shell이 소비할지.
- **UX 정책:** Condition 편집 시 Selection 처리, Chart Selection Summary 배치, Zoom-out 용어, 필터 변경 후 선택 유지.
- **후속 구현 범위:** 전역 검색(cmdk), 시간 codec 지원 범위, Annotation 영속성, Export 포맷, DetailDrawer Audit 연동.
- **아키텍처:** Chart Interaction Contract 승격(06 §14 Promotion Rule 대기).
- **공개 URL 계약:** 후보 키·스키마 승인. **CFG 메뉴 연계**(06 §22): Deferred 유지.
- **워크스페이스 인터뷰 Open**([기록](docs/reviews/2026-09-26-workspace-ops-interview.md#남은-open)): 적재 워커 상태 기록 스키마와 파서 저장소 변경 범위, Registry `space` 필드명·공간별 그룹 상한, FeedbackOps 1단계 VOC·설문 딥링크 방식, 운영 콘솔 권한 모델.
- **패키지 접두사:** `@ap/`는 임시. 바꿀 곳은 `package.json`·import 외에 상수 두 곳(`tooling/eslint/src/prefix.js`, `tooling/gen-menu/src/prefix.ts`). [§8 절차](docs/integration/platform-packages.md#8-결정-decided-2026-09-26).

## 다음 세션 추천 작업

1. **CSS/시각 회귀 테스트(사용자 제안, 범위 먼저 합의):** 이번에도 손으로 한 빌드 CSS selector 집합 비교를 CI 검사로 만들거나 Playwright 스크린샷 비교를 도입.
2. **부채:** `@ap/ui` `Button.tsx`의 `process.env.NODE_ENV` 때문에 `@ap/ui`·`@ap/shell`과 화면 있는 메뉴 4개(+생성 템플릿)가 `@types/node`를 가진다. `import.meta.env` 등으로 바꾸고 함께 제거.
3. **알려진 잔여(결정 아님):**
   - `gen:menu --remove`에서 패키지 삭제가 일시 실패(EBUSY)하면 앱 연결은 복원되고 재시도로 패키지는 지워져 연결이 남을 수 있다(Astra final check P2, `tooling/gen-menu/src/remove.ts`).
   - 6a lint는 문법 기반이다. 변수에 담아 만든 URL, computed 속성, optional chaining 호출, 템플릿 문자열 `import(\`…\`)`는 잡지 않는다(platform-packages §6).
   - 실제 EquipmentID·room_name이 문자열 `"none"`이면 명시적 빈 집합과 구분되지 않는다(Unit A `setValue`).
4. 그 뒤: 워크스페이스 층(06 §9.1, `space` 필드는 Candidate), [앱 README "남은 플랫폼 과제"](apps/platform-web/README.md#남은-플랫폼-과제-워커-보고-기반), Storybook, 파서 저장소와 적재 워커 상태 스키마 협의(합의 전 운영 콘솔은 화면 설계까지만). FeedbackOps 피드백 공간은 원본 저장소의 Milestone 구현(#514)을 참조. 새 메뉴 그룹은 `pnpm gen:menu`로 시작하되 메뉴 화면 3개 이상 연속 제작은 사용자 확인.

## 운영 사항

- **새 메뉴 그룹:** `GroupId`(contracts)와 `GROUPS`(앱 `menus.ts`)에 사람이 추가 → `pnpm gen:menu <group> --label-ko … --label-en …` → `pnpm install`. 생성기 변경은 `node tooling/gen-menu/scripts/probe.ts`로 확인(깨끗한 트리에서만 실행, 끝나면 트리가 원상복구).
- **검증 순서:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. 캐시 없이 보려면 `pnpm exec turbo run lint typecheck test --force`.
- **dev 서버 누수:** `pnpm dev`의 vite는 `node …/vite.js --host …`로 떠서 `pkill -f "vite --host"`에 안 걸린다. 끝낼 때 `lsof -tiTCP:5173-5180 -sTCP:LISTEN`으로 확인하고 종료. 포트가 밀리면(5174…) 브라우저 검사가 다른 워크트리의 서버를 볼 수 있다.
- **Orca 워커 분배(이번 세션):** Grok 4.7 high 설계 → GLM 5.3 Flash max 구현 → Codex gpt-6-astra medium 리뷰 → coordinator 검증·PR. 한 작업씩.
  - Grok TUI는 `--effort` 플래그를 무시한다. 띄운 뒤 `/effort high`.
  - Codex `worker-start`는 경고(⚠ 1 warning)가 있으면 준비 단계에서 타임아웃난다. `terminal create --command 'codex -m gpt-6-astra -c model_reasoning_effort="medium"'` → `task-create` → `dispatch --inject`.
  - GLM은 `omp --model glm-5.3-flash --thinking max`(OpenRouter 금지, 접두사 없는 ID).
  - `check --wait` 출력은 keepalive 줄 뒤에 JSON이 온다. 마지막 `\n{\n`부터 파싱.
- **스택 PR 병합:** 기반 PR을 `--delete-branch`로 병합하면 위 PR이 닫힌다. 기반을 브랜치 유지로 병합 → `gh pr edit <n> --base main` → `origin/main`을 병합해 push(CI 재실행).
- **Tailwind v4:** 앱 밖 패키지는 `styles.css`의 `@source` + 앱 `style.css` import. 이동·생성 PR은 빌드 CSS selector 집합 비교(`tr '}' '\n' < a.css | sed 's/{.*//' | tr ',' '\n' | grep '^\.' | LC_ALL=C sort -u`).
- **Node 26 + jsdom:** 테스트에서 `localStorage`가 없다. `vi.stubGlobal`. Playwright 브라우저: `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`.
- CI: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26. 그 무렵 CI가 깨지면 먼저 확인.

## 보존할 경계

- Decided는 구현 완료가 아니다. 확인 필요 항목을 임의로 결정하지 않는다.
- 메뉴 화면은 Consumer다. 생성기가 생겼다고 메뉴를 연달아 만들지 않는다.
- FeedbackOps 코드는 플랫폼 계약에 맞춰 소급 수정하지 않는다. 서브모듈 gitlink는 `6a0c7f8`.
- 역사 기록(`reports/`, `docs/reviews/`, `.agents/reports/`)은 덮어쓰지 않는다.

## 필요할 때만 읽는 기록

[패키지 경계](docs/integration/platform-packages.md) · [앱 README](apps/platform-web/README.md) · [결정 상태](docs/05_roadmap_and_open_questions.md) · [tooling](tooling/AGENTS.md) · [menus](menus/AGENTS.md). HANDOFF는 다음 세션에 넘길 정보만 담고 매번 덮어쓴다. 이전 내용은 `git log -p HANDOFF.md`.
