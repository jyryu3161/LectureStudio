import { describe, expect, it } from 'vitest';

import {
  remapBlockMetadataDemoId,
  remapDemoDirectives,
  remapSourceMarkers,
  rewriteChapterSource,
} from '@/lib/courses/rewrite';

// A realistic slice of a chapter's canonical MyST source: stable-id marker
// comments preceding blocks, plus an interactive-demo directive whose argument
// is a marimo_apps id — the two things multi-term duplication must rewrite.
const SOURCE = [
  '<!-- blk:blk_-oRQ7XWbXUkCe2i27iIZn -->',
  '# 병합 정렬',
  '',
  '<!--   blk:blk_Jfx4V8sMZn-3r8dkpYjgA   -->',
  '```python',
  "print('blk:blk_not_a_marker inside code stays literal')",
  '```',
  '',
  '<!-- blk:blk_TLGSMdrgw-hxzPcnrdM6L -->',
  ':::{interactive-demo} 49e12a9a-7286-4f65-a9da-740133b8783f',
  '슬라이더 데모',
  ':::',
  '',
].join('\n');

const BLOCK_MAP = new Map<string, string>([
  ['blk_-oRQ7XWbXUkCe2i27iIZn', 'blk_NEWheadingId000000000'],
  ['blk_Jfx4V8sMZn-3r8dkpYjgA', 'blk_NEWcodeId0000000000000'],
  ['blk_TLGSMdrgw-hxzPcnrdM6L', 'blk_NEWdemoBlockId00000000'],
]);

const DEMO_MAP = new Map<string, string>([
  ['49e12a9a-7286-4f65-a9da-740133b8783f', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
]);

describe('remapSourceMarkers', () => {
  it('rewrites every marker to its mapped id in canonical form', () => {
    const out = remapSourceMarkers(SOURCE, BLOCK_MAP);
    expect(out).toContain('<!-- blk:blk_NEWheadingId000000000 -->');
    // Tolerates non-canonical whitespace in the input, emits canonical output.
    expect(out).toContain('<!-- blk:blk_NEWcodeId0000000000000 -->');
    expect(out).toContain('<!-- blk:blk_NEWdemoBlockId00000000 -->');
    // No old ids remain as markers.
    expect(out).not.toContain('blk:blk_-oRQ7XWbXUkCe2i27iIZn');
    expect(out).not.toContain('blk:blk_Jfx4V8sMZn-3r8dkpYjgA');
  });

  it('leaves non-marker text (incl. code content) untouched', () => {
    const out = remapSourceMarkers(SOURCE, BLOCK_MAP);
    expect(out).toContain('# 병합 정렬');
    // The `blk:` substring inside a code sample is not an HTML-comment marker,
    // so it is not rewritten.
    expect(out).toContain("print('blk:blk_not_a_marker inside code stays literal')");
  });

  it('leaves an unmapped marker id unchanged', () => {
    const out = remapSourceMarkers('<!-- blk:blk_unknownXXXXXXXXX -->', BLOCK_MAP);
    expect(out).toBe('<!-- blk:blk_unknownXXXXXXXXX -->');
  });
});

describe('remapDemoDirectives', () => {
  it('rewrites the interactive-demo app id argument', () => {
    const out = remapDemoDirectives(SOURCE, DEMO_MAP);
    expect(out).toContain(':::{interactive-demo} aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(out).not.toContain('49e12a9a-7286-4f65-a9da-740133b8783f');
  });

  it('leaves an unmapped demo id unchanged', () => {
    const src = ':::{interactive-demo} 11111111-2222-3333-4444-555555555555';
    expect(remapDemoDirectives(src, DEMO_MAP)).toBe(src);
  });
});

describe('rewriteChapterSource', () => {
  it('applies both marker and demo remaps together', () => {
    const out = rewriteChapterSource(SOURCE, BLOCK_MAP, DEMO_MAP);
    expect(out).toContain('<!-- blk:blk_NEWdemoBlockId00000000 -->');
    expect(out).toContain(':::{interactive-demo} aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(out).not.toContain('blk_TLGSMdrgw-hxzPcnrdM6L');
    expect(out).not.toContain('49e12a9a-7286-4f65-a9da-740133b8783f');
  });
});

describe('remapBlockMetadataDemoId', () => {
  it('remaps metadata.appId for interactive-demo blocks', () => {
    const out = remapBlockMetadataDemoId(
      { appId: '49e12a9a-7286-4f65-a9da-740133b8783f' },
      DEMO_MAP,
    );
    expect(out).toEqual({ appId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
  });

  it('preserves other metadata keys and shapes untouched', () => {
    expect(remapBlockMetadataDemoId({ lang: 'python', executable: true }, DEMO_MAP)).toEqual({
      lang: 'python',
      executable: true,
    });
    expect(remapBlockMetadataDemoId(null, DEMO_MAP)).toBeNull();
    expect(remapBlockMetadataDemoId({ depth: 2 }, DEMO_MAP)).toEqual({ depth: 2 });
  });

  it('leaves an unmapped appId unchanged', () => {
    const meta = { appId: '11111111-2222-3333-4444-555555555555' };
    expect(remapBlockMetadataDemoId(meta, DEMO_MAP)).toEqual(meta);
  });
});
