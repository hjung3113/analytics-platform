/** Shared copy for replay windows with no known observations. */
export const REPLAY_NO_DATA_MESSAGES = {
  replayNoDataTitle: { ko: '이 구간에는 관측 자료가 없습니다', en: 'No observations in this range' },
  replayNoDataLastData: { ko: '마지막 자료', en: 'Last data' },
};

export type ReplayNoDataCopy = { title: string; lastData: string };
