# 릴리스 단위는 셋(SDK, Host·어댑터, 코어 서버 묶음)이고, 호환은 «같은 열차 N, 롤백용 N-1»만 지원한다

상태: **Decided (2026-11-11)** — 단위와 정책. v0.36.0이 싣는 것은 앞의 둘이다.
- 결정자: 사용자(소유자) — 2026-11-11, [#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 보강 §3의 소유자 결정 13행 전부에 "추천대로". 이 ADR은 그중 3번(릴리스 단위)과 11번(호환성 정책)이다.
- Scope: [#1701](https://github.com/hjung3113/analytics-platform/issues/1701), [#1702](https://github.com/hjung3113/analytics-platform/issues/1702).

## 맥락

지금 릴리스되는 것은 SDK 다섯 패키지(`@ap/contracts`, `@ap/kernel`, `@ap/ui`, `@ap/components`, `@ap/shell`)의 tarball과 JSON Schema 묶음, `SHA256SUMS`뿐이다([ADR-0056](0056-sdk-release-github-release-tarballs.md), `tooling/sdk/sdk-exports.mjs`). `@ap/http-adapter`, `@ap/mock-server`, `@ap/server-conformance`, `@ap/feature-bridge`, 모든 메뉴, `apps/platform-web`, `apps/platform-api`는 비공개 workspace 패키지이고 릴리스 자산이 없다. 앱 태그의 자산은 0개이며 웹 번들과 서버 이미지는 운영자가 저장소에서 직접 빌드한다. 사내 조립([ADR-0141](0141-in-house-assembly-in-separate-repository.md))이 받을 대상이 아직 정의되지 않았다.

## 결정

- **릴리스 단위는 셋이다.**
  1. **SDK tarball**: 현행([ADR-0056](0056-sdk-release-github-release-tarballs.md)) 그대로.
  2. **Host·어댑터 tarball**: 신규. Host 조립 함수([Host 조립 계약](../design/host-entry-contract.md)), `@ap/mock-server`, `@ap/http-adapter`, `@ap/server-conformance`. 무결성은 지금의 `SHA256SUMS` 방식을 쓴다.
  3. **코어 서버 이미지 + 마이그레이션 묶음**: 신규. v0.36.0에는 넣지 않는다.
- **v0.36.0은 1과 2를 싣는다.**
- **Host·어댑터 tarball은 SDK 다섯 패키지와 같은 태그, 같은 SemVer로 낸다**(«같은 열차»; [ADR-0044](0044-sdk-source-in-platform-repo-released-separately.md)의 고정 그룹을 넓힌다). 별도 SemVer가 필요해지면 다시 정한다. 되돌릴 수 있다.
- **호환 정책은 «같은 릴리스 열차 N, 롤백용 N-1»만 지원한다.** Host × SDK × 확장 × 서버의 호환 매트릭스와 버전 협상은 만들지 않는다. 지금도 형제 패키지는 정확 버전 peer다([ADR-0056](0056-sdk-release-github-release-tarballs.md) 보충).

## Considered Options

- **(A, 채택) 셋으로 나누고 v0.36.0은 둘.** 사내 조립 시험에 필요한 것만 먼저 낸다.
- **(B) 모두 한 묶음.** 서버 이미지와 마이그레이션이 준비되지 않아 v0.36.0을 막는다.
- **(C) 호환 매트릭스와 협상.** 지원 조합이 늘고 시험 비용이 곱해진다. 소유자가 «N, N-1만»으로 정했다.

## Deferred (구현 안 함)

- 코어 서버 이미지 + 마이그레이션 묶음의 릴리스 자산, SBOM, provenance, 서명, 오프라인 의존 묶음, 사내 미러 규칙. 이유: 사내 패키지 레지스트리·대상 OS·아키텍처는 [#151](https://github.com/hjung3113/analytics-platform/issues/151)의 사내 답이 입력이다. 다시 여는 조건: #151 답 도착 또는 코어 서버 묶음 노드 착수([#1701](https://github.com/hjung3113/analytics-platform/issues/1701)).
- 사내 조립이 `platform/*` 기능 패키지를 그대로 쓰는지와 그 릴리스 단위. 이유: v0.36.0 범위 밖. 다시 여는 조건: 저장소 밖 조립 시험 뒤 첫 사내 조립이 기능 메뉴를 요구할 때.
- 릴리스 workflow 자동화(태그·Release 올리기). 이유: 지금은 사람이 한다. 다시 여는 조건: `ci.yml`을 고치는 열린 PR이 정리된 뒤 [#1701](https://github.com/hjung3113/analytics-platform/issues/1701).

## 결과

- v0.36.0 릴리스 대상에 Host·어댑터 묶음이 더해진다(구현은 후속 노드).
- 코어 서버 쪽 사내 확장 조립은 [#1729](https://github.com/hjung3113/analytics-platform/issues/1729)가 방향만 정한다(코어 서버 프로세스에 사내 코드를 싣지 않고 선언만 싣는 쪽이 추천).
