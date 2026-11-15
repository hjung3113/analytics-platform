// No vite/client reference exists in this app, so ImportMeta.env is declared here and only the one
// keys read at the composition root are listed here.
interface ImportMetaEnv {
  readonly BASE_URL: string;
  /** #2339 removable synthetic layer samples; omitted in the normal assembly. */
  readonly VITE_PAGE_CONDITION_SAMPLES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
