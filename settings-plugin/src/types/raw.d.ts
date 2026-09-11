// Vite returns the file's text for `?raw` imports.
declare module "*?raw" {
  const source: string;
  export default source;
}
