# ADR-0140 — 범용 파일 올리기는 선택 포트 `PlatformAdapter.uploadFile`과 `POST /api/v1/platform/files`로 둔다

- 상태: Decided (2026-11-11, lane sdk-upload, 되돌릴 수 있음). 이슈 [#1741](https://github.com/hjung3113/analytics-platform/issues/1741).
- 결정자: 소유자 ("니추천대로", 2026-11-11, #1658의 질문에 대한 답: "범용 업로드 부품을 SDK에 추가한다"). 추천안과 대안은 아래 표.
- 근거 규칙: [ADR-0052](0052-rich-content-stays-in-the-sdk.md)(도메인 없는 범용 부품은 소비자 수와 무관하게 SDK에 둔다), [ADR-0098](0098-adapter-preferences-people-notices-ports.md)(어댑터 포트를 추가하는 방식).

## 배경

메뉴가 사용자가 고른 파일을 서버에 올리고 id를 받을 길이 포트에 없었다. 첨부 저장소(`POST /attachments`)는 있지만 VOC 화면의 전용 경로이고 `PlatformAdapter` 밖에 있다. 첫 소비자는 온보딩 화면의 Sample Window 가져오기(#1658)이며 파일은 `*.batch.json`이다. 이 부품에는 도메인 낱말이 없다.

## 결정

1. **포트.** `PlatformAdapter.uploadFile?(input, signal?)`는 선택 메서드다. 없는 어댑터는 지금과 같다. 입력 `{ file: Blob, name, idempotencyKey }`, 답 `ActionResponse<UploadedFile>`, `UploadedFile = { id, name, size, mimeType }`. `UPLOAD_FILE_MAX_BYTES = 33_554_432`(32 MiB)는 화면의 사전 점검용이고 판정은 서버가 한다. `file.type`이 선언된 MIME이며 비어 있으면 `application/octet-stream`이 되어 거절된다(포트 JSDoc에 적는다).
2. **서버가 권위.** 크기·MIME·이름·권한을 서버가 판정한다. 라우트 `POST /api/v1/platform/files`(multipart, `file` 부분 하나, `Idempotency-Key` 헤더, 다른 플랫폼 쓰기와 같은 CSRF). 세션이 있고 `platform:view`를 가지면 올릴 수 있다. 올린 파일을 **쓸** 권한은 그 id를 받아 쓰는 쪽이 판정한다. 판정된 실패(너무 큼·허용 안 된 형식·쓸 수 없는 이름·두 번째 파일 부분·동시 올리기 한도)는 던지지 않고 `invalid`/`error` 결과로 답한다. 같은 키로 같은 파일은 `replayed`, 같은 키로 다른 파일은 `conflict`(다른 파일은 이름·형식·크기·**내용 SHA-256**으로 가른다). 키는 소문자 한 철자로 잠그고 기록한다. 세션·CSRF·권한·키·미디어 타입 판정은 본문 파서보다 앞(`preParsing`)에서 한다. 이 라우트는 쿠키 세션만 받는다(토큰 호출 불가).
3. **저장은 첨부 모듈을 그대로 쓴다.** 라우트는 첨부 모듈의 배럴로 `uploadAttachmentCommand`와 multipart 읽기(`readUploadPart`)를 부른다. 그래서 저장소 경계, 멱등 틀, 파일 이름이 없는 `attachment_uploaded` 감사(감사의 `storage_key`는 `{workspace_id}/{attachment_id}` 형태의 이름 없는 참조이고, 객체 키는 그대로 `{workspace_id}/{attachment_id}/{filename}`이다. 이 변경은 두 라우트의 새 업로드에 적용되며 이미 쓰인 append-only 기록은 고치지 않는다), 동시 올리기 한도, 24시간 뒤 연결 안 된 행 정리, 연결 안 된 행은 올린 사람만 내려받기가 그대로 적용된다. 새 표도 새 부모 종류도 없다. 동시 올리기 한도(`ATTACHMENT_UPLOAD_CONCURRENCY`)는 `server.ts`에서 하나를 만들어 두 라우트가 같이 쓴다. 둘을 따로 두면 버퍼 메모리 상한이 두 배가 된다.
4. **한도.** multipart 플러그인의 전역 상한을 32 MiB로 올리고, 각 라우트가 요청마다 자기 한도를 넘긴다. 파서는 요청마다 `files: 1`, 텍스트 필드 8개·필드당 4 KiB·부분 10개로 묶어 파일 밖 바이트가 버퍼 예산을 넘지 못하게 하고, `file` 이름이 아닌 파일 부분은 `required`로 거절한다(두 라우트 공통). 운영 엣지는 `/api/v1/platform/files`에만 34m를 허용한다(32 MiB + multipart 오버헤드 + 한 바이트 초과 파일이 서버의 `too_large` 판정까지 닿을 여유). 그 밖의 `/api/`는 26m 그대로다. `POST /attachments`는 25 MiB를 그대로 지키며 스트리밍 중에 막는다(25~32 MiB 파일을 끝까지 버퍼링하지 않는다). 오류 본문은 그대로다.
5. **MIME.** `application/json`을 허용 목록에 더한다. 목록은 두 라우트가 같이 쓰므로 `POST /attachments`도 JSON을 받게 된다(받아들인다). 내려받기는 항상 `Content-Disposition: attachment`이고 서버는 모든 응답에 `X-Content-Type-Options: nosniff`를 보내므로 화면에서 실행되지 않는다. 라우트별 목록을 따로 두지 않는다 — 닫힌 집합 하나를 유지하는 쪽이 어긋날 곳이 적다.
6. **소비 방법(lane-ev).** 올린 파일은 연결되지 않은 행이라 **올린 사용자만** 내려받을 수 있고 **24시간 뒤 지워진다**. 소비하는 쪽은 그 안에 서버에서 id로 읽어 가져오거나, 연결 단계로 부모에 붙인다. 이 결정은 연결 단계를 새로 만들지 않는다.

## 대안과 이유

| 안 | 결과 |
| --- | --- |
| 선택 포트 + 첨부 모듈 재사용 (채택) | 기본 동작 불변, 새 표 없음, 감사·정리·접근 규칙이 한 곳 |
| 메뉴가 `/attachments`를 직접 부름 | 포트 밖 호출이라 mock·적합성·교체 가능성이 없고 메뉴마다 CSRF·오류 변환을 다시 쓴다 |
| 필수 포트 메서드 | 모든 어댑터와 `testAdapter`를 깨뜨린다 |
| 새 표·새 부모 종류 | 정리·접근 규칙이 둘이 되고 이 요구에 이유가 없다 |
| 라우트별 MIME 목록 | 닫힌 집합이 둘로 나뉜다. 위험은 내려받기 헤더가 막는다 |

## 구현하지 않음 (다시 여는 조건)

- 연결 단계(올린 파일을 부모에 붙이기): 소비자가 24시간 안에 읽지 못할 때.
- 목록·삭제 메서드: 소비자가 올린 파일을 화면에서 지워야 할 때.
- 나눠 올리기·이어 올리기: 32 MiB를 넘는 파일이 필요할 때.
- 포트 하네스의 세션 없음 사례(적합성): 하네스에 세션 없는 행위자가 생길 때. 세션 없음 거절은 라우트 시험이 닫는다.
