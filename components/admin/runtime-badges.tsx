import { cn } from '@/lib/utils';
import type { BuildStatus, RuntimeStatus } from '@/lib/runtime/types';

/**
 * Shared status badges for the Runtime Studio (list + detail).
 *
 * Runtime lifecycle: draft → building → ready | failed.
 * Build lifecycle:   queued → running → succeeded | failed.
 *
 * Colors map to the design tokens' neutrals plus semantic accents; the
 * Korean label is the source of truth shown to admins. `role`/text (never
 * color alone) carries the meaning for a11y.
 */

const RUNTIME_BADGE: Record<RuntimeStatus, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-black/5 text-muted' },
  building: { label: '빌드 중', className: 'bg-amber-100 text-amber-800' },
  ready: { label: '활성', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

const BUILD_BADGE: Record<BuildStatus, { label: string; className: string }> = {
  queued: { label: '대기 중', className: 'bg-black/5 text-muted' },
  running: { label: '실행 중', className: 'bg-amber-100 text-amber-800' },
  succeeded: { label: '성공', className: 'bg-green-100 text-green-800' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700' },
};

const BADGE_BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide';

export function RuntimeStatusBadge({ status }: { status: RuntimeStatus }) {
  const { label, className } = RUNTIME_BADGE[status] ?? RUNTIME_BADGE.draft;
  return <span className={cn(BADGE_BASE, className)}>{label}</span>;
}

export function BuildStatusBadge({ status }: { status: BuildStatus }) {
  const { label, className } = BUILD_BADGE[status] ?? BUILD_BADGE.queued;
  return <span className={cn(BADGE_BASE, className)}>{label}</span>;
}
