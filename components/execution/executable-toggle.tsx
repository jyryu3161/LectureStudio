'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { getBlockMetaAction, updateBlockMetaAction } from '@/components/execution/actions';
import { Switch } from '@/components/ui/switch';

/**
 * Authoring-only "실행 가능" (executable) toggle shown per code block in the
 * Block Inspector (PRD §11.3). Persists content_blocks.metadata.executable via
 * updateBlockMeta (author/admin gated + RLS).
 *
 * Self-loads current state from the id so the Inspector needn't thread DB
 * state through the parse-only preview pipeline. A block that hasn't been
 * saved yet has no persisted row (`exists: false`); the switch stays disabled
 * with a "save first" hint rather than silently failing.
 */
export function ExecutableToggle({ blockId }: { blockId: string }) {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [executable, setExecutable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const switchId = useId();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void getBlockMetaAction(blockId).then((res) => {
      if (!mountedRef.current) return;
      if (res.ok) {
        setExists(res.data.exists);
        setExecutable(res.data.executable);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [blockId]);

  async function handleToggle(next: boolean) {
    const previous = executable;
    setExecutable(next); // optimistic
    setSaving(true);
    setError(null);
    const res = await updateBlockMetaAction(blockId, next);
    if (!mountedRef.current) return;
    if (res.ok) {
      setExecutable(res.data.executable);
    } else {
      setExecutable(previous); // revert
      setError(res.error);
    }
    setSaving(false);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Switch
        id={switchId}
        checked={executable}
        onCheckedChange={handleToggle}
        disabled={loading || saving || !exists}
        aria-label="실행 가능"
      />
      <label
        htmlFor={switchId}
        className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
      >
        실행 가능
      </label>
      {!loading && !exists && (
        <span className="font-mono text-[10.5px] text-muted-foreground">저장 후 설정 가능</span>
      )}
      {error && (
        <span className="flex items-center gap-1 font-mono text-[10.5px] text-red-700" role="alert">
          <AlertCircle size={11} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}
