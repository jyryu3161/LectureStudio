/**
 * Trust-boundary validation for annotations submitted by the client.
 *
 * zod is not a dependency of this project, so this is hand-rolled -- but it
 * is not optional: the server API (lib/annotations/db.ts) MUST run every
 * incoming annotation through `validateNewAnnotation` before it touches the
 * database. It enforces the SHARED ANNOTATION CONTRACT invariants that the
 * DB schema can't express (coordinates in 0..1, palette colors, correct
 * `data` shape per type), so a buggy or malicious client can't persist
 * garbage or out-of-space coordinates.
 */

import {
  ANNOTATION_COLORS,
  ANNOTATION_TYPES,
  type AnnotationColor,
  type AnnotationData,
  type AnnotationStyle,
  type AnnotationType,
  type NewAnnotation,
  type Point,
} from './types';

/** Thrown when a submitted annotation violates the contract. */
export class AnnotationValidationError extends Error {
  constructor(message: string) {
    super(`annotation validation failed: ${message}`);
    this.name = 'AnnotationValidationError';
  }
}

/** Guard so we never persist absurd payloads (DoS / accidental blobs). */
const MAX_POINTS = 5000;
const MAX_TEXT_LENGTH = 2000;
const MAX_WIDTH = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNormalized(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

function validatePoint(value: unknown, where: string): Point {
  if (!isPlainObject(value)) throw new AnnotationValidationError(`${where} is not a point object`);
  if (!isNormalized(value.x) || !isNormalized(value.y)) {
    throw new AnnotationValidationError(`${where} has coordinates outside the normalized 0..1 range`);
  }
  return { x: value.x, y: value.y };
}

function validateType(value: unknown): AnnotationType {
  if (typeof value !== 'string' || !(ANNOTATION_TYPES as readonly string[]).includes(value)) {
    throw new AnnotationValidationError(`unknown annotation_type: ${String(value)}`);
  }
  return value as AnnotationType;
}

function validateStyle(value: unknown): AnnotationStyle {
  if (!isPlainObject(value)) throw new AnnotationValidationError('style is missing or not an object');
  if (
    typeof value.color !== 'string' ||
    !(ANNOTATION_COLORS as readonly string[]).includes(value.color)
  ) {
    throw new AnnotationValidationError(`style.color is not an allowed palette color: ${String(value.color)}`);
  }
  if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0 || value.width > MAX_WIDTH) {
    throw new AnnotationValidationError('style.width must be a positive number within bounds');
  }
  const style: AnnotationStyle = { color: value.color as AnnotationColor, width: value.width };
  if (value.opacity !== undefined) {
    if (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1) {
      throw new AnnotationValidationError('style.opacity must be between 0 and 1');
    }
    style.opacity = value.opacity;
  }
  return style;
}

function validateData(type: AnnotationType, value: unknown): AnnotationData {
  if (!isPlainObject(value)) throw new AnnotationValidationError('data is missing or not an object');

  if (type === 'text') {
    if (typeof value.text !== 'string' || value.text.length === 0) {
      throw new AnnotationValidationError('text annotation requires a non-empty data.text');
    }
    if (value.text.length > MAX_TEXT_LENGTH) {
      throw new AnnotationValidationError('data.text exceeds the maximum length');
    }
    const position = validatePoint(value.position, 'data.position');
    return { text: value.text, position };
  }

  // pen | highlighter
  if (!Array.isArray(value.points) || value.points.length === 0) {
    throw new AnnotationValidationError('stroke annotation requires a non-empty data.points array');
  }
  if (value.points.length > MAX_POINTS) {
    throw new AnnotationValidationError('data.points exceeds the maximum point count');
  }
  const points = value.points.map((p, i) => validatePoint(p, `data.points[${i}]`));
  if (value.group_id !== undefined && typeof value.group_id !== 'string') {
    throw new AnnotationValidationError('data.group_id must be a string when present');
  }
  return typeof value.group_id === 'string' ? { points, group_id: value.group_id } : { points };
}

/**
 * Validates and normalizes one client-submitted annotation. Returns a clean
 * `NewAnnotation` (stripped of any extra fields) or throws
 * `AnnotationValidationError`. Note it does NOT set course_id/chapter_id/
 * author_id -- those are the server's responsibility (derived from the
 * session + authenticated user), never trusted from the client.
 */
export function validateNewAnnotation(input: unknown): NewAnnotation {
  if (!isPlainObject(input)) throw new AnnotationValidationError('annotation is not an object');

  if (typeof input.block_id !== 'string' || input.block_id.length === 0) {
    throw new AnnotationValidationError('block_id is required');
  }
  const annotation_type = validateType(input.annotation_type);
  const style = validateStyle(input.style);
  const data = validateData(annotation_type, input.data);

  const result: NewAnnotation = { block_id: input.block_id, annotation_type, data, style };

  if (input.id !== undefined) {
    if (typeof input.id !== 'string' || input.id.length === 0) {
      throw new AnnotationValidationError('id must be a non-empty string when present');
    }
    result.id = input.id;
  }
  if (input.created_against_hash !== undefined && input.created_against_hash !== null) {
    if (typeof input.created_against_hash !== 'string') {
      throw new AnnotationValidationError('created_against_hash must be a string when present');
    }
    result.created_against_hash = input.created_against_hash;
  }
  if (input.scope !== undefined) {
    if (typeof input.scope !== 'string' || input.scope.length === 0) {
      throw new AnnotationValidationError('scope must be a non-empty string when present');
    }
    result.scope = input.scope;
  }

  return result;
}
