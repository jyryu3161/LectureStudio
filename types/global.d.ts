// Ambient module declarations for assets that don't ship their own types.
// Next.js's own ambient types (next/types/global.d.ts) only cover CSS
// Modules (*.module.css); plain global stylesheet side-effect imports
// (e.g. `import './globals.css'` or `import 'katex/dist/katex.min.css'`)
// need this wildcard declaration so `tsc --noEmit` can resolve them.
declare module '*.css';
