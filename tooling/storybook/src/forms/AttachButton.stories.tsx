import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttachButton } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 편집기 도구줄의 첨부 버튼: 파일 고르기 창을 열고 고른 파일을 `onPick`에 넘긴다. Promise를 돌려주면 끝날 때까지 도는 표시를 보이고, 오류 알림은 호출자가 한다. */
const meta = {
  title: '폼/AttachButton',
  component: AttachButton,
  args: { onPick: () => new Promise(resolve => setTimeout(resolve, 1500)), accept: 'image/*,.pdf', showTooltip: true },
  argTypes: { onPick: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/ui · packages/sdk/ui/src/rich-content/toolbar/AttachButton.tsx',
    page: guidedPage(),
  } },
} satisfies Meta<typeof AttachButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 접근 이름 «첨부 파일 추가», 이미지·PDF만. */
export const Default: Story = {};
/** `disabled`: 첨부를 받지 않는 surface. */
export const Disabled: Story = { args: { disabled: true } };
