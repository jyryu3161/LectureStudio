/**
 * Chapter export public API (PRD §5.6, MVP4). PDF is produced client-side by
 * the browser's print pipeline (a print stylesheet + `window.print()`); only
 * the ePub path needs server code, exposed here.
 */
export { buildChapterEpub, epubFilenameStem } from './epub';
export type { EpubChapterInput } from './epub';
export { blocksToXhtmlBody, serializeBlock } from './xhtml';
