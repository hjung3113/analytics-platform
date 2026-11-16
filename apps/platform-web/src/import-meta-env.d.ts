// No vite/client reference exists in this app, so ImportMeta.env is declared here and only the one
// key this app reads is listed (main.tsx base path).
interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
