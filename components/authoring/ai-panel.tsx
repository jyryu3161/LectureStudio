'use client';

import { AlertCircle, Check, Loader2, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { discardArtifactAction, generateArtifactAction } from '@/lib/ai/actions';
import type { AiArtifact } from '@/lib/ai/artifacts';
import { ARTIFACT_KINDS } from '@/lib/ai/types';
import type { ArtifactKind } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

/** PRD §9.3 / §9.4 — Korean labels for the artifact kinds shown in the kind selector. */
const KIND_LABEL: Record<ArtifactKind, string> = {
  outline: '강의 초안',
  'student-explanation': '학생 설명 보강',
  'instructor-summary': '강의자 요약',
  'figure-code': '개념 그림 코드',
  'code-explanation': '코드 설명',
  quiz: '퀴즈 후보',
  'animation-code': '애니메이션 코드',
  'difficulty-adjust': '난이도 변환',
  'revision-from-annotations': '판서 기반 수정안',
};

const STATUS_LABEL: Record<AiArtifact['status'], string> = {
  draft: '초안',
  approved: '승인됨',
  discarded: '폐기됨',
};

/**
 * Outcome of the parent-orchestrated approve flow (AuthoringStudio.handleApprove):
 * approving inserts the draft's MyST into the SAVED chapter source server-side,
 * then the parent reloads that canonical source into the editor buffer. A
 * `reloadWarning` means the approve itself succeeded but the editor refresh
 * didn't — the author should reload the page to see the inserted MyST.
 */
export type ApproveArtifactOutcome =
  | { ok: true; artifact: AiArtifact; reloadWarning?: string }
  | { ok: false; error: string };

export interface AiPanelProps {
  chapterId: string;
  courseId: string;
  currentUserId: string;
  /** Drafts + approved/discarded history for this chapter, newest first (from the RSC via listArtifacts). */
  initialArtifacts: AiArtifact[];
  /**
   * True when the editor buffer has unsaved edits. Generation grounds on the
   * SAVED chapter source, and approve is blocked while dirty (approving would
   * insert into the saved source and then overwrite the unsaved buffer on reload).
   */
  sourceDirty: boolean;
  /**
   * Orchestrated by the parent: approves the draft, appends its MyST to the
   * saved chapter source, and refreshes the editor buffer so the author sees it.
   */
  onApprove: (artifactId: string) => Promise<ApproveArtifactOutcome>;
}

type RowState = { busy: 'approving' | 'discarding' | null; error: string | null };

/**
 * Authoring AI Assistant (PRD §9.3). A tab in the Authoring Studio's right pane
 * alongside Preview / Blocks. Lets an author generate a MyST artifact (six
 * kinds), review it as a draft, then explicitly approve-and-insert or discard.
 *
 * The draft gate (PRD §9.2) is enforced server-side: generation only ever
 * stores a `status='draft'` row — nothing touches `chapters.source` until the
 * author clicks 승인 후 삽입.
 */
export function AiPanel({
  chapterId,
  courseId: _courseId,
  currentUserId,
  initialArtifacts,
  sourceDirty,
  onApprove,
}: AiPanelProps) {
  const [artifacts, setArtifacts] = useState<AiArtifact[]>(initialArtifacts);
  const [kind, setKind] = useState<ArtifactKind>('outline');
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  // aria-live status line — announced to assistive tech on generate/approve/discard.
  const [status, setStatus] = useState('');

  const setRow = useCallback((id: string, next: RowState) => {
    setRowState((prev) => ({ ...prev, [id]: next }));
  }, []);

  const upsertArtifact = useCallback((next: AiArtifact) => {
    setArtifacts((prev) => {
      const idx = prev.findIndex((a) => a.id === next.id);
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  // --- Generate --------------------------------------------------------
  const handleGenerate = useCallback(async () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      setGenError('생성 지시문을 입력하세요.');
      return;
    }
    setGenerating(true);
    setGenError(null);
    setStatus(`${KIND_LABEL[kind]} 초안을 생성하는 중…`);
    try {
      const result = await generateArtifactAction({ chapterId, kind, instruction: trimmed });
      if (!result.ok) {
        setGenError(result.error);
        setStatus(`생성 실패: ${result.error}`);
        return;
      }
      upsertArtifact(result.data);
      setInstruction('');
      setStatus(`${KIND_LABEL[kind]} 초안이 생성되었습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '생성에 실패했습니다.';
      setGenError(message);
      setStatus(`생성 실패: ${message}`);
    } finally {
      setGenerating(false);
    }
  }, [chapterId, kind, instruction, upsertArtifact]);

  // --- Approve (parent-orchestrated: inserts + refreshes editor) --------
  const handleApprove = useCallback(
    async (id: string) => {
      setRow(id, { busy: 'approving', error: null });
      setStatus('초안을 승인하고 삽입하는 중…');
      try {
        const outcome = await onApprove(id);
        if (!outcome.ok) {
          setRow(id, { busy: null, error: outcome.error });
          setStatus(`승인 실패: ${outcome.error}`);
          return;
        }
        upsertArtifact(outcome.artifact);
        setRow(id, { busy: null, error: outcome.reloadWarning ?? null });
        setStatus(
          outcome.reloadWarning
            ? `승인되어 챕터에 삽입되었습니다. ${outcome.reloadWarning}`
            : '승인되어 챕터 본문에 삽입되었습니다.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '승인에 실패했습니다.';
        setRow(id, { busy: null, error: message });
        setStatus(`승인 실패: ${message}`);
      }
    },
    [onApprove, setRow, upsertArtifact],
  );

  // --- Discard ---------------------------------------------------------
  const handleDiscard = useCallback(
    async (id: string) => {
      if (!window.confirm('이 초안을 폐기하시겠습니까? 되돌릴 수 없습니다.')) return;
      setRow(id, { busy: 'discarding', error: null });
      setStatus('초안을 폐기하는 중…');
      try {
        const result = await discardArtifactAction(id);
        if (!result.ok) {
          setRow(id, { busy: null, error: result.error });
          setStatus(`폐기 실패: ${result.error}`);
          return;
        }
        upsertArtifact(result.data);
        setRow(id, { busy: null, error: null });
        setStatus('초안을 폐기했습니다.');
      } catch (error) {
        const message = error instanceof Error ? error.message : '폐기에 실패했습니다.';
        setRow(id, { busy: null, error: message });
        setStatus(`폐기 실패: ${message}`);
      }
    },
    [setRow, upsertArtifact],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Screen-reader status announcements. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {/* --- Generate form --- */}
      <div className="shrink-0 space-y-3 border-b border-border-subtle bg-paper px-4 py-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" aria-hidden="true" />
          <h2 className="font-serif text-sm text-ink">AI 어시스턴트</h2>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="ai-kind"
            className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground"
          >
            생성 종류
          </label>
          <select
            id="ai-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as ArtifactKind)}
            disabled={generating}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {ARTIFACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="ai-instruction"
            className="block font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground"
          >
            지시문
          </label>
          <textarea
            id="ai-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={generating}
            rows={3}
            placeholder="예: 병합 정렬의 분할 단계를 학생이 이해하기 쉽게 설명해줘"
            className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
        </div>

        {sourceDirty && (
          <p className="font-mono text-[10.5px] text-[#b3781f]">
            저장되지 않은 편집 내용은 생성 컨텍스트에 반영되지 않습니다 (저장된 본문 기준).
          </p>
        )}

        {!generating && instruction.trim().length === 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A disabled <button> emits no pointer events, so the tooltip
                    hangs off this wrapper span instead. */}
                <span className="inline-flex w-full" tabIndex={0} aria-label="지시문을 입력하세요.">
                  <Button type="button" variant="accent" size="sm" className="w-full" disabled>
                    <Sparkles size={14} aria-hidden="true" />
                    생성
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>지시문을 입력하세요.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="w-full"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            생성
          </Button>
        )}

        {genError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            role="alert"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words">{genError}</p>
              {isKeyError(genError) && (
                <p className="mt-1">
                  제공자 API 키를{' '}
                  <Link href="/admin" className="underline underline-offset-2">
                    관리자 설정
                  </Link>
                  에서 확인하세요.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Draft / history list --- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {artifacts.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              아직 생성된 초안이 없습니다 — 위에서 생성해 보세요.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {artifacts.map((artifact) => (
              <ArtifactRow
                key={artifact.id}
                artifact={artifact}
                currentUserId={currentUserId}
                state={rowState[artifact.id] ?? { busy: null, error: null }}
                onApprove={() => void handleApprove(artifact.id)}
                onDiscard={() => void handleDiscard(artifact.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ArtifactRow({
  artifact,
  currentUserId,
  state,
  onApprove,
  onDiscard,
}: {
  artifact: AiArtifact;
  currentUserId: string;
  state: RowState;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const isDraft = artifact.status === 'draft';
  const busy = state.busy !== null;
  const author = artifact.createdBy === currentUserId ? '나' : artifact.createdBy.slice(0, 8);
  const when = formatWhen(artifact.createdAt);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-ink">
          {KIND_LABEL[artifact.artifactType]}
        </span>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide',
            artifact.status === 'draft' && 'bg-accent/10 text-accent',
            artifact.status === 'approved' && 'bg-[#2f7a4d]/[0.12] text-[#2f7a4d]',
            artifact.status === 'discarded' && 'bg-black/5 text-muted-foreground',
          )}
        >
          {STATUS_LABEL[artifact.status]}
        </span>
      </div>

      <p className="font-mono text-[10.5px] text-muted-foreground">
        {artifact.provider}
        {artifact.model ? ` · ${artifact.model}` : ''} · {author} · {when}
      </p>

      <details className="group">
        <summary className="cursor-pointer list-none font-mono text-[10.5px] uppercase tracking-wide text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          MyST 미리보기 <span className="text-muted-foreground group-open:hidden">▸</span>
          <span className="hidden text-muted-foreground group-open:inline">▾</span>
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border-subtle bg-canvas px-3 py-2 text-[11px] leading-relaxed text-ink/90 whitespace-pre-wrap">
          {artifact.markdown}
        </pre>
      </details>

      {isDraft && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={onApprove}
            disabled={busy}
          >
            {state.busy === 'approving' ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Check size={13} aria-hidden="true" />
            )}
            승인 후 삽입
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={busy}
          >
            {state.busy === 'discarding' ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={13} aria-hidden="true" />
            )}
            폐기
          </Button>
        </div>
      )}

      {artifact.status === 'approved' && (
        <p className="font-mono text-[10.5px] text-muted-foreground">
          챕터 본문에 삽입됨{artifact.approvedBy ? ` · 승인자 ${approvedByLabel(artifact.approvedBy, currentUserId)}` : ''}
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

function approvedByLabel(approvedBy: string, currentUserId: string): string {
  return approvedBy === currentUserId ? '나' : approvedBy.slice(0, 8);
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

/** Heuristic: does this provider error look like a bad/missing API key? */
function isKeyError(message: string): boolean {
  return /\bkey\b|api key|인증|invalid|unauthor/i.test(message);
}
