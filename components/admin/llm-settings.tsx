'use client';

import { AlertCircle, CheckCircle2, KeyRound, Loader2, Plug, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  setActiveProviderAction,
  testProviderAction,
  upsertProviderKeyAction,
} from '@/lib/ai/actions';
import type { ProviderId } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

/** Serializable per-provider view model built server-side in app/admin/page.tsx. */
export interface ProviderCard {
  id: ProviderId;
  label: string;
  models: string[];
  defaultModel: string;
  /** anthropic/gemini require an API key; mock never does. */
  needsKey: boolean;
  hasKey: boolean;
  /** Masked key for display only (e.g. '••••1234'); never the raw key. */
  maskedKey: string | null;
  /** Model persisted for this provider (or the provider default). */
  selectedModel: string;
  updatedAt: string | null;
}

export interface LlmSettingsProps {
  cards: ProviderCard[];
  activeProvider: ProviderId;
  activeLabel: string;
  activeModel: string;
}

type TestState = { status: 'idle' } | { status: 'ok' | 'error'; message: string };

/**
 * Admin LLM settings surface (client). Consumes the AI Server Actions
 * (setActiveProvider / upsertProviderKey / testProvider) — it never sees a raw
 * API key: only the server-computed masked value flows in, and the password
 * input is write-only (its value is sent up and then cleared, never read back).
 *
 * After every successful mutation we `router.refresh()` so the RSC page re-reads
 * the source of truth (active provider, masked keys) rather than trusting local
 * optimistic state.
 */
export function LlmSettings({ cards, activeProvider, activeLabel, activeModel }: LlmSettingsProps) {
  const router = useRouter();
  const [isSwitching, startSwitch] = useTransition();
  const [switchError, setSwitchError] = useState<string | null>(null);

  const handleSelectActive = useCallback(
    (provider: ProviderId) => {
      if (provider === activeProvider) return;
      setSwitchError(null);
      startSwitch(async () => {
        const result = await setActiveProviderAction(provider);
        if (!result.ok) {
          setSwitchError(result.error);
          return;
        }
        router.refresh();
      });
    },
    [activeProvider, router],
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Admin</p>
        <h1 className="mt-1.5 font-serif text-3xl text-ink">LLM 프로바이더</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          AI 저작 도우미가 사용할 프로바이더와 모델을 선택하고, API 키를 관리합니다. 키는 서버에만
          저장되며 화면에는 마스킹된 값만 표시됩니다.
        </p>

        <div
          className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-paper px-4 py-3"
          aria-live="polite"
        >
          <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
          <span className="text-sm text-muted">현재 활성 프로바이더</span>
          <span className="text-sm font-medium text-ink">{activeLabel}</span>
          <span className="text-muted" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-xs text-ink">{activeModel}</span>
        </div>
        {switchError ? (
          <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle size={14} aria-hidden="true" />
            {switchError}
          </p>
        ) : null}
      </header>

      <div role="radiogroup" aria-label="활성 프로바이더 선택" className="flex flex-col gap-4">
        {cards.map((card) => (
          <ProviderCardView
            key={card.id}
            card={card}
            isActive={card.id === activeProvider}
            isSwitching={isSwitching}
            onSelectActive={handleSelectActive}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

interface ProviderCardViewProps {
  card: ProviderCard;
  isActive: boolean;
  isSwitching: boolean;
  onSelectActive: (provider: ProviderId) => void;
  onSaved: () => void;
}

function ProviderCardView({
  card,
  isActive,
  isSwitching,
  onSelectActive,
  onSaved,
}: ProviderCardViewProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(card.selectedModel);
  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isTesting, startTest] = useTransition();
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  const radioId = `active-${card.id}`;
  const keyInputId = `key-${card.id}`;
  const modelSelectId = `model-${card.id}`;

  const handleSaveKey = useCallback(() => {
    setSaveError(null);
    startSave(async () => {
      const result = await upsertProviderKeyAction({ provider: card.id, apiKey, model });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setApiKey(''); // write-only: never keep the raw key around
      onSaved();
    });
  }, [apiKey, card.id, model, onSaved]);

  const handleTest = useCallback(() => {
    setTest({ status: 'idle' });
    startTest(async () => {
      const result = await testProviderAction(card.id);
      if (!result.ok) {
        setTest({ status: 'error', message: result.error });
        return;
      }
      setTest(
        result.data.ok
          ? { status: 'ok', message: result.data.message }
          : { status: 'error', message: result.data.message },
      );
    });
  }, [card.id]);

  // mock's model is fixed to its default; anthropic/gemini persist a model with the key.
  const modelDisabled = !card.needsKey;

  return (
    <section
      className={cn(
        'rounded-2xl border bg-paper p-5 transition-colors',
        isActive ? 'border-accent ring-1 ring-accent/30' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={radioId} className="flex cursor-pointer items-start gap-3">
          <input
            id={radioId}
            type="radio"
            name="active-provider"
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
            checked={isActive}
            disabled={isSwitching}
            onChange={() => onSelectActive(card.id)}
          />
          <span>
            <span className="flex items-center gap-2">
              <span className="font-serif text-lg text-ink">{card.label}</span>
              {isActive ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                  활성
                </span>
              ) : null}
            </span>
            {card.needsKey ? (
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <KeyRound size={12} aria-hidden="true" />
                {card.hasKey ? `설정됨 · ${card.maskedKey}` : '미설정'}
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-muted">키 불필요 · 개발/데모용</span>
            )}
          </span>
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={isTesting}
        >
          {isTesting ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plug size={14} aria-hidden="true" />
          )}
          연결 테스트
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={modelSelectId} className="text-xs font-medium text-ink">
            모델
          </label>
          <select
            id={modelSelectId}
            value={model}
            disabled={modelDisabled}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {card.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {card.needsKey ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={keyInputId} className="text-xs font-medium text-ink">
              API 키
            </label>
            <div className="flex gap-2">
              <input
                id={keyInputId}
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder={card.hasKey ? '새 키로 교체하려면 입력' : '키를 입력하세요'}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-white px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={handleSaveKey}
                disabled={isSaving || apiKey.trim().length === 0}
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : null}
                저장
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {card.needsKey ? (
        <p className="mt-2 text-xs text-muted">
          모델 변경 사항은 저장 시 API 키와 함께 반영됩니다.
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle size={14} aria-hidden="true" />
          {saveError}
        </p>
      ) : null}

      <div aria-live="polite" className="mt-2 min-h-[1.25rem]">
        {test.status === 'ok' ? (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 size={14} aria-hidden="true" />
            {test.message}
          </p>
        ) : test.status === 'error' ? (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle size={14} aria-hidden="true" />
            {test.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
