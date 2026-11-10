# EV 흡수 점검표 — 아카이브 전에 참이어야 할 것

상태: **Open** — 조건 1~5는 충족(2026-11-10 `main` 9c3081106 기준, 증거는 표). 6~8은 소유자 확인을 기다린다.

소유: [ADR-0132](../../../adr/0132-eqv-merges-into-platform.md), 이슈 [#1607](https://github.com/hjung3113/analytics-platform/issues/1607). EV 저장소의 아카이브는 소유자가 확인한 뒤에만 한다. 삭제하지 않는다.

| # | 조건 | 확인 방법 | 상태 |
| --- | --- | --- | --- |
| 1 | EV `develop`과 `main` 내용이 전부 들어왔고 기준 SHA가 이력 합치기 PR에 적혀 있다 | PR 본문, `git log products/eqv` | Done — 기준 EV `develop` fdb5fa6 + `main` 43248b7, 새 해시와 함께 `products/eqv/IMPORTED.md`에 있다. PR #1622(병합 24846c332, 2026-11-09, CI 16 통과·1 건너뜀) |
| 2 | `pnpm-lock.yaml`과 모든 `package.json`에 `equipment-visualization/releases` URL이 없다 | `rg equipment-visualization/releases` | Done — `main` 전체에서 이 줄 말고는 0건. PR #1626(병합 b8668d954, CI 17 통과) |
| 3 | EV 테스트 92파일(`*.test.ts(x)`, 릴리스용 `.mjs` 시험 2개는 가져오지 않는다)이 AP CI에서 돌고 `eqv.spec.ts`가 수정 없이 통과한다 | PR CI | Done — 90파일은 `packages/eqv/*`·`apps/eqv-studio`에서 그대로 돌고(지금은 `roots.test.ts` 포함 91파일), `tooling`의 EV 전용 2파일(`design-lint`, `eslint-boundary`)은 옮기지 않았다. 같은 규칙은 `tooling/eslint`의 EV 프리셋(`eqvCore`·`eqvUi`·`eqvHost`) 시험(#1619)과 `pnpm lint`가 확인한다. `eqv.spec.ts`는 #1029 이후 수정 없이 PR #1626 E2E 4개 샤드를 통과했다. PR #1623·#1624·#1626·#1627 CI 17 통과 |
| 4 | Studio가 AP에서 개발 도구로 뜨고 저장·발행이 된다 | `apps/eqv-studio` 시험 | Done — 시험 23파일 435개가 PR #1627(병합 9c3081106) CI를 통과했다. 직접 실행: `main`에서 `EQV_STUDIO_ASSETS`를 저장소 밖 폴더로 두고 Studio를 띄워 `/`·`/layouts` 200, 초안 저장 201, 발행 201(revision `sha256:86bf8052…`), 읽기 200이었고 번들 `packages/eqv/assets`는 바뀌지 않았다 |
| 5 | EV 문서, ADR, 용어가 옮겨졌고 AP 문서의 EV 저장소 링크가 고쳐졌다 | `pnpm docs:links`, `rg equipment-visualization` | Done — 문서·ADR 이력·용어·스킬·소유자는 PR #1628(병합 a5716ff20). EV를 외부 저장소로 부르던 AP 문서는 이 점검표를 닫는 문서 PR에서 고쳤고, `rg github.com/hjung3113/equipment-visualization`가 남기는 곳은 과거 기록(ADR-0039, 탑재 설계의 이력 절, `docs/integration/history/`, 동결한 EV ADR)뿐이다. `pnpm docs:links` 깨진 링크 0 |
| 6 | EV 열린 이슈를 AP로 옮기거나 닫았다(아래 목록) | 소유자 확인 | Open |
| 7 | 저자들의 `EQV_STUDIO_ASSETS` 데이터 루트를 백업했다 | 소유자 확인 | Open |
| 8 | 저장소를 지우지 않고 보관만 한다. 옛 AP 태그의 `pnpm install`이 릴리스 파일을 받는다 | 소유자 확인 | Open |

DB 이전 완료는 조건이 아니다. Studio는 AP 안에서 개발 도구로 계속 동작한다.

## 열린 EV 이슈 (2026-11-10 확인, 16개)

#239 Top View 자재 표식 W11 겹침(#236 후속), #187 SDK deferred, #184 Polish deferred, #177 Wrap-up and platform integration as an SDK, #170 Layout assembly deferred, #169 Custom part SVG ADR 제안, #160 Layout edit deferred, #153 Journey deferred, #146·#134 Replay UI deferred, #105 Import deferred, #91 Conductor preview 도구 이식, #60 Studio deferred, #3 M2 Replay, #2 M1 Standalone Studio, #1 M0 Design.

처리 방침은 소유자 몫이다. deferred 묶음은 AP `.planning/backlog.md`로 옮기거나 닫고, #239는 AP 이슈로 옮긴다. EV 저장소에 `chore/feedbackops-workflow` 가지(2026-10-14, 오래됨)가 있으며 가져오지 않는다.
