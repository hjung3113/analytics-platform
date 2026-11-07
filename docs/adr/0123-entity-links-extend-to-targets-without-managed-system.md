# Entity Link는 Managed System이 없는 대상까지 넓히고, 그 끝은 소유 모듈의 읽기 권한으로 판단한다

상태: **Decided (2026-11-08, 소유자 답 — option B).** 결정자: 소유자(2026-11-08, [#1466](https://github.com/hjung3113/analytics-platform/issues/1466)). [ADR-0064](../architecture/platform-api/06-entity-linking-contract.md)의 Entity Link 규칙(양 끝이 같은 Managed System)을 Managed System이 없는 끝에 한해 개정한다. 설계 [`log-lifecycle` D6](../design/features/log-lifecycle/README.md).

## 배경

소유자 결정 D6: 수동 검증 첨부는 «첨부 + entity link»다. 지금 `core.entity_links.managed_system_id`는 NOT NULL이고, `assertLinkManagedSystemCompatibility`가 양 끝이 같은 Managed System으로 풀릴 것을 요구한다. 개발 건·Round·수동 검증 첨부는 Managed System이 없다(모델 단위 지식과 로그 수명주기 영역). 그래서 이 끝들은 지금의 Entity Link에 올 수 없다.

## 결정

1. **Managed System이 있는 끝은 규칙이 그대로다.** VOC·Finding·VOC Cluster·Task Request·Task의 기존 13개 tuple은 `managed_system_id`가 NOT NULL이고, 양 끝이 같은 Managed System이어야 한다(`assertLinkManagedSystemCompatibility`). 동작·오류 코드·상태 코드는 바뀌지 않는다. Survey 응답 tuple 예외(ADR-0064)도 그대로다.
2. **Managed System이 없는 끝(개발 건·Round·Round 밑 수동 검증 첨부)은 소유 모듈의 읽기 권한으로 판단한다.** 링크 한 건을 만들 때 두 끝 모두의 소유 모듈 provider가 `canRead`를 판단하고, 둘 다 읽을 수 있어야 한다. 한 끝이라도 못 읽거나 provider가 없으면 거절한다(기본 거부).
3. **Managed System 없는 tuple은 계약에 등록된 쌍만 허용한다.** 등록 쌍은 `noManagedSystemEntityLinkPairs`(`packages/feature-shared/src/entity-links.ts`)이고, 지금은 `manual_validation_attachment → validation_round (evidence_of)` 하나다. 한 끝만 Managed System이 있는 tuple은 등록하지 않으므로, 그런 링크(예: VOC ↔ Round)는 «tuple 미등록»으로 거절된다. 개발 건 끝(`log_project`)은 이 규칙이 허용하는 부류이지만 쓰는 쌍이 아직 없어 지금은 entity type을 등록하지 않는다.
4. **DB.** `managed_system_id`를 NULL 허용으로 바꾸고 CHECK `entity_links_managed_system_check`로 묶는다: 등록된 Managed System 없는 tuple이면 NULL이어야 하고, 그 밖의 모든 tuple은 NOT NULL이어야 한다. `entity_links_tuple_check`에 새 쌍을 더한다. 기존 행은 그대로이고 마이그레이션은 더하기뿐이다.
5. **쓰기는 명령 전용이다.** 새 tuple은 `POST /entity-links`·목록·요약·workspace 인벤토리에 나오지 않는다(Survey 응답 tuple과 같은 방식). 만드는 길은 소유 모듈 명령 하나(`roundEvidenceAttach`)이고, 첨부 연결(`linkAttachments`)·링크 행·감사(`entity_link.created`)가 같은 트랜잭션이라 링크 쓰기가 실패하면 첨부 연결도 되돌린다.
6. **보안 경계.** 링크가 호출자가 읽을 수 없는 끝의 존재를 드러내지 않는다. 읽기는 두 끝의 읽기 권한이 모두 필요하다(Round 읽기 = `platform:view` + 같은 Workspace, 첨부 읽기 = 그 부모의 reader). 다른 Workspace의 Round·첨부는 조회 단계에서 없는 것으로 취급한다. Gate가 증거 스냅샷에 쓰는 읽기 포트는 Round와 같은 가시성만 돌려준다.

## 대안과 버리는 이유

- **A. 링크 대신 첨부의 부모 포인터(`parent_kind`/`parent_id`)가 링크를 대신한다:** 공통 Entity Link 기능(감사·가시성·분리)을 쓰지 못하고, 이후 Round·개발 건 관계가 늘 때마다 전용 포인터가 생긴다. 소유자 기각.
- **C. 개발 건에 Managed System을 부여한다:** 개발 건은 모델 단위이지 시스템 단위가 아니어서 의미 없는 값을 채워야 하고, 모든 읽기 권한이 Managed System 기준으로 바뀐다. 소유자 기각.
- **센티널 Managed System 행(「없음」용 가짜 시스템):** 같은 Managed System 규칙을 그대로 쓰지만, Managed System 목록·권한 범위·집계에 가짜 행이 섞이고 `finding.read` 같은 시스템 범위 권한이 그 행에 적용될 수 있어 읽기 판단이 흐려진다. 기각.
- **컬럼을 그냥 NULL 허용으로만 바꾼다(제약 없음):** 기존 쌍에 NULL이 섞여 같은 Managed System 규칙이 DB에서 무너진다. 등록 tuple에 묶은 CHECK가 있어야 «NULL은 등록된 쌍만»이 DB에서 보장된다.

## 결과

- 계약 06, Entity Link 문서, log-lifecycle API 문서, 모듈 AGENTS.md, 설계 README D6·§3을 이 결정에 맞춘다. 같은 변경에 마이그레이션·provider·읽기 포트가 들어간다.
- 새 entity type `validation_round`(log-lifecycle 소유)와 `manual_validation_attachment`(attachments 소유)를 등록한다. 두 provider 모두 부모의 읽기 규칙만 쓰고 다른 모듈 테이블을 읽지 않는다.
- Gate([#1446](https://github.com/hjung3113/analytics-platform/issues/1446))는 log-lifecycle 배럴의 읽기 포트로 Round의 수동 검증 첨부 링크를 읽는다.
- 시험: 기존 13개 tuple의 NULL 거절·혼합(MS 끝 + MS 없는 끝) 거절 회귀, 새 tuple의 저장·방향·감사, 다른 Workspace·한 끝만 읽을 수 있는 호출자·provider 없음 거절, 첨부 롤백, 일반 생성·목록 경로에서의 비노출, Gate 포트 가시성.

## 하지 않은 것

- 개발 건 끝의 entity type·provider(쓰는 쌍이 생길 때 같은 규칙으로 등록). 재개 조건: 개발 건을 한 끝으로 하는 링크 요구가 이슈로 올라올 때.
- 일반 `POST /entity-links`·목록·인벤토리에서의 새 tuple 노출. 재개 조건: 화면([#1447](https://github.com/hjung3113/analytics-platform/issues/1447))이 일반 목록에서 볼 필요를 보일 때 별도 결정.
- 링크 분리(detach) 화면과 분리 감사 변형. 수동 검증 첨부는 한번 붙이면 분리하지 않는다.
- Gate 판정 로직([#1446](https://github.com/hjung3113/analytics-platform/issues/1446)).
