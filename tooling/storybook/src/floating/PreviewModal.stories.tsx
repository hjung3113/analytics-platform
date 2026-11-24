import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreviewModal } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 보내기 전 결과를 받는 사람 눈으로 보여 주는 모달. 제목과 미리보기 내용만 받고, 닫기(X·Escape·바깥 클릭)는 `onClose` 하나로 온다. */
const meta = {
  title: '떠 있는 표면/PreviewModal',
  component: PreviewModal,
  args: { open: true, onClose: () => {}, title: '공지 미리보기 — 설비 담당자 화면' },
  argTypes: { children: { control: false } },
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 360 },
      subtitle: '@ap/ui · packages/sdk/ui/src/feedback/PreviewModal.tsx',
      page: guidedPage(),
    },
  },
  render: args => <PreviewModal {...args}>
    <p className="t-card-title mb-2">11월 정기 보전 일정</p>
    <p className="text-sm text-text-secondary">11-20(금) 22:00부터 6시간 동안 식각 2라인(EQ-0142·EQ-0408·EQ-0604)을 세웁니다.</p>
  </PreviewModal>,
} satisfies Meta<typeof PreviewModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 열린 미리보기. */
export const Open: Story = {};
