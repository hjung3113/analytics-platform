# ADR-0145 — LaneTimeline 성능은 Canvas 2D LOD로 먼저 풀고 Worker·WebGL은 측정이 모자랄 때만 연다

- 상태: Decided (2026-11-11, lane 1746c, 소유자가 되돌릴 수 있음). 이슈 [#1746](https://github.com/hjung3113/analytics-platform/issues/1746).
- 결정자: lane (계획 D2). 소유자가 Worker나 WebGL을 먼저 하라고 하면 되돌린다.
- 근거 규칙: [ADR-0064](0064-topn-bar-and-lane-timeline.md), [ADR-0052](0052-rich-content-stays-in-the-sdk.md).

## 배경

1단계 측정에서 전체 보기(50k·200k 구간)는 한 프레임 비용의 85~90%가 구간마다 색 문자열·`fillStyle`·`fillRect`·윤곽 호출을 반복하는 그리기 루프였다. 소유자 목표는 확대·이동 그리기 p95 8 ms(50k) / 12 ms(200k)다.

## 결정

Canvas 2D 안에서 구간 모델을 열 배열과 시간 색인으로 바꾸고(1746a), 레인의 보이는 구간 수가 plot 폭(px) 이상이면 픽셀 열 LOD로 색별 묶음 `fillRect`만 그린다(1746b). Worker와 WebGL은 이번에 만들지 않는다.

측정(레인 호스트, 운영 번들, 같은 합성 데이터, 전체 보기 확대·이동 그리기):

| 규모 | 기준선 | 1746b |
| --- | --- | --- |
| 50k | 39 ms | 9.4 ms |
| 200k | 168 ms | 14.7 ms |

LOD로 약 4~11배 줄었다. 이 숫자로 Worker·WebGL을 강제할 근거가 생기지 않았으므로 그 측정은 하지 않았다.

## 대안과 이유

| 안 | 결과 |
| --- | --- |
| Canvas 2D 열 배열 + LOD (채택) | 공개 API·기본 모양 불변, 새 의존성 없음, 큰 폭으로 개선 |
| OffscreenCanvas + Worker | 메인 스레드는 비지만 모델·색 해석·히트 테스트를 둘로 나눠야 하고 jsdom 시험·CSP·번들이 복잡해진다. 측정 목표를 못 맞출 때만 의미가 있다 |
| WebGL | 구간 수에 강하지만 윤곽·글리프·텍스트·이미지 복사를 다시 만들어야 하고 같은 인터페이스 뒤 보장이 어렵다 |

## 구현하지 않음 (다시 여는 조건)

- Worker·WebGL: 운영 번들 측정이 소유자 목표(p95 8 / 12 ms)를 못 맞출 때. 그때 측정값을 여기에 적는다.
- `ImageData` 래스터: 200k를 넘는 규모나 더 낮은 p95가 요구될 때의 후보. 측정 전에는 하지 않는다.
