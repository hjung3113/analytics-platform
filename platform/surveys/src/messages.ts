import type { Text } from '@ap/contracts';

export const SURVEYS_MESSAGES = {

  // SurveyChildPage
  surveyChildPageSurveyNotFound: { ko: '설문을 찾을 수 없습니다', en: 'Survey not found' },
  surveyChildPageTheSurveyIDInTheAddressIs: { ko: '주소의 설문 ID가 올바르지 않습니다.', en: 'The Survey ID in the address is not valid.' },
} satisfies Record<string, Text>;
