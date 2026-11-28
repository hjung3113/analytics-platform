# 합성 분석 workload — 대량 실행·측정 (#3204)

분석 질의·엔진 시험(#1704, #2918)이 같은 논리 입력을 쓰도록 `@ap/server-conformance/datasets`의 가상 데이터셋을 파일로 내보내는 방법. 데이터셋 자체(두 종류, 고정 반례, 파라미터, 체크섬 규칙)는 [패키지 안내](../../packages/host/server-conformance/AGENTS.md#synthetic-datasets-datasets-3204)가 원본이다.

## 원칙

- opt-in만. 기본 CI는 작은 golden·기능 규모 시험만 돌리고, 대량 파일·DB를 CI나 저장소에 넣지 않는다. 스크립트는 저장소 안 경로로 쓰기를 거부한다.
- 모든 값은 가상이다. 프로필 규모·파라미터 기본값은 임의 시험값이고 실측이 아니다. 사내 규모·분포·기대값은 `--params`로 사내에서만 넣고, 그 값과 결과는 [환류 절차 §3](upstream-feedback-procedure.md#3-나가도-되는-것과-안-되는-것)대로 밖으로 내보내지 않는다.
- 이 실행의 통과는 사내 성능·업무 의미의 PASS가 아니다.

## 실행

```sh
pnpm --filter @ap/server-conformance build
node tooling/scripts/synthetic-workload.mjs --dataset interval-steps --profile large --out /tmp/workload-runs
node tooling/scripts/synthetic-workload.mjs --dataset shared-resource --format csv --out /tmp/workload-events \
  --params '{"events": 200000, "skew": 2}'
```

| 옵션 | 기본 | 뜻 |
| --- | --- | --- |
| `--dataset` | (필수) | `interval-steps` · `shared-resource` |
| `--out` | (필수) | 저장소 밖 폴더 |
| `--seed` | `workload` | 같은 seed·파라미터·버전이면 같은 행·체크섬 |
| `--profile` | `functional` | `functional`(기본값) · `large`(부모 100만 행) |
| `--params` | `{}` | 프로필 위에 덮는 파라미터 JSON |
| `--format` | `ndjson` | `ndjson` · `csv`(null은 빈 칸) |
| `--batch` | `10000` | 한 묶음의 부모 행 수. 메모리는 이 묶음만큼 |

## 결과

- 표마다 `<표>.ndjson|csv`, 그리고 `manifest.json`: 데이터셋·버전·seed·전체 파라미터·행 수·체크섬·`measurement`(경과 ms, 초당 행, 최대 RSS, Node, 플랫폼, CPU)
- 체크섬은 같은 입력의 `generateSyntheticDataset` 체크섬과 같다. 엔진 쪽 적재 뒤 행 수와 함께 대조한다.
- 측정을 비교할 때는 manifest의 `measurement`를 함께 기록한다. 기계·Node가 다르면 같은 숫자로 비교하지 않는다.

참고 측정(개발 PC 1회, Node 26.13, Ryzen 7 7800X3D, WSL2, NDJSON, 기본 묶음): `interval-steps` `large` 310만 행 7.7초·최대 RSS 275 MB, `shared-resource` `large` CSV 305만 행 3.7초·216 MB. 부모 100만→300만 행에서 최대 RSS 261→267 MB(쓰기 없는 sink) — 규모와 무관하게 묶음 크기로 묶인다.

## 다음

- 엔진별 loader(공개 PG 최소 계약 시험, #1704)와 #2918 측정에서의 사용 기록은 #3204 조각 3.
