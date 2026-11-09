# ops/platform-api

코어 서버와 기능 화면의 운영 도구입니다. compose 파일, DB·백업 스크립트, 정적 검사 게이트가 있습니다.

## 서버를 띄우려면

[배포판 실행 안내](docs/release/run-guide.md)를 먼저 읽습니다. 개발, 로컬 스모크, 운영 구성별 순서와 MinIO·최초 Admin이 한 곳에 있습니다. 어디까지 됐는지는 `bash scripts/release/stack-status.sh .env.production`이 알려 줍니다(읽기만 하고 비밀값은 출력하지 않음).

## 더 읽을 것

| 하고 싶은 일 | 문서 |
| --- | --- |
| 이미지·OIDC·edge 규칙 | [oidc-and-images.md](docs/release/oidc-and-images.md) |
| 최초 Admin | [first-admin-bootstrap.md](docs/release/first-admin-bootstrap.md) |
| 백업·복구·업그레이드 | [backup-restore-upgrade.md](docs/release/backup-restore-upgrade.md) |
| 실패한 작업 재처리, 첨부 고아 정리 | [failed-jobs-replay.md](docs/release/failed-jobs-replay.md), [attachment-orphans.md](docs/release/attachment-orphans.md) |
| 정적 검사 게이트 | [scripts/gates/AGENTS.md](scripts/gates/AGENTS.md) |
