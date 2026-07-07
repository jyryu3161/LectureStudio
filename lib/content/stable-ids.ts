import type { GenericNode, GenericParent } from 'myst-common';
import { nanoid } from 'nanoid';

import {
  blockTypeOf,
  deriveBlockMetadata,
  hashBlockSource,
  visibilityForBlockType,
} from './blocks';
import { parse } from './parse';
import type { Block, EnsureStableIdsResult } from './types';

/**
 * Stable-id marker carrier (PRD §5.3). A standalone HTML comment on its own
 * line survives MyST round-trips as a distinct top-level `html` node
 * (verified empirically) immediately preceding the block it labels, without
 * altering how the block itself parses or renders.
 */
const MARKER_PREFIX = 'blk_';
const MARKER_RE = /^<!--\s*blk:(blk_[A-Za-z0-9_-]+)\s*-->$/;

function markerComment(id: string): string {
  return `<!-- blk:${id} -->`;
}

interface RawEntry {
  node: GenericNode;
  /** id read from an immediately-preceding marker comment, if any. */
  existingId: string | null;
}

/**
 * Walks top-level nodes, pairing each marker comment with the content node
 * that immediately follows it. Marker nodes themselves are not blocks and
 * are excluded from the result. A duplicate marker id (e.g. from a
 * copy-pasted block) is treated as "no id" for the second occurrence so it
 * mints a fresh one instead of silently colliding with the first block's id
 * in the DB.
 */
function extractRawEntries(tree: GenericParent): RawEntry[] {
  const entries: RawEntry[] = [];
  const seenIds = new Set<string>();
  let pendingId: string | null = null;

  for (const node of tree.children) {
    if (node.type === 'html' && typeof node.value === 'string') {
      const match = MARKER_RE.exec(node.value.trim());
      if (match) {
        pendingId = match[1];
        continue;
      }
    }

    let id = pendingId;
    if (id !== null && seenIds.has(id)) {
      id = null;
    }
    entries.push({ node, existingId: id });
    if (id !== null) seenIds.add(id);
    pendingId = null;
  }

  return entries;
}

function buildBlocks(entries: RawEntry[], sourceLines: string[]): Block[] {
  return entries.map((entry, index) => {
    const blockType = blockTypeOf(entry.node);
    // Every entry is expected to have an id by the time this runs (see
    // ensureStableIds below); the `?? mint` fallback only guards against a
    // future refactor accidentally calling this with unresolved entries.
    const id = entry.existingId ?? `${MARKER_PREFIX}${nanoid()}`;
    return {
      id,
      blockType,
      order: index,
      visibility: visibilityForBlockType(blockType),
      contentHash: hashBlockSource(sourceLines, entry.node),
      sourceRange: entry.node.position ?? null,
      metadata: deriveBlockMetadata(entry.node),
      node: entry.node,
    };
  });
}

/**
 * Idempotently ensures every top-level block in `source` has a stable id
 * (PRD §5.3):
 *  - a block with an existing `<!-- blk:blk_xxx -->` marker keeps that id;
 *  - a block with no marker gets a freshly minted `blk_`+nanoid id, which
 *    is written back into the returned source as a marker comment
 *    immediately before it.
 *
 * IDs depend only on the marker text, never on content/position/order:
 * reordering two whole marker+block chunks preserves both ids (and swaps
 * `order`); editing a block's own text preserves its id and only changes
 * `contentHash`. Calling this again on its own output is a no-op (same
 * source string, same ids, same hashes).
 */
export function ensureStableIds(source: string): EnsureStableIdsResult {
  // Canonicalize line endings up front so line-based slicing/splicing below
  // stays exact and round-trips byte-for-byte on a second call.
  const normalizedSource = source.replace(/\r\n/g, '\n');

  const firstTree = parse(normalizedSource);
  const firstPassEntries = extractRawEntries(firstTree);
  const missingIds = firstPassEntries.some((entry) => entry.existingId === null);

  if (!missingIds) {
    const sourceLines = normalizedSource.split('\n');
    return { source: normalizedSource, blocks: buildBlocks(firstPassEntries, sourceLines) };
  }

  // Insert markers for the blocks that need them. Insert from the bottom of
  // the document up so earlier (still-pending) insertion line numbers stay
  // valid as splices shift everything below them.
  const lines = normalizedSource.split('\n');
  const insertions = firstPassEntries
    .filter((entry) => entry.existingId === null)
    .map((entry) => ({
      id: `${MARKER_PREFIX}${nanoid()}`,
      line: entry.node.position?.start.line ?? 1,
    }))
    .sort((a, b) => b.line - a.line);

  for (const { id, line } of insertions) {
    lines.splice(line - 1, 0, markerComment(id));
  }
  const finalSource = lines.join('\n');

  // Re-parse the final source so ids and positions both come from one
  // consistent, authoritative pass instead of hand-adjusting offsets.
  const finalTree = parse(finalSource);
  const finalEntries = extractRawEntries(finalTree);
  const sourceLines = finalSource.split('\n');

  return { source: finalSource, blocks: buildBlocks(finalEntries, sourceLines) };
}
