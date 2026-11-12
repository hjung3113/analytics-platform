# 배포판 실행 안내

compose 파일별로 무엇을 어떤 순서로 띄우는지 한 곳에 모은 글입니다. 규칙과 이유는 [oidc-and-images.md](oidc-and-images.md)와 compose 머리 주석이 원본이고, 여기는 순서와 명령을 알려 줍니다. 모든 명령은 `ops/platform-api`에서 **Bash**로 실행합니다. zsh에서는 아래 `$P`가 한 단어로 읽혀 `no such file or directory`가 납니다. 먼저 `bash`를 실행하세요.

## 어떤 구성을 쓰나

| 하고 싶은 일 | compose 파일 | 시작 명령 |
| --- | --- | --- |
| 내 컴퓨터에서 서버를 개발한다 | `docker-compose.dev.yml` | 아래 「개발」 |
| 이미지가 제대로 도는지 로컬에서 한 번 확인한다 (가짜 로그인 서버 포함, 배포 금지) | `docker-compose.release.yml` | `bash scripts/release/image-smoke.sh`, 지울 때는 `--down` |
| 사내에 배포한다 | `docker-compose.production.yml` | 아래 「운영」 |

## 운영 (production)

한 번에 `up -d`로 끝나지 않습니다. 새 볼륨은 아래 순서를 한 번 거칩니다. 이미 도는 설치를 올릴 때는 [backup-restore-upgrade.md](backup-restore-upgrade.md)를 봅니다.

먼저 변수를 정합니다. 같은 Bash 창에서 이어서 씁니다.

```sh
PROJECT=platform-api
P="docker compose -p $PROJECT --env-file .env.production -f docker-compose.production.yml"
```

현재 어디까지 됐는지 모르겠으면 언제든 상태를 봅니다. 읽기만 하고 아무것도 바꾸거나 쓰지 않으며 비밀값은 출력하지 않습니다. 빠진 단계와 그 명령을 알려 줍니다.

```sh
bash scripts/release/stack-status.sh .env.production
```

| 순서 | 명령 | 하는 일 |
| --- | --- | --- |
| 1 | `cp .env.production.example .env.production`, `CHANGE_ME`를 모두 바꾸고 `chmod 0600 .env.production` | 설정 파일 |
| 2 | `bash scripts/release/production-preflight.sh .env.production` | 비밀값·주소 모양 검사. 통과해야 다음으로 갑니다 |
| 3 | `bash scripts/release/build-web-image.sh` | 웹 이미지(`edge`가 씀)를 만듭니다. 안 하면 `up`이 image not found로 멈춥니다 |
| 4 | `$P run --rm set-role-passwords` | DB 로그인 비밀번호를 적용합니다 |
| 5 | `$P run --rm cutover` | 새 볼륨을 한 번 전환합니다. 반복해도 안전합니다 |
| 6 | `$P up -d` | 마이그레이션 → 버킷 준비 → backend → edge 순으로 뜹니다 |
| 7 | `$P run --rm bootstrap` | Workspace와 `system` 계정을 만듭니다 |
| 8 | `$P restart backend` | 플랫폼·업무 시스템 등록을 다시 합니다. bootstrap 전에 뜬 backend는 이 등록을 건너뜁니다 |
| 9 | 앞으로 Admin이 될 사람이 플랫폼 주소로 한 번 로그인 | 계정이 `user`로 생깁니다 |
| 10 | `$P run --rm set-actor-role --external-id <IdP sub> --role admin --reason "first admin"` | 최초 Admin을 부여합니다. 자세한 것은 [first-admin-bootstrap.md](first-admin-bootstrap.md) |

### `up -d`로 뜨는 것과 따로 돌리는 것

| 서비스 | 어떻게 뜨나 | 하는 일 |
| --- | --- | --- |
| `postgres` | `up -d` | 데이터베이스 |
| `migrate` | `up -d`가 자동으로 한 번 돌림 | 스키마 적용. 끝나야 backend가 뜹니다 |
| `minio` | `up -d` | 첨부 파일 저장소 |
| `minio-bootstrap` | `up -d`가 자동으로 한 번 돌림 | 버킷이 없으면 만듭니다. 끝나야 backend가 뜹니다 |
| `backend` | `up -d` | API |
| `edge` | `up -d` | 웹과 `/api`·`/auth`를 한 주소로 내보내는 nginx. 이 서비스만 바깥에 열립니다 |
| `set-role-passwords` | 프로파일 `roles`, `run --rm`으로만 | 4단계 |
| `cutover` | 프로파일 `cutover`, `run --rm`으로만 | 5단계 |
| `bootstrap` | 프로파일 `bootstrap`, `run --rm`으로만 | 7단계 |
| `set-actor-role` | 프로파일 `admin`, `run --rm`으로만 | 10단계 |

이 표의 번호는 이 글 안에서만 씁니다. [oidc-and-images.md](oidc-and-images.md)의 「Production stack」은 같은 순서를 1~7(1a·4a 포함)로 셉니다. 복구한 프로젝트는 그쪽의 `PIN` 정의를 따르고, 이 글의 `$P`와 `stack-status.sh`는 `PIN` 없는 기본 구성만 봅니다.

프로파일 뒤의 네 서비스는 `up -d`로 실행되지 않습니다. 위 표의 `run --rm` 명령으로만 돕니다. `run`은 해당 프로파일을 알아서 켭니다.

### MinIO

운영 구성에서 MinIO는 별도 지정 없이 `up -d`로 함께 뜹니다. 버킷도 `minio-bootstrap`이 만듭니다. 따로 할 일은 `.env.production`의 `MINIO_ROOT_USER`·`MINIO_ROOT_PASSWORD`를 채우는 것뿐입니다.

빠졌을 때 나타나는 증상:

- MinIO나 버킷 준비가 안 끝나면 backend가 뜨지 않습니다(`minio-bootstrap` 완료에 의존).
- 떠 있는 동안 저장소에 닿지 않으면 `GET /health/ready`가 503이고 `checks.storage`가 `fail`입니다.
- `stack-status.sh`가 `minio`와 `minio-bootstrap` 줄을 `[todo]`로 알려 줍니다.

### MinIO 이미지

저장소는 배포용 MinIO 이미지를 고정하지 않습니다. 사이트마다 env 파일의 `MINIO_IMAGE`에 이미지를 적습니다(사내 값 `bitnami/minio:2024.7.16-debian-12-r0`). 값이 없으면 compose가 시작을 거부합니다. 이미지가 서버에 있으면 그대로 쓰고, 없으면 일반 pull을 시도합니다.

1. `MINIO_IMAGE`를 `.env.production`에 적습니다.
2. 서버 CPU와 아키텍처가 같은지 확인합니다(대개 `linux/amd64`).

       docker image inspect --format '{{.Os}}/{{.Architecture}}' "$MINIO_IMAGE"

3. `stack-status.sh`의 `image …` 줄이 `[ok]`인지 봅니다. 값이나 이미지가 없으면 같은 자리에 `[todo]`로 할 일을 알려 줍니다.

compose는 MinIO를 `entrypoint: ["minio"]`와 root로 띄웁니다. Bitnami 이미지의 기본 진입 스크립트는 `server` 명령을 실행하지 못하고, 기본 사용자 1001은 root 소유인 `/data` 볼륨에 쓰지 못하기 때문입니다.

개발 구성의 기본값은 공개로 받을 수 있는 같은 이미지 `bitnamilegacy/minio:2024.7.16-debian-12-r0`입니다. 상위 MinIO는 보관 처리되어 보안 업데이트가 없습니다.

백업 스크립트의 `mc`도 이 이미지를 `--pull never`로 씁니다. `MINIO_IMAGE`가 없거나 이미지가 서버에 없으면 `backup.sh`·`restore.sh`가 아무것도 멈추기 전에 거부하고 할 일을 출력합니다(`BACKUP_MC_IMAGE`로 다른 로컬 사본을 지정할 수 있음).

이미지 출처(tar를 어디서 구하는가)는 아직 정해지지 않았습니다([#1617](https://github.com/hjung3113/analytics-platform/issues/1617)). 이 절은 tar가 있을 때 옮기는 방법만 다룹니다.

### 최초 Admin의 한계

Admin이 되어도 **Scope가 필요한 분석 메뉴는 열리지 않습니다.** 실서버에서는 사이트·방 단위 Scope 부여가 아직 설계 중이라([#1087](https://github.com/hjung3113/analytics-platform/issues/1087)) 그 메뉴는 부여가 생길 때까지 닫혀 있습니다. 이것은 구성 결함이 아니라 현재 한계입니다. Admin 화면(권한, 시스템, 플랫폼 관리)은 열립니다.

### 상태 점검 스크립트

`scripts/release/stack-status.sh [env 파일]`은 다음을 봅니다. `PROJECT` 환경 변수로 프로젝트 이름을 바꿉니다(기본 `platform-api`).

- 설정 파일이 preflight를 통과하는가, 이미지 3개가 있는가
- postgres, minio, backend, edge가 떠 있는가, `migrate`·`minio-bootstrap`이 정상 종료(exit 0)했는가
- Workspace 행, `system` 계정, 로그인한 사람 수, Admin 수 (개수만 읽음)

볼 수 없는 것: 역할 비밀번호 적용 여부(4단계는 반복해도 안전), bootstrap 뒤 backend를 다시 시작했는가(8단계). 모든 단계가 끝났으면 0, 하나라도 남았으면 1로 끝납니다.

## 개발 (dev)

개발 구성은 Postgres와 MinIO를 띄우고, 로그인 서버(Keycloak)와 메일 확인(mailpit)은 `--profile auth`를 줄 때만 뜹니다. 명령은 [docker-compose.dev.yml](../../docker-compose.dev.yml) 머리 주석이 원본입니다.

- `docker compose -f docker-compose.dev.yml up -d`로 Postgres와 MinIO가 뜹니다. 새 볼륨은 그 주석대로 `cutover-0076-platform-identity.sh all`과 `pnpm --filter @ap/platform-api db:seed`를 이어서 돌립니다.
- 개발 구성에서는 MinIO가 뜨지만 **버킷은 손으로 한 번 만듭니다**(운영과 달리 자동이 아닙니다). 이 명령은 `STORAGE_S3_ENDPOINT`·`STORAGE_S3_REGION`·`STORAGE_S3_BUCKET`·`STORAGE_S3_ACCESS_KEY_ID`·`STORAGE_S3_SECRET_ACCESS_KEY`·`STORAGE_S3_FORCE_PATH_STYLE`을 환경 변수로 읽습니다(값은 개발 compose의 MinIO 계정과 `localhost:9000`): `pnpm --filter @ap/platform-api exec tsx src/cli/storage-bootstrap.ts`
- 로그인 서버가 필요하면 `docker compose -f docker-compose.dev.yml --profile auth up -d`. 절차는 [keycloak-interim-idp.md](keycloak-interim-idp.md)입니다.

> 이 절은 compose 주석과 코드를 옮겨 쓴 것이고, 위 MinIO 이미지 문제([#1617](https://github.com/hjung3113/analytics-platform/issues/1617)) 때문에 이번에 따라 해 보지 못했습니다.

## 로컬 스모크 (release)

`bash scripts/release/image-smoke.sh`가 이미지를 만들고 Postgres, 가짜 로그인 서버, MinIO, backend를 순서대로 띄워 확인합니다. 정리는 `bash scripts/release/image-smoke.sh --down`입니다. 세부는 [oidc-and-images.md](oidc-and-images.md) 앞부분입니다. 이 구성은 배포하지 않습니다.

> 이 절도 같은 이유로 이번에 실행해 보지 못했습니다.

## 주의

- 프로젝트 이름을 바꿔도 볼륨 이름은 따로 정해져 있습니다. `RELEASE_POSTGRES_VOLUME`·`RELEASE_MINIO_VOLUME`의 기본값이 옛 설치(`feedbackops-release-1060_…`)를 가리키므로, 연습용으로 띄웠다가 `down -v` 하면 **같은 이름의 기존 데이터 볼륨이 지워집니다.** 연습 전에 두 변수를 다른 이름으로 지정하세요. 자세한 것은 oidc-and-images.md의 「Existing installs: data volumes」입니다.
- `.env.production`과 `docker compose config` 출력을 티켓이나 로그에 붙이지 않습니다.

## 원문 창 Source 연결 (선택, #1817)

기본 비활성입니다. [서버 Source 설정](../../../../apps/platform-api/README.md#optional-source-window-provider-1817)의 세 환경 변수와 grant 파일을 준비합니다. 환경 변수의 경로는 backend 컨테이너 안의 경로입니다. 운영 compose 원본을 유지하고 배포별 override의 backend `environment`에 세 변수를 명시하며, Source 루트와 grant 파일의 부모 디렉터리를 읽기 전용으로 마운트합니다. 부모 디렉터리를 마운트해야 호스트의 grant 파일 원자 교체가 컨테이너에 반영됩니다. Linux `/proc/self/fd` 접근이 필요합니다.

Source 소유자별 루트에는 공개 가능한 fixture 또는 해당 소유자가 관리하는 원문만 둡니다. grant 파일은 일반 사용자에게 공개하지 않습니다. Round에 실제 바이트의 SHA-256·파일 순서를 등록한 뒤, 조회 권한과 정확한 workspace·actor·owner grant를 가진 계정으로 EvidenceRef 링크의 원문 창을 확인합니다. grant 제거 후 다음 요청과 읽기 도중 철회도 확인합니다. 실제 사내 mount·ACL 적합성 확인 전에는 운영 연동 완료로 판정하지 않습니다.
