# rich-content는 SDK에 둔다 — 도메인 데이터를 박지 않은 범용 부품은 쓸 곳이 없어도 SDK에 남긴다

상태: **Decided (2026-10-19, 결정자: 사용자 — "sdk는 나중에 쓰일 것도 모두 넣어놔야 되는 것 아니냐, 누가 쓸지 모른다", 선택지 A 승인. 되돌릴 수 있음)** — [ADR-0050](0050-domain-coupled-ui-returns-to-feedbackops.md)의 `rich-content` 부분을 대체한다. 구현은 [#483](https://github.com/hjung3113/analytics-platform/issues/483).

ADR-0050은 `rich-content/` 전체(에디터·렌더러·sanitizer·allowlist 사본·tiptap 확장)를 FeedbackOps로 되돌렸다. 이유는 sanitizer 허용 목록의 사본이 두 곳에 있어 동등성 검사를 지켜야 한다는 부담이었다. 사용자가 반박했다: SDK는 누가 쓸지 모르는 공용 층이라 "지금 쓰는 곳이 없다"는 이유로 범용 부품을 빼면 안 된다. 에디터와 렌더러에는 특정 제품의 도메인 데이터가 없고, 공지·VOC 메뉴나 EV가 리치 텍스트를 쓸 가능성이 높다. 동등성 부담은 부품을 빼는 이유가 아니라 검사를 유지하면 되는 일이다.

## 결정

- **`rich-content/`를 SDK에 복원한다**(`RichEditor`·`RichContentRenderer`·sanitizer·allowlist 사본·tiptap 확장·`AttachButton`·`Mention`·`AttachmentRef`, 공개 이름 그대로). ADR-0050이 지운 파일을 `sdk-v0.3.1` 상태 그대로 되돌린다.
- **허용 목록의 원본은 계속 FeedbackOps 백엔드(`packages/shared`)다.** `apps/platform-web/src/rich-content-allowlist-parity.test.ts`와 turbo 입력, `@tiptap/*` 22개 `overrides`, tiptap 의존이 함께 돌아온다. 허용 목록을 바꾸면 FeedbackOps와 SDK 사본을 같이 고친다.
- **SDK 편입 기준(앞으로):** 부품 안에 특정 제품의 도메인 데이터·문구·권한(VOC 상태 문구, Managed System, 엔티티 종류 등)을 박아 두지 않았으면 쓰는 곳이 없어도 SDK에 둔다. 제품별 매핑이 필요하면 prop으로 받게 하고 매핑은 제품이 소유한다. 도메인에 묶인 부품(ADR-0050의 나머지 목록)은 계속 제품 소유다.
- 호환: 다시 늘어나는 변경이라 `sdk-v0.5.0`이다. FeedbackOps는 `rich-content`를 로컬 구현으로 쓰고 있으므로 영향이 없고, 나중에 `@ap/ui`로 바꿀 수 있다.

## Considered Options

- **(a, 채택) rich-content만 복원:** 범용 부품은 SDK, 도메인 매핑은 제품이라는 선이 분명하고, 보안 부담은 기존 동등성 검사로 감당한다.
- **(b) 도메인 부품까지 전부 복원:** SDK가 제품 도메인 문구를 품게 되어 ADR-0043의 "업무는 제품 소유"와 어긋나고, 다른 제품이 쓰려면 어차피 내용을 바꿔야 한다. 사용자도 도메인 특화 내용은 필요 없다고 했다.
- **(c) ADR-0050 유지:** 보안 사본 부담은 없지만 범용 에디터를 제품마다 다시 만들게 된다.
