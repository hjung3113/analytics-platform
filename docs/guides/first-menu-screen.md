# 첫 메뉴 화면 만들기

이 저장소에서 메뉴 그룹 하나를 만들고 화면이 뜨는 것까지 따라 하는 글입니다. 끝나면 생성된 화면이 개발 서버에 뜨고, 그 패키지의 검사가 통과합니다. 규칙은 여기 다시 쓰지 않고 소유 문서로 잇습니다. 이 글은 순서와 명령만 알려 줍니다.

실제 메뉴는 사내에서 새로 만들고, 이 저장소의 메뉴는 플랫폼 계약을 확인하는 견본입니다([루트 AGENTS.md](../../AGENTS.md)). 그래서 연습은 아래 마지막 절의 방법으로 지웁니다.

## 시작 전

- Node 26.7.0, pnpm 11.1.1. 저장소 루트에서 `pnpm install`을 한 번 돌렸을 것.
- 화면을 만들기 전에 [06 계약](../contract/platform-ui-contract.md)의 §5(메뉴 확장 계약)와 §29(완료 정의)를 읽고, 화면이 어느 Page Archetype(§12)에 해당하는지 정합니다. 새 화면 설계 절차는 [설계 스킬](../../.agents/skills/analysis-platform-wireframe/SKILL.md)입니다.
- 새 화면이나 새 그룹은 이슈에서 시작합니다([루트 AGENTS.md](../../AGENTS.md) Workflow).

## 1. 메뉴 그룹 행 추가

메뉴는 그룹에 속하고, 그룹은 앱 조립 파일 [`apps/platform-web/src/menus.ts`](../../apps/platform-web/src/menus.ts)의 `GROUPS`에 있습니다. 생성기는 이 목록에 없는 그룹을 만들지 않습니다. 새 메뉴 그룹과 업무 시스템·권한을 앱이 선언하는 이유는 [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)입니다. `GROUPS` 끝, `// </gen:menu-groups>` 줄 바로 위에 한 줄을 더합니다.

```ts
{ id: groupId('tryout'), label: { ko: '연습', en: 'Tryout' }, icon: Settings, space: spaceId('mars') },
```

- `icon`은 파일 위쪽에 이미 import된 아이콘이나 `lucide-react`에서 가져온 것입니다.
- `space`는 같은 파일 `SPACES`에 있는 업무 시스템(코드 이름 `Space`)이어야 합니다. 값이 `null`이면 `platform/<그룹>/`에, 이름 있는 업무 시스템이면 `menus/<업무 시스템>/<그룹>/`에 만들어집니다.

## 2. 패키지 생성

저장소 루트에서 실행합니다.

```sh
pnpm gen:menu tryout --menu tryout-overview --label-ko "연습 화면" --label-en "Tryout screen" --path /mars/tryout --page-type overview
pnpm install
```

- `--label-ko`와 `--label-en`은 필수입니다.
- `--page-type`은 `overview`·`analysis`·`management`·`catalog`·`workflow` 중 하나입니다.
- 먼저 `--dry-run`을 붙이면 파일을 쓰지 않고 무엇이 바뀔지만 보여 줍니다.
- 생성기는 `menus/mars/tryout/` 패키지를 만들고, `menus.ts`·`dev/mock-assembly.tsx`·`style.css`·앱 `package.json`에 배선 줄을 더합니다. 어느 줄이 들어갔는지 출력에 그대로 나옵니다.

## 3. 만들어진 것 읽기

| 파일 | 하는 일 |
| --- | --- |
| `src/endpoints.ts` | 이 메뉴가 서버에 묻는 조회를 선언합니다(`defineEndpoint`). 권한·적용 Context·한도가 여기 있습니다. |
| `src/mock/index.ts` | 개발 중 쓰는 가짜 서버 응답입니다. 운영 빌드에는 실리지 않습니다. |
| `src/pages/TryoutOverview.tsx` | 화면입니다. `PlatformPage` 안에서 `useMenuQuery`로 조회하고 `QueryView`로 상태를 그립니다. 점선 칸이 Archetype이 정한 자리입니다. |
| `src/index.ts` | `manifests`만 내보냅니다. 화면은 지연 로딩으로 등록됩니다. |
| `src/*.test.ts` | 선언과 mock이 맞는지 보는 기본 시험입니다. |

화면을 채울 때의 규칙은 [페이지 작성 가이드](../../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙)가 원본입니다. 조회 선언과 서버 쪽 순서는 [사내 적용 가이드 §5](../integration/in-house-rollout.md#5-사내-메뉴-개발-가이드)를 따릅니다. 폴더별 금지 사항은 [menus/AGENTS.md](../../menus/AGENTS.md)에 있습니다.

## 4. 검사

```sh
pnpm --filter @ap/menu-tryout typecheck
pnpm --filter @ap/menu-tryout test
pnpm --filter @ap/menu-tryout lint
pnpm --filter @ap/platform-web typecheck
```

네 줄 모두 오류 없이 끝나야 합니다. 변경을 올리기 전에 돌릴 전체 검사와 화면 검사 범위는 [루트 AGENTS.md](../../AGENTS.md)의 Verification이 정합니다.

## 5. 화면 확인

```sh
pnpm dev
```

브라우저에서 `http://127.0.0.1:5173/mars/tryout`을 엽니다. `연습 화면` 글자와 점선 칸 네 개(요약, 추이, 주의 목록, 데이터 신뢰)가 보이면 됩니다.

## 6. 연습을 지우기

```sh
pnpm gen:menu --remove tryout
```

생성한 패키지와 배선 줄을 되돌립니다. 1단계에서 더한 `GROUPS` 행은 직접 지우고 `pnpm install`을 다시 돌립니다.

## 다음에 읽을 것

- 서버에 실제 엔드포인트를 만드는 사람: [사내 적용 가이드](../integration/in-house-rollout.md), [실서버 연결 체크리스트](../integration/real-server-checklist.md)
- 쓸 수 있는 공통 부품: [`@ap/components`](../../packages/sdk/components/README.md), [`@ap/ui`](../../packages/sdk/ui/README.md)
- 상태·Context·URL을 다루는 [`@ap/kernel`](../../packages/sdk/kernel/README.md)
