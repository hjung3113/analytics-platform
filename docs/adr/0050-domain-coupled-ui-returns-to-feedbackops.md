# FeedbackOps 도메인에 묶인 UI 부품과 rich-content는 FeedbackOps 소유로 되돌리고, SDK에는 도메인을 모르는 부품만 남긴다

상태: **Decided (2026-10-19, 결정자: 사용자 — "ㅇㅋ 이어하자", 코디네이터 분류 초안을 승인. 되돌릴 수 있음)** — 구현은 [#479](https://github.com/hjung3113/analytics-platform/issues/479).

[ADR-0046](0046-design-system-source-moves-to-platform-whole-package.md)은 FeedbackOps `@fops/ui` 전체를 `@ap/ui`로 옮기면서 "도메인 결합 부분을 분류해 FeedbackOps 소유 층으로 되돌릴지는 이전 끝난 뒤 다시 정한다"를 Open으로 남겼다. 이전(#441–#443)과 FeedbackOps의 1·2번 묶음 전환(FeedbackOps#1289·#1291·#1295)이 끝나 분류할 수 있다. 플랫폼 코드에서 이 부품들을 쓰는 곳은 0건이다(메뉴의 `ReporterStatusBadge` 언급은 주석뿐).

## 결정

- **SDK에 남긴다(도메인 단어를 모르거나 prop으로 받는다):** `data/ObjectRow`, `identity/{UserAvatar,UserChip}`, `indicators/{ProgressMeter,SeverityIndicator}`, `permissions/PermissionBlockedPanel`, `badges/StatusBadgeFrame`(패널 헤더가 쓴다). 이들은 primitive·패널 부품에만 기댄다.
- **FeedbackOps 소유로 되돌린다(VOC 상태·Managed System·엔티티 종류에 묶였다):** `badges/{SeverityBadge,ReporterStatusBadge,InternalTaskBadge,UnassignedBadge,ManagedSystemPill,ManagedSystemMark,managed-system-mark,OutlineBadge,EntityIconBadge}`, `entity/LinkedEntityTrail`, `components/{ManagedSystemPicker,AnalyticsAreaPicker,ChipPicker}`와 그 테스트. FeedbackOps `packages/ui`는 이미 같은 파일을 로컬로 갖고 있어 코드 이전은 없다(SDK 쪽 사본 삭제뿐).
- **`rich-content` 전체를 되돌린다(`RichEditor`·`RichContentRenderer`·sanitizer·allowlist 사본·tiptap 확장·`AttachButton`·`Mention`·`AttachmentRef`).** sanitizer 허용 목록의 원본은 FeedbackOps 백엔드(`packages/shared`)라 SDK가 사본을 두면 보안 규칙이 두 곳에서 갈릴 수 있고, 그래서 동등성 검사(#459)를 계속 유지해야 한다. 되돌리면 사본과 검사가 모두 없어진다. tiptap 의존(`@tiptap/*` 22개 고정)과 SDK 소비자 조건도 없어진다.
- **의존 규칙:** SDK 부품은 되돌린 부품을 import하지 않는다. 남기기로 한 부품이 되돌릴 부품에 기대는 것이 확인되면 그 부품도 되돌린다(분류를 줄이는 쪽).
- **호환성:** SDK에서 공개 이름이 사라지는 호환 깨짐이므로 `sdk-v0.4.0`이다. 플랫폼에는 소비자가 없고, FeedbackOps는 이 부품을 로컬 구현으로 계속 쓴다.

## Considered Options

- **(a, 채택) 도메인 결합은 되돌리고 일반 부품만 SDK:** ADR-0043의 "업무는 제품 소유"와 맞고 보안 사본이 사라진다. 비용은 SDK 공개 이름이 줄어드는 것(소비자 0).
- **(b) 전부 SDK에 둔다(ADR-0046의 현재 상태):** 이전 작업은 끝난 상태지만 FeedbackOps 도메인 부품이 플랫폼 패키지에 남고, allowlist 사본 동등성을 계속 지켜야 한다.
- **(c) 일반 부품도 되돌린다:** SDK가 더 작아지지만 EV 같은 다른 제품이 쓸 수 있는 일반 부품(`ObjectRow`·아바타 등)을 다시 만들게 된다. 06 §24 기준(소비자 2–3곳 확인)으로는 아직 일반화 근거가 약해, 실제 소비자가 없는 동안은 남겨 두되 SDK 쪽에서 다시 분류할 수 있다.

## 결과

- #479: SDK에서 되돌릴 부품·테스트·tiptap 의존·allowlist 동등성 검사(#459의 `rich-content-allowlist-parity.test.ts`와 turbo 입력)를 지운다. `packages/ui/AGENTS.md`·소비 문서·`.planning/backlog.md`의 allowlist 행을 고친다.
- FeedbackOps: 로컬 구현을 그대로 두고 SDK에 남는 부품만 `@ap/ui`에서 가져온다(3번 묶음). 마지막에 앱 import를 `@ap/ui`로 옮기고 `@fops/ui`를 지우는 단계는 그 뒤 — 되돌린 부품은 그때도 FeedbackOps 소유 층이다.
- ADR-0046 Open("도메인 결합 부분 분류")는 이 ADR로 닫힌다.
