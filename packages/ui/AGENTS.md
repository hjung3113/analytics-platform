# @ap/ui

UI Primitive 층(06 §13)과 디자인 시스템 CSS. 플랫폼 개념(Context, Scope, 메뉴)을 모른다.

## 파일

- `src/styles/` — 디자인 시스템 CSS의 원본(ADR-0043·0046, FeedbackOps `a8d768b8`에서 이전): `tokens.css`·`semantic.css`(공유 값)·`theme.css`(Tailwind 테마 매핑)·`compat.css`, 그 위 `platform-tokens.css`(플랫폼 확장 값만), `index.css`(확장 Tailwind 테마 매핑·base·타이포 유틸리티 `t-page-title` 등. 진입점 = `@ap/ui/styles.css`). FeedbackOps처럼 플랫폼 확장 없이 공유 파일만 받는 소비자는 `@ap/ui/styles/{tokens,semantic,theme,compat}.css`와 클래스 스캔용 `@ap/ui/styles/sources.css`를 개별로 import한다. `styles/__tests__/`는 소비 계약·토큰 충실도·상태 색 대비 검사다.
- `src/components/shadcn/*` — shadcn primitive 22종의 실제 구현(원래 FeedbackOps). 공개 export는 `src/index.ts`의 명시 목록이고, `src/public-exports.test.ts`가 이름 목록을 고정한다. `DialogContentBare`·`alert-dialog`·`avatar`·`card`·`combobox`·`hover-card`·`sheet`·`textarea`·`toggle-group`은 플랫폼 화면이 쓰지 않지만 FeedbackOps `@fops/ui`가 얇은 재수출로 받으므로 공개한다(`src/index.ts` 끝의 FeedbackOps 소비 묶음). 같은 묶음에 `KeyboardShortcut`·`SkeletonBlocks`·`SkeletonRows`, 모션 상수·`readMotionTiming`·`useListMotion`·`isToastTarget`, 그리고 플랫폼 표식 없는 shadcn 탭 `TabsListBase`·`TabsTriggerBase`(`TabsList`·`TabsTrigger`는 플랫폼 표식 래퍼라 FeedbackOps 모양과 다르다)가 있다. 이 묶음은 소비자(FeedbackOps) 전환용이며 플랫폼 코드가 새로 쓰기 전에 06 §24 기준을 따른다.
- `src/components/PlatformTabs.tsx` — 예외: `TabsList`·`TabsTrigger`는 같은 패키지 shadcn 탭을 감싼 플랫폼 선택 표식 구현(ADR-0023 개정, #340). `Tabs`·`TabsContent`는 `shadcn/tabs`에서 내보낸다.
- `src/components/Button.tsx`·`KeyboardShortcut`·`SkeletonBlocks`·`SkeletonRows`, `src/utils/`(`cn`·`motion`·`toast-target`·`useListMotion` — 이전; `isProductionEnv`(플랫폼 환경 판단)·`platform.ts`(`isMacPlatform`·`shortcutLabel` — 단축키 표기의 OS 판정과 한 가지 표기 `⌘K`/`Ctrl+K`, #300) — 플랫폼 것), `src/internal/useHorizontalOverflow.ts`, `StatusBadge.tsx`(`Tone`: success/warning/danger/neutral/info).
- `src/{layout,panel,toolbar,forms,feedback}/` — FeedbackOps `a8d768b8`에서 옮긴 레이아웃 셸 3종(`PageShell`·`ListShell`·`WorkbenchShell`)·`ShellHeader`·`ToolbarKicker`, 상세 패널 부품(`DetailPanelHeader`·`DetailPanelSectionNav`·`FieldRow`·`Callout` 등), 목록 툴바, 폼(`DatePicker`·`FieldLabel`·`SearchInput`), 피드백(`DirtyConfirmation`·`EmptyState`·`PreviewModal`·`UndoToast`)과 그 테스트(#442). 공개 export는 `src/index.ts`(FeedbackOps 이름 그대로, FeedbackOps의 `DetailPanelSlotContext`는 옮기지 않았다). `badges/StatusBadgeFrame.tsx`는 `DetailPanelHeader`가 쓰므로 함께 옮겼고 형제 `badges`는 #443에서 옮겼다. 플랫폼 페이지는 계속 `PlatformPage`를 쓰고 이 셸을 채택하지 않는다.
- FeedbackOps `packages/ui` 전체 이전은 #441–#443(ADR-0046)에서 끝났다. ADR-0050/#479에 따라 도메인 결합 배지(`StatusBadgeFrame` 제외)·`entity/LinkedEntityTrail`·`components/{ChipPicker,ManagedSystemPicker,AnalyticsAreaPicker}`·`rich-content/`와 그 테스트를 FeedbackOps 소유로 되돌렸다. SDK에는 `data/ObjectRow`, `identity/{UserAvatar,UserChip}`, `indicators/{ProgressMeter,SeverityIndicator}`, `permissions/PermissionBlockedPanel`, `badges/StatusBadgeFrame`만 남긴다. 이들은 플랫폼 도메인에 묶이지 않으며 `StatusBadgeFrame`은 `DetailPanelHeader`가 쓴다. 공개 export는 `src/index.ts`에 명시한다. FeedbackOps에만 남는 파일: `components.json`·FeedbackOps `AGENTS.md`.

## 규칙

- 디자인 시스템 원본은 이 패키지다(플랫폼/SDK 소유, [ADR-0043](../../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)·[ADR-0046](../../docs/adr/0046-design-system-source-moves-to-platform-whole-package.md)). 토큰·유틸·primitive 묶음은 #441에서 FeedbackOps `a8d768b8` 값 그대로 옮겼고(이전 기록: [저장소 구조](../../docs/integration/repository-layout.md)), FeedbackOps `@fops/ui`는 FeedbackOps에 그대로 남는 별개의 사본이다. 이전된 묶음의 모양 변경은 여기서 먼저 한다.
- import 가능: 외부 라이브러리만. `@fops/*`와 `@ap/*`는 어떤 패키지에서도 import하지 않는다(경계 lint가 강제).
- 공유 토큰·폰트·반경·본문 값의 원본은 [tokens.css](src/styles/tokens.css)·[semantic.css](src/styles/semantic.css)이고 소비 계약은 [FeedbackOps ADR-0058](../../products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md)의 기록을 따른다(플랫폼 결정: [ADR-0011](../../docs/adr/0011-design-direction-feedbackops-shell.md)). 플랫폼 확장의 설계 원본은 [DESIGN.md](../../DESIGN.md#platform-extension-layer)이며 이 패키지는 구현을 소유한다. 토큰 파일 밖에서 hex 값 금지.
- 앱은 Tailwind → `@ap/ui/styles.css` 순서로 import한다. 이 진입점은 tokens·semantic(`layer(base)`) → theme → compat → `platform-tokens.css`(`layer(base)`) → `@source` 순서를 유지한다(캐스케이드 순서 변경 금지). 폰트는 앱에서 레이어 없이 import한다.
- label·vivid accent·control 경계의 역할과 허용 표면은 [DESIGN 접근성 pairing](../../DESIGN.md#accessibility-pairing-rules)을 따른다. 새 소비자도 이 조합을 확인한다.
- `DialogContent`·`SheetContent`를 플랫폼에서 렌더링하면 `closeLabel`, `Combobox`를 렌더링하면 `listboxLabel`·`emptyText`를 i18n에서 전달한다(FeedbackOps#749).
- 명령 팔레트는 `DialogContent scrim="palette"`를 사용한다(#310, FeedbackOps #1050); 다른 `DialogContent`는 기본 모달 scrim을 유지한다.
- 모션(토큰, overlay 진입·퇴장, reduced-motion)은 `theme.css`·`compat.css`와 primitive에서 그대로 온다(FeedbackOps ADR-0063, 06 §26). 플랫폼에서 덮어쓰지 않는다. `useListMotion`·모션 상수는 FeedbackOps 소비용으로 공개했지만 플랫폼 화면은 아직 쓰지 않는다(06 §24, #289). `prefersReducedMotion`의 첫 소비자는 EChartImpl의 Canvas reduced-motion이다(#297).
- 상태 색은 `StatusBadge`/`Tone`으로만 노출한다. 새 Tone은 DESIGN 변경이다.
- 데이터 조회, 권한 판단, 라우팅, 도메인 문구를 넣지 않는다. 그런 조합은 `@ap/components`다.
- shadcn 컴포넌트를 공개하려면 `src/index.ts`에 export하고 `src/public-exports.test.ts` 목록을 같이 고친다. `styles/index.css`의 `@source "../"`가 이 패키지 `src` 전체를 스캔한다.
- 이전한 테스트는 `vitest.config.ts`(`globals`, jest-dom setup `src/vitest.setup.ts`)로 돈다. FeedbackOps와 다른 의존 버전(vitest 3·jsdom 26·lucide 1.x)에서 다시 도는 것이므로 새로 생긴 실패는 코드를 고치지 말고 원인을 먼저 가린다.

- `DetailPanelSlot.tsx` — 셸 상세 슬롯 등록 primitive(Provider·host hook·등록 hook). 도메인·URL을 모른다(06 §13, ADR-0013). 슬롯은 하나이고 등록 방식은 둘이다([ADR-0047](../../docs/adr/0047-detail-panel-slot-single-registrant-model.md)): portal 등록(`useDetailPanelSlot()` — host를 받아 직접 portal, 제공자 없으면 throw)과 내용 등록(`layout/useDetailPanelContent(node)` — 셸의 `detailPanel` prop, 제공자 없으면 no-op, `undefined`면 비움). 둘은 한 등록자 목록을 공유해 마지막 등록자가 이기고 정리 시 직전 등록자가 돌아온다. 내용 등록의 내용은 Provider가 host에 portal로 그린다(그래서 Provider 위치의 React context를 본다). `useDetailPanelContent(null)`은 슬롯만 차지하는 닫힌 등록자이고, 슬롯 내용만 `DetailPanelFullscreenContext`(Provider가 확장 상태·Escape를 소유)를 받으며 호스트 hook은 `{ ref, open, expanded }`를 돌려준다(#473).

## 검증

`pnpm --filter @ap/ui test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). 토큰·스타일 변경은 `pnpm dev`로 화면을 직접 확인한다.
- `@formkit/auto-animate@0.10.0` 패치는 `useListMotion`이 남아 있는 동안 유지한다(`patches/@formkit__auto-animate@0.10.0.patch`, 루트 `pnpm-workspace.yaml`의 `patchedDependencies`). 패치가 없으면 `useListMotion` 테스트 2건(destroy 뒤 polling 타이머)이 실패한다. 패치 변경 후에는 `pnpm install` 결과와 workspace state를 확인한다.
