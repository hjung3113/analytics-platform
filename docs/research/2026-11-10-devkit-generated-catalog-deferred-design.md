# AP DevKit — 생성형 SDK 카탈로그 설계안 (구현 안 함)

상태: **Deferred — 구현 안 함.** 근거 기록이며 권위 원본이 아니다. 현행 설계는 [SDK 소비자 스킬 설계](../design/devkit-sdk-consumer-skill.md)이고, 다시 여는 조건은 그 문서의 Deferred 절에 있다. 이 문서는 생성형 Catalog를 다시 열 때 출발점으로 쓴다.

조사 근거: [이슈 대조와 PoC](2026-11-09-devkit-issue-audit-and-catalog-poc.md).

## 목적과 범위

여러 개발자와 에이전트가 이 저장소에서 개발하는 것을 전제로, SDK 다섯 패키지(`@ap/contracts`·`kernel`·`ui`·`components`·`shell`)의 공개 API를 찾고, 올바르게 조합하고, 실제 검사로 증명하게 한다. 저장소 밖 배포는 [Deferred](#deferred-구현-안-함)다.

범위 밖: `ap-ui-review`와 브라우저 증거(#1208, #1209), 사내 런타임과 보안(#1210), Storybook MCP, `suggest panel`(#911 구현 뒤), 네트워크·서버·LLM.

`pnpm gen:menu`는 유일한 메뉴 생성기로 남고 CLI가 감싸지 않는다.

## 실제로 무엇을 하게 되나

아래 명령과 출력은 구현 전의 예시이고 실행 결과가 아니다.

### 에이전트

만들 기능을 `find`로 찾고, `inspect`로 import와 prop과 계약을 읽고, 코드를 쓴 뒤 `check`로 실제 lint와 typecheck를 돌린다. 메뉴 뼈대는 `pnpm gen:menu`로 만든다. 스킬 `ap-sdk-consumer`가 이 순서를 안내한다.

```
$ pnpm -s ap:devkit sdk find 표 --json
{ "catalog": { "schema": "ap-devkit/catalog/v1", "apiRevision": "…", … },
  "matches": [ { "id": "@ap/components#PlatformDataTable",
                 "import": "import { PlatformDataTable } from '@ap/components'",
                 "available": true, "matchedBy": ["intent:표"] } ] }
```

### 개발자

평소에는 할 일이 없다. 같은 명령을 직접 쳐도 되고, PR CI가 `sdk catalog --check`를 돌린다. 공개 API를 바꿔 손으로 쓴 안내가 낡으면 CI가 실패한다. 그 행을 다시 읽고 고치면 된다.

```
$ pnpm -s ap:devkit sdk catalog --check
FAIL 정책 행이 낡았다: @ap/components#PlatformDataTable (reviewedHash 불일치)
영향: 예제 1개, menus/mars/equipment 외 소비 파일 12개
할 일: 정책 행을 다시 읽고 reviewedHash를 고친다
(종료 코드 1)
```

### 잡지 못하는 것

- 타입이 맞는 잘못된 사용. 표를 맞는 prop으로 엉뚱한 화면에 넣어도 통과한다.
- 화면 모양, 동작, 권한, 데이터 정확성. 브라우저로 보지 않는다.
- 단위 테스트와 E2E의 실패. `check`는 lint와 typecheck만 돌린다. 나머지는 PR CI의 몫이다.
- 정책을 쓰지 않은 부품의 의도 검색. 공개 export의 절반 이상에 설명이 없어 이름으로만 찾는다.
- 이름이 다른 기능 중복. 이름이 같을 때만 권고한다.
- 정책 문장 자체가 틀린 경우. 시그니처가 바뀌었는지만 알 수 있다.
- 저장소 밖에서의 사용. EV 같은 외부 패키지에는 이 도구가 없다.

## 구조: 생성과 읽기

```
생성 (체크아웃 필요)                                   읽기 (카탈로그 하나)
packages/sdk/*/package.json exports → TS checker  ┐
docs/contract 등 참조된 절                         │    ┌─ find
테스트 파일 단어 색인                               ├─ 카탈로그 ─┼─ inspect
policy/sdk-policy.json (손으로 쓴 정책)             │    └─ doc
tooling/devkit-examples/src (컴파일되는 예제)       ┘
```

- `tooling/devkit/src/generate/**`만 체크아웃을 읽는다. TypeScript 의존도 여기에만 있다.
- `src/read/**`는 Node 내장 모듈과 자기 파일만 import한다. 답은 카탈로그에서만 나오고 `docs/`나 테스트, 소스 파일을 열지 않는다.
- 진입점 `src/cli.ts`는 `--catalog`가 없으면 생성기를 동적 import해 메모리에 카탈로그를 만들고 같은 읽기 코드에 넘긴다. 읽기 경로는 하나다. `--catalog <파일>`을 주면 그 파일만 읽는다.
- 패키지 배치: `tooling/devkit`(`@ap/devkit`, `tooling` lint 프리셋, `@ap/*`·React 의존 없음), `tooling/devkit-examples`(`@ap/devkit-examples`, `menu` 프리셋, SDK와 React 의존).

## 명령

`pnpm -s ap:devkit …`로 실행한다. `--json`은 기계용 출력이다. 종료 코드: 0 정상·통과, 1 위반·드리프트·미발견, 2 사용법·도구 오류·막힘.

| 명령 | 설명 |
| --- | --- |
| `sdk find <의도...> [--catalog f] [--limit n] [--audience menu\|host\|testing\|all]` | 일치 없음은 0과 `matches: []` |
| `sdk inspect <이름\|id> [--catalog f]` | 미발견은 1과 `found: false`, 가까운 공개 이름. 이름이 여러 id에 맞으면 1과 `ambiguous`. 전체 id는 항상 풀린다 |
| `sdk doc <ref> [--catalog f]` | 카탈로그에 묶인 계약 절 본문 |
| `sdk check <경로\|sdk> [--gates ...]` | [검사](#검사-check) |
| `sdk catalog [--check\|--impact <ref>\|--out f]` | [드리프트](#드리프트) |

## 카탈로그 (`ap-devkit/catalog/v1`)

최상위: `schema`, `apiRevision`(공개 API 줄의 해시. 정책·예제·JSDoc 제외), `digest`(`entries`와 `docs`의 해시), `packages`(버전), `entrypoints`(공개 진입점 전부: `{specifier, kind: module|css|json, audience}`), `entries`, `docs`, `ruleContracts`. 타임스탬프와 절대 경로는 없다. 읽기 쪽은 모르는 필드를 무시하고 모르는 메이저 버전은 2로 끝낸다.

| 항목 필드 | 내용 |
| --- | --- |
| `id`, `name`, `kind` | `@ap/components#PlatformDataTable`, function·const·class·type·interface·enum |
| `status`, `available`, `trackingIssue` | stable·deprecated·candidate. `available`은 candidate만 false |
| `audience` | 항목이 속한 진입점의 값 |
| `import` | 공개 import 문. candidate는 null |
| `summary`, `signature`, `props`, `omittedInheritedProps` | JSDoc 첫 문단, 한 줄 시그니처, 저장소에 선언된 prop만 |
| `references` | 시그니처가 참조하는 공개 id |
| `contracts` | `{ref, label, source}` 최대 5개. `ref`는 `docs` 표의 키 |
| `verifiedBy` | 소유 패키지의 테스트 경로. 예제가 아니라 근거 표시 |
| `examples` | `{id, title, path, source}`. 컴파일된 파일의 본문을 생성 때 넣는다 |
| `policy` | `intents`, `useWhen`, `avoidWhen`, `variants`, `a11y`, `perf` |
| `hash` | kind·시그니처·prop의 해시. JSDoc 제외. 체크아웃 경로가 섞이지 않게 `sdk-api-snapshot.mjs`의 정규화 함수를 뽑아 함께 쓴다(지금은 export가 없어 추출이 필요하다) |

| 진입점 | audience |
| --- | --- |
| `contracts`·`ui`·`kernel`·`components` 루트, `ui/theme`, `ui/theme-tokens.json` | menu, host |
| `shell` 루트, `kernel/host`, `components/dock`, `*/styles.css`, `ui/styles/*.css` | host |
| `*/testing` | testing |

`audience`는 진입점마다 고정된 값이고 저장소의 lint 프리셋에서 온다. `entrypoints`는 CSS·JSON처럼 심볼이 없는 공개 경로까지 담는다. `entrypoints`의 menu 범위가 `menu` 프리셋의 `allow`·`allowSubpaths`와 같은지 시험으로 고정한다.

테스트가 아닌 소스 파일의 경로는 출력하지 않는다. 결과가 내부 import를 암시할 수 없게 하기 위해서다.

`find`는 정확한 이름, 이름 토큰, 정책의 의도어(한국어·영어), 정책 본문, JSDoc 순으로 결정적으로 순위를 매기고 `score`와 `matchedBy`를 낸다. 공개 export의 절반 이상에 JSDoc이 없어 의도어가 필요하다. 기본 audience는 `menu`다.

정책은 차트·표·레이아웃·Context·필터·메뉴 페이지의 대표 부품에 쓴다. 보드는 셸 전용이라 메뉴용 기본 결과에 나오지 않는다. 나머지는 사실만으로 이름 검색된다. 정책 행의 `reviewedHash`가 현재 해시와 다르면 드리프트다.

#911의 패널 Context는 타입 이름이 정해지지 않았으므로 `@ap/x#Name` 모양의 id를 지어내지 않고 `candidate:panel-context` 행 하나로 둔다. 다른 이름으로 나오면 `--check`가 알 수 없으므로 #911 완료 조건에 이 행의 정리를 넣는다.

참조된 계약 절의 본문은 `docs`에 묶는다. 읽기가 카탈로그만 보게 하기 위해서다. 커밋마다 원본에서 생성하므로 손으로 옮긴 사본처럼 갈라지지 않는다. 상대 Markdown 링크는 글자만 남긴다.

## 검사 (`check`)

출력 `ap-devkit/check/v1`: `schema`, `target`, `pass`, `passScope`, `steps[]`, `diagnostics[]`, `advisories[]`.

- 경로 대상은 단계마다 대상 경로에서 위로 가장 가까운, 그 스크립트가 있는 `package.json`의 `lint`·`typecheck`를 돌린다. `eslint`로 시작하는 린트는 패키지의 인자를 지키고 `--format json`을 더해 대상 경로로 좁힌다. 스크립트가 없으면 `not-applicable`과 이유를 낸다.
- `sdk` 대상은 `catalog`, `sdk-api`, `sdk-schemas`를 돌리고, `consumer-check`는 무거우므로 `--gates`로 지정할 때만 돌린다. `dist`가 없으면 `blocked`와 `pnpm build` 재현 명령을 낸다.
- `pass`는 실제로 돈 단계가 하나 이상이고, 돈 단계가 모두 0으로 끝나고, `blocked`가 없을 때만 true다. `not-applicable`은 통과로 세지 않는다. `passScope`가 실제로 돈 단계를 적는다.
- `typecheck`는 대상 밖 진단도 판정에 넣는다. `tsc`는 패키지 전체를 보고, 대상 파일의 타입 변경이 같은 패키지의 다른 파일을 깨뜨릴 수 있어서다. `inTarget`은 어디를 볼지 알리는 표시이고 판정을 바꾸지 않는다.
- 진단: `ruleId`, `severity`, `path`, `line`, `column`, `message`, `inTarget`, `expectedContract{ref,label}`, `recommendedPublicApi{id,import}`, `repro`. 파싱하지 못한 실패는 `devkit/unparsed-failure`로 내고 통과시키지 않는다.
- import 판독은 주석과 문자열 리터럴을 건너뛰는 토큰 스캐너가 맡는다. 정적 import, `export from`, `export *`, 리터럴 동적 `import()`, `import()` 타입, `require`, CSS `@import`를 읽는다. 줄 단위로 읽으면 시험 코드의 문자열 안 import를 실제 import로 오인한다.
- 스캐너는 추천과 권고에만 쓴다. `pass`를 정하는 것은 lint와 typecheck의 종료 코드다.
- 추천 공개 API는 그 import를 카탈로그에서 찾는다. 공개가 아닌 이름이면 null과 `sdk find` 재현 명령을 낸다.
- `possible-duplicate`는 권고이고 `pass`를 바꾸지 않는다. 실제 계약 차이가 있으면 오탐이므로 `sdk inspect`로 비교하게 한다.

## 드리프트

카탈로그도 별도 매니페스트도 커밋하지 않는다. 커밋된 `tooling/sdk/api/*.api.txt`가 심볼별 매니페스트이고 `pnpm sdk:api`가 빌드된 API 변경을 잡는다.

`sdk catalog --check`(빌드 불필요, CI)는 다음에서 1로 끝난다.

- 생성한 id와 스냅샷 export 이름의 불일치. CSS·JSON 스냅샷과 `# reachable types` 아래는 제외한다. 시그니처까지 비교하지 않는 것은 소스에서 읽은 글자와 스냅샷의 선언 글자가 형식부터 달라서다. 시그니처 변경은 `sdk:api`가 잡는다.
- 없는 심볼을 가리키는 정책·예제
- 깨진 문서 앵커
- 낡은 `reviewedHash`

`--impact <ref>`는 스냅샷의 git diff에서 추가·제거·변경 id와 영향(정책 행, 예제, 소비 파일)을 낸다. `# reachable types` 아래의 변경은 그 이름을 정의에 쓰는 export로 돌린다.

문서 앵커는 Markdown만 바꾼 PR에서도 돌도록 `check-doc-links.mjs` 옆의 내장 모듈 스크립트가 함께 검사한다. CI가 그런 PR에서 정적 단계를 건너뛰기 때문이다.

## 플랫폼 판단

되돌릴 수 있고 근거는 [ADR-0131](../adr/0131-sdk-consumer-skill-and-intent-table.md)과 위 절에 있다.

- 사실의 원본은 `exports`가 가리키는 소스다. 빌드가 필요 없다.
- 소스 파일 경로를 내지 않는다.
- 검색은 어휘 기반이다. 사내에서 외부 AI를 호출하지 않고, 두 실행기가 같은 답을 받아야 한다.
- 예제는 컴파일되는 자기 패키지에 두고 카탈로그에 본문을 넣는다. 읽기가 카탈로그만 보기 때문이다.

## Deferred (구현 안 함)

소유자 결정(2026-11-10)으로 이번에서 뺐다. 아래는 **구현하지 않는다**.

| 항목 | 내용 |
| --- | --- |
| `ap-devkit` tarball | `sdk-v*` Release에 CLI·카탈로그·스킬을 싣는 여섯 번째 파일. `sdk:pack`, `sdk:consumer-check`, ADR-0056은 바꾸지 않는다 |
| 저장소 밖 `check` | 다른 저장소의 lint와 typecheck를 돌리고 저장소 전용 게이트를 해당 없음으로 보고하는 모드 |
| 소비자 유형 판별 | 다른 저장소의 패키지가 메뉴인지 호스트 모듈인지 가리는 일과 `module` audience |

**이유:** 지금 실재하는 외부 소비자는 `sdk-v0.19.0`에 고정된 EV 하나다.

**다시 여는 조건:** 저장소 밖 패키지(현재 EV 외의 소비자, 또는 EV가 최신 SDK로 올리는 시점)가 이 도구나 확장을 실제로 필요로 할 때.

다시 열 때 지킬 것은 EV 체크아웃으로 확인했다([조사 기록](../research/2026-11-09-devkit-issue-audit-and-catalog-poc.md)).

- 설치된 패키지로 소비자 유형을 판정하면 금지된 패키지를 설치하는 것만으로 금지가 풀린다. 판정에는 선언을 쓴다.
- 워크스페이스 루트에는 `@ap/*`가 없을 수 있다. 버전 확인은 대상 경로에서 시작하고, 찾지 못하면 통과시키지 않는다.
- Node 내장 모듈만 쓰는 읽기 코드는 그대로 다시 쓸 수 있다.

## 완료 확인 (실제 실행)

1. `AnalysisChart`, `PlatformDataTable`, `PanelWorkspace`, `useQueryContext`를 `inspect`해 import, prop, 계약 절이 풀리고 예제가 컴파일된다. 기본 `find`는 `@ap/shell`을 내지 않는다.
2. 깊은 SDK import와 금지 패턴이 실제 ESLint·tsc 실패로 잡히고 규칙 id, 줄, 추천 공개 API가 나온다.
3. 예제가 `typecheck`와 vitest를 통과하고 `verifiedBy`가 기존 SDK 테스트를 가리킨다.
4. `PlatformDataTableProps`의 prop 하나를 임시로 바꾸면 `sdk:api`가 실패하고, `catalog --check`가 낡은 정책 행과 영향을, `--impact`가 id와 소비자를 낸다.
5. 두 실행기(omp, opencode)가 각자의 경로로 스킬을 찾아 같은 `inspect --json`을 내고 sha256이 같다.
6. `gen:menu --dry-run`, `sdk:api`, `sdk:test`가 그대로다.
7. `src/read/**`만 저장소 밖에 복사해 카탈로그 파일로 돌린 결과가 저장소 안 출력과 바이트 단위로 같다.
