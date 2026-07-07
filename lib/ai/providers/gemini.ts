/**
 * Gemini provider — official '@google/genai' (GoogleGenAI).
 *
 * SECURITY: same stance as the Anthropic provider — the API key comes from
 * ProviderConfig (server-side, ai_provider_keys), is used only to build the
 * client, and is never logged or returned. All errors map to clean messages.
 */
import { ApiError, GoogleGenAI } from '@google/genai';

import { buildPrompt } from '../prompts';
import type { AiProvider, GenerateRequest, ProviderConfig } from '../types';

const DEFAULT_MODEL = 'gemini-2.5-pro';
const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'];

/** Maps SDK errors to a clean, key-free, user-facing message. */
function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return 'Gemini rejected the API key (invalid or unauthorized). Check the key in AI settings.';
    }
    if (status === 429) {
      return 'Gemini rate limit reached. Wait a moment and try again.';
    }
    const code = status ? `${status}: ` : '';
    return `Gemini request failed (${code}${error.message}).`;
  }
  if (error instanceof Error) {
    return `Gemini request failed: ${error.message}`;
  }
  return 'Gemini request failed for an unknown reason.';
}

export const geminiProvider: AiProvider = {
  id: 'gemini',
  label: 'Google (Gemini)',
  models: MODELS,
  defaultModel: DEFAULT_MODEL,
  async generate(req: GenerateRequest, cfg: ProviderConfig): Promise<string> {
    if (!cfg.apiKey) {
      throw new Error('Gemini API key is not configured. Add it in AI settings.');
    }

    const client = new GoogleGenAI({ apiKey: cfg.apiKey });
    const { system, user } = buildPrompt(req);
    const model = cfg.model || DEFAULT_MODEL;

    try {
      const response = await client.models.generateContent({
        model,
        contents: user,
        config: { systemInstruction: system },
      });

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }
      return text;
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  },
};
