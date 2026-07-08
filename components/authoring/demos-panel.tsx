'use client';

import { AlertCircle, Check, Clipboard, Hammer, Loader2, Play, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  createDemoApp,
  getDemoApp,
  queueDemoBuild,
} from '@/lib/demos/actions';
import { directiveSnippet } from '@/lib/demos/snippet';
import type { DemoApp, DemoStatus } from '@/lib/demos/types';
import { cn } from '@/lib/utils';

/** How often we re-poll a `building` demo for its worker outcome. */
const BUILD_POLL_MS = 3000;

/** PRD §5.5 / MVP4 — Korean status labels for the marimo build lifecycle. */
const STATUS_LABEL: Record<DemoStatus, string> = {
  draft: '초안',
  building: '빌드 중',
  ready: '준비됨',
  failed: '실패',
};

export interface DemosPanelProps {
  courseId: string;
  currentUserId: string;
  /** The course's marimo apps, newest first (from the RSC via listDemoApps). */
  initialDemos: DemoApp[];
}

type RowState = { busy: boolean; error: string | null; copied: boolean };

const EMPTY_ROW: RowState = { busy: false, error: null, copied: false };

/**
 * Authoring Demos Manager (MVP4). A tab in the Authoring Studio's right pane
 * alongside Preview / Blocks / AI. Lets an author author a marimo notebook,
 * queue a WASM build (runs out-of-process in the worker), watch the build
 * status, and — once ready — copy the `:::{interactive-demo} <id>:::` MyST
 * snippet to paste into the chapter body.
 *
 * Building/authoring is elevated-role gated server-side in lib/demos/actions;
 * this panel is only ever mounted for authors/admins who can already edit the
 * chapter. Viewing runs entirely client-side (Pyodide) from the public bundle
 * URL — nothing here executes server code.
 */
export function DemosPanel({ courseId, currentUserId, initialDemos }: DemosPanelProps) {
  const [demos, setDemos] = useState<DemoApp[]>(initialDemos);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  // aria-live status line — announced to assistive tech on create/build/copy.
  const [status, setStatus] = useState('');

  const setRow = useCallback((id: string, next: RowState) => {
    setRowState((prev) => ({ ...prev, [id]: next }));
  }, []);

  const upsertDemo = useCallback((next: DemoApp) => {
    setDemos((prev) => {
      const idx = prev.findIndex((d) => d.id === next.id);
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  // --- Poll building demos ---------------------------------------------
  // Only re-subscribes when the *set* of building ids changes (not on every
  // data tick), so the interval keeps a steady cadence while a build runs.
  const buildingKey = useMemo(
    () =>
      demos
        .filter((d) => d.status === 'building')
        .map((d) => d.id)
        .sort()
        .join(','),
    [demos],
  );

  useEffect(() => {
    if (!buildingKey) return;
    const ids = buildingKey.split(',');
    let cancelled = false;

    const poll = async () => {
      for (const id of ids) {
        try {
          const result = await getDemoApp(id);
          if (cancelled) return;
          if (result.ok && result.data) upsertDemo(result.data);
        } catch {
          // Transient poll failure — keep polling; the next tick may succeed.
        }
      }
    };

    const timer = window.setInterval(() => void poll(), BUILD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [buildingKey, upsertDemo]);

  // --- Create a draft demo ---------------------------------------------
  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedSource = source.trim();
    if (!trimmedName) {
      setCreateError('데모 이름을 입력하세요.');
      return;
    }
    if (!trimmedSource) {
      setCreateError('marimo 노트북 소스를 입력하세요.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setStatus(`"${trimmedName}" 데모를 생성하는 중…`);
    try {
      const result = await createDemoApp({ courseId, name: trimmedName, source });
      if (!result.ok) {
        setCreateError(result.error);
        setStatus(`생성 실패: ${result.error}`);
        return;
      }
      upsertDemo(result.data);
      setName('');
      setSource('');
      setStatus(`"${result.data.name}" 데모 초안이 생성되었습니다. 이제 빌드하세요.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '생성에 실패했습니다.';
      setCreateError(message);
      setStatus(`생성 실패: ${message}`);
    } finally {
      setCreating(false);
    }
  }, [courseId, name, source, upsertDemo]);

  // --- Queue / re-queue a build ----------------------------------------
  const handleBuild = useCallback(
    async (demo: DemoApp) => {
      setRow(demo.id, { busy: true, error: null, copied: false });
      setStatus(`"${demo.name}" 빌드를 요청했습니다…`);
      try {
        const result = await queueDemoBuild(demo.id);
        if (!result.ok) {
          setRow(demo.id, { busy: false, error: result.error, copied: false });
          setStatus(`빌드 요청 실패: ${result.error}`);
          return;
        }
        upsertDemo(result.data);
        setRow(demo.id, EMPTY_ROW);
        setStatus(`"${demo.name}" 빌드를 시작했습니다. 완료될 때까지 상태를 확인하세요.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '빌드 요청에 실패했습니다.';
        setRow(demo.id, { busy: false, error: message, copied: false });
        setStatus(`빌드 요청 실패: ${message}`);
      }
    },
    [setRow, upsertDemo],
  );

  // --- Copy the MyST directive snippet ---------------------------------
  const handleCopy = useCallback(
    async (demo: DemoApp) => {
      const snippet = directiveSnippet(demo.id);
      const ok = await copyToClipboard(snippet);
      const current = rowState[demo.id] ?? EMPTY_ROW;
      if (ok) {
        setRow(demo.id, { ...current, copied: true, error: null });
        setStatus(`"${demo.name}" 디렉티브를 클립보드에 복사했습니다. 본문에 붙여넣으세요.`);
      } else {
        setRow(demo.id, {
          ...current,
          copied: false,
          error: '클립보드 복사에 실패했습니다. 아래 스니펫을 직접 복사하세요.',
        });
        setStatus('클립보드 복사에 실패했습니다.');
      }
    },
    [rowState, setRow],
  );

  // Why the primary action is unavailable, surfaced in a tooltip so the
  // disabled button isn't a silent dead end (mirrors the Run button pattern).
  // `null` while creating (the spinner already explains the state) or ready.
  const disabledReason = creating
    ? null
    : name.trim().length === 0
      ? '데모 이름을 입력하세요.'
      : source.trim().length === 0
        ? 'marimo 소스를 입력하세요.'
        : null;
  const canCreate = disabledReason === null && !creating;

  return (
    <div className="flex h-full flex-col">
      {/* Screen-reader status announcements. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {/* --- New-demo form --- */}
      <div className="shrink-0 space-y-3 border-b border-border-subtle bg-paper px-4 py-4">
        <div className="flex items-center gap-2">
          <Play size={14} className="text-accent" aria-hidden="true" />
          <h2 className="font-serif text-sm text-ink">데모</h2>
        </div>

        <p className="rounded-lg border border-border-subtle bg-canvas px-3 py-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          marimo 노트북을 작성하고 빌드하세요. 빌드가 완료되면{' '}
          <span className="text-ink">디렉티브를 본문에 붙여넣으세요</span>.
        </p>

        <div className="space-y-1.5">
          <label
            htmlFor="demo-name"
            className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground"
          >
            데모 이름
          </label>
          <input
            id="demo-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={creating}
            placeholder="예: 병합 정렬 시각화"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="demo-source"
            className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground"
          >
            marimo 소스 (app.py)
          </label>
          <textarea
            id="demo-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={creating}
            rows={8}
            spellCheck={false}
            placeholder={'import marimo\n\napp = marimo.App()\n\n@app.cell\ndef _():\n    import marimo as mo\n    mo.md("# Hello")\n    return'}
            className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
        </div>

        {disabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled <button> emits no pointer events, so the tooltip
                    hangs off this wrapper span instead. */}
                <span className="inline-flex w-full" tabIndex={0} aria-label={disabledReason}>
                  <Button type="button" variant="accent" size="sm" className="w-full" disabled>
                    <Plus size={14} aria-hidden="true" />
                    새 데모
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="w-full"
            onClick={() => void handleCreate()}
            disabled={!canCreate}
          >
            {creating ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
            새 데모
          </Button>
        )}

        {createError && (
          <p
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            role="alert"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{createError}</span>
          </p>
        )}
      </div>

      {/* --- Demo list --- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {demos.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              아직 데모가 없습니다 — 위에서 만들어 보세요.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {demos.map((demo) => (
              <DemoRow
                key={demo.id}
                demo={demo}
                currentUserId={currentUserId}
                state={rowState[demo.id] ?? EMPTY_ROW}
                onBuild={() => void handleBuild(demo)}
                onCopy={() => void handleCopy(demo)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DemoRow({
  demo,
  currentUserId,
  state,
  onBuild,
  onCopy,
}: {
  demo: DemoApp;
  currentUserId: string;
  state: RowState;
  onBuild: () => void;
  onCopy: () => void;
}) {
  const isBuilding = demo.status === 'building';
  const isReady = demo.status === 'ready';
  const isFailed = demo.status === 'failed';
  const author = demo.createdBy === currentUserId ? '나' : demo.createdBy.slice(0, 8);
  const when = formatWhen(demo.updatedAt);
  const snippet = directiveSnippet(demo.id);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-serif text-sm text-ink" title={demo.name}>
          {demo.name}
        </span>
        <StatusBadge status={demo.status} />
      </div>

      <p className="font-mono text-[10.5px] text-muted-foreground">
        {author} · {when}
      </p>

      {/* Build log — visible whenever there is one (failures included). */}
      {demo.log.trim().length > 0 && (
        <details className="group" open={isFailed}>
          <summary className="cursor-pointer list-none font-mono text-[10.5px] uppercase tracking-wide text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            빌드 로그 <span className="text-muted-foreground group-open:hidden">▸</span>
            <span className="hidden text-muted-foreground group-open:inline">▾</span>
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border-subtle bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink/90 whitespace-pre-wrap">
            {demo.log}
          </pre>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBuild}
          disabled={state.busy || isBuilding}
        >
          {state.busy || isBuilding ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Hammer size={13} aria-hidden="true" />
          )}
          {isBuilding ? '빌드 중…' : isReady || isFailed ? '다시 빌드' : '빌드'}
        </Button>

        {isReady && (
          <Button type="button" variant="accent" size="sm" onClick={onCopy}>
            {state.copied ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Clipboard size={13} aria-hidden="true" />
            )}
            {state.copied ? '복사됨' : '디렉티브 복사'}
          </Button>
        )}
      </div>

      {/* Ready demos: always show the snippet as a manual-copy fallback. */}
      {isReady && (
        <pre className="max-h-24 overflow-auto rounded-lg border border-border-subtle bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink/90 whitespace-pre-wrap">
          {snippet}
        </pre>
      )}

      {isFailed && !demo.log.trim() && (
        <p className="flex items-start gap-1.5 font-mono text-[11px] text-red-700" role="alert">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>빌드에 실패했습니다. 소스를 확인하고 다시 빌드하세요.</span>
        </p>
      )}

      {state.error && (
        <p className="flex items-start gap-1.5 font-mono text-[11px] text-red-700" role="alert">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="break-words">{state.error}</span>
        </p>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: DemoStatus }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide',
        status === 'draft' && 'bg-black/5 text-muted-foreground',
        status === 'building' && 'bg-accent/10 text-accent',
        status === 'ready' && 'bg-[#2f7a4d]/[0.12] text-[#2f7a4d]',
        status === 'failed' && 'bg-red-100 text-red-700',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Copy `text` to the clipboard. Prefers the async Clipboard API; falls back to
 * a hidden-textarea + execCommand('copy') for insecure contexts / older
 * browsers. Returns whether the copy succeeded.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
