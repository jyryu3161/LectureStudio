'use client';

import { AlertCircle, Check, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BlockInspector } from '@/components/authoring/block-inspector';
import { PreviewPane } from '@/components/authoring/preview-pane';
import { SourceEditor } from '@/components/authoring/source-editor';
import type {
  AuthoringChapterMeta,
  AuthoringCourseMeta,
  PreviewActionInput,
  PreviewActionResult,
  PreviewResult,
  SaveChapterInput,
  SaveChapterResult,
} from '@/components/authoring/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const PREVIEW_DEBOUNCE_MS = 500;
const SAVE_PULSE_MS = 2500;

type PreviewStatus = 'idle' | 'loading' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AuthoringStudioProps {
  course: AuthoringCourseMeta;
  chapter: AuthoringChapterMeta;
  initialSource: string;
  initialPreview: PreviewResult;
  /** The `saveChapterSource` Server Action, passed down from the Server Component page. */
  onSave: (input: SaveChapterInput) => Promise<SaveChapterResult>;
  /** The `renderChapterPreview` Server Action, passed down from the Server Component page. */
  onPreview: (input: PreviewActionInput) => Promise<PreviewActionResult>;
}

/**
 * Top-level client orchestrator for the Authoring Studio (PRD §6.1):
 * CodeMirror MyST source editor on the left, a live Reading-mode preview +
 * read-only Block Inspector (tabbed) on the right, plus Save.
 *
 * State lives here and flows one way down to the presentational pieces
 * (SourceEditor / PreviewPane / BlockInspector) -- none of them fetch or
 * mutate anything themselves.
 */
export function AuthoringStudio({
  course,
  chapter,
  initialSource,
  initialPreview,
  onSave,
  onPreview,
}: AuthoringStudioProps) {
  const [source, setSource] = useState(initialSource);
  const [savedSource, setSavedSource] = useState(initialSource);
  const [preview, setPreview] = useState<PreviewResult>(initialPreview);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const isDirty = source !== savedSource;
  const isSaving = saveState === 'saving';

  // --- Save -----------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (isSaving || source === savedSource) return;

    setSaveState('saving');
    setSaveError(null);
    try {
      const result = await onSave({
        courseId: chapter.courseId,
        chapterId: chapter.id,
        versionId: chapter.versionId,
        source,
      });

      if (!result.ok) {
        setSaveState('error');
        setSaveError(result.error);
        return;
      }

      // Stable-id markers may have been injected server-side -- the editor
      // buffer MUST be replaced with the canonical saved source, or the
      // next save mints brand-new ids for every block all over again (see
      // actions.ts's saveChapterSource doc comment).
      setSource(result.source);
      setSavedSource(result.source);
      setPreview((prev) => ({ ...prev, blocks: result.blocks, warnings: result.warnings }));
      setSaveState('saved');
      setLastSavedAt(result.savedAt);
    } catch (error) {
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'Failed to save. Please try again.');
    }
  }, [onSave, chapter.courseId, chapter.id, chapter.versionId, source, savedSource, isSaving]);

  // Auto-clear the transient "Saved" pulse back to neutral.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), SAVE_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  // Cmd/Ctrl+S shortcut.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      void handleSave();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // Never lose an unsaved edit to an accidental tab close/navigation.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // --- Live preview (debounced) ----------------------------------------
  // Server Actions don't expose a fetch-style AbortController, so stale
  // out-of-order responses are discarded with a monotonic request id
  // instead: only the *latest* fired request is allowed to commit state.
  const skipNextPreviewRun = useRef(true);
  const latestPreviewRequestId = useRef(0);
  useEffect(() => {
    // Skip the initial mount -- the server already rendered `initialPreview`
    // for this exact source, so re-requesting it would be redundant.
    if (skipNextPreviewRun.current) {
      skipNextPreviewRun.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const requestId = ++latestPreviewRequestId.current;
      setPreviewStatus('loading');
      onPreview({ courseId: chapter.courseId, source })
        .then((result) => {
          if (latestPreviewRequestId.current !== requestId) return; // superseded
          if (!result.ok) throw new Error(result.error);
          setPreview({ elements: result.elements, blocks: result.blocks, warnings: result.warnings });
          setPreviewStatus('idle');
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (latestPreviewRequestId.current !== requestId) return;
          setPreviewStatus('error');
          setPreviewError(error instanceof Error ? error.message : 'Failed to render preview.');
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [source, chapter.courseId, onPreview]);

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle bg-paper px-6 py-3.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground">
            {course.title}
          </p>
          <h1 className="truncate font-serif text-lg text-ink">{chapter.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SaveStatus state={saveState} error={saveError} isDirty={isDirty} lastSavedAt={lastSavedAt} />
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={14} aria-hidden="true" />
            )}
            Save
          </Button>
          <Link
            href="/reading"
            className="hidden font-mono text-xs text-muted-foreground underline underline-offset-2 hover:text-ink sm:inline"
          >
            Reading Mode
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          className="flex min-h-0 w-1/2 flex-col border-r border-border-subtle bg-paper"
          aria-label="Source editor"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-muted-foreground">
              MyST Source
            </span>
            <span className="font-mono text-[10.5px] text-muted-foreground">{chapter.slug}</span>
          </div>
          <div className="min-h-0 flex-1">
            <SourceEditor value={source} onChange={setSource} editable={!isSaving} />
          </div>
        </section>

        <section className="flex min-h-0 w-1/2 flex-col" aria-label="Preview and block inspector">
          <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-paper px-4 py-2">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="blocks">Blocks ({preview.blocks.length})</TabsTrigger>
              </TabsList>
              {previewStatus === 'loading' && (
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Updating…
                </span>
              )}
            </div>
            <TabsContent value="preview" className="mt-0 min-h-0 flex-1 overflow-hidden">
              <PreviewPane
                elements={preview.elements}
                hasContent={preview.blocks.length > 0}
                warnings={preview.warnings}
                fetchError={previewStatus === 'error' ? previewError : null}
              />
            </TabsContent>
            <TabsContent value="blocks" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <BlockInspector blocks={preview.blocks} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}

function SaveStatus({
  state,
  error,
  isDirty,
  lastSavedAt,
}: {
  state: SaveState;
  error: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;
}) {
  if (state === 'error') {
    return (
      <span className="flex max-w-xs items-center gap-1.5 font-mono text-[11px] text-red-700" role="alert">
        <AlertCircle size={13} aria-hidden="true" />
        <span className="truncate" title={error ?? undefined}>
          {error ?? 'Save failed.'}
        </span>
      </span>
    );
  }

  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }

  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#2f7a4d]">
        <Check size={13} aria-hidden="true" />
        Saved
      </span>
    );
  }

  return (
    <span className={cn('font-mono text-[11px]', isDirty ? 'text-[#b3781f]' : 'text-muted-foreground')}>
      {isDirty
        ? 'Unsaved changes'
        : lastSavedAt
          ? `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
          : 'All changes saved'}
    </span>
  );
}
