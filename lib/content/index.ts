/**
 * Content Engine public API — server-only (see parse.ts). Parses MyST
 * source into an AST, extracts stable-id'd top-level Blocks (PRD §5.2/§5.3),
 * and writes the block index through to Supabase.
 */
export {
  blockTypeOf,
  deriveBlockMetadata,
  hashBlockSource,
  sha256,
  visibilityForBlockType,
} from './blocks';
export { customDirectives } from './directives';
export type { UpsertBlockIndexResult } from './db';
export { upsertBlockIndex } from './db';
export { normalizeBareDirectives } from './normalize';
export { parse, parseWithWarnings } from './parse';
export { ensureStableIds } from './stable-ids';
export type {
  Block,
  BlockType,
  BlockVisibility,
  EnsureStableIdsResult,
  ParseResult,
  ParseWarning,
  SourceRange,
} from './types';
