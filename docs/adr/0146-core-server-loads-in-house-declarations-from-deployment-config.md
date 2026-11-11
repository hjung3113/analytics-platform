# 코어 서버는 사내 확장을 코드가 아니라 선언으로 싣는다: 배포 설정의 선언 묶음과 권한 규칙 표

상태: **Decided (2026-11-12)** — 방향. 설정 파일의 정확한 모양과 읽는 코드는 구현 노드가 정한다(v0.37.0).
- 결정자: 사용자(소유자) — 2026-11-12 [#1729](https://github.com/hjung3113/analytics-platform/issues/1729) 질문 1 «OK»(실데이터 시험은 공개 코어 서버가 유일한 입구이고, 사내 데이터 핸들러는 전달기 뒤의 사내 데이터 서버에 둔다). 권한 부여 경로는 2026-11-11 [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 결정 4 «추천대로»(서버 설정 표 P5-b).
- Scope: [#1729](https://github.com/hjung3113/analytics-platform/issues/1729). 관련: [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md), [ADR-0143](0143-release-units-and-compatibility-train.md), [SDK 외부 확장 설계](../design/sdk-external-extension.md) §5(P5).
- 구현 없음. 이 ADR은 결정만 남긴다.

## 맥락

저장소 밖 메뉴([ADR-0142](0142-out-of-repo-menu-package-and-host-module-split.md))를 mock이 아니라 실서버에서 쓰려면 코어 서버가 그 메뉴의 엔드포인트와 권한을 알아야 한다. 지금은 다음과 같다.

- 코어 서버의 모듈 목록은 코드에 적혀 있고, 운영 진입점(`apps/platform-api/src/index.ts`)은 `buildServer`를 고정된 옵션으로 부른다. `buildServer`에는 `menuDispatch` 옵션이 있다(`apps/platform-api/src/server.ts`).
- 모듈은 `MenuDispatchContribution`(엔드포인트·동작·메뉴 권한 선언)을 내고, 등록 검증(`apps/platform-api/src/modules/menu-dispatch/registry.ts`)이 중복 id 등을 거부하면 `buildServer`가 멈춘다. 기여 타입은 라우트를 받지 않는다.
- 메뉴 권한 선언은 `{ permission, capability }` 한 행이다(`MenuPermissionDeclaration`). 권한은 [#1667](https://github.com/hjung3113/analytics-platform/issues/1667)로 모듈 선언이 되었고 `platform-port/permissions.ts`의 고정 표에는 커널 권한만 남았다. 서버마다 선언으로 만든 해석기를 쓴다(`createPlatformPermissionResolver`).
- 사내 코드가 코어 프로세스에 들어가면 [ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) 결정 1·2(Fastify가 유일한 입구, 분석 데이터는 내부 데이터 서버)와 어긋난다.

## 결정

1. **사내 서버 코드를 코어 서버 프로세스에 넣지 않는다.** 코어 서버에는 선언만 싣는다. 사내 데이터 핸들러는 코어 서버 전달기 뒤의 사내 데이터 서버에 둔다([ADR-0148](0148-minimal-forwarder-and-identity-token.md)).
2. **선언은 배포 설정으로 읽는다.** 엔드포인트·동작 선언, 소유자 표(어느 상류가 소유하는가), 메뉴 권한 행을 한 묶음의 검증된 데이터 파일로 두고, 기동 때 읽어 기존 `menuDispatch` 옵션과 같은 등록 검증을 통과시킨다. 공개 서버 파일을 고치지 않는다. 설정에는 코드 실행도 원격 로딩도 넣지 않는다([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) §2).
3. **권한 규칙 표(P5-b).** 메뉴 권한은 `permission → capability` 행으로 같은 설정에 둔다. 권한 선언은 부여가 아니다. capability를 누구에게 주는지는 지금의 부여 체계([ADR-0068](0068-permission-scope-and-business-system-link.md))가 하나로 정하고, 판정은 코어 서버 한 곳이 한다. capability를 가진 사람이 없는 메뉴 권한은 아무에게도 열리지 않는다.
4. **기동 검증은 닫힌 쪽으로 실패한다.** 선언에 없는 엔드포인트 id, 중복 id, 소유자 표에 빠진 엔드포인트, 선언에 없는 권한 사용은 기동 실패다. 기존 등록 검증을 약화하지 않는다.
5. **사내 스키마는 코어의 마이그레이션 번호 줄에 끼지 않는다.** 사내 데이터 서버가 자기 스키마를 소유한다([ADR-0095](0095-dual-backend-fastify-core-fastapi-analytics.md) 결정 3). 코어 서버에 사내 표가 필요해지면 그때 별도 번호 줄을 정한다.
6. **공개 시험은 합성 선언만 쓴다.** 실제 사내 엔드포인트·권한 이름·주소는 공개 이슈·fixture에 넣지 않는다.

## Considered Options

- **(A, 채택) 선언 데이터를 설정으로 싣는다.** 공개 서버 코드는 그대로이고 등록 검증이 이미 있다.
- **(B) 사내 모듈을 코어 서버 프로세스에 코드로 싣는다.** 사내 코드가 공개 서버 빌드에 섞이고 ADR-0095의 입구·분담과 어긋난다.
- **(C) 공개 서버를 사내에서 포크한다.** [ADR-0141](0141-in-house-assembly-in-separate-repository.md)이 기각한 포크와 같은 문제(업그레이드마다 충돌)가 서버에서 반복된다.

## Deferred (구현 안 함)

- 설정 파일 형식, 읽는 코드, 소유자 표(`server-routing.json`)와의 통합. 이유: 전달기 구현([ADR-0148](0148-minimal-forwarder-and-identity-token.md))과 함께 정한다. 다시 여는 조건: v0.37.0 서버 조립 노드 착수.
- 선언 버전 확인(`X-Platform-Declarations`, [http-adapter 계약](../integration/http-adapter-contract.md)). 선언 전체의 해시 하나로 웹과 서버를 맞추면 사내 선언이 더해질 때마다 불일치가 난다. 이유: 아직 켜져 있지 않다. 다시 여는 조건: 켜기 전에 엔드포인트별 비교로 할지 정한다.
- 코어 서버 이미지·마이그레이션 묶음의 릴리스 자산. 이유: [ADR-0143](0143-release-units-and-compatibility-train.md) Deferred. v0.37.0은 승인 스냅샷에서 `ops/platform-api/scripts/release/`로 직접 빌드한다.

## 결과

- 코어 서버를 고치지 않고 사내 역할 엔드포인트를 싣는 시험(합성 선언, 합성 상류)이 v0.37.0 수용 기준이 된다([#1729](https://github.com/hjung3113/analytics-platform/issues/1729)).
- 이 ADR 전까지 저장소 밖 메뉴의 실서버 파일럿은 «실서버 통과»로 세지 않고 mock 통과로만 센다([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 결정 4).
