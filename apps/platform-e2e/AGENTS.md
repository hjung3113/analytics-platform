# apps/platform-e2e — 플랫폼 계약 자동 검사(E2E)

조립된 앱(`apps/platform-web`, mock 어댑터)을 브라우저로 띄워 **플랫폼 계약**을 검사한다(#44). 메뉴 화면의 요구사항은 검사하지 않는다. 메뉴 화면은 계약을 관찰하는 창일 뿐이다.

## 무엇을 검사하나

`tests/contracts.spec.ts`의 `describe` 하나가 계약 영역 하나, `test` 하나가 보고서의 한 줄이다.

| 영역 | 06 | 검사 |
| --- | --- | --- |
| 딥링크 복원 | §6.4 | 전역 Context·page 소유 상태 복원(새로고침 포함), 서버 기준시각(`defaultRangeTo`)으로 기본 기간 기록, 미지원 URL 버전 → 계약 오류, 설비 목록의 정렬·페이지·드로어 탭(sort/page/focus/tab) 딥링크 복원 |
| 메뉴 간 Context 보존·미적용 표시 | §6, §22 | 메뉴 이동 후 전역 Context 유지·page 상태 비복사, 미지원 Context "미사용" 표시 → 지원 메뉴에서 조회 결과에 실제 적용(결과 표의 Lot이 그 값뿐) |
| 권한 | §6.2, §17 | 권한 없는 메뉴 비노출, 직접 URL → 권한 거부 화면, 권한 없는 Scope → 대체 없이 거부 |
| 이전 결과 비노출 | §11, §19 | Scope 전환, 같은 Scope의 기간 변경, 역할(세션) 전환 |
| 공통 상태 화면 | §19 | 오류·시간 초과·0건·권한 거부 |
| returnTo 복귀 | §22 | 떠난 URL로 정확히 복귀, 앱 밖 `returnTo` 무시, 사이클타임의 정렬·bucket·bin을 returnTo에 보존하고 복귀 후 유지 |

각 검사가 실제로 계약을 지키는지는 Kernel 가드를 일부러 망가뜨려 실패하는지로 확인했다(PR 본문 "변이 검사"). 검사를 고치거나 더할 때도 같은 방식으로 확인한다.

**알려진 공백:** 서버의 메뉴 권한 거부는 mock 서버 단위 테스트가 검사한다(`packages/mock-server/src/menu-permission.test.ts`). UI는 클라이언트 라우트 게이트가 먼저 렌더되므로 서버 거부를 관찰할 수 없고, "직접 URL 거부" 검사는 클라이언트 게이트를 본다.

## 규칙

- 블랙박스다. `@ap/*` 패키지를 import하지 않는다(lint 프리셋 `tooling`이 막는다). 화면과 dev 도구로만 조작한다.
- 역할은 `signInAs`(localStorage `platform:role`, 로드 전에 설정), 응답 시나리오는 dev 도구 팝오버로 바꾼다(`tests/support.ts`).
- 선택자는 역할·접근 가능한 이름(한국어 UI)을 쓴다. 문구가 바뀌면 여기도 고친다.
- 증거 스크린샷은 `evidence(page, testInfo, 이름)`으로 붙인다. 계약이 보이는 순간(전환 직후 등)을 찍는다.
- 데스크톱 1440×900만 검사한다(05 Decided).

## 실행과 보고

- 루트 `pnpm e2e`. 브라우저가 없으면 `pnpm --filter @ap/platform-e2e e2e:install`(Playwright 기본 캐시에 설치, 실행도 같은 캐시를 본다). `PLAYWRIGHT_BROWSERS_PATH`를 쓰면 설치와 실행에 같은 값을 준다. 로컬에서는 `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`로 기존 브라우저를 재사용할 수 있다(Playwright 버전을 `1.63.0`에 고정한 이유).
- dev 서버를 포트 4190에 직접 띄운다(`reuseExistingServer: false`). 이미 떠 있으면 `lsof -tiTCP:4190 -sTCP:LISTEN | xargs kill`.
- 재시도하지 않는다(`retries: 0`). 간헐적 위반도 위반이다. 로컬에서 `--retries`를 주면 리포터가 재시도 후 통과를 "불안정"으로 따로 표시하고 모든 시도의 오류·증거를 남긴다.
- 실패한 검사는 Playwright의 실패 스크린샷(`screenshot: 'only-on-failure'`)이 그 항목의 증거로 들어간다.
- 보고: `contract-report/README.md`(항목별 통과/불안정/실패 표) + `evidence/`(스크린샷) + `results.json`. 실패 추적은 `playwright-report/`. 모두 git에 넣지 않는다.
- CI Job `Platform contracts (E2E)`가 표를 Job 요약에 싣고 `platform-contract-report` 아티팩트로 올린다.
- lint·typecheck는 루트 `pnpm lint`·`pnpm typecheck`에 포함된다. `pnpm test`에는 포함되지 않는다.
