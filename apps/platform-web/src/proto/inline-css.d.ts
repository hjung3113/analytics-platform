// PROTOTYPE (#52): Vite `?inline` CSS imports (no vite/client reference in this app).
declare module '*.css?inline' {
  const css: string;
  export default css;
}
