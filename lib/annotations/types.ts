/**
 * SHARED ANNOTATION CONTRACT types (PRD §8.6/8.7).
 *
 * This is the single source of truth for annotation shapes across every
 * workstream (DB access, Lecture Mode canvas, Reading Mode replay). Import
 * from here -- never redeclare these locally.
 *
 * Coordinate space: ALWAYS per-block, normalized 0..1 against the block
 * wrapper's (`<section data-block-id>`) bounding box. Never store
 * scroll_position / viewport_size / absolute pixels.
 */

/** Toolbar palette from the lecture mockup (검정 / 빨강 / 파랑). */
export const ANNOTATION_COLORS = ['#16181c', '#e11d2e', '#2563eb'] as const;
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

export const ANNOTATION_TYPES = ['pen', 'highlighter', 'text'] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

/** The only coordinate space annotations are ever stored in. */
export const ANNOTATION_COORD_SPACE = 'block_normalized' as const;
export type AnnotationCoordSpace = typeof ANNOTATION_COORD_SPACE;

/** A single point, normalized 0..1 within the target block's bounding box. */
export interface Point {
  x: number;
  y: number;
}

/**
 * `data` payload for a pen/highlighter stroke.
 * `group_id` ties together the per-block segments of one physical stroke
 * that crossed multiple blocks, so the eraser can remove the whole stroke.
 */
export interface StrokeData {
  points: Point[];
  group_id?: string;
}

/** `data` payload for a text annotation. */
export interface TextData {
  text: string;
  position: Point;
}

export type AnnotationData = StrokeData | TextData;

/** Rendering style. `opacity` is set (~0.35) for highlighter strokes. */
export interface AnnotationStyle {
  color: AnnotationColor;
  width: number;
  opacity?: number;
}

/**
 * A persisted annotation row (mirrors the `annotations` table in
 * supabase/migrations/0002_lecture.sql).
 */
export interface AnnotationRow {
  id: string;
  course_id: string;
  chapter_id: string;
  block_id: string;
  course_version_id: string | null;
  lecture_session_id: string;
  author_id: string | null;
  annotation_type: AnnotationType;
  coord_space: AnnotationCoordSpace;
  created_against_hash: string | null;
  data: AnnotationData;
  style: AnnotationStyle;
  scope: string;
  created_at: string;
  updated_at: string;
}

/**
 * A new annotation as submitted by the client to be saved. `course_id`,
 * `chapter_id`, `author_id`, and timestamps are NOT accepted from the client
 * -- the server derives them from the session and the authenticated user
 * (trust boundary; see lib/annotations/db.ts saveAnnotations). An optional
 * client-generated `id` lets a batch upsert be idempotent/replaceable.
 */
export interface NewAnnotation {
  id?: string;
  block_id: string;
  annotation_type: AnnotationType;
  created_against_hash?: string | null;
  data: AnnotationData;
  style: AnnotationStyle;
  scope?: string;
}

/** A live lecture session (mirrors the `lecture_sessions` table). */
export interface LectureSessionRow {
  id: string;
  course_id: string;
  chapter_id: string;
  title: string;
  status: 'active' | 'ended';
  published: boolean;
  created_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
}
