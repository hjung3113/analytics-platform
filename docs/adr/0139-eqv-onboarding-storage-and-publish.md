# ADR-0139 — 서버 `eqv` Onboarding: alias 규칙·Type Dictionary·Mapping Version·Baseline·Binding의 저장과 게시

- 상태: Decided (2026-11-11, lane ev 코디네이터, 되돌릴 수 있음). 구현은 [#1658](https://github.com/hjung3113/analytics-platform/issues/1658)의 서버 쪽(#1607 8단계). 화면은 시안 선택 뒤 별도 PR이다.
- 결정자: 코디네이터(lane ev). 사용자 방향은 [ADR-0132](0132-eqv-merges-into-platform.md)(EV 흡수)와 #1607 계획 댓글의 저장 표다.
- 이어받는 결정: [ADR-0135](0135-eqv-layout-storage-publish-and-promotion.md)가 8단계로 남긴 표·capability와, EV ADR-0007(게시 쓰기 순서)의 저장 방식. 규칙(D5–D9: 순서, `effectiveFrom`, 같은 게시 거부, 충돌은 막지 않음)은 그대로다.

## 결정

1. **저장.** `eqv` 스키마에 표 5개를 더한다(전부 `workspace_id` 범위, `id uuid` + `UNIQUE(workspace_id, id)`): `alias_rules`·`type_dictionary`(Mapping Scope당 한 행, `version`, 열 제한 UPDATE), `mapping_version`·`baseline_inventory`(불변, UPDATE·DELETE 없음), `binding`(UPDATE는 `effective_to`만). 마이그레이션 0124.
2. **게시 순서(EV ADR-0007 대체 구현).** "마지막 파일이 commit point"는 한 트랜잭션이 대신한다. `publishMapping`은 장비별 advisory lock 아래에서 Mapping Version(같은 hash면 기존 행 재사용) → Baseline(같은 hash의 기존 것이 있으면 유지, D5) → 열린 최근 Binding 닫기 → 새 Binding → `validateBindings` → 감사 행을 쓴다. 어느 단계든 실패하면 전부 롤백된다. 동시성은 장비의 Binding 행 수(`'0'`부터)이며, 작성자가 본 Binding 위에서만 게시가 앉는다.
3. **Scope 키는 Hub id.** Maker = Hub 벤더 id, Model = Hub 모델 id(uuid), Equipment = `equipment_id`. 자유 maker/model 문자열은 어디에도 없다(#1607 위험 2, EV#105). `@eqv/core`를 부를 때 scope는 `maker: <벤더 uuid>`, `model: <모델 uuid>` 문자열로 쓴다. 장비의 벤더·모델은 `eqv.equipment.model_id` → `knowledgeLookup.getModel`(`KnowledgeModelRef`에 `vendorId` 추가)로 트랜잭션 안에서 읽는다. 보는 사람에게 숨겨진 모델은 없는 장비와 같게 답한다(존재 누설 없음). 벤더는 객체 접근이 없어 존재만 보며 `knowledgeLookup.getVendor`로 읽는다.
4. **전역 쓰기는 별도 capability.** `global` 수준의 alias 규칙·Type Dictionary 쓰기는 `eqv.dictionary.global_edit`, 그 밖의 규칙·사전 쓰기는 `eqv.rules.edit`, 게시는 `eqv.mapping.publish`. 이유: 전역 행은 모든 설비를 바꾼다(ONBOARDING §8은 전역 수정을 소수로 둔다). 요청마다 트랜잭션 위에서 판정하고(잠금 대기 뒤 다시) 거부는 상세 없는 `forbidden`이다. 메뉴 권한 이름: 읽기는 모듈 권한 `eqv:view`(진입은 기존 `eqv-studio:view`), 쓰기는 `eqv-studio:rules-edit`·`eqv-studio:dictionary-global-edit`·`eqv-studio:mapping-publish`다(`eqv:*`는 앱 모듈의 이름공간이라 쓰기 이름은 Studio 접두사). 세 capability는 `knowledge:*`처럼 Admin 우회, 임시 규칙 없음, 세션 전용, User 역할 제외.
5. **Baseline은 클라이언트가 보낸다(임시 — 아래 «Sample Window 저장(개정)»이 대체).** Sample Window 저장이 없어 서버가 Baseline을 만들 수 없었다. 게시 입력이 `ObservedInventory`를 싣고 서버는 `observedInventorySchema`와 `equipmentId` 일치를 검사해 저장했다. 이 임시 방식은 개정으로 끝났다: 게시는 저장된 window의 hash(`windowHash`)를 받고 서버가 그 window의 저장된 Inventory를 Baseline으로 쓴다.
6. **게시는 이미 게시된 Layout Revision이 필요하다.** `publishMapping`은 초안을 게시하지 않는다(그건 Layouts 메뉴의 일이다). Revision이 없으면 `invalid`(`layoutRevision/not_found`). `mapping_version.layout_revision`은 그 hash를 처음 게시한 때의 Revision이고, Binding은 자기 `layout_revision`을 가진다(D6).
7. **Type Dictionary는 게시에 쓰이지 않는다.** `publishMapping`(core)은 alias 규칙 파일만 받는다. 사전은 Mapping Conflict(`role-mismatch`)와 역할 해석에 쓰이는 입력이라 읽기·쓰기만 제공한다.

## 버린 대안

- **maker·model 자유 문자열 키:** Studio 호환은 쉽지만 Hub와 두 원본이 생기고 철자 차이로 규칙이 갈라진다.
- **규칙 파일을 jsonb 한 덩어리 행으로, scope 구분 없이:** 범위별 쓰기 권한과 동시성(행 버전)을 걸 수 없다.
- **Binding 전체를 한 문서 행으로 덮어쓰기(EV 파일 방식):** last-write-wins가 남고, 닫는 UPDATE 하나로 끝나는 부분 변경을 권한으로 좁힐 수 없다.
- **전역 쓰기도 `eqv.rules.edit`:** 단순하지만 규칙 편집자 누구나 전 설비를 바꾼다.
- **게시가 초안을 함께 게시:** 한 단계로 줄지만 Layout 게시 권한(`eqv.layout.publish`)과 게시 승인이 섞인다.

## Sample Window 저장(개정)

- 상태: Decided (2026-11-11, lane ev 코디네이터, 되돌릴 수 있음). 위 5번의 다시 열 조건이다. 구현은 [#1658](https://github.com/hjung3113/analytics-platform/issues/1658)의 Sample Window·Fleet 서버 PR(이슈는 EFEM 수정과 #1659 때문에 열려 있음).
- 결정자: 코디네이터(lane ev).

1. **저장.** 표 `eqv.sample_window`(마이그레이션 0125, `workspace_id` 범위, `id uuid` + `UNIQUE(workspace_id, id)`, 인덱스는 `workspace_id`로 시작, `UNIQUE(workspace_id, equipment_id, hash)`): `equipment_id`(FK, restrict), `hash`(`sha256:<64hex>`), `from_at`/`to_at`(Site Wall-clock `YYYY-MM-DDTHH:mm:ss.fff`, 자르지 않음), `data_generation`, `time_domain`, `occurrences`, `state`(`active`·`staged`·`replaced`·`retired`), `counterpart_hash`, 검증을 통과한 `batch`(jsonb)와 가져올 때 만든 `inventory`(jsonb), 가져온 사람·시각, 갱신한 사람·시각. 런타임 역할은 SELECT·INSERT와 `UPDATE (state, counterpart_hash, updated_at, updated_by)`만 가진다(내용은 바뀌지 않는다). DELETE 없음.
2. **이유.** [ADR-0140](0140-generic-file-upload-port.md) §6은 소비자가 업로드를 24시간 안에 복사하고 연결 단계를 더하지 않는다고 정했다. window 내용은 업로드보다 오래 남아야 하므로 소비자(eqv)가 자기 표에 복사한다.
3. **게시는 저장된 window를 받는다.** `eqv.publishMapping` 입력 `baseline`은 `windowHash`(64 hex)로 바뀐다. window는 그 설비의 `active`여야 하고(아니면, 모르는 window든 숨겨진 설비의 window든 같은 `windowHash/not_active`) 서버는 저장된 `inventory`를 Baseline으로 쓴다. `baseline_inventory.window_id`(nullable FK, 새 행은 채움, 이전 행은 null)가 Baseline의 출처 window를 가리키고, `eqv.sampleWindows`의 `mappingCount`는 그 window를 가리키는 Baseline 행의 수다. Baseline은 그대로 불변이다: 퇴역·교체는 게시된 Baseline을 바꾸지 않는다.
4. **설비 등록.** `platform_app`은 `eqv.equipment`에 액션이 쓰는 네 열(`workspace_id`, `equipment_id`, `label`, `model_id`)의 INSERT만 가진다. UPDATE·DELETE는 여전히 없다.
5. **권한.** 새 capability `eqv.window.import`(메뉴 권한 `eqv-studio:window-import`): 작업 영역 범위, 민감하지 않음, Admin 우회, 세션 전용, User 역할 불가. 가져오기·교체·퇴역·설비 등록이 쓴다.
6. **무효화.** `publishMapping`은 `eqv.fleet`·`eqv.sampleWindows`도, 규칙·사전 저장은 `eqv.fleet`도 무효화한다. 그렇지 않으면 Fleet 상태(`unstarted`→`draft`)와 `mappingCount`가 새로고침 전까지 낡는다.

거부한 대안:

- **첨부를 부모에 연결(링크).** 연결 단계가 없다(ADR-0140 §6: 업로드는 연결되지 않은 행이고 24시간 뒤 정리된다). 연결 종류를 더하면 첨부 모듈의 부모 종류 계약을 바꾼다.
- **객체 저장소에 window 파일을 둔다.** 모듈은 객체 저장소에 닿지 않는다(저장소 이음새는 첨부 모듈 소유).
- **업로드 id를 그대로 저장하고 나중에 읽는다.** 24시간 뒤 사라져 Baseline 출처를 읽을 수 없다.

되돌리기: 표·열·권한만 더했으므로 이 PR을 되돌리면 이전 동작(클라이언트 Baseline)으로 돌아간다. 이미 저장된 window 행은 남는다.

## 결과

- 되돌리기: 표와 선언만 더했으므로 이 PR을 되돌리면 이전 동작으로 돌아간다.
- 메뉴 id는 `eqv-onboarding`(시안의 추천 id)이며 소유자가 다른 id를 고르면 상수 하나만 바뀐다.
- 구현 안 함(모듈 `AGENTS.md`): 허용 eqv 감사 보기. Sample Window 저장·`eqv.window.import`·설비 등록은 위 개정으로 구현했다.
