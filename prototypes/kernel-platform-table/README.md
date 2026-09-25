# Unit C: PlatformDataTable + DetailDrawer

**합성 fixture, 실제 메뉴 아님.** 공통 컴포넌트 2개를 검증하는 React/TypeScript/Vite 실험이다. 제품 라이브러리 최종 채택이나 실제 권한/Scope·메뉴 통합을 의미하지 않는다.

```sh
cd prototypes/kernel-platform-table
npm ci
PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium
npm test
npm run build
npm run dev
```

`npm test`는 Vitest 서버 검사와 실제 Chromium Playwright UI 검사를 실행한다. 브라우저 설치 경로는 이 프로토타입의 `.browsers/`다. `npm run dev`는 Node fixture API와 UI를 함께 제공한다. 정적 `dist/`만 배포하면 API가 없으므로 동작하지 않는다. build는 타입 검사와 번들 생성 검증이다.

## 경계

- `src/platform/PlatformDataTable.tsx`: TanStack Table + Virtual; interaction/request state/preferences/selection/toolbar layout. Fixture 데이터와 의미를 import하지 않는다.
- `src/platform/DetailDrawer.tsx`: 주입된 title/context/tabs를 표시. 탭 키보드 이동, Escape, close와 focus 복귀를 소유한다. 비모달 상세 surface다.
- `src/fixture/App.tsx`: generic column/cell 의미, category filter, 표의 접근성 이름(`ariaLabel`), 페이지 크기(`pageSize`), row action와 상세 내용을 주입한다. Audit은 명시적 미연동 placeholder이며 AuditTimeline 구현이 아니다.
- `src/fixture/server.ts`: Vite Node middleware 전용. 2,000행을 서버에 생성하고 sort/filter 후 최대 250행만 반환한다. 브라우저가 전체 배열을 받거나 생성하지 않는다.
- `src/fixture/types.ts`: 타입만 공유한다. 실제 domain identifier나 CRUD가 없다.
- `src/ui/`: `docs/04_frontend_ui_ux.md` Decided 스택(Tailwind CSS v4 + shadcn/ui·Radix + `cn()`)의 이 프로토타입 전용 사본. 아래 "디자인 시스템 이식" 참고.

## 디자인 시스템 이식

`products/feedbackops/packages/ui`(서브모듈 `b5dd614`)에서 **복사**했다. 런타임 import·상대경로 참조·심링크는 없고, Unit 간 공유 패키지도 만들지 않았다(§24 Premature Platformization). 디렉터리 구조(`components/Button.tsx`, `components/shadcn/*`, `utils/cn.ts`)를 원본과 같게 두어 원본의 상대 import를 수정 없이 유지한다.

- 원본 그대로 복사: `utils/cn.ts`, `styles/tokens.css`(ADR-0021 RGB triple 토큰), `styles/semantic.css`(shadcn 변수·`surface-raised`/`border-default` 호환 alias), `components/Button.tsx`(FeedbackOps 커스텀 CVA Button — `shadcn/button.tsx`는 이를 재수출하는 shim이라 함께 복사), `components/shadcn/{tabs,popover,checkbox,label,alert,skeleton}.tsx`.
- Tailwind v3 → v4: `tailwind.preset.ts`의 `theme.extend`(colors/spacing/borderRadius/boxShadow)를 `src/ui/styles/theme.css`의 `@theme inline reference` 블록으로 옮겼다. 토큰 이름과 `rgb(var(--X))` 합성은 그대로이며 `bg-x/15` 같은 투명도는 v4 `color-mix`로 컴파일된다. `reference`로 테마 변수를 방출하지 않아 `--radius-md: var(--radius-md)` 같은 순환 선언이 생기지 않는다. 진입점은 `src/ui/styles/index.css`, Vite 플러그인은 `@tailwindcss/vite`. `tailwind-merge`는 v4 클래스 인식을 위해 원본의 2.5.5 대신 3.x를 쓴다.
- 채택: 모든 버튼 → `Button`, Column preferences `<details>` → `Popover` + `Checkbox` + `Label`(너비는 키보드 대안인 native range 유지), 행 선택 → Radix `Checkbox`(`row.toggleSelected`), 오류 → `Alert`(`role="alert"` 내장), 초기 로딩(이전 결과 없음) → `Skeleton`(`aria-hidden`, `role="status"` 문구는 유지), DetailDrawer 탭 → Radix `Tabs`(Arrow/Home/End roving focus, 자동 활성화).
- 제외: `sheet` — Radix Dialog는 modal이면 focus trap·배경 비활성화, `modal={false}`여도 바깥 상호작용 시 닫혀 비모달 상세 surface 계약과 충돌한다. `<aside role="dialog" aria-modal="false">`를 유지하고 sheet의 토큰 클래스만 적용했다. `select` — Radix Select는 native `<select>`가 아니어서 category 필터의 키보드/폼 의미와 `selectOption` 기반 검사를 바꾼다. native select에 토큰 스타일만 적용했다. `input` — 텍스트 입력이 없다. 나머지(alert-dialog, avatar, badge, card, combobox, dialog, dropdown-menu, hover-card, radio-group, textarea, toggle-group, tooltip)는 이 Unit에서 쓰지 않아 복사하지 않았다.
- 표 계약값(행/헤더 32px, 셀 padding `4px 12px`)은 rem 기준 utility(`min-h-8`, `px-3 py-1`)로 표현하므로 root font-size는 브라우저 기본값을 유지하고 13px 본문 크기는 `body`의 `--text-sm` 토큰으로 준다. tokens.css가 unlayered라 같은 이름의 Tailwind 기본 테마 값(`--text-sm` 13px, `--radius-sm` 2px 등)은 ADR-0021 값이 이긴다. popover 등의 `animate-in` 계열 클래스는 원본과 마찬가지로 애니메이션 플러그인이 없어 no-op이다.

`localStorage`의 `unit-c:columns:v1`에 너비/숨김/왼쪽 고정 선호를 저장한다. 이 프로토타입은 왼쪽 pin만 지원하며, 저장된 오른쪽 pin 선호는 복원하지 않는다. 컬럼은 헤더 경계 drag 또는 Column preferences의 키보드 지원 Width slider로 resize한다. 선택은 현재 mount 세션에서 stable ID로 페이지에 걸쳐 유지한다. 필터/정렬 변경은 첫 페이지로 이동하며 상세를 열고 닫을 때 테이블은 mount된 상태를 유지한다. Export는 안내만 표시하는 entry다.

요청 identity가 바뀌는 렌더에서 즉시 `aria-busy=true`를 파생한다. effect는 요청 실행/취소와 완료만 처리하며 loading을 뒤늦게 설정하지 않는다. 로딩/오류 중에는 마지막 성공 결과를 유지하고 이전 결과임을 안내한다. 부모 소유 필터, 정렬, 페이지, 재시도 모두 같은 규칙을 따른다. `filter: string`은 이 합성 category harness의 제한이며 범용 domain filter 계약 확정을 뜻하지 않는다.

## 근거와 한계

[work order](../../.agents/reports/kernel-work-order-platform-table-drawer-draft.md)에 원본 revision, 수용 사례 및 사용자 확인 필요 **5항목**이 있다. [TanStack pagination](https://tanstack.com/table/v8/docs/guide/pagination)의 manualPagination과 [Virtualizer](https://tanstack.com/virtual/latest/docs/api/virtualizer)의 count/estimateSize/measureElement를 사용한다. 실제 서버/데이터 규모 성능, 권한/Scope·cross-menu Context 연결, export와 Audit 데이터는 미검증·미연동이다.

[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)로 label/focus/keyboard/virtualization/overflow를 검토했다. resize slider는 drag의 키보드 대안이며 탭은 Arrow/Home/End를 지원한다. URL 동기화는 이번 standalone component 범위 밖이다. screen-reader 수동 검사나 실제 모바일 실기기 검사는 수행하지 않았다.

## 검증

`verification.log`에 실제 실행 결과를 기록한다. Node 단위 검사 5개 + Chromium 검사 9개로 총 14개이며, CSS 계약값 대조·페이지 응답·정렬·필터·가상 DOM window·컬럼 선호·다중 선택·Drawer 왕복 상태·오류/재시도·키보드·export 안내를 포함한다.

디자인 시스템 이식본은 테스트 파일 무수정(SHA256 동일)으로 Chromium 스위트 **10/10회 연속 통과**(9개 × 10회 = 90개 실행), Vitest **5/5 통과**, 타입 검사·빌드 통과다. `verification.log`의 `DESIGN SYSTEM PORT VERIFICATION`에 전체 출력을 기록했다.

이식 전 수정본은 Chromium 스위트 **15/15회 연속 통과**(9개 × 15회 = 135개 실행), Vitest **5/5 통과**, 타입 검사·빌드 통과다. `verification.log`의 `CURRENT REPAIR VERIFICATION`에 SHA256과 매 실행의 전체 출력/exit 결과를 기록했다. 앞부분의 이전 버전 단일 실행 이력은 현재 수용 근거와 구분해 보존한다. Drawer 테스트는 정렬 HTTP 응답과 첫 행을 확인한 뒤 스크롤을 설정하며, 별도 회귀 테스트는 sort/filter/page 응답을 지연해 busy와 이전 행·높이 유지를 확인한다.
