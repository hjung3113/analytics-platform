/** Vite's deployment base, read only at the app composition root. */
interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean; // THROWAWAY #423 — never merge.
}
