import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildChapterEpub } from '@/lib/export';

/**
 * PRD §5.6 (MVP4) ePub export acceptance: a valid EPUB3 OCF container AND the
 * export invariant -- instructor-only content is stripped server-side
 * regardless of the requester.
 */

const INSTRUCTOR_SECRET = 'CONFIDENTIAL grading rubric only instructors may read';
const PUBLIC_TEXT = 'Merge sort splits the array in half recursively';

const FIXTURE_SOURCE = `# 병합 정렬

${PUBLIC_TEXT}.

:::{instructor-note}
${INSTRUCTOR_SECRET}
:::

:::lecture-summary
분할 정복으로 배열을 정렬한다.
:::

\`\`\`python
def merge_sort(a):
    return a
\`\`\`

$$ T(n) = 2T(n/2) + O(n) $$
`;

async function buildFixture(): Promise<Uint8Array> {
  return buildChapterEpub({
    courseTitle: '알고리즘',
    courseSubtitle: 'CS-201',
    chapterTitle: '병합 정렬',
    source: FIXTURE_SOURCE,
  });
}

describe('buildChapterEpub - OCF structure', () => {
  it('places mimetype first and STORED (uncompressed)', async () => {
    const bytes = await buildFixture();
    const raw = Buffer.from(bytes);

    // Local file header signature PK\x03\x04 for the very first entry.
    expect(raw.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // Compression method (offset 8) must be 0 = STORED.
    expect(raw.readUInt16LE(8)).toBe(0);
    // Filename (offset 30, no extra field) is exactly "mimetype".
    expect(raw.subarray(30, 38).toString('ascii')).toBe('mimetype');
    // ...immediately followed by its uncompressed payload.
    expect(raw.subarray(38, 58).toString('ascii')).toBe('application/epub+zip');
  });

  it('contains the required EPUB3 entries', async () => {
    const bytes = await buildFixture();
    const zip = await JSZip.loadAsync(bytes);

    expect(zip.file('mimetype')).not.toBeNull();
    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/content.opf')).not.toBeNull();
    expect(zip.file('OEBPS/nav.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/chapter.xhtml')).not.toBeNull();
  });

  it('writes well-formed container.xml + opf metadata (title, ko language, generator)', async () => {
    const bytes = await buildFixture();
    const zip = await JSZip.loadAsync(bytes);

    const container = await zip.file('META-INF/container.xml')!.async('string');
    expect(container).toContain('full-path="OEBPS/content.opf"');

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>병합 정렬</dc:title>');
    expect(opf).toContain('<dc:language>ko</dc:language>');
    expect(opf).toContain('name="generator"');
    expect(opf).toContain('dcterms:modified');
  });
});

describe('buildChapterEpub - export invariant (PRD §5.6)', () => {
  it('strips instructor-note content from the chapter XHTML', async () => {
    const bytes = await buildFixture();
    const zip = await JSZip.loadAsync(bytes);
    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('string');

    // Public content survives; the instructor-only note never appears.
    expect(chapter).toContain(PUBLIC_TEXT);
    expect(chapter).not.toContain(INSTRUCTOR_SECRET);
  });

  it('serializes public blocks (code + equation) into the chapter XHTML', async () => {
    const bytes = await buildFixture();
    const zip = await JSZip.loadAsync(bytes);
    const chapter = await zip.file('OEBPS/chapter.xhtml')!.async('string');

    expect(chapter).toContain('def merge_sort');
    expect(chapter).toContain('T(n) = 2T(n/2)');
    // Chapter title heading is present.
    expect(chapter).toContain('병합 정렬');
  });
});
