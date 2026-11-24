import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './storybook.css';
import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    options: { storySort: { order: ['기초', ['원칙', '색', '글자', '간격·모서리·그림자·모션'], '폼', '템플릿'] } },
    controls: { expanded: true },
  },
};
export default preview;
