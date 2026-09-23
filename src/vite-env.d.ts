/// <reference types="vite/client" />

declare module 'virtual:sqlite-wasm-bytes' {
  const base64: string;
  export default base64;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}
