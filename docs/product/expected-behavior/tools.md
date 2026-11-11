# 도구 공간 기대 동작표

[기대 동작표](README.md)의 형식을 따른다. 공통 기대와 같은 내용은 적지 않는다.

도구 공간은 외부 모듈(`eqv`)을 Registry에 올려 셸이 맞이하는 방식을 확인하는 견본이다. 재생 화면의 값과 설비 도메인 동작은 대상이 아니다. 서버 재생은 아직 없어([ADR-0132](../../adr/0132-eqv-merges-into-platform.md) 결정 9) mock 조립에서 확인한다. 가는 길은 Home의 `도구` 카드에서 시작한다.

| 플랫폼 기능 | 견본과 가는 길 | 맞는 모습 | 근거 | 확인 |
| --- | --- | --- | --- | --- |
| 모듈 메뉴의 내비게이션 | Home `도구` 카드, 전환기 | 플랫폼 메뉴와 똑같이 카드, 전환기, 사이드바, 팔레트에 나온다 | [§5](../../contract/kernel.md), ADR-0132 | 화면 점검(mock) |
| 권한 없는 역할 | 개발 도구의 역할 전환, 주소 입력 | `eqv:view`가 없으면 카드가 없고 주소 입력은 권한 없음 화면이 된다 | [§9.1](../../contract/kernel.md) | 화면 점검(mock) |
| 정규 경로와 옛 별칭 | 주소 입력 `/tools/eqv-topview`와 옛 별칭 `/tools/topview` | 둘 다 같은 Top View 화면이 열린다 | ADR-0132 결정 6, [§6.4](../../contract/kernel.md) | 화면 점검(mock) |
| 사이드바만으로 진입 | 도구 › 설비 Top View | 화면 안의 선택기로 설비를 골라 볼 수 있다 | [#1644](https://github.com/hjung3113/analytics-platform/issues/1644) 완료 기준 | 화면 점검(mock) |
| 기본 기간의 한도 | 처음 진입 | 기본 구간이 선언한 8시간 한도를 넘지 않아 오류 없이 열린다 | #1644 완료 기준, 모듈 manifest `defaultPeriodHours` | 화면 점검(mock) |
| 기간 Context | 전역 기간 변경 | 기간을 바꾸면 그에 맞게 다시 그리고, 한도를 넘는 기간은 결과처럼 보이지 않고 사유가 나온다 | [§6](../../contract/kernel.md), [§19](../../contract/components.md) | 화면 점검(mock) |
| 주소 복원 | 설비를 고른 뒤 새로고침, 뒤로 | 고른 설비가 복원된다 | manifest `pageKeys`, [§6.4](../../contract/kernel.md) | 화면 점검(mock) |
| 숨은 화면 | Top View에서 Focus로 이동, 새로고침, 복귀 | 구간(`rangeFrom`, `rangeTo`)과 설비가 복원되고 Top View로 돌아간다 | manifest `pageKeys`, §6.4 | 화면 점검(mock) |
| 조회 상태 | 개발 도구의 응답 시나리오 | 로딩, 결과 없음, 오류가 서로 다른 모습이고 빈 결과를 오류로 보이지 않는다 | §19 | 화면 점검(mock) |

## 레이아웃(Top View 작성)

`도구 › Top View 작성 › 레이아웃`(`/tools/eqv-studio`, #1654)은 서버 `eqv` 모듈에 Layout을 저장한다. 그래서 위의 Top View와 달리 실서버에서 확인한다. 시드에 Layout이 없으므로 화면의 `가져오기`로 견본 파일(`packages/eqv/fixtures/cluster-single/layout.json`)을 먼저 넣는다. Studio 권한(`eqv-studio:*`)은 Admin만 역할로 가진다.

| 플랫폼 기능 | 견본과 가는 길 | 맞는 모습 | 근거 | 확인 |
| --- | --- | --- | --- | --- |
| 권한 없는 역할 | Developer·User로 같은 길, 주소 입력 `/tools/eqv-studio` | Studio 권한이 없으면 사이드바에 `레이아웃`이 없고 주소 입력은 권한 없음 화면이 된다 | §9.1, [05](../../architecture/platform-api/05-permission-policy.md) eqv | 화면 점검(실서버) |
| 도면 표기 | 레이아웃 화면 | 도면에 «개략도 · 실측 아님 · 제조사 도면 아님»이 보인다 | #1654 완료 조건 | 화면 점검(실서버) |
| 초안 저장 | 구성 이름 바꾸기 → `초안 저장` → 새로고침 | 저장 전에는 제목에 `저장 안 됨`이 보이고 `Revision 게시`가 막힌다. 저장 뒤 새로고침해도 바꾼 값이 남는다 | [ADR-0135](../../adr/0135-eqv-layout-storage-publish-and-promotion.md) 결정 1 | 화면 점검(실서버) |
| 미저장 편집 가드 | 저장하지 않은 편집을 둔 채 다른 메뉴로 이동 | 이동 전에 확인을 묻고, 머무르면 편집이 남는다 | #1654 | 화면 점검(실서버) |
| Revision 게시 | 저장된 초안 → `Revision 게시` | Revision 이력에 새 Revision이 생긴다. 바꾼 것 없이 다시 게시하면 새 Revision이 생기지 않는다 | ADR-0135 결정 2 | 화면 점검(실서버) |
| 동시 저장 | 같은 Layout을 두 탭에서 편집해 차례로 저장 | 두 번째 저장은 앞의 저장을 덮어쓰지 않고 충돌을 알린다. 내 편집은 남는다 | ADR-0135 결정 2 | 화면 점검(실서버) |
| 게시본은 읽기 전용 | Revision 이력에서 게시된 Revision을 연다 | 주소에 `layout`·`revision`이 남고 `초안 저장`이 없다. 새로고침해도 같은 Revision이 열린다 | ADR-0135 결정 2, [§6.4](../../contract/kernel.md) | 화면 점검(실서버) |
| Template 승격 | 게시된 Revision → `EV Template으로 승격` | EV Templates 목록에 새 Template이 나온다. 같은 ID로 다시 승격하면 거부되고 이유가 보인다 | ADR-0135 결정 4 | 화면 점검(실서버) |

## 설비 온보딩(Top View 작성)

`도구 › Top View 작성 › 설비 온보딩`(`/tools/eqv-onboarding`, #1658)은 `레이아웃` 옆 두 번째 메뉴다. 서버의 Fleet·Sample Window 읽기와 window 교체·퇴역은 아직 없어([eqv.md «Pending server»](../../architecture/platform-api/api/eqv.md#pending-server)) mock 조립에서 확인한다. 설비 등록과 Sample Window 가져오기는 EV 개발 도구에 남는다(메뉴 CHANGELOG «Not implemented»).

| 플랫폼 기능 | 견본과 가는 길 | 맞는 모습 | 근거 | 확인 |
| --- | --- | --- | --- | --- |
| Management 표와 컬럼 필터 | Fleet의 `상태` 열 필터 | 표 위 별도 Select 없이 열 필터로 좁혀지고, 상태는 `관측 없음`·`미착수`·`초안`·`게시됨`·`Drift`·`게시됨 · Drift 미확인`으로 보인다. `동작` 열이 고정된다 | [ADR-0105](../../adr/0105-one-table-filter-model.md), [§12.6](../../contract/layout.md) | 화면 점검(mock) |
| page key와 뒤로 가기 | Fleet → `열기` → 단계 탭 → 뒤로 | 주소에는 `equipment`·`step`·`window`만 남고, 뒤로 가기는 탭 → 설비 → Fleet 순이다 | [§6.4](../../contract/kernel.md) | 화면 점검(mock) |
| 미저장 Mapping 가드 | Mapping에서 alias를 무시(`I`)한 뒤 다른 탭이나 뒤로 | 이동 전에 확인을 묻고, 머무르면 편집이 남는다 | §6.4, [ADR-0115](../../adr/0115-kernel-navigation-guard-for-unsaved-edits.md) | 화면 점검(mock) |
| 게시 조건 | 검증·게시 탭 | Mapping Conflict가 있어도 `게시 검토`는 막히지 않는다. 막힐 때는 이유 한 줄이 버튼 옆에 보인다 | ONBOARDING §6 D9·D10 | 화면 점검(mock) |
| 도면 표기와 충돌 강조 | 검증·게시 탭의 충돌 행 | 두 Component에 점선 링과 점선 관측선이 그려지고 경로가 아니라고 적힌다. 도면에 «개략도 · 실측 아님 · 제조사 도면 아님»이 보인다 | ONBOARDING §6 D11 | 화면 점검(mock) |
| 읽기 전용 | 개발 도구의 역할 전환(viewer) | 메뉴는 열리고 저장·배정·게시·교체·퇴역·시작 버튼이 없다 | menus/AGENTS.md `@ap/menu-topview-studio` | 화면 점검(mock) |
