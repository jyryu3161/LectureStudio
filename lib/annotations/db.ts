/**
 * SERVER-ONLY data access for lecture sessions and annotations.
 *
 * Every function here goes through the request-scoped Supabase server client
 * (`await createClient()` from '@/lib/supabase/server'), so Row Level
 * Security (supabase/migrations/0002_lecture.sql) is the real authorization
 * boundary -- these helpers never use the service-role key. Elevated
 * (author/instructor/admin) callers see everything for their course;
 * students/guests only ever get published sessions and their annotations,
 * because RLS filters the rows before they reach this code.
 *
 * Do not import this from a 'use client' component.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/types';

import { ANNOTATION_COORD_SPACE, type AnnotationRow, type LectureSessionRow } from './types';
import { AnnotationValidationError, validateNewAnnotation } from './validate';

type Client = SupabaseClient<Database>;

const SESSION_COLUMNS =
  'id, course_id, chapter_id, title, status, published, created_by, started_at, ended_at, created_at';
const ANNOTATION_COLUMNS =
  'id, course_id, chapter_id, block_id, course_version_id, lecture_session_id, author_id, annotation_type, coord_space, created_against_hash, data, style, scope, created_at, updated_at';

function mapSession(row: Record<string, unknown>): LectureSessionRow {
  return {
    id: row.id as string,
    course_id: row.course_id as string,
    chapter_id: row.chapter_id as string,
    title: row.title as string,
    status: row.status as LectureSessionRow['status'],
    published: row.published as boolean,
    created_by: (row.created_by as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

function mapAnnotation(row: Record<string, unknown>): AnnotationRow {
  return {
    id: row.id as string,
    course_id: row.course_id as string,
    chapter_id: row.chapter_id as string,
    block_id: row.block_id as string,
    course_version_id: (row.course_version_id as string | null) ?? null,
    lecture_session_id: row.lecture_session_id as string,
    author_id: (row.author_id as string | null) ?? null,
    annotation_type: row.annotation_type as AnnotationRow['annotation_type'],
    coord_space: ANNOTATION_COORD_SPACE,
    created_against_hash: (row.created_against_hash as string | null) ?? null,
    data: row.data as AnnotationRow['data'],
    style: row.style as AnnotationRow['style'],
    scope: row.scope as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Sessions a student/guest may replay for a chapter: RLS returns only
 * `published` ones (elevated callers additionally see their unpublished
 * sessions via this same query, which is fine -- it's a superset for them).
 * Ordered newest-first.
 */
export async function listPublishedSessions(chapterId: string): Promise<LectureSessionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lecture_sessions')
    .select(SESSION_COLUMNS)
    .eq('chapter_id', chapterId)
    .eq('published', true)
    .order('started_at', { ascending: false });
  if (error) throw new Error(`listPublishedSessions(${chapterId}): ${error.message}`);
  return (data ?? []).map((r) => mapSession(r as Record<string, unknown>));
}

/**
 * All sessions for a chapter, for an elevated (author/instructor/admin)
 * caller. RLS still applies -- a student calling this simply gets only the
 * published rows back, never an error. Ordered newest-first.
 */
export async function listSessions(chapterId: string): Promise<LectureSessionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lecture_sessions')
    .select(SESSION_COLUMNS)
    .eq('chapter_id', chapterId)
    .order('started_at', { ascending: false });
  if (error) throw new Error(`listSessions(${chapterId}): ${error.message}`);
  return (data ?? []).map((r) => mapSession(r as Record<string, unknown>));
}

/** Annotations for a session, oldest-first (draw order). RLS-gated. */
export async function listAnnotations(sessionId: string): Promise<AnnotationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('annotations')
    .select(ANNOTATION_COLUMNS)
    .eq('lecture_session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listAnnotations(${sessionId}): ${error.message}`);
  return (data ?? []).map((r) => mapAnnotation(r as Record<string, unknown>));
}

/** Looks up a session (RLS-gated) to derive trusted course/chapter ids. */
async function requireSession(supabase: Client, sessionId: string): Promise<LectureSessionRow> {
  const { data, error } = await supabase
    .from('lecture_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`saveAnnotations: could not load session ${sessionId}: ${error.message}`);
  if (!data) {
    // Either the session doesn't exist or RLS hid it (not an elevated member
    // of its course). Same opaque message either way -- don't leak existence.
    throw new Error(`saveAnnotations: session ${sessionId} not found or not writable`);
  }
  return mapSession(data as Record<string, unknown>);
}

/**
 * Validates and batch-upserts annotations for a session. Trust boundary:
 *  - every incoming annotation is run through `validateNewAnnotation`
 *    (coords in 0..1, palette colors, correct data shape per type);
 *  - course_id/chapter_id are taken from the SESSION, never the client;
 *  - author_id is the authenticated user, never the client;
 *  - coord_space is forced to 'block_normalized'.
 * RLS still has the final say (only elevated members can insert). Returns the
 * saved rows. An empty input is a no-op (returns []).
 */
export async function saveAnnotations(
  sessionId: string,
  annotations: unknown[],
): Promise<AnnotationRow[]> {
  if (!Array.isArray(annotations)) {
    throw new AnnotationValidationError('saveAnnotations: annotations must be an array');
  }
  if (annotations.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('saveAnnotations: not authenticated');

  const session = await requireSession(supabase, sessionId);
  const validated = annotations.map((a) => validateNewAnnotation(a));

  const rows = validated.map((a) => ({
    ...(a.id ? { id: a.id } : {}),
    course_id: session.course_id,
    chapter_id: session.chapter_id,
    block_id: a.block_id,
    course_version_id: null as string | null,
    lecture_session_id: sessionId,
    author_id: user.id,
    annotation_type: a.annotation_type,
    coord_space: ANNOTATION_COORD_SPACE,
    created_against_hash: a.created_against_hash ?? null,
    data: a.data as unknown as Json,
    style: a.style as unknown as Json,
    scope: a.scope ?? 'session',
  }));

  const { data, error } = await supabase
    .from('annotations')
    .upsert(rows, { onConflict: 'id' })
    .select(ANNOTATION_COLUMNS);
  if (error) throw new Error(`saveAnnotations(${sessionId}): ${error.message}`);
  return (data ?? []).map((r) => mapAnnotation(r as Record<string, unknown>));
}

/**
 * Deletes annotations within ONE session -- by explicit id list, and/or by
 * stroke `group_id` (data.group_id, so the eraser can remove a whole
 * multi-block stroke at once). Always scoped to `sessionId` so a caller can
 * never delete another session's annotations, and requires at least one
 * selector so it can't wipe a whole session by omission. Returns the number
 * of rows actually deleted (RLS may allow fewer than requested). Deleting by
 * both selectors runs them as two scoped deletes.
 */
export async function deleteAnnotations(params: {
  sessionId: string;
  ids?: string[];
  groupId?: string;
}): Promise<number> {
  const { sessionId, ids, groupId } = params;
  const hasIds = Array.isArray(ids) && ids.length > 0;
  const hasGroup = typeof groupId === 'string' && groupId.length > 0;
  if (!hasIds && !hasGroup) {
    throw new AnnotationValidationError(
      'deleteAnnotations: pass ids and/or groupId -- refusing to delete an entire session',
    );
  }

  const supabase = await createClient();
  let deleted = 0;

  if (hasIds) {
    const { data, error } = await supabase
      .from('annotations')
      .delete()
      .eq('lecture_session_id', sessionId)
      .in('id', ids as string[])
      .select('id');
    if (error) throw new Error(`deleteAnnotations(ids, ${sessionId}): ${error.message}`);
    deleted += (data ?? []).length;
  }

  if (hasGroup) {
    const { data, error } = await supabase
      .from('annotations')
      .delete()
      .eq('lecture_session_id', sessionId)
      .eq('data->>group_id', groupId as string)
      .select('id');
    if (error) throw new Error(`deleteAnnotations(group, ${sessionId}): ${error.message}`);
    deleted += (data ?? []).length;
  }

  return deleted;
}
