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

`localStorage`의 `unit-c:columns:v1`에 너비/숨김/왼쪽 고정 선호를 저장한다. 이 프로토타입은 왼쪽 pin만 지원하며, 저장된 오른쪽 pin 선호는 복원하지 않는다. 컬럼은 헤더 경계 drag 또는 Column preferences의 키보드 지원 Width slider로 resize한다. 선택은 현재 mount 세션에서 stable ID로 페이지에 걸쳐 유지한다. 필터/정렬 변경은 첫 페이지로 이동하며 상세를 열고 닫을 때 테이블은 mount된 상태를 유지한다. Export는 안내만 표시하는 entry다.

요청 identity가 바뀌는 렌더에서 즉시 `aria-busy=true`를 파생한다. effect는 요청 실행/취소와 완료만 처리하며 loading을 뒤늦게 설정하지 않는다. 로딩/오류 중에는 마지막 성공 결과를 유지하고 이전 결과임을 안내한다. 부모 소유 필터, 정렬, 페이지, 재시도 모두 같은 규칙을 따른다. `filter: string`은 이 합성 category harness의 제한이며 범용 domain filter 계약 확정을 뜻하지 않는다.

## 근거와 한계

[work order](../../.agents/reports/kernel-work-order-platform-table-drawer-draft.md)에 원본 revision, 수용 사례 및 사용자 확인 필요 **5항목**이 있다. [TanStack pagination](https://tanstack.com/table/v8/docs/guide/pagination)의 manualPagination과 [Virtualizer](https://tanstack.com/virtual/latest/docs/api/virtualizer)의 count/estimateSize/measureElement를 사용한다. 실제 서버/데이터 규모 성능, 권한/Scope·cross-menu Context 연결, export와 Audit 데이터는 미검증·미연동이다.

[Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)로 label/focus/keyboard/virtualization/overflow를 검토했다. resize slider는 drag의 키보드 대안이며 탭은 Arrow/Home/End를 지원한다. URL 동기화는 이번 standalone component 범위 밖이다. screen-reader 수동 검사나 실제 모바일 실기기 검사는 수행하지 않았다.

## 검증

`verification.log`에 실제 실행 결과를 기록한다. Node 단위 검사 5개 + Chromium 검사 9개로 총 14개이며, CSS 계약값 대조·페이지 응답·정렬·필터·가상 DOM window·컬럼 선호·다중 선택·Drawer 왕복 상태·오류/재시도·키보드·export 안내를 포함한다.

최종 수정본은 Chromium 스위트 **15/15회 연속 통과**(9개 × 15회 = 135개 실행), Vitest **5/5 통과**, 타입 검사·빌드 통과다. `verification.log`의 `CURRENT REPAIR VERIFICATION`에 SHA256과 매 실행의 전체 출력/exit 결과를 기록했다. 앞부분의 이전 버전 단일 실행 이력은 현재 수용 근거와 구분해 보존한다. Drawer 테스트는 정렬 HTTP 응답과 첫 행을 확인한 뒤 스크롤을 설정하며, 별도 회귀 테스트는 sort/filter/page 응답을 지연해 busy와 이전 행·높이 유지를 확인한다.
