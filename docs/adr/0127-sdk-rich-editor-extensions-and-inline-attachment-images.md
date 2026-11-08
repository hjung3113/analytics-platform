# 리치 에디터 확장은 SDK가 제공하고 본문 이미지는 첨부 ID로만 저장한다

상태: **Decided (2026-11-07)**. Status: **Decided**.
- 결정자: 사용자 — Tiptap 확장 안을 선택하고 [실제 앱 시안](https://claude.ai/artifact/3pfDHscmgL6Xkw34HtgaJg)의 모양을 승인. 실제 한글 입력기와 입력 지연은 구현 PR에서 확인한다.
- 결정자: 코디네이터(사용자 위임) — `voc-description`부터 선택 적용하며 다른 surface는 유지한다. 적용 surface는 되돌릴 수 있다.

[ADR-0052](0052-rich-content-stays-in-the-sdk.md)를 보충한다. 도메인을 모르는 편집·읽기 조각은 SDK `@ap/ui`가 소유하고, 업로드·다운로드 URL·VOC 연결은 소비자가 주입한다. [FO ADR-0011](history/feedbackops/0011-rich-content-editor-and-attachment-storage.md)의 “image extension is NOT registered” 결정은 선택 적용 surface에 한해 이 결정으로 대체한다. 다른 surface의 이미지 금지와 첨부 저장·권한 경계는 유지한다.

## 결정

- Tiptap 3.23.5를 유지한다. surface별 capability가 편집 확장·툴바·슬래시 메뉴·선택 말풍선·블록 손잡이를 함께 제어한다. `voc-description`의 표현 범위와 속성 경계는 [VOC 화면 계약 §5.7](../design/features/specs/voc.md#57-richeditor-per-surface-contract)이 소유한다. 이 surface에는 멘션을 켜지 않는다.
- 이미지 JSON은 첨부 UUID `id`와 선택 정수 `width`만 가진다. 자유 URL·외부 HTML 이미지·markdown 이미지 입력 규칙으로 이미지를 만들지 않는다. 읽기와 편집은 `resolveAttachmentUrl`로 URL을 그릴 때 구하고, URL이 없으면 첨부 칩을 그린다. 서버가 거절하는 속성·오류와 VOC 연결 규칙은 §5.7이 소유한다.
- 파일 붙여넣기·드롭은 기존 `onAttach`를 사용한다. VOC 작성은 업로드 큐 하나를 첨부 목록과 공유한다. 이미지 파일은 목록과 본문에 모두 나타나고 나머지 파일은 목록에 나타난다. 실패하면 본문 노드를 만들지 않는다. 편집 화면은 기존 첨부 경로를 유지하고 새 본문 업로드는 켜지 않는다.
- SDK 내부 `RichEditor` 지연 경계 뒤에 편집 플러그인을 둔다. 읽기는 에디터 인스턴스를 만들지 않고 schema/render 정의와 순수 목차 계산을 사용한다. 문법 강조는 7개 언어만 직접 등록하고 읽기에서도 정적 강조를 수행한다. 나머지 언어는 번들에 넣지 않는다. 색은 토큰 팔레트 키로 저장한다.
- 공유 허용 목록 원본·SDK 사본·서버 sanitizer를 함께 바꾸며 전체 속성 schema(범위·enum 포함)와 fixture 동등성을 검사한다. 첨부 ID 수집은 기능 공유 패키지의 순수 함수를 서버와 화면이 함께 쓴다. SDK는 이 패키지를 import하지 않는다.

## Considered Options

- **(A) BlockNote로 전환:** 이미 저장·검증·읽기가 Tiptap JSON 계약을 쓰고 있어 엔진 전환 비용이 크며 선택한 시안과 다르다.
- **(B, 채택) Tiptap 선택 확장:** 기존 저장 계약과 소비자 API를 유지하면서 범용 편집 기능을 더할 수 있다.
- **(C) 자유 URL 이미지를 허용:** 서버 첨부 권한·VOC 연결 검사 바깥에서 외부 리소스를 읽게 되므로 선택하지 않는다.

## 결과

[공통 컴포넌트 계약 §13](../contract/components.md#richeditor--richcontentrenderer-decided-adr-0127)에 SDK 조립 경계를 둔다. 적용 버전은 `sdk-v0.32.0`, 플랫폼 작업은 [#1452](https://github.com/hjung3113/analytics-platform/issues/1452)다. 외부 임베드·iframe·수식·다이어그램·공동 편집·AI는 구현하지 않는다(사내망·보안 경계와 번들 비용에 비해 수요가 없음). 다시 검토하려면 해당 수요와 보안·성능 조건을 별도 결정해야 한다.

## Amendment — toolbar layout (#1529), 2026-11-08

Decider: owner, 2026-11-08. The owner confirmed [variant A in the actual app](https://claude.ai/artifact/JxsnbRK8xuTfCvzpNHzyXS): text formatting on row 1, block insertion on row 2. The prototype code is discarded; this decision is the specification.

- Keep exactly two non-wrapping rows under one roving toolbar. At narrow widths, fold trailing controls in order into each row's «더보기» menu; insertion controls fold first, and text controls fold when their row still cannot fit. Folded controls retain their state.
- The heading dropdown reflects the current block (본문 / 제목 1–3). Block actions are one-click controls. Token palette menus use color names. Toggle buttons expose their pressed state visually and accessibly.
- The toolbar sticks within the host scroll container. The host supplies `toolbarStickyOffset` or `--rich-editor-toolbar-offset` (default 0); the SDK does not assume host padding.
- Keep the left `+` stacked above the drag grip and run the selected action at the hovered block. The owner chose stacking on 2026-11-08 after reviewing the side-by-side build (https://claude.ai/artifact/TJpnpYEnTCAacePoseeCQN): it costs about 28px less body width, and side-by-side placement outside the editor is clipped by scrolling hosts. Reserve an internal gutter in editable surfaces with block controls so clipping scroll hosts cannot hide either control; read-view content and surfaces without block controls retain their existing inset. Keep the keyboard `/` menu and constrain its placement to the viewport.
- Table actions float at the table's top-start; the code-language chip floats at the code block's top-end. Every editable table and code block always reserves a strip at its top for these controls, so they never cover preceding text and selecting a block never shifts the layout. The table bar shares the main toolbar's single Tab stop and arrow/Home/End navigation. Reserve code-chip space in editor-only CSS without mutating ProseMirror-owned code DOM. Opening a portalled language menu preserves its anchor and supports resetting to 일반 텍스트 (`null`).
