/**
 * Prompt templates — one per ArtifactKind (PRD §9.3).
 *
 * Every kind produces a concise system prompt (role + hard output rules) and
 * a user prompt that grounds the model in the actual chapter source and the
 * author's instruction. Output is expected to be MyST markdown, in Korean
 * prose where prose is called for (the platform's primary teaching language),
 * with code/identifiers/LaTeX left untranslated.
 *
 * These are pure string builders — no network, no secrets — so they are unit
 * testable and reused verbatim by every provider.
 */
import type { ArtifactKind, GenerateRequest } from './types';

export interface BuiltPrompt {
  system: string;
  user: string;
}

/** Cap the chapter source we embed so a huge chapter can't blow the context. */
const MAX_SOURCE_CHARS = 16000;

/** Shared rules appended to every system prompt. */
const COMMON_RULES = [
  'You are an expert teaching assistant helping an author write an interactive lecture-book.',
  'Output MyST markdown ONLY — no surrounding commentary, no ```markdown fences around the whole answer.',
  'Ground everything strictly in the provided chapter source; never invent facts not supported by it.',
  'Write prose in Korean. Leave code, identifiers, math (LaTeX), and technical terms in their original form.',
  'Keep it focused and directly insertable into the chapter as-is.',
].join(' ');

/** Per-kind role line + the specific shape the output must take. */
const KIND_SPEC: Record<ArtifactKind, { role: string; shape: string }> = {
  outline: {
    role: 'Produce a structured outline of the chapter.',
    shape:
      'Return a nested MyST heading/bullet outline (##/### headings with `-` bullets) covering the main sections and key ideas in order.',
  },
  'student-explanation': {
    role: 'Explain the material for a student who is seeing it for the first time.',
    shape:
      'Return a friendly, step-by-step MyST explanation with short paragraphs and, where helpful, a bulleted list or a small worked example. Prefer intuition before formalism.',
  },
  'instructor-summary': {
    role: 'Write a concise summary aimed at the instructor teaching this chapter.',
    shape:
      'Return a MyST section with the key teaching points, common misconceptions to watch for, and suggested emphasis, as tight bullets under a `## Instructor Summary` heading.',
  },
  'figure-code': {
    role: 'Generate a matplotlib figure that illustrates a concept from the chapter.',
    shape:
      'Return exactly one Python code block (```python ... ```) using matplotlib that produces a single clear figure, followed by one short sentence describing what the figure shows and where in the chapter it belongs. No other prose.',
  },
  'code-explanation': {
    role: 'Explain a code block from the chapter line-by-line for a learner.',
    shape:
      'Return a MyST explanation that walks through what the code does, its key steps, and its complexity/behavior. Reference the code by what it does, not line numbers.',
  },
  quiz: {
    role: 'Write a short comprehension quiz over the chapter.',
    shape:
      'Return a MyST `## Quiz` section with 3–5 questions as an ordered list. For multiple-choice items list options as `-` bullets, and include an answer key under a `### 정답` subheading at the end.',
  },
};

function truncateSource(source: string): string {
  if (source.length <= MAX_SOURCE_CHARS) return source;
  return `${source.slice(0, MAX_SOURCE_CHARS)}\n\n<!-- (source truncated for length) -->`;
}

/**
 * Builds the system+user prompt pair for a generation request. Always
 * embeds the chapter source and the author's instruction verbatim so the
 * model is grounded and the author's intent is preserved.
 */
export function buildPrompt(req: GenerateRequest): BuiltPrompt {
  const spec = KIND_SPEC[req.kind];
  const { courseTitle, chapterTitle, chapterSource, blockId } = req.context;

  const system = `${COMMON_RULES}\n\nTask: ${spec.role} ${spec.shape}`;

  const instruction = req.instruction.trim() || '(no extra instruction — use your best judgment)';
  const focus = blockId
    ? `\nFocus specifically on the block with id "${blockId}" within the chapter.`
    : '';

  const user = [
    `Course: ${courseTitle}`,
    `Chapter: ${chapterTitle}`,
    `Artifact kind: ${req.kind}`,
    `Author instruction: ${instruction}${focus}`,
    '',
    'Chapter source (MyST):',
    '---',
    truncateSource(chapterSource),
    '---',
  ].join('\n');

  return { system, user };
}
