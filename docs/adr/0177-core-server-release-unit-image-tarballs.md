# 코어 서버 릴리스 단위는 태그마다 이미지 tar 셋과 SHA256SUMS를 공개 Release에 싣는다

상태: **Decided (2026-11-25)** — 형태와 공개 경로. 자산을 실제로 올리는 workflow와 네트워크 없는 기동 검사는 후속 구현이다.
- 결정자: 사용자(소유자) — 2026-11-25, [#2891](https://github.com/hjung3113/analytics-platform/issues/2891) 질문에 «ㅇㅋ 추천대로»(A안). 공개 경로는 같은 날 «공개 릴리즈 해도될듯 실제 쓰거나하기 시작하면 비공개로 돌릴거야 깃러브 프로결재하던지 해서 그외 ci이런것도 문제없게할게 때가되면»으로 공개 GitHub Release에 확정(#2891 코멘트).
- Scope: [#1701](https://github.com/hjung3113/analytics-platform/issues/1701), [#2865](https://github.com/hjung3113/analytics-platform/issues/2865). [ADR-0143](0143-release-units-and-compatibility-train.md)이 미룬 단위 3을 정한다.

## 맥락

[ADR-0143](0143-release-units-and-compatibility-train.md)은 릴리스 단위를 셋으로 정하고 «3. 코어 서버 이미지 + 마이그레이션 묶음»을 미뤘다. 다시 여는 조건은 [#151](https://github.com/hjung3113/analytics-platform/issues/151)의 사내 답이었고, 그 답(2026-11-12)은 «리눅스 Docker + 사내 npm 미러»다.

지금 상태:
- main push CI(`ci.yml` «Backend images»)가 runtime·migrate 이미지를 빌드하지만 자산으로 내지 않는다.
- 웹 이미지는 `ops/platform-api/scripts/release/build-web-image.sh`가 만든다.
- `ops/platform-api/scripts/release/upgrade.sh`는 이미 호스트에 있는(`docker load`한) `platform-release-{backend,migrate,web}:<tag>` 셋을 받아 백업 → 마이그레이션 → 기동을 한다.
- 운영자는 저장소를 받아 직접 빌드한다. 사내 서버는 외부 레지스트리에 닿지 않는다.

## 결정

- **단위 3의 형태:** 릴리스 태그마다 다음을 같은 Release에 싣는다.
  - `platform-release-backend`, `platform-release-migrate`, `platform-release-web` 세 이미지의 `docker save` tar(linux/amd64)
  - 그 tar들의 `SHA256SUMS`
- **마이그레이션은 migrate 이미지 안에 있다.** 별도 SQL 묶음은 내지 않는다. `upgrade.sh`가 이미 migrate 이미지의 journal로 현재 DB와 대조하고 적용한다.
- **같은 열차:** SDK·Host tarball과 같은 버전이다([ADR-0143](0143-release-units-and-compatibility-train.md) «같은 열차 N, 롤백용 N-1»). 이미지 셋은 앱 태그 `v<X.Y.Z>`의 Release에 싣는다(SDK tarball은 `sdk-v<X.Y.Z>`).
- **공개 경로:** 공개 GitHub Release. 이미지 안의 코드는 공개 저장소의 소스와 같고, 사내 값(주소·비밀)은 이미지가 아니라 운영자의 env 파일에 있다.
- **검사:** main push(또는 수동 실행) CI가 tar를 네트워크 없이 `docker load`하고 기동해 `/health/ready` 200을 확인한다. PR CI에는 넣지 않는다(루트 AGENTS.md §Verification).
- **한 릴리스의 마이그레이션은 더하기만 한다.** 테이블·열을 지우거나 이름·형을 바꾸거나 `NOT NULL`을 거는 단계는 다음 릴리스로 미룬다. 이유: 롤백(N-1)은 DB를 N 스키마에 둔 채 N-1 백엔드를 돌린다. 결정자: 팀장 — 2026-11-25(사내 운영 규칙이라 소유자 질문 아님). main push 검사는 [#2961](https://github.com/hjung3113/analytics-platform/issues/2961).

## Considered Options

- **(A, 채택) 이미지 tar 셋 + SHA256SUMS를 같은 열차로.** 사내 서버는 레지스트리 없이 `docker load` → `upgrade.sh`로 올린다. 이미 있는 빌드와 업그레이드 경로를 그대로 쓴다.
- **(B) 소스 스냅샷만 내고 사내에서 빌드.** 사내에 빌드 도구와 npm 미러가 필요하고, 공개 쪽 CI가 확인한 이미지와 사내에서 돈 이미지가 같다는 보장이 없다.
- **(C) 현행(자산 없음).** 운영자가 저장소에서 직접 빌드한다. 사내 반입 경로가 정해지지 않은 채로 남는다.

## Deferred (구현 안 함)

- 이미지 서명·provenance. 이유: 무결성은 지금 `SHA256SUMS`로 SDK와 같은 수준이고, 서명 키의 소유와 보관이 정해지지 않았다. 다시 여는 조건: 사내 반입 절차가 서명을 요구할 때.
- linux/arm64 등 다른 아키텍처. 이유: #151 답의 대상은 리눅스 Docker 서버 하나다. 다시 여는 조건: 다른 아키텍처의 운영 호스트가 생길 때.
- 이미지 레지스트리 게시(GHCR 등). 이유: 사내 서버는 외부 레지스트리에 닿지 않아 tar가 반입 단위다. 다시 여는 조건: 사내 레지스트리 미러가 정해질 때([#232](https://github.com/hjung3113/analytics-platform/issues/232)).
- 비공개 전달 경로. 이유: 소유자가 공개 Release로 정했다(위 결정자 줄). 다시 여는 조건: 실사용 시작 때 저장소 비공개 전환 — 소유자(유료 요금제 등, 그때 CI 영향도 소유자가 정리). 그때 Release 자산의 공개 범위도 다시 본다.

## 결과

- [ADR-0143](0143-release-units-and-compatibility-train.md) «Deferred»의 단위 3 줄이 이 ADR을 가리킨다.
- 구현은 후속 이슈다: [#2913](https://github.com/hjung3113/analytics-platform/issues/2913) 이미지 셋과 `SHA256SUMS`를 만드는 `pack-images.sh`(태그 단계에서 팀장이 올린다), [#2914](https://github.com/hjung3113/analytics-platform/issues/2914) main push·수동 실행의 네트워크 없는 기동 검사.
- 기동 검사는 `upgrade.sh`가 설치된 stack을 전제로 하므로 첫 설치 순서로 `/health/ready` 200까지 본다(#2914 결정). 위 «검사» 줄의 `upgrade.sh`는 운영자의 반입 경로다.
