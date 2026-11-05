# VOC 등록 권한은 시스템 단위로 정하고, 기본은 열림이며 좁히는 단위는 사람이다

상태: **Decided (2026-11-05)**. ADR-0110(플랫폼 기능 역할·범위)과 ADR-0069(Managed System 범위 권한)를 보충한다. 둘은 그대로다.
- 결정자: 소유자 — 2026-11-05, [#1358](https://github.com/hjung3113/analytics-platform/issues/1358) 계획에 대한 답(Q1·Q2·Q4).

## 배경

`POST /vocs`는 세션과 워크스페이스만 확인했다. 소유자 방향은 「VOC 등록은 그 시스템에 접근할 수 있는 사람만」이다. 서버에는 업무 시스템 진입 권한의 원천이 아직 없다. 공간·메뉴 권한은 클라이언트 레지스트리가 선언하고, 실서버는 커널 권한과 로그 지식·개선 쓰기 권한만 평가한다(ADR-0110 §5). 클라이언트가 보내는 주장은 믿을 수 없다.

## 결정

1. **시스템마다 `core.managed_systems.voc_create_mode`(`open` | `restricted`, 기본 `open`)를 둔다.** `open`은 `voc.create` 거부(deny)가 없으면 누구나, `restricted`는 Admin과 `voc.create` 부여(그 시스템 범위 또는 워크스페이스 전체)를 가진 사람만 등록한다. 거부는 두 모드 모두 Admin을 포함해 이긴다(05-permission-policy 확인 순서).
2. **업무 시스템 연결(`space:<id>`) 시스템도 기본은 `open`이다.** 관리자가 시스템별로 좁힌다. 「그 업무 시스템에 들어갈 수 있는 사람」을 기본으로 바꾸는 일은 업무 시스템 진입 권한이 서버로 들어온 뒤(사내 SSO #150·#603 이후)로 미룬다. [backlog](../../.planning/backlog.md)에 «구현 안 함»으로 적었다.
3. **좁히는 단위는 사람이다.** 기존 직접 부여(`voc.create`, 시스템 범위)를 쓰고 Admin은 항상 통과한다. 시스템별 역할 단계는 두지 않는다.
4. **「플랫폼」 시스템(`external_key='platform'`)은 항상 열려 있다.** 서버가 `restricted`로의 변경을 `validation.failed`(`platform_always_open`)로 거절하고, 저장된 값과 무관하게 열린 것으로 판정한다.
5. **이미 등록된 VOC는 건드리지 않는다.** 모드는 새 등록만 막는다. 읽기·수정·Reporter Reply는 지금 규칙 그대로다.
6. **판정은 한 함수 `canCreateVoc`(permissions 모듈)가 한다.** `POST /vocs`는 시스템 잠금 트랜잭션 안에서 404(없음)·409(보관) 확인 뒤에 부르고, 불가면 403 `permission.denied`다. `GET /vocs/create-targets`는 같은 규칙을 거부·부여 조회 한 쌍으로 모든 살아 있는 시스템에 적용한다. 서버가 최종이고 조회는 제출 전 안내용이다.
7. **모드 변경은 기존 시스템 수정 감사에 실린다**(`changes.voc_create_mode = { from, to }`). `voc.create`는 민감하지 않은 capability로 감사 투영 allowlist에 더한다.

## 대안과 버리는 이유

- **시스템별 역할 단계(User/Developer/Admin 이상):** 역할은 하드코딩 표이고 세 단계뿐이라 «팀 A만» 같은 요구를 표현하지 못한다. 사람 단위 부여가 기존 화면과 감사를 그대로 쓴다.
- **업무 시스템 진입 권한 원천을 이 이슈에서 서버에 새로 만들기:** 그룹 매핑·SSO 입력이 먼저 필요해 범위가 훨씬 커지고, 원천 없이 클라이언트 주장을 믿을 수는 없다. 기본값만 나중에 바꾸면 되므로 지금 만들지 않는다.
- **기본을 `restricted`로 두기:** 기존 시스템의 등록이 갑자기 막히고, 허용할 사람 목록이 비어 있어 Admin만 남는다.

## 결과

- 마이그레이션 한 개: 열 + CHECK + 감사 allowlist 갱신(번호는 병합 때 정한다).
- `GET /managed-systems`의 행과 `PATCH /managed-systems/:id`가 `voc_create_mode`를 싣는다. `POST /vocs`에 403이 새로 생기고 `GET /vocs/create-targets`가 추가된다.
- 화면(제출 전 비활성, 운영 콘솔 설정, #606 신고 버튼의 `denied`)은 다음 노드가 맡는다. 서버는 화면 없이 먼저 쓸 수 있다.
