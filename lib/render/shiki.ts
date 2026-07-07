/**
 * SERVER-ONLY: Shiki syntax highlighting for `code` blocks.
 *
 * Shiki's highlighter is expensive to instantiate (loads WASM + grammar
 * files), so it must not be re-created per block or per request. This module
 * keeps exactly one instance per server process behind a module-level
 * singleton promise -- the first caller pays the load cost, every
 * subsequent call (this request or a later one) reuses the same instance.
 */
import { createHighlighter, type Highlighter } from 'shiki';

const THEME = 'github-light';

/**
 * Curated set of languages eagerly bundled into the shared highlighter.
 * Lecture content is expected to stick to common teaching languages; a
 * `lang` outside this list (or missing entirely) falls back to plain,
 * un-highlighted-but-still-escaped text (see `highlightCode`) instead of
 * failing the block -- one unusual language tag must not break a chapter.
 */
const SUPPORTED_LANGS = [
  'python',
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'bash',
  'shell',
  'json',
  'html',
  'css',
  'c',
  'cpp',
  'java',
  'sql',
  'yaml',
  'markdown',
  'r',
  'go',
  'rust',
  'php',
  'ruby',
] as const;

/** Shiki's own "no grammar needed" language ids -- always safe to request. */
const PLAIN_LANGS = new Set<string>(['text', 'plaintext', 'txt', 'plain']);

let highlighterPromise: Promise<Highlighter> | null = null;

function getSharedHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [THEME], langs: [...SUPPORTED_LANGS] });
  }
  return highlighterPromise;
}

/**
 * Server-highlights `code` to an HTML string using the shared highlighter.
 * Never throws: an unrecognized/missing `lang` (or, defensively, any other
 * highlighting failure) degrades to plain escaped text rather than breaking
 * the block's render.
 */
export async function highlightCode(code: string, lang: string | null | undefined): Promise<string> {
  const highlighter = await getSharedHighlighter();
  const requested = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
  const resolvedLang =
    requested && (PLAIN_LANGS.has(requested) || highlighter.getLoadedLanguages().includes(requested))
      ? requested
      : 'text';

  try {
    return highlighter.codeToHtml(code, { lang: resolvedLang, theme: THEME });
  } catch {
    return highlighter.codeToHtml(code, { lang: 'text', theme: THEME });
  }
}
