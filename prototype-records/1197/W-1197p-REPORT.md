## Summary

- 완료: 실제 셸 안에 `?variant=A|B|C` 프로토타입 4화면을 만들고, 캡처 22장과 `captures/captions.md`(SDK 조각 후보 포함)를 남겼다. 커밋은 하지 않았다(지시대로).
- 경로(실제 앱 URL은 메뉴 id 기준): `/log-dev/log-knowledge-models` (`/log/knowledge/models`), `/log-dev/log-knowledge-model/:modelId` (`/log/knowledge/models/:modelId`, navHidden, parent models), `/log-dev/log-knowledge-items`, `/log-dev/log-knowledge-item/:itemId` (navHidden, parent items). 동적 경로 파라미터가 지원돼 page key 대체는 쓰지 않았다.
- 파일:
  - `menus/log-dev/log-knowledge/src/index.ts` — 프로토타입 메뉴 4개 manifest(권한 `platform:view`)
  - `src/prototype/fixture.ts` — 합성 픽스처(제조사 8, 공정 12, 모델 300, SW 약 600, Item 80)
  - `src/prototype/store.ts` — 로컬 쓰기(추가·판단 변경)와 `PlatformDataTable`용 로컬 `loadPage`
  - `src/prototype/shared.tsx` — 안 전환기(document.body로 portal), 세 상태축 배지, 작성·파생 서랍, 판단 변경 서랍, 링크
  - `src/prototype/HierarchyTree.tsx` — SDK `HierarchyExplorer` 지역 대역(APG tree)
  - `src/prototype/ModelsExplorer.tsx` · `ModelProfile.tsx` · `ItemsList.tsx` · `ItemDetail.tsx` — 화면별 A/B/C
  - `.review/captures/*.png`(22장), `.review/captures/captions.md`
- 검사: `pnpm --filter @ap/menu-log-knowledge run typecheck` 0, `run lint`(디자인 lint 포함) 0, `run test` 93/93 통과. 테스트는 추가·변경하지 않았다(과제 범위 밖).
- 브라우저: ego-browser v2.2.0(TaskSpace는 끝에서 닫음). mock 앱은 `conductor.json` `app_preview.command`로 포트 5180에 띄웠고, 끝난 뒤 멈춰 5180이 비어 있음을 확인했다.
- 크기: `sips`로 22장 모두 확인했다. 1440×900, `*-item-drawer.png` 3장만 1280×800.
- 자체 점검에서 고친 것: 고정 안 전환기가 표 높이를 깎음(portal로 옮김), Item 목록 필터 id 중복으로 화면 오류, 열 줄바꿈, 1280+서랍에서 Item 상세 가로 넘침(grid `minmax(0,1fr)`), B 오른쪽 칸 폭.
- design-review 결과 고친 것: 소유 종류를 `SegmentedRadio`로, `게시됨만`을 `Checkbox`로, `수정` ghost, 의미 없는 근거 아이콘 제거.
- 남긴 것(프로토타입이라 그대로 둠): Miller 열과 C 목록의 `h-[calc(100vh-7.5rem)]` 고정 높이(실구현은 `PlatformPage layout="fill"`), C 요약 칸이 비어 보임.
- SDK 공백: ① 범용 트리 탐색기(지연 자식·APG·선택/활성 분리) 없음 — `LegendTree`는 범례 전용. ② breadcrumb는 `PlatformPage crumbs`로 충분하나 `aria-current`·긴 경로 접기·로딩 자리 표시가 없음. ③ Miller 열 조각 없음. 상세는 captions «SDK 조각 후보».
- 결정 기록: 필터·라벨은 GLOSSARY·카탈로그 화면을 따라 `설비사` 대신 `제조사`를 썼다. 쓰기 표시는 `knowledge:catalog-manage`를 편집 권한 대역으로 썼다.
- 미해결 질문: 없음. 이 브랜치에서는 `apps/platform-web/src/workspace-assembly.test.tsx`의 "log 공간 화면 메뉴는 카탈로그 하나" 단언이 깨진다(병합 안 하는 브랜치라 손대지 않음, 실행하지 않음).
- Upstream: `prototype` UI.md §4 — 화면 안에 그린 고정 안 전환기가 `PlatformDataTable` 높이 측정(`tableFit`의 뒤따르는 형제)에 잡혀 표가 240px로 줄었다. 제안: "전환기는 `document.body`로 portal한다"를 UI.md에 한 줄 추가.

## Details

### 과제 항목별
1. 픽스처: MX-200(공정 3 ETCH·CLEAN·DEPO, SW 5), MX-210(SW 0), 공정 없는 모델(m-017), 비활성 몇 개. Item: 모델 소유와 SW 소유, 유형 4종과 상태 전부. KI-101은 r3, 근거 3(하나는 권한 없음), 판단 이력 5건(`disputed` 포함). KI-102 derived_from KI-101 r2(v3.2.1 → v3.3.0). KI-113은 보관, KI-109는 근거 없음.
2. 세 안이 같은 경로에서 `?variant=`로 바뀐다. 전환기는 하단 가운데 알약이고, 입력·트리·listbox·탭·대화상자에 포커스가 없을 때 ←/→로 넘긴다. `isProductionEnv`면 숨는다.
   - 모델 탐색: A 필터 표(제조사·공정·활성, 기본 활성, ADR-0105 한 줄 필터) / B 트리 + 표(공정은 표 필터) / C Miller 열 + 요약 칸.
   - 프로파일: A 섹션 쌓기 + 이동 막대 / B 허브(5행 미리보기 + 모두 보기) / C 탭.
   - 전체 Item: A·B 필터 표(기본 게시됨) / C 목록 + 분할 미리보기.
   - Item 상세: A 2/3 + 1/3 + 이력 아래 / B 본문 + 근거·판단 이력·리비전 탭 / C 전체 폭 탭(과제가 C 상세를 지정하지 않아 세 번째 구조로 정함).
   - 공통: 동적 breadcrumb(`모델 탐색 › Vendor A › MX-200`, `전체 기술 Item › KI-101` + 소유 칩), 세 상태축 배지(축 이름 접두사로 색 외 구분), 빈 상태, 작성 서랍(Model 또는 SW 하나), 판단 변경 서랍(사유 필수, 이력 덧붙이기만), 파생 서랍(제목·분석만 복사, 소유 다시 고름, 같은 소유 거부, 근거 비움, 초안·미확인·열림).
3. 문구는 한국어다. 토큰과 컴포넌트만 써서 디자인 lint가 0이다. 억제 주석은 없다.
4. 자체 점검 루프와 design-review 1회를 마쳤다(위 Summary).
5. 캡처는 위와 같다. `now-logdev.png`는 코드를 바꾸기 전에 찍었다.
6. `captions.md`를 썼다.
7. 미리보기를 멈추고 브라우저 TaskSpace를 닫았다.

### 호스트 전용 확인
- 화면 전환과 쓰기 동작은 로컬 상태라 새로고침하면 픽스처로 돌아간다.
- 전체 `pnpm test`·`build`·E2E는 돌리지 않았다(작업자 규칙). 패키지 lint·typecheck·test만 돌렸다.

<!-- W-1197p-DONE -->
