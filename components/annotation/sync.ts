'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Optimistic annotation sync queue with a durable localStorage journal.
 *
 * Data-loss handling is non-negotiable (task requirement): every create/delete
 * intent is written to a localStorage journal keyed by lecture session *before*
 * we try to flush it, so unflushed strokes survive a reload and re-flush on the
 * next mount. Failed flushes retry with exponential backoff; the queue exposes
 * a coarse `status` and a `pending` count so the page can surface "saving /
 * offline / couldn't save" to the user instead of silently dropping ink.
 *
 * The queue is generic over the create payload (`TDraft`) so it does not depend
 * on `@/lib/annotations/types`; the page picks `TDraft = NewAnnotation` and
 * wires `flush` to a server action.
 */

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'error';

/** One queued operation. Creates carry a client group id so a later delete can
 * cancel a not-yet-flushed create locally instead of round-tripping. */
export type SyncOp<TDraft> =
  | { kind: 'create'; groupId: string; draft: TDraft }
  | { kind: 'delete'; groupId: string };

/** A coalesced batch handed to the injected flush callback. */
export interface SyncBatch<TDraft> {
  creates: TDraft[];
  deletes: string[];
}

export interface AnnotationSyncOptions<TDraft> {
  sessionId: string;
  /** Persist a batch. Reject to trigger retry/backoff; resolve to clear it. */
  flush: (batch: SyncBatch<TDraft>) => Promise<void>;
  onChange?: (state: SyncQueueState) => void;
  /** Base retry delay in ms (default 800); doubles per attempt up to maxDelayMs. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Storage backend; defaults to window.localStorage. Injectable for tests. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export interface SyncQueueState {
  status: SyncStatus;
  pending: number;
}

const JOURNAL_PREFIX = 'lecturestudio.annotations.journal.';

function defaultStorage(): AnnotationSyncOptions<unknown>['storage'] | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Private-mode / disabled storage: degrade to in-memory only.
    return null;
  }
}

export class AnnotationSyncQueue<TDraft> {
  private readonly key: string;
  private readonly flushFn: (batch: SyncBatch<TDraft>) => Promise<void>;
  private readonly onChange?: (state: SyncQueueState) => void;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly storage: AnnotationSyncOptions<TDraft>['storage'] | null;

  private ops: SyncOp<TDraft>[] = [];
  private status: SyncStatus = 'saved';
  private flushing = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: AnnotationSyncOptions<TDraft>) {
    this.key = JOURNAL_PREFIX + options.sessionId;
    this.flushFn = options.flush;
    this.onChange = options.onChange;
    this.baseDelayMs = options.baseDelayMs ?? 800;
    this.maxDelayMs = options.maxDelayMs ?? 15000;
    this.storage = options.storage ?? defaultStorage();

    // Recover anything left over from a previous session/reload, then attempt
    // to flush it so a crash mid-lecture does not lose ink.
    this.ops = this.readJournal();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
    if (this.ops.length > 0) {
      this.emit();
      void this.flushLoop();
    }
  }

  /** Snapshot of current state. */
  getState(): SyncQueueState {
    return { status: this.status, pending: this.pendingCount() };
  }

  pendingCount(): number {
    return this.ops.length;
  }

  /** Enqueue an optimistic create and kick off a flush. */
  enqueueCreate(groupId: string, draft: TDraft): void {
    this.ops.push({ kind: 'create', groupId, draft });
    this.persist();
    void this.flushLoop();
  }

  enqueueCreates(items: { groupId: string; draft: TDraft }[]): void {
    for (const item of items) {
      this.ops.push({ kind: 'create', groupId: item.groupId, draft: item.draft });
    }
    this.persist();
    void this.flushLoop();
  }

  /**
   * Enqueue a delete for a whole stroke group. If the group's create is still
   * pending locally (never reached the server), both are dropped and nothing is
   * sent — the eraser then behaves as a pure local undo.
   */
  enqueueDelete(groupId: string): void {
    const hadPendingCreate = this.ops.some(
      (op) => op.kind === 'create' && op.groupId === groupId,
    );
    this.ops = this.ops.filter((op) => op.groupId !== groupId);
    if (!hadPendingCreate) {
      this.ops.push({ kind: 'delete', groupId });
    }
    this.persist();
    void this.flushLoop();
  }

  /** Force a flush attempt (e.g. user hit "retry"). */
  retry(): void {
    this.attempt = 0;
    void this.flushLoop();
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
  }

  private handleOnline = () => {
    this.attempt = 0;
    void this.flushLoop();
  };

  private buildBatch(ops: SyncOp<TDraft>[]): SyncBatch<TDraft> {
    const creates: TDraft[] = [];
    const deletes: string[] = [];
    for (const op of ops) {
      if (op.kind === 'create') creates.push(op.draft);
      else deletes.push(op.groupId);
    }
    return { creates, deletes };
  }

  private async flushLoop(): Promise<void> {
    if (this.disposed || this.flushing) return;
    if (this.ops.length === 0) {
      this.setStatus('saved');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('offline');
      return;
    }

    this.flushing = true;
    this.setStatus('saving');

    // Snapshot the ops we are about to send; new ops enqueued during the await
    // stay in the queue and are picked up by the next loop.
    const inFlight = this.ops.slice();
    try {
      await this.flushFn(this.buildBatch(inFlight));
      // Remove exactly what we sent (by reference identity).
      const sent = new Set(inFlight);
      this.ops = this.ops.filter((op) => !sent.has(op));
      this.attempt = 0;
      this.flushing = false;
      this.persist();
      if (this.ops.length > 0) {
        void this.flushLoop();
      } else {
        this.setStatus('saved');
      }
    } catch {
      this.flushing = false;
      this.emit(); // keep pending count fresh
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.disposed) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.setStatus(offline ? 'offline' : 'error');
    if (offline) return; // the 'online' event will re-kick the loop.
    const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** this.attempt);
    this.attempt += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flushLoop();
    }, delay);
  }

  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit();
    }
  }

  private emit(): void {
    this.onChange?.(this.getState());
  }

  private persist(): void {
    this.emit();
    if (!this.storage) return;
    try {
      if (this.ops.length === 0) this.storage.removeItem(this.key);
      else this.storage.setItem(this.key, JSON.stringify(this.ops));
    } catch {
      // Storage full/unavailable: the in-memory queue still flushes; we just
      // lose the reload-survival guarantee for this one write. Not fatal.
    }
  }

  private readJournal(): SyncOp<TDraft>[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SyncOp<TDraft>[]) : [];
    } catch {
      return [];
    }
  }
}

/**
 * React binding for {@link AnnotationSyncQueue}. Creates one queue per
 * `sessionId` and exposes its live status + imperative handle. The `flush`
 * callback is read through a ref so the page can pass an inline closure without
 * tearing down the queue on every render.
 */
export function useAnnotationSync<TDraft>(
  options: AnnotationSyncOptions<TDraft>,
): { state: SyncQueueState; queue: AnnotationSyncQueue<TDraft> } {
  const flushRef = useRef(options.flush);
  flushRef.current = options.flush;
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const [state, setState] = useState<SyncQueueState>({ status: 'saved', pending: 0 });

  const queue = useMemo(
    () =>
      new AnnotationSyncQueue<TDraft>({
        sessionId: options.sessionId,
        baseDelayMs: options.baseDelayMs,
        maxDelayMs: options.maxDelayMs,
        storage: options.storage,
        flush: (batch) => flushRef.current(batch),
        onChange: (next) => {
          setState(next);
          onChangeRef.current?.(next);
        },
      }),
    // Recreate only when the session (journal key) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.sessionId],
  );

  useEffect(() => {
    setState(queue.getState());
    return () => queue.dispose();
  }, [queue]);

  return { state, queue };
}
