'use server';

/**
 * Server Actions for the lecture-session lifecycle (start / end / publish).
 *
 * All three go through the request-scoped Supabase server client, so RLS
 * (supabase/migrations/0002_lecture.sql) enforces that only an elevated
 * member (author/instructor/admin -- author acts as instructor in dev) of
 * the course can run them. Inputs are validated here (hand-rolled; zod isn't
 * a dependency) before hitting the DB. Each returns the affected
 * `LectureSessionRow` so the caller can update its UI without a refetch.
 */

import { createClient } from '@/lib/supabase/server';

import type { LectureSessionRow } from '@/lib/annotations/types';

const SESSION_COLUMNS =
  'id, course_id, chapter_id, title, status, published, created_by, started_at, ended_at, created_at';
const MAX_TITLE_LENGTH = 200;

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

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

/**
 * Starts a new active lecture session over a chapter. Derives the chapter's
 * course_id server-side (never trusts a client-supplied course id), sets
 * created_by to the authenticated user, and inserts published=false.
 */
export async function startSession(chapterId: string, title: string): Promise<LectureSessionRow> {
  const chapterIdSafe = requireId(chapterId, 'chapterId');
  const titleSafe = typeof title === 'string' ? title.trim() : '';
  if (titleSafe.length === 0) throw new Error('title is required');
  if (titleSafe.length > MAX_TITLE_LENGTH) throw new Error('title is too long');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('startSession: not authenticated');

  // RLS on chapters lets any course member (incl. elevated) read this; the
  // subsequent insert's WITH CHECK is what actually requires an elevated role.
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('id, course_id')
    .eq('id', chapterIdSafe)
    .maybeSingle();
  if (chapterError) throw new Error(`startSession: could not load chapter: ${chapterError.message}`);
  if (!chapter) throw new Error('startSession: chapter not found or not accessible');
  // chapters.course_id is nullable in the schema, but a chapter without a
  // course can't host a session (and lecture_sessions.course_id is NOT NULL).
  if (!chapter.course_id) throw new Error('startSession: chapter has no course');

  const { data, error } = await supabase
    .from('lecture_sessions')
    .insert({
      course_id: chapter.course_id,
      chapter_id: chapterIdSafe,
      title: titleSafe,
      status: 'active',
      published: false,
      created_by: user.id,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw new Error(`startSession: ${error.message}`);
  return mapSession(data as Record<string, unknown>);
}

/** Marks a session ended and stamps ended_at. Idempotent-ish (safe to re-run). */
export async function endSession(sessionId: string): Promise<LectureSessionRow> {
  const id = requireId(sessionId, 'sessionId');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lecture_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`endSession: ${error.message}`);
  if (!data) throw new Error('endSession: session not found or not writable');
  return mapSession(data as Record<string, unknown>);
}

/** Publishes/unpublishes a session (gates student/guest replay). */
export async function setPublished(
  sessionId: string,
  published: boolean,
): Promise<LectureSessionRow> {
  const id = requireId(sessionId, 'sessionId');
  if (typeof published !== 'boolean') throw new Error('published must be a boolean');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lecture_sessions')
    .update({ published })
    .eq('id', id)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`setPublished: ${error.message}`);
  if (!data) throw new Error('setPublished: session not found or not writable');
  return mapSession(data as Record<string, unknown>);
}
