import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LlmSettings, type ProviderCard } from '@/components/admin/llm-settings';
import { listProviders } from '@/lib/ai/registry';
import { getAiSettings, listProviderKeysMasked } from '@/lib/ai/settings';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin · LLM 설정 | Lecture Studio',
};

/**
 * Admin — LLM Provider settings (PRD §9, first Admin surface).
 *
 * Server-gated on app_admins membership: signed-out users go to login,
 * signed-in non-admins are bounced to Reading. Only after the gate passes do
 * we read the (admin-only) masked provider keys. Raw API keys never reach this
 * component — `listProviderKeysMasked` returns last-4 only, computed on the
 * server (see lib/ai/settings.ts).
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/admin');
  }

  const supabase = await createClient();
  const { data: adminRow, error: adminError } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminError) {
    throw new Error(`관리자 권한 확인에 실패했습니다: ${adminError.message}`);
  }
  if (!adminRow) {
    // Signed in but not a platform admin — no admin surface for you.
    redirect('/reading');
  }

  const [settings, maskedKeys] = await Promise.all([getAiSettings(), listProviderKeysMasked()]);

  const keyByProvider = new Map(maskedKeys.map((k) => [k.provider, k] as const));

  const cards: ProviderCard[] = listProviders().map((provider) => {
    const meta = keyByProvider.get(provider.id as 'anthropic' | 'gemini');
    return {
      id: provider.id,
      label: provider.label,
      models: provider.models,
      defaultModel: provider.defaultModel,
      needsKey: provider.id !== 'mock',
      hasKey: meta?.hasKey ?? false,
      maskedKey: meta?.maskedKey ?? null,
      // The model persisted alongside the key; falls back to the provider default.
      selectedModel: meta?.model ?? provider.defaultModel,
      updatedAt: meta?.updatedAt ?? null,
    };
  });

  const activeCard = cards.find((c) => c.id === settings.activeProvider) ?? cards[0];

  return (
    <LlmSettings
      cards={cards}
      activeProvider={settings.activeProvider}
      activeLabel={activeCard.label}
      activeModel={activeCard.selectedModel}
    />
  );
}
