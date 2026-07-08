'use client';

import { Download, Loader2, Printer } from 'lucide-react';
import { useState } from 'react';

/**
 * Reading Mode export controls (PRD §5.6 MVP4): "PDF로 내보내기" and
 * "ePub 내보내기". Client component so it can call `window.print()` and fetch
 * the ePub route.
 *
 * - PDF: prints the viewer's own already-filtered DOM via the browser print
 *   pipeline (styled by reading-print.module.css). Role-safe by construction.
 * - ePub: GET /api/export/epub?chapterId=... (server strips instructor-only
 *   content unconditionally), then triggers a client-side download of the
 *   returned blob. Surfaces a loading spinner and any error inline.
 */
export function ReadingExportActions({ chapterId }: { chapterId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePrint() {
    window.print();
  }

  async function handleEpub() {
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/epub?chapterId=${encodeURIComponent(chapterId)}`);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? '이 챕터를 내보낼 권한이 없습니다.'
            : `내보내기에 실패했습니다 (${res.status}).`,
        );
      }
      const blob = await res.blob();

      // Prefer the server-provided filename; fall back to a generic name.
      const disposition = res.headers.get('content-disposition') ?? '';
      const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const asciiMatch = /filename="([^"]+)"/i.exec(disposition);
      const filename = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : (asciiMatch?.[1] ?? 'chapter.epub');

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error ? (
        <span role="alert" className="max-w-[200px] truncate text-[11px] text-red-600" title={error}>
          {error}
        </span>
      ) : null}

      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wide text-ink transition-colors hover:bg-canvas"
      >
        <Printer size={13} strokeWidth={1.8} aria-hidden="true" />
        PDF로 내보내기
      </button>

      <button
        type="button"
        onClick={handleEpub}
        disabled={downloading}
        aria-busy={downloading}
        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wide text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 size={13} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
        ) : (
          <Download size={13} strokeWidth={1.8} aria-hidden="true" />
        )}
        {downloading ? '내보내는 중…' : 'ePub 내보내기'}
      </button>
    </div>
  );
}
