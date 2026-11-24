import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Download, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@ap/ui';
import { guidedPage } from '../guidance';

const VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'toggle', 'ghost', 'navigation', 'link'] as const;
const SIZES = ['sm', 'md', 'lg', 'toolbar'] as const;

/** 동작을 실행하는 기본 버튼. 크기·변형은 공유 variant에서 고른다. */
const meta = {
  title: '폼/Button',
  component: Button,
  args: { children: '적용' },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/Button.tsx',
      page: guidedPage(
        [['DESIGN.md', '크기도 공유 variant로 고른다'], ['DESIGN.md', 'primary 강조를 주요 동작'], ['docs/contract/components.md', '`Button.disabledReason?: ReactNode`는']],
        [['DESIGN.md', '버튼·input을 독자적으로 재설계하지 않는다'], ['DESIGN.md', '두 번째 brand CTA'], ['DESIGN.md', '실제 비활성·busy도']],
      ),
    },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본(primary) 버튼. 화면의 주요 동작 하나에만 쓴다. */
export const Default: Story = {};

/** 변형 여덟 가지를 크기별로 나란히 본다. */
export const VariantsBySize: Story = {
  render: () => <div className="grid gap-3">{SIZES.map(size => <div key={size} className="flex items-center gap-2">
    <span className="t-mono w-16 text-text-muted">{size}</span>
    {VARIANTS.map(variant => <Button key={variant} variant={variant} size={size}>{variant}</Button>)}
  </div>)}</div>,
};

/** 켜고 끄는 도구 버튼: `variant="toggle"`과 `aria-pressed`. 눌러서 상태를 바꿔 본다. */
export const Toggle: Story = {
  render: function ToggleStory() {
    const [pressed, setPressed] = useState(true);
    return <div className="flex gap-2">
      <Button variant="toggle" size="toolbar" aria-pressed={pressed} onClick={() => setPressed(!pressed)}><Filter className="size-4" aria-hidden />필터 {pressed ? '켜짐' : '꺼짐'}</Button>
      <Button variant="toggle" size="toolbar" aria-pressed={false}>꺼진 상태</Button>
    </div>;
  },
};

/** 비활성은 `disabledReason`으로 이유를 함께 보인다. */
export const Disabled: Story = { args: { disabled: true, disabledReason: '조회 기간을 먼저 고르세요.' } };

/** 처리 중: `loading`이면 스피너를 보이고 `aria-busy`로 알린다. */
export const Busy: Story = { args: { loading: true, children: '저장 중' } };

/** 아이콘 버튼 `icon-sm`·`icon-xs`. 보이는 글이 없으니 `aria-label`을 단다. */
export const IconButtons: Story = {
  render: () => <div className="flex items-center gap-2">
    <Button variant="ghost" size="icon-sm" aria-label="새로 고침"><RefreshCw className="size-4" aria-hidden /></Button>
    <Button variant="secondary" size="icon-sm" aria-label="내보내기"><Download className="size-4" aria-hidden /></Button>
    <Button variant="ghost" size="icon-xs" aria-label="필터"><Filter className="size-3.5" aria-hidden /></Button>
  </div>,
};
