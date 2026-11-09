# EV 흡수 점검표 — 아카이브 전에 참이어야 할 것

소유: [ADR-0132](../../../adr/0132-eqv-merges-into-platform.md), 이슈 [#1607](https://github.com/hjung3113/analytics-platform/issues/1607). EV 저장소의 아카이브는 소유자가 확인한 뒤에만 한다. 삭제하지 않는다.

| # | 조건 | 확인 방법 | 상태 |
| --- | --- | --- | --- |
| 1 | EV `develop`과 `main` 내용이 전부 들어왔고 기준 SHA가 이력 합치기 PR에 적혀 있다 | PR 본문, `git log products/eqv` | 미완 |
| 2 | `pnpm-lock.yaml`과 모든 `package.json`에 `equipment-visualization/releases` URL이 없다 | `rg equipment-visualization/releases` | 미완 |
| 3 | EV 테스트 95파일이 AP CI에서 돌고 `eqv.spec.ts`가 수정 없이 통과한다 | PR CI | 미완 |
| 4 | Studio가 AP에서 개발 도구로 뜨고 저장·게시가 된다 | `apps/eqv-studio` 시험 | 미완 |
| 5 | EV 문서, ADR, 용어가 옮겨졌고 AP 문서의 EV 저장소 링크가 고쳐졌다 | `pnpm docs:links`, `rg equipment-visualization` | 미완 |
| 6 | EV 열린 이슈를 AP로 옮기거나 닫았다(아래 목록) | 소유자 확인 | 미완 |
| 7 | 저자들의 `EQV_STUDIO_ASSETS` 데이터 루트를 백업했다 | 소유자 확인 | 미완 |
| 8 | 저장소를 지우지 않고 보관만 한다. 옛 AP 태그의 `pnpm install`이 릴리스 파일을 받는다 | 소유자 확인 | 미완 |

DB 이전 완료는 조건이 아니다. Studio는 AP 안에서 개발 도구로 계속 동작한다.

## 열린 EV 이슈 (2026-11-10 확인, 16개)

#239 Top View 자재 표식 W11 겹침(#236 후속), #187 SDK deferred, #184 Polish deferred, #177 Wrap-up and platform integration as an SDK, #170 Layout assembly deferred, #169 Custom part SVG ADR 제안, #160 Layout edit deferred, #153 Journey deferred, #146·#134 Replay UI deferred, #105 Import deferred, #91 Conductor preview 도구 이식, #60 Studio deferred, #3 M2 Replay, #2 M1 Standalone Studio, #1 M0 Design.

처리 방침은 소유자 몫이다. deferred 묶음은 AP `.planning/backlog.md`로 옮기거나 닫고, #239는 AP 이슈로 옮긴다. EV 저장소에 `chore/feedbackops-workflow` 가지(2026-10-14, 오래됨)가 있으며 가져오지 않는다.
