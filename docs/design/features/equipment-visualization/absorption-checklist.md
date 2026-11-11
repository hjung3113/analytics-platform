# EV 흡수 점검표 — 아카이브 전에 참이어야 할 것

상태: **Open** — 조건 1~7은 충족(증거는 표와 아래 행 6 표). 8은 소유자 확인을 기다린다.

소유: [ADR-0132](../../../adr/0132-eqv-merges-into-platform.md), 이슈 [#1607](https://github.com/hjung3113/analytics-platform/issues/1607). EV 저장소의 아카이브는 소유자가 확인한 뒤에만 한다. 삭제하지 않는다.

| # | 조건 | 확인 방법 | 상태 |
| --- | --- | --- | --- |
| 1 | EV `develop`과 `main` 내용이 전부 들어왔고 기준 SHA가 이력 합치기 PR에 적혀 있다 | PR 본문, `git log products/eqv` | Done — 기준 EV `develop` fdb5fa6 + `main` 43248b7, 새 해시와 함께 `products/eqv/IMPORTED.md`에 있다. PR #1622(병합 24846c332, 2026-11-09, CI 16 통과·1 건너뜀) |
| 2 | `pnpm-lock.yaml`과 모든 `package.json`에 `equipment-visualization/releases` URL이 없다 | `rg equipment-visualization/releases` | Done — `main` 전체에서 이 줄 말고는 0건. PR #1626(병합 b8668d954, CI 17 통과) |
| 3 | EV 테스트 92파일(`*.test.ts(x)`, 릴리스용 `.mjs` 시험 2개는 가져오지 않는다)이 AP CI에서 돌고 `eqv.spec.ts`가 수정 없이 통과한다 | PR CI | Done — 90파일은 `packages/eqv/*`·`apps/eqv-studio`에서 그대로 돌고(지금은 `roots.test.ts` 포함 91파일), `tooling`의 EV 전용 2파일(`design-lint`, `eslint-boundary`)은 옮기지 않았다. 같은 규칙은 `tooling/eslint`의 EV 프리셋(`eqvCore`·`eqvUi`·`eqvHost`) 시험(#1619)과 `pnpm lint`가 확인한다. `eqv.spec.ts`는 #1029 이후 수정 없이 PR #1626 E2E 4개 샤드를 통과했다. PR #1623·#1624·#1626·#1627 CI 17 통과 |
| 4 | Studio가 AP에서 개발 도구로 뜨고 저장·발행이 된다 | `apps/eqv-studio` 시험 | Done(이력) — 개발 도구는 #1659에서 삭제했다(뷰어·Studio는 메뉴 패키지 `menus/tools/topview`·`topview-studio`로 옮겼다). 당시 기록: 시험 23파일 435개가 PR #1627(병합 9c3081106) CI를 통과했다. 직접 실행: `main`에서 `EQV_STUDIO_ASSETS`를 저장소 밖 폴더로 두고 Studio를 띄워 `/`·`/layouts` 200, 초안 저장 201, 발행 201(revision `sha256:86bf8052…`), 읽기 200이었고 번들 `packages/eqv/assets`는 바뀌지 않았다 |
| 5 | EV 문서, ADR, 용어가 옮겨졌고 AP 문서의 EV 저장소 링크가 고쳐졌다 | `pnpm docs:links`, `rg equipment-visualization` | Done — 문서·ADR 이력·용어·스킬·소유자는 PR #1628(병합 a5716ff20). EV를 외부 저장소로 부르던 AP 문서는 이 점검표를 닫는 문서 PR에서 고쳤고, `rg github.com/hjung3113/equipment-visualization`가 남기는 곳은 과거 기록(ADR-0039, 탑재 설계의 이력 절, `docs/integration/history/`, 동결한 EV ADR)뿐이다. `pnpm docs:links` 깨진 링크 0 |
| 6 | EV 열린 이슈를 AP로 옮기거나 닫았다(아래 목록) | 소유자 확인 | Done — 소유자 결정(2026-11-10): 아직 필요한 것만 가져온다. 16개를 읽고 코드로 확인해 AP 이슈 1개(#1632), 단계 이월 8개(#1607 댓글), 백로그 3개, 버림 4개로 갈랐다. 표는 아래 «행 6». EV 저장소에는 쓰지 않았다(댓글·닫기·아카이브 없음) |
| 7 | 저자들의 `EQV_STUDIO_ASSETS` 데이터 루트를 백업했다 | 소유자 확인 | Done — 백업 대상 없음(소유자 확인 2026-11-11, #1659 댓글): `EQV_STUDIO_ASSETS` 데이터 루트를 쓴 적 없음 |
| 8 | 저장소를 지우지 않고 보관만 한다. 옛 AP 태그의 `pnpm install`이 릴리스 파일을 받는다 | 소유자 확인 | Open |

DB 이전 완료는 조건이 아니다. (이력: 당시에는 Studio가 AP 안에서 개발 도구로 계속 동작했다. 개발 도구 `apps/eqv-studio`는 #1659에서 삭제했다.)

## 열린 EV 이슈 (2026-11-10 확인, 16개)

#239 Top View 자재 표식 W11 겹침(#236 후속), #187 SDK deferred, #184 Polish deferred, #177 Wrap-up and platform integration as an SDK, #170 Layout assembly deferred, #169 Custom part SVG ADR 제안, #160 Layout edit deferred, #153 Journey deferred, #146·#134 Replay UI deferred, #105 Import deferred, #91 Conductor preview 도구 이식, #60 Studio deferred, #3 M2 Replay, #2 M1 Standalone Studio, #1 M0 Design.

EV 저장소에 `chore/feedbackops-workflow` 가지(2026-10-14, 오래됨)가 있으며 가져오지 않는다.

## 행 6: 열린 EV 이슈 처리 (2026-11-10)

소유자 결정: 아직 필요한 것만 가져온다. 기준은 «살아 있는 버그, 또는 4~11단계와 현재 코드가 아직 다루지 않는 미완 항목»이고, 제목이 아니라 `packages/eqv`·`apps/eqv-studio` 코드로 확인했다. 브라우저 재현은 하지 않았다. EV 저장소는 읽기만 했다.

- **가져옴** = AP 이슈를 만들었다. **단계에 붙임** = 4~11단계가 이미 다루는 항목이라 [#1607 댓글](https://github.com/hjung3113/analytics-platform/issues/1607#issuecomment-6755798733)의 단계별 목록에 올렸다(단계 이슈를 만들 때 본문으로 옮긴다). **백로그** = `.planning/backlog.md`에 «구현 안 함», 이유, 다시 여는 조건으로 올렸다. **버림** = 끝났거나 낡았거나 EV 전용 도구다.
- 개수: 가져옴 1, 단계에 붙임 8, 백로그 3, 버림 4 (이슈당 대표 처리 하나로 센 16개). 백로그 항목은 주제별 4묶음이다.

| EV 이슈 | 처리 | 이유와 간 곳 |
| --- | --- | --- |
| EV#239 Top View 자재 표식 W11이 아이콘 고리 위에 | 가져옴 → AP [#1632](https://github.com/hjung3113/analytics-platform/issues/1632) | 살아 있는 버그. 마지막 렌더러 변경이 EV#236(2026-10-31)이고 `overlay.ts` `materialRowCy`는 primitive 고리를 모른다 |
| EV#187 SDK deferred | 단계에 붙임(4·5·11) + 백로그 | 설비 선택기(4, #1644): #753 ②의 ModuleHost 설비 포트 없음·설비 상세 링크(#885)는 유지하며, 소유자 2026-11-10 요청으로 모듈 안 선택기 조건을 충족했다(ADR-0053 개정). 쓰기·감사(5), 한 줄 `DataTrustIndicator`(11). 표시 다듬기·정리는 백로그. 패키징·`DetailFields`·Focus 진입 선택·표 열 줄바꿈은 EV가 이미 끝냈다 |
| EV#184 Polish deferred | 백로그 | 닫힌 행은 EV가 «변경 없음»으로 결정. 남은 `multiplyMatrix`·`round3` 공개 표면은 코드 정리 묶음 |
| EV#177 SDK 전환 계획 | 단계에 붙임(5) + 백로그 | 전환 계획은 ADR-0132로 실행됐다. Write API·Layout 소유·역할은 5단계(#1645, [ADR-0135](../../../adr/0135-eqv-layout-storage-publish-and-promotion.md): `defineAction`·감사·`eqv.view`/`eqv.layout.edit`/`eqv.layout.publish`), 사용자 SVG·출처·API 분리 ADR은 백로그. «구현 안 함»: 나머지 capability 이름 4개(`eqv.mapping.publish`, `eqv.rules.edit`, `eqv.dictionary.global_edit`, `eqv.window.import`)와 Bindings·Mapping 표는 해당 엔드포인트가 생기는 8·9단계에서(다시 여는 조건: 8단계 착수) |
| EV#170 Layout assembly deferred | 단계에 붙임(5) + 백로그 | 순환 `parentId` 거부는 5단계에서 구현됨(#1645: 서버 `validateLayout`의 `hierarchy-cycle`을 저장 전에 거부, 시험 있음). 포트 그리기·수정은 백로그(포트를 읽는 소비자 없음) |
| EV#169 사용자 정의 부품 SVG ADR | 백로그 | 소유자가 슬라이스로 고르지 않았다. 내장 primitive 25개 한계는 그대로 |
| EV#160 Layout edit deferred | 백로그 | 크기 편집·포트 스냅·다중 선택 없음(편집기 코드 확인). 템플릿 승격은 `/api/template-promotions`로 이미 있다 |
| EV#153 Journey deferred | 단계에 붙임(4·9) + 백로그 | 창 걸침 Journey(9). Anchor 없는 웨이퍼 선택기(wafer id·lot)는 구현 안 함: 설비 상세 탭이나 자재 id 딥링크가 생기면 재개한다([백로그](../../../../.planning/backlog.md), #1644). 표시 다듬기는 백로그. 라벨 겹침은 EV#212로 끝났다 |
| EV#146 Replay UI deferred | 단계에 붙임(8) + 버림 | 템플릿 Capability·Fleet 동작 열은 8단계. 라벨 겹침은 EV#212로, `demo:generate` 로더는 #1627에서 끝났다 |
| EV#134 Replay UI deferred | 단계에 붙임(9) + 버림 | Gantt 비용 가드는 `packages/eqv/views/src/timeline-cost.ts`로 옮겨져 AP Focus도 받는다. 커서 이동 재준비는 측정 기준만 9단계에 |
| EV#105 Import deferred | 단계에 붙임(5·8) + 버림 | 창 교체(8), 읽기 캐시·식별자 패턴(5). 식별자 패턴은 #1645에서 Hub 카탈로그 `model_id`(uuid)로 대체됨. 식별자 키(Maker=Hub 벤더 id, Model=Hub 모델 id)는 #1658 서버에서 ADR-0139로 확정했다. «구현 안 함»: Sample Window 서버 캐시·저장은 가져오기와 함께(다시 여는 조건: Sample Window 저장 착수. 그때 게시가 저장된 window id를 받는다. 지금 Baseline은 클라이언트가 보낸다). 단일 사용자 도구 항목은 EV 소유자가 2026-10-26에 wontfix로 닫은 것 |
| EV#91 Studio 미리보기 도구 이식 | 버림 | EV 전용 도구. AP는 conductor 미리보기를 쓴다 |
| EV#60 Studio deferred | 단계에 붙임(5·8) + 버림 + 백로그 | 대부분 EV 소유자 wontfix이거나 끝남(Drift #217). Bindings last-write-wins는 #1658 서버에서 장비별 잠금 아래 한 트랜잭션과 `binding` 표의 행 수 버전([ADR-0139](../../../adr/0139-eqv-onboarding-storage-and-publish.md))으로 대신했다. Studio 화면 행은 6·8단계가 `@ap/components`로 다시 만들고 `apps/eqv-studio`는 11단계에 삭제. Focus 배선은 `@eqv/views` `FocusView`로 옮겨졌다 |
| EV#3 M2 Replay | 버림(끝남) | `packages/eqv/{core,replay}`에 구현됐고 시험이 AP CI에서 돈다 |
| EV#2 M1 Standalone Studio | 버림(끝남) | Studio가 `apps/eqv-studio`에서 뜨고 저장·발행이 된다(행 4) |
| EV#1 M0 Design | 버림(끝남) | 템플릿 6개·스키마·자산·검증이 `packages/eqv/{core,assets,fixtures}`에 있다 |
