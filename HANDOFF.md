# Handoff — 2026-09-26 모노레포 패키지 추출 1–4d단계 (PR #16-23)

## 현재 상태

이 세션의 코드 변경은 PR #23 병합 커밋 `ab575dd`까지이고, 그 위에 문서 정리 PR #24(이 HANDOFF 포함)가 병합된다. CI 5개 Job(`platform-workspace` + 기존 Unit A–C·Python codec) 모두 초록불. 테스트 67개(kernel 13, components 3, app 51).

[플랫폼 모노레포 패키지 경계](docs/integration/platform-packages.md) §7 이행 순서의 1–4d단계를 끝냈다.

| PR | 단계 | 내용 |
| --- | --- | --- |
| [#16](https://github.com/hjung3113/analytics-platform/pull/16) | 설계 | 패키지 경계·의존 방향·이행 순서. §8의 5개 항목 Decided(구성, 그룹 단위 메뉴 패키지, `git mv`, ESLint, 임시 접두사 `@ap/`) |
| [#17](https://github.com/hjung3113/analytics-platform/pull/17) | 1 | pnpm 11 + Turborepo 골격, `prototypes/platform-app` → `apps/platform-web`, CI `platform-workspace` Job |
| [#18](https://github.com/hjung3113/analytics-platform/pull/18) | 2 | `@ap/contracts` — URL codec, `MenuMeta`, 응답·Trust envelope, `AuditEvent` |
| [#19](https://github.com/hjung3113/analytics-platform/pull/19) | 3 | `PlatformAdapter` 포트. Kernel의 mock import 0건, 역할·시나리오는 `src/dev/DevTools.tsx` |
| [#20](https://github.com/hjung3113/analytics-platform/pull/20) | 4a | `@ap/ui` — 토큰·shadcn·`Button`·`StatusBadge` |
| [#21](https://github.com/hjung3113/analytics-platform/pull/21) | 4b | 메뉴 선언을 앱 `src/menus.ts`로, `createRegistry` 검증, `@ap/kernel` |
| [#22](https://github.com/hjung3113/analytics-platform/pull/22) | 4c | Kernel 슬롯(`contextBar`, `topBarTools`), `@ap/components` |
| [#23](https://github.com/hjung3113/analytics-platform/pull/23) | 4d | GlobalContextBar가 어댑터(`contextOptions`, `evaluateSelection`)로 조회, `@ap/shell` |

- 각 단계에서 빌드 CSS selector 집합이 이동 전과 같았다. 4d 리뷰 반영으로 추가한 '다시 시도' 버튼 때문에 `.underline` 유틸리티 1개만 늘었다(의도한 변화).
- 리뷰 지적은 모두 수정 없이 실패하는 회귀 테스트와 함께 반영했다: 클래스 어댑터 `this` 바인딩·요청 시점 역할 고정(#19), 파라미터 경로 parent·그룹 id 중복(#21), Context 선택지의 권한 필터링·선택 평가 실패 표시와 재시도(#23).
- 세션 정리: 루트 `AGENTS.md`에 코드 작업 원칙, 폴더별 `AGENTS.md`(+`CLAUDE.md` 심링크) 10개(`docs`, `apps/platform-web`, `packages` 및 5개 패키지, `tooling`, `prototypes`), [INDEX](docs/INDEX.md)에 작업별 읽기 경로 추가. README·저장소 구조 문서를 현재 코드에 맞춤.
- 병합된 작업 브랜치와 worktree는 정리했다. 이전 세션의 병합 완료 브랜치(로컬 5개, 원격 13개)는 남아 있다 — 삭제 여부는 사용자 확인 후.

## 사용자 확인 필요

임의로 결정하지 않는다. 일부는 `apps/platform-web`에 Candidate로 구현돼 있지만 결정된 것은 아니다.

- **인증/권한:** SSO·서버 권한 재검증, Scope 데이터 원천·상속 규칙, Registry permission 필드를 Shell이 소비할지.
- **UX 정책:** Condition 편집 시 Selection 처리, Chart Selection Summary 배치, Zoom-out 용어, 필터 변경 후 선택 유지.
- **후속 구현 범위:** 전역 검색(cmdk), 시간 codec 지원 범위, Annotation 영속성, Export 포맷, DetailDrawer Audit 연동.
- **아키텍처:** Chart Interaction Contract 승격(06 §14 Promotion Rule 대기).
- **공개 URL 계약:** 후보 키·스키마 승인. **CFG 메뉴 연계**(06 §22): Deferred 유지.
- **워크스페이스 인터뷰 Open**([기록](docs/reviews/2026-09-26-workspace-ops-interview.md#남은-open)): 적재 워커 상태 기록 스키마와 파서 저장소 변경 범위, Registry `space` 필드명·공간별 그룹 상한, FeedbackOps 1단계 VOC·설문 딥링크 방식, 운영 콘솔 권한 모델.
- **패키지 접두사:** `@ap/`는 임시. 회사 시스템 이름이 정해지면 [§8 절차](docs/integration/platform-packages.md#8-결정-decided-2026-09-26)로 일괄 변경.
- 알려진 잔여 이슈(결정 아님): 실제 EquipmentID·room_name이 문자열 `"none"`이면 명시적 빈 집합과 구분되지 않는다(Unit A `setValue`).

## 다음 세션 추천 작업

범위는 모노레포 **5–6단계**(사용자 합의). 한 단계씩 PR → 리뷰 반영 → 병합.

1. **5단계 — 메뉴 패키지:** 그룹 단위 `menus/<group>`(`@ap/menu-<group>`)로 `src/pages/*` 이동, 메뉴마다 `api.ts` 한 파일만 데이터 원천을 알게 함(D8), Registry를 메뉴 manifest 등록 방식으로(D1). mock을 `@ap/mock-server`로 분리하고 교차 테스트를 메뉴·앱 통합 테스트로 재배치(D10). 화면 없는 계획 메뉴도 manifest로 자기 그룹이 소유.
2. **6단계 — 경계 lint와 생성기:** `tooling/eslint`에 의존 방향·깊은 경로 import 금지·URL 직접 조립 금지 규칙, CI 추가. `gen:menu`로 빈 메뉴 하나를 만들어 검증한 뒤 삭제.
3. **6단계 후보(사용자 제안) — CSS/시각 회귀 테스트:** 이번 세션에 손으로 한 빌드 CSS selector 집합 비교를 CI 검사로 만들거나, Playwright 스크린샷 비교를 도입. 범위는 사용자와 정한다.
4. **부채:** `@ap/ui` `Button.tsx`의 `process.env.NODE_ENV` 때문에 `@ap/ui`·`@ap/shell`에 `@types/node`가 있다. `import.meta.env` 등으로 바꾸고 제거.
5. 그 뒤: 워크스페이스 층(06 §9.1, `space` 필드는 Candidate로), [앱 README "남은 플랫폼 과제"](apps/platform-web/README.md#남은-플랫폼-과제-워커-보고-기반), Storybook, 파서 저장소와 적재 워커 상태 스키마 협의(합의 전 운영 콘솔은 화면 설계까지만). FeedbackOps 피드백 공간은 원본 저장소의 Milestone 구현(#514)을 참조.

## 이번 라운드에서 배운 운영 사항

- **스택 PR 병합:** 기반 PR을 `gh pr merge --delete-branch`로 병합하면 그 브랜치를 base로 둔 다음 PR이 자동으로 닫힌다. 기반 PR은 브랜치를 지우지 않고 병합 → 다음 PR을 `gh pr edit <n> --base main` → 전체 병합 후 브랜치 삭제.
- **base 변경은 CI를 다시 돌리지 않는다.** `origin/main`을 브랜치에 병합해 push하면 CI가 돈다.
- **Tailwind v4:** 앱 루트 밖 패키지는 스캔되지 않는다. 패키지마다 `styles.css`에 `@source`를 두고 앱 `style.css`가 import한다. 이동 PR은 빌드 CSS selector 집합 비교로 확인한다(`tr '}' '\n' < a.css | sed 's/{.*//' | tr ',' '\n' | grep '^\.' | sort -u`).
- **Node 26 + jsdom:** 테스트에서 `localStorage`가 undefined다. `vi.stubGlobal`로 대체한다.
- **Playwright 브라우저:** `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`.
- **zsh:** `$SHA:r`처럼 변수 뒤 `:`가 수정자로 해석된다. `${SHA}`로 쓴다.
- PR마다 Codex 자동 리뷰(P1/P2)가 달린다. 이번 P2 지적(권한 누수, 오류 무시)은 모두 실제 버그였다. 수동 리뷰는 `codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -s read-only -C . -o <out> "<지시>" < /dev/null`.
- **워커 분배:** 여러 발견 사항을 한 워커에 몰면 GLM max가 계획만 하다 멈춘다. Grok 설계 → 구현 모델 → coordinator 검증을 하나씩.
- **GLM 경로:** OpenRouter 금지. omp에서 접두사 없는 z.ai 직접 ID(`glm-5.3-flash` 등)만 쓰고, 사전 확인은 `omp -p "reply with OK only" --model <id> --thinking low < /dev/null`. 한도가 차면 사용자가 지정한 다른 모델로.
- **Orca:** `orca terminal create`로 띄운 탭은 `worker-release` 후에도 열려 있으니 직접 닫는다. Codex 한도 경고가 있으면 `worker-start --agent codex`가 실패하므로 `terminal create --command "codex ..."` → `task-create` → `dispatch --inject`로 우회.
- CI: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26. 그 무렵 CI가 깨지면 먼저 확인.

## 보존할 경계

- Decided는 구현 완료가 아니다. 확인 필요 항목을 임의로 결정하지 않는다.
- 메뉴 화면은 Consumer다. 5단계는 화면 이동이지 화면 추가가 아니다.
- FeedbackOps 코드는 플랫폼 계약에 맞춰 소급 수정하지 않는다. 서브모듈 gitlink는 `6a0c7f8`.
- 역사 기록(`reports/`, `docs/reviews/`, `.agents/reports/`)은 덮어쓰지 않는다.

## 필요할 때만 읽는 기록

[패키지 경계](docs/integration/platform-packages.md) · [앱 README](apps/platform-web/README.md) · [결정 상태](docs/05_roadmap_and_open_questions.md). HANDOFF는 다음 세션에 넘길 정보만 담고 매번 덮어쓴다. 이전 내용은 git 이력(`git log -p HANDOFF.md`)으로 본다.
