/**
 * EPUB3 export for a single chapter (PRD §5.6 MVP4). Builds a valid OCF zip
 * with JSZip: `mimetype` (stored, first), META-INF/container.xml, and an
 * OEBPS package (content.opf + nav.xhtml + chapter.xhtml).
 *
 * SECURITY / EXPORT INVARIANT (PRD §5.6): the chapter body is produced by
 * `blocksToXhtmlBody`, which filters to PUBLIC-visibility blocks only,
 * unconditionally -- `instructor-note` content is stripped here regardless of
 * who requests the export. See lib/export/xhtml.ts.
 *
 * Server-only: `ensureStableIds` transitively imports the myst parser (ESM,
 * Node-oriented). Call this from a Node route handler / script / test, never
 * a browser bundle.
 */
import { randomUUID } from 'node:crypto';

import JSZip from 'jszip';

import { ensureStableIds } from '@/lib/content';

import { blocksToXhtmlBody, escapeText } from './xhtml';

export interface EpubChapterInput {
  /** Course title -> used as the book's dc:creator (author-of-work). */
  courseTitle: string;
  /** Optional course code/subtitle, appended to the creator label. */
  courseSubtitle?: string | null;
  /** Chapter title -> the book's dc:title. */
  chapterTitle: string;
  /** Raw MyST source of the chapter (chapters.source). */
  source: string;
  /** BCP-47 language tag; defaults to Korean per the product's KO-first UI. */
  language?: string;
}

const GENERATOR = 'Lecture Studio';

/** EPUB3 `dcterms:modified` must be `YYYY-MM-DDThh:mm:ssZ` (no milliseconds). */
function epubTimestamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function contentOpf(opts: {
  title: string;
  creator: string;
  language: string;
  identifier: string;
  modified: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeText(
    opts.language,
  )}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${opts.identifier}</dc:identifier>
    <dc:title>${escapeText(opts.title)}</dc:title>
    <dc:language>${escapeText(opts.language)}</dc:language>
    <dc:creator>${escapeText(opts.creator)}</dc:creator>
    <meta property="dcterms:modified">${opts.modified}</meta>
    <meta name="generator" content="${escapeText(GENERATOR)}"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`;
}

function navXhtml(opts: { title: string; language: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeText(
    opts.language,
  )}" xml:lang="${escapeText(opts.language)}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeText(opts.title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>
      <li><a href="chapter.xhtml">${escapeText(opts.title)}</a></li>
    </ol>
  </nav>
</body>
</html>`;
}

function chapterXhtml(opts: { title: string; language: string; body: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeText(
    opts.language,
  )}" xml:lang="${escapeText(opts.language)}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeText(opts.title)}</title>
</head>
<body>
  <section epub:type="chapter">
    <h1>${escapeText(opts.title)}</h1>
${opts.body}
  </section>
</body>
</html>`;
}

/**
 * Build a complete `.epub` byte payload for one chapter. Returns a
 * `Uint8Array` suitable for a `Response` body or writing to disk.
 */
export async function buildChapterEpub(input: EpubChapterInput): Promise<Uint8Array> {
  const language = input.language?.trim() || 'ko';
  const title = input.chapterTitle.trim() || 'Untitled chapter';
  const creator = input.courseSubtitle
    ? `${input.courseTitle} (${input.courseSubtitle})`
    : input.courseTitle;

  // Parse -> stable-id'd Blocks, then serialize STUDENT-visible blocks only
  // (the export invariant lives in blocksToXhtmlBody).
  const { blocks } = ensureStableIds(input.source);
  const body = blocksToXhtmlBody(blocks);

  const zip = new JSZip();

  // OCF requirement: `mimetype` must be the FIRST entry and STORED
  // (uncompressed). JSZip preserves insertion order, so add it first.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', containerXml());
  zip.file(
    'OEBPS/content.opf',
    contentOpf({
      title,
      creator,
      language,
      identifier: randomUUID(),
      modified: epubTimestamp(),
    }),
  );
  zip.file('OEBPS/nav.xhtml', navXhtml({ title, language }));
  zip.file('OEBPS/chapter.xhtml', chapterXhtml({ title, language, body }));

  // DEFLATE is the default for the remaining entries; the per-file STORE on
  // `mimetype` above takes precedence for that one entry.
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    mimeType: 'application/epub+zip',
  });
}

/** Slugify a chapter/course title into an ASCII-safe filename stem. */
export function epubFilenameStem(chapterTitle: string): string {
  const ascii = chapterTitle
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return ascii || 'chapter';
}
