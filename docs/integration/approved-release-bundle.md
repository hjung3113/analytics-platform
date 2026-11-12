# 승인 릴리스 반입 묶음 — 사외에서 만든 릴리스를 사내로 고정 버전으로 가져오는 형식

상태: **Candidate** — 설계. 묶음은 아직 없다. v0.36.0 몫의 수용 기준은 [#1701](https://github.com/hjung3113/analytics-platform/issues/1701)의 댓글이 소유하고, 이 글은 그 기준을 구현 노드가 따를 수 있게 모양을 적는다. 결정은 [ADR-0143](../adr/0143-release-units-and-compatibility-train.md)(릴리스 단위, 호환 «같은 열차 N, 롤백용 N-1»)과 [ADR-0141](../adr/0141-in-house-assembly-in-separate-repository.md)이 소유한다.

## 묶음 구성

한 릴리스 열차의 묶음은 아래를 한 폴더에 둔다.

- tarball 아홉: SDK 다섯과 Host·어댑터 넷(`@ap/app-host`, `@ap/mock-server`, `@ap/http-adapter`, `@ap/server-conformance`). 형제 `@ap/*`는 정확 버전 peer이므로 일부만 고를 수 없다.
- 시작 키트([시작 키트 안내](../guides/standalone-start-kit.md))와 키트의 lockfile. 키트의 lockfile이 묶음의 lockfile이다.
- `patches/`와 override 목록(소비자가 따로 맞춰야 하는 서드파티 patch·override).
- 서드파티 정확 버전 목록.
- 설치 안내와 설치 검사 스크립트.
- `SHA256SUMS`.

## 설치 검사

묶음 설치 전에 스크립트가 아래를 검사하고 하나라도 어긋나면 설치를 시작하지 않는다. 스크립트는 [`tooling/sdk/sdk-bundle-check.mjs`](../../tooling/sdk/sdk-bundle-check.mjs)이고 Node 내장 모듈만 써서 묶음 안에 그대로 실린다. 묶음 폴더는 키트 폴더 자체다: `vendor/`에 tarball 아홉, `pnpm-lock.yaml`은 이들을 `file:vendor/…`로 풀고, `third-party.json`이 나머지 패키지의 정확 버전 목록, `SHA256SUMS`가 실린 파일을 덮는다.

| 명령 | 하는 일 |
| --- | --- |
| `verify` | 설치 전 1–4. 어긋난 것을 모두 적고 exit 1 |
| `mirror --registry <url>` | 5. 미러에 없는 이름·버전과 무결성 값이 다른 것을 적는다. 설치하지 않는다. 인증이 필요하면 `AP_MIRROR_AUTH`에 Authorization 값 |
| `installed` | 설치 뒤 `node_modules/.pnpm`에 `@ap/*`가 하나씩만 있는지 |
| `third-party --lockfile <path>` | 릴리스 쪽에서 lockfile로 `third-party.json`을 만든다 |

1. 체크섬: `SHA256SUMS`와 파일이 일치한다.
2. `@ap/*` 단일 사본: 같은 패키지가 둘 설치되지 않는다. 설치 전에는 lockfile의 `snapshots`에서 다른 peer 묶음으로 두 번 풀린 `@ap/*`를 찾고, 설치 뒤에는 `installed`로 디스크를 본다.
3. 정확 버전 peer: 아홉이 같은 버전이다.
4. 설치 스크립트와 git·URL 의존이 없다(묶음 tarball 밖의 것). tarball 아홉의 `scripts`·의존 선언과 lockfile의 `resolution`을 본다. 서드파티의 설치 스크립트는 pnpm 11이 `allowBuilds`에 없는 것을 돌리지 않는 것으로 막는다.
5. **미러 대조 모드.** 사내 npm 미러가 모든 패키지를 갖는지 확신할 수 없으므로, 서드파티 정확 버전 목록을 미러에 대조해 없는 패키지·버전을 설치 전에 목록으로 보고한다. 미러 URL은 사내가 넣고 결과는 사내에 남는다. 이 대조는 보고만 하고 설치를 대신하지 않는다.

## 설치 형태 확인 (pnpm 11.1.1, Linux x64)

묶음의 SDK tarball을 `vendor/` 아래에 두고 `file:`로 설치하는 형태를 확인했다. 목적은 lockfile이 다른 폴더·기계로 옮겨져도 `--frozen-lockfile`이 되는지다. URL 기반으로 설치하는 `pnpm sdk:consumer-check`([#806](https://github.com/hjung3113/analytics-platform/issues/806) 검출)는 그대로 둔다. `file:` 설치는 하위 의존의 URL 거부 검사를 가린다.

관찰한 것(`@ap/contracts`와 `@ap/kernel`, 버전 `0.0.0-ci`, 서드파티는 react·react-dom 둘, 임시 폴더):

| 시도 | 결과 |
| --- | --- |
| `package.json`에 `file:./vendor/ap-*.tgz`를 두고 `pnpm install` | lockfile에 `file:vendor/ap-*.tgz` 상대 경로와 tarball의 `sha512` 무결성 값이 적힌다 |
| 그 폴더를 다른 경로로 복사한 뒤 `--frozen-lockfile --offline` | 설치된다(저장소 store가 데워져 있을 때) |
| store가 비어 있는 환경에서 `--offline` | 서드파티 패키지가 없어 `ERR_PNPM_NO_OFFLINE_TARBALL`로 실패한다. 사내 미러나 같은 OS·아키텍처에서 만든 store가 필요하다 |
| `vendor/`의 tarball 끝에 한 바이트를 더함 | `ERR_PNPM_TARBALL_INTEGRITY`로 실패한다 |

아홉 tarball로 다시 확인한 것(macOS arm64, `0.0.0-bundle`, react·react-dom을 더한 임시 프로젝트, 서드파티 267개): `file:` 설치와 lockfile 생성, `verify` 통과, 다른 경로로 복사한 뒤 데워진 store로 `--offline --frozen-lockfile` 설치, `installed` 통과, 공개 npm 레지스트리를 미러 자리에 넣은 `mirror`에서 누락 0.

확인하지 못한 것: 다른 OS·아키텍처, 다른 pnpm 버전, 사내 미러에서의 설치, 빈 store의 linux-x64 컨테이너 설치(키트가 생긴 뒤 CI 작업으로 한다).

## 설치 경로 둘

- **기본: 리눅스 Docker + 사내 npm 미러.** 사내 실행 환경은 리눅스에서 Docker로 돈다([#151](https://github.com/hjung3113/analytics-platform/issues/151) 소유자 답 2026-11-12).
- **미러에 없는 패키지가 있을 때:** 같은 OS·아키텍처의 연결된 기계에서 store를 만들어 반입한다. 서드파티 store를 묶음에 동봉하는 것은 미룬다(아래).

## 공개 CI의 오프라인 설치

CI는 네트워크를 끈 linux-x64 컨테이너에서 묶음 그대로 `--offline --frozen-lockfile` 설치·빌드·실행을 한다. 사내 Docker와 같은 축이다. 이 한계(linux-x64만 시험함)는 설치 안내에 적는다.

## 미루는 것 (구현 안 함)

[ADR-0143](../adr/0143-release-units-and-compatibility-train.md) Deferred 그대로다. 서드파티 store 동봉, 미러 규칙, SBOM·provenance, 서버 이미지 묶음. 이유: 사내 미러의 보유 범위가 불확실하다. 다시 여는 조건: 미러 누락이 실제로 보고될 때. 슬라이스 종료 절차에 이 자산 목록을 더하는 일은 `PROFILE.md` 소유자의 몫이다.
