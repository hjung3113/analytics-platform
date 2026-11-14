import type { Text } from '@ap/contracts';

export const MY_ACTIVITY_MESSAGES = {

  // MyVoc
  myVocTheVOCListDoesNotSupportThe: { ko: 'VOC 목록은 주소의 {key} 조건을 지원하지 않습니다', en: 'The VOC list does not support the {key} condition in the address' },
  myVocTheValueInTheAddressIsNot: { ko: '주소의 {key} 값이 올바르지 않습니다', en: 'The {key} value in the address is not valid' },
  myVocTheConditionWasNeitherAppliedNorChanged: { ko: '조건을 적용하지 않고 그대로 두었습니다. 값을 지우면 목록을 볼 수 있습니다.', en: 'The condition was neither applied nor changed. Clear the value to see the list.' },
  myVocNothingWasSubstituted: { ko: '다른 값으로 바꾸지 않았습니다.', en: 'Nothing was substituted.' },
  myVocClearValue: { ko: '값 지우기', en: 'Clear value' },
  myVocVOCDetails: { ko: 'VOC 상세', en: 'VOC details' },
  myVocPickAVOCInTheListTo: { ko: '목록에서 VOC를 고르면 여기에 보입니다.', en: 'Pick a VOC in the list to read it here.' },
  myVocShowList: { ko: '목록 보기', en: 'Show list' },
  myVocHandleInWorkflow: { ko: '업무 흐름에서 처리', en: 'Handle in workflow' },
  myVocFullPage: { ko: '전체 화면', en: 'Full page' },

  // SurveyRespond
  surveyRespondSurveyNotFound: { ko: '설문을 찾을 수 없습니다', en: 'Survey not found' },
  surveyRespondTheSurveyIDInTheAddressIs: { ko: '주소의 설문 ID가 올바르지 않습니다.', en: 'The survey ID in the address is not valid.' },

  // VocDetail
  vocDetailVOCNotFound: { ko: 'VOC를 찾을 수 없습니다', en: 'VOC not found' },
  vocDetailTheVOCIDInTheAddressIs: { ko: '주소의 VOC ID가 올바르지 않습니다.', en: 'The VOC ID in the address is not valid.' },
} satisfies Record<string, Text>;
