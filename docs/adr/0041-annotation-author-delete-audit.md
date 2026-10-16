# 차트 주석은 작성자만 지울 수 있고, 삭제는 감사 기록에 남긴다

상태: **Decided (2026-10-17)**.
- 결정자: 사용자 — 2026-10-17, [#399](https://github.com/hjung3113/analytics-platform/issues/399) 선택지 (b): "작성자만 자기 주석을 지울 수 있고, 삭제는 Audit에 남긴다."

차트 주석(06 §16)은 서버가 소유하고 같은 사이트의 사용자가 함께 읽는다. 지금까지는 저장만 있고 삭제가 없어서, 잘못 저장한 메모를 지울 방법이 없었다.

## 결정

- 포트에 `deleteAnnotation(ref: AnnotationRef & { id }, signal?)`를 더한다. 답은 지운 `{ id }`다. 관문은 목록·저장과 같다(권한 `analytics:view` → 시나리오 → 입력 검증 → Site 부여). null·알 수 없는·미부여 Scope는 조회 전에 `forbidden`이다.
- 관문을 지난 뒤에는 `(chartId, scopeId)` 안에서만 id를 찾는다. 없으면 `empty`, 다른 사용자가 쓴 주석이면 `forbidden`이다. 다른 사이트·차트의 행은 존재 여부도 드러나지 않는다(ADR-0004). 알 수 없는 키는 호출 전체를 거부한다.
- 화면에 삭제 버튼을 그릴지는 서버가 계산한 `ChartAnnotation.mine: boolean`으로 정한다. 작성자 id는 wire에 나가지 않는다(노출 최소). `mine`은 표시 힌트일 뿐이고 서버는 삭제 때 작성자를 다시 확인한다. 저장하지 않고 응답마다 요청 사용자로 계산한다.
- 성공한 삭제는 감사 행을 남긴다: `action: 'delete'`, `target: { type: 'annotation', id, scopeId }`, `actor`는 삭제한 사용자, `at`은 실제 시점(zoned instant), 주석 문구는 `reason`, 차트 id는 `changes.chartId`. `AuditAction`에 `delete`를 더하고, 콘솔 감사 화면의 작업·대상 유형 라벨(삭제 / 차트 주석)을 같은 변경에서 맞춘다. 읽기는 `auditTrail`(`console:access`)이다.
- 화면: 본인 주석 항목에만 "삭제: <문구>" 버튼을 둔다. 한 번의 인라인 확인을 거쳐 삭제하고, 다시 조회한 뒤 고정 문구로 토스트한다(서버 `message`는 싣지 않는다). 포커스는 확인 행에 있을 때만 옮긴다(06 §26).

## Considered Options

- **(a) 권한이 있으면 누구나 삭제**: 같은 사이트의 남이 쓴 메모를 마음대로 지울 수 있다.
- **(b, 채택) 작성자만 삭제 + 감사 기록**: 잘못 쓴 메모를 지울 수 있고, 남의 메모는 지키며, 사라진 문구는 감사에서 되짚을 수 있다.
- **(c) 삭제 없음**: 잘못 저장한 메모가 영원히 남는다.

## 결과

- 포트·mock·적합성 묶음·`testAdapter`·참조 어댑터를 같은 변경에서 고쳤다. 계약 문서는 06 §16·§26, `docs/integration/real-server-checklist.md` §2, `docs/integration/http-adapter-contract.md` §1·CSRF 목록(상태를 바꾸는 호출, 알 수 없는 키 거부는 `saveAnnotation`과 같다)이다.
- 한 번 지운 주석은 되살릴 수 없다. 감사 행이 문구를 남긴다.
- 겹치는 범위의 주석 라벨은 줄을 나누고 영역 폭으로 줄여 그린다(같은 이슈의 AC-2). 전문은 아래 목록에 있다.
