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
import type { AnnotationContext, ArtifactKind, GenerateRequest } from './types';

export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * Renders the assembled annotation context as a compact, deterministic MyST-ish
 * table + block excerpts. Reused verbatim for the prompt, the mock provider's
 * echo, and the stored provenance (source_context) so all three agree.
 */
export function formatAnnotationStats(ctx: AnnotationContext): string {
  const header = [
    `Published sessions: ${ctx.sessionCount}`,
    `Total annotations: ${ctx.totalAnnotations}`,
    '',
    '| block_id | count | types |',
    '| --- | --- | --- |',
  ];
  const rows = ctx.blocks.map((b) => {
    const types = Object.entries(b.byType)
      .map(([t, n]) => `${t}:${n}`)
      .join(', ');
    return `| ${b.blockId} | ${b.count} | ${types || '—'} |`;
  });
  const excerpts = ctx.blocks.map((b) =>
    [`### ${b.blockId} (${b.count})`, '', '```myst', b.sourceText.trim() || '(source unavailable)', '```'].join('\n'),
  );
  return [...header, ...rows, '', ...excerpts].join('\n');
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
  'animation-code': {
    role: 'Generate a matplotlib animation that illustrates a dynamic concept from the chapter (PRD §9.4 경로 A).',
    shape:
      'Return exactly one Python code block (```python ... ```) that builds a `matplotlib.animation.FuncAnimation`. Seed all randomness deterministically (e.g. `np.random.seed(0)`) so runs are reproducible. Follow the code block with one short sentence noting how to run/save it (e.g. `ani.save(...)` or `HTML(ani.to_jshtml())`). No other prose.',
  },
  'difficulty-adjust': {
    role: 'Rewrite the chapter (or the focused selection) at the difficulty level the author asks for.',
    shape:
      "Read the target level from the author's instruction ('더 쉽게' = easier, more scaffolding/intuition/examples; '더 어렵게' = harder, more rigor/formalism/depth). Return MyST replacement section(s) that could stand in for the original content at that level, preserving its headings/structure and staying grounded in the source. Output MyST only.",
  },
  'revision-from-annotations': {
    role: "Suggest concrete content revisions for the blocks students annotated most during published lectures (heavy annotation ⇒ likely confusion or emphasis).",
    shape:
      'Using the annotation statistics and block excerpts provided, return MyST revision suggestions: for each high-signal block, an improved/clarified replacement passage, then a short `### 근거` bulleted list explaining why (referencing the annotation counts/types). Ground every rewrite in the given block source.',
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

  const annotations = req.context.annotations;
  const annotationSection =
    annotations && annotations.blocks.length > 0
      ? ['', 'Published lecture annotation statistics (most-annotated blocks):', '---', formatAnnotationStats(annotations), '---']
      : [];

  const user = [
    `Course: ${courseTitle}`,
    `Chapter: ${chapterTitle}`,
    `Artifact kind: ${req.kind}`,
    `Author instruction: ${instruction}${focus}`,
    ...annotationSection,
    '',
    'Chapter source (MyST):',
    '---',
    truncateSource(chapterSource),
    '---',
  ].join('\n');

  return { system, user };
}
