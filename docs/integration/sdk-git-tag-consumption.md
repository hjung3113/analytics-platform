# SDK를 git 태그 의존성으로 소비하기 — 시험 결과와 소비자 조건

> 상태: **Candidate** — 2026-10-19 시험(#458). 사내에 패키지 레지스트리가 없어 FeedbackOps가 `@ap/ui`를 이 저장소의 **git 태그 의존성**으로 받기로 했다(사용자 2026-10-19, [`.planning/README.md`](../../.planning/README.md) 1번). 이 문서는 그 방식이 실제로 풀리는지와 소비자가 갖춰야 할 조건을 적는다. 태그 형식·발급은 [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)의 묶음 릴리스를 따른다.

## 시험 조건

저장소 밖 임시 소비자(pnpm 11.1.1, Vite 8, Tailwind 4.3.3 + `@tailwindcss/vite`, TypeScript 5.9, React 19.3)가 이 저장소를 로컬 `file://` 클론의 태그로 받았다. 의존성 선언은 `"@ap/ui": "git+<저장소>#<태그>&path:/packages/ui"`다. 실제 원격(사설 GitHub, 사내 git 서버)과 소비자 개발 서버·테스트는 시험하지 않았다.

## 결과

| 확인 | 결과 | 소비자 조건 |
| --- | --- | --- |
| 하위 경로 패키지가 풀리는가 | 된다. `@ap/ui`의 `dependencies`에 `@ap/*`·`workspace:` 항목이 없어(`@ap/eslint-config`·`@ap/tsconfig`는 devDependencies) 다른 패키지를 끌어오지 않는다. 서브모듈은 받지 않는다 | `@ap/ui`가 `@ap/*` 런타임 의존을 갖게 되면 이 결과를 다시 확인한다 |
| TS 소스 export(`./src/index.ts`)로 빌드되는가 | 된다. Vite가 `node_modules`의 `.ts`·`.tsx`를 그대로 변환한다 | — |
| 소비자 `tsc --noEmit` | `@ap/ui` 소스가 `process.env.NODE_ENV`를 쓰므로(`components/Button.tsx`) 소비자 tsconfig에 `@types/node`가 필요하다. 그 밖의 오류는 없었다 | 소비자 `types`에 `node` 포함. 소스를 `tsc`가 통과시킬 `strict` 수준(`@ap/tsconfig/base.json`)이 소비자에도 필요한지는 미확인 |
| `@ap/ui/styles.css`와 클래스 스캔 | 된다. `styles/index.css`가 `@source "../"`를 가지고 있어 `node_modules` 안의 `@ap/ui` 소스 클래스(`inline-flex`, `h-8` 등)가 CSS에 생성된다. 소비자 CSS 첫 줄은 `@import "tailwindcss"`, 그다음 `@import "@ap/ui/styles.css"` | 이 순서를 지킨다(`index.css` 첫 주석) |
| Rich-content / `@tiptap/*` | `sdk-v0.4.0`에서 SDK 도메인 결합 rich-content와 `@tiptap/*` 의존성을 제거한다 | `sdk-v0.4.0`부터 소비자 `@tiptap/*` overrides 조건은 없다 |
| `@formkit/auto-animate` 패치 | 소비자가 같은 `patchedDependencies`를 가져야 한다(패치가 `@ap/ui`와 함께 오지 않는다). FeedbackOps는 이미 같은 패치를 갖고 있다(`package.json`의 `pnpm.patchedDependencies`) | 패치 파일 내용이 `@ap/ui`와 같은지 전환 때 대조 |

## 결론과 남은 것

- git 태그 의존성은 **된다**. 결정(레지스트리 없이 태그)을 다시 열 이유는 시험에서 나오지 않았다.
- `@types/node`와 `@formkit/auto-animate` 패치가 소비자 조건이다. `sdk-v0.4.0`부터 `@tiptap/*` overrides 조건은 적용되지 않는다.
- 소비 묶음(#466, `sdk-v0.2.0`): FeedbackOps의 얇은 재수출에 맞춰 `@ap/ui`가 `@fops/ui`의 공개 이름 전부(`DetailPanelSlotContext` 제외)를 내보내고, shadcn 탭은 `TabsListBase`·`TabsTriggerBase`로, CSS는 `@ap/ui/styles/{tokens,semantic,theme,compat}.css`와 스캔용 `@ap/ui/styles/sources.css`로 받을 수 있다. `sdk-v0.1.0`에는 이 이름과 경로가 없다.
- 실제 전환 결과(FeedbackOps#1289, 1번 묶음): 소비자가 `@ap/ui`의 의존 범위(`^`)대로 받으면 radix가 새 버전으로 떠 동작이 바뀐다(Radix Tabs 1.2.x: 마우스다운에 `focus()`가 더해져 자동 활성화가 `onValueChange`를 두 번 부른다). 동작을 그대로 두려면 소비자가 `pnpm.overrides`로 radix·`lucide-react`를 이전 값에 고정한다. `@ap/ui`의 `react`·`react-dom` peer(`^19.3.0`)는 FeedbackOps(19.0.0)에서 경고를 낸다 — SDK 쪽 항목(#470).
- 시험하지 않은 것(전환 전 확인): 소비자 개발 서버·테스트, 사내 git 서버 접근(GitHub의 이 저장소는 공개라 인증이 필요 없다. 사내에서 GitHub에 닿는지 또는 사내 미러가 필요한지는 [#151](https://github.com/hjung3113/analytics-platform/issues/151)·[#232](https://github.com/hjung3113/analytics-platform/issues/232)와 함께 확인), 의존 `@ap/ui` 버전이 둘 이상일 때의 React Context 중복.
- 소스 export는 소비자 번들러가 `.ts`를 변환해야 한다는 전제를 둔다. 소비자가 이를 못 하게 되면 dist 빌드가 필요하고, 그 모양은 `@ap/contracts`([#430](https://github.com/hjung3113/analytics-platform/issues/430))를 따른다.
