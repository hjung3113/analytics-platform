# 과거 HANDOFF 기록 — 현행 지시 아님

이 파일은 2026-09-26 통합 프로토타입 라운드(PR #13-15) 직전의 HANDOFF.md 전체를 보존한다. 그 이전 기록은 [handoff-history-through-2026-09-26.md](handoff-history-through-2026-09-26.md)에 있다. 현행 진입점은 [HANDOFF](../../HANDOFF.md)와 [INDEX](../../docs/INDEX.md)다.

---

# Handoff — 2026-09-26 코드 품질 개선 3건 병합 (PR #10-12), CI 최초 가동

## 현재 상태

`main`은 커밋 `612bba6`, `origin/main`과 일치, 작업 트리 clean. **이 레포에 처음으로 CI가 생겼고 실제 GitHub Actions에서 초록불로 확인했다**(아래 참고). PR #4-9(플랫폼 다섯 갈래)에 이어, 이번 라운드는 사용자가 요청한 "시니어 개발자 리뷰에서 지적한 약점 개선"을 했다.

- **FeedbackOps 서브모듈을 처음으로 실제 pull**했다(`f3a8c17`, `b5dd614`→`6a0c7f8`, 28커밋 갱신). 이전엔 "서브모듈 경계 유지"라는 이유로 핀을 손대지 않았는데, 사용자가 "최신 버전 pull한 거 맞아?"라고 물어서 확인해보니 **실제로는 최신이 아니었다** — 다행히 이식 대상 파일(`packages/ui/src/components/shadcn`, `cn.ts`, `tokens.css` 등)은 그 28커밋 동안 무변경이라 실질 영향은 없었지만, "안전하게 최신을 확인 안 하고 핀만 유지"와 "실제로 최신인지 확인하고 유지"는 다르다는 지적을 받아들여 pull했다.
- **병합된 PR 3개**(전부 `--merge`):
  - **#10** (`46a7247`) — Unicode 서로게이트 버그: Python(`context_url.py`) 원래 버그 수정 + **TS(`codec.ts`)에서 새로 발견된 대칭 버그**도 함께 수정
  - **#11** (`03ccf66`) — `ContextSelect`의 sentinel 문자열 충돌을 index 기반 DOM 값으로 구조적으로 제거(이 세션 중 같은 클래스 버그가 두 번 났던 것의 근본 수정)
  - **#12** (`612bba6`) — GitHub Actions CI 신설, **실제 Actions 실행에서 4개 Job 전부 초록불 확인**(PR 시점 + main push 시점 둘 다)
- **worktree 3개 정리 완료**: `fix-unicode-surrogate`, `fix-sentinel-architecture`, `add-ci-pipeline` 전부 `orca worktree rm`으로 삭제.

## 이번 라운드 배경 — 사용자가 요청한 "약점 개선"

직전 세션 종료 후 사용자가 "구성한 플랫폼 기능들을 시니어 개발자에게 설명하듯 장단점·부족한 점을 설명해달라"고 요청했고, 다음을 약점으로 짚었다:
1. Sentinel/opaque 값 충돌 아키텍처 스멜(패치는 했지만 근본 해법 아님) — **이번에 고침(#11)**
2. Python Unicode 서로게이트 버그(미수정 상태로 남아있던 것) — **이번에 고침(#10)**
3. CI 파이프라인 부재(테스트를 전부 사람이 손으로 돌림) — **이번에 신설(#12)**
4. 그 외(실제 백엔드 부재, Export/Annotation 영속성 미구현, 디자인 시스템 공유 패키지 미추출 등)는 **제품/인프라 결정이 필요해서 이번 범위에서 의도적으로 제외**했다 — 코드로 "고칠" 수 있는 게 아니라 사용자가 결정할 사안이기 때문.

사용자가 "이전 워크플로우대로 진행"을 지시해서 PR #4-9와 같은 패턴(Opus 5.5 설계 → Astra medium/Grok 4.7 max 리뷰 → OMP 보강 → coordinator 직접 재검증 → 병합)을 그대로 적용했다.

## 이번 라운드 상세

1. **PR #10 — Unicode 서로게이트, Python + TS 둘 다**. Python `identifier()`에 UTF-8 strict 인코딩 검사를 추가해 5개 필드(Condition 포함) 전부 `ContractError(invalid_id)`로 거절하게 고쳤다(`07c20ac`). 이 작업 중 Opus 5.5가 **TS 포트(`codec.ts`)에서 대칭이지만 별개인, 이번에 처음 발견된 버그**를 찾았다: scope_id/room_names/selection/destination에 같은 입력을 넣으면 `URIError`로 죽음(Condition만 알려진 divergence #6으로 성공 유지). coordinator가 직접 `tsx`로 재현해 확인 후 같은 브랜치에 후속 작업으로 추가 지시, 별도 `urlIdentifier()` wrapper로 4개 필드만 고치고 Condition 경로(divergence #6)는 그대로 뒀다(`f00265f`). Grok 4.7 max 리뷰: PASS-WITH-MINOR(문서 drift만) → coordinator가 직접 README/verification.log/work-order 정정(`b676b72`).
2. **PR #11 — sentinel 아키텍처 개선**. `ContextSelect`가 Radix Select에 노출하는 DOM `value`를 실제 opaque 데이터 문자열에서 완전히 분리하고 `options` 배열의 위치(index)로만 인코딩하도록 재설계 — 실데이터가 어떤 문자열이든 구조적으로 충돌 불가능(`0fa6045`). `absentSentinel` 헬퍼 삭제, `'__inherited'` no-op guard도 이제 도달 불가능하다는 근거로 제거. Grok 4.7 max 리뷰: PASS-WITH-MINOR(comment 정확도 2건) → coordinator가 직접 정정(`5067507`). **잔여 이슈 발견(범위 밖)**: 실제 EquipmentID/room_name이 문자열 `"none"`이면 여전히 "Explicit empty set"으로 오표시됨 — 이건 `ContextSelect` 내부가 아니라 호출부(`setValue`)의 다른 레이어 문제라 이번엔 안 고쳤다. 플랫폼 레벨 결정 필요.
3. **PR #12 — CI 신설**. `.github/workflows/ci.yml`에 4개 Job(Python codec, Unit A/B/C). FeedbackOps 서브모듈은 4개 Job 전부 `submodules: false`(런타임 참조 없음). Unit C는 Playwright 브라우저 설치 경로(`PLAYWRIGHT_BROWSERS_PATH`)를 이 세션 중 실제로 겪은 함정(설치 위치≠실행 위치)이 재발 안 하게 명시적으로 맞춤(`5bd3b39`). Opus 5.5가 스스로 "Python 3.9는 EOL이라 위험"이라고 자체 보고 → coordinator가 직접 3.12로 바꾸고 venv로 재검증(`b89c353`). Grok 4.7 max 리뷰: **clean PASS**. **PR을 열자 실제 GitHub Actions가 돌았고 4개 Job 전부 통과**(Python 9s / Unit A 21s / Unit B 23-28s / Unit C 51-54s, Playwright apt-get 설치 포함) — 로컬에서는 검증 못 했던 부분(ubuntu 환경, `--with-deps` apt 설치)까지 실제로 확인됐다. 병합 후 main push에서도 재확인.
4. **오케스트레이션 중 실제 장애 발생**: 이번 라운드 리뷰 디스패치 중 Codex/Astra(`gpt-6-astra`)가 두 번 연속 시작 실패했다(터미널을 열어보니 Codex CLI가 자기 자신을 자동 업데이트하다 멈춰서 그냥 셸 프롬프트에 있었다 — "possibly dead" 추측이 아니라 실제로 확인한 증거). `worker-abandon` → 재시도도 실패 → **Astra 대신 Grok 4.7 max로 전환**해서 3개 리뷰 전부 무사히 완료. Codex/Astra 자체의 일시적 문제로 보이며, 다음 세션에서 다시 써봐도 된다.

## 사용자 확인 필요 — 15개 (변경 없음, Unicode 버그는 해소)

**Unicode 서로게이트 버그는 이번 라운드에서 완전히 수정 완료** — 더 이상 목록에 없다. 나머지 15개는 PR #4-9 이후로 변경 없음(자세한 목록은 [직전 handoff](.agents/reports/handoff-history-through-2026-09-26.md) 참고). 요약:

- **인증/권한**(3): SSO/서버 권한 재검증, Scope 데이터 원천/상속 규칙, Registry permission 필드를 Shell이 소비할지
- **UX 정책**(4): Condition 편집 시 Selection 처리, Chart Selection Summary 배치, Zoom-out vocabulary, 필터 변경 후 선택 유지
- **후속 구현 범위**(5): 전역 검색/cmdk, 시간 지원 codec 범위, Annotation 영속성, Export 포맷, DetailDrawer Audit 연동
- **아키텍처**(1): Chart Interaction Contract 승격(§14 Promotion Rule 대기)
- **공개 URL 계약**(1): 후보 키/스키마 승인
- **CFG 메뉴 연계**(§22): Deferred 유지

**새로 발견된 잔여 이슈 1건(이번 라운드, 결정 아님)**: 실제 EquipmentID/room_name이 문자열 `"none"`이면 `setValue`가 명시적 빈 집합과 구분 못 하고 "Explicit empty set"으로 표시 — Unit A `App.tsx`의 `setValue` 함수 레이어, `ContextSelect` 내부 문제 아님(PR #11 리뷰에서 발견, 의도적으로 이번 범위 밖).

## 다음 세션 추천 작업

우선순위 순, PR #4-9 handoff와 동일:

1. **플랫폼 다섯 갈래 + 이번 코드 품질 개선까지 끝났다 — 다음 자연스러운 단계는 실제 메뉴 화면 1개를 조립하는 것이다.** AGENTS.md 가드레일(3개 이상 연속 제작 전 확인)은 첫 1개는 막지 않는다.
   - **추천 후보**: `docs/02_domain_menus.md`의 **설비관리(Equipment Master)**(Management archetype + PlatformDataTable/DetailDrawer 대응) 또는 **생산성 분석** 메뉴 1개(Analysis Workspace archetype + Chart Frame + Cross-menu Context Link 대응). 둘 다 Phase 1 전제 없음.
   - 시작 전 `.agents/skills/analysis-platform-wireframe/SKILL.md` 순서(Requirements → IA → Contract/Screen Spec → Wireframe → Open Decisions)를 따른다.
2. **"none" 표시 오류**(위 잔여 이슈) — 작고 독립적, 실제 메뉴 작업 전에 정리해도 되고 미뤄도 됨.
3. **CI 후속**: `ubuntu-latest`가 2026-10-19부터 Ubuntu 26으로 마이그레이션된다는 GitHub 공지가 Actions 실행에 붙어 있었다(현재는 문제 없음, 그 날짜 근처에 CI가 갑자기 깨지면 이게 원인일 수 있다는 것만 기억해둔다).
4. cmdk 도입(Command Palette 실검색), 사이드바 자동 collapse — 여전히 작은 후속.
5. M6 문서-구조 평가(직전 handoff의 "남은 범위" 참고) — 실제 메뉴 작업 전에 짧게 돌려볼 수 있다.

## 이번 검증과 기록

- **FeedbackOps pull**: `git diff --stat HEAD..origin/develop -- packages/ui/`로 이식 대상 파일 무변경을 먼저 확인한 뒤에 pull(사후 확인이었다는 점은 그대로 기록 — "안전했다"와 "사전에 확인했다"는 다르다).
- **PR #10**: 수정 전 코드로 되돌려 Python/TS 둘 다 새 테스트가 실제로 실패하는지 재현 후 복구. `generate-parity.py` 재실행으로 95개 vector sha256 무변경 확인(Condition 경로 안 건드렸다는 주장 검증).
- **PR #11**: 커밋 diff를 직접 읽고 index 기반 설계가 실제로 구현됐는지 코드 레벨에서 추적. Grok이 "새 테스트 7개 중 다수가 실제로는 구코드에서도 통과한다"(진짜 regression trap이 아니다)는 걸 직접 revert해서 확인 — 이 발견을 그대로 반영해 테스트 파일에 정직한 comment를 추가했다(과장된 주장 안 남김).
- **PR #12**: coordinator가 로컬에서 각 Job의 정확한 커맨드를 재현했을 뿐 아니라, **PR을 열어 실제 GitHub Actions 실행 결과까지 확인**(로컬 macOS로는 검증 불가능했던 ubuntu 환경·`--with-deps` apt 설치 포함) — "로컬 재현"과 "실제 CI 통과"를 구분해서 보고했다.
- **오케스트레이션 장애 대응**: Codex/Astra 디스패치 실패 시 "unverifiable/추측"으로 방치하지 않고 터미널을 직접 열어 실제 상태(Codex 자동 업데이트로 멈춤)를 확인한 뒤 `worker-abandon`으로 정리하고 다른 provider(Grok)로 전환 — orchestration 스킬의 "positive evidence 없이는 stop/abandon 안 함" 원칙을 따름.

## 보존할 경계

- FeedbackOps gitlink는 이제 `6a0c7f8`(2026-09-26 기준 origin/develop HEAD). 다음에 다시 pull할 때도 `docs/integration/repository-layout.md`의 절차(fetch → diff 검토 → detached checkout → `git add`)를 따른다.
- Decided는 구현 완료가 아니다. 위 15개 확인 항목 + "none" 잔여 이슈를 임의로 결정하지 않는다.
- GPT-6 Astra(`gpt-6-astra`), Claude Opus 5.5(`claude-opus-5-5`), Grok 4.7(`grok-4.7`), GLM-5.3-Flash(`glm-5.3-flash`, via OMP)를 사용했다. Astra가 이번 라운드에 일시적으로 불안정했다는 것도 기록(모델 자체 결함이 아니라 CLI 자동업데이트 충돌로 보임).
- 역사 snapshot/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다 — 단 이번엔 CI를 통해 **진짜 런타임(GitHub Actions) 검증**을 처음으로 확보했다.
- AGENTS.md "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일 — 이번 라운드도 메뉴 화면 0개 제작.

## 필요할 때만 읽는 기록

[직전 HANDOFF(2026-09-26 오전, PR #4-9 상세) 전체](.agents/reports/handoff-history-through-2026-09-26.md) · [Scope Contract Console 아티팩트](https://claude.ai/artifact/UCcdxht21KCBvwc7REvKrE) · 병합된 PR: [#10](https://github.com/hjung3113/analytics-platform/pull/10) [#11](https://github.com/hjung3113/analytics-platform/pull/11) [#12](https://github.com/hjung3113/analytics-platform/pull/12)(+ [실제 Actions 실행](https://github.com/hjung3113/analytics-platform/actions/runs/36213082533)). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
