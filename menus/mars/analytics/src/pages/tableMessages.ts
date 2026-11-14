export const PRODUCTIVITY_TABLE_MESSAGES = {
  ko: { stgroup: 'StGroup', caption: '공정별 점유 시간 · 관측 가능 시간 표', process: '공정', occupied: '점유 시간 (분자)', observable: '관측 가능 시간 (분모)', occupancy: '점유율', jobs: '완료 Job', enter: '들어가기', unknown: '미확인', enterRow: (key: string) => `${key} 들어가기` },
  en: { stgroup: 'StGroup', caption: 'Occupied and observable hours by process', process: 'Process', occupied: 'Occupied h (numerator)', observable: 'Observable h (denominator)', occupancy: 'Occupancy', jobs: 'Jobs', enter: 'Enter', unknown: 'Not confirmed', enterRow: (key: string) => `Enter ${key}` },
};
