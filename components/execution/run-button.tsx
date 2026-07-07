'use client';

import { AlertCircle, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveRunContextAction } from '@/components/execution/actions';
import type { RunContext } from '@/components/execution/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getExecutionAction, queueExecutionAction } from '@/lib/runtime/actions';
import type { ExecutionRow } from '@/lib/runtime/db';
import type { ExecutionStatus } from '@/lib/runtime/types';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 1000;
const NO_RUNTIME_HINT = '준비된 런타임 없음 (Admin에서 빌드)';

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  queued: '실행 중',
  running: '실행 중',
  succeeded: '성공',
  failed: '실패',
  timeout: '시간 초과',
};

function isTerminal(status: ExecutionStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'timeout';
}

/**
 * Reader-side Run affordance for an executable code block (PRD §11.3).
 *
 * Rendered for EVERY code block by CodeBlock, but self-resolves its context
 * server-side (resolveRunContext) from the block id: students/guests, non-code
 * or non-executable blocks, and signed-out viewers all collapse to
 * `runnable: false` and this renders nothing — so students never see a new
 * control. Elevated viewers get a "실행" button; if the course has no ready
 * runtime image, the button is shown disabled with an explanatory tooltip.
 *
 * A click queues an execution (lib/runtime queueExecution — the real authz +
 * audit gate) and polls getExecution ~1s until a terminal status, rendering an
 * inline, live result panel below the code.
 */
export function CodeRunner({ blockId, code }: { blockId: string; code: string }) {
  const [ctx, setCtx] = useState<RunContext | null>(null);
  const [running, setRunning] = useState(false);
  const [execution, setExecution] = useState<ExecutionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kept in a ref so an in-flight poll (or a post-await setState) can bail out
  // cleanly once this block unmounts (e.g. the reader navigates away).
  const abortedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    abortedRef.current = false;
    let active = true;
    void resolveRunContextAction(blockId).then((resolved) => {
      if (active) setCtx(resolved);
    });
    return () => {
      active = false;
      abortedRef.current = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [blockId]);

  const run = useCallback(async () => {
    if (!ctx || !ctx.runnable || !ctx.runtimeReady) return;

    setRunning(true);
    setError(null);
    setExecution(null);

    const queued = await queueExecutionAction({ chapterId: ctx.chapterId, blockId, code });
    if (abortedRef.current) return;
    if (!queued.ok) {
      setError(queued.error);
      setRunning(false);
      return;
    }

    const executionId = queued.data;
    const poll = async () => {
      const res = await getExecutionAction(executionId);
      if (abortedRef.current) return;
      if (!res.ok) {
        setError(res.error);
        setRunning(false);
        return;
      }
      if (!res.data) {
        setError('실행 정보를 찾을 수 없습니다.');
        setRunning(false);
        return;
      }
      setExecution(res.data);
      if (isTerminal(res.data.status as ExecutionStatus)) {
        setRunning(false);
      } else {
        timerRef.current = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };
    void poll();
  }, [ctx, blockId, code]);

  // Nothing to show while resolving, or when this viewer/block isn't runnable.
  if (!ctx || !ctx.runnable) return null;

  const status = (execution?.status ?? (running ? 'running' : null)) as ExecutionStatus | null;
  const showPanel = running || execution !== null || error !== null;

  return (
    <div className="border-t border-border-subtle bg-[#f7f7f4] px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        {ctx.runtimeReady ? (
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() => void run()}
            disabled={running}
            aria-label="코드 실행"
          >
            {running ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
            실행
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled <button> emits no pointer events, so the tooltip
                    hangs off this wrapper span instead. */}
                <span className="inline-flex" tabIndex={0} aria-label={NO_RUNTIME_HINT}>
                  <Button type="button" variant="accent" size="sm" disabled aria-label="코드 실행">
                    <Play size={13} aria-hidden="true" />
                    실행
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{NO_RUNTIME_HINT}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {showPanel && (
        <section
          role="region"
          aria-live="polite"
          aria-label="코드 실행 결과"
          className="mt-2.5 overflow-hidden rounded-md border border-border bg-paper"
        >
          {status !== null && (
            <ExecutionHeader status={status} durationMs={execution?.duration_ms ?? null} />
          )}

          {error !== null && (
            <div
              className="flex items-start gap-1.5 border-t border-border-subtle px-3 py-2 font-mono text-[12px] text-red-700"
              role="alert"
            >
              <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {execution?.stdout ? (
            <pre className="m-0 max-h-80 overflow-auto border-t border-border-subtle px-3 py-2 font-mono text-[12px] leading-[1.6] text-ink">
              {execution.stdout}
            </pre>
          ) : null}

          {execution?.stderr ? (
            <pre className="m-0 max-h-80 overflow-auto border-t border-border-subtle bg-red-50 px-3 py-2 font-mono text-[12px] leading-[1.6] text-red-800">
              {execution.stderr}
            </pre>
          ) : null}

          {execution &&
          isTerminal(execution.status as ExecutionStatus) &&
          !execution.stdout &&
          !execution.stderr ? (
            <p className="m-0 border-t border-border-subtle px-3 py-2 font-mono text-[12px] text-muted-foreground">
              (출력 없음)
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function ExecutionHeader({
  status,
  durationMs,
}: {
  status: ExecutionStatus | null;
  durationMs: number | null;
}) {
  const isDone = status != null && isTerminal(status);
  const tone =
    status === 'succeeded'
      ? 'text-[#2f7a4d]'
      : status === 'failed' || status === 'timeout'
        ? 'text-red-700'
        : 'text-muted-foreground';

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 font-mono text-[11px]">
      <span className={cn('flex items-center gap-1.5', tone)}>
        {!isDone && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
        {status ? STATUS_LABEL[status] : '실행 중'}
      </span>
      {durationMs != null && (
        <span className="text-muted-foreground">{durationMs}ms</span>
      )}
    </div>
  );
}
