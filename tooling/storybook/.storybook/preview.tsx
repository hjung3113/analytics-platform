import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './storybook.css';
import type { Preview } from '@storybook/react-vite';
import { withPlatform } from '../src/platform';

const preview: Preview = {
  decorators: [withPlatform],
  tags: ['autodocs'],
  parameters: {
    options: { storySort: { order: ['기초', ['원칙', '색', '글자', '간격·모서리·그림자·모션'], '폼', '표 데이터', '표시', '떠 있는 표면', '데이터 시각화', ['개요', 'Chart Frame', 'AnalysisChart', 'LaneTimeline', 'OrderedIntervalTrack', 'LegendTree', 'MatrixEmphasisBar'],
      '템플릿', ['Overview', 'Analysis Workspace', 'Management', 'Catalog', 'Workflow']] } },
    controls: { expanded: true },
  },
};
export default preview;
