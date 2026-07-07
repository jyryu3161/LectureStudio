'use server';

/**
 * Server Actions for persisting Lecture Mode annotations.
 *
 * These wrap the RLS-gated data layer in `@/lib/annotations` (never the
 * service-role key), so the DB is the real authorization boundary: only an
 * elevated member (author/instructor/admin) of the session's course can write
 * or delete annotations, and every incoming annotation is validated
 * server-side by `saveAnnotations` (coords 0..1, palette colors, correct data
 * shape) before it reaches Postgres. The client (the sync queue in
 * components/annotation) only ever hands us the fields it is trusted to
 * supply -- course/chapter/author/session are derived server-side.
 *
 * Session lifecycle actions (start/end/publish) live in `@/lib/lecture/actions`
 * and are consumed directly by the client; only annotation persistence needed
 * a wrapper here because `lib/annotations/db` is a plain server module, not a
 * Server Action itself.
 */

import { deleteAnnotations, saveAnnotations } from '@/lib/annotations';

/**
 * Flush one optimistic batch from the client sync queue: create new
 * annotations and delete whole stroke groups (by the client-shared group id).
 *
 * `deletes` carries the group ids the eraser/discard removed. A token is
 * passed as BOTH an id and a group id to `deleteAnnotations` so it works
 * whether it identifies a multi-segment stroke (`data.group_id` match) or a
 * single text annotation (its own row id) -- both scoped to `sessionId`, so a
 * caller can never touch another session's rows.
 */
export async function persistAnnotations(
  sessionId: string,
  batch: { creates: unknown[]; deletes: string[] },
): Promise<void> {
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    throw new Error('persistAnnotations: sessionId is required');
  }

  const creates = Array.isArray(batch?.creates) ? batch.creates : [];
  const deletes = Array.isArray(batch?.deletes) ? batch.deletes : [];

  if (creates.length > 0) {
    await saveAnnotations(sessionId, creates);
  }

  for (const token of deletes) {
    if (typeof token !== 'string' || token.length === 0) continue;
    await deleteAnnotations({ sessionId, ids: [token], groupId: token });
  }
}
