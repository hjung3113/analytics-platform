# apps/platform-e2e — 플랫폼 계약 자동 검사(E2E)

조립된 앱(`apps/platform-web`, mock 어댑터)을 브라우저로 띄워 **플랫폼 계약**을 검사한다(#44). 메뉴 화면의 요구사항은 검사하지 않는다. 메뉴 화면은 계약을 관찰하는 창일 뿐이다.

## 무엇을 검사하나

`tests/contract-<갈래>.spec.ts`(shell·context-links·components·chart·board·feedbackops)의 `describe`가 계약 영역, `test`가 보고서의 한 줄이다. 목록은 이 파일에 복사하지 않는다 — spec과 `contract-report/README.md`(실행 산출물, CI Job 요약에도 실린다)가 원본이고, 여러 spec이 쓰는 도우미는 `tests/contract-helpers.ts`에 있다. 새 영역의 `describe` 제목에는 해당 06 절을 적는다.

각 검사가 실제로 계약을 지키는지는 Kernel 가드를 일부러 망가뜨려 실패하는지로 확인했다(PR 본문 "변이 검사"). 검사를 고치거나 더할 때도 같은 방식으로 확인한다.

**알려진 공백:** 서버의 메뉴 권한 거부는 mock 서버 단위 테스트가 검사한다(`packages/adapters/mock-server/src/__tests__/menu-permission.test.ts`). UI는 클라이언트 라우트 게이트가 먼저 렌더되므로 서버 거부를 관찰할 수 없고, "직접 URL 거부" 검사는 클라이언트 게이트를 본다. 공간 진입 거부(§9.1)도 같은 공백이다 — 서버 거부는 단위 테스트 영역이고, E2E는 `RouteOutlet`의 클라이언트 게이트를 관찰한다.

## 규칙

- 블랙박스다. `@ap/*` 패키지를 import하지 않는다(lint 프리셋 `tooling`이 막는다). 화면과 dev 도구로만 조작한다.
- 역할은 `signInAs`(localStorage `platform:role`, 로드 전에 설정), 응답 시나리오는 dev 도구 팝오버로 바꾼다(`tests/support.ts`).
- `layout="fill"` 페이지(사이클타임)는 머리가 접힌 채 시작한다(#680). 머리 안 컨트롤(페이지 필터·칩 줄)을 만지는 테스트는 먼저 `tests/support.ts`의 `expandPageHead(page)`로 펼치고, 접힘 기억 키 `platform:page-head-collapsed:<menuId>`가 남지 않게 필요하면 로드 전에 지운다.
- 선택자는 역할·접근 가능한 이름(한국어 UI)을 쓴다. 문구가 바뀌면 여기도 고친다.
- 증거 스크린샷은 `evidence(page, testInfo, 이름)`으로 붙인다. 계약이 보이는 순간(전환 직후 등)을 찍는다.
- 기본은 데스크톱 1440×900(05 Decided)이다. 폭에 따라 달라지는 계약(ADR-0013 상세 슬롯, ADR-0015 Context 바)만 해당 `test`가 `setViewportSize`로 1280·1920 등을 검사한다.
- 임시 캡처는 `bash tooling/scripts/capture-page.sh <name> <route> [--variant <값>] [--role <engineer|admin|viewer>] [--ready <선택자>]`로 만들고, 출력된 Playwright 명령 실행 뒤 `bash tooling/scripts/capture-page.sh --clean <name>`으로 spec을 휴지통으로 옮긴다(기본 선택자는 `main h1`, 스크린샷은 1440×900 viewport만 캡처해 `.review/<name>-shots/`에 저장한다).
- 로컬 통과·CI 실패는 CPU 감속(`Emulation.setCPUThrottlingRate` 8)으로 재현하고 main과 비교한다. 고정 URL의 `page`는 그 필터 조합에서 실제 범위 안이어야 한다(#314 — 1건으로 걸러진 표에서 `page=2`).
- 새 페이지는 `about:blank`에서 시작해 `history.length`가 1이 아니다. replace 확인은 "Back 한 번이 앱을 떠난다(`about:blank`)"로 단언한다.
- 휠 검사(#700): 휠은 포인터 아래에서 가장 가까운 스크롤 컨테이너가 받는다. 바깥 스크롤을 보려면 스크롤 여유가 있는 컨테이너를 먼저 만들고(`#platform-main`에 높이 주입) 어느 요소가 움직였는지 단언한다. `has:` 로케이터는 바깥 요소 안쪽에서 맞추므로 상대 선택자로 시작한다. 확대 비교는 hover 툴팁이 섞이는 plot 전체가 아니라 안정된 가로축 눈금 띠를 같은 포인터 위치에서 잰다. 표를 끝까지 내릴 때는 행 높이가 안정될 때까지(300ms 간격 두 번 같음) 기다린 뒤 이어서 돌린다. 확대 후 끌기 이동은 그림 위 빈 자리로 포인터를 옮긴 뒤 휠로 확대하고(포인터가 그림 밖이면 휠이 확대하지 않는다), 누름 → 여러 단계 이동 → 놓기로 끈 다음 같은 자리에서 눈금 띠를 비교한다(#705).
- 작업 영역 높이 방식(#686): 저장되는 상태(`platform:workspace:v1:…`의 `mode`·`rows`)를 기다릴 때는 고정 sleep이 아니라 `expect.poll`로 저장 값을 읽는다(저장은 300ms debounce). 좁은 패널에서도 줄 px는 고정할 수 있어 폭이 아니라 저장된 `rows`로 단언한다. 보드 칸에서 쌓기를 검사하려면 폭이 필요하니 시트를 `2x1`로 시드한다.
- 순차 Tab 루프는 넉넉한 상한(300)과 도달 단언을 함께 둔다. 실패하면 error-context 스냅숏으로 포커스 위치부터 본다(#356).
- 끌어 놓기는 `locator.dragTo` 대신 사람처럼 끈다(누름 → 여러 단계 이동 → 목표 위 작은 이동 몇 번 → 놓기, dock 보드의 `dragTab`). `dragTo`는 목표에서 한 번만 움직여서, 끄는 사이 조회가 끝나 포인터 아래 요소가 바뀌면 브라우저가 놓기 없이 끌기를 끝낸다(main CI 39782412595, CPU 감속 6–8에서 20번 중 5–6번 재현). 그래도 놓기 직전에 포인터 아래 스켈레톤이 실제 내용으로 바뀌면 흉내 마우스는 새 요소에 dragover를 보내지 않아 놓기가 사라진다. 그래서 끌기 전에 놓을 칸의 내용이 다 그려질 때까지 기다린다(`panesLoaded`: 지표가 보이고 `aria-busy` 스켈레톤 0개, 진단 CI(`debug/dock-drag-flake`) 39899780320에서 60번 중 5번 → 39901103032에서 0번).

## 실행과 보고

- 루트 `pnpm e2e`. 브라우저가 없으면 `pnpm --filter @ap/platform-e2e e2e:install`(Playwright 기본 캐시에 설치, 실행도 같은 캐시를 본다). `PLAYWRIGHT_BROWSERS_PATH`를 쓰면 설치와 실행에 같은 값을 준다. 다른 경로의 옛 브라우저 폴더를 재사용하지 않는다: 그 폴더에 지금 Playwright 버전이 찾는 리비전이 없으면 모든 테스트가 브라우저 실행에서 실패한다(#608).
- dev 서버를 기본 포트 4190에 직접 띄운다(`reuseExistingServer: false`). 다른 checkout·세션과 동시에 돌리려면 `E2E_PORT=4290 pnpm e2e`처럼 포트를 바꾼다(base-path 설정은 `E2E_BASE_PATH_PORT`, 기본 4191; 값은 1–65535 정수만, 아니면 설정 로드에서 던진다, #809). 이미 떠 있으면 `lsof -nP -iTCP:<포트> -sTCP:LISTEN`으로 PID를 찾고 `lsof -a -p <PID> -d cwd`로 소유를 확인하고, 다른 checkout의 서버는 죽이지 말고 다른 포트를 고른다. CI는 env를 주지 않아 4190/4191 그대로다.
- 재시도하지 않는다(`retries: 0`). 간헐적 위반도 위반이다. 로컬에서 `--retries`를 주면 리포터가 재시도 후 통과를 "불안정"으로 따로 표시하고 모든 시도의 오류·증거를 남긴다.
- 실패한 검사는 Playwright의 실패 스크린샷(`screenshot: 'only-on-failure'`)이 그 항목의 증거로 들어간다.
- 보고: `contract-report/README.md`(항목별 통과/불안정/실패 표) + `evidence/`(스크린샷) + `results.json`. 실패 추적은 `playwright-report/`. 모두 git에 넣지 않는다.
- CI Job `Platform contracts (E2E)`가 표를 Job 요약에 싣고 `platform-contract-report` 아티팩트로 올린다.
- CI는 스위트를 shard 3개 Job(`Platform contracts (E2E shard i/3)`, `pnpm e2e --shard=i/3 --reporter=list,blob`)으로 나눠 돌리고, 병합 Job `Platform contracts (E2E)`가 blob을 `pnpm --filter @ap/platform-e2e e2e:merge`(`playwright.merge.config.ts`)로 합쳐 하나의 보고를 만든다(#666). 판정은 병합 Job이 shard 결과로 낸다. `fullyParallel: true`는 shard가 파일이 아니라 테스트 단위로 나뉘게 하려는 것이고, 워커가 1개라 실행 순서는 그대로다. shard 하나만 재현하려면 `pnpm e2e --shard=2/3` — 인자 앞에 `--`를 넣지 않는다(Playwright가 파일 필터로 읽는다). `e2e:base-path`는 shard 3에서 한 번만 돈다.
- lint·typecheck는 루트 `pnpm lint`·`pnpm typecheck`에 포함된다. `pnpm test`에는 포함되지 않는다.
