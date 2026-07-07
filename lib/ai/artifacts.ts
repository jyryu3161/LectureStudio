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
import { ensureStableIds, upsertBlockIndex } from '@/lib/content';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

import { buildPrompt } from './prompts';
import { getProvider } from './registry';
import { getActiveProviderConfig } from './settings';
import type { ArtifactKind, GenerateRequest } from './types';
import { isArtifactKind } from './types';

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
    .select('id, course_id, title, source')
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

  let courseTitle = 'Course';
  if (courseId) {
    const { data: course } = await supabase
      .from('courses')
      .select('title')
      .eq('id', courseId)
      .maybeSingle();
    if (course?.title) courseTitle = course.title;
  }

  const request: GenerateRequest = {
    kind,
    instruction,
    context: {
      courseTitle,
      chapterTitle: chapter.title,
      chapterSource: chapter.source,
      blockId,
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
      source_context: blockId ? `block:${blockId}` : 'chapter',
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
    .select('id, course_id, version_id, source')
    .eq('id', artifact.chapter_id)
    .maybeSingle();
  if (chapterError || !chapter) {
    throw new Error(`Failed to load chapter for approval: ${chapterError?.message ?? 'not found'}`);
  }

  // Append at the end, separated by a blank line so blocks stay distinct.
  const base = chapter.source.replace(/\s*$/, '');
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
