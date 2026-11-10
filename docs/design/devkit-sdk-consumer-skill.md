# SDK 소비자 스킬 설계

상태: **Decided** ([ADR-0131](../adr/0131-sdk-consumer-skill-and-intent-table.md)).

이슈: [#1207](https://github.com/hjung3113/analytics-platform/issues/1207)(상위 [#1206](https://github.com/hjung3113/analytics-platform/issues/1206)). 이슈 본문을 현행 코드와 대조한 결과는 [조사 기록](../research/2026-11-09-devkit-issue-audit-and-catalog-poc.md)에 있다.

## 목적과 범위

여러 개발자와 에이전트가 이 저장소에서 메뉴를 만들 때, SDK에 이미 있는 부품을 찾아 공개 import로 쓰게 한다. 첫 전달은 넷이다.

- 스킬 `ap-sdk-consumer`([`.agents/skills/ap-sdk-consumer/SKILL.md`](../../.agents/skills/ap-sdk-consumer/SKILL.md))
- 손으로 쓴 의도어 표([`intents.md`](../../.agents/skills/ap-sdk-consumer/intents.md), 20행 안팎)
- 이름 존재 검사(`.github/scripts/check-sdk-skill-names.mjs`)
- 메뉴 작업 3건의 사용 전후 비교([결과](../research/2026-11-10-sdk-consumer-skill-comparison.md))

`pnpm gen:menu`는 유일한 메뉴 생성기로 남는다. 범위 밖과 구현하지 않는 것은 [Deferred](#deferred-구현-안-함)에 있다.

## 실제로 무엇을 하게 되나

### 에이전트

메뉴 화면을 만들거나 고칠 때 스킬이 뜬다. 의도어 표에서 필요한 부품을 찾고, API 스냅샷에서 시그니처를 읽고, 계약 절을 읽고, 이미 쓰고 있는 메뉴의 코드를 본다. 코드를 쓴 뒤 그 패키지의 lint와 typecheck를 실제로 돌린다.

```
$ rg '^PlatformDataTable' tooling/sdk/api/components.root.api.txt
108:PlatformDataTable | function | function PlatformDataTable<T>(p: @ap/components#PlatformDataTableProps<T>): import("react").JSX.Element
```

### 개발자

평소에는 할 일이 없다. 공개 API에서 이름을 지우거나 바꾸면 PR CI의 이름 검사가 실패한다. 표의 그 행을 고치면 된다. 새 부품이 흔히 쓰이게 되면 표에 한 줄을 더한다.

```
$ node .github/scripts/check-sdk-skill-names.mjs
.agents/skills/ap-sdk-consumer/intents.md: @ap/components#ViewSelectorX is not exported (tooling/sdk/api/components.root.api.txt)
(종료 코드 1)
```

### 잡지 못하는 것

- 이름은 있는데 뜻이 달라진 경우. 검사는 이름이 있는지만 본다.
- 표에 없는 부품. 스킬은 스냅샷을 직접 찾으라고 안내하지만, 공개 export의 절반 이상에 설명이 없어 이름으로만 찾는다.
- 에이전트가 스킬을 띄우지 않은 경우. 스킬은 안내일 뿐이다. 금지 import는 경계 lint가 막는다.
- 타입이 맞는 잘못된 사용, 화면 모양, 동작, 권한, 데이터 정확성.
- 저장소 밖에서의 사용. 이 스킬의 외부 배포는 구현하지 않았다. EV는 ADR-0132에 따라 이 저장소의 workspace 소비자로 옮겼다.

## 의도어 표

한 행은 필요(한국어·영어), 공개 이름, 계약 절, 주의로 이루어진다. 공개 이름은 `` `@ap/<진입점>#이름` `` 형식이고 메뉴가 import할 수 있는 진입점만 쓴다. 계약 문장은 옮기지 않고 링크한다. 흔한 필요만 담고 SDK 전체를 담지 않는다.

Context는 `useQueryContext`와 `projectContext`로 안내한다. 패널 Context API는 없고 #911의 타입 이름은 정해지지 않았으므로 표에 넣지 않는다.

## 이름 검사

`tooling/sdk/api/*.api.txt`를 그대로 읽는다. 새 생성기를 두지 않는다.

- `# reachable types` 위의 export 이름만 인정한다.
- 메뉴가 import할 수 없는 진입점의 이름은 실패다.
- 스킬 폴더의 상대 링크와 앵커를 확인한다. `check-doc-links.mjs`가 `.agents/skills/`를 제외하기 때문이다.
- 이름을 하나도 담지 않은 스킬은 실패다. 아무것도 증명하지 못하기 때문이다.

Node 내장 모듈만 쓰고 모든 PR에서 설치 전에 돈다. `.agents/`만 바꾼 PR은 정적 단계를 건너뛰고, 그대로 병합되면 `main` 푸시에서 처음 드러나기 때문이다.

## 플랫폼 판단

되돌릴 수 있다.

- 스킬과 표는 `.agents/skills/` 한 곳에만 둔다. 실행기별 경로는 기존 심볼릭 링크로 읽는다.
- 시그니처는 표에 옮기지 않는다. 스냅샷이 원본이고 표에 적으면 낡는다.
- 비교는 같은 지시문으로 스킬 없음, 스킬만, 스킬과 폴더 안내문 포인터의 세 조건을 잰다. 지시문에는 스킬을 적지 않아 스스로 찾는지도 함께 잰다.

## Deferred (구현 안 함)

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| 생성형 Catalog 전체, `inspect`, `check` 묶음 | 기존 `.api.txt`, lint, tsc와 겹친다 | 실제 메뉴 PR이나 리뷰에서 의도어 표와 이름 검사가 막지 못한 잘못된 SDK import나 중복 구현된 SDK 부품이 나올 때 |
| `ap-devkit` tarball, 저장소 밖 `check`, 소비자 유형 판별 | 외부 도구 배포는 소유자 결정으로 보류한다. EV는 ADR-0132에 따라 workspace 소비자로 흡수됐다 | 저장소 밖 패키지가 이 도구나 확장을 실제로 필요로 할 때 |

생성형 Catalog를 다시 열 때의 출발점은 [설계안](../research/2026-11-10-devkit-generated-catalog-deferred-design.md)이다. 생성과 읽기를 나누는 구조, 공개 진입점 표, 토큰 스캐너와 EV에서 확인한 주의점이 거기 있다.
