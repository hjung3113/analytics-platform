import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecoverButton } from '@ap/components';
import { guidedPage } from '../guidance';

/** 잘못된 값 안내의 «초기화» 버튼. 안내와 함께 사라지므로 포커스를 페이지 대체 지점으로 옮긴 뒤 `onRecover`가 키를 지운다. */
const meta = {
  title: '표시/RecoverButton',
  component: RecoverButton,
  args: { onRecover: () => undefined },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/state/RecoverButton.tsx',
    page: guidedPage([['docs/contract/components.md', '`RecoverButton.primary?: boolean`은']]),
  } },
} satisfies Meta<typeof RecoverButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본(보조 버튼, «초기화»). */
export const Default: Story = {};
/** `primary`: 공유 조회 복구에서 한 동작을 기본 버튼으로 강조한다. */
export const Primary: Story = { args: { primary: true, label: '조건 초기화' } };
