# ADR-0161 — 폼 필드는 도움말을 항상 보이고 오류를 그 아래에 더하는 렌더 함수 조각 `FormField`로 둔다

- 상태: Decided (2026-11-14, 되돌릴 수 있음). 이슈 [#1890](https://github.com/hjung3113/analytics-platform/issues/1890) 항목 3.
- 결정자: 소유자 — 시안 결정을 Opus(high) 리뷰에 맡겼고 리뷰가 레인 추천(오류가 도움말을 대신)을 뒤집었다(2026-11-14).
- 계약 원천: [components.md §13 FormField](../contract/components.md#formfield--라벨입력도움말오류-decided-1890-adr-0160).

## 맥락

- 라벨 + 입력 + 도움말 + 오류의 같은 묶음을 메뉴가 일곱 번 손으로 만들었다. 간격(4·6·8px), 라벨 조각, 도움말 처리, `aria-describedby` 연결이 사본마다 다르다.
- 플랫폼의 오류 문구는 일반 코드에서 나와(예: `too_long` → 「입력 길이가 너무 깁니다」) 고치는 방법을 담지 못한다.

## 결정

1. **조각을 둔다.** `@ap/ui`의 `FormField`(`forms/`)는 라벨(`FieldLabel` 재사용) → 입력 → 도움말 → 오류 순서다. 입력은 렌더 함수가 받는 `control`(`id`·`aria-describedby`·`aria-invalid`·`aria-required`)을 입력에 펼친다. 한 개의 라벨 가능한 입력만 받는다.
2. **도움말은 항상 보인다.** 오류가 나도 도움말은 그대로 있고 `aria-describedby`에 남으며 오류 id가 그 뒤에 붙는다. 이유: 오류 문구가 고칠 방법을 담지 못해 사용자가 도움말(「30자 이하」)을 오류 순간에 가장 필요로 한다. 도움말을 바꿔치는 시스템(Carbon·Spectrum·MUI)은 오류 문구가 고칠 방법을 반복한다고 전제하는데 이 플랫폼은 그렇지 않다. GOV.UK·shadcn Form은 둘 다 보인다.
3. **오류에 live role을 쓰지 않는다.** 일반 `<p class="text-xs text-text-danger-label break-keep">`다. 여러 필드가 한꺼번에 오류를 내므로(§26/§19의 한 알림자 규칙) 필드마다 알리지 않고, 제출하면 첫 잘못된 입력으로 포커스를 옮긴다. 호출하는 쪽이 제출·칸을 벗어날 때 `error`를 넣는다.
4. **오류 테두리는 각 입력이 칠한다.** `Input`·`Textarea`·`SelectTrigger`·`Combobox` 트리거는 `aria-invalid:border-accent-danger`, `MultiCombobox`는 바깥 div가 `has-[[aria-invalid=true]]:border-accent-danger`다. 감싸개가 칠하지 않아 `FormField` 밖의 입력도 `aria-invalid`만으로 같은 모양이 된다.
5. **`aria-required`가 입력에 닿는다.** `Combobox`는 트리거 button에 전달한다. `MultiCombobox`의 button에는 넘기지 않고 라벨의 `*`로 알린다.

## 대안

- 오류가 도움말을 대신한다(레인 추천): 줄이 늘지 않으나 도움말을 오류 순간에 잃는다. 대부분 필드는 도움말이 없어 높이 이점도 작다. 채택하지 않음.
- `cloneElement`로 자식에 주입: `Select`처럼 입력이 한 단계 안에 있거나 입력이 여럿인 조각에 닿지 못한다. 렌더 함수가 맞다.

## 결과

- 기본 동작을 바꾸지 않는 추가 API다. 기존 입력은 `aria-invalid`가 있을 때만 테두리가 달라진다.
- 메뉴 사본 일곱 곳의 이전은 이 작업에 넣지 않았다(`.planning/backlog.md`). 한 곳(log-knowledge 판단 변경의 「사유」)을 옮겨 API를 증명했다.
