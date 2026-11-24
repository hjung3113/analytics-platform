import type { Meta, StoryObj } from '@storybook/react-vite';
import { RichEditor } from '@ap/ui';
import { PEOPLE, RICH_DOC } from '../equipment';
import { guidedPage } from '../guidance';

/**
 * 도메인을 모르는 Tiptap JSON 편집기. `surface`가 쓸 수 있는 서식·삽입·툴바를 함께 정하고, 편집 구현은 처음 그릴 때 지연 로딩한다.
 * 첨부 업로드(`onAttach`)와 멘션 이름(`resolveMentionLabel`)은 소비자가 준다.
 */
const meta = {
  title: '폼/RichEditor',
  component: RichEditor,
  args: { surface: 'internal-comment', defaultValue: RICH_DOC, ariaLabel: '내부 메모', placeholder: '메모를 입력하세요', minHeight: 160,
    resolveMentionLabel: (id: string): string | null | undefined => PEOPLE[id] },
  argTypes: { defaultValue: { control: false } },
  decorators: [Story => <div className="w-[640px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/rich-content/RichEditor.tsx',
      page: guidedPage([['docs/contract/components.md', '`surface`의 capability 집합이'], ['docs/contract/components.md', '서버 권한·첨부와 부모 연결·전송 필드·목록은 소비자 책임이다']]),
    },
  },
} satisfies Meta<typeof RichEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 내부 메모(`surface="internal-comment"`): 굵게·목록·멘션. */
export const InternalComment: Story = {};

/** 확장 서식 surface(`voc-description`): 제목 서식이 있는 surface는 기본 툴바를 그린다. 이 surface에 없는 멘션은 빠진다. */
export const Extended: Story = { args: { surface: 'voc-description', ariaLabel: '설명' } };

/** 빈 편집기: placeholder만. */
export const Empty: Story = { args: { defaultValue: undefined } };

/** 비활성. */
export const Disabled: Story = { args: { disabled: true } };
