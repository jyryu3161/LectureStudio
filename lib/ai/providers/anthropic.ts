/**
 * Anthropic provider — official '@anthropic-ai/sdk'.
 *
 * SECURITY: the API key arrives via ProviderConfig (read server-side from
 * ai_provider_keys) and is used only to construct the client here. It is
 * never logged and never returned to the caller. All SDK/transport errors
 * are mapped to clean, user-facing messages.
 *
 * Contract notes (do NOT change without checking the AI CONTRACT):
 *  - max_tokens: 4096; system + single user message.
 *  - Do NOT send temperature/top_p/top_k or any thinking config — Opus 4.8
 *    rejects sampling params.
 *  - Read text from content blocks filtered to type === 'text'.
 */
import Anthropic from '@anthropic-ai/sdk';

import { buildPrompt } from '../prompts';
import type { AiProvider, GenerateRequest, ProviderConfig } from '../types';

const DEFAULT_MODEL = 'claude-opus-4-8';
const MODELS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'];

/** Maps SDK errors to a clean, key-free, user-facing message. */
function toUserMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Anthropic rejected the API key (invalid or expired). Check the key in AI settings.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Anthropic rate limit reached. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ? `${error.status}: ` : '';
    return `Anthropic request failed (${status}${error.message}).`;
  }
  if (error instanceof Error) {
    return `Anthropic request failed: ${error.message}`;
  }
  return 'Anthropic request failed for an unknown reason.';
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  models: MODELS,
  defaultModel: DEFAULT_MODEL,
  async generate(req: GenerateRequest, cfg: ProviderConfig): Promise<string> {
    if (!cfg.apiKey) {
      throw new Error('Anthropic API key is not configured. Add it in AI settings.');
    }

    const client = new Anthropic({ apiKey: cfg.apiKey });
    const { system, user } = buildPrompt(req);
    const model = cfg.model || DEFAULT_MODEL;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();

      if (!text) {
        throw new Error('Anthropic returned an empty response.');
      }
      return text;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  },
};
