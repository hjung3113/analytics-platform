# @ap/menu-topview-studio 변경 기록

내부 버전이며 발행하지 않는다. SDK 범위는 package.json의 ap.sdk를 따른다.

## 0.4.2 — 2026-11-14

- Sample Window 가져오기는 끝 Record Sequence가 시작보다 앞선 닫힌 이벤트를 거부한다(#2110): 새 거부 코드 `reversed-seq`, 문구 «이벤트 N건의 끝 Record Sequence가 시작보다 앞섭니다.». 같은 batch는 재생에서도 거부되어 재생 화면과 타임라인이 서로 다른 상태를 그리지 않는다.
- 게시는 검토한 Mapping만 싣는다(#2053): `eqv.publishMapping` 입력에 `expectedMappingHash`(검토 대화상자의 `plan.mapping.hash`)를 더했다. 검토 뒤 다른 사람이 규칙을 저장해 서버의 평탄화 hash가 다르면 `invalid` `mapping/changed`로 아무것도 저장하지 않고, 대화상자는 «규칙이 바뀌었습니다. 다시 확인한 뒤 게시하세요.»를 보이며 alias 규칙을 다시 읽어 diff를 새 규칙으로 다시 계산한다. mock은 hash 형식만 검사한다.
- 설비 온보딩 Mapping 저장(#2035): 저장은 Board를 만든 규칙 파일의 버전만 보내고, 범위별 저장 성공 응답의 버전으로만 올린다. `conflict`면 저장을 잠그고 «다시 불러오기»(저장 안 된 변경이 있으면 확인)로 Board와 버전을 최신 파일에서 함께 다시 만든다. 편집이 없는 Board는 다른 사람의 저장을 다시 읽을 때 새 파일로 바뀐다.

## 0.4.1 — 2026-11-11

- Sample Window·Fleet 서버(#1658): `eqv.fleet`·`eqv.sampleWindows`·`eqv.observedInventory`·`eqv.bundledTemplates`와 가져오기·교체·퇴역·설비 등록을 서버가 제공한다(«Server: pending» 표시 제거). `eqv.publishMapping` 입력 `baseline`이 `windowHash`(선택한 window의 64 hex)로 바뀌고 서버가 저장된 Inventory를 Baseline으로 쓴다(`ValidateTab`·mock·`endpoints.ts`). `invalidates`: 게시는 `eqv.fleet`·`eqv.sampleWindows`도, 규칙·사전 저장은 `eqv.fleet`도 비운다. 화면은 달라지지 않는다.

### Not implemented

- 설비 등록의 Hub Model 목록 읽기와 서버 쪽 alias metadata 저장(서버는 alias metadata 없이 Inventory를 만든다, mock과 같다): 이번 서버 PR에서도 만들지 않았다. 다시 열 조건: 소유자가 Fleet에 없는 Model로 등록하길 원할 때 / alias metadata 가져오기를 정할 때 (`docs/architecture/platform-api/api/eqv.md` «Not implemented»).

## 0.4.0 — 2026-11-11

- Sample Window 가져오기와 설비 등록(#1658, ADR-0140): 데이터 탭 표 위 «Sample Window 가져오기» → 대화상자에서 `*.batch.json`을 고르면 구간·Generation·Occurrence·timeDomain과 검증 문제·경고를 미리 보이고(`@eqv/core` `checkSampleWindowImport`, 개발 도구와 같은 코드), 확인하면 `PlatformAdapter.uploadFile`로 올린 뒤 `eqv.importSampleWindow { equipmentId, uploadId }`. 사전 점검 32 MiB·`*.batch.json`/`application/json`, 업로드 `invalid`·`forbidden`·`conflict`·`error`와 서버 거부 코드를 대화상자에 표시. 같은 구간을 다시 처리한 Generation은 «교체 대기»로 들어가 기존 «교체»로만 바뀜(EV#105). `uploadFile`이 없는 어댑터는 버튼 대신 이유 한 줄. Fleet 머리의 «설비 등록»(`eqv.registerEquipment { equipmentId, label, vendorId, modelId }`) → Fleet에 «관측 없음». 두 쓰기 모두 `eqv-studio:window-import`, 서버는 Pending(mock만). mock은 올린 파일을 올린 사람으로만 id로 읽고(`readUpload`), 앱 mock 조립이 `setSampleWindowImport`로 core 판정·Inventory 계산을 넘긴다.
- 검토 반영(#1658 가져오기): 검사·서버 거부 문제를 코드별 한국어 한 줄로 묶고(같은 코드는 개수로, schema 실패는 «Sample Window(batch) 파일 형식이 아닙니다.»), 경로·원문은 접힌 «자세히»에만, 안내 줄은 문제 종류별(다른 설비 파일은 두 설비 ID를 말함). 같은 내용 파일, 퇴역한 window의 내용(서버 `file/retired`), 교체 대기가 이미 있는 구간(`file/staged_exists`)은 미리보기에서 «가져오기»를 끔. 결과 머리 줄은 항상 있는 `role="status"`, 진행 중 버튼 «올리는 중…»·«가져오는 중…»·«등록하는 중…»과 `aria-busy`, 검사 실패는 «파일을 검사하지 못했습니다.», 화면을 떠나면 업로드를 중단(가져오기 쓰기는 보낸 뒤 취소하지 않음). Fleet «설비» 칸과 설비 머리에 등록한 이름, Model이 없을 때 «EV 개발 도구에서 첫 설비를 등록하세요», 권한 없는 사람에게는 빈 상태가 가져오기·등록을 권하지 않음. 미리보기·«교체» 확인·Drift 머리의 구간은 짧은 형태(전체 값은 `title`), «이벤트 n건», ID 오류는 칸을 떠난 뒤 polite로, 거부되면 ID 칸으로 포커스, 첫 가져오기 뒤 표 위 버튼으로 포커스, 미저장 편집이 있으면 Mapping 탭에 «· 저장 안 됨».
- 단계 탭 전환은 미저장 Mapping 편집을 묻지 않고 지킨다(#1745 `useUnsavedGuard(dirty, { leaves: { pageKeys: ['equipment', 'window'] } })`). 설비·Sample Window를 바꾸거나 메뉴를 떠나면 묻는다.

### Not implemented

- 설비 등록의 Model 선택은 Fleet에 이미 있는 설비사·Model만 보인다: Hub Model 목록을 읽는 온보딩 읽기가 없다. 다시 열 조건: #1658 Sample Window·Fleet 서버 PR이 등록 action을 구현할 때 Hub Model 목록 읽기를 함께 정한다.
- mock은 alias metadata를 저장하지 않아 가져온 window의 Inventory를 batch만으로 만든다(서버는 설비의 alias metadata를 함께 쓴다). 다시 열 조건: 같은 서버 PR.

## 0.3.0 — 2026-11-11

- 설비 온보딩 화면(#1658): `도구 › Top View 작성 › 설비 온보딩`(`/tools/eqv-onboarding`, Management). Fleet 표(상태 컬럼 필터, 고정 `동작` 열) → 설비별 단계 탭(데이터·Inventory·Template·Mapping·검증·게시·Drift)과 Sample Window 선택기. page key `equipment`·`step`·`window`. Mapping Board(§4 단축키, 저장 범위, 실행 취소, 미저장 가드), 브라우저 dry-run과 충돌 강조, 게시 검토(diff·Revision·Binding 줄)와 `publishRevision` → `publishMapping`, Sample Window 교체·퇴역. 권한 `eqv-studio:rules-edit`·`eqv-studio:dictionary-global-edit`·`eqv-studio:mapping-publish`·`eqv-studio:window-import`. 서버가 없는 읽기·쓰기는 mock만(`docs/architecture/platform-api/api/eqv.md` «Pending server»).
- 검토 반영(#1658): 읽기 응답·쓰기 결과·`invalidates`·거부 경로를 서버와 맞춤(`eqv.bindings` `{document, version}`, `eqv.mappingVersion` `{layoutRevision, publishedAt, document}`, `eqv.baselineInventory` `{document}`, 저장 `{id, version}`, 게시 `{mappingHash, bindingId, version}`, `mapping/same-as-latest`)과 서버 drift 시험(`onboarding-menu-drift.test.ts`). 전역 alias 규칙도 브라우저 dry-run·diff·같은 게시 판정에 넣음. `게시 검토`는 Revision을 먼저 게시해야 할 때 `eqv-studio:layout-publish`가 없으면 막고 이유를 말함. mock은 `global` 저장에 `eqv-studio:dictionary-global-edit`를 요구. 화면: 페이지 가로 넘침 제거, Fleet·Inventory 열 폭, 짧은 Site 시각(전체 값은 `title`), window 선택기 `generation · 상태 · 구간`, 이동 경로 «도구 › 설비 온보딩», 설비사·Model 이름, `SearchInput`, 아이콘 실행 취소·다시 실행, «Drift 검토» 표, 게시 검토의 Baseline Sample Window 줄과 «변경 없음», 게시 뒤 Binding 다시 읽기와 effectiveFrom 기본값, effectiveFrom 오류 문구, Sample Window 없는 설비의 빈 상태, 규칙화 대화상자는 입력·제출 뒤에만 문제 표시.

### Not implemented

- Mapping Board 다중 선택(`Space`·`Shift`+이동·`⌘/Ctrl`+클릭)과 선택 행 일괄 확정·무시: 이번 화면은 `자동 일괄 확정`만 옮겼다. 다시 열 조건: 같은 Model 다설비 작업이 실제로 필요하다는 요청.
- 같은 Model 일괄 dry-run(ONBOARDING §6 D12)과 Type Dictionary·alias metadata 편집 화면(`eqv.saveTypeDictionary`는 선언만): 다른 설비의 inventory·초안을 한 번에 읽는 서버 읽기가 없다. 다시 열 조건: #1658 Sample Window·Fleet 서버 PR 병합.

## 0.2.1 — 2026-11-11

- 레이아웃 검토 수정(#1654): Revision·EV Template 주소의 Layout ID 고정, 목록·게시 비교 기준 오류와 재시도, 초안 로딩 표시, 구성 탐색·단축키·삭제 취소 포커스, 토스트와 패널 높이·표기 정리.

## 0.2.0 — 2026-11-10

- 레이아웃 화면(#1654): 상시 3패널 편집기(파일·구성 / 도면 / 속성·연결), 초안 저장, Revision 게시, EV Template 승격, JSON 가져오기·내보내기, 미저장 편집 가드. 권한 `eqv-studio:view`(진입)·`eqv-studio:layout-edit`·`eqv-studio:layout-publish`.

## 0.1.0 — 2026-11-10

- 초기 기록: 레이아웃 화면과 manifest 스켈레톤.
