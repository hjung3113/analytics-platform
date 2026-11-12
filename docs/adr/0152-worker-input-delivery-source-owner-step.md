# ADR-0152 — 작업자 입력 전달은 공급자 중립인 Source 소유자의 별도 단계로 둔다

상태: **Candidate**. 관련 #1807. 소유자 미확정이며 공급자·API 경로·구현 착수를 승인하지 않는다.

## 배경

claim의 `fileRef`는 원본 바이트를 전달하지 않는다. 플랫폼 서버와 검증 작업자의 파일 시스템이 다르면 로컬 경로로 연결할 수 없다. 공개 참조 작업자는 샘플 메타데이터로 합성 결과를 만들며 원본 파일을 읽지 않는다.

## 결정 후보와 이유

Source 소유자가 작업자의 유효 claim을 확인하고 단기 읽기 수단을 해석하는 별도 단계를 제공한다. 원본 권위·접근 철회·바이트 무결성을 전송 공급자와 분리하기 위해서다. 상세 계약과 통합된 **Open decisions**는 [log-lifecycle API의 작업자 입력 전달](../architecture/platform-api/api/log-lifecycle.md#작업자-입력-전달-1807)을 따른다.

기존 Source 다운로드 게이트웨이 재사용을 우선 추천한다. 작업자가 접근할 수 없고 복사 보관이 필요하다는 실사 결과가 있을 때만 임시 객체 저장소를 검토한다. 어느 공급자도 정본으로 고르지 않는다.

[ADR-0117](0117-validation-request-queue-claim-lease-heartbeat.md)의 claim·lease·heartbeat·결과 멱등성·샘플 불변과 [ADR-0119](0119-log-explorer-source-read-port-and-evidence-refs.md)의 원본 권위·읽기 계약은 변경하지 않는다. 입력 전달과 [출력 진단 리포트](../design/features/log-lifecycle/diagnostic-report-parity.md)는 목적·보관 시계가 다른 경로다.

## 대안과 기각 이유 (Candidate)

| 대안 | 기각 추천 이유 |
| --- | --- |
| `SourceReadPort`를 그대로 사용 | 제한된 텍스트·시퀀스 탐색이며 전체 파일 바이트·분리 작업자 전달 계약이 아니다 |
| `uploadFile` / [ADR-0140](0140-generic-file-upload-port.md)를 그대로 사용 | 사람 세션 전용 32 MiB·미연결 24시간 정리여서 입력 전달 수명과 맞지 않는다 |
| 로컬 경로나 서명 URL을 `fileRef`로 저장 | 배포 환경·만료에 묶여 안정 참조와 비밀 경계를 깨뜨린다 |
| 원본을 플랫폼 DB로 복사 | 원본 권위·보관·접근 철회 책임을 이중화하고 ADR-0119와 충돌한다 |
| 새 버킷·파일 포트를 기본으로 추가 | 기존 Source/StorageBackend 재사용 가능성을 확인하기 전에 저장 책임을 늘린다 |

이 대안 판단도 Candidate이며 소유자 결정으로 간주하지 않는다.
