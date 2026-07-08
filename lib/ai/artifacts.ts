/**
 * AI artifact lifecycle — SERVER ONLY (PRD §9.2 draft gate).
 *
 * generateArtifact → always stores a status='draft' row BEFORE any use; the
 * draft never touches chapters.source. Only approveArtifact inserts the output
 * MyST into the source (via the same ensureStableIds + upsertBlockIndex pipeline
 * the Authoring Studio save uses, so existing block ids are preserved) and marks
 * the row status='approved'. discardArtifact marks it status='discarded'.
 *
 * Every path re-checks the course author/admin role server-side (a server action
 * is a public endpoint; the client gate is never the only check) and validates
 * its inputs — no silent failures.
 */
import { canEditCourse } from '@/lib/auth/guards';
import { getCourseRole, getCurrentUser } from '@/lib/auth/session';
import { readChapterSource } from '@/lib/chapters/source';
import { ensureStableIds, upsertBlockIndex, type Block } from '@/lib/content';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

/** The request-scoped Supabase client type (createClient is async). */
type ServerClient = Awaited<ReturnType<typeof createClient>>;

import { buildPrompt, formatAnnotationStats } from './prompts';
import { getProvider } from './registry';
import { getActiveProviderConfig } from './settings';
import type {
  AnnotationBlockStat,
  AnnotationContext,
  AnnotationType,
  ArtifactKind,
  GenerateRequest,
} from './types';
import { isArtifactKind } from './types';

/** Cap on how many top-annotated blocks we feed the model (context budget). */
const REVISION_TOP_BLOCKS = 5;

export interface GenerateArtifactInput {
  chapterId: string;
  kind: ArtifactKind;
  instruction: string;
  blockId?: string;
}

export interface AiArtifact {
  id: string;
  courseId: string | null;
  chapterId: string | null;
  blockId: string | null;
  artifactType: ArtifactKind;
  status: 'draft' | 'approved' | 'discarded';
  provider: string;
  model: string | null;
  /** The generated MyST markdown, ready to insert into a chapter. */
  markdown: string;
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
}

/** The jsonb shape stored in ai_artifacts.output. */
interface StoredOutput {
  markdown: string;
}

function extractMarkdown(output: Json): string {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const value = (output as Record<string, Json | undefined>).markdown;
    if (typeof value === 'string') return value;
  }
  return '';
}

/** Maps a raw ai_artifacts row to the clean AiArtifact shape. */
function toArtifact(row: {
  id: string;
  course_id: string | null;
  chapter_id: string | null;
  block_id: string | null;
  artifact_type: string;
  status: string;
  provider: string;
  model: string | null;
  output: Json;
  created_by: string;
  approved_by: string | null;
  created_at: string;
}): AiArtifact {
  return {
    id: row.id,
    courseId: row.course_id,
    chapterId: row.chapter_id,
    blockId: row.block_id,
    artifactType: (isArtifactKind(row.artifact_type) ? row.artifact_type : 'outline') as ArtifactKind,
    status: (row.status as AiArtifact['status']) ?? 'draft',
    provider: row.provider,
    model: row.model,
    markdown: extractMarkdown(row.output),
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  };
}

const ARTIFACT_COLUMNS =
  'id, course_id, chapter_id, block_id, artifact_type, status, provider, model, output, created_by, approved_by, created_at';

/** Slice a block's MyST source out of the chapter source by its line range. */
function blockSourceText(source: string, block: Block): string {
  if (!block.sourceRange) return '';
  const lines = source.split('\n');
  const { start, end } = block.sourceRange;
  return lines.slice(start.line - 1, end.line).join('\n').trim();
}

const ANNOTATION_TYPES: readonly AnnotationType[] = ['pen', 'highlighter', 'text'];

function isAnnotationType(value: unknown): value is AnnotationType {
  return typeof value === 'string' && (ANNOTATION_TYPES as readonly string[]).includes(value);
}

/**
 * Assembles the 'revision-from-annotations' context server-side: aggregates the
 * chapter's PUBLISHED lecture-session annotations per block (count + type mix),
 * takes the top-N most-annotated blocks, and attaches each block's MyST source.
 *
 * The request-scoped client is used deliberately — the requester is already an
 * author/admin (gated above), so RLS permits reading the sessions/annotations;
 * we still filter to `published = true` so the signal reflects delivered
 * lectures (not the instructor's private in-progress ones).
 *
 * Throws a clean '공개된 판서가 없습니다' when the chapter has no published
 * annotations to ground a revision on.
 */
async function assembleAnnotationContext(
  supabase: ServerClient,
  chapterId: string,
  chapterSource: string,
): Promise<AnnotationContext> {
  const { data: sessions, error: sessionsError } = await supabase
    .from('lecture_sessions')
    .select('id')
    .eq('chapter_id', chapterId)
    .eq('published', true);
  if (sessionsError) {
    throw new Error(`Failed to load published lectures: ${sessionsError.message}`);
  }
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) {
    throw new Error('공개된 판서가 없습니다.');
  }

  const { data: annotations, error: annError } = await supabase
    .from('annotations')
    .select('block_id, annotation_type')
    .eq('chapter_id', chapterId)
    .in('lecture_session_id', sessionIds);
  if (annError) {
    throw new Error(`Failed to load annotations: ${annError.message}`);
  }
  const rows = annotations ?? [];
  if (rows.length === 0) {
    throw new Error('공개된 판서가 없습니다.');
  }

  // Aggregate per block: total count + count by annotation_type.
  const perBlock = new Map<string, { count: number; byType: Partial<Record<AnnotationType, number>> }>();
  for (const row of rows) {
    const blockId = row.block_id;
    if (!blockId) continue;
    const entry = perBlock.get(blockId) ?? { count: 0, byType: {} };
    entry.count += 1;
    if (isAnnotationType(row.annotation_type)) {
      entry.byType[row.annotation_type] = (entry.byType[row.annotation_type] ?? 0) + 1;
    }
    perBlock.set(blockId, entry);
  }

  // Resolve each block's current MyST source (ids are preserved by ensureStableIds).
  const { source: stableSource, blocks } = ensureStableIds(chapterSource);
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const topBlocks: AnnotationBlockStat[] = [...perBlock.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, REVISION_TOP_BLOCKS)
    .map(([blockId, agg]) => {
      const block = byId.get(blockId);
      return {
        blockId,
        count: agg.count,
        byType: agg.byType,
        sourceText: block ? blockSourceText(stableSource, block) : '',
      };
    });

  return {
    sessionCount: sessionIds.length,
    totalAnnotations: rows.length,
    blocks: topBlocks,
  };
}

/**
 * Generates an artifact and stores it as a draft (never mutates the chapter).
 * Gated to the chapter's course author/admin.
 */
export async function generateArtifact(input: GenerateArtifactInput): Promise<AiArtifact> {
  const { chapterId, kind, instruction, blockId } = input;

  if (!chapterId || typeof chapterId !== 'string') {
    throw new Error('A chapter id is required.');
  }
  if (!isArtifactKind(kind)) {
    throw new Error(`Unknown artifact kind: ${String(kind)}`);
  }
  if (typeof instruction !== 'string') {
    throw new Error('Instruction must be a string.');
  }
  if (blockId !== undefined && typeof blockId !== 'string') {
    throw new Error('blockId must be a string when provided.');
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('You must be signed in to generate.');
  }

  const supabase = await createClient();
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('id, course_id, title')
    .eq('id', chapterId)
    .maybeSingle();
  if (chapterError) {
    throw new Error(`Failed to load chapter: ${chapterError.message}`);
  }
  if (!chapter) {
    throw new Error('Chapter not found (or you cannot access it).');
  }

  const courseId = chapter.course_id;
  const role = courseId ? await getCourseRole(courseId) : null;
  if (!canEditCourse(role)) {
    throw new Error('You do not have permission to generate for this course.');
  }

  // `chapters.source` is no longer REST-readable (migration 0007). The
  // canEditCourse gate above authorized this author; read the source (grounding
  // for generation) via the elevated helper.
  const chapterSource = (await readChapterSource(chapter.id))?.source ?? '';

  let courseTitle = 'Course';
  if (courseId) {
    const { data: course } = await supabase
      .from('courses')
      .select('title')
      .eq('id', courseId)
      .maybeSingle();
    if (course?.title) courseTitle = course.title;
  }

  // 'revision-from-annotations' needs extra, server-assembled grounding from
  // the chapter's published lecture annotations (stored in source_context for
  // provenance). All other kinds ground on the chapter source alone.
  let annotations: AnnotationContext | undefined;
  let sourceContext = blockId ? `block:${blockId}` : 'chapter';
  if (kind === 'revision-from-annotations') {
    annotations = await assembleAnnotationContext(supabase, chapterId, chapterSource);
    sourceContext = `annotations\n${formatAnnotationStats(annotations)}`;
  }

  const request: GenerateRequest = {
    kind,
    instruction,
    context: {
      courseTitle,
      chapterTitle: chapter.title,
      chapterSource,
      blockId,
      annotations,
    },
  };

  const cfg = await getActiveProviderConfig();
  const provider = getProvider(cfg.provider);
  const built = buildPrompt(request);
  const markdown = await provider.generate(request, { apiKey: cfg.apiKey, model: cfg.model });

  const storedOutput: StoredOutput = { markdown };
  const { data: inserted, error: insertError } = await supabase
    .from('ai_artifacts')
    .insert({
      course_id: courseId,
      chapter_id: chapterId,
      block_id: blockId ?? null,
      artifact_type: kind,
      status: 'draft',
      provider: cfg.provider,
      model: cfg.model,
      prompt: `SYSTEM:\n${built.system}\n\nUSER:\n${built.user}`,
      source_context: sourceContext,
      output: storedOutput as unknown as Json,
      created_by: user.id,
    })
    .select(ARTIFACT_COLUMNS)
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to store draft artifact: ${insertError?.message ?? 'unknown error'}`);
  }
  return toArtifact(inserted);
}

/** Lists artifacts for a chapter, newest first. Gated to course author/admin. */
export async function listArtifacts(chapterId: string): Promise<AiArtifact[]> {
  if (!chapterId || typeof chapterId !== 'string') {
    throw new Error('A chapter id is required.');
  }
  const supabase = await createClient();
  // RLS already restricts rows to author/admin members of the owning course.
  const { data, error } = await supabase
    .from('ai_artifacts')
    .select(ARTIFACT_COLUMNS)
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list artifacts: ${error.message}`);
  }
  return (data ?? []).map(toArtifact);
}

/**
 * Approves a draft: appends its MyST output to chapters.source (position 'end'),
 * re-runs ensureStableIds (existing block ids preserved) + upsertBlockIndex, then
 * marks the row approved. Gated to the course author/admin.
 */
export async function approveArtifact(
  id: string,
  options: { position: 'end' } = { position: 'end' },
): Promise<AiArtifact> {
  if (!id || typeof id !== 'string') {
    throw new Error('An artifact id is required.');
  }
  if (options.position !== 'end') {
    throw new Error(`Unsupported approve position: ${String(options.position)}`);
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('You must be signed in to approve.');
  }

  const supabase = await createClient();
  const { data: artifact, error: loadError } = await supabase
    .from('ai_artifacts')
    .select(`${ARTIFACT_COLUMNS}, status`)
    .eq('id', id)
    .maybeSingle();
  if (loadError) {
    throw new Error(`Failed to load artifact: ${loadError.message}`);
  }
  if (!artifact) {
    throw new Error('Artifact not found (or you cannot access it).');
  }
  if (artifact.status !== 'draft') {
    throw new Error(`Only a draft can be approved (this one is "${artifact.status}").`);
  }
  if (!artifact.chapter_id) {
    throw new Error('Artifact is not attached to a chapter.');
  }

  const role = artifact.course_id ? await getCourseRole(artifact.course_id) : null;
  if (!canEditCourse(role)) {
    throw new Error('You do not have permission to approve for this course.');
  }

  const markdown = extractMarkdown(artifact.output);
  if (!markdown.trim()) {
    throw new Error('Artifact has no output to insert.');
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('id, course_id, version_id')
    .eq('id', artifact.chapter_id)
    .maybeSingle();
  if (chapterError || !chapter) {
    throw new Error(`Failed to load chapter for approval: ${chapterError?.message ?? 'not found'}`);
  }

  // `chapters.source` is no longer REST-readable (migration 0007); read the
  // current source via the elevated helper (the artifact's course was already
  // authorized above). The UPDATE below still goes through the request-scoped
  // client, governed by the author/admin `chapters_write` RLS policy.
  const currentSource = (await readChapterSource(chapter.id))?.source ?? '';

  // Append at the end, separated by a blank line so blocks stay distinct.
  const base = currentSource.replace(/\s*$/, '');
  const combined = base.length > 0 ? `${base}\n\n${markdown.trim()}\n` : `${markdown.trim()}\n`;

  const { source: nextSource, blocks } = ensureStableIds(combined);

  const { error: updateSourceError } = await supabase
    .from('chapters')
    .update({ source: nextSource, updated_at: new Date().toISOString() })
    .eq('id', chapter.id);
  if (updateSourceError) {
    throw new Error(`Failed to write chapter source: ${updateSourceError.message}`);
  }

  try {
    await upsertBlockIndex(supabase, chapter.id, chapter.course_id, chapter.version_id, blocks);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Chapter source updated, but block index refresh failed: ${message}`);
  }

  const { data: updated, error: approveError } = await supabase
    .from('ai_artifacts')
    .update({ status: 'approved', approved_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ARTIFACT_COLUMNS)
    .single();
  if (approveError || !updated) {
    throw new Error(
      `Chapter updated, but marking the artifact approved failed: ${approveError?.message ?? 'unknown'}`,
    );
  }
  return toArtifact(updated);
}

/** Discards a draft (or any non-approved artifact). Gated to course author/admin. */
export async function discardArtifact(id: string): Promise<AiArtifact> {
  if (!id || typeof id !== 'string') {
    throw new Error('An artifact id is required.');
  }
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('You must be signed in to discard.');
  }

  const supabase = await createClient();
  const { data: artifact, error: loadError } = await supabase
    .from('ai_artifacts')
    .select('id, course_id, status')
    .eq('id', id)
    .maybeSingle();
  if (loadError) {
    throw new Error(`Failed to load artifact: ${loadError.message}`);
  }
  if (!artifact) {
    throw new Error('Artifact not found (or you cannot access it).');
  }
  if (artifact.status === 'approved') {
    throw new Error('An approved artifact cannot be discarded.');
  }

  const role = artifact.course_id ? await getCourseRole(artifact.course_id) : null;
  if (!canEditCourse(role)) {
    throw new Error('You do not have permission to discard for this course.');
  }

  const { data: updated, error: updateError } = await supabase
    .from('ai_artifacts')
    .update({ status: 'discarded', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ARTIFACT_COLUMNS)
    .single();
  if (updateError || !updated) {
    throw new Error(`Failed to discard artifact: ${updateError?.message ?? 'unknown error'}`);
  }
  return toArtifact(updated);
}
