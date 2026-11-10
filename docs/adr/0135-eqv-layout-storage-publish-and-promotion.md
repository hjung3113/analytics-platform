# ADR-0135 — 서버 `eqv` 모듈: 게시 순서·가져오기 검증·Template 승격의 저장 방식

- 상태: Decided (2026-11-10, 코디네이터(사용자 위임), 되돌릴 수 있음). 구현은 [#1645](https://github.com/hjung3113/analytics-platform/issues/1645)(#1607 5단계).
- 결정자: 코디네이터(사용자 위임). 사용자 방향은 [ADR-0132](0132-eqv-merges-into-platform.md)(EV 흡수)와 #1607의 "추천대로" 결정이다.
- 이어받는 결정: [ADR-0132](0132-eqv-merges-into-platform.md)가 "저장 방식은 새 ADR"로 남긴 EV ADR-0007(게시 순서), 0010(가져오기 검증), 0015(Template 승격)의 **규칙은 그대로**, 저장만 바꾼다.

## 결정

1. **저장.** 스키마 `eqv`, 표 4개(전부 `workspace_id` 범위): `layout_draft`(Layout id당 한 행, `version` 정수), `layout_revision`(불변), `template`(생성 전용), `equipment`(읽기 전용, 쓰기는 8단계). `layout_draft`·`layout_revision`·`template`은 `id uuid`를 가진다(`core.audit_log.subject_id`가 uuid). 자연 키는 `(workspace_id, layout_id)`, `(workspace_id, layout_id, revision)`, `(workspace_id, template_id)`다. 초안의 uuid는 저장해도 바뀌지 않는다.
2. **게시 순서(EV ADR-0007 대체 구현).** EV의 "마지막 파일이 commit point"는 한 DB 트랜잭션이 대신한다. `publishRevision`은 초안 → 불변 Revision 한 행과 감사 행을 같은 트랜잭션에 쓴다. `platform_app`은 Revision·Template에 UPDATE·DELETE 권한이 없다(불변은 권한 벽). 같은 해시를 다시 게시하면 `ok`와 기존 Revision을 돌려주고 감사 행을 더 쓰지 않는다. 초안 저장은 `concurrency: 'version'`(마지막 쓰기 승리가 없어진다, EV#60).
3. **가져오기 검증(EV ADR-0010 대체 구현).** 서버의 `@eqv/core` `validateLayout`이 최종 판정이다. 순환 `parentId`(`hierarchy-cycle`, EV#170)는 저장 전에 거부한다. 문서 `id`는 `layout_id`와 같아야 하고 `kind`는 `equipment-layout`이어야 한다. 해시와 저장은 검증을 통과한 `result.layout`만 쓴다(입력 원본이 아니다).
4. **Template 승격(EV ADR-0015 대체 구현).** Template은 게시된 Layout Revision에서만 나온다(`(workspace_id, promoted_from_layout_id, promoted_from_revision)`가 `layout_revision`의 복합 FK). 승격은 `@eqv/core` `promoteLayout`, 결과를 다시 검증한다. 번들 Template id(`BUNDLED_TEMPLATE_IDS`)는 거부한다(겹치는 행은 지울 수 없다). `promoteLayout`의 `RangeError`는 `invalid` 답이다. 승격은 게시 행위이므로 별도 Template capability 없이 `eqv.layout.publish`다.
5. **«승인».** 이슈의 «승인»은 `eqv.layout.publish` capability 검사이며 별도 승인 흐름은 없다. capability는 `eqv.view`, `eqv.layout.edit`, `eqv.layout.publish`만 더한다(`eqv.mapping.publish`·`eqv.rules.edit`·`eqv.dictionary.global_edit`·`eqv.window.import`는 해당 엔드포인트가 생길 때 더한다). 메뉴 권한은 `eqv:view`(이름 유지)와 `eqv-studio:layout-edit`·`eqv-studio:layout-publish`다. `eqv:*`가 아닌 이유: `eqv` 이름 공간은 모듈 것이고, 6단계가 앱에서 이 권한을 선언할 때 Kernel 레지스트리가 이름 충돌을 거부한다. **개정(#1654, 결정자: 코디네이터):** 메뉴 권한에 `eqv-studio:view`를 더한다. Studio 레이아웃 메뉴는 모듈 메뉴가 아니라 플랫폼 메뉴(`menus/tools/topview-studio`)인데, 레지스트리는 비모듈 메뉴가 선언하지 않은 권한을 쓰거나 `eqv:*` 권한을 선언하는 것을 거부하므로 `eqv:view`를 진입 권한으로 쓸 수 없다. `eqv-studio:view`는 `eqv:view`와 같은 규칙(`eqv-view`)과 같은 capability(`eqv.view`)로 부트스트랩에 함께 나타나고 함께 사라진다. 읽기 엔드포인트의 권한은 그대로 `eqv:view`다.
6. **모델 식별자.** `equipment.model_id`는 Hub 카탈로그 id(ADR-0132 결정 7)이며 FK가 없다. 쓰기(8단계)가 `knowledgeLookup`으로 확인한다. 이 이슈에는 쓰기 액션이 없다.
7. **경계.** 서버는 `@eqv/core`만 쓴다(React·`@ap/*` 없음). `@eqv/core`의 zod 4는 서버 공개 타입에 새지 않는다: 검증 이슈는 `{ path, code }` 필드 오류로 바꿔 모듈 안에서 끝낸다. 실행 시 `@eqv/core`는 `@ap/feature-shared`와 같이 이미지 빌드에서 `dist`로 내보내 배포본의 `exports`를 `dist`로 바꾼다. ESLint 서버 프리셋만 `@eqv/core`를 허용한다.
8. **Scope.** 실서버의 Site Scope는 #1087 전까지 capability로만 막는다(`requiresScope: false`, 사이트 묶인 Context 없음).
9. **전역 감사 투영에서 eqv 제외.** `core.audit_log`의 eqv 행(`eqv_layout`, `eqv_layout_revision`, `eqv_template`)은 그대로 쌓이지만, 뷰어 인자가 없는 전역 감사 투영(`platform_audit_events`, 마이그레이션 0121)은 `eqv_` 주체를 내보내지 않는다. `workspace.admin`만 가진 콘솔 사용자는 `eqv.view`가 없어, 투영이 주체 id·시각·총계를 내보내면 eqv 문서의 존재를 알게 된다. `knowledge_` 선례를 따르며(결정자: 코디네이터), 세 capability(`eqv.view`·`eqv.layout.edit`·`eqv.layout.publish`)의 권한 부여 기록은 eqv 문서가 아니므로 비민감 capability 목록에 둔다. 권한을 따지는 eqv 감사 보기는 만들지 않았다(모듈 `AGENTS.md`에 «구현 안 함»으로 적었다).
10. **승격은 잠금 대기 뒤 다시 권한을 본다.** `promoteTemplate`는 Template별 advisory lock을 기다린 뒤, 읽기 전에 같은 트랜잭션에서 `eqv.layout.publish`를 다시 판정한다. 잃었으면 디스패처가 `forbidden`으로 답하고 쓰기·감사·재생 기록이 없다.

## 결과

- 흡수 점검표의 EV#177·EV#170·EV#105 행이 이 결정으로 갱신된다. Sample Window 서버 캐시·저장(EV#105)은 가져오기(8단계)와 함께, 쓰지 않는 capability 이름 4개와 Bindings·Mapping 표는 8·9단계에서 한다(점검표에 «구현 안 함»으로 적었다).
- 되돌리기: 표와 선언만 더했으므로 이 PR을 되돌리면 이전 동작으로 돌아간다.
