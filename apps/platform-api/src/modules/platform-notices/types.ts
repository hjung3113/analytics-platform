// Wire and stored shapes of the platform notices module (ADR-0098 §4). The wire `Notice` carries
// no author and no timestamps: the server stamps them internally and never returns them.

export interface LocalizedText {
  ko: string;
  en: string;
}

export interface NoticeDraft {
  title: LocalizedText;
  content: LocalizedText;
  scopeId: string | null;
  /** Naive Asia/Seoul wall-clock `YYYY-MM-DDTHH:mm:ss`. */
  until: string;
}

/** `Notice` of the port: `version` is the opaque `v<revision>`. */
export interface Notice extends NoticeDraft {
  id: string;
  version: string;
}

/** What the Home banner projection carries: no content, author or version. */
export interface HomeNotice {
  id: string;
  title: LocalizedText;
  scopeId: string | null;
  until: string;
}

export type ActionOutcome = 'ok' | 'invalid' | 'conflict' | 'forbidden' | 'not_found' | 'error';

export interface FieldError {
  path: string[];
  code: string;
}

/** `ActionResponse<T>` of the port (contracts adapter/action.ts). Never an `ApiResponse`. */
export interface ActionAnswer<T> {
  outcome: ActionOutcome;
  data: T | null;
  version: string | null;
  fieldErrors: FieldError[];
  replayed: boolean;
  correlationId: string;
  message?: string;
}

export const versionOf = (revision: number) => `v${revision}`;
